"""Training EDA and frozen-model postmortem; never promotes or tunes a candidate."""

from __future__ import annotations

import argparse
import copy
import csv
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

import clovis_baselines as base
import clovis_regression as regression
import clovis_scenarios as scenarios
import prepare_clovis as prep
import prepare_clovis_weather as weather

PROTOCOL_PATH = Path(__file__).with_name("clovis_diagnostic_protocol.json")
EXPERIMENTS = prep.ROOT / "data/experiments/clovis_diagnostics"
PAPER_URL = "https://acsess.onlinelibrary.wiley.com/doi/10.1002/vzj2.70077"


def load_protocol():
    return json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))


def describe(values):
    values = np.asarray(values, dtype=float)
    if not len(values) or not np.isfinite(values).all():
        raise ValueError("Profile requires nonempty finite values")
    quantiles = np.quantile(values, [0, 0.25, 0.5, 0.75, 0.95, 1])
    lower, upper = quantiles[1] - 1.5 * (quantiles[3] - quantiles[1]), quantiles[3] + 1.5 * (quantiles[3] - quantiles[1])
    return {"count": len(values), "mean": float(np.mean(values)), "std": float(np.std(values)),
            **dict(zip(("min", "q25", "median", "q75", "q95", "max"), quantiles.tolist())),
            "distinct": len(set(values.tolist())), "iqr_outliers_diagnostic_only": int(np.sum((values < lower) | (values > upper)))}


def correlation(a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    if len(a) != len(b) or len(a) < 2 or np.std(a) < 1e-15 or np.std(b) < 1e-15:
        return None
    return float(np.corrcoef(a, b)[0, 1])


def training_eda(rows):
    if not rows or any(r["partition"] != "train" for r in rows):
        raise ValueError("Descriptive EDA must use training rows only")
    frame = regression.feature_frame(rows)
    target = [r["moisture_change_m3_m3"] for r in rows]
    phase_dates = defaultdict(set)
    for r in rows:
        phase_dates[r["management_phase"]].add(r["date"])
    missing = {key: sum(r.get(key) in (None, "") for r in rows) for key in rows[0]}
    numeric = {key: describe(frame[key].to_numpy()) for key in regression.NUMERIC}
    corr = {key: correlation(frame[key].to_numpy(), target) for key in regression.NUMERIC}
    near_perfect = [key for key, value in corr.items() if value is not None and abs(value) > 0.95]
    return {"rows": len(rows), "dates": len({r["date"] for r in rows}), "raw_columns": len(rows[0]),
            "feature_columns_before_encoding": len(regression.FEATURES),
            "transformed_types": {key: str(value) for key, value in frame.dtypes.items()},
            "feature_frame_memory_bytes": int(frame.memory_usage(index=True, deep=True).sum()),
            "duplicate_date_treatment_keys": len(rows) - len({(r["date"], r["treatment"]) for r in rows}),
            "missing_raw_values": missing, "numeric_feature_summary": numeric,
            "constant_numeric_features": [key for key, summary in numeric.items() if summary["distinct"] == 1],
            "target_change_summary": describe(target),
            "fraction_absolute_change_below_0_001": float(np.mean(np.abs(target) < 0.001)),
            "categorical_counts": {key: dict(sorted(Counter(r[key] for r in rows).items())) for key in regression.CATEGORICAL},
            "phase_dates": {key: len(value) for key, value in sorted(phase_dates.items())},
            "irrigated_dates": sorted({r["date"] for r in rows if r["irrigation_mm"] > 0}),
            "rain_dates": len({r["date"] for r in rows if r["rain_mm"] > 0.1}),
            "feature_target_correlations": corr, "near_perfect_correlation_suspects": near_perfect,
            "target_columns_excluded": not {"soil_moisture_m3_m3", "moisture_change_m3_m3"}.intersection(regression.FEATURES),
            "scope": "Training-only description. Correlation and IQR flags do not establish causation or justify deleting observations."}


def range_coverage(rows, metadata):
    frame = regression.feature_frame(rows)
    outside = {}
    for key, bounds in metadata["numeric_training_ranges"].items():
        values = frame[key].to_numpy(dtype=float)
        count = int(np.sum((values < bounds["min"]) | (values > bounds["max"])))
        if count:
            outside[key] = {"rows": count, "fraction": count / len(rows),
                            "observed_min": float(values.min()), "observed_max": float(values.max()), "training": bounds}
    return {"rows": len(rows), "dates": len({r["date"] for r in rows}),
            "phases": dict(sorted(Counter(r["management_phase"] for r in rows).items())),
            "unseen_phase_rows": sum(r["management_phase"] not in metadata["training_phases"] for r in rows),
            "outside_training_ranges": outside}


def tree_structure(model):
    names = model.pipeline["features"].get_feature_names_out().tolist()
    forest = model.pipeline["regressor"]
    grouped_importance, grouped_splits = Counter(), Counter()
    def original(name):
        name = name.split("__", 1)[1]
        return next((key for key in regression.CATEGORICAL if name.startswith(key + "_")), name)
    for name, importance in zip(names, forest.feature_importances_):
        grouped_importance[original(name)] += float(importance)
    leaves = []
    for estimator in forest.estimators_:
        tree = estimator.tree_
        for feature in tree.feature:
            if feature >= 0:
                grouped_splits[original(names[feature])] += 1
        leaves.extend(tree.n_node_samples[tree.children_left == -1].tolist())
    return {"trees": len(forest.estimators_), "encoded_features": len(names),
            "importance_by_original_feature": dict(sorted(grouped_importance.items(), key=lambda kv: (-kv[1], kv[0]))),
            "split_nodes_by_original_feature": dict(sorted(grouped_splits.items())),
            "leaf_unique_training_samples": describe(leaves),
            "note": "Impurity importances and split counts describe this forest, not causal crop-water effects."}


def training_source_audit(rows):
    """Read source values only through the final training date; no held-out EDA."""
    dates = {r["date"] for r in rows}
    last = date.fromisoformat(max(dates))
    station = {}
    with prep.DAILY.open(encoding="utf-8-sig", newline="") as stream:
        for record in csv.DictReader(stream):
            day = datetime.strptime(record["Date"], "%m/%d/%Y").date()
            if day > last:
                break
            if day.isoformat() in dates:
                station[day.isoformat()] = record
    aggregates = defaultdict(lambda: {key: {"total": 0.0, "count": 0, "last": None} for key in prep.load_protocol()["treatments"]})
    five_min = prep.ROOT / "5min.csv"
    with five_min.open(encoding="utf-8-sig", newline="") as stream:
        for record in csv.DictReader(stream):
            stamp = datetime.strptime(record["Time"], "%m/%d/%Y %H:%M")
            if stamp.date() > last:
                break
            day = stamp.date().isoformat()
            if day not in dates:
                continue
            for key, item in aggregates[day].items():
                try:
                    value = float(record[key])
                except (ValueError, TypeError):
                    continue
                if math.isfinite(value) and 0 <= value <= 1:
                    item["total"] += value
                    item["count"] += 1
                    item["last"] = value
    mean_errors, last_errors, counts = [], [], []
    for day, series in aggregates.items():
        for key, item in series.items():
            if not item["count"]:
                continue
            daily = float(station[day][key])
            mean_errors.append(abs(item["total"] / item["count"] - daily))
            last_errors.append(abs(item["last"] - daily))
            counts.append(item["count"])
    by_date = {r["date"]: r for r in rows}
    keys = sorted(dates)
    source_rain = [float(station[day]["Rain"]) for day in keys]
    nasa_rain = [by_date[day]["rain_mm"] for day in keys]
    valid = [i for i, v in enumerate(source_rain) if math.isfinite(v) and v >= 0]
    rain = {"dates": len(keys), "invalid_source_rain_dates": len(keys) - len(valid),
            "station_rain_raw_sum_unit_not_assumed": math.fsum(source_rain[i] for i in valid),
            "nasa_rain_sum_mm": math.fsum(nasa_rain),
            "same_date_pearson_correlation_unit_invariant": correlation([source_rain[i] for i in valid], [nasa_rain[i] for i in valid]),
            "positive_station_rain_dates": sum(source_rain[i] > 0 for i in valid),
            "positive_nasa_rain_dates": sum(v > 0 for v in nasa_rain),
            "note": "No time shift was searched or selected. Magnitudes cannot be compared until source Rain units/aggregation and station day alignment are independently confirmed."}
    return {"scope": "Training dates only", "five_min_sha256": prep.digest(five_min),
            "checked_series_days": len(mean_errors), "valid_five_min_readings_per_series_day": describe(counts),
            "daily_value_vs_five_min_mean_mae": statistics.fmean(mean_errors),
            "daily_value_vs_last_five_min_value_mae": statistics.fmean(last_errors),
            "target_semantics": "Study describes daily means; source aggregation checked here. Existing end-of-day wording is an assumption mismatch.",
            "paper_url": PAPER_URL, "station_vs_nasa_rain": rain}


def date_block_uncertainty(predictions, config):
    methods = defaultdict(dict)
    for row in predictions:
        key = (row["date"], row["treatment"])
        method = row["method"]
        if key in methods[method]:
            raise ValueError("Duplicate error-analysis identity")
        methods[method][key] = float(row["absolute_error"])
    candidate = load_protocol()["source_model"]
    if methods[candidate].keys() != methods["persistence"].keys():
        raise ValueError("Unpaired model/reference predictions")
    groups = defaultdict(list)
    for key, error in methods[candidate].items():
        groups[key[0]].append(error - methods["persistence"][key])
    dates = sorted(groups)
    differences = np.asarray([statistics.fmean(groups[day]) for day in dates])
    block = config["block_days"]
    blocks = [differences[i:i + block] for i in range(len(dates) - block + 1)
              if (date.fromisoformat(dates[i + block - 1]) - date.fromisoformat(dates[i])).days == block - 1]
    if not blocks:
        raise ValueError("No contiguous date blocks for conditional uncertainty")
    rng = np.random.default_rng(config["seed"])
    count = math.ceil(len(dates) / block)
    values = [float(np.mean(np.concatenate([blocks[i] for i in rng.integers(0, len(blocks), count)])[:len(dates)]))
              for _ in range(config["replicates"])]
    interval = np.quantile(values, [0.025, 0.975]).tolist()
    return {"mean_model_minus_persistence_absolute_error": float(np.mean(differences)),
            "conditional_95_percent_interval": interval, "eligible_blocks": len(blocks),
            "dates": len(dates), **config,
            "interpretation": "Positive values mean higher model error. This is postmortem within-site uncertainty, not uncertainty for new seasons."}


def state_probes(model, train, validation):
    upper = model.metadata["numeric_training_ranges"]["previous_moisture_m3_m3"]["max"]
    templates = {"first_validation_day": validation[0], "largest_training_rain_day": max(train, key=lambda r: r["rain_mm"])}
    results = {}
    for name, template in templates.items():
        states = [0.2, upper + 0.01, 0.6, 0.9]
        probes = [{**template, "previous_moisture_m3_m3": state} for state in states]
        changes = model.pipeline.predict(regression.feature_frame(probes)).tolist()
        results[name] = {"template_date": template["date"], "rain_mm": template["rain_mm"],
                         "previous_moisture": states, "raw_predicted_changes": changes,
                         "above_training_max_changes_identical": max(changes[1:]) - min(changes[1:]) < 1e-12}
    return {"training_previous_moisture_max": upper, "fixed_weather_probes": results,
            "note": "Only previous moisture changes within each probe. Equal predictions beyond the trained range show lack of learned moisture-dependent feedback there, not a physical saturation estimate."}


def seasonal_drift(model):
    path = scenarios.OUTPUT / "results.json"
    result = json.loads(path.read_text(encoding="utf-8"))
    if result["model"]["artifact_sha256"] != prep.digest(model_artifact_path()):
        raise ValueError("Scenario output uses a different model")
    bounds = model.metadata["numeric_training_ranges"]["previous_moisture_m3_m3"]
    summaries = []
    for case in result["scenarios"]:
        rows = case["daily_trajectory"]
        clipped = [r["date"] for r in rows if r["cover_prediction_clipped"]]
        beyond = [r["date"] for r in rows if r["cover_moisture_m3_m3"] > bounds["max"]]
        summaries.append({"scenario": case["scenario"], "first_cover_clipping_date": clipped[0] if clipped else None,
                          "first_predicted_water_above_training_max": beyond[0] if beyond else None,
                          "cover_days_above_training_water_max": len(beyond),
                          "cover_clipped_days": len(clipped), "cover_endpoint": rows[-1]["cover_moisture_m3_m3"],
                          "final_week_difference": case["final_7_day_moisture_difference_m3_m3"],
                          "cover_unseen_phase_days": case["diagnostics"]["cover_unseen_phase_days"]})
    return {"source_sha256": prep.digest(path), "cases": summaries}


def model_artifact_path():
    pointer = prep.ROOT / "data/experiments/clovis_regression/latest.json"
    return Path(json.loads(pointer.read_text(encoding="utf-8"))["run_directory"]) / "forest_depth_4.joblib"


def make_figure(report, train_rows, model, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(2, 2, figsize=(12, 8), layout="constrained")
    fig.suptitle("Clovis Random Forest diagnosis — frozen model", fontsize=15)
    for treatment in ("fallow", "pea", "oat", "six_species_mix"):
        rows = [r for r in train_rows if r["treatment"] == treatment]
        axes[0, 0].plot([date.fromisoformat(r["date"]) for r in rows], [r["moisture_change_m3_m3"] for r in rows], label=treatment, lw=0.8, alpha=0.8)
    axes[0, 0].set(title="Training target: daily moisture change", ylabel="Change (m³/m³)")
    axes[0, 0].legend(fontsize=7, ncol=2)
    axes[0, 0].tick_params(axis="x", labelrotation=20)
    items = list(report["trees"]["importance_by_original_feature"].items())[:8][::-1]
    axes[0, 1].barh([name for name, _ in items], [value for _, value in items], color="#3984a0")
    axes[0, 1].set(title="What the forest splits on", xlabel="Impurity importance (not causal)")
    raw = json.loads((scenarios.OUTPUT / "results.json").read_text(encoding="utf-8"))
    dry = raw["scenarios"][0]["daily_trajectory"]
    days = [date.fromisoformat(r["date"]) for r in dry]
    axes[1, 0].plot(days, [r["cover_moisture_m3_m3"] for r in dry], label="Cover", color="#d48631")
    axes[1, 0].plot(days, [r["fallow_moisture_m3_m3"] for r in dry], label="Fallow", linestyle="--", color="#2765a5")
    maximum = model.metadata["numeric_training_ranges"]["previous_moisture_m3_m3"]["max"]
    axes[1, 0].axhline(maximum, color="#b83a36", linestyle=":", label="Highest training input")
    axes[1, 0].set(title="Existing dry-scenario drift", ylabel="Simulated moisture (m³/m³)", ylim=(0, 1.05))
    axes[1, 0].legend(fontsize=8)
    axes[1, 0].tick_params(axis="x", labelrotation=20)
    labels = ["train", "validation", "exposed test"]
    bottom = np.zeros(3)
    for phase in ("sorghum", "fallow_before_cover", "cover_period", "fallow_after_cover", "winter_wheat"):
        counts = [report["coverage"][key]["phases"].get(phase, 0) for key in ("train", "validation", "exposed_test")]
        axes[1, 1].bar(labels, counts, bottom=bottom, label=phase)
        bottom += counts
    axes[1, 1].set(title="Management coverage differs across partitions", ylabel="Treatment-day rows")
    axes[1, 1].legend(fontsize=7)
    for ax in axes.flat:
        ax.spines[["top", "right"]].set_visible(False)
    fig.savefig(output / "diagnostics.png", dpi=160)
    plt.close(fig)


def run_diagnostics(experiment_dir=EXPERIMENTS):
    from mlflow.tracking import MlflowClient

    policy = load_protocol()
    experiment_dir.mkdir(parents=True, exist_ok=True)
    tracking = experiment_dir / "tracking"
    tracking.mkdir(exist_ok=True)
    client = MlflowClient(tracking_uri="sqlite:///" + (tracking / "mlflow.db").resolve().as_posix())
    name = "clovis-model-diagnosis-v1"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_id = client.create_run(experiment_id, tags={"mlflow.runName": f"diagnosis/{timestamp}", "production_model_changed": "false"}).info.run_id
    output = experiment_dir / "runs" / f"{timestamp}-{run_id[:8]}"
    output.mkdir(parents=True)
    child_id = None
    try:
        (output / "diagnostic_protocol.json").write_text(prep.json_text(policy), encoding="utf-8")
        model, model_info = scenarios.load_saved_model()
        original_hash = prep.digest(model_artifact_path())
        train = base.read_partition(weather.OUTPUT, "train", prep.load_protocol())
        validation = base.read_partition(weather.OUTPUT, "validation", prep.load_protocol())
        test_pointer = prep.ROOT / "data/experiments/clovis_final_test/latest.json"
        test_dir = Path(json.loads(test_pointer.read_text(encoding="utf-8"))["run_directory"])
        test_report = json.loads((test_dir / "results.json").read_text(encoding="utf-8"))
        if test_report["frozen_model"]["artifact_sha256"] != original_hash or not test_report["test_set_now_exposed"]:
            raise ValueError("Postmortem requires the existing exposed test run for this artifact")
        with (test_dir / "test_predictions.csv").open(encoding="utf-8", newline="") as stream:
            test_predictions = list(csv.DictReader(stream))
        # Do not train or score another model on exposed held-out targets.
        with (weather.OUTPUT / "test_features.csv").open(encoding="utf-8", newline="") as stream:
            exposed_features = list(csv.DictReader(stream))
        train_metrics, _ = regression.evaluate(model, train)
        train_reference, _ = base.evaluate(base.Baseline("persistence", 0.0, {}, {}), train)
        eda = training_eda(train)
        sanity = policy["sanity_check"]
        batch = train[:sanity["rows"]]
        diagnostic_config = regression.load_protocol()
        diagnostic_config = copy.deepcopy(diagnostic_config)
        diagnostic_config["candidates"][model.name] = {key: value for key, value in sanity.items()
            if key in {"family", "n_estimators", "max_depth", "min_samples_leaf", "max_features", "bootstrap"}}
        child_id = client.create_run(experiment_id, tags={"mlflow.runName": f"training-only-memorization/{timestamp}",
            "mlflow.parentRunId": run_id, "held_out_evaluated": "false", "eligible_for_promotion": "false"}).info.run_id
        tiny = regression.WeatherRegressor.fit(model.name, batch, diagnostic_config)
        tiny_metrics, _ = regression.evaluate(tiny, batch)
        tiny_path = output / "training_only_sanity.joblib"
        tiny.save(tiny_path)
        for key, value in sanity.items():
            client.log_param(child_id, key, value)
        client.log_metric(child_id, "same_batch_moisture_mae", tiny_metrics["moisture"]["mae"])
        client.log_artifact(child_id, str(tiny_path))
        client.set_terminated(child_id, "FINISHED")
        child_id = None
        report = {"diagnostic_version": policy["version"], "mlflow_run_id": run_id,
                  "frozen_model": model_info, "training_eda": eda,
                  "coverage": {"train": range_coverage(train, model.metadata),
                               "validation": range_coverage(validation, model.metadata),
                               "exposed_test": range_coverage(exposed_features, model.metadata)},
                  "training_performance": {"model": train_metrics, "persistence": train_reference},
                  "validation_performance": {"model_mae": model_info["validation_mae_m3_m3"],
                                              "persistence_mae": model_info["persistence_validation_mae_m3_m3"]},
                  "existing_exposed_test_performance": test_report,
                  "trees": tree_structure(model), "source_audit": training_source_audit(train),
                  "state_probes": state_probes(model, train, validation), "existing_seasonal_drift": seasonal_drift(model),
                  "training_only_memorization": {"rows": len(batch), "moisture_mae": tiny_metrics["moisture"]["mae"],
                      "passed": tiny_metrics["moisture"]["mae"] < 1e-10,
                      "held_out_scored": False, "purpose": sanity["score"]},
                  "conditional_error_uncertainty": date_block_uncertainty(test_predictions, policy["uncertainty"]),
                  "production_model_changed": False, "recommendation_ready": False,
                  "fresh_independent_test": False}
        if prep.digest(model_artifact_path()) != original_hash:
            raise ValueError("Frozen model changed during diagnosis")
        paths = [Path(__file__), PROTOCOL_PATH, prep.DAILY, prep.PROTOCOL, Path(regression.__file__), Path(scenarios.__file__),
                 weather.OUTPUT / "train_features.csv", weather.OUTPUT / "validation_features.csv", weather.OUTPUT / "test_features.csv",
                 test_dir / "results.json", test_dir / "test_predictions.csv", model_artifact_path()]
        provenance = {**base.code_context(), "input_sha256": {prep.relative(path): prep.digest(path) for path in paths},
                      "diagnostic_policy": policy, "source_paper": PAPER_URL, "original_model_sha256": original_hash}
        (output / "results.json").write_text(prep.json_text(report), encoding="utf-8")
        (output / "provenance.json").write_text(prep.json_text(provenance), encoding="utf-8")
        make_figure(report, train, model, output)
        client.log_param(run_id, "original_model_sha256", original_hash)
        client.log_param(run_id, "training_rows", len(train))
        client.log_param(run_id, "original_model_changed", False)
        client.log_metric(run_id, "training_model_mae", train_metrics["moisture"]["mae"])
        client.log_metric(run_id, "training_persistence_mae", train_reference["moisture"]["mae"])
        client.log_metric(run_id, "training_only_memorization_mae", tiny_metrics["moisture"]["mae"])
        for path in output.iterdir():
            if path.suffix != ".joblib":
                client.log_artifact(run_id, str(path))
        client.set_terminated(run_id, "FINISHED")
        (experiment_dir / "latest.json").write_text(prep.json_text({"run_directory": str(output.resolve()), "mlflow_run_id": run_id}), encoding="utf-8")
        return {"run_directory": str(output.resolve()), "train_model_mae": train_metrics["moisture"]["mae"],
                "train_persistence_mae": train_reference["moisture"]["mae"],
                "memorization_mae": tiny_metrics["moisture"]["mae"], "source_audit": report["source_audit"],
                "trees": report["trees"], "uncertainty": report["conditional_error_uncertainty"],
                "production_model_changed": False}
    except Exception as error:
        path = output / "failure.json"
        path.write_text(prep.json_text({"error": f"{type(error).__name__}: {error}", "mlflow_run_id": run_id}), encoding="utf-8")
        if child_id:
            client.set_terminated(child_id, "FAILED")
        client.log_artifact(run_id, str(path))
        client.set_tag(run_id, "failure_reason", str(error)[:1000])
        client.set_terminated(run_id, "FAILED")
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment-dir", type=Path, default=EXPERIMENTS)
    args = parser.parse_args()
    print(json.dumps(run_diagnostics(args.experiment_dir.resolve()), indent=2))


if __name__ == "__main__":
    main()
