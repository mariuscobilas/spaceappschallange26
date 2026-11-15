"""Fixed model comparisons preserve cohorts, references and training boundaries."""

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import compare_water_yield_models as comparison
import evaluate_water_yield as base
import prepare_water_yield as prep


class ComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
        cls.settings = json.loads(comparison.PROTOCOL.read_text(encoding="utf-8"))
        cls.schema = json.loads((prep.OUTPUT / "feature_schema.json").read_text(encoding="utf-8"))

    def synthetic(self):
        rows = []
        for season_index, season in enumerate(self.protocol["folds"]):
            for plot in range(3):
                rows.append({"observation_id": f"synthetic_{season}_{plot}", "season_id": season,
                    "trial": "synthetic", "tillage": "NT", "planting_window": "Fall", "cover_mix": "synthetic",
                    self.protocol["water"]: 100 + 10 * plot, self.protocol["target"]: 1 + 0.2 * season_index + 0.1 * plot,
                    self.protocol["nitrate"]: "" if season_index == 0 and plot == 0 else 5 + plot,
                    **{f["feature"]: (i + 1) * (season_index + 1) for i, f in enumerate(self.protocol["weather_features"])}})
        nitrate = [r for r in rows if r[self.protocol["nitrate"]] != ""]
        folds = prep.make_folds({"main": rows, "nitrate_common": nitrate}, self.protocol["folds"])
        small = copy.deepcopy(self.settings)
        # Tiny tree counts for synthetic integrity tests, never real-data experiments.
        for params in small["tree_candidates"].values():
            params["n_estimators"] = 2
        reference = base.evaluate(rows, folds, self.schema, self.protocol)[1]
        return rows, folds, small, reference

    def test_held_out_targets_not_read_and_tree_rng_is_deterministic(self):
        train = [{"water": i, "yield": 0.1 * i} for i in range(20)]
        for model in self.settings["tree_candidates"]:
            with self.subTest(model=model):
                test = [{"water": 100, "yield": -999}]
                prediction, metadata = comparison.fit_tree(train, test, ["water"], "yield", model, self.settings)
                del test[0]["yield"]
                again = comparison.fit_tree(train, test, ["water"], "yield", model, self.settings)[0]
                self.assertEqual(prediction, again)
                self.assertEqual(metadata["training_n"], 20)
                self.assertAlmostEqual(metadata["training_target_max"], 1.9)
                self.assertEqual(metadata["preprocessing"], "none")
                test[0]["yield"] = -999

    def test_changed_reference_fails_before_any_tree_fit(self):
        rows, folds, settings, reference = self.synthetic()
        reference[0]["predicted_yield_t_ha"] += 0.1
        with patch.object(comparison, "fit_tree") as fit:
            with self.assertRaisesRegex(ValueError, "prediction mismatch"):
                comparison.compare(rows, folds, self.schema, self.protocol, settings, reference)
            fit.assert_not_called()
        with self.assertRaisesRegex(ValueError, "cohort differs"):
            comparison.verify_reference(reference, reference[:-1])

    def test_all_models_use_identical_rows_and_folds(self):
        rows, folds, settings, reference = self.synthetic()
        result, predictions, metadata = comparison.compare(rows, folds, self.schema, self.protocol, settings, reference)
        self.assertEqual(len(predictions), 15 * 10 + 14 * 13)
        self.assertEqual(len(metadata), 23)
        self.assertTrue(result["reference_replayed"])
        for cohort, n in (("main", 15), ("nitrate_common", 14)):
            for family in settings["feature_families"][cohort]:
                ids = None
                for model in ("ridge", *settings["tree_candidates"]):
                    selected = [r for r in predictions if (r["cohort"], r["feature_family"], r["model"]) == (cohort, family, model)]
                    self.assertEqual(len(selected), n)
                    keys = {r["observation_id"] for r in selected}
                    self.assertEqual(len(keys), n)
                    ids = keys if ids is None else ids
                    self.assertEqual(keys, ids)
                    self.assertEqual(set(metadata[f"{cohort}/{family}/{model}"]), set(self.protocol["folds"]))
        repeated = comparison.compare(rows, folds, self.schema, self.protocol, settings, reference)
        self.assertEqual(prep.json_bytes(result), prep.json_bytes(repeated[0]))
        self.assertEqual(prep.csv_bytes(predictions), prep.csv_bytes(repeated[1]))

    def test_reference_pin_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "reference.json"
            path.write_bytes(b"original")
            settings = {"pinned_sha256": {str(path): prep.digest(path)}}
            comparison.verify_pins(settings)
            path.write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                comparison.verify_pins(settings)

    def test_fold_leakage_and_feature_changes_rejected(self):
        rows, folds, settings, reference = self.synthetic()
        bad = copy.deepcopy(folds)
        bad[0]["role"] = "train" if bad[0]["role"] == "evaluation" else "evaluation"
        with self.assertRaisesRegex(ValueError, "Season leakage"):
            comparison.compare(rows, bad, self.schema, self.protocol, settings, reference)
        settings["feature_families"]["main"].append("water_weather_nitrate")
        with self.assertRaisesRegex(ValueError, "changed declared feature"):
            comparison.compare(rows, folds, self.schema, self.protocol, settings, reference)


if __name__ == "__main__":
    unittest.main()
