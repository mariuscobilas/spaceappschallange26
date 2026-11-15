"""Verify portable learned weights, provenance replay and feature/unit boundaries."""

import copy
import importlib.metadata
import json
import math
import platform
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "apps/api/app/ml"))
import export_research_yield_model as export
from research_yield_model import load_research_model, predict_yield
import verify_research_replay


class ResearchYieldBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Keep integrity verification portable across runtimes, while reserving
        # byte-identical refit reproduction for the recorded environment.
        cls.audit = verify_research_replay.verify()
        cls.policy = json.loads(export.POLICY.read_text(encoding="utf-8"))
        cls.directory = ROOT / cls.policy["output"]
        cls.files = {name: (cls.directory / name).read_bytes() for name in ("model.json", "bundle.json")}
        cls.model = load_research_model(cls.directory)
        cls.input = dict(zip(cls.model["features"], cls.model["scaler_mean"]))

    def test_exact_all_data_export_reproduces_recorded_bytes(self):
        manifest = json.loads(self.files["bundle.json"])
        required = manifest["runtime"]
        actual = {"python": platform.python_version(), **{name: importlib.metadata.version(name)
            for name in ("numpy", "scipy", "scikit-learn")}}
        if actual != required:
            self.skipTest(f"Exact frozen export requires {required}; current runtime is {actual}")
        rebuilt, _ = export.build_bundle()
        self.assertEqual(rebuilt, self.files)

    def test_recorded_bundle_metadata_and_validation_scope(self):
        manifest = json.loads(self.files["bundle.json"])
        for name, content in self.files.items():
            self.assertEqual(content, (self.directory / name).read_bytes())
        self.assertEqual(manifest["portable_parity_checked_rows"], 88)
        self.assertTrue(manifest["all_data_refit"])
        self.assertFalse(manifest["farmer_ready"])
        self.assertFalse(manifest["production_serving_changed"])
        self.assertIn("not this all-data refit", manifest["validation_belongs_to"])

    def test_frozen_exporter_still_rejects_runtime_manifest_mismatch(self):
        actual = {"python": platform.python_version(), **{name: importlib.metadata.version(name)
            for name in ("numpy", "scipy", "scikit-learn")}}
        if self.audit["exact_prepared_replay"]:
            self.skipTest(f"Prepared replay exactly matches; no runtime-manifest mismatch to exercise (runtime {actual})")
        with self.assertRaisesRegex(ValueError, "Prepared replay differs: manifest.json"):
            export.build_bundle()

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
