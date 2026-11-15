"""Fixed Mandan-only yield/contrast and initial-to-spring-water components."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import platform
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import average_precision_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import evaluate_cover_fallow as contrast
import evaluate_water_yield as base
import prepare_mandan as mandan
import prepare_water_yield as prep

PROTOCOL = Path(__file__).with_name("mandan_protocol_v1.json")
OUTPUT = prep.ROOT / "data/experiments/mandan_components_v1"


def finite(value: object) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Nonfinite Mandan value")
    return result


def task_folds(rows: list[dict], memberships: list[dict], task: dict, years: list[int], source_rows: list[dict]) -> dict:
    identity = task["id"]
    index = {r[identity]: r for r in rows}
    if len(index) != len(rows) or len(rows) != task["expected_n"]:
        raise ValueError("Task identity/count differs from frozen cohort")
    source_years = {r["observation_id"]: int(r["year"]) for r in source_rows}
    result = {}
    for year in years:
        fold = [r for r in memberships if r["cohort"] == task["cohort"] and int(r["held_out_year"]) == year]
        if len(fold) != len(index) or {r["item_id"] for r in fold} != set(index):
            raise ValueError("Task fold membership differs")
        roles = {}
        for member in fold:
            row = index[member["item_id"]]
            expected = "evaluation" if int(row["year"]) == year else "train"
            if member["role"] != expected or int(member["year"]) != int(row["year"]):
                raise ValueError("Year leakage in Mandan fold")
            ids = [row[identity]] + ([row["control_id"]] if task["paired"] else [])
            for item in ids:
                if source_years.get(item) != int(row["year"]) or (item in roles and roles[item] != expected):
                    raise ValueError("Shared-control/source-year leakage")
                roles[item] = expected
        train = [index[m["item_id"]] for m in fold if m["role"] == "train"]
        test = [index[m["item_id"]] for m in fold if m["role"] == "evaluation"]
        if not train or not test:
            raise ValueError("Empty Mandan fold")
        result[year] = train, test
    return result


def fit_predict(train: list[dict], test: list[dict], task: dict, config: dict, protocol: dict) -> tuple[list[float], dict]:
    y = np.asarray([finite(r[task["target"]]) for r in train])
    kind = config["kind"]
    metadata = {"training_n": len(train), "kind": kind}
    if kind == "zero":
        return [0.0] * len(test), metadata
    if kind == "mean":
        mean = float(np.mean(y))
        return [mean] * len(test), {**metadata, "training_target_mean": mean}
    if kind in {"persistence", "mean_change"}:
        correction = statistics.fmean(value - finite(r[config["reference"]]) for value, r in zip(y, train)) if kind == "mean_change" else 0.0
        return [finite(r[config["reference"]]) + correction for r in test], {**metadata, "reference": config["reference"], "training_mean_change": correction}
    if kind != "ridge":
        raise ValueError("Unsupported fitted method")
    numeric, categorical = config["numeric"], config["categorical"]
    def matrix(rows: list[dict]) -> np.ndarray:
        values = []
        for r in rows:
            cats = [r[f] for f in categorical]
            if not all(isinstance(v, str) and v for v in cats):
                raise ValueError("Missing treatment category; no imputation")
            values.append([*[finite(r[f]) for f in numeric], *cats])
        return np.asarray(values, dtype=object)
    n = len(numeric)
    transformers = [("numeric", StandardScaler(), list(range(n)))]
    if categorical:
        transformers.append(("category", OneHotEncoder(drop=None, handle_unknown="ignore", sparse_output=False), list(range(n, n + len(categorical)))))
    features = ColumnTransformer(transformers, remainder="drop")
    model = Pipeline([("features", features), ("ridge", Ridge(**protocol["estimator"]))])
    x, test_x = matrix(train), matrix(test)
    model.fit(x, y)
    predicted = model.predict(test_x)
    if not np.isfinite(predicted).all():
        raise ValueError("Nonfinite fitted predictions")
    scale, ridge = features.named_transformers_["numeric"], model.named_steps["ridge"]
    categories, encoded_names, unknown = {}, [], 0
    if categorical:
        encoder = features.named_transformers_["category"]
        categories = {f: c.tolist() for f, c in zip(categorical, encoder.categories_)}
        encoded_names = encoder.get_feature_names_out(categorical).tolist()
        unknown = sum(any(r[f] not in choices for f, choices in categories.items()) for r in test)
    return predicted.tolist(), {**metadata, "numeric_features": numeric, "categorical_features": categorical,
        "numeric_mean": scale.mean_.tolist(), "numeric_scale": scale.scale_.tolist(), "training_categories": categories,
        "evaluation_unknown_category_rows": unknown, "transformed_features": [*numeric, *encoded_names],
        "coefficients": ridge.coef_.tolist(), "intercept": float(ridge.intercept_), "estimator_parameters": ridge.get_params(),
        "training_mae": float(np.mean(np.abs(model.predict(x) - y))), "prediction_clipping": False}


def subtract_prediction(row: dict, config: dict, lookup: dict, year: int) -> float:
    keys = [(config["source_task"], config["source_method"], item) for item in (row["pair_id"], row["control_id"])]
    if any(key not in lookup for key in keys):
        raise ValueError("Missing held-out arm prediction")
    arms = [lookup[key] for key in keys]
    if any(int(p["year"]) != year for p in arms) or int(row["year"]) != year:
        raise ValueError("Absolute prediction is not from the same held-out year")
    return arms[0]["predicted"] - arms[1]["predicted"]


def scores(rows: list[dict], task_name: str, tolerance: float) -> dict:
    if task_name == "yield_difference":
        return contrast.scores([{"observed_delta_yield_t_ha": r["observed"], "predicted_delta_yield_t_ha": r["predicted"]} for r in rows], tolerance)
    result = base.metrics([{"observed_yield_t_ha": r["observed"], "predicted_yield_t_ha": r["predicted"]} for r in rows])
    if task_name == "spring_water_difference":
        result.pop("negative_predictions")  # Signed water differences are valid.
    return result


def summarize(rows: list[dict], task_name: str, task: dict, protocol: dict) -> dict:
    tolerance = protocol["decision_zero_tolerance"]
    per_year = {str(year): scores([r for r in rows if r["year"] == year], task_name, tolerance) for year in protocol["years"]}
    result = {"unit": task["unit"], "pooled": scores(rows, task_name, tolerance), "per_year": per_year,
        "macro_year_mae": statistics.fmean(v["mae"] for v in per_year.values()),
        "per_treatment": {str(t): scores([r for r in rows if r["treatment"] == t], task_name, tolerance) for t in sorted({r["treatment"] for r in rows})}}
    if task["paired"]:
        balanced = {}
        for year in protocol["years"]:
            groups = defaultdict(list)
            for row in rows:
                if row["year"] == year:
                    groups[row["control_id"]].append(abs(row["predicted"] - row["observed"]))
            balanced[str(year)] = statistics.fmean(statistics.fmean(v) for v in groups.values())
        result.update({"control_balanced_year_mae": balanced, "macro_control_balanced_mae": statistics.fmean(balanced.values()), "unique_controls": len({r["control_id"] for r in rows})})
    if task_name == "yield_difference":
        ranks = {}
        for year in protocol["years"]:
            subset = [r for r in rows if r["year"] == year]
            labels = [r["observed"] > tolerance for r in subset]
            ranks[str(year)] = {"n": len(labels), "benefits": sum(labels), "prevalence": sum(labels) / len(labels),
                "average_precision": float(average_precision_score(labels, [r["predicted"] for r in subset])) if 0 < sum(labels) < len(labels) else None}
        result.update({"year_ranking": ranks, "macro_year_opportunity_loss_t_ha": statistics.fmean(v["observed_pair_opportunity_loss_t_ha"] for v in per_year.values())})
    return result


def evaluate(cohorts: dict, memberships: list[dict], source_rows: list[dict], protocol: dict) -> tuple[dict, list[dict], dict]:
    predictions, lookup, metadata, results = [], {}, {}, {}
    for task_name in protocol["task_order"]:
        task = protocol["tasks"][task_name]
        rows = cohorts[task["cohort"]]
        folds = task_folds(rows, memberships, task, protocol["years"], source_rows)
        results[task_name] = {}
        for method, config in task["methods"].items():
            metadata_key = f"{task_name}/{method}"
            metadata[metadata_key] = {}
            selected = []
            for year, (train, test) in folds.items():
                if config["kind"] == "subtract":
                    yhat = [subtract_prediction(r, config, lookup, year) for r in test]
                    fitted = {**config, "new_fit": False, "source_predictions": "same-year out-of-fold only"}
                else:
                    yhat, fitted = fit_predict(train, test, task, config, protocol)
                metadata[metadata_key][str(year)] = fitted
                for row, predicted in zip(test, yhat):
                    item = {"task": task_name, "method": method, "item_id": row[task["id"]], "year": year,
                        "rep": int(row["rep"]), "treatment": int(row["treatment"]), "control_id": row.get("control_id", ""),
                        "unit": task["unit"], "observed": finite(row[task["target"]]), "predicted": finite(predicted)}
                    key = task_name, method, item["item_id"]
                    if key in lookup:
                        raise ValueError("Repeated out-of-fold prediction")
                    lookup[key] = item
                    selected.append(item)
            if len(selected) != len(rows) or {r["item_id"] for r in selected} != {r[task["id"]] for r in rows}:
                raise ValueError("Incomplete prediction cohort")
            predictions.extend(selected)
            results[task_name][method] = summarize(selected, task_name, task, protocol)
    comparisons = {}
    references = {"yield_absolute": ["mean"], "yield_difference": ["zero", "mean_difference"],
        "spring_water": ["persistence", "mean_spring", "mean_change"], "spring_water_difference": ["zero", "initial_difference", "mean_change"]}
    for task_name, methods in results.items():
        comparisons[task_name] = {}
        for method, summary in methods.items():
            comparisons[task_name][method] = {}
            for reference in references[task_name]:
                changes = {str(y): summary["per_year"][str(y)]["mae"] - methods[reference]["per_year"][str(y)]["mae"] for y in protocol["years"]}
                comparisons[task_name][method][reference] = {"macro_mae_change": summary["macro_year_mae"] - methods[reference]["macro_year_mae"],
                    "per_year_mae_changes": changes, "years_improved": sum(v < 0 for v in changes.values()), "descriptive_year_change_sd": statistics.stdev(changes.values())}
    return {"tasks": results, "versus_baselines": comparisons, "farmer_ready": False, "model_promoted": False,
        "exposure": protocol["exposure"], "validation": protocol["validation"]}, predictions, metadata


def run_experiment() -> dict:
    from mlflow.tracking import MlflowClient

    protocol_hash = prep.digest(PROTOCOL)
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    prep.verify_sources({"source_sha256": protocol["pinned_sha256"]})
    snapshot = mandan.build_snapshot()
    for name, value in snapshot.items():
        if (mandan.OUTPUT / name).read_bytes() != value:
            raise ValueError("Mandan prepared snapshot failed replay")
    cohorts = {t["cohort"]: prep.read_csv(mandan.OUTPUT / (t["cohort"] + ".csv")) for t in protocol["tasks"].values()}
    provenance = {"git": base.git_context(), "python": platform.python_version(),
        "packages": {n: importlib.metadata.version(n) for n in ("scikit-learn", "numpy", "scipy", "mlflow-skinny")},
        "protocol_sha256": protocol_hash, "evaluation_code_sha256": prep.digest(Path(__file__)),
        "pinned_sha256": protocol["pinned_sha256"], "prepared_sha256": {n: prep.digest(mandan.OUTPUT / n) for n in snapshot},
        "seed": protocol["seed"], "all_data_refit": False, "serving_selection_changed": False}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = OUTPUT / "runs" / stamp
    output.mkdir(parents=True)
    (output / "protocol.json").write_bytes(PROTOCOL.read_bytes())
    (output / "provenance.json").write_bytes(prep.json_bytes(provenance))
    result, predictions, metadata = evaluate(cohorts, prep.read_csv(mandan.OUTPUT / "fold_memberships.csv"), prep.read_csv(mandan.OUTPUT / "observations.csv"), protocol)
    prep.verify_sources({"source_sha256": protocol["pinned_sha256"]})
    # Rebuild also checks the original raw measurements/evidence after fitting.
    if mandan.build_snapshot() != snapshot or prep.digest(PROTOCOL) != protocol_hash or any(prep.digest(mandan.OUTPUT / n) != v for n, v in provenance["prepared_sha256"].items()):
        raise ValueError("Mandan inputs/protocol changed during fitting")
    (output / "results.json").write_bytes(prep.json_bytes(result))
    (output / "oof_predictions.csv").write_bytes(prep.csv_bytes(predictions))
    (output / "fold_metadata.json").write_bytes(prep.json_bytes(metadata))
    tracking = OUTPUT / "tracking"
    tracking.mkdir(parents=True, exist_ok=True)
    client = MlflowClient(tracking_uri="sqlite:///" + (tracking / "mlflow.db").resolve().as_posix())
    name = "mandan-components-v1"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    run_ids = {}
    for task_name, methods in result["tasks"].items():
        task = protocol["tasks"][task_name]
        for method, summary in methods.items():
            identity = f"{task_name}/{method}"
            run_id = client.create_run(experiment_id, tags={"mlflow.runName": f"{identity}/{stamp}", "exploratory": "true", "farmer_ready": "false"}).info.run_id
            run_ids[identity] = run_id
            try:
                config = task["methods"][method]
                for key, value in {"task": task_name, "method": method, "unit": task["unit"], "cohort": task["cohort"],
                    "configuration": config, "estimator": protocol["estimator"] if config["kind"] == "ridge" else config["kind"],
                    "protocol_sha256": protocol_hash, "seed": protocol["seed"], "git_commit": provenance["git"]["commit"]}.items():
                    client.log_param(run_id, key, json.dumps(value) if isinstance(value, (dict, list)) else value)
                client.log_metric(run_id, "macro_year_mae", summary["macro_year_mae"])
                if "macro_control_balanced_mae" in summary:
                    client.log_metric(run_id, "macro_control_balanced_mae", summary["macro_control_balanced_mae"])
                for key, value in summary["pooled"].items():
                    if value is not None:
                        client.log_metric(run_id, "pooled_" + key, value)
                for year, metrics in summary["per_year"].items():
                    for key, value in metrics.items():
                        if value is not None:
                            client.log_metric(run_id, year + "_" + key, value)
                for artifact in output.iterdir():
                    client.log_artifact(run_id, str(artifact))
                client.set_terminated(run_id, "FINISHED")
            except Exception:
                client.set_terminated(run_id, "FAILED")
                raise
    (output / "tracking_runs.json").write_bytes(prep.json_bytes(run_ids))
    (OUTPUT / "latest.json").write_bytes(prep.json_bytes({"run_directory": str(output.resolve()), "tracking_runs": run_ids}))
    print(f"Saved {output}")
    for task_name, methods in result["tasks"].items():
        for method, summary in methods.items():
            print(f"{task_name}/{method}: macro MAE={summary['macro_year_mae']:.6f}; pooled MAE={summary['pooled']['mae']:.6f} {summary['unit']}")
    return result


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    run_experiment()
