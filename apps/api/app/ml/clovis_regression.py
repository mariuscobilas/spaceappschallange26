"""Shared weather-regression feature building, inference, and recursive evaluation."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import clovis_baselines as base
import prepare_clovis as prep
import prepare_clovis_weather as weather

PROTOCOL_PATH = Path(__file__).with_name("clovis_regression_protocol.json")
CATEGORICAL = ["treatment", "management_phase"]
NUMERIC = ["previous_moisture_m3_m3", "irrigation_mm", "cover_active",
           "days_since_cover_planting", "days_since_cover_termination",
           *[v[0] for v in weather.PARAMETERS.values()], "season_sin", "season_cos"]
FEATURES = CATEGORICAL + NUMERIC
TREATMENTS = {"fallow", "pea", "oat", "six_species_mix"}
PHASES = {"sorghum", "fallow_before_cover", "cover_period", "fallow_after_cover", "winter_wheat"}


def load_protocol() -> dict:
    return json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))


def feature_frame(rows: list[dict]) -> pd.DataFrame:
    """Explicit feature allowlist shared by fit and predict; never reads targets."""
    records = []
    for row in rows:
        day = date.fromisoformat(row["date"])
        treatment, phase = row["treatment"], row["management_phase"]
        if treatment not in TREATMENTS or phase not in PHASES:
            raise ValueError("Unsupported treatment or management phase")
        record = {"treatment": treatment, "management_phase": phase}
        for column in NUMERIC:
            if column in {"season_sin", "season_cos"}:
                continue
            raw = row[column]
            if column in {"days_since_cover_planting", "days_since_cover_termination"} and raw in (None, ""):
                value = -1.0
            else:
                value = float(raw)
            if not math.isfinite(value):
                raise ValueError(f"Nonfinite feature: {column}")
            record[column] = value
        if not 0 <= record["previous_moisture_m3_m3"] <= 1:
            raise ValueError("Previous moisture must be in [0,1]")
        if record["cover_active"] not in (0, 1):
            raise ValueError("cover_active must be 0 or 1")
        if record["irrigation_mm"] < 0 or record["rain_mm"] < 0 or record["wind_speed_m_s"] < 0:
            raise ValueError("Water inputs and wind must be nonnegative")
        if not 0 <= record["humidity_pct"] <= 100:
            raise ValueError("Humidity must be in [0,100]")
        if record["temperature_min_c"] > record["temperature_max_c"] or record["solar_radiation_mj_m2_day"] < 0:
            raise ValueError("Invalid temperature order or solar radiation")
        angle = 2 * math.pi * (day.timetuple().tm_yday - 1) / (date(day.year + 1, 1, 1) - date(day.year, 1, 1)).days
        record.update(season_sin=math.sin(angle), season_cos=math.cos(angle))
        records.append(record)
    return pd.DataFrame(records, columns=FEATURES)


@dataclass
class WeatherRegressor:
    name: str
    pipeline: Pipeline
    metadata: dict

    @classmethod
    def fit(cls, name: str, rows: list[dict], protocol: dict) -> "WeatherRegressor":
        if not rows or any(r["partition"] != "train" for r in rows):
            raise ValueError("Regression fitting requires nonempty training-only rows")
        config = protocol["candidates"][name]
        x = feature_frame(rows)
        y = np.asarray([r[protocol["target"]] for r in rows], dtype=float)
        if not np.isfinite(y).all():
            raise ValueError("Regression target must be finite")
        encoder = ColumnTransformer([
            ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
            ("numeric", StandardScaler(), NUMERIC),
        ])
        if config["family"] == "ridge":
            estimator = Ridge(alpha=config["alpha"])
        else:
            estimator = RandomForestRegressor(**{k: v for k, v in config.items() if k != "family"},
                                              random_state=protocol["seed"], n_jobs=1)
        pipeline = Pipeline([("features", encoder), ("regressor", estimator)])
        pipeline.fit(x, y)
        metadata = {"name": name, "config": config, "feature_version": protocol["version"],
                    "sklearn_version": sklearn.__version__, "feature_columns": FEATURES,
                    "training_rows": len(rows), "training_dates": sorted({r["date"] for r in rows}),
                    "training_treatments": sorted(set(x.treatment)), "training_phases": sorted(set(x.management_phase)),
                    "numeric_training_ranges": {c: {"min": float(x[c].min()), "max": float(x[c].max())} for c in NUMERIC},
                    "numeric_scaler_means": pipeline["features"].named_transformers_["numeric"].mean_.tolist(),
                    "numeric_scaler_scales": pipeline["features"].named_transformers_["numeric"].scale_.tolist(),
                    "null_age_encoding": -1, "physical_bounds": [0, 1], "seed": protocol["seed"]}
        return cls(name, pipeline, metadata)

    def predict_many(self, rows: list[dict]) -> tuple[list[float], list[bool], list[bool]]:
        if not rows:
            return [], [], []
        frame = feature_frame(rows)
        delta = self.pipeline.predict(frame)
        if not np.isfinite(delta).all():
            raise ValueError("Regression produced nonfinite predictions")
        raw = frame.previous_moisture_m3_m3.to_numpy() + delta
        predicted = np.clip(raw, 0.0, 1.0)
        unknown = [r["management_phase"] not in self.metadata["training_phases"] for r in rows]
        return predicted.tolist(), (predicted != raw).tolist(), unknown

    def save(self, path: Path) -> None:
        # Only library-owned pipeline objects are pickled; no __main__ classes.
        joblib.dump({"name": self.name, "pipeline": self.pipeline, "metadata": self.metadata}, path)

    @classmethod
    def load(cls, path: Path) -> "WeatherRegressor":
        """Load only trusted local artifacts; joblib can execute code during loading."""
        artifact = joblib.load(path)
        if artifact["metadata"]["sklearn_version"] != sklearn.__version__:
            raise ValueError("Model artifact scikit-learn version differs from the runtime")
        if artifact["metadata"]["feature_columns"] != FEATURES:
            raise ValueError("Model artifact feature contract differs from the runtime")
        return cls(artifact["name"], artifact["pipeline"], artifact["metadata"])


def evaluate(model: WeatherRegressor, rows: list[dict]) -> tuple[dict, list[dict]]:
    values, clips, unknowns = model.predict_many(rows)
    predictions = []
    for row, predicted, clipped, unknown in zip(rows, values, clips, unknowns):
        predictions.append({"date": row["date"], "treatment": row["treatment"],
                            "management_phase": row["management_phase"],
                            "previous_moisture": row["previous_moisture_m3_m3"],
                            "actual_moisture": row["soil_moisture_m3_m3"], "predicted_moisture": predicted,
                            "actual_change": row["moisture_change_m3_m3"],
                            "predicted_change": predicted - row["previous_moisture_m3_m3"],
                            "absolute_error": abs(predicted - row["soil_moisture_m3_m3"]),
                            "rain_mm": row["rain_mm"], "irrigation_mm": row["irrigation_mm"],
                            "clipped": clipped, "pooled_fallback": False, "unseen_phase": unknown})
    metrics = base.summarize(predictions)
    metrics["unseen_phase_rows"] = sum(unknowns)
    return metrics, predictions


def rollout(model, rows: list[dict], horizon: int) -> dict:
    """Vectorize rolling origins while forwarding target-day weather at every step."""
    if horizon < 1:
        raise ValueError("Horizon must be positive")
    grouped = {}
    for row in sorted(rows, key=lambda r: (r["date"], r["treatment"])):
        grouped.setdefault(row["treatment"], []).append(row)
    windows = []
    for group in grouped.values():
        for index in range(len(group) - horizon + 1):
            window = group[index:index + horizon]
            if all(window[i]["previous_date"] == window[i - 1]["date"]
                   and window[i]["partition"] == window[i - 1]["partition"] for i in range(1, horizon)):
                windows.append(window)
    if not windows:
        return {"horizon_days": horizon, "status": "insufficient_contiguous_validation_data", "windows": 0}
    states = [w[0]["previous_moisture_m3_m3"] for w in windows]
    actual, predicted, clips, unknowns = [], [], 0, 0
    for step in range(horizon):
        inputs = [{**window[step], "previous_moisture_m3_m3": state} for window, state in zip(windows, states)]
        states, clipped, unseen = model.predict_many(inputs)
        actual.extend(w[step]["soil_moisture_m3_m3"] for w in windows)
        predicted.extend(states)
        clips += sum(clipped)
        unknowns += sum(unseen)
    return {"horizon_days": horizon, "status": "evaluated", "windows": len(windows),
            "endpoint": base.score([w[-1]["soil_moisture_m3_m3"] for w in windows], states),
            "trajectory": base.score(actual, predicted), "clipped_steps": clips, "unseen_phase_steps": unknowns,
            "note": "Overlapping windows and treatment series share dates; not independent seasons."}


def adoption_checks(metrics: dict, recursive: dict, reference: dict, policy: dict) -> dict:
    baseline = reference["validation"]
    seven = recursive["7"]
    reference_seven = reference["rollouts"]["7"]
    return {
        "mae_improves_at_least_5_percent": metrics["moisture"]["mae"] <= baseline["moisture"]["mae"] * (1 - policy["minimum_relative_mae_improvement"]),
        "no_treatment_mae_above_limit": all(metrics["by_treatment"][t]["mae"] <= s["mae"] * policy["maximum_treatment_mae_ratio"]
                                             for t, s in baseline["by_treatment"].items()),
        "seven_day_endpoint_not_worse": seven["status"] == reference_seven["status"] == "evaluated"
            and seven["endpoint"]["mae"] <= reference_seven["endpoint"]["mae"] * policy["maximum_seven_day_endpoint_mae_ratio"],
        "no_one_day_clipping": metrics["clipped_predictions"] <= policy["maximum_clipped_validation_predictions"],
        "no_seven_day_clipping": seven.get("clipped_steps", math.inf) <= policy["maximum_clipped_seven_day_steps"],
    }
