"""Run the fixed, retrospective Mandan weather ablation."""
from __future__ import annotations

import importlib.metadata
import json
import math
import platform
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import evaluate_water_yield as base
import prepare_mandan_weather as prep
import prepare_water_yield as io

PROTOCOL = Path(__file__).with_name("mandan_weather_protocol_v1.json")
OUTPUT = io.ROOT / "data/experiments/mandan_weather_ablation_v1"
WEATHER = ["season_rain_mm", "season_mean_tmax_c", "season_mean_tmin_c", "season_mean_rh_pct", "season_mean_wind_m_s", "season_mean_solar_mj_m2_day"]


def score(rows: list[dict], paired: bool = False, tolerance: float = 1e-12) -> dict:
    errors = [r["predicted"] - r["observed"] for r in rows]
    result = {"n": len(rows), "mae": float(np.mean(np.abs(errors))), "rmse": float(np.sqrt(np.mean(np.square(errors)))), "bias": float(np.mean(errors))}
    if paired:
        labels = [r["observed"] > tolerance for r in rows]
        chooses_cover = [r["predicted"] > tolerance for r in rows]
        tp = sum(a and b for a, b in zip(labels, chooses_cover)); tn = sum(not a and not b for a, b in zip(labels, chooses_cover))
        fp = sum(not a and b for a, b in zip(labels, chooses_cover)); fn = sum(a and not b for a, b in zip(labels, chooses_cover))
        result.update({"observed_benefits": sum(labels), "observed_harms": len(labels) - sum(labels), "detected_benefits": tp,
            "missed_benefits": fn, "harmful_cover_choices": fp, "avoided_harms": tn,
            "balanced_accuracy": 0.5 * (tp / max(1, sum(labels)) + tn / max(1, len(labels) - sum(labels)))})
    return result


def add_summary(rows: list[dict], paired: bool, protocol: dict) -> dict:
    per_year = {str(y): score([r for r in rows if r["year"] == y], paired, protocol["decision_tolerance"]) for y in protocol["years"]}
    result = {"unit": rows[0]["unit"], "pooled": score(rows, paired, protocol["decision_tolerance"]), "per_year": per_year,
        "macro_year_mae": statistics.fmean(x["mae"] for x in per_year.values())}
    if paired:
        balanced = {}
        for year in protocol["years"]:
            controls = defaultdict(list)
            for row in rows:
                if row["year"] == year:
                    controls[row["control_id"]].append(abs(row["predicted"] - row["observed"]))
            balanced[str(year)] = statistics.fmean(statistics.fmean(v) for v in controls.values())
        result.update({"control_balanced_year_mae": balanced, "macro_control_balanced_mae": statistics.fmean(balanced.values()),
            "unique_controls": len({r["control_id"] for r in rows})})
    return result


def fit(train: list[dict], test: list[dict], target: str, features: list[str], estimator: dict) -> tuple[list[float], dict]:
    x = np.array([[float(r[f]) for f in features] for r in train], dtype=float)
    xt = np.array([[float(r[f]) for f in features] for r in test], dtype=float)
    y = np.array([float(r[target]) for r in train])
    model = make_pipeline(StandardScaler(), Ridge(**estimator))
    model.fit(x, y)
    values = model.predict(xt)
    if not np.isfinite(values).all():
        raise ValueError("Nonfinite prediction")
    scaler, ridge = model.named_steps["standardscaler"], model.named_steps["ridge"]
    return values.tolist(), {"training_n": len(train), "features": features, "training_scaler_mean": scaler.mean_.tolist(),
        "training_scaler_scale": scaler.scale_.tolist(), "coefficients": ridge.coef_.tolist(), "intercept": float(ridge.intercept_),
        "estimator_parameters": ridge.get_params(), "training_mae": float(np.mean(np.abs(model.predict(x) - y))),
        "independent_weather_vectors_train": len({tuple(float(r[f]) for f in WEATHER) for r in train}),
        "warning": "only two distinct weather vectors in each training fold"}


def run() -> dict:
    from mlflow.tracking import MlflowClient
    protocol_raw = PROTOCOL.read_bytes(); protocol = json.loads(protocol_raw)
    pin = protocol["pinned_sha256"]
    io.verify_sources({"source_sha256": pin})
    snapshot = prep.build_snapshot()
    if any((prep.OUTPUT / name).read_bytes() != data for name, data in snapshot.items()):
        raise ValueError("Prepared weather-ablation snapshot failed replay")
    cohorts = {name: io.read_csv(prep.OUTPUT / (name + ".csv")) for name in ("spring_water_yield", "water_yield_pairs")}
    memberships = io.read_csv(prep.OUTPUT / "fold_memberships.csv")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = OUTPUT / "runs" / stamp
    run_dir.mkdir(parents=True)
    (run_dir / "protocol.json").write_bytes(protocol_raw)
    provenance = {"git": base.git_context(), "python": platform.python_version(),
        "packages": {n: importlib.metadata.version(n) for n in ("scikit-learn", "numpy", "scipy", "mlflow-skinny")},
        "protocol_sha256": io.digest(PROTOCOL), "evaluation_code_sha256": io.digest(Path(__file__)),
        "preparation_code_sha256": io.digest(Path(prep.__file__)), "pinned_sha256": pin,
        "prepared_sha256": {n: io.digest(prep.OUTPUT / n) for n in snapshot}, "all_data_refit": False,
        "serving_selection_changed": False, "future_weather_available_at_planting": False}
    (run_dir / "provenance.json").write_bytes(io.json_bytes(provenance))
    predictions, metadata, results, lookup = [], {}, {}, {}
    configs = {
        "yield_absolute": {"mean": {"kind": "mean"}, "water": {"features": ["spring_storage_0_210cm_mm"]},
            "weather": {"features": WEATHER}, "water_weather": {"features": ["spring_storage_0_210cm_mm", *WEATHER]}},
        "yield_difference": {"zero": {"kind": "zero"}, "mean_difference": {"kind": "mean"},
            "direct_water": {"features": ["delta_spring_storage_0_210cm_mm"]},
            "direct_water_weather": {"features": ["delta_spring_storage_0_210cm_mm", *WEATHER]},
            "subtract_water": {"subtract": ("yield_absolute", "water")}, "subtract_weather": {"subtract": ("yield_absolute", "weather")},
            "subtract_water_weather": {"subtract": ("yield_absolute", "water_weather")}}}
    task_defs = {"yield_absolute": ("spring_water_yield", "observation_id", "wheat_yield_t_ha", False),
        "yield_difference": ("water_yield_pairs", "pair_id", "delta_yield_t_ha", True)}
    for task, methods in configs.items():
        cohort, identity, target, paired = task_defs[task]; rows = cohorts[cohort]
        years = {int(r["year"]) for r in rows}
        if len(rows) != protocol["tasks"][task]["n"] or years != set(protocol["years"]):
            raise ValueError("Task cohort differs from protocol")
        result_methods, metadata[task] = {}, {}
        for method, config in methods.items():
            oof = []
            for held in protocol["years"]:
                fold = [m for m in memberships if m["cohort"] == cohort and int(m["held_out_year"]) == held]
                index = {r[identity]: r for r in rows}
                if len(fold) != len(rows) or {m["item_id"] for m in fold} != set(index):
                    raise ValueError("Frozen membership differs")
                if any(m["role"] != ("evaluation" if int(m["year"]) == held else "train") for m in fold):
                    raise ValueError("Year leakage")
                train = [index[m["item_id"]] for m in fold if m["role"] == "train"]
                test = [index[m["item_id"]] for m in fold if m["role"] == "evaluation"]
                fitted = {}
                if config.get("kind") == "zero": yhat = [0.0] * len(test)
                elif config.get("kind") == "mean":
                    mean = float(np.mean([float(r[target]) for r in train])); yhat = [mean] * len(test); fitted = {"training_target_mean": mean, "training_n": len(train)}
                elif "subtract" in config:
                    src_task, src_method = config["subtract"]; yhat = []
                    for r in test:
                        a = lookup[(src_task, src_method, r["pair_id"])]
                        b = lookup[(src_task, src_method, r["control_id"])]
                        if a["year"] != held or b["year"] != held: raise ValueError("Subtracted arm predictions are not same-year OOF")
                        yhat.append(a["predicted"] - b["predicted"])
                    fitted = {"new_fit": False, "source": f"{src_task}/{src_method}", "same_year_out_of_fold": True}
                else: yhat, fitted = fit(train, test, target, config["features"], protocol["estimator"])
                metadata[task].setdefault(method, {})[str(held)] = fitted
                for row, pred in zip(test, yhat):
                    out = {"task": task, "method": method, "item_id": row[identity], "year": held, "rep": int(row["rep"]),
                        "treatment": int(row["treatment"]), "control_id": row.get("control_id", ""), "unit": protocol["tasks"][task]["unit"],
                        "observed": float(row[target]), "predicted": float(pred)}
                    oof.append(out); predictions.append(out); lookup[(task, method, row[identity])] = out
            if len(oof) != len(rows): raise ValueError("Incomplete OOF predictions")
            result_methods[method] = add_summary(oof, paired, protocol)
        results[task] = result_methods
    comparisons = {}
    for task, methods in results.items():
        base_names = ["mean"] if task == "yield_absolute" else ["zero", "mean_difference"]
        comparisons[task] = {}
        for name, summary in methods.items():
            comparisons[task][name] = {ref: {"macro_mae_change": summary["macro_year_mae"] - methods[ref]["macro_year_mae"],
                "per_year_mae_change": {y: summary["per_year"][y]["mae"] - methods[ref]["per_year"][y]["mae"] for y in summary["per_year"]}}
                for ref in base_names}
    report = {"tasks": results, "versus_baselines": comparisons, "weather_vectors": {str(y): len({tuple(float(r[f]) for f in WEATHER) for r in cohorts["spring_water_yield"] if int(r["year"]) == y}) for y in protocol["years"]},
        "weather_rank_warning": "Each year has one regional vector; each training fold has two distinct vectors. Six weather variables cannot support independent weather-effect inference.",
        "weather_only_subtraction_expected_zero": True, "farmer_ready": False, "model_promoted": False}
    io.verify_sources({"source_sha256": pin})
    if PROTOCOL.read_bytes() != protocol_raw or prep.build_snapshot() != snapshot:
        raise ValueError("Pinned inputs/protocol changed during fitting")
    (run_dir / "results.json").write_bytes(io.json_bytes(report))
    (run_dir / "oof_predictions.csv").write_bytes(io.csv_bytes(predictions))
    (run_dir / "fold_metadata.json").write_bytes(io.json_bytes(metadata))
    tracking = OUTPUT / "tracking"; tracking.mkdir(parents=True, exist_ok=True)
    client = MlflowClient(tracking_uri="sqlite:///" + (tracking / "mlflow.db").resolve().as_posix())
    exp = client.get_experiment_by_name("mandan-weather-ablation-v1")
    exp_id = exp.experiment_id if exp else client.create_experiment("mandan-weather-ablation-v1", artifact_location=(tracking / "artifacts").resolve().as_uri())
    run_ids = {}
    for task, methods in results.items():
        for method, summary in methods.items():
            rid = client.create_run(exp_id, tags={"mlflow.runName": f"{task}/{method}/{stamp}", "exploratory": "true", "farmer_ready": "false"}).info.run_id
            run_ids[f"{task}/{method}"] = rid
            client.log_param(rid, "protocol_sha256", provenance["protocol_sha256"]); client.log_param(rid, "method", method)
            client.log_param(rid, "task", task); client.log_param(rid, "configuration", json.dumps(configs[task][method], sort_keys=True))
            client.log_metric(rid, "macro_year_mae", summary["macro_year_mae"])
            for metric, value in summary["pooled"].items():
                if isinstance(value, (int, float)): client.log_metric(rid, "pooled_" + metric, value)
            client.set_terminated(rid, "FINISHED")
    (run_dir / "tracking_runs.json").write_bytes(io.json_bytes(run_ids))
    (OUTPUT / "latest.json").write_bytes(io.json_bytes({"run_directory": str(run_dir.resolve()), "tracking_runs": run_ids}))
    print(f"Saved {run_dir}")
    for task, methods in results.items():
        for method, summary in methods.items(): print(f"{task}/{method}: macro MAE {summary['macro_year_mae']:.6f} {summary['unit']}")
    return report


if __name__ == "__main__":
    run()
