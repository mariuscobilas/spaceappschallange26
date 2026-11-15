"""Run the predeclared weather-aware candidates on train/validation only."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import clovis_baselines as base
import clovis_regression as regression
import prepare_clovis as prep
import prepare_clovis_weather as weather

EXPERIMENTS = prep.ROOT / "data/experiments/clovis_regression"


def run_experiment(input_dir: Path = weather.OUTPUT, experiment_dir: Path = EXPERIMENTS,
                   baseline_run: Path | None = None) -> dict:
    from mlflow.tracking import MlflowClient

    experiment_dir.mkdir(parents=True, exist_ok=True)
    tracking = experiment_dir / "tracking"
    tracking.mkdir(exist_ok=True)
    uri = "sqlite:///" + (tracking / "mlflow.db").resolve().as_posix()
    client = MlflowClient(tracking_uri=uri)
    name = "clovis-moisture-v1-regression"
    existing = client.get_experiment_by_name(name)
    experiment_id = existing.experiment_id if existing else client.create_experiment(
        name, artifact_location=(tracking / "artifacts").resolve().as_uri())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    parent = client.create_run(experiment_id, tags={"mlflow.runName": f"clovis-regression/{timestamp}",
                                                   "final_test_evaluated": "false"})
    parent_id = parent.info.run_id
    output = experiment_dir / "runs" / f"{timestamp}-{parent_id[:8]}"
    output.mkdir(parents=True)
    try:
        protocol = regression.load_protocol()
        random.seed(protocol["seed"])
        np.random.seed(protocol["seed"])
        if baseline_run is None:
            pointer = json.loads((base.EXPERIMENTS / "latest.json").read_text(encoding="utf-8"))
            baseline_run = Path(pointer["run_directory"])
        baseline_report = json.loads((baseline_run / "results.json").read_text(encoding="utf-8"))
        baseline_provenance = json.loads((baseline_run / "provenance.json").read_text(encoding="utf-8"))
        source_protocol = prep.load_protocol()
        weather.verify_labels(prep.OUTPUT, source_protocol)
        # Reuse exactly the baseline cohort and weather version. Never access test features.
        for file in ("train_features.csv", "validation_features.csv", "weather_manifest.json", "feature_schema.json"):
            path = input_dir / file
            if prep.digest(path) != baseline_provenance["input_sha256"][prep.relative(path)]:
                raise ValueError(f"Input differs from the frozen baseline comparison: {file}")
        train = base.read_partition(input_dir, "train", source_protocol)
        validation = base.read_partition(input_dir, "validation", source_protocol)
        reference_name = baseline_report["selected_reference"]
        reference_model = base.Baseline.fit(reference_name, train)
        reference_metrics, _ = base.evaluate(reference_model, validation)
        reference = baseline_report["methods"][reference_name]
        if abs(reference_metrics["moisture"]["mae"] - reference["validation"]["moisture"]["mae"]) > 1e-12:
            raise ValueError("Recomputed reference metric differs from saved baseline")
        context = base.code_context()
        context["packages"].update({name: importlib.metadata.version(name) for name in ("scikit-learn", "pandas", "numpy", "joblib")})
        paths = [Path(__file__), Path(regression.__file__), regression.PROTOCOL_PATH,
                 input_dir / "train_features.csv", input_dir / "validation_features.csv",
                 input_dir / "weather_manifest.json", input_dir / "feature_schema.json", prep.PROTOCOL,
                 prep.OUTPUT / "split_manifest.json", baseline_run / "results.json", baseline_run / "provenance.json"]
        provenance = {**context, "input_sha256": {prep.relative(p): prep.digest(p) for p in paths},
                      "baseline_run_directory": str(baseline_run.resolve()), "protocol": protocol,
                      "train_rows": len(train), "validation_rows": len(validation),
                      "test_data_access": "Final-test feature and pair files are never opened or hashed.",
                      "refit_on_all_data": False}
        (output / "provenance.json").write_text(prep.json_text(provenance), encoding="utf-8")
        (output / "model_protocol.json").write_text(prep.json_text(protocol), encoding="utf-8")
        for key, value in {"seed": protocol["seed"], "git_commit": context["git_commit"],
                           "reference": reference_name, "final_test_evaluated": False}.items():
            client.log_param(parent_id, key, value)
        results, predictions, models = {}, [], {}
        for name in protocol["candidate_order"]:
            child = client.create_run(experiment_id, tags={"mlflow.runName": f"{name}/{timestamp}",
                                     "mlflow.parentRunId": parent_id, "final_test_evaluated": "false"})
            child_id = child.info.run_id
            print(f"Evaluating {name}...", flush=True)
            try:
                parameters = {**protocol["candidates"][name], "seed": protocol["seed"],
                              "fit_partition": "train", "score_partition": "validation"}
                for key, value in parameters.items():
                    client.log_param(child_id, key, value)
                started = time.perf_counter()
                model = regression.WeatherRegressor.fit(name, train, protocol)
                fit_seconds = time.perf_counter() - started
                model_path = output / f"{name}.joblib"
                model.save(model_path)
                metadata_path = output / f"{name}_metadata.json"
                metadata_path.write_text(prep.json_text(model.metadata), encoding="utf-8")
                metrics, rows = regression.evaluate(model, validation)
                rollouts = {str(h): regression.rollout(model, validation, h) for h in (7, 30)}
                checks = regression.adoption_checks(metrics, rollouts, reference, protocol["adoption"])
                # A sensitivity diagnostic, not causal attribution or a tuning loop.
                dry = {**validation[0], "rain_mm": 0.0}
                wet = {**validation[0], "rain_mm": 25.0}
                response = model.predict_many([dry, wet])[0]
                result = {"status": "finished", "mlflow_run_id": child_id, "validation": metrics,
                          "rollouts": rollouts, "adoption_checks": checks, "eligible_for_adoption": all(checks.values()),
                          "mae_improvement_fraction": 1 - metrics["moisture"]["mae"] / reference_metrics["moisture"]["mae"],
                          "fit_seconds": fit_seconds,
                          "rain_probe": {"rain_mm": [0, 25], "predicted_moisture": response,
                                         "note": "All other first-validation-row inputs held constant; not a field trial."},
                          "largest_validation_errors": sorted(rows, key=lambda r: (-r["absolute_error"], r["date"], r["treatment"]))[:10],
                          "artifact_sha256": prep.digest(model_path)}
                result_path = output / f"{name}_results.json"
                result_path.write_text(prep.json_text(result), encoding="utf-8")
                for key, value in metrics["moisture"].items():
                    if value is not None:
                        client.log_metric(child_id, "validation_moisture_" + key, value)
                client.log_metric(child_id, "fit_seconds", fit_seconds)
                client.log_metric(child_id, "validation_mae_improvement", result["mae_improvement_fraction"])
                for treatment, segment in metrics["by_treatment"].items():
                    client.log_metric(child_id, f"validation_{treatment}_mae", segment["mae"])
                if rollouts["7"]["status"] == "evaluated":
                    client.log_metric(child_id, "validation_seven_day_endpoint_mae", rollouts["7"]["endpoint"]["mae"])
                for path in (model_path, metadata_path, result_path):
                    client.log_artifact(child_id, str(path))
                client.set_tag(child_id, "eligible_for_adoption", str(all(checks.values())).lower())
                client.set_terminated(child_id, "FINISHED")
                results[name], models[name] = result, model
                predictions.extend({"candidate": name, **row} for row in rows)
            except Exception as error:
                client.set_tag(child_id, "failure_reason", f"{type(error).__name__}: {error}"[:1000])
                client.set_terminated(child_id, "FAILED")
                results[name] = {"status": "failed", "error": str(error), "mlflow_run_id": child_id}
        if len(models) != len(protocol["candidate_order"]):
            (output / "partial_results.json").write_text(prep.json_text(results), encoding="utf-8")
            raise RuntimeError("At least one declared regression candidate failed; inspect the recorded failure")
        ordered = protocol["candidate_order"]
        eligible = [name for name in ordered if results[name]["eligible_for_adoption"]]
        best = min(ordered, key=lambda n: results[n]["validation"]["moisture"]["mae"])
        selected = min(eligible, key=lambda n: results[n]["validation"]["moisture"]["mae"]) if eligible else None
        selection = {"protocol_version": protocol["version"], "selected_regression": selected,
                     "best_experimental_candidate": best,
                     "recommended_reference": selected or reference_name,
                     "final_test_evaluated": False, "refit_on_all_data": False,
                     "selected_artifact": f"{selected}.joblib" if selected else None,
                     "selected_artifact_sha256": results[selected]["artifact_sha256"] if selected else None,
                     "selection_policy": protocol["selection"], "adoption_policy": protocol["adoption"]}
        report = {"experiment_version": protocol["version"], "mlflow_parent_run_id": parent_id,
                  "tracking_uri": uri, "selection": selection, "reference": reference,
                  "reference_name": reference_name, "candidates": results,
                  "train_rows": len(train), "validation_rows": len(validation),
                  "validation_dates": len({r["date"] for r in validation}), "recommendation_ready": False,
                  "limitations": ["Only 13 correlated validation dates in one cover-crop season.",
                                  "Current-day weather is observed hindcast input; future runs require scenarios.",
                                  "Post-cover and wheat phases are absent from the initial training window; future extrapolation must be flagged.",
                                  "30-day validation is unavailable; one-week performance does not validate seasonal forecasts.",
                                  "No final test evaluation, all-data refit, yield model, or financial verification in this task."]}
        (output / "results.json").write_text(prep.json_text(report), encoding="utf-8")
        (output / "selection.json").write_text(prep.json_text(selection), encoding="utf-8")
        (output / "validation_predictions.csv").write_text(prep.csv_text(predictions, list(predictions[0])), encoding="utf-8", newline="\n")
        lines = ["# Clovis weather-aware regression validation", "", "Final test remains closed. All transformations and regressors fitted on training data only.", "",
                 "| Candidate | MAE | RMSE | Change R2 | Seven-day endpoint MAE | Eligible |",
                 "| --- | ---: | ---: | ---: | ---: | --- |"]
        lines.append(f"| {reference_name} (reference) | {reference_metrics['moisture']['mae']:.6f} | {reference_metrics['moisture']['rmse']:.6f} | {reference_metrics['daily_change']['r2']:.4f} | {reference['rollouts']['7']['endpoint']['mae']:.6f} | Reference |")
        for name in ordered:
            r = results[name]
            lines.append(f"| {name} | {r['validation']['moisture']['mae']:.6f} | {r['validation']['moisture']['rmse']:.6f} | {r['validation']['daily_change']['r2']:.4f} | {r['rollouts']['7']['endpoint']['mae']:.6f} | {r['eligible_for_adoption']} |")
        lines.extend(["", f"Selected regression: **{selected or 'none'}**. Best experimental candidate by MAE: **{best}**.",
                      "", "## Adoption checks", ""])
        for name in ordered:
            failed = [key for key, passed in results[name]["adoption_checks"].items() if not passed]
            lines.append(f"- {name}: {'all checks passed' if not failed else ', '.join(failed)}")
        lines.extend(["", "## Limits", ""])
        lines.extend(f"- {note}" for note in report["limitations"])
        (output / "findings.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        for path in output.iterdir():
            if path.is_file() and path.suffix != ".joblib":
                client.log_artifact(parent_id, str(path))
        client.log_param(parent_id, "selected_regression", selected or "none")
        client.log_param(parent_id, "recommended_reference", selected or reference_name)
        client.set_terminated(parent_id, "FINISHED")
        (experiment_dir / "latest.json").write_text(prep.json_text({"run_directory": str(output.resolve()), "mlflow_run_id": parent_id}), encoding="utf-8")
        return {"run_directory": str(output.resolve()), **selection}
    except Exception as error:
        failure = {"status": "failed", "error": f"{type(error).__name__}: {error}", "mlflow_run_id": parent_id}
        failure_path = output / "failure.json"
        failure_path.write_text(prep.json_text(failure), encoding="utf-8")
        client.set_tag(parent_id, "failure_reason", failure["error"][:1000])
        client.log_artifact(parent_id, str(failure_path))
        client.set_terminated(parent_id, "FAILED")
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=weather.OUTPUT)
    parser.add_argument("--experiment-dir", type=Path, default=EXPERIMENTS)
    parser.add_argument("--baseline-run", type=Path)
    args = parser.parse_args()
    print(json.dumps(run_experiment(args.input_dir.resolve(), args.experiment_dir.resolve(), args.baseline_run), indent=2))


if __name__ == "__main__":
    main()
