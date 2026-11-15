"""Two-year, site-specific benchmark on Australian cover-crop soil water."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.base import clone
from sklearn.impute import SimpleImputer
from sklearn.metrics import confusion_matrix, mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from benchmark import candidates


ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "data/garba_2022_mmc1.xlsx"
RESULTS = ROOT / "data/australia_benchmark_results.json"
DEPTHS = ["0-10", "10-30", "30-60", "60-90", "90-120"]


def prepare() -> pd.DataFrame:
    raw = pd.read_excel(SOURCE, sheet_name="Dataset2_Soil_water").rename(columns={"Year ": "year"})
    raw["depth"] = raw.Depth.astype(str).str.replace("cm", "", regex=False)
    if not set(raw.depth.unique()).issubset(DEPTHS):
        raise ValueError("Unexpected soil depth")
    key = ["year", "Rep", "Covercrop", "Phase", "depth"]
    # The first year contains repeated plot-depth keys without a date identifier.
    # Average within treatment/replication/depth instead of counting each as a season.
    phase = raw.groupby(key, as_index=False).agg(paw_mm=("paw", "mean"), n_raw=("paw", "size"))
    wide = phase.pivot(index=["year", "Rep", "Covercrop", "depth"], columns="Phase", values="paw_mm").reset_index()
    sowing = wide.pivot(index=["year", "Rep", "Covercrop"], columns="depth", values="Cover crop sowing")
    sowing = sowing.rename(columns={d: f"start_{d}" for d in DEPTHS})
    cash = wide.pivot(index=["year", "Rep", "Covercrop"], columns="depth", values="Cash crop sowing")
    cash = cash.rename(columns={d: f"end_{d}" for d in DEPTHS})
    joined = sowing.join(cash, how="inner").reset_index()
    start_cols = [f"start_{d}" for d in DEPTHS]
    end_cols = [f"end_{d}" for d in DEPTHS]
    joined = joined.dropna(subset=start_cols + end_cols).copy()
    joined["start_paw_mm"] = joined[start_cols].sum(axis=1)
    joined["end_paw_mm"] = joined[end_cols].sum(axis=1)
    controls = joined.loc[joined.Covercrop == 1, ["year", "Rep", "start_paw_mm", "end_paw_mm"]].rename(
        columns={"start_paw_mm": "fallow_start_paw_mm", "end_paw_mm": "fallow_end_paw_mm"})
    if controls.duplicated(["year", "Rep"]).any():
        raise ValueError("Multiple fallow controls in a year/replicate")
    pairs = joined.loc[joined.Covercrop != 1].merge(
        controls, on=["year", "Rep"], how="inner", validate="many_to_one")
    pairs["delta_mm"] = pairs.end_paw_mm - pairs.fallow_end_paw_mm
    pairs["treatment"] = pairs.Covercrop.astype(str)
    return pairs.reset_index(drop=True)


def evaluate(rows: pd.DataFrame) -> dict:
    numeric = [f"start_{d}" for d in DEPTHS]
    features = ["treatment", *numeric]
    x = rows[features]
    y = rows.delta_mm.to_numpy()
    groups = rows.year.to_numpy()
    output = {"source": "Garba and Williams 2022, supplementary mmc1.xlsx",
              "n_plot_treatment_year_units": len(rows),
              "n_raw_soil_depth_rows": 2159,
              "years": sorted(rows.year.unique().tolist()),
              "target": "cash-crop-sowing 0-120 cm PAW minus same-year/rep fallow (mm)",
              "features": features,
              "models": {}}
    prep = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), ["treatment"]),
        ("num", Pipeline([("fill", SimpleImputer(strategy="median")),
                          ("scale", StandardScaler())]), numeric),
    ])
    for name, spec in {"Treatment mean": None, "Starting difference": "persistence", **candidates()}.items():
        prediction = np.full(len(rows), np.nan)
        for train, test in LeaveOneGroupOut().split(x, y, groups):
            if spec == "persistence":
                prediction[test] = (rows.iloc[test].start_paw_mm - rows.iloc[test].fallow_start_paw_mm)
            elif spec is None:
                means = rows.iloc[train].groupby("treatment").delta_mm.mean()
                prediction[test] = rows.iloc[test].treatment.map(means).fillna(np.mean(y[train]))
            else:
                prototype, grid = spec
                regressor = clone(prototype)
                # One year remains in each training fold. No within-year hyperparameter
                # search would estimate generalization across years, so freeze settings.
                parameter, values = next(iter(grid.items()))
                regressor.set_params(**{parameter.removeprefix("reg__"): values[0]})
                model = Pipeline([("prep", prep), ("reg", regressor)])
                model.fit(x.iloc[train], y[train])
                prediction[test] = model.predict(x.iloc[test])
        if not np.isfinite(prediction).all():
            raise ValueError(f"Non-finite predictions from {name}")
        loss_actual, loss_predicted = y < 0, prediction < 0
        output["models"][name] = {
            "r2": float(r2_score(y, prediction)),
            "mae_mm": float(mean_absolute_error(y, prediction)),
            "rmse_mm": float(np.sqrt(mean_squared_error(y, prediction))),
            "mean_error_mm": float(np.mean(prediction - y)),
            "mae_by_year_mm": {str(year): float(mean_absolute_error(
                y[groups == year], prediction[groups == year])) for year in np.unique(groups)},
            "confusion_labels": ["no_water_loss", "water_loss"],
            "confusion_counts": confusion_matrix(loss_actual, loss_predicted, labels=[False, True]).tolist(),
            "actual_class_counts": [int((~loss_actual).sum()), int(loss_actual.sum())],
        }
    baseline_mae = output["models"]["Treatment mean"]["mae_mm"]
    better = [(name, result["mae_mm"]) for name, result in output["models"].items()
              if name not in ("Treatment mean", "Starting difference") and result["mae_mm"] < baseline_mae]
    output["best_ml_by_mae"] = min(better, key=lambda item: item[1])[0] if better else None
    output["warning"] = "Only two years at one Australian site; model transfer to Kansas is untested."
    return output


if __name__ == "__main__":
    result = evaluate(prepare())
    RESULTS.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
