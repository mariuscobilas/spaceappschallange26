"""Validation-only baseline feasibility experiment. Never reads final-test targets."""

from __future__ import annotations

import argparse
import csv
import importlib.metadata
import json
import math
import random
import statistics
import subprocess
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import prepare_clovis as prep
import prepare_clovis_weather as weather

INPUT = weather.OUTPUT
EXPERIMENTS = prep.ROOT / "data/experiments/clovis_baselines"
SEED = 42
METHODS = ("persistence", "empirical_change")


def read_partition(directory: Path, partition: str, protocol: dict) -> list[dict]:
    if partition not in {"train", "validation"}:
        raise ValueError("This experiment only permits train and validation; final test stays closed")
    path = directory / f"{partition}_features.csv"
    with path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    seen = set()
    for row in rows:
        day = date.fromisoformat(row["date"])
        previous = date.fromisoformat(row["previous_date"])
        key = (row["date"], row["treatment"])
        if (key in seen or row["partition"] != partition
                or prep.interval_name(day, protocol["partitions"]) != partition
                or prep.interval_name(previous, protocol["partitions"]) != partition
                or (day - previous).days != 1
                or row["site_id"] != protocol["site"]["site_id"]
                or row["treatment"] not in protocol["treatments"].values()
                or row["management_phase"] != prep.interval_name(day, protocol["phases"])):
            raise ValueError(f"Invalid {partition} identity/calendar at {key}")
        seen.add(key)
        for column in ("previous_moisture_m3_m3", "soil_moisture_m3_m3", "moisture_change_m3_m3",
                       "irrigation_mm", *[v[0] for v in weather.PARAMETERS.values()]):
            row[column] = float(row[column])
            if not math.isfinite(row[column]):
                raise ValueError(f"Nonfinite {column} at {key}")
        if (not 0 <= row["previous_moisture_m3_m3"] <= 1
                or not 0 <= row["soil_moisture_m3_m3"] <= 1
                or not math.isclose(row["soil_moisture_m3_m3"] - row["previous_moisture_m3_m3"],
                                    row["moisture_change_m3_m3"], abs_tol=1e-9)):
            raise ValueError(f"Invalid moisture label at {key}")
    if not rows:
        raise ValueError(f"No usable {partition} rows")
    return sorted(rows, key=lambda r: (r["date"], r["treatment"]))


@dataclass
class Baseline:
    method: str
    pooled_change: float
    group_changes: dict[str, float]
    group_counts: dict[str, int]

    @classmethod
    def fit(cls, method: str, rows: list[dict]) -> "Baseline":
        if method not in METHODS or not rows or any(r["partition"] != "train" for r in rows):
            raise ValueError("A supported baseline must be fitted on nonempty training-only data")
        if method == "persistence":
            return cls(method, 0.0, {}, {})
        groups = defaultdict(list)
        for row in rows:
            groups[f"{row['treatment']}|{row['management_phase']}"].append(row["moisture_change_m3_m3"])
        return cls(method, statistics.fmean(r["moisture_change_m3_m3"] for r in rows),
                   {k: statistics.fmean(v) for k, v in sorted(groups.items())},
                   {k: len(v) for k, v in sorted(groups.items())})

    def predict(self, state: dict) -> tuple[float, bool, bool]:
        """Read only previous state/treatment/phase; no current target or future moisture."""
        previous = float(state["previous_moisture_m3_m3"])
        if not math.isfinite(previous) or not 0 <= previous <= 1:
            raise ValueError("Previous moisture must be a finite fraction in [0,1]")
        key = f"{state['treatment']}|{state['management_phase']}"
        fallback = self.method == "empirical_change" and key not in self.group_changes
        delta = self.group_changes.get(key, self.pooled_change) if self.method == "empirical_change" else 0
        raw = previous + delta
        predicted = min(1.0, max(0.0, raw))
        return predicted, predicted != raw, fallback


def score(actual: list[float], predicted: list[float]) -> dict:
    if not actual or len(actual) != len(predicted):
        raise ValueError("Metrics require matching, nonempty arrays")
    if not all(math.isfinite(v) for v in actual + predicted):
        raise ValueError("Metrics require finite values")
    errors = [p - a for a, p in zip(actual, predicted)]
    variance_sum = sum((v - statistics.fmean(actual)) ** 2 for v in actual)
    return {"n": len(actual), "mae": statistics.fmean(abs(e) for e in errors),
            "rmse": math.sqrt(statistics.fmean(e * e for e in errors)),
            "mean_error": statistics.fmean(errors),
            "r2": 1 - sum(e * e for e in errors) / variance_sum if variance_sum > 1e-20 else None}


def summarize(predictions: list[dict]) -> dict:
    groups = {"treatment": defaultdict(list), "phase": defaultdict(list), "water_event": defaultdict(list)}
    for row in predictions:
        groups["treatment"][row["treatment"]].append(row)
        groups["phase"][row["management_phase"]].append(row)
        event = ("rain_and_irrigation" if row["rain_mm"] > 0.1 and row["irrigation_mm"] > 0.1
                 else "irrigation" if row["irrigation_mm"] > 0.1
                 else "rain" if row["rain_mm"] > 0.1 else "no_water_event")
        groups["water_event"][event].append(row)
    def metrics(rows):
        return score([r["actual_moisture"] for r in rows], [r["predicted_moisture"] for r in rows])
    return {"moisture": metrics(predictions),
            "daily_change": score([r["actual_change"] for r in predictions], [r["predicted_change"] for r in predictions]),
            "distinct_dates": len({r["date"] for r in predictions}),
            "clipped_predictions": sum(r["clipped"] for r in predictions),
            "pooled_fallbacks": sum(r["pooled_fallback"] for r in predictions),
            **{f"by_{name}": {key: metrics(rows) for key, rows in sorted(values.items())}
               for name, values in groups.items()}}


def evaluate(model: Baseline, rows: list[dict]) -> tuple[dict, list[dict]]:
    predictions = []
    for row in rows:
        predicted, clipped, fallback = model.predict(row)
        predictions.append({"date": row["date"], "treatment": row["treatment"],
                            "management_phase": row["management_phase"],
                            "previous_moisture": row["previous_moisture_m3_m3"],
                            "actual_moisture": row["soil_moisture_m3_m3"], "predicted_moisture": predicted,
                            "actual_change": row["moisture_change_m3_m3"],
                            "predicted_change": predicted - row["previous_moisture_m3_m3"],
                            "absolute_error": abs(predicted - row["soil_moisture_m3_m3"]),
                            "rain_mm": row["rain_mm"], "irrigation_mm": row["irrigation_mm"],
                            "clipped": clipped, "pooled_fallback": fallback})
    return summarize(predictions), predictions


def rollout(model: Baseline, rows: list[dict], horizon: int) -> dict:
    if horizon < 1:
        raise ValueError("Horizon must be positive")
    groups = defaultdict(list)
    for row in sorted(rows, key=lambda r: (r["date"], r["treatment"])):
        groups[row["treatment"]].append(row)
    actual_end, predicted_end, all_actual, all_predicted = [], [], [], []
    clipped = 0
    for group in groups.values():
        for start in range(len(group) - horizon + 1):
            window = group[start:start + horizon]
            if any(window[i]["previous_date"] != window[i - 1]["date"] for i in range(1, horizon)):
                continue
            state = window[0]["previous_moisture_m3_m3"]
            for row in window:
                # Only the initial state is observed; later steps use predicted state.
                state, was_clipped, _ = model.predict({"previous_moisture_m3_m3": state,
                                                       "treatment": row["treatment"],
                                                       "management_phase": row["management_phase"]})
                clipped += was_clipped
                all_actual.append(row["soil_moisture_m3_m3"])
                all_predicted.append(state)
            actual_end.append(window[-1]["soil_moisture_m3_m3"])
            predicted_end.append(state)
    if not actual_end:
        return {"horizon_days": horizon, "status": "insufficient_contiguous_validation_data", "windows": 0}
    return {"horizon_days": horizon, "status": "evaluated", "windows": len(actual_end),
            "endpoint": score(actual_end, predicted_end), "trajectory": score(all_actual, all_predicted),
            "clipped_steps": clipped,
            "note": "Overlapping windows and same-date treatment readings are correlated; not independent seasons."}


def code_context() -> dict:
    def git(*args):
        result = subprocess.run(["git", *args], cwd=prep.ROOT, text=True, capture_output=True, check=False)
        return result.stdout.strip() if result.returncode == 0 else "unavailable"
    return {"git_commit": git("rev-parse", "HEAD"), "git_worktree_status": git("status", "--porcelain"),
            "python": sys.version, "seed": SEED,
            "packages": {name: importlib.metadata.version(name)
                         for name in ("mlflow-skinny", "SQLAlchemy", "alembic", "openpyxl")}}


def run_experiment(input_dir: Path = INPUT, experiment_dir: Path = EXPERIMENTS) -> dict:
    from mlflow.tracking import MlflowClient

    random.seed(SEED)
    experiment_dir.mkdir(parents=True, exist_ok=True)
    tracking = experiment_dir / "tracking"
    tracking.mkdir(exist_ok=True)
    uri = "sqlite:///" + (tracking / "mlflow.db").resolve().as_posix()
    client = MlflowClient(tracking_uri=uri)
    name = "clovis-moisture-v1-baselines"
    experiment = client.get_experiment_by_name(name)
    experiment_id = experiment.experiment_id if experiment else client.create_experiment(
        name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    parent = client.create_run(experiment_id, tags={"mlflow.runName": f"clovis-baselines/{timestamp}",
                                                   "final_test_evaluated": "false"})
    run_id = parent.info.run_id
    output = experiment_dir / "runs" / f"{timestamp}-{run_id[:8]}"
    output.mkdir(parents=True)
    try:
        context = code_context()
        protocol = prep.load_protocol()
        weather_manifest = json.loads((input_dir / "weather_manifest.json").read_text(encoding="utf-8"))
        weather.verify_labels(prep.OUTPUT, protocol)
        for partition in ("train", "validation"):
            label = prep.OUTPUT / f"{partition}_pairs.csv"
            if prep.digest(label) != weather_manifest["input_label_sha256"][label.name]:
                raise ValueError(f"Frozen {partition} labels changed since the weather join")
        train = read_partition(input_dir, "train", protocol)
        validation = read_partition(input_dir, "validation", protocol)
        paths = [input_dir / "train_features.csv", input_dir / "validation_features.csv",
                 input_dir / "weather_manifest.json", input_dir / "feature_schema.json",
                 prep.OUTPUT / "split_manifest.json", prep.PROTOCOL, Path(__file__)]
        provenance = {**context, "input_sha256": {prep.relative(p): prep.digest(p) for p in paths},
                      "train_rows": len(train), "validation_rows": len(validation),
                      "train_dates": len({r["date"] for r in train}),
                      "validation_dates": len({r["date"] for r in validation}),
                      "test_data_access": "Final-test feature file never opened, hashed, or evaluated by this experiment.",
                      "selection": "Lowest validation next-day moisture MAE; ties prefer persistence.",
                      "regression_gate": "At least 5% lower validation MAE than the selected baseline, plus segment and stability checks."}
        (output / "provenance.json").write_text(prep.json_text(provenance), encoding="utf-8")
        client.log_param(run_id, "seed", SEED)
        client.log_param(run_id, "git_commit", context["git_commit"])
        client.log_param(run_id, "final_test_evaluated", False)
        results, predictions, models = {}, [], {}
        for method in METHODS:
            child = client.create_run(experiment_id, tags={"mlflow.runName": f"{method}/{timestamp}",
                                     "mlflow.parentRunId": run_id, "final_test_evaluated": "false"})
            child_id = child.info.run_id
            try:
                client.log_param(child_id, "method", method)
                client.log_param(child_id, "seed", SEED)
                client.log_param(child_id, "fit_partition", "train")
                client.log_param(child_id, "score_partition", "validation")
                client.log_param(child_id, "grouping", "treatment|management_phase" if method == "empirical_change" else "none")
                model = Baseline.fit(method, train)
                metrics, rows = evaluate(model, validation)
                rollouts = {str(h): rollout(model, validation, h) for h in (7, 30)}
                result = {"status": "finished", "mlflow_run_id": child_id, "validation": metrics,
                          "rollouts": rollouts,
                          "largest_validation_errors": sorted(rows, key=lambda r: (-r["absolute_error"], r["date"], r["treatment"]))[:10]}
                for key, value in metrics["moisture"].items():
                    if value is not None:
                        client.log_metric(child_id, "validation_moisture_" + key, value)
                for treatment, group in metrics["by_treatment"].items():
                    client.log_metric(child_id, f"validation_{treatment}_mae", group["mae"])
                for h, values in rollouts.items():
                    if values["status"] == "evaluated":
                        client.log_metric(child_id, f"validation_rollout_{h}_endpoint_mae", values["endpoint"]["mae"])
                fitted_path = output / f"{method}.json"
                fitted_path.write_text(prep.json_text(asdict(model)), encoding="utf-8")
                client.log_artifact(child_id, str(fitted_path))
                result_path = output / f"{method}_results.json"
                result_path.write_text(prep.json_text(result), encoding="utf-8")
                client.log_artifact(child_id, str(result_path))
                models[method], results[method] = model, result
                predictions.extend({"method": method, **r} for r in rows)
                client.set_terminated(child_id, "FINISHED")
            except Exception as error:
                client.set_tag(child_id, "failure_reason", f"{type(error).__name__}: {error}"[:1000])
                client.set_terminated(child_id, "FAILED")
                results[method] = {"status": "failed", "mlflow_run_id": child_id, "error": str(error)}
        available = [m for m in METHODS if m in models]
        if len(available) != len(METHODS):
            (output / "failed_results.json").write_text(prep.json_text(results), encoding="utf-8")
            raise RuntimeError("A planned baseline failed; see recorded MLflow failure and run files")
        selected = min(available, key=lambda m: results[m]["validation"]["moisture"]["mae"])
        reference_mae = results[selected]["validation"]["moisture"]["mae"]
        report = {"experiment_version": "clovis-baselines-v1", "mlflow_parent_run_id": run_id,
                  "tracking_uri": uri, "final_test_evaluated": False,
                  "selected_reference": selected, "reference_validation_mae": reference_mae,
                  "regression_validation_mae_ceiling": 0.95 * reference_mae,
                  "methods": results, "train_rows": len(train), "validation_rows": len(validation),
                  "validation_dates": provenance["validation_dates"],
                  "recommendation_ready": False,
                  "limitations": ["Validation has only 13 dates in one active-cover period; treatments share those dates.",
                                  "Baselines do not respond to weather; identical initial states cannot produce dry/wet scenario differences from weather alone.",
                                  "Next-day absolute-moisture R2 can look strong because moisture persists; also inspect change R2 and rollouts.",
                                  "Thirty-day validation rollouts may be unavailable; final test remains reserved for the frozen final candidate.",
                                  "No yield, financial, or crop-recommendation accuracy is established."],
                  "next_task": "Evaluate a small weather-aware regression set against this frozen reference, using validation only."}
        (output / "results.json").write_text(prep.json_text(report), encoding="utf-8")
        (output / "reference_baseline.json").write_text(prep.json_text(asdict(models[selected])), encoding="utf-8")
        fields = list(predictions[0])
        (output / "validation_predictions.csv").write_text(prep.csv_text(predictions, fields), encoding="utf-8", newline="\n")
        lines = ["# Clovis baseline feasibility", "", "Final test remains closed. Both methods are fitted only on training data.", "",
                 "| Method | Validation MAE | RMSE | Bias | Moisture R2 | Change R2 |",
                 "| --- | ---: | ---: | ---: | ---: | ---: |"]
        for method in METHODS:
            metrics = results[method]["validation"]
            s = metrics["moisture"]
            lines.append(f"| {method} | {s['mae']:.6f} | {s['rmse']:.6f} | {s['mean_error']:+.6f} | {s['r2']:.4f} | {metrics['daily_change']['r2']:.4f} |")
        lines.extend(["", f"Reference: **{selected}**. MAE units: m3/m3 (multiply by 100 for volumetric percentage points).",
                      f"A regression candidate must achieve validation MAE at or below **{0.95 * reference_mae:.6f}**, plus segment and stability checks.",
                      "", "## Recursive validation", "", "| Method | Days | Windows | Endpoint MAE |", "| --- | ---: | ---: | ---: |"])
        for method in METHODS:
            for h, values in results[method]["rollouts"].items():
                endpoint = f"{values['endpoint']['mae']:.6f}" if values["status"] == "evaluated" else "Unavailable: validation interval too short"
                lines.append(f"| {method} | {h} | {values['windows']} | {endpoint} |")
        lines.extend(["", "## Limits and next step", ""])
        lines.extend(f"- {item}" for item in report["limitations"])
        lines.extend(["", report["next_task"], ""])
        (output / "findings.md").write_text("\n".join(lines), encoding="utf-8")
        for path in output.iterdir():
            if path.is_file():
                client.log_artifact(run_id, str(path))
        client.log_param(run_id, "selected_reference", selected)
        client.log_metric(run_id, "reference_validation_mae", reference_mae)
        client.set_terminated(run_id, "FINISHED")
        (experiment_dir / "latest.json").write_text(prep.json_text({"run_directory": str(output.resolve()),
                         "mlflow_run_id": run_id}), encoding="utf-8")
        return {"run_directory": str(output.resolve()), "selected_reference": selected,
                "validation_mae": reference_mae, "regression_mae_ceiling": 0.95 * reference_mae,
                "final_test_evaluated": False}
    except Exception as error:
        failure = {"status": "failed", "error": f"{type(error).__name__}: {error}", "mlflow_run_id": run_id}
        (output / "failure.json").write_text(prep.json_text(failure), encoding="utf-8")
        client.set_tag(run_id, "failure_reason", failure["error"][:1000])
        client.log_artifact(run_id, str(output / "failure.json"))
        client.set_terminated(run_id, "FAILED")
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=INPUT)
    parser.add_argument("--experiment-dir", type=Path, default=EXPERIMENTS)
    args = parser.parse_args()
    print(json.dumps(run_experiment(args.input_dir.resolve(), args.experiment_dir.resolve()), indent=2))


if __name__ == "__main__":
    main()
