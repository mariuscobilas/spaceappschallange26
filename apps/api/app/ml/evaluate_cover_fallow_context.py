"""Fixed context/biomass Ridge ablation on the existing 68 matched comparisons."""

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
from openpyxl import load_workbook
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import average_precision_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import evaluate_cover_fallow as contrast
import prepare_water_yield as prep

PROTOCOL = Path(__file__).with_name("cover_fallow_context_protocol_v1.json")
OUTPUT = prep.ROOT / "data/experiments/cover_fallow_context_v1"


def read_biomass(path: Path) -> dict:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        values = iter(workbook["Field Data"].iter_rows(values_only=True))
        header = next(values)
        result = {}
        for cells in values:
            row = dict(zip(header, cells))
            if row.get("Plot") is None:
                continue
            for cycle in (1, 2, 3):
                key = f"{row['Plot']}/C{cycle}"
                if key in result:
                    raise ValueError("Duplicate biomass plot-cycle")
                value = row[f"C{cycle}.CCBiomass"]
                result[key] = float(value) if isinstance(value, (float, int)) and not isinstance(value, bool) else None
        return result
    finally:
        workbook.close()


def attach_growth(pairs: list[dict], biomass: dict) -> list[dict]:
    result = []
    for pair in pairs:
        value = biomass.get(pair["pair_id"])
        rain = float(pair["season_rain_mm"])
        if value is None or not math.isfinite(value) or value < 0 or not math.isfinite(rain) or rain < 0:
            raise ValueError("Missing or invalid measured biomass/rain; no imputation")
        product = value * rain
        if not math.isfinite(product):
            raise ValueError("Nonfinite biomass-rain interaction")
        result.append({**pair, "cover_biomass_kg_ha": value, "biomass_rain_kg_mm_ha": product})
    return result


def matrix(rows: list[dict], numeric: list[str], categorical: list[str]) -> np.ndarray:
    result = []
    for row in rows:
        nums = [float(row[f]) for f in numeric]
        cats = [row[f] for f in categorical]
        if not all(math.isfinite(v) for v in nums) or not all(isinstance(v, str) and v for v in cats):
            raise ValueError("Invalid context feature; no imputation")
        result.append([*nums, *cats])
    if not result:
        raise ValueError("Empty context cohort")
    return np.asarray(result, dtype=object)


def fit_predict(train: list[dict], evaluation: list[dict], numeric: list[str], protocol: dict) -> tuple[list[float], dict]:
    categorical = protocol["categorical_features"]
    x = matrix(train, numeric, categorical)
    test_x = matrix(evaluation, numeric, categorical)
    y = np.asarray([float(r[protocol["target"]]) for r in train])
    if not np.isfinite(y).all():
        raise ValueError("Nonfinite training target")
    n = len(numeric)
    transform = ColumnTransformer([
        ("numeric", StandardScaler(with_mean=True, with_std=True), list(range(n))),
        ("categorical", OneHotEncoder(drop=None, handle_unknown="ignore", sparse_output=False), list(range(n, n + len(categorical))))], remainder="drop")
    pipeline = Pipeline([("features", transform), ("ridge", Ridge(**protocol["estimator"]))])
    pipeline.fit(x, y)
    prediction = pipeline.predict(test_x)
    if not np.isfinite(prediction).all():
        raise ValueError("Nonfinite context predictions")
    scaler = transform.named_transformers_["numeric"]
    encoder = transform.named_transformers_["categorical"]
    ridge = pipeline.named_steps["ridge"]
    return prediction.tolist(), {"training_pairs": len(train), "training_control_n": len({r["control_id"] for r in train}),
        "numeric_features": numeric, "numeric_mean": scaler.mean_.tolist(), "numeric_scale": scaler.scale_.tolist(),
        "categorical_features": categorical, "training_categories": {f: v.tolist() for f, v in zip(categorical, encoder.categories_)},
        "evaluation_unknown_category_rows": sum(any(row[f] not in values for f, values in zip(categorical, encoder.categories_)) for row in evaluation),
        "transformed_features": [*numeric, *encoder.get_feature_names_out(categorical).tolist()],
        "coefficients": ridge.coef_.tolist(), "intercept": float(ridge.intercept_),
        "estimator_parameters": ridge.get_params(), "prediction_clipping": False}


def reference_rows(rows: list[dict], pairs: list[dict], methods: list[str]) -> list[dict]:
    index = {r["pair_id"]: r for r in pairs}
    selected, seen = [], set()
    for raw in rows:
        if raw["method"] not in methods:
            continue
        key = raw["method"], raw["pair_id"]
        if key in seen or raw["pair_id"] not in index:
            raise ValueError("Duplicate or unknown frozen reference")
        seen.add(key)
        pair = index[raw["pair_id"]]
        if any(raw[f] != pair[f] for f in ("control_id", "season_id", "trial", "tillage", "planting_window", "cover_mix")):
            raise ValueError("Frozen reference identity differs")
        actual, predicted = float(raw["observed_delta_yield_t_ha"]), float(raw["predicted_delta_yield_t_ha"])
        if not math.isclose(actual, pair["delta_yield_t_ha"], rel_tol=0, abs_tol=1e-12) or not math.isfinite(predicted):
            raise ValueError("Frozen reference outcome differs")
        selected.append({**raw, "observed_delta_yield_t_ha": actual, "predicted_delta_yield_t_ha": predicted})
    if seen != {(m, identity) for m in methods for identity in index}:
        raise ValueError("Incomplete frozen references")
    return selected


def rank_scores(rows: list[dict], tolerance: float) -> dict:
    y = [r["observed_delta_yield_t_ha"] > tolerance for r in rows]
    return {"n": len(rows), "benefits": sum(y), "prevalence": sum(y) / len(y),
        "average_precision": float(average_precision_score(y, [r["predicted_delta_yield_t_ha"] for r in rows])) if 0 < sum(y) < len(y) else None}


def evaluate(pairs: list[dict], memberships: list[dict], references: list[dict], protocol: dict,
             source_protocol: dict, old_results: dict) -> tuple[dict, list[dict], dict]:
    seasons = source_protocol["folds"]
    folds = contrast.validate_folds(pairs, memberships, seasons)
    predictions = reference_rows(references, pairs, protocol["reference_methods"])
    tolerance = 1e-12
    for method in protocol["reference_methods"]:
        replay = contrast.summarize([r for r in predictions if r["method"] == method], seasons, tolerance)
        if prep.json_bytes(replay) != prep.json_bytes(old_results["methods"][method]):
            raise ValueError("Frozen reference metrics failed exact replay")
    metadata = {}
    for family, numeric in protocol["numeric_features"].items():
        metadata[family] = {}
        for season, (train, test) in folds.items():
            yhat, fitted = fit_predict(train, test, numeric, protocol)
            metadata[family][season] = fitted
            for pair, predicted in zip(test, yhat):
                predictions.append({"method": family, **{k: pair[k] for k in ("pair_id", "control_id", "season_id", "trial", "tillage", "planting_window", "cover_mix")},
                    "observed_delta_yield_t_ha": pair[protocol["target"]], "predicted_delta_yield_t_ha": predicted})
    results = {}
    for method in (*protocol["reference_methods"], *protocol["numeric_features"]):
        selected = [r for r in predictions if r["method"] == method]
        if len(selected) != len(pairs) or {r["pair_id"] for r in selected} != {r["pair_id"] for r in pairs}:
            raise ValueError("Incomplete/repeated context predictions")
        results[method] = {**contrast.summarize(selected, seasons, tolerance),
            "ranking": {"pooled_descriptive": rank_scores(selected, tolerance),
                "per_season": {s: rank_scores([r for r in selected if r["season_id"] == s], tolerance) for s in seasons}}}
    changes = {}
    for reference in ("context", *protocol["reference_methods"]):
        differences = {s: results["context_biomass"]["per_season"][s]["mae"] - results[reference]["per_season"][s]["mae"] for s in seasons}
        changes[reference] = {"macro_mae_change": results["context_biomass"]["macro_season_mae"] - results[reference]["macro_season_mae"],
            "per_season_mae_changes": differences, "seasons_improved": sum(v < 0 for v in differences.values()),
            "season_change_sample_sd": statistics.stdev(differences.values())}
    return {"methods": results, "context_biomass_minus_reference": changes, "pairs": len(pairs),
        "unique_controls": len({r["control_id"] for r in pairs}), "references_replayed": True,
        "farmer_ready": False, "model_promoted": False, "exposure": protocol["exposure"]}, predictions, metadata


def run_experiment() -> dict:
    import mlflow
    from mlflow.tracking import MlflowClient

    protocol_hash = prep.digest(PROTOCOL)
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    old_protocol = json.loads(contrast.PROTOCOL.read_text(encoding="utf-8"))
    for p in (protocol, old_protocol):
        contrast.models.verify_pins(p)
    snapshot = prep.build_snapshot()
    for name, value in snapshot.items():
        if (prep.OUTPUT / name).read_bytes() != value:
            raise ValueError("Prepared source failed replay")
    source = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
    pairs = contrast.build_pairs(prep.read_csv(prep.OUTPUT / "observations.csv"), prep.read_csv(prep.OUTPUT / "paired_observations.csv"),
        [f["feature"] for f in source["weather_features"]], old_protocol)
    reference = prep.ROOT / protocol["reference_directory"]
    if prep.csv_bytes(pairs) != (reference / "paired_features.csv").read_bytes():
        raise ValueError("Pair feature identities/values changed")
    workbook = prep.ROOT / "data/dryad_eash_2025/Cover_Crop_Trials_Data.xlsx"
    pairs = attach_growth(pairs, read_biomass(workbook))
    provenance = {"git": contrast.base.git_context(), "python": platform.python_version(),
        "packages": {n: importlib.metadata.version(n) for n in ("scikit-learn", "numpy", "scipy", "openpyxl", "mlflow-skinny")},
        "protocol_sha256": protocol_hash, "evaluation_code_sha256": prep.digest(Path(__file__)),
        "pinned_sha256": protocol["pinned_sha256"], "source_sha256": source["source_sha256"],
        "prepared_sha256": {name: prep.digest(prep.OUTPUT / name) for name in snapshot},
        "all_data_refit": False, "serving_selection_changed": False, "seed": protocol["seed"]}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = OUTPUT / "runs" / stamp
    output.mkdir(parents=True)
    (output / "protocol.json").write_bytes(PROTOCOL.read_bytes())
    (output / "provenance.json").write_bytes(prep.json_bytes(provenance))
    (output / "paired_features.csv").write_bytes(prep.csv_bytes(pairs))
    result, predictions, metadata = evaluate(pairs, prep.read_csv(prep.OUTPUT / "fold_memberships.csv"),
        prep.read_csv(reference / "oof_predictions.csv"), protocol, source, json.loads((reference / "results.json").read_text(encoding="utf-8")))
    for p in (protocol, old_protocol):
        contrast.models.verify_pins(p)
    prep.verify_sources(source)
    if prep.digest(PROTOCOL) != protocol_hash or any(prep.digest(prep.OUTPUT / n) != v for n, v in provenance["prepared_sha256"].items()):
        raise ValueError("Protocol/prepared data changed during fitting")
    for name, value in (("results.json", prep.json_bytes(result)), ("oof_predictions.csv", prep.csv_bytes(predictions)), ("fold_metadata.json", prep.json_bytes(metadata))):
        (output / name).write_bytes(value)
    tracking = OUTPUT / "tracking"
    tracking.mkdir(parents=True, exist_ok=True)
    client = MlflowClient(tracking_uri="sqlite:///" + (tracking / "mlflow.db").resolve().as_posix())
    name = "cover-fallow-context-v1"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    run_ids = {}
    for method, summary in result["methods"].items():
        run_id = client.create_run(experiment_id, tags={"mlflow.runName": f"{method}/{stamp}", "farmer_ready": "false", "exploratory": "true"}).info.run_id
        run_ids[method] = run_id
        try:
            is_new_fit = method in protocol["numeric_features"]
            for key, value in {"method": method, "protocol_sha256": protocol_hash,
                "estimator": protocol["estimator"] if is_new_fit else {"source": "frozen_reference", "method": method},
                "numeric_features": protocol["numeric_features"].get(method, "frozen_reference"),
                "categorical_features": protocol["categorical_features"] if is_new_fit else "frozen_reference",
                "seed": protocol["seed"], "git_commit": provenance["git"]["commit"]}.items():
                client.log_param(run_id, key, json.dumps(value) if isinstance(value, (dict, list)) else value)
            for key in ("macro_season_mae", "macro_control_balanced_mae", "macro_season_opportunity_loss_t_ha"):
                client.log_metric(run_id, key, summary[key])
            for key, value in summary["pooled"].items():
                if value is not None:
                    client.log_metric(run_id, "pooled_" + key, value)
            for season, scores in summary["per_season"].items():
                for key, value in scores.items():
                    if value is not None:
                        client.log_metric(run_id, season + "_" + key, value)
                ap = summary["ranking"]["per_season"][season]["average_precision"]
                if ap is not None:
                    client.log_metric(run_id, season + "_average_precision", ap)
            for artifact in output.iterdir():
                client.log_artifact(run_id, str(artifact))
            client.set_terminated(run_id, "FINISHED")
        except Exception:
            client.set_terminated(run_id, "FAILED")
            raise
    (output / "tracking_runs.json").write_bytes(prep.json_bytes(run_ids))
    (OUTPUT / "latest.json").write_bytes(prep.json_bytes({"run_directory": str(output.resolve()), "tracking_runs": run_ids}))
    print(f"Saved {output}")
    for method, summary in result["methods"].items():
        p = summary["pooled"]
        print(f"{method}: macro MAE={summary['macro_season_mae']:.6f}; benefit found={p['true_cover_benefit_n']}/{p['observed_benefit_n']}; false cover={p['false_cover_harm_n']}/{p['observed_harm_n']}; balanced accuracy={p['balanced_accuracy']}")
    return result


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    run_experiment()
