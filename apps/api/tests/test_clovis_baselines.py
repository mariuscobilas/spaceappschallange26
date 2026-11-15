"""Ground-truth metrics, recursive-state, training-only fit, and tracking tests."""

import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import clovis_baselines as baselines


def row(day="2023-04-26", previous_day="2023-04-25", previous=0.2, actual=0.21,
        treatment="pea", phase="cover_period", partition="train"):
    return {"date": day, "previous_date": previous_day, "partition": partition,
            "treatment": treatment, "management_phase": phase,
            "previous_moisture_m3_m3": previous, "soil_moisture_m3_m3": actual,
            "moisture_change_m3_m3": actual - previous, "rain_mm": 0, "irrigation_mm": 0}


class BaselineTests(unittest.TestCase):
    def test_metrics_have_known_values_and_undefined_r2_is_null(self):
        metrics = baselines.score([0.1, 0.3], [0.2, 0.2])
        self.assertAlmostEqual(metrics["mae"], 0.1)
        self.assertAlmostEqual(metrics["rmse"], 0.1)
        self.assertAlmostEqual(metrics["mean_error"], 0)
        self.assertAlmostEqual(metrics["r2"], 0)
        self.assertIsNone(baselines.score([0.2, 0.2], [0.1, 0.3])["r2"])
        with self.assertRaises(ValueError):
            baselines.score([math.nan], [0.2])

    def test_fit_rejects_validation_or_test_rows(self):
        for method in baselines.METHODS:
            for partition in ("validation", "test"):
                with self.assertRaisesRegex(ValueError, "training-only"):
                    baselines.Baseline.fit(method, [row(partition=partition)])

    def test_group_means_and_unseen_group_pooled_fallback(self):
        model = baselines.Baseline.fit("empirical_change", [row(actual=0.21), row(actual=0.23),
                                                            row(actual=0.19, treatment="oat")])
        self.assertAlmostEqual(model.predict(row())[0], 0.22)
        prediction, _, fallback = model.predict(row(phase="winter_wheat"))
        self.assertTrue(fallback)
        self.assertAlmostEqual(prediction, 0.21)
        self.assertEqual(model.group_counts["pea|cover_period"], 2)

    def test_predictions_ignore_ground_truth_and_weather(self):
        for method in baselines.METHODS:
            model = baselines.Baseline.fit(method, [row()])
            state = row()
            expected = model.predict(state)
            changed = copy.deepcopy(state)
            changed.update(soil_moisture_m3_m3=0.9, moisture_change_m3_m3=0.7, rain_mm=100)
            self.assertEqual(model.predict(changed), expected)

    def test_prediction_clips_and_rejects_invalid_initial_state(self):
        model = baselines.Baseline.fit("empirical_change", [row(actual=0.4)])
        predicted, clipped, _ = model.predict(row(previous=0.95))
        self.assertEqual(predicted, 1)
        self.assertTrue(clipped)
        for value in (-1, 2, float("inf")):
            with self.assertRaises(ValueError):
                model.predict(row(previous=value))

    def test_rollout_uses_predicted_state_after_initial_day(self):
        model = baselines.Baseline.fit("persistence", [row()])
        validation = [row(previous=0.2, actual=0.5, partition="validation"),
                      row(day="2023-04-27", previous_day="2023-04-26", previous=0.5,
                          actual=0.8, partition="validation")]
        metrics = baselines.rollout(model, validation, 2)
        self.assertEqual(metrics["windows"], 1)
        self.assertAlmostEqual(metrics["endpoint"]["mae"], 0.6)
        self.assertAlmostEqual(metrics["trajectory"]["mae"], 0.45)

    def test_rollout_never_jumps_a_gap_or_invents_long_horizon_scores(self):
        model = baselines.Baseline.fit("persistence", [row()])
        validation = [row(partition="validation"),
                      row(day="2023-04-28", previous_day="2023-04-27", partition="validation")]
        self.assertEqual(baselines.rollout(model, validation, 2)["windows"], 0)
        self.assertEqual(baselines.rollout(model, validation, 30)["status"],
                         "insufficient_contiguous_validation_data")

    def test_metrics_and_error_rows_are_consistent(self):
        model = baselines.Baseline.fit("persistence", [row()])
        metrics, predictions = baselines.evaluate(model, [row(partition="validation"),
                                                         row(treatment="oat", partition="validation", actual=0.24)])
        self.assertAlmostEqual(metrics["moisture"]["mae"], 0.025)
        self.assertEqual(metrics["by_treatment"]["pea"]["n"], 1)
        self.assertEqual(metrics["distinct_dates"], 1)
        self.assertAlmostEqual(predictions[1]["absolute_error"], 0.04)

    def test_final_test_read_is_rejected_before_open(self):
        with patch.object(Path, "open", side_effect=AssertionError("Must not open any file")):
            with self.assertRaisesRegex(ValueError, "final test stays closed"):
                baselines.read_partition(Path("unused"), "test", {})


@patch.dict("os.environ", {"MLFLOW_SQLALCHEMYSTORE_POOLCLASS": "NullPool"})
class ExperimentTrackingTests(unittest.TestCase):
    def test_real_validation_run_does_not_open_test_files_and_is_tracked(self):
        from mlflow.tracking import MlflowClient

        real_open = Path.open
        def guarded_open(path, *args, **kwargs):
            if path.name in {"test_features.csv", "test_pairs.csv"}:
                raise AssertionError("Final test file was opened")
            return real_open(path, *args, **kwargs)
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(Path, "open", guarded_open):
                summary = baselines.run_experiment(experiment_dir=Path(directory))
            output = Path(summary["run_directory"])
            report = json.loads((output / "results.json").read_text())
            self.assertFalse(report["final_test_evaluated"])
            self.assertEqual(report["validation_rows"], 52)
            self.assertEqual(report["validation_dates"], 13)
            candidate = min(baselines.METHODS, key=lambda m: report["methods"][m]["validation"]["moisture"]["mae"])
            self.assertEqual(candidate, report["selected_reference"])
            client = MlflowClient(tracking_uri=report["tracking_uri"])
            parent = client.get_run(report["mlflow_parent_run_id"])
            self.assertEqual(parent.info.status, "FINISHED")
            self.assertAlmostEqual(parent.data.metrics["reference_validation_mae"], report["reference_validation_mae"])
            self.assertTrue(client.list_artifacts(parent.info.run_id))
            for method in baselines.METHODS:
                run = client.get_run(report["methods"][method]["mlflow_run_id"])
                self.assertEqual(run.info.status, "FINISHED")

    def test_failed_attempt_is_recorded(self):
        from mlflow.tracking import MlflowClient

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(FileNotFoundError):
                baselines.run_experiment(input_dir=root / "missing", experiment_dir=root / "experiments")
            failure_path = next((root / "experiments/runs").glob("*/failure.json"))
            failure = json.loads(failure_path.read_text())
            uri = "sqlite:///" + (root / "experiments/tracking/mlflow.db").resolve().as_posix()
            run = MlflowClient(tracking_uri=uri).get_run(failure["mlflow_run_id"])
            self.assertEqual(run.info.status, "FAILED")
            self.assertIn("FileNotFoundError", run.data.tags["failure_reason"])
            self.assertFalse((root / "experiments/latest.json").exists())


if __name__ == "__main__":
    unittest.main()
