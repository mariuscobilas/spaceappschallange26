"""Fixed historical cross-season yield ablation; no tuning, serving refit or promotion."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import platform
import statistics
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import prepare_water_yield as prep

EXPERIMENTS = prep.ROOT / "data/experiments/water_yield_v1"


def numeric_rows(rows, features, target):
    x = np.asarray([[float(row[f]) for f in features] for row in rows], dtype=float).reshape(len(rows), len(features))
    y = np.asarray([float(row[target]) for row in rows], dtype=float)
    if not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError("Nonfinite model inputs")
    return x, y


def fit_predict(train, evaluation, features, protocol):
    """Learn only from train. Evaluation targets are not read by this function."""
    x, y = numeric_rows(train, features, protocol["target"])
    if not features:
        mean = float(np.mean(y))
        return [mean] * len(evaluation), {"training_mean_yield": mean, "training_n": len(train)}
    test_x = np.asarray([[float(row[f]) for f in features] for row in evaluation], dtype=float)
    if not np.isfinite(test_x).all():
        raise ValueError("Nonfinite evaluation features")
    params = {k: v for k, v in protocol["estimator"].items() if k != "class"}
    pipeline = make_pipeline(StandardScaler(with_mean=True, with_std=True), Ridge(**params))
    pipeline.fit(x, y)
    scale, model = pipeline.steps[0][1], pipeline.steps[1][1]
    prediction = pipeline.predict(test_x)
    if not np.isfinite(prediction).all():
        raise ValueError("Nonfinite predictions")
    return prediction.tolist(), {"training_n": len(train), "features": features,
        "scaler_mean": scale.mean_.tolist(), "scaler_scale": scale.scale_.tolist(),
        "scaled_coefficients": model.coef_.tolist(), "intercept": float(model.intercept_),
        "estimator_parameters": model.get_params(), "prediction_clipping": False}


def metrics(rows):
    actual = [float(r["observed_yield_t_ha"]) for r in rows]
    errors = [float(r["predicted_yield_t_ha"]) - y for r, y in zip(rows, actual)]
    mean = statistics.fmean(actual)
    variance = math.fsum((y - mean) ** 2 for y in actual)
    return {"n": len(rows), "mae": statistics.fmean(abs(e) for e in errors),
        "rmse": math.sqrt(statistics.fmean(e * e for e in errors)),
        "bias": statistics.fmean(errors),
        "r2": 1 - math.fsum(e * e for e in errors) / variance if variance > 0 else None,
        "negative_predictions": sum(float(r["predicted_yield_t_ha"]) < 0 for r in rows)}


def summarize(rows, seasons):
    by_season = {s: metrics([r for r in rows if r["season_id"] == s]) for s in seasons}
    slices = {}
    for field in ("tillage", "planting_window", "cover_mix", "trial"):
        slices[field] = {value: metrics([r for r in rows if r[field] == value]) for value in sorted({r[field] for r in rows})}
    return {"pooled": metrics(rows), "macro_season_mae": statistics.fmean(v["mae"] for v in by_season.values()),
        "per_season": by_season, "per_management": slices}


def evaluate(observations, memberships, schema, protocol):
    index = {r["observation_id"]: r for r in observations}
    predictions, fitted, results = [], {}, {}
    for cohort, methods in protocol["comparisons"].items():
        fold_rows = [r for r in memberships if r["cohort"] == cohort]
        expected_ids = {r["observation_id"] for r in observations if cohort == "main" or r[protocol["nitrate"]] != ""}
        results[cohort] = {}
        for method in methods:
            selected, fitted[cohort + "/" + method] = [], {}
            for season in protocol["folds"]:
                fold = [r for r in fold_rows if r["held_out_season"] == season]
                ids = [r["item_id"] for r in fold]
                if len(ids) != len(set(ids)) or set(ids) != expected_ids:
                    raise ValueError("Fold membership does not match cohort")
                if any((r["role"] == "evaluation") != (index[r["item_id"]]["season_id"] == season) for r in fold):
                    raise ValueError("Season leakage in frozen membership")
                train = [index[r["item_id"]] for r in fold if r["role"] == "train"]
                test = [index[r["item_id"]] for r in fold if r["role"] == "evaluation"]
                if not train or not test or any(r["season_id"] == season for r in train):
                    raise ValueError("Invalid leave-season-out fold")
                yhat, metadata = fit_predict(train, test, schema["families"][method], protocol)
                fitted[cohort + "/" + method][season] = metadata
                for row, predicted in zip(test, yhat):
                    selected.append({"cohort": cohort, "method": method, "observation_id": row["observation_id"],
                        "season_id": season, **{k: row[k] for k in ("trial", "tillage", "planting_window", "cover_mix")},
                        "observed_yield_t_ha": float(row[protocol["target"]]), "predicted_yield_t_ha": predicted})
            if {r["observation_id"] for r in selected} != expected_ids or len(selected) != len(expected_ids):
                raise ValueError("Incomplete or repeated out-of-fold predictions")
            predictions.extend(selected)
            results[cohort][method] = summarize(selected, protocol["folds"])
    increments = {}
    for cohort, methods in results.items():
        comparisons = [("water_weather", "weather"), ("water", "mean")]
        if "water_weather_nitrate" in methods:
            comparisons.append(("water_weather_nitrate", "water_weather"))
        increments[cohort] = {}
        for added, reference in comparisons:
            changes = {s: methods[added]["per_season"][s]["mae"] - methods[reference]["per_season"][s]["mae"] for s in protocol["folds"]}
            increments[cohort][added + "_minus_" + reference] = {
                "macro_mae_change": methods[added]["macro_season_mae"] - methods[reference]["macro_season_mae"],
                "pooled_mae_change": methods[added]["pooled"]["mae"] - methods[reference]["pooled"]["mae"],
                "per_season_mae_changes": changes, "seasons_improved": sum(v < 0 for v in changes.values()),
                "season_change_sample_sd": statistics.stdev(changes.values()),
                "uncertainty": "Five correlated folds; descriptive spread, not an independent-sample confidence interval or significance test"}
    return {"methods": results, "increments": increments, "farmer_ready": False,
            "validation": protocol["validation"], "interpretation": protocol["interpretation"]}, predictions, fitted


def git_context():
    def command(*args):
        return subprocess.check_output(["git", *args], cwd=prep.ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    try:
        return {"commit": command("rev-parse", "HEAD"), "status_porcelain": command("status", "--porcelain")}
    except (OSError, subprocess.CalledProcessError):
        return {"commit": "unavailable", "status_porcelain": "unavailable"}


def run_experiment():
    import mlflow
    from mlflow.tracking import MlflowClient

    # Reconstruct and compare every snapshot file before any fit, including the manifest.
    expected = prep.build_snapshot()
    for name, value in expected.items():
        if (prep.OUTPUT / name).read_bytes() != value:
            raise ValueError(f"Prepared dataset failed replay: {name}")
    protocol = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
    schema = json.loads((prep.OUTPUT / "feature_schema.json").read_text(encoding="utf-8"))
    observations = prep.read_csv(prep.OUTPUT / "observations.csv")
    folds = prep.read_csv(prep.OUTPUT / "fold_memberships.csv")
    provenance = {"git": git_context(), "python": platform.python_version(),
        "packages": {**{name: importlib.metadata.version(name) for name in ("scikit-learn", "numpy", "scipy")},
                     "mlflow_module": mlflow.__version__,
                     **{name: importlib.metadata.version(name) for name in importlib.metadata.packages_distributions().get("mlflow", [])}},
        "protocol_sha256": prep.digest(prep.PROTOCOL), "evaluation_code_sha256": prep.digest(Path(__file__)),
        "preparation_code_sha256": prep.digest(Path(prep.__file__)),
        "prepared_sha256": {name: prep.digest(prep.OUTPUT / name) for name in expected},
        "source_sha256": protocol["source_sha256"], "seed": protocol["seed"],
        "selection_or_promotion": False, "all_data_refit": False}
    tracking = EXPERIMENTS / "tracking"
    tracking.mkdir(parents=True, exist_ok=True)
    client = MlflowClient(tracking_uri="sqlite:///" + (tracking / "mlflow.db").resolve().as_posix())
    name = "water-yield-v1-fixed-ablation"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = EXPERIMENTS / "runs" / stamp
    output.mkdir(parents=True)
    (output / "protocol.json").write_bytes(prep.PROTOCOL.read_bytes())
    (output / "provenance.json").write_bytes(prep.json_bytes(provenance))
    result, predictions, fitted = evaluate(observations, folds, schema, protocol)
    prep.verify_sources(protocol)
    for filename, checksum in provenance["prepared_sha256"].items():
        if prep.digest(prep.OUTPUT / filename) != checksum:
            raise ValueError("Prepared inputs changed during evaluation")
    if prep.digest(prep.PROTOCOL) != provenance["protocol_sha256"]:
        raise ValueError("Protocol changed during evaluation")
    (output / "results.json").write_bytes(prep.json_bytes(result))
    (output / "oof_predictions.csv").write_bytes(prep.csv_bytes(predictions))
    (output / "fold_models.json").write_bytes(prep.json_bytes(fitted))
    run_ids = {}
    for cohort, methods in result["methods"].items():
        for method, summary in methods.items():
            run = client.create_run(experiment_id, tags={"mlflow.runName": f"{cohort}/{method}/{stamp}", "farmer_ready": "false"})
            run_id = run.info.run_id
            run_ids[cohort + "/" + method] = run_id
            try:
                for key, value in {"cohort": cohort, "method": method, "features": schema["families"][method],
                    "estimator": protocol["estimator"], "seed": protocol["seed"],
                    "protocol_sha256": provenance["protocol_sha256"], "git_commit": provenance["git"]["commit"]}.items():
                    client.log_param(run_id, key, json.dumps(value) if isinstance(value, (dict, list)) else value)
                client.log_metric(run_id, "macro_season_mae", summary["macro_season_mae"])
                for metric, value in summary["pooled"].items():
                    if value is not None:
                        client.log_metric(run_id, "pooled_" + metric, value)
                for season, scores in summary["per_season"].items():
                    client.log_metric(run_id, season + "_mae", scores["mae"])
                for artifact in output.iterdir():
                    client.log_artifact(run_id, str(artifact))
                client.set_terminated(run_id, "FINISHED")
            except Exception:
                client.set_terminated(run_id, "FAILED")
                raise
    (output / "tracking_runs.json").write_bytes(prep.json_bytes(run_ids))
    (EXPERIMENTS / "latest.json").write_bytes(prep.json_bytes({"run_directory": str(output.resolve()), "tracking_runs": run_ids}))
    print(f"Saved {output}")
    for cohort, methods in result["methods"].items():
        for method, summary in methods.items():
            print(f"{cohort}/{method}: macro MAE={summary['macro_season_mae']:.6f}; pooled MAE={summary['pooled']['mae']:.6f} t/ha")
    return result


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    run_experiment()
