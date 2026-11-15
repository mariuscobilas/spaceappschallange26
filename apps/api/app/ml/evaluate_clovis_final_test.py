"""Explicitly authorized held-out evaluation of one frozen model and persistence."""

from __future__ import annotations

import argparse
import csv
import json
import math
import time
from datetime import date, datetime, timezone
from pathlib import Path

import clovis_baselines as base
import clovis_regression as regression
import clovis_scenarios as scenarios
import prepare_clovis as prep
import prepare_clovis_weather as weather

PROTOCOL_PATH = Path(__file__).with_name("clovis_final_test_protocol.json")
EXPERIMENTS = prep.ROOT / "data/experiments/clovis_final_test"


def load_protocol():
    return json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))


def read_test(directory: Path, labels: Path, history: list[dict], source_protocol: dict) -> list[dict]:
    """Dedicated test reader; existing train/validation readers stay restricted."""
    weather.verify_labels(labels, source_protocol)
    manifest = json.loads((directory / "weather_manifest.json").read_text(encoding="utf-8"))
    pair_path = labels / "test_pairs.csv"
    if prep.digest(pair_path) != manifest["input_label_sha256"][pair_path.name]:
        raise ValueError("Final-test labels differ from the frozen weather manifest")
    with pair_path.open(encoding="utf-8", newline="") as stream:
        pairs = list(csv.DictReader(stream))
    rows = weather.join_pairs(pairs, history, "test", source_protocol)
    expected = prep.csv_text(rows, weather.JOIN_FIELDS).encode("utf-8")
    if (directory / "test_features.csv").read_bytes() != expected:
        raise ValueError("Final-test features differ from frozen labels and verified weather")
    for row in rows:
        day, previous = date.fromisoformat(row["date"]), date.fromisoformat(row["previous_date"])
        if (row["management_phase"] != prep.interval_name(day, source_protocol["phases"])
                or row["treatment"] not in source_protocol["treatments"].values()
                or (day - previous).days != 1):
            raise ValueError("Invalid held-out identity/calendar")
        for column in ("previous_moisture_m3_m3", "soil_moisture_m3_m3", "moisture_change_m3_m3",
                       "irrigation_mm", *scenarios.WEATHER_COLUMNS):
            row[column] = float(row[column])
            if not math.isfinite(row[column]):
                raise ValueError(f"Nonfinite held-out value: {column}")
        if (not 0 <= row["previous_moisture_m3_m3"] <= 1 or not 0 <= row["soil_moisture_m3_m3"] <= 1
                or not math.isclose(row["soil_moisture_m3_m3"] - row["previous_moisture_m3_m3"],
                                    row["moisture_change_m3_m3"], abs_tol=1e-9)):
            raise ValueError("Invalid held-out moisture label")
    if not rows:
        raise ValueError("No held-out rows available")
    regression.feature_frame(rows)
    return sorted(rows, key=lambda r: (r["date"], r["treatment"]))


class Persistence:
    """Stateless baseline compatible with the shared vectorized rollout."""
    def predict_many(self, rows):
        return [r["previous_moisture_m3_m3"] for r in rows], [False] * len(rows), [False] * len(rows)


def score_frozen(model, rows: list[dict], policy: dict) -> tuple[dict, list[dict]]:
    started = time.perf_counter()
    metrics, predictions = regression.evaluate(model, rows)
    persistence, reference_rows = base.evaluate(base.Baseline("persistence", 0.0, {}, {}), rows)
    rollouts = {str(h): regression.rollout(model, rows, h) for h in policy["horizons_days"]}
    reference_rollouts = {str(h): regression.rollout(Persistence(), rows, h) for h in policy["horizons_days"]}
    for result in [*rollouts.values(), *reference_rollouts.values()]:
        if result["status"] != "evaluated":
            result["status"] = "insufficient_contiguous_test_data"
    checks = regression.adoption_checks(metrics, rollouts, {"validation": persistence, "rollouts": reference_rollouts},
                                        regression.load_protocol()["adoption"])
    unseen_by_phase = {}
    for row in predictions:
        if row["unseen_phase"]:
            phase = row["management_phase"]
            unseen_by_phase[phase] = unseen_by_phase.get(phase, 0) + 1
    report = {"rows": len(rows), "distinct_dates": len({r["date"] for r in rows}),
              "first_target_date": min(r["date"] for r in rows), "last_target_date": max(r["date"] for r in rows),
              "model": {"test": metrics, "rollouts": rollouts},
              "reference": {"name": "persistence", "test": persistence, "rollouts": reference_rollouts},
              "mae_improvement_fraction": 1 - metrics["moisture"]["mae"] / persistence["moisture"]["mae"]
                  if persistence["moisture"]["mae"] else None,
              "comparison_checks_diagnostic_only": checks, "unseen_phase_rows": dict(sorted(unseen_by_phase.items())),
              "largest_model_errors": sorted(predictions, key=lambda r: (-r["absolute_error"], r["date"], r["treatment"]))[:10],
              "evaluation_seconds": time.perf_counter() - started,
              "final_test_evaluated": True, "test_set_now_exposed": True, "refit_on_all_data": False,
              "recommendation_ready": False, "prior_validation_selection_changed": False}
    # Give both methods the same CSV columns.
    for row in reference_rows:
        row["unseen_phase"] = False
    return report, ([{"method": policy["candidate"], **r} for r in predictions]
                    + [{"method": "persistence", **r} for r in reference_rows])


def findings(report: dict) -> str:
    lines = ["# Frozen Clovis model: final-test evaluation", "",
             "One saved candidate; no retraining, tuning, or test-based model selection.", "",
             f"Cohort: {report['rows']} rows across {report['distinct_dates']} dates, {report['first_target_date']} to {report['last_target_date']}.", "",
             "| Method | Next-day MAE | RMSE | Daily-change R2 | Clipped predictions |",
             "| --- | ---: | ---: | ---: | ---: |"]
    for name, values in (("persistence", report["reference"]), (report["frozen_model"]["name"], report["model"])):
        metrics = values["test"]
        r2 = metrics["daily_change"]["r2"]
        lines.append(f"| {name} | {metrics['moisture']['mae']:.6f} | {metrics['moisture']['rmse']:.6f} | {r2 if r2 is None else round(r2, 4)} | {metrics['clipped_predictions']} |")
    lines.extend(["", "## Recursive endpoints", "", "| Horizon | Windows | Persistence MAE | Model MAE | Model clipped steps |",
                  "| --- | ---: | ---: | ---: | ---: |"])
    for horizon, result in report["model"]["rollouts"].items():
        reference = report["reference"]["rollouts"][horizon]
        if result["status"] == "evaluated":
            lines.append(f"| {horizon} days | {result['windows']} | {reference['endpoint']['mae']:.6f} | {result['endpoint']['mae']:.6f} | {result['clipped_steps']} |")
        else:
            lines.append(f"| {horizon} days | 0 | Unavailable | Unavailable | Unavailable |")
    for field, title in (("by_phase", "Management phase"), ("by_treatment", "Treatment")):
        lines.extend(["", f"## {title}", "", "| Segment | Rows | Persistence MAE | Model MAE |", "| --- | ---: | ---: | ---: |"])
        for segment, metrics in report["model"]["test"][field].items():
            baseline = report["reference"]["test"][field][segment]
            lines.append(f"| {segment} | {metrics['n']} | {baseline['mae']:.6f} | {metrics['mae']:.6f} |")
    lines.extend(["", "## Limits", ""])
    lines.extend(f"- {value}" for value in report["limitations"])
    return "\n".join(lines) + "\n"


def run_evaluation(experiment_dir: Path = EXPERIMENTS, regression_run: Path | None = None) -> dict:
    from mlflow.tracking import MlflowClient

    policy = load_protocol()
    if policy["candidate"] != "forest_depth_4" or policy["reference"] != "persistence":
        raise ValueError("This evaluation is frozen to forest_depth_4 versus persistence")
    experiment_dir.mkdir(parents=True, exist_ok=True)
    tracking = experiment_dir / "tracking"
    tracking.mkdir(exist_ok=True)
    uri = "sqlite:///" + (tracking / "mlflow.db").resolve().as_posix()
    client = MlflowClient(tracking_uri=uri)
    name = "clovis-frozen-final-test-v1"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(
        name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run = client.create_run(experiment_id, tags={"mlflow.runName": f"frozen-final-test/{timestamp}",
                                               "final_test_evaluated": "pending", "refit_on_all_data": "false"})
    run_id = run.info.run_id
    output = experiment_dir / "runs" / f"{timestamp}-{run_id[:8]}"
    output.mkdir(parents=True)
    try:
        # Save the declaration before opening any held-out labels.
        (output / "test_protocol.json").write_text(prep.json_text(policy), encoding="utf-8")
        model, model_info = scenarios.load_saved_model(regression_run)
        if model.name != policy["candidate"]:
            raise ValueError("Saved candidate differs from the predeclared final-test candidate")
        history, weather_info = scenarios.load_history()
        paths = [Path(__file__), PROTOCOL_PATH, prep.PROTOCOL, prep.OUTPUT / "split_manifest.json",
                 weather.OUTPUT / "weather_manifest.json", weather.OUTPUT / "test_features.csv",
                 prep.OUTPUT / "test_pairs.csv", Path(regression.__file__), Path(base.__file__), Path(scenarios.__file__)]
        hashes = {prep.relative(path): prep.digest(path) for path in paths}
        rows = read_test(weather.OUTPUT, prep.OUTPUT, history, prep.load_protocol())
        report, predictions = score_frozen(model, rows, policy)
        report.update({"experiment_version": policy["version"], "mlflow_run_id": run_id, "tracking_uri": uri,
                       "frozen_model": model_info, "weather": weather_info,
                       "limitations": [
                           "The test set is now exposed; do not tune against these results and then call the same set an untouched final test.",
                           "Earlier validation rejected this model. Test scores do not reverse that selection or promote an artifact.",
                           "Weather is observed historical input, not a forecast; real forecast uncertainty is not measured here.",
                           "Next-day scoring uses measured previous-day water. Recursive scoring observes only its initial state.",
                           "Rolling windows overlap and four treatments share dates in one location; these are not independent seasons.",
                           "Post-cover and wheat phases were absent from training. Segment metrics and unseen-phase counts show this extrapolation.",
                           "Only 5 cm surface moisture is evaluated; no root-zone storage, yield, profit, or recommendation labels are tested.",
                           "A missing-date gap breaks a rollout; no interpolation of moisture targets or weather occurs."]})
        for path in paths:
            if prep.digest(path) != hashes[prep.relative(path)]:
                raise ValueError("Evaluation input changed during scoring")
        provenance = {**base.code_context(), "input_sha256": hashes, "model_artifact_sha256": model_info["artifact_sha256"],
                      "regression_run_id": model_info["regression_run_id"], "policy": policy,
                      "authorization": policy["authorization"], "test_accessed": True, "retraining": False}
        for name, value in (("results.json", report), ("provenance.json", provenance)):
            (output / name).write_text(prep.json_text(value), encoding="utf-8")
        (output / "test_predictions.csv").write_text(prep.csv_text(predictions, list(predictions[0])), encoding="utf-8", newline="\n")
        (output / "findings.md").write_text(findings(report), encoding="utf-8")
        for key, value in {"candidate": model.name, "reference": "persistence", "fit_partition": "none_saved_artifact",
                           "score_partition": "test", "seed": model.metadata["seed"],
                           "artifact_sha256": model_info["artifact_sha256"], "regression_run_id": model_info["regression_run_id"]}.items():
            client.log_param(run_id, key, value)
        for label, result in (("model", report["model"]), ("persistence", report["reference"])):
            for key, value in result["test"]["moisture"].items():
                if value is not None:
                    client.log_metric(run_id, f"test_{label}_{key}", value)
            for horizon, value in result["rollouts"].items():
                if value["status"] == "evaluated":
                    client.log_metric(run_id, f"test_{label}_{horizon}_day_endpoint_mae", value["endpoint"]["mae"])
        client.set_tag(run_id, "final_test_evaluated", "true")
        client.set_tag(run_id, "recommendation_ready", "false")
        for path in output.iterdir():
            client.log_artifact(run_id, str(path))
        client.set_terminated(run_id, "FINISHED")
        (experiment_dir / "latest.json").write_text(prep.json_text({"run_directory": str(output.resolve()), "mlflow_run_id": run_id}), encoding="utf-8")
        return {"run_directory": str(output.resolve()), "mlflow_run_id": run_id, "rows": len(rows),
                "model_mae": report["model"]["test"]["moisture"]["mae"],
                "persistence_mae": report["reference"]["test"]["moisture"]["mae"],
                "final_test_evaluated": True, "refit_on_all_data": False}
    except Exception as error:
        failure = {"error": f"{type(error).__name__}: {error}", "mlflow_run_id": run_id}
        failure_path = output / "failure.json"
        failure_path.write_text(prep.json_text(failure), encoding="utf-8")
        client.log_artifact(run_id, str(failure_path))
        client.set_tag(run_id, "failure_reason", failure["error"][:1000])
        client.set_terminated(run_id, "FAILED")
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment-dir", type=Path, default=EXPERIMENTS)
    parser.add_argument("--regression-run", type=Path)
    args = parser.parse_args()
    print(json.dumps(run_evaluation(args.experiment_dir.resolve(), args.regression_run), indent=2))


if __name__ == "__main__":
    main()
