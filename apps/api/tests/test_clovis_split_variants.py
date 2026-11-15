"""Audited dataset integrity, isolated fitting, and recursive evaluation contract."""

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import evaluate_clovis_split_variants as experiment
from test_clovis_regression import observation


class SplitVariantTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls.directory.name)
        cls.manifest = experiment.prepare_datasets(cls.root)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_materialized_counts_target_semantics_and_coverage_match_audit(self):
        expected = {"phase_balanced_70_15_15": [1856, 328, 356],
                    "global_chronological_70_15_15": [1864, 384, 392]}
        for variant, counts in expected.items():
            partitions = experiment.load_variant(self.root, variant)
            self.assertEqual([len(partitions[part]) for part in experiment.audit.PARTITIONS], counts)
            if variant.startswith("phase_balanced"):
                self.assertTrue(all(len({r["management_phase"] for r in values}) == 5 for values in partitions.values()))
            for part, rows in partitions.items():
                self.assertTrue(all(r["partition"] == part for r in rows))
                self.assertTrue(all(abs(r["soil_moisture_m3_m3"] - r["previous_moisture_m3_m3"] - r["moisture_change_m3_m3"]) < 1e-9 for r in rows))
        self.assertIn("daily-average", self.manifest["target_semantics"])
        self.assertFalse(self.manifest["fresh_independent_test"])

    def test_preparation_repeats_and_rejects_changed_prepared_data(self):
        self.assertEqual(self.manifest, experiment.prepare_datasets(self.root))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            experiment.prepare_datasets(root)
            path = root / "phase_balanced_70_15_15/train_features.csv"
            path.write_bytes(path.read_bytes() + b"\n")
            with self.assertRaisesRegex(ValueError, "features hash mismatch"):
                experiment.load_variant(root, "phase_balanced_70_15_15")
            with self.assertRaisesRegex(ValueError, "Existing prepared artifact differs"):
                experiment.prepare_datasets(root)

    def test_preparation_cannot_target_original_dataset(self):
        for directory in (experiment.prep.OUTPUT, experiment.weather.OUTPUT, experiment.audit.OUTPUT):
            with self.assertRaisesRegex(ValueError, "separate versioned"):
                experiment.prepare_datasets(directory)

    def test_materialization_rejects_bad_membership_or_missing_weather(self):
        rows = [observation(0), observation(1)]
        pairs = [{**r, "partition": "pool"} for r in rows]
        members = [{"date": r["date"], "treatment": r["treatment"], "management_phase": r["management_phase"],
                    "history_start_date": r["previous_date"], "lookback_days": 1, "partition": "train"} for r in rows]
        weather = [{"date": r["date"], "weather_eligible": True,
                    **{key: r[key] for key in experiment.scenarios.WEATHER_COLUMNS}} for r in rows]
        self.assertEqual(len(experiment.materialize_rows(pairs, members, weather)["train"]), 2)
        with self.assertRaisesRegex(ValueError, "Duplicate or unsupported"):
            experiment.materialize_rows(pairs, members + [members[0]], weather)
        with self.assertRaisesRegex(ValueError, "missing pair or weather"):
            experiment.materialize_rows(pairs, members, weather[:1])
        with self.assertRaisesRegex(ValueError, "history/phase differs"):
            experiment.materialize_rows(pairs, [{**members[0], "lookback_days": 3}], weather)

    def test_small_fixed_forest_keeps_preprocessing_train_only_and_roundtrips(self):
        train = [observation(i) for i in range(40)]
        model = experiment.regression.WeatherRegressor.fit("forest_depth_4", train, experiment.regression.load_protocol())
        scaler = model.pipeline["features"].named_transformers_["numeric"]
        before = scaler.mean_.copy()
        partitions = {"train": train,
                      "validation": [{**observation(i, "validation"), "rain_mm": 250} for i in range(14)],
                      "test": [{**observation(i, "test"), "rain_mm": 300} for i in range(14)]}
        policy = copy.deepcopy(experiment.load_protocol())
        policy["uncertainty"]["replicates"] = 20
        with patch.object(experiment.regression.WeatherRegressor, "fit", side_effect=AssertionError("Refit during evaluation")):
            result, predictions = experiment.evaluate_variant(model, partitions, policy)
        np.testing.assert_array_equal(before, scaler.mean_)
        rain_index = experiment.regression.NUMERIC.index("rain_mm")
        self.assertAlmostEqual(before[rain_index], np.mean([r["rain_mm"] for r in train]))
        self.assertEqual(result["partitions"]["test"]["rollouts"]["7"]["model"]["windows"], 8)
        self.assertEqual(result["partitions"]["test"]["rollouts"]["30"]["model"]["windows"], 0)
        self.assertFalse(result["recommendation_ready"])
        self.assertFalse(result["promoted"])
        self.assertEqual(len(predictions["test"]), 28)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixed.joblib"
            model.save(path)
            restored = experiment.regression.WeatherRegressor.load(path)
            np.testing.assert_array_equal(model.predict_many(partitions["test"])[0], restored.predict_many(partitions["test"])[0])
        json.dumps(result, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
