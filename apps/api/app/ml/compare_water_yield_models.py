"""Compare fixed tree regressors with the frozen Ridge yield experiment offline."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import platform
import statistics
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor

import evaluate_water_yield as base
import prepare_water_yield as prep

PROTOCOL = Path(__file__).with_name("water_yield_model_comparison_v1.json")
OUTPUT = prep.ROOT / "data/experiments/water_yield_model_comparison_v1"


def verify_pins(comparison: dict) -> None:
    for name, expected in comparison["pinned_sha256"].items():
        if prep.digest(prep.ROOT / name) != expected:
            raise ValueError(f"Comparison reference hash mismatch: {name}")


def verify_reference(predictions: list[dict], reference: list[dict]) -> None:
    def key(row: dict) -> tuple[str, str, str]:
        return row["cohort"], row["method"], row["observation_id"]
    expected = {key(r): r for r in reference}
    observed = {key(r): r for r in predictions}
    if len(expected) != len(reference) or len(observed) != len(predictions) or set(expected) != set(observed):
        raise ValueError("Ridge replay cohort differs from frozen reference")
    for identity, row in observed.items():
        original = expected[identity]
        if row["season_id"] != original["season_id"]:
            raise ValueError("Ridge replay season mismatch")
        for field in ("observed_yield_t_ha", "predicted_yield_t_ha"):
            if not math.isclose(float(row[field]), float(original[field]), rel_tol=0, abs_tol=1e-12):
                raise ValueError(f"Ridge replay prediction mismatch: {identity}")


def fit_tree(train: list[dict], evaluation: list[dict], features: list[str], target: str,
             model_name: str, comparison: dict) -> tuple[list[float], dict]:
    x, y = base.numeric_rows(train, features, target)
    test_x = np.asarray([[float(row[f]) for f in features] for row in evaluation], dtype=float)
    if not features or not train or not evaluation or not np.isfinite(test_x).all():
        raise ValueError("Invalid tree features/cohort")
    classes = {"random_forest": RandomForestRegressor, "gradient_boosting": GradientBoostingRegressor}
    if model_name not in classes:
        raise ValueError("Undeclared model")
    model = classes[model_name](**comparison["tree_candidates"][model_name])
    model.fit(x, y)
    predictions = model.predict(test_x)
    if not np.isfinite(predictions).all():
        raise ValueError("Nonfinite tree predictions")
    return predictions.tolist(), {"training_n": len(train), "features": features,
        "estimator_parameters": model.get_params(), "feature_importances": model.feature_importances_.tolist(),
        "preprocessing": "none", "prediction_clipping": False,
        "training_target_min": float(y.min()), "training_target_max": float(y.max())}


def compare(observations: list[dict], memberships: list[dict], schema: dict, protocol: dict,
            comparison: dict, reference: list[dict]) -> tuple[dict, list[dict], dict]:
    ridge_results, ridge_predictions, ridge_fits = base.evaluate(observations, memberships, schema, protocol)
    # Reproduce the original predictions before fitting any tree on the real cohort.
    verify_reference(ridge_predictions, reference)
    results, predictions, fitted = {}, [], {}
    for cohort, methods in ridge_results["methods"].items():
        results[cohort] = {}
        for family, summary in methods.items():
            model = "mean" if family == "mean" else "ridge"
            results[cohort][family] = {model: summary}
            fitted[f"{cohort}/{family}/{model}"] = ridge_fits[f"{cohort}/{family}"]
    for row in ridge_predictions:
        predictions.append({"cohort": row["cohort"], "feature_family": row["method"],
            "model": "mean" if row["method"] == "mean" else "ridge",
            **{k: v for k, v in row.items() if k not in {"cohort", "method"}}})
    index = {r["observation_id"]: r for r in observations}
    for cohort, families in comparison["feature_families"].items():
        if set(families) != set(protocol["comparisons"][cohort]) - {"mean"}:
            raise ValueError("Comparison changed declared feature families")
        expected_ids = {r["observation_id"] for r in observations if cohort == "main" or r[protocol["nitrate"]] != ""}
        for family in families:
            for model in comparison["tree_candidates"]:
                selected, fold_fits = [], {}
                for season in protocol["folds"]:
                    fold = [r for r in memberships if r["cohort"] == cohort and r["held_out_season"] == season]
                    if (len(fold) != len(expected_ids) or {r["item_id"] for r in fold} != expected_ids
                            or any(r["role"] not in {"train", "evaluation"} for r in fold)
                            or any((r["role"] == "evaluation") != (index[r["item_id"]]["season_id"] == season) for r in fold)):
                        raise ValueError("Invalid whole-season comparison fold")
                    train = [index[r["item_id"]] for r in fold if r["role"] == "train"]
                    test = [index[r["item_id"]] for r in fold if r["role"] == "evaluation"]
                    yhat, metadata = fit_tree(train, test, schema["families"][family], protocol["target"], model, comparison)
                    fold_fits[season] = metadata
                    for row, predicted in zip(test, yhat):
                        selected.append({"cohort": cohort, "feature_family": family, "model": model,
                            "observation_id": row["observation_id"], "season_id": season,
                            **{k: row[k] for k in ("trial", "tillage", "planting_window", "cover_mix")},
                            "observed_yield_t_ha": float(row[protocol["target"]]), "predicted_yield_t_ha": predicted})
                if len(selected) != len(expected_ids) or {r["observation_id"] for r in selected} != expected_ids:
                    raise ValueError("Incomplete tree predictions")
                predictions.extend(selected)
                fitted[f"{cohort}/{family}/{model}"] = fold_fits
                results[cohort][family][model] = base.summarize(selected, protocol["folds"])
    changes = {}
    for cohort, families in results.items():
        changes[cohort] = {}
        for family, models in families.items():
            if family == "mean":
                continue
            changes[cohort][family] = {}
            for model in comparison["tree_candidates"]:
                deltas = {s: models[model]["per_season"][s]["mae"] - models["ridge"]["per_season"][s]["mae"] for s in protocol["folds"]}
                changes[cohort][family][model + "_minus_ridge"] = {
                    "macro_mae_change": models[model]["macro_season_mae"] - models["ridge"]["macro_season_mae"],
                    "pooled_mae_change": models[model]["pooled"]["mae"] - models["ridge"]["pooled"]["mae"],
                    "per_season_mae_changes": deltas, "seasons_improved": sum(d < 0 for d in deltas.values()),
                    "season_change_sample_sd": statistics.stdev(deltas.values())}
    return {"methods": results, "tree_minus_ridge": changes, "farmer_ready": False,
        "exposure": comparison["exposure"], "uncertainty": comparison["uncertainty"],
        "reference_replayed": True, "model_promoted": False}, predictions, fitted


def run_experiment() -> dict:
    import mlflow
    from mlflow.tracking import MlflowClient

    comparison_hash = prep.digest(PROTOCOL)
    comparison = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    verify_pins(comparison)
    expected = prep.build_snapshot()
    for name, value in expected.items():
        if (prep.OUTPUT / name).read_bytes() != value:
            raise ValueError(f"Prepared cohort failed replay: {name}")
    protocol = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
    schema = json.loads((prep.OUTPUT / "feature_schema.json").read_text(encoding="utf-8"))
    reference_dir = prep.ROOT / comparison["reference_directory"]
    reference = prep.read_csv(reference_dir / "oof_predictions.csv")
    provenance = {"git": base.git_context(), "python": platform.python_version(),
        "packages": {**{name: importlib.metadata.version(name) for name in ("scikit-learn", "numpy", "scipy")},
                     "mlflow_module": mlflow.__version__,
                     **{name: importlib.metadata.version(name) for name in importlib.metadata.packages_distributions().get("mlflow", [])}},
        "comparison_protocol_sha256": comparison_hash, "comparison_code_sha256": prep.digest(Path(__file__)),
        "pinned_sha256": comparison["pinned_sha256"], "source_sha256": protocol["source_sha256"],
        "prepared_sha256": {name: prep.digest(prep.OUTPUT / name) for name in expected},
        "seed": comparison["seed"], "all_data_refit": False, "serving_selection_changed": False}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = OUTPUT / "runs" / stamp
    output.mkdir(parents=True)
    (output / "protocol.json").write_bytes(PROTOCOL.read_bytes())
    (output / "provenance.json").write_bytes(prep.json_bytes(provenance))
    result, predictions, fitted = compare(prep.read_csv(prep.OUTPUT / "observations.csv"),
        prep.read_csv(prep.OUTPUT / "fold_memberships.csv"), schema, protocol, comparison, reference)
    verify_pins(comparison)
    prep.verify_sources(protocol)
    if prep.digest(PROTOCOL) != comparison_hash:
        raise ValueError("Comparison protocol changed during fitting")
    for name, checksum in provenance["prepared_sha256"].items():
        if prep.digest(prep.OUTPUT / name) != checksum:
            raise ValueError("Prepared input changed during fitting")
    (output / "results.json").write_bytes(prep.json_bytes(result))
    (output / "oof_predictions.csv").write_bytes(prep.csv_bytes(predictions))
    (output / "fold_metadata.json").write_bytes(prep.json_bytes(fitted))
    tracking = OUTPUT / "tracking"
    tracking.mkdir(parents=True, exist_ok=True)
    client = MlflowClient(tracking_uri="sqlite:///" + (tracking / "mlflow.db").resolve().as_posix())
    name = "water-yield-model-comparison-v1"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    run_ids = {}
    for cohort, families in result["methods"].items():
        for family, models in families.items():
            for model, summary in models.items():
                identity = f"{cohort}/{family}/{model}"
                run = client.create_run(experiment_id, tags={"mlflow.runName": f"{identity}/{stamp}", "farmer_ready": "false", "exploratory": "true"})
                run_id = run.info.run_id
                run_ids[identity] = run_id
                try:
                    settings = comparison["tree_candidates"].get(model, protocol["estimator"] if model == "ridge" else {"strategy": "training_mean"})
                    for key, value in {"cohort": cohort, "feature_family": family, "model": model,
                        "features": schema["families"][family], "settings": settings, "seed": comparison["seed"],
                        "comparison_protocol_sha256": comparison_hash, "git_commit": provenance["git"]["commit"]}.items():
                        client.log_param(run_id, key, json.dumps(value) if isinstance(value, (list, dict)) else value)
                    client.log_metric(run_id, "macro_season_mae", summary["macro_season_mae"])
                    for metric, value in summary["pooled"].items():
                        if value is not None:
                            client.log_metric(run_id, "pooled_" + metric, value)
                    for season, scores in summary["per_season"].items():
                        for metric, value in scores.items():
                            if value is not None:
                                client.log_metric(run_id, season + "_" + metric, value)
                    for artifact in output.iterdir():
                        client.log_artifact(run_id, str(artifact))
                    client.set_terminated(run_id, "FINISHED")
                except Exception:
                    client.set_terminated(run_id, "FAILED")
                    raise
    (output / "tracking_runs.json").write_bytes(prep.json_bytes(run_ids))
    (OUTPUT / "latest.json").write_bytes(prep.json_bytes({"run_directory": str(output.resolve()), "tracking_runs": run_ids}))
    print(f"Saved {output}")
    for cohort, families in result["methods"].items():
        for family, models in families.items():
            for model, scores in models.items():
                print(f"{cohort}/{family}/{model}: macro MAE={scores['macro_season_mae']:.6f}; pooled MAE={scores['pooled']['mae']:.6f} t/ha")
    return result


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    run_experiment()
