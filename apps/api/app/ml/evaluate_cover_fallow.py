"""Whole-season matched cover-minus-fallow yield experiment. Research only."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import platform
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import compare_water_yield_models as models
import evaluate_water_yield as base
import prepare_water_yield as prep

PROTOCOL = Path(__file__).with_name("cover_fallow_protocol_v1.json")
OUTPUT = prep.ROOT / "data/experiments/cover_fallow_v1"


def build_pairs(observations: list[dict], pairs: list[dict], weather_features: list[str], protocol: dict) -> list[dict]:
    index = {r["observation_id"]: r for r in observations}
    if len(index) != len(observations):
        raise ValueError("Duplicate source observation")
    result, seen, control_seasons = [], set(), {}
    for pair in pairs:
        identity, control_id = pair["pair_id"], pair["control_id"]
        if identity in seen or identity == control_id:
            raise ValueError("Duplicate or self-matched pair")
        seen.add(identity)
        cover, control = index[identity], index[control_id]
        if cover["cover_mix"] == "Fallow" or control["cover_mix"] != "Fallow":
            raise ValueError("Invalid cover/control treatment")
        for name in ("trial", "block", "tillage", "cycle", "season_id"):
            if str(cover[name]) != str(control[name]) or str(pair[name]) != str(cover[name]):
                raise ValueError(f"Mismatched pair {name}")
        if control_id in control_seasons and control_seasons[control_id] != pair["season_id"]:
            raise ValueError("Shared control spans seasons")
        control_seasons[control_id] = pair["season_id"]
        for name in (*weather_features, "wheat_sowing_date", "wheat_harvest_date"):
            if cover[name] != control[name]:
                raise ValueError("Pair does not share crop weather/calendar")
        values = {}
        for field, short in (("profile_water_at_wheat_sowing_mm", "profile_water_mm"), ("wheat_yield_t_ha", "yield_t_ha")):
            arm, fallow = float(cover[field]), float(control[field])
            delta = arm - fallow
            if not all(math.isfinite(v) and v >= 0 for v in (arm, fallow)):
                raise ValueError("Invalid observed arm value")
            for name, value in ((field, arm), (field + "_fallow", fallow), ("cover_minus_fallow_" + field, delta)):
                if not math.isclose(float(pair[name]), value, rel_tol=0, abs_tol=1e-9):
                    raise ValueError("Pair arithmetic differs from source observations")
            values.update({"cover_" + short: arm, "fallow_" + short: fallow, "delta_" + short: delta})
        result.append({"pair_id": identity, "control_id": control_id,
            **{k: pair[k] for k in ("season_id", "trial", "block", "tillage", "cycle", "planting_window", "cover_mix")},
            **values, **{f: float(cover[f]) for f in weather_features}})
    if ({"pairs": len(result), "unique_controls": len(control_seasons)} != protocol["expected_counts"]
            or dict(Counter(r["season_id"] for r in result)) != protocol["expected_season_pairs"]):
        raise ValueError("Matched cohort differs from frozen counts")
    return sorted(result, key=lambda r: r["pair_id"])


def validate_folds(pairs: list[dict], memberships: list[dict], seasons: list[str]) -> dict:
    index = {r["pair_id"]: r for r in pairs}
    prepared = {}
    for season in seasons:
        fold = [r for r in memberships if r["cohort"] == "paired" and r["held_out_season"] == season]
        main = {r["item_id"]: r["role"] for r in memberships if r["cohort"] == "main" and r["held_out_season"] == season}
        if len(fold) != len(index) or {r["item_id"] for r in fold} != set(index):
            raise ValueError("Paired fold membership differs")
        roles = {}
        for item in fold:
            pair = index[item["item_id"]]
            role = item["role"]
            expected = "evaluation" if pair["season_id"] == season else "train"
            if role != expected or any(main.get(identity) != role for identity in (pair["pair_id"], pair["control_id"])):
                raise ValueError("Season/shared-control leakage in fold")
            for identity in (pair["pair_id"], pair["control_id"]):
                if identity in roles and roles[identity] != role:
                    raise ValueError("Shared control has inconsistent roles")
                roles[identity] = role
        train = [index[r["item_id"]] for r in fold if r["role"] == "train"]
        test = [index[r["item_id"]] for r in fold if r["role"] == "evaluation"]
        if not train or not test:
            raise ValueError("Empty contrast fold")
        prepared[season] = train, test
    return prepared


def absolute_index(predictions: list[dict], observations: list[dict], model_names: list[str]) -> dict:
    source = {r["observation_id"]: r for r in observations}
    selected = {}
    for row in predictions:
        if row["cohort"] != "main" or row["feature_family"] != "water_weather" or row["model"] not in model_names:
            continue
        key = row["model"], row["observation_id"]
        if key in selected:
            raise ValueError("Duplicate absolute OOF prediction")
        original = source[row["observation_id"]]
        if (row["season_id"] != original["season_id"]
                or not math.isclose(float(row["observed_yield_t_ha"]), float(original["wheat_yield_t_ha"]), abs_tol=1e-12, rel_tol=0)
                or not math.isfinite(float(row["predicted_yield_t_ha"]))):
            raise ValueError("Absolute OOF source/season mismatch")
        selected[key] = float(row["predicted_yield_t_ha"])
    if set(selected) != {(m, identity) for m in model_names for identity in source}:
        raise ValueError("Incomplete absolute OOF reference")
    return selected


def scores(rows: list[dict], tolerance: float) -> dict:
    actual = [float(r["observed_delta_yield_t_ha"]) for r in rows]
    predicted = [float(r["predicted_delta_yield_t_ha"]) for r in rows]
    regression = base.metrics([{"observed_yield_t_ha": a, "predicted_yield_t_ha": p} for a, p in zip(actual, predicted)])
    # Negative differences are valid outcomes, unlike negative absolute grain yields.
    regression.pop("negative_predictions")
    benefit = [i for i, a in enumerate(actual) if a > tolerance]
    harm = [i for i, a in enumerate(actual) if a < -tolerance]
    choose_cover = [p > tolerance for p in predicted]
    tp = sum(choose_cover[i] for i in benefit)
    tn = sum(not choose_cover[i] for i in harm)
    benefit_recall = tp / len(benefit) if benefit else None
    harm_recall = tn / len(harm) if harm else None
    loss = [max(-a, 0) if cover else max(a, 0) for a, cover in zip(actual, choose_cover)]
    return {**regression, "observed_benefit_n": len(benefit), "observed_harm_n": len(harm),
        "observed_tie_n": len(rows) - len(benefit) - len(harm),
        "benefit_recall": benefit_recall, "harm_recall": harm_recall,
        "balanced_accuracy": (benefit_recall + harm_recall) / 2 if benefit and harm else None,
        "decision_accuracy_nonzero": (tp + tn) / (len(benefit) + len(harm)) if benefit or harm else None,
        "true_cover_benefit_n": tp, "false_cover_harm_n": len(harm) - tn,
        "missed_cover_benefit_n": len(benefit) - tp, "correct_fallow_harm_n": tn,
        "predicted_cover_n": sum(choose_cover), "predicted_cover_fraction": statistics.fmean(choose_cover),
        "observed_pair_opportunity_loss_t_ha": statistics.fmean(loss),
        "errors_exceed_observed_absolute_difference_n": sum(abs(p - a) > abs(a) for p, a in zip(predicted, actual))}


def summarize(rows: list[dict], seasons: list[str], tolerance: float) -> dict:
    per_season = {s: scores([r for r in rows if r["season_id"] == s], tolerance) for s in seasons}
    control_balanced = {}
    for season in seasons:
        groups = defaultdict(list)
        for r in rows:
            if r["season_id"] == season:
                groups[r["control_id"]].append(abs(r["predicted_delta_yield_t_ha"] - r["observed_delta_yield_t_ha"]))
        control_balanced[season] = statistics.fmean(statistics.fmean(v) for v in groups.values())
    slices = {field: {value: scores([r for r in rows if r[field] == value], tolerance)
        for value in sorted({r[field] for r in rows})} for field in ("trial", "tillage", "planting_window", "cover_mix")}
    return {"pooled": scores(rows, tolerance), "per_season": per_season, "per_management": slices,
        "macro_season_mae": statistics.fmean(v["mae"] for v in per_season.values()),
        "macro_season_opportunity_loss_t_ha": statistics.fmean(v["observed_pair_opportunity_loss_t_ha"] for v in per_season.values()),
        "macro_control_balanced_mae": statistics.fmean(control_balanced.values()), "control_balanced_season_mae": control_balanced}


def evaluate(pairs: list[dict], memberships: list[dict], absolute: dict, protocol: dict,
             source_protocol: dict, tree_protocol: dict) -> tuple[dict, list[dict], dict]:
    seasons = source_protocol["folds"]
    folds = validate_folds(pairs, memberships, seasons)
    predictions, metadata = [], {}

    def append(method: str, pair: dict, predicted: float) -> None:
        if not math.isfinite(predicted):
            raise ValueError("Nonfinite contrast prediction")
        predictions.append({"method": method, **{k: pair[k] for k in ("pair_id", "control_id", "season_id", "trial", "tillage", "planting_window", "cover_mix")},
            "observed_delta_yield_t_ha": pair[protocol["target"]], "predicted_delta_yield_t_ha": predicted})

    for season, (train, test) in folds.items():
        mean = statistics.fmean(r[protocol["target"]] for r in train)
        for method, value in (("zero_difference", 0.0), ("training_mean_difference", mean)):
            metadata.setdefault(method, {})[season] = {"training_pairs": len(train), "predicted_difference": value}
            for pair in test:
                append(method, pair, value)
        for family, features in protocol["feature_families"].items():
            for model in protocol["models"]:
                if model == "ridge":
                    yhat, fitted = base.fit_predict(train, test, features, {**source_protocol, "target": protocol["target"]})
                else:
                    yhat, fitted = models.fit_tree(train, test, features, protocol["target"], model, tree_protocol)
                method = f"direct/{family}/{model}"
                metadata.setdefault(method, {})[season] = {**fitted, "training_control_n": len({r["control_id"] for r in train})}
                for pair, predicted in zip(test, yhat):
                    append(method, pair, predicted)
        for model in protocol["models"]:
            for pair in test:
                append(f"subtract_absolute/{model}", pair, absolute[(model, pair["pair_id"])] - absolute[(model, pair["control_id"])])
    methods = sorted({r["method"] for r in predictions})
    result = {}
    for method in methods:
        selected = [r for r in predictions if r["method"] == method]
        if len(selected) != len(pairs) or {r["pair_id"] for r in selected} != {r["pair_id"] for r in pairs}:
            raise ValueError("Incomplete/repeated contrast OOF predictions")
        result[method] = summarize(selected, seasons, protocol["numerical_zero_tolerance"])
    changes = {}
    for method, summary in result.items():
        changes[method] = {}
        for reference in protocol["baselines"]:
            differences = {s: summary["per_season"][s]["mae"] - result[reference]["per_season"][s]["mae"] for s in seasons}
            changes[method][reference] = {"macro_mae_change": summary["macro_season_mae"] - result[reference]["macro_season_mae"],
                "per_season_mae_changes": differences, "seasons_improved": sum(v < 0 for v in differences.values()),
                "season_change_sample_sd": statistics.stdev(differences.values())}
    actual = [r[protocol["target"]] for r in pairs]
    return {"methods": result, "versus_baselines": changes,
        "cohort": {"pairs": len(pairs), "unique_controls": len({r["control_id"] for r in pairs}),
            "season_pairs": dict(Counter(r["season_id"] for r in pairs)),
            "mean_observed_delta_t_ha": statistics.fmean(actual), "median_absolute_observed_delta_t_ha": statistics.median(abs(a) for a in actual)},
        "farmer_ready": False, "model_promoted": False, "exposure": protocol["exposure"], "uncertainty": protocol["uncertainty"]}, predictions, metadata


def run_experiment() -> dict:
    import mlflow
    from mlflow.tracking import MlflowClient

    protocol_hash = prep.digest(PROTOCOL)
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    models.verify_pins(protocol)
    expected = prep.build_snapshot()
    for name, value in expected.items():
        if (prep.OUTPUT / name).read_bytes() != value:
            raise ValueError(f"Prepared source failed replay: {name}")
    source = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
    trees = json.loads(models.PROTOCOL.read_text(encoding="utf-8"))
    observations = prep.read_csv(prep.OUTPUT / "observations.csv")
    pairs = build_pairs(observations, prep.read_csv(prep.OUTPUT / "paired_observations.csv"),
        [f["feature"] for f in source["weather_features"]], protocol)
    absolute = absolute_index(prep.read_csv(prep.ROOT / protocol["absolute_predictions_path"]), observations, protocol["models"])
    provenance = {"git": base.git_context(), "python": platform.python_version(),
        "packages": {**{n: importlib.metadata.version(n) for n in ("scikit-learn", "numpy", "scipy")}, "mlflow_module": mlflow.__version__},
        "protocol_sha256": protocol_hash, "evaluation_code_sha256": prep.digest(Path(__file__)),
        "pinned_sha256": protocol["pinned_sha256"], "source_sha256": source["source_sha256"],
        "prepared_sha256": {name: prep.digest(prep.OUTPUT / name) for name in expected},
        "seed": protocol["seed"], "all_data_refit": False, "serving_selection_changed": False}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = OUTPUT / "runs" / stamp
    output.mkdir(parents=True)
    (output / "protocol.json").write_bytes(PROTOCOL.read_bytes())
    (output / "provenance.json").write_bytes(prep.json_bytes(provenance))
    (output / "paired_features.csv").write_bytes(prep.csv_bytes(pairs))
    result, predictions, metadata = evaluate(pairs, prep.read_csv(prep.OUTPUT / "fold_memberships.csv"), absolute, protocol, source, trees)
    models.verify_pins(protocol)
    prep.verify_sources(source)
    if prep.digest(PROTOCOL) != protocol_hash:
        raise ValueError("Contrast protocol changed during fitting")
    for name, checksum in provenance["prepared_sha256"].items():
        if prep.digest(prep.OUTPUT / name) != checksum:
            raise ValueError("Prepared input changed during fitting")
    (output / "results.json").write_bytes(prep.json_bytes(result))
    (output / "oof_predictions.csv").write_bytes(prep.csv_bytes(predictions))
    (output / "fold_metadata.json").write_bytes(prep.json_bytes(metadata))
    tracking = OUTPUT / "tracking"
    tracking.mkdir(parents=True, exist_ok=True)
    client = MlflowClient(tracking_uri="sqlite:///" + (tracking / "mlflow.db").resolve().as_posix())
    name = "cover-fallow-v1"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    run_ids = {}
    for method, summary in result["methods"].items():
        run = client.create_run(experiment_id, tags={"mlflow.runName": f"{method}/{stamp}", "farmer_ready": "false", "exploratory": "true"})
        run_id = run.info.run_id
        run_ids[method] = run_id
        try:
            for key, value in {"method": method, "protocol_sha256": protocol_hash, "seed": protocol["seed"],
                "git_commit": provenance["git"]["commit"], "pairs": len(pairs), "unique_controls": result["cohort"]["unique_controls"]}.items():
                client.log_param(run_id, key, value)
            for key in ("macro_season_mae", "macro_control_balanced_mae", "macro_season_opportunity_loss_t_ha"):
                client.log_metric(run_id, key, summary[key])
            for key, value in summary["pooled"].items():
                if value is not None:
                    client.log_metric(run_id, "pooled_" + key, value)
            for season, season_scores in summary["per_season"].items():
                for key, value in season_scores.items():
                    if value is not None:
                        client.log_metric(run_id, season + "_" + key, value)
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
        pooled = summary["pooled"]
        print(f"{method}: macro MAE={summary['macro_season_mae']:.6f}; pooled MAE={pooled['mae']:.6f}; balanced accuracy={pooled['balanced_accuracy']}; cover chosen={pooled['predicted_cover_n']}/{len(pairs)}")
    return result


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    run_experiment()
