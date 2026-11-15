"""Materialize audited split variants and evaluate the same fixed forest against persistence."""

from __future__ import annotations

import argparse
import csv
import importlib.metadata
import json
import math
import statistics
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np

import audit_clovis_splits as audit
import clovis_baselines as base
import clovis_regression as regression
import clovis_scenarios as scenarios
import diagnose_clovis as diagnosis
import evaluate_clovis_final_test as final
import prepare_clovis as prep
import prepare_clovis_weather as weather

PROTOCOL_PATH = Path(__file__).with_name("clovis_split_evaluation_protocol.json")
DATASET = prep.ROOT / "data/processed/clovis_split_features_v2"
EXPERIMENTS = prep.ROOT / "data/experiments/clovis_split_evaluation_v2"


def load_protocol():
    return json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def materialize_rows(pairs, memberships, history):
    pair_lookup = {(r["date"], r["treatment"]): r for r in pairs}
    history_lookup = {r["date"]: r for r in history}
    if len(pair_lookup) != len(pairs) or len(history_lookup) != len(history):
        raise ValueError("Duplicate pair/weather identity")
    result = {part: [] for part in audit.PARTITIONS}
    seen = set()
    for member in memberships:
        key = (member["date"], member["treatment"])
        if key in seen or member["partition"] not in result:
            raise ValueError("Duplicate or unsupported membership identity")
        seen.add(key)
        pair = pair_lookup.get(key)
        day_weather = history_lookup.get(member["date"])
        if pair is None or day_weather is None or not day_weather["weather_eligible"]:
            raise ValueError("Membership requires missing pair or weather")
        if (pair["previous_date"] != member["history_start_date"]
                or pair["management_phase"] != member["management_phase"] or int(member["lookback_days"]) != 1):
            raise ValueError("Membership history/phase differs from the daily pair")
        result[member["partition"]].append({**pair, "partition": member["partition"],
            **{key: day_weather[key] for key in scenarios.WEATHER_COLUMNS},
            "weather_source": "NASA_POWER_DAILY", "weather_time_standard": "LST"})
    return {part: sorted(rows, key=lambda r: (r["date"], r["treatment"])) for part, rows in result.items()}


def prepare_datasets(output=DATASET):
    output = output.resolve()
    if output in {prep.OUTPUT.resolve(), weather.OUTPUT.resolve(), audit.OUTPUT.resolve()}:
        raise ValueError("Use a separate versioned dataset directory")
    policy = load_protocol()
    audit_provenance = json.loads((audit.OUTPUT / "provenance.json").read_text(encoding="utf-8"))
    for name, expected in audit_provenance["input_sha256"].items():
        if prep.digest(prep.ROOT / name) != expected:
            raise ValueError(f"Frozen split-audit input changed: {name}")
    source = prep.load_protocol()
    weather.verify_labels(prep.OUTPUT, source)
    observations = prep.normalize(prep.read_daily(prep.DAILY, source), source)
    pairs = audit.pooled_pairs(observations)
    history, weather_info = scenarios.load_history()
    input_paths = [prep.DAILY, prep.PROTOCOL, PROTOCOL_PATH, Path(__file__), audit.PROTOCOL_PATH,
                   audit.OUTPUT / "results.json", audit.OUTPUT / "provenance.json", weather.OUTPUT / "weather_manifest.json"]
    artifacts, variants = {}, {}
    for variant in policy["variants"]:
        folder = audit.OUTPUT / variant
        assignment_path, membership_path = folder / "date_assignments.csv", folder / "eligible_target_membership.csv"
        assignments = {r["date"]: r["partition"] for r in read_csv(assignment_path)}
        coverage, members = audit.assess(observations, assignments, 1, True)
        expected_members = prep.csv_text(members, list(members[0]))
        if membership_path.read_bytes() != expected_members.encode("utf-8"):
            raise ValueError("Split membership differs from its reconstructed source eligibility")
        if variant == "phase_balanced_70_15_15" and not coverage["every_phase_in_every_partition"]:
            raise ValueError("Phase-balanced membership lost category coverage")
        rows = materialize_rows(pairs, members, history)
        for part, values in rows.items():
            artifacts[f"{variant}/{part}_features.csv"] = prep.csv_text(values, weather.JOIN_FIELDS)
        artifacts[f"{variant}/eligible_target_membership.csv"] = expected_members
        artifacts[f"{variant}/date_assignments.csv"] = assignment_path.read_text(encoding="utf-8")
        variants[variant] = {"coverage": coverage,
                             "partition_rows": {part: len(values) for part, values in rows.items()}}
        input_paths.extend([assignment_path, membership_path])
    import hashlib
    manifest = {"dataset_version": policy["dataset_version"], "target_semantics": policy["target_semantics"],
                "feature_columns": regression.FEATURES, "source_sha256": {prep.relative(path): prep.digest(path) for path in input_paths},
                "weather": weather_info, "variants": variants, "fresh_independent_test": False,
                "artifact_sha256": {name: hashlib.sha256(value.encode("utf-8")).hexdigest() for name, value in artifacts.items()}}
    manifest_path = output / "manifest.json"
    if manifest_path.exists() and json.loads(manifest_path.read_text(encoding="utf-8")) != manifest:
        raise ValueError("Versioned split dataset inputs changed; use a new output directory")
    for name, content in artifacts.items():
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.read_bytes() != content.encode("utf-8"):
            raise ValueError("Existing prepared artifact differs; do not overwrite it")
        weather.write_text(path, content)
    weather.write_text(manifest_path, prep.json_text(manifest))
    return manifest


def load_variant(directory, variant):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest["feature_columns"] != regression.FEATURES or variant not in manifest["variants"]:
        raise ValueError("Dataset feature contract or variant differs")
    members_path = f"{variant}/eligible_target_membership.csv"
    if prep.digest(directory / members_path) != manifest["artifact_sha256"][members_path]:
        raise ValueError("Prepared membership hash mismatch")
    members = {(r["date"], r["treatment"]): r for r in read_csv(directory / members_path)}
    result = {}
    source = prep.load_protocol()
    for part in audit.PARTITIONS:
        name = f"{variant}/{part}_features.csv"
        if prep.digest(directory / name) != manifest["artifact_sha256"][name]:
            raise ValueError("Prepared features hash mismatch")
        rows = read_csv(directory / name)
        if len(rows) != manifest["variants"][variant]["partition_rows"][part]:
            raise ValueError("Prepared partition count differs")
        seen = set()
        for row in rows:
            key = (row["date"], row["treatment"])
            member = members.get(key)
            day, previous = date.fromisoformat(row["date"]), date.fromisoformat(row["previous_date"])
            if (key in seen or member is None or member["partition"] != part or row["partition"] != part
                    or member["history_start_date"] != row["previous_date"] or (day - previous).days != 1
                    or row["site_id"] != source["site"]["site_id"] or row["sensor_depth_cm"] != "5"
                    or row["management_phase"] != prep.interval_name(day, source["phases"])):
                raise ValueError("Prepared identity/calendar differs")
            seen.add(key)
            for column in ("previous_moisture_m3_m3", "soil_moisture_m3_m3", "moisture_change_m3_m3",
                           "irrigation_mm", *scenarios.WEATHER_COLUMNS):
                row[column] = float(row[column])
                if not math.isfinite(row[column]):
                    raise ValueError("Nonfinite prepared feature/label")
            if (not 0 <= row["soil_moisture_m3_m3"] <= 1
                    or not math.isclose(row["soil_moisture_m3_m3"] - row["previous_moisture_m3_m3"],
                                        row["moisture_change_m3_m3"], abs_tol=1e-9)):
                raise ValueError("Prepared daily-mean target is inconsistent")
        regression.feature_frame(rows)
        result[part] = rows
    return result


def data_behavior(rows):
    by_date = {r["date"]: r for r in rows}
    phases = defaultdict(list)
    for row in rows:
        phases[row["management_phase"]].append(row)
    return {"rows": len(rows), "dates": len(by_date),
            "daily_moisture": diagnosis.describe([r["soil_moisture_m3_m3"] for r in rows]),
            "daily_change": diagnosis.describe([r["moisture_change_m3_m3"] for r in rows]),
            "mean_absolute_daily_change_persistence_mae": statistics.fmean(abs(r["moisture_change_m3_m3"]) for r in rows),
            "rain_per_distinct_date": diagnosis.describe([r["rain_mm"] for r in by_date.values()]),
            "irrigation_dates": sorted(r["date"] for r in by_date.values() if r["irrigation_mm"] > 0),
            "phase_rows": {key: len(values) for key, values in sorted(phases.items())},
            "phase_change_summary": {key: diagnosis.describe([r["moisture_change_m3_m3"] for r in values]) for key, values in sorted(phases.items())},
            "note": "Training description informs diagnosis; validation/exposed-test summaries interpret fixed-protocol results and are not used for selection."}


def evaluate_variant(model, partitions, policy):
    reference = base.Baseline("persistence", 0.0, {}, {})
    results, predictions = {}, {}
    scaler = model.pipeline["features"].named_transformers_["numeric"]
    scaler_before = scaler.mean_.copy()
    for part, rows in partitions.items():
        metrics, forest_rows = regression.evaluate(model, rows)
        ref_metrics, ref_rows = base.evaluate(reference, rows)
        for row in ref_rows:
            row["unseen_phase"] = False
        results[part] = {"model": metrics, "persistence": ref_metrics,
                        "relative_mae_improvement": 1 - metrics["moisture"]["mae"] / ref_metrics["moisture"]["mae"] if ref_metrics["moisture"]["mae"] else None,
                        "model_macro_phase_mae": statistics.fmean(v["mae"] for v in metrics["by_phase"].values()),
                        "persistence_macro_phase_mae": statistics.fmean(v["mae"] for v in ref_metrics["by_phase"].values())}
        predictions[part] = ([{"method": model.name, **row} for row in forest_rows]
                             + [{"method": "persistence", **row} for row in ref_rows])
        if part != "train":
            results[part]["rollouts"] = {str(h): {"model": regression.rollout(model, rows, h),
                                                       "persistence": regression.rollout(final.Persistence(), rows, h)}
                                           for h in policy["rollout_horizons_days"]}
            results[part]["conditional_uncertainty"] = diagnosis.date_block_uncertainty(predictions[part], policy["uncertainty"])
    if not np.array_equal(scaler_before, scaler.mean_):
        raise ValueError("Inference mutated training preprocessing")
    validation = results["validation"]
    checks = regression.adoption_checks(validation["model"],
        {key: value["model"] for key, value in validation["rollouts"].items()},
        {"validation": validation["persistence"], "rollouts": {key: value["persistence"] for key, value in validation["rollouts"].items()}},
        regression.load_protocol()["adoption"])
    return {"partitions": results, "validation_checks_diagnostic_only": checks,
            "training_preprocessing_unchanged_during_inference": True,
            "model_structure": diagnosis.tree_structure(model),
            "data_behavior": {part: data_behavior(rows) for part, rows in partitions.items()},
            "feature_range_coverage": {part: diagnosis.range_coverage(rows, model.metadata) for part, rows in partitions.items()},
            "recommendation_ready": False, "promoted": False}, predictions


def findings(report):
    lines = ["# Clovis: fixed Random Forest on audited split variants", "",
             "Daily-average 5 cm moisture. Same forest/features; separate train-only preprocessing and model fits.",
             "Both tests use already exposed data. Phase-balanced results are historical, not a future-only forecast test.", "",
             "| Split | Partition | Rows | Persistence MAE | Forest MAE | Relative improvement |",
             "| --- | --- | ---: | ---: | ---: | ---: |"]
    for variant, result in report["variants"].items():
        for part, metrics in result["partitions"].items():
            improvement = metrics["relative_mae_improvement"]
            text = "undefined" if improvement is None else f"{100 * improvement:+.1f}%"
            lines.append(f"| {variant} | {part} | {metrics['model']['moisture']['n']} | {metrics['persistence']['moisture']['mae']:.6f} | {metrics['model']['moisture']['mae']:.6f} | {text} |")
    for variant, result in report["variants"].items():
        lines.extend(["", f"## {variant}: exposed-test phase errors", "", "| Phase | Rows | Persistence MAE | Forest MAE |", "| --- | ---: | ---: | ---: |"])
        test = result["partitions"]["test"]
        for phase, metrics in test["model"]["by_phase"].items():
            lines.append(f"| {phase} | {metrics['n']} | {test['persistence']['by_phase'][phase]['mae']:.6f} | {metrics['mae']:.6f} |")
        lines.extend(["", "| Horizon | Windows | Persistence endpoint MAE | Forest endpoint MAE | Forest clipped steps |",
                      "| --- | ---: | ---: | ---: | ---: |"])
        for horizon, values in test["rollouts"].items():
            model, reference = values["model"], values["persistence"]
            if model["status"] == "evaluated":
                lines.append(f"| {horizon} days | {model['windows']} | {reference['endpoint']['mae']:.6f} | {model['endpoint']['mae']:.6f} | {model['clipped_steps']} |")
            else:
                lines.append(f"| {horizon} days | 0 | Unavailable | Unavailable | Unavailable |")
    lines.extend(["", "## Limitations", ""])
    lines.extend(f"- {value}" for value in report["limitations"])
    return "\n".join(lines) + "\n"


def make_plot(report, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(2, 3, figsize=(14, 8), layout="constrained")
    for index, (variant, result) in enumerate(report["variants"].items()):
        groups = [result["data_behavior"][part]["daily_change"] for part in audit.PARTITIONS]
        stats = [{"label": part, "med": group["median"], "q1": group["q25"], "q3": group["q75"],
                  "whislo": group["min"], "whishi": group["max"], "fliers": []} for part, group in zip(audit.PARTITIONS, groups)]
        axes[index, 0].bxp(stats, showfliers=False)
        axes[index, 0].set(title=variant.replace("_", " "), ylabel="Daily-mean change (m³/m³)")
        test = result["partitions"]["test"]
        phases = list(test["model"]["by_phase"])
        positions = np.arange(len(phases))
        axes[index, 1].bar(positions - 0.18, [test["persistence"]["by_phase"][p]["mae"] for p in phases], width=0.36, label="Persistence", color="#3579ad")
        axes[index, 1].bar(positions + 0.18, [test["model"]["by_phase"][p]["mae"] for p in phases], width=0.36, label="Forest", color="#d98d35")
        axes[index, 1].set_xticks(positions, [p.replace("_", " ") for p in phases], rotation=20, ha="right", fontsize=8)
        axes[index, 1].set(title="Exposed-test errors by phase", ylabel="Next-day MAE (m³/m³)")
        axes[index, 1].legend(fontsize=8)
        horizons = list(test["rollouts"])
        for method, color in (("persistence", "#3579ad"), ("model", "#d98d35")):
            axes[index, 2].plot([int(h) for h in horizons], [test["rollouts"][h][method].get("endpoint", {}).get("mae", np.nan) for h in horizons], marker="o", color=color, label=method)
        axes[index, 2].set(title="Recursive endpoint error", xlabel="Horizon (days)", ylabel="MAE (m³/m³)")
        axes[index, 2].legend(fontsize=8)
        for ax in axes[index]:
            ax.spines[["top", "right"]].set_visible(False)
    fig.suptitle("Fixed forest, new allocations — cohorts differ; tests already exposed", fontsize=14)
    fig.savefig(output / "evaluation.png", dpi=160)
    plt.close(fig)


def run_experiment(dataset_dir=DATASET, experiment_dir=EXPERIMENTS):
    from mlflow.tracking import MlflowClient

    policy = load_protocol()
    experiment_dir.mkdir(parents=True, exist_ok=True)
    tracking = experiment_dir / "tracking"
    tracking.mkdir(exist_ok=True)
    uri = "sqlite:///" + (tracking / "mlflow.db").resolve().as_posix()
    client = MlflowClient(tracking_uri=uri)
    name = "clovis-fixed-forest-split-evaluation-v2"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    parent_id = client.create_run(experiment_id, tags={"mlflow.runName": f"split-evaluation/{timestamp}", "fresh_independent_test": "false"}).info.run_id
    output = experiment_dir / "runs" / f"{timestamp}-{parent_id[:8]}"
    output.mkdir(parents=True)
    child_id = None
    original_pointer = prep.ROOT / "data/experiments/clovis_regression/latest.json"
    original_model = diagnosis.model_artifact_path()
    frozen = {path: prep.digest(path) for path in (original_pointer, original_model)}
    try:
        (output / "evaluation_protocol.json").write_text(prep.json_text(policy), encoding="utf-8")
        manifest = prepare_datasets(dataset_dir)
        report = {"version": policy["version"], "mlflow_run_id": parent_id, "tracking_uri": uri,
                  "dataset_directory": str(dataset_dir.resolve()), "dataset_manifest_sha256": prep.digest(dataset_dir / "manifest.json"),
                  "target_semantics": policy["target_semantics"], "variants": {}, "fresh_independent_test": False,
                  "production_model_changed": False, "recommendation_ready": False,
                  "limitations": ["The phase-balanced pooled model trains on some dates later than historical evaluation targets; its metrics are not future-only forecasts.",
                                  "The global chronological validation/test here contains winter wheat only; it does not test a future cover season.",
                                  "All data belongs to the already exposed original site/sequence. New partitions do not create fresh independent evidence.",
                                  "The two variants use different cohorts. Compare forest against persistence within each cohort, not absolute scores between splits.",
                                  "Observed NASA weather is a hindcast input. Recursive windows overlap and share treatment dates; their counts are not independent seasons.",
                                  "Only daily-average moisture at 5 cm is evaluated; no root-zone water, crop yield, profit, or causal cover recommendation is validated.",
                                  "Fixed features/settings were not tuned; no three-day lag features, all-data refit, or artifact promotion was performed."]}
        for variant in policy["variants"]:
            print(f"Evaluating fixed forest on {variant}...", flush=True)
            child_id = client.create_run(experiment_id, tags={"mlflow.runName": f"{variant}/{timestamp}",
                "mlflow.parentRunId": parent_id, "fresh_independent_test": "false", "promoted": "false"}).info.run_id
            partitions = load_variant(dataset_dir, variant)
            started = time.perf_counter()
            model = regression.WeatherRegressor.fit(policy["model"], partitions["train"], regression.load_protocol())
            model.metadata.update({"training_dataset_version": policy["dataset_version"], "split_variant": variant,
                                   "target_semantics": policy["target_semantics"]})
            folder = output / variant
            folder.mkdir()
            path = folder / "forest_depth_4.joblib"
            model.save(path)
            restored = regression.WeatherRegressor.load(path)
            np.testing.assert_array_equal(model.predict_many(partitions["validation"])[0], restored.predict_many(partitions["validation"])[0])
            result, predictions = evaluate_variant(restored, partitions, policy)
            result.update({"mlflow_run_id": child_id, "artifact_sha256": prep.digest(path),
                           "fit_and_evaluation_seconds": time.perf_counter() - started,
                           "estimator_parameters": restored.pipeline["regressor"].get_params(),
                           "globally_chronological": manifest["variants"][variant]["coverage"]["globally_chronological"]})
            (folder / "results.json").write_text(prep.json_text(result), encoding="utf-8")
            (folder / "model_metadata.json").write_text(prep.json_text(restored.metadata), encoding="utf-8")
            for part, rows in predictions.items():
                (folder / f"{part}_predictions.csv").write_text(prep.csv_text(rows, list(rows[0])), encoding="utf-8", newline="\n")
                for method in ("model", "persistence"):
                    client.log_metric(child_id, f"{part}_{method}_mae", result["partitions"][part][method]["moisture"]["mae"])
            for key, value in {"variant": variant, "model": model.name, "seed": policy["seed"],
                               "train_rows": len(partitions["train"]), "dataset_manifest_sha256": report["dataset_manifest_sha256"],
                               **restored.pipeline["regressor"].get_params()}.items():
                client.log_param(child_id, key, value)
            for artifact in folder.iterdir():
                client.log_artifact(child_id, str(artifact))
            client.set_terminated(child_id, "FINISHED")
            report["variants"][variant] = result
            child_id = None
        if any(prep.digest(path) != expected for path, expected in frozen.items()):
            raise ValueError("Original saved model or pointer changed")
        report["original_model_and_pointer_unchanged"] = True
        (output / "results.json").write_text(prep.json_text(report), encoding="utf-8")
        (output / "findings.md").write_text(findings(report), encoding="utf-8")
        make_plot(report, output)
        context = base.code_context()
        context["packages"].update({name: importlib.metadata.version(name) for name in ("scikit-learn", "numpy", "pandas", "joblib", "matplotlib")})
        paths = [Path(__file__), PROTOCOL_PATH, dataset_dir / "manifest.json", Path(regression.__file__), regression.PROTOCOL_PATH,
                 Path(diagnosis.__file__), original_pointer, original_model]
        provenance = {**context, "input_sha256": {prep.relative(path): prep.digest(path) for path in paths}, "dataset_manifest": manifest,
                      "policy": policy, "original_model_artifact_sha256": frozen[original_model]}
        (output / "provenance.json").write_text(prep.json_text(provenance), encoding="utf-8")
        for artifact in output.iterdir():
            if artifact.is_file():
                client.log_artifact(parent_id, str(artifact))
        client.set_terminated(parent_id, "FINISHED")
        (experiment_dir / "latest.json").write_text(prep.json_text({"run_directory": str(output.resolve()), "mlflow_run_id": parent_id}), encoding="utf-8")
        return {"run_directory": str(output.resolve()), "original_model_changed": False,
                "variants": {name: {part: {"forest_mae": values["model"]["moisture"]["mae"],
                                               "persistence_mae": values["persistence"]["moisture"]["mae"],
                                               "improvement_fraction": values["relative_mae_improvement"]}
                                    for part, values in result["partitions"].items()} for name, result in report["variants"].items()}}
    except Exception as error:
        failure_path = output / "failure.json"
        failure_path.write_text(prep.json_text({"error": f"{type(error).__name__}: {error}", "mlflow_run_id": parent_id}), encoding="utf-8")
        if child_id:
            client.set_tag(child_id, "failure_reason", str(error)[:1000])
            client.set_terminated(child_id, "FAILED")
        client.log_artifact(parent_id, str(failure_path))
        client.set_tag(parent_id, "failure_reason", str(error)[:1000])
        client.set_terminated(parent_id, "FAILED")
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", type=Path, default=DATASET)
    parser.add_argument("--experiment-dir", type=Path, default=EXPERIMENTS)
    args = parser.parse_args()
    print(json.dumps(run_experiment(args.dataset_dir.resolve(), args.experiment_dir.resolve()), indent=2))


if __name__ == "__main__":
    main()
