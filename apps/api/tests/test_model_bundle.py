"""Portable model replacement preserves the service's feature and hash contract."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import service
from app.ml.model_bundle import export_bundle, load_bundle


class ModelBundleTests(unittest.TestCase):
    def test_export_load_and_server_selection_without_training(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            with patch.object(service.legacy.regression.WeatherRegressor, "fit", side_effect=AssertionError("Unexpected training")):
                manifest = export_bundle(path)
                model, info = load_bundle(path)
                self.assertEqual(model.name, info["name"])
                self.assertEqual(service.legacy.prep.digest(path / "model.joblib"), manifest["artifact_sha256"])
                with patch.dict(os.environ, {"FIELD_SHIFT_MODEL_BUNDLE": str(path)}):
                    engine = service.load_engine()
                    self.assertEqual(engine.model_info["artifact_sha256"], manifest["artifact_sha256"])

    def test_tampered_hash_and_metadata_fail_before_use(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            manifest = export_bundle(path)
            changed = dict(manifest, feature_columns=["wrong_feature"])
            (path / "bundle.json").write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "feature/runtime metadata"):
                load_bundle(path)
            (path / "bundle.json").write_text(json.dumps(manifest), encoding="utf-8")
            (path / "model.joblib").write_bytes(b"tampered")
            with patch.object(service.legacy.regression.WeatherRegressor, "load", side_effect=AssertionError("Unsafe load")):
                with self.assertRaisesRegex(ValueError, "hash mismatch"):
                    load_bundle(path)


if __name__ == "__main__":
    unittest.main()
