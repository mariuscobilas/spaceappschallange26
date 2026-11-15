"""Feature leakage, fitted transforms, artifact roundtrips, and regression gates."""

import copy
import json
import math
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import clovis_regression as regression
import evaluate_clovis_regression as experiment


def observation(index=0, partition="train"):
    day = date(2023, 4, 1) + timedelta(days=index)
    previous = 0.2 + index * 0.001
    change = 0.001 * math.sin(index)
    return {"date": day.isoformat(), "previous_date": (day - timedelta(days=1)).isoformat(),
            "partition": partition, "treatment": "pea", "management_phase": "cover_period",
            "previous_moisture_m3_m3": previous, "soil_moisture_m3_m3": previous + change,
            "moisture_change_m3_m3": change, "cover_active": 1,
            "days_since_cover_planting": 36 + index, "days_since_cover_termination": "",
            "rain_mm": index % 4, "temperature_max_c": 20 + index % 3, "temperature_min_c": 5,
            "humidity_pct": 40 + index, "wind_speed_m_s": 2, "solar_radiation_mj_m2_day": 20,
            "irrigation_mm": 0}


class RegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = regression.load_protocol()
        cls.train = [observation(i) for i in range(20)]

    def fit(self, name="ridge_alpha_1"):
        return regression.WeatherRegressor.fit(name, self.train, self.protocol)

    def test_explicit_features_ignore_current_targets_and_metadata(self):
        original = observation()
        changed = {**original, "soil_moisture_m3_m3": float("nan"), "moisture_change_m3_m3": 999,
                   "source_id": "anything", "partition": "test"}
        np.testing.assert_array_equal(regression.feature_frame([original]).to_numpy(),
                                      regression.feature_frame([changed]).to_numpy())
        self.assertNotIn("soil_moisture_m3_m3", regression.FEATURES)
        self.assertNotIn("moisture_change_m3_m3", regression.FEATURES)

    def test_age_nulls_are_fixed_domain_values_not_fitted_imputation(self):
        frame = regression.feature_frame([{**observation(), "days_since_cover_planting": None}])
        self.assertEqual(frame.days_since_cover_planting.iloc[0], -1)
        self.assertEqual(frame.days_since_cover_termination.iloc[0], -1)

    def test_invalid_features_fail(self):
        for key, value in (("rain_mm", -1), ("humidity_pct", 101), ("wind_speed_m_s", float("inf")),
                           ("previous_moisture_m3_m3", 25), ("cover_active", 2),
                           ("treatment", "corn"), ("temperature_min_c", 40)):
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    regression.feature_frame([{**observation(), key: value}])

    def test_leap_year_season_features_are_finite_and_normalized(self):
        rows = [{**observation(), "date": "2024-02-29"}, {**observation(), "date": "2023-01-01"}]
        frame = regression.feature_frame(rows)
        for _, row in frame.iterrows():
            self.assertAlmostEqual(row.season_sin ** 2 + row.season_cos ** 2, 1)
        self.assertEqual(frame.season_cos.iloc[1], 1)

    def test_fit_rejects_heldout_rows(self):
        for partition in ("validation", "test"):
            with self.assertRaisesRegex(ValueError, "training-only"):
                regression.WeatherRegressor.fit("ridge_alpha_1", [observation(partition=partition)], self.protocol)

    def test_validation_cannot_change_scaler_or_learn_categories(self):
        model = self.fit()
        scaler = model.pipeline["features"].named_transformers_["numeric"]
        before = scaler.mean_.copy()
        validation = [{**observation(), "management_phase": "winter_wheat", "rain_mm": 250}]
        predicted, _, unknown = model.predict_many(validation)
        self.assertTrue(math.isfinite(predicted[0]))
        self.assertEqual(unknown, [True])
        np.testing.assert_array_equal(before, scaler.mean_)
        self.assertNotIn("winter_wheat", model.metadata["training_phases"])
        rain_index = regression.NUMERIC.index("rain_mm")
        self.assertAlmostEqual(scaler.mean_[rain_index], np.mean([r["rain_mm"] for r in self.train]))

    def test_serialization_roundtrip_and_runtime_contract(self):
        model = self.fit()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ridge.joblib"
            model.save(path)
            restored = regression.WeatherRegressor.load(path)
            np.testing.assert_allclose(model.predict_many(self.train)[0], restored.predict_many(self.train)[0])
            restored.metadata["sklearn_version"] = "incompatible"
            restored.save(path)
            with self.assertRaisesRegex(ValueError, "version differs"):
                regression.WeatherRegressor.load(path)

    def test_seeded_forest_is_deterministic(self):
        protocol = copy.deepcopy(self.protocol)
        protocol["candidates"]["forest_depth_4"]["n_estimators"] = 8
        a = regression.WeatherRegressor.fit("forest_depth_4", self.train, protocol)
        b = regression.WeatherRegressor.fit("forest_depth_4", self.train, protocol)
        np.testing.assert_allclose(a.predict_many(self.train)[0], b.predict_many(self.train)[0])

    def test_rollout_forwards_each_days_weather_and_uses_predicted_state(self):
        class RainRule:
            seen = []
            def predict_many(self, inputs):
                self.seen.extend((r["previous_moisture_m3_m3"], r["rain_mm"]) for r in inputs)
                return ([r["previous_moisture_m3_m3"] + r["rain_mm"] / 10000 for r in inputs],
                        [False] * len(inputs), [False] * len(inputs))
        rule = RainRule()
        rows = [{**observation(), "partition": "validation", "rain_mm": 100, "soil_moisture_m3_m3": 0.5},
                {**observation(1), "partition": "validation", "rain_mm": 200,
                 "previous_moisture_m3_m3": 0.5, "soil_moisture_m3_m3": 0.8}]
        result = regression.rollout(rule, rows, 2)
        self.assertEqual(result["windows"], 1)
        self.assertAlmostEqual(rule.seen[1][0], 0.21)
        self.assertEqual(rule.seen[1][1], 200)
        self.assertAlmostEqual(result["endpoint"]["mae"], 0.57)
        self.assertEqual(regression.rollout(rule, rows, 30)["windows"], 0)

    def test_adoption_requires_all_predeclared_gates(self):
        reference = {"validation": {"moisture": {"mae": 0.01}, "by_treatment": {"pea": {"mae": 0.01}}},
                     "rollouts": {"7": {"status": "evaluated", "endpoint": {"mae": 0.05}}}}
        metrics = {"moisture": {"mae": 0.0094}, "by_treatment": {"pea": {"mae": 0.01}}, "clipped_predictions": 0}
        recursive = {"7": {"status": "evaluated", "endpoint": {"mae": 0.04}, "clipped_steps": 0}}
        policy = self.protocol["adoption"]
        self.assertTrue(all(regression.adoption_checks(metrics, recursive, reference, policy).values()))
        bad = copy.deepcopy(metrics)
        bad["by_treatment"]["pea"]["mae"] = 0.02
        self.assertFalse(regression.adoption_checks(bad, recursive, reference, policy)["no_treatment_mae_above_limit"])
        recursive["7"]["endpoint"]["mae"] = 0.06
        self.assertFalse(regression.adoption_checks(metrics, recursive, reference, policy)["seven_day_endpoint_not_worse"])


@patch.dict("os.environ", {"MLFLOW_SQLALCHEMYSTORE_POOLCLASS": "NullPool"})
class RegressionExperimentTests(unittest.TestCase):
    def test_tracked_experiment_keeps_final_test_closed_and_roundtrips_artifacts(self):
        from mlflow.tracking import MlflowClient

        real_open = Path.open
        def guarded_open(path, *args, **kwargs):
            if path.name in {"test_features.csv", "test_pairs.csv"}:
                raise AssertionError("Final test file was opened")
            return real_open(path, *args, **kwargs)
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(Path, "open", guarded_open):
                summary = experiment.run_experiment(experiment_dir=Path(directory))
            output = Path(summary["run_directory"])
            report = json.loads((output / "results.json").read_text())
            self.assertFalse(report["selection"]["final_test_evaluated"])
            self.assertFalse(report["selection"]["refit_on_all_data"])
            self.assertEqual(len(report["candidates"]), 4)
            self.assertEqual(report["validation_rows"], 52)
            client = MlflowClient(tracking_uri=report["tracking_uri"])
            self.assertEqual(client.get_run(report["mlflow_parent_run_id"]).info.status, "FINISHED")
            for name, result in report["candidates"].items():
                self.assertEqual(client.get_run(result["mlflow_run_id"]).info.status, "FINISHED")
                restored = regression.WeatherRegressor.load(output / f"{name}.joblib")
                self.assertEqual(restored.metadata["training_rows"], 1048)
            eligible = [name for name, result in report["candidates"].items() if all(result["adoption_checks"].values())]
            selected = report["selection"]["selected_regression"]
            self.assertEqual(selected is None, not eligible)
            if selected:
                self.assertIn(selected, eligible)


if __name__ == "__main__":
    unittest.main()
