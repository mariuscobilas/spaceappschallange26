"""Reproducible, season-held-out cover-crop water-debt benchmark."""

from __future__ import annotations

import argparse
import json
import sqlite3
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from lightgbm import LGBMRegressor
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import confusion_matrix, mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, LeaveOneGroupOut, GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVR


ROOT = Path(__file__).resolve().parents[4]
WORKBOOK = ROOT / "data/dryad_eash_2025/Cover_Crop_Trials_Data.xlsx"
DATABASE = ROOT / "data/water_debt.sqlite3"
RESULTS = ROOT / "data/benchmark_results.json"
PLANTING_YEARS = {("T1", 1): 2016, ("T1", 2): 2018, ("T1", 3): 2020,
                  ("T2", 1): 2017, ("T2", 2): 2019, ("T2", 3): 2020}
CATEGORICAL = ["cover_mix", "planting_window", "tillage", "trial"]
NUMERIC = ["rain_mm", "tmax_c", "tmin_c", "solar_kwh_m2", "wind_ms", "humidity_pct"]
FEATURES = CATEGORICAL + NUMERIC


def connect(path: Path = DATABASE) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS weather_daily (
            date TEXT PRIMARY KEY, latitude REAL NOT NULL, longitude REAL NOT NULL,
            rain_mm REAL, tmax_c REAL, tmin_c REAL, solar_kwh_m2 REAL,
            wind_ms REAL, humidity_pct REAL, source TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trial_observation (
            trial TEXT NOT NULL, plot TEXT NOT NULL, block TEXT NOT NULL,
            tillage TEXT NOT NULL, cycle INTEGER NOT NULL, wheat_planting_year INTEGER NOT NULL,
            cover_mix TEXT NOT NULL, planting_window TEXT NOT NULL,
            water_mm REAL, wheat_yield_mg_ha REAL, biomass_kg_ha REAL,
            source TEXT NOT NULL, PRIMARY KEY (trial, plot, cycle)
        );
        CREATE TABLE IF NOT EXISTS benchmark_prediction (
            model TEXT NOT NULL, trial TEXT NOT NULL, plot TEXT NOT NULL,
            cycle INTEGER NOT NULL, wheat_planting_year INTEGER NOT NULL,
            planting_window TEXT NOT NULL, actual_delta_mm REAL NOT NULL,
            predicted_delta_mm REAL NOT NULL,
            PRIMARY KEY (model, trial, plot, cycle)
        );
        CREATE TABLE IF NOT EXISTS benchmark_metric (
            model TEXT PRIMARY KEY, n INTEGER NOT NULL, r2 REAL, mae_mm REAL,
            rmse_mm REAL, mean_error_mm REAL, confusion_json TEXT NOT NULL,
            per_year_json TEXT NOT NULL, per_window_json TEXT NOT NULL
        );
    """)
    return connection


def import_trial(connection: sqlite3.Connection) -> pd.DataFrame:
    if not WORKBOOK.is_file():
        raise FileNotFoundError(WORKBOOK)
    field = pd.read_excel(WORKBOOK, sheet_name="Field Data")
    records = []
    for _, row in field.iterrows():
        for cycle in (1, 2, 3):
            records.append({
                "trial": row["Trial"], "plot": row["Plot"], "block": row["Block"],
                "tillage": row["Tillage"], "cycle": cycle,
                "wheat_planting_year": PLANTING_YEARS[(row["Trial"], cycle)],
                "cover_mix": row["Cover.Crop.Mix"],
                "planting_window": row["CC.Planting.Window"],
                "water_mm": pd.to_numeric(row[f"C{cycle}.SoilMoisture"], errors="coerce"),
                "wheat_yield_mg_ha": pd.to_numeric(row[f"C{cycle}.WheatYield"], errors="coerce"),
                "biomass_kg_ha": pd.to_numeric(row[f"C{cycle}.CCBiomass"], errors="coerce"),
                "source": "doi:10.5061/dryad.6t1g1jxb0",
            })
    data = pd.DataFrame(records)
    def sql_value(value):
        return None if pd.isna(value) else value.item() if isinstance(value, np.generic) else value
    columns = list(data.columns)
    connection.executemany(
        f"INSERT OR REPLACE INTO trial_observation ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})",
        ([sql_value(row[c]) for c in columns] for _, row in data.iterrows()),
    )
    connection.commit()
    return data


def fetch_power(connection: sqlite3.Connection) -> pd.DataFrame:
    params = {
        "parameters": "PRECTOTCORR,T2M_MAX,T2M_MIN,ALLSKY_SFC_SW_DWN,WS2M,RH2M",
        "community": "AG", "longitude": -108.733, "latitude": 37.533,
        "start": "20160101", "end": "20200831", "format": "JSON", "time-standard": "LST",
    }
    url = "https://power.larc.nasa.gov/api/temporal/daily/point?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = json.load(response)
    fields = payload["properties"]["parameter"]
    mapping = {"PRECTOTCORR": "rain_mm", "T2M_MAX": "tmax_c", "T2M_MIN": "tmin_c",
               "ALLSKY_SFC_SW_DWN": "solar_kwh_m2", "WS2M": "wind_ms", "RH2M": "humidity_pct"}
    dates = sorted(set.intersection(*(set(fields[key]) for key in mapping)))
    records = []
    for date in dates:
        row = {"date": pd.to_datetime(date, format="%Y%m%d").strftime("%Y-%m-%d"),
               "latitude": params["latitude"], "longitude": params["longitude"],
               "source": "NASA POWER daily LST"}
        for source, target in mapping.items():
            value = float(fields[source][date])
            row[target] = None if value <= -900 else value
        records.append(row)
    columns = ["date", "latitude", "longitude", *mapping.values(), "source"]
    connection.executemany(
        f"INSERT OR REPLACE INTO weather_daily ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})",
        ([row[c] for c in columns] for row in records),
    )
    connection.commit()
    return pd.DataFrame(records)


def paired_dataset(connection: sqlite3.Connection) -> pd.DataFrame:
    trial = pd.read_sql_query("SELECT * FROM trial_observation", connection)
    weather = pd.read_sql_query("SELECT * FROM weather_daily", connection, parse_dates=["date"])
    if weather.empty:
        raise ValueError("No NASA POWER weather cached; run with --fetch-weather")
    weather = weather.loc[weather.date.dt.month <= 8].copy()
    weather["wheat_planting_year"] = weather.date.dt.year
    weather = weather.groupby("wheat_planting_year", as_index=False).agg(
        rain_mm=("rain_mm", "sum"), tmax_c=("tmax_c", "mean"),
        tmin_c=("tmin_c", "mean"), solar_kwh_m2=("solar_kwh_m2", "mean"),
        wind_ms=("wind_ms", "mean"), humidity_pct=("humidity_pct", "mean"),
        days=("date", "count"),
    )
    weather = weather.loc[weather.days >= 240].drop(columns="days")
    controls = trial.loc[trial.planting_window == "Fallow", [
        "trial", "block", "tillage", "cycle", "water_mm"
    ]].rename(columns={"water_mm": "fallow_water_mm"})
    if controls.duplicated(["trial", "block", "tillage", "cycle"]).any():
        raise ValueError("Multiple fallow controls for one matched group")
    paired = trial.loc[trial.planting_window.isin(["Fall", "Spring"])].merge(
        controls, on=["trial", "block", "tillage", "cycle"], how="inner", validate="many_to_one"
    ).merge(weather, on="wheat_planting_year", how="inner", validate="many_to_one")
    paired = paired.dropna(subset=["water_mm", "fallow_water_mm", *NUMERIC]).copy()
    paired["delta_mm"] = paired.water_mm - paired.fallow_water_mm
    if paired.wheat_planting_year.nunique() < 4:
        raise ValueError("Too few independent wheat-planting years for the benchmark")
    return paired


def candidates():
    return {
        "Ridge": (Ridge(), {"reg__alpha": [1.0, 10.0]}),
        "Random Forest": (RandomForestRegressor(n_estimators=200, max_features=1.0, random_state=42, n_jobs=2),
                          {"reg__min_samples_leaf": [2, 5]}),
        "LightGBM": (LGBMRegressor(n_estimators=100, learning_rate=0.05, max_depth=3,
                                    num_leaves=7, verbosity=-1, random_state=42, n_jobs=2),
                     {"reg__min_child_samples": [3, 8]}),
        "CatBoost": (CatBoostRegressor(iterations=100, learning_rate=0.05, loss_function="RMSE",
                                       verbose=False, random_seed=42, thread_count=2, allow_writing_files=False),
                     {"reg__depth": [2, 4]}),
        "SVR": (SVR(kernel="rbf", epsilon=5.0), {"reg__C": [0.3, 3.0]}),
    }


def preprocessing():
    return ColumnTransformer([
        ("cat", Pipeline([("fill", SimpleImputer(strategy="most_frequent")),
                          ("encode", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), CATEGORICAL),
        ("num", Pipeline([("fill", SimpleImputer(strategy="median")),
                          ("scale", StandardScaler())]), NUMERIC),
    ])


def scores(actual, predicted, rows):
    actual, predicted = np.asarray(actual), np.asarray(predicted)
    result = {"n": int(len(actual)), "r2": float(r2_score(actual, predicted)) if len(actual) > 1 else None,
              "mae_mm": float(mean_absolute_error(actual, predicted)),
              "rmse_mm": float(np.sqrt(mean_squared_error(actual, predicted))),
              "mean_error_mm": float(np.mean(predicted - actual))}
    actual_loss, predicted_loss = actual < 0, predicted < 0
    result["confusion"] = {
        "labels": ["no_water_loss", "water_loss"],
        "counts": confusion_matrix(actual_loss, predicted_loss, labels=[False, True]).tolist(),
        "actual_class_counts": [int((~actual_loss).sum()), int(actual_loss.sum())],
    }
    result["per_year_mae_mm"] = {str(year): float(mean_absolute_error(actual[rows.wheat_planting_year == year],
        predicted[rows.wheat_planting_year == year])) for year in sorted(rows.wheat_planting_year.unique())}
    result["per_window_mae_mm"] = {window: float(mean_absolute_error(actual[rows.planting_window == window],
        predicted[rows.planting_window == window])) for window in sorted(rows.planting_window.unique())}
    return result


def benchmark(connection: sqlite3.Connection) -> dict:
    rows = paired_dataset(connection).reset_index(drop=True)
    x, y, groups = rows[FEATURES], rows.delta_mm.to_numpy(), rows.wheat_planting_year.to_numpy()
    output = {"dataset": {"paired_rows": len(rows), "years": sorted(map(int, np.unique(groups))),
                          "target": "cover minus matched fallow, 0-90 cm water at wheat planting (mm)",
                          "weather_window": "January 1 through August 31 of wheat-planting year"}, "models": {}}
    connection.execute("DELETE FROM benchmark_prediction")
    connection.execute("DELETE FROM benchmark_metric")
    for name, spec in {"Treatment mean": None, **candidates()}.items():
        predicted = np.full(len(rows), np.nan)
        for train, test in LeaveOneGroupOut().split(x, y, groups):
            if spec is None:
                train_rows = rows.iloc[train]
                means = train_rows.groupby("planting_window").delta_mm.mean()
                predicted[test] = rows.iloc[test].planting_window.map(means).fillna(train_rows.delta_mm.mean())
            else:
                model, grid = spec
                pipe = Pipeline([("prep", preprocessing()), ("reg", model)])
                search = GridSearchCV(pipe, grid, scoring="neg_mean_absolute_error",
                                      cv=GroupKFold(n_splits=min(3, len(np.unique(groups[train])))),
                                      n_jobs=1, error_score="raise")
                search.fit(x.iloc[train], y[train], groups=groups[train])
                predicted[test] = search.predict(x.iloc[test])
        if not np.isfinite(predicted).all():
            raise ValueError(f"Non-finite predictions from {name}")
        metrics = scores(y, predicted, rows)
        output["models"][name] = metrics
        connection.executemany("""INSERT INTO benchmark_prediction VALUES (?,?,?,?,?,?,?,?)""", [
            (name, row.trial, row.plot, int(row.cycle), int(row.wheat_planting_year),
             row.planting_window, float(actual), float(forecast))
            for row, actual, forecast in zip(rows.itertuples(), y, predicted)
        ])
        connection.execute("INSERT INTO benchmark_metric VALUES (?,?,?,?,?,?,?,?,?)", (
            name, metrics["n"], metrics["r2"], metrics["mae_mm"], metrics["rmse_mm"],
            metrics["mean_error_mm"], json.dumps(metrics["confusion"]),
            json.dumps(metrics["per_year_mae_mm"]), json.dumps(metrics["per_window_mae_mm"]),
        ))
    connection.commit()
    baseline = output["models"]["Treatment mean"]["mae_mm"]
    eligible = [(name, result) for name, result in output["models"].items()
                if name != "Treatment mean" and result["mae_mm"] < baseline]
    output["selected_model"] = min(eligible, key=lambda pair: pair[1]["mae_mm"])[0] if eligible else None
    output["warning"] = "One Colorado site and few independent seasons; not validated for Kansas farms."
    RESULTS.write_text(json.dumps(output, indent=2), encoding="utf-8")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch-weather", action="store_true", help="Refresh NASA POWER weather")
    args = parser.parse_args()
    with connect() as connection:
        import_trial(connection)
        if args.fetch_weather:
            fetch_power(connection)
        result = benchmark(connection)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
