"""Verify portable learned weights, provenance replay and feature/unit boundaries."""

import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "apps/api/app/ml"))
import export_research_yield_model as export
from research_yield_model import load_research_model, predict_yield


class ResearchYieldBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files, cls.policy = export.build_bundle()
        cls.directory = ROOT / cls.policy["output"]
        cls.model = load_research_model(cls.directory)
        cls.input = dict(zip(cls.model["features"], cls.model["scaler_mean"]))

    def test_all_data_export_is_reproducible_and_separate_from_validation(self):
        for name, content in self.files.items():
            self.assertEqual(content, (self.directory / name).read_bytes())
        manifest = json.loads(self.files["bundle.json"])
        self.assertEqual(manifest["portable_parity_checked_rows"], 88)
        self.assertTrue(manifest["all_data_refit"])
        self.assertFalse(manifest["farmer_ready"])
        self.assertFalse(manifest["production_serving_changed"])
        self.assertIn("not this all-data refit", manifest["validation_belongs_to"])

    def test_portable_prediction_matches_sklearn_on_new_numeric_inputs(self):
        protocol = json.loads(export.prep.PROTOCOL.read_text(encoding="utf-8"))
        rows = export.prep.read_csv(export.prep.OUTPUT / "observations.csv")
        features = self.model["features"]
        evaluation = [{name: value + self.model["scaler_scale"][i] * 0.37 for i, (name, value) in enumerate(self.input.items())}]
        expected, _ = export.evaluation.fit_predict(rows, evaluation, features, protocol)
        self.assertAlmostEqual(predict_yield(self.model, evaluation[0], self.model["feature_units"]), expected[0], places=12)
        # Dict insertion order cannot silently reorder model features.
        reversed_input = dict(reversed(list(evaluation[0].items())))
        self.assertEqual(predict_yield(self.model, reversed_input, self.model["feature_units"]), predict_yield(self.model, evaluation[0], self.model["feature_units"]))

    def test_missing_extra_and_nonfinite_inputs_rejected(self):
        for bad in ({}, {**self.input, "yield": 1}, {**self.input, self.model["features"][0]: float("nan")}, {**self.input, self.model["features"][0]: True}):
            with self.assertRaises(ValueError):
                predict_yield(self.model, bad, self.model["feature_units"])

    def test_water_units_cannot_silently_change(self):
        units = dict(self.model["feature_units"])
        units[self.model["features"][0]] = "m3/m3"
        with self.assertRaises(ValueError):
            predict_yield(self.model, self.input, units)

    def test_corrupt_artifact_and_path_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / "bundle.json").write_bytes(self.files["bundle.json"])
            (directory / "model.json").write_bytes(self.files["model.json"] + b" ")
            with self.assertRaisesRegex(ValueError, "hash"):
                load_research_model(directory)
            manifest = json.loads(self.files["bundle.json"])
            manifest["artifact"] = "../model.json"
            (directory / "bundle.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_research_model(directory)

    def test_negative_predictions_retained_and_invalid_scales_rejected(self):
        model = copy.deepcopy(self.model)
        model["intercept"] = -1.0
        self.assertEqual(predict_yield(model, self.input, model["feature_units"]), -1.0)
        for value in (0, -1, float("inf")):
            model["scaler_scale"][0] = value
            with self.assertRaises(ValueError):
                predict_yield(model, self.input, model["feature_units"])


if __name__ == "__main__":
    unittest.main()
