"""Integrity and decision-metric checks for matched cover/fallow contrasts."""

import copy
import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import evaluate_cover_fallow as contrast
import compare_water_yield_models as models
import prepare_water_yield as prep


class ContrastTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = json.loads(contrast.PROTOCOL.read_text(encoding="utf-8"))
        cls.source = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
        cls.trees = json.loads(models.PROTOCOL.read_text(encoding="utf-8"))
        cls.observations = prep.read_csv(prep.OUTPUT / "observations.csv")
        cls.raw_pairs = prep.read_csv(prep.OUTPUT / "paired_observations.csv")
        cls.weather = [f["feature"] for f in cls.source["weather_features"]]

    def synthetic(self):
        pairs, main, absolute = [], [], {}
        for i, season in enumerate(self.source["folds"]):
            control = "fallow_" + season
            main.append({"observation_id": control, "season_id": season})
            for model in self.protocol["models"]:
                absolute[(model, control)] = 1.0
            for j in range(2):
                identity = f"cover_{season}_{j}"
                pairs.append({"pair_id": identity, "control_id": control, "season_id": season,
                    "trial": "synthetic", "tillage": "NT", "planting_window": "Fall", "cover_mix": "synthetic",
                    "delta_profile_water_mm": (-10 if j == 0 else 5) + i,
                    "delta_yield_t_ha": -0.5 if j == 0 else 0.2,
                    **{f: (i + 1) * (k + 1) for k, f in enumerate(self.weather)}})
                main.append({"observation_id": identity, "season_id": season})
                for model in self.protocol["models"]:
                    absolute[(model, identity)] = 0.8 if j == 0 else 1.1
        folds = prep.make_folds({"main": main, "paired": pairs}, self.source["folds"])
        trees = copy.deepcopy(self.trees)
        for params in trees["tree_candidates"].values():
            params["n_estimators"] = 2  # Synthetic integrity checks only.
        return pairs, folds, absolute, trees

    def test_verified_pairs_keep_signed_differences_and_shared_controls(self):
        pairs = contrast.build_pairs(self.observations, self.raw_pairs, self.weather, self.protocol)
        self.assertEqual(len(pairs), 68)
        self.assertEqual(len({r["control_id"] for r in pairs}), 20)
        first = pairs[0]
        self.assertAlmostEqual(first["delta_yield_t_ha"], first["cover_yield_t_ha"] - first["fallow_yield_t_ha"])
        self.assertAlmostEqual(first["delta_profile_water_mm"], first["cover_profile_water_mm"] - first["fallow_profile_water_mm"])
        self.assertTrue(any(r["delta_yield_t_ha"] < 0 for r in pairs))
        bad = copy.deepcopy(self.raw_pairs)
        bad[0]["cover_minus_fallow_wheat_yield_t_ha"] = "999"
        with self.assertRaisesRegex(ValueError, "arithmetic"):
            contrast.build_pairs(self.observations, bad, self.weather, self.protocol)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            contrast.build_pairs(self.observations, self.raw_pairs + [self.raw_pairs[0]], self.weather, self.protocol)

    def test_shared_control_and_whole_season_leakage_rejected(self):
        pairs, folds, _, _ = self.synthetic()
        contrast.validate_folds(pairs, folds, self.source["folds"])
        for cohort in ("main", "paired"):
            bad = copy.deepcopy(folds)
            row = next(r for r in bad if r["cohort"] == cohort)
            row["role"] = "train" if row["role"] == "evaluation" else "evaluation"
            with self.subTest(cohort=cohort), self.assertRaisesRegex(ValueError, "leakage"):
                contrast.validate_folds(pairs, bad, self.source["folds"])

    def test_decision_confusion_and_opportunity_loss(self):
        rows = [{"observed_delta_yield_t_ha": a, "predicted_delta_yield_t_ha": p}
                for a, p in ((1, -1), (-2, 1), (0, 0))]
        result = contrast.scores(rows, 1e-12)
        self.assertAlmostEqual(result["mae"], 5 / 3)
        self.assertAlmostEqual(result["rmse"], math.sqrt(13 / 3))
        self.assertEqual(result["balanced_accuracy"], 0)
        self.assertEqual(result["false_cover_harm_n"], 1)
        self.assertEqual(result["missed_cover_benefit_n"], 1)
        self.assertEqual(result["observed_tie_n"], 1)
        self.assertEqual(result["observed_pair_opportunity_loss_t_ha"], 1)
        self.assertNotIn("negative_predictions", result)

    def test_always_fallow_accuracy_does_not_hide_class_imbalance(self):
        rows = [{"observed_delta_yield_t_ha": -1, "predicted_delta_yield_t_ha": 0} for _ in range(99)]
        rows.append({"observed_delta_yield_t_ha": 1, "predicted_delta_yield_t_ha": 0})
        score = contrast.scores(rows, 1e-12)
        self.assertEqual(score["decision_accuracy_nonzero"], 0.99)
        self.assertEqual(score["balanced_accuracy"], 0.5)
        self.assertEqual(score["benefit_recall"], 0)
        self.assertIsNone(contrast.scores(rows[:-1], 1e-12)["balanced_accuracy"])

    def test_control_balanced_metric_does_not_count_reused_control_as_independent(self):
        rows = [{"observed_delta_yield_t_ha": 0, "predicted_delta_yield_t_ha": p,
                 "control_id": control, "season_id": "s", "trial": "t", "tillage": "NT", "planting_window": "Fall", "cover_mix": "c"}
                for control, p in (("A", 1), ("A", 1), ("B", 4))]
        summary = contrast.summarize(rows, ["s"], 1e-12)
        self.assertEqual(summary["macro_season_mae"], 2)
        self.assertEqual(summary["macro_control_balanced_mae"], 2.5)

    def test_oof_completeness_determinism_and_evaluation_target_isolation(self):
        pairs, folds, absolute, trees = self.synthetic()
        report, predictions, fitted = contrast.evaluate(pairs, folds, absolute, self.protocol, self.source, trees)
        self.assertEqual(len(report["methods"]), 11)
        self.assertEqual(len(predictions), 110)
        self.assertEqual(len(fitted), 8)
        for method, summary in report["methods"].items():
            selected = [r for r in predictions if r["method"] == method]
            self.assertEqual(len({r["pair_id"] for r in selected}), 10)
            self.assertEqual(summary["pooled"]["n"], 10)
        again = contrast.evaluate(pairs, folds, absolute, self.protocol, self.source, trees)
        self.assertEqual(prep.json_bytes(report), prep.json_bytes(again[0]))
        self.assertEqual(prep.csv_bytes(predictions), prep.csv_bytes(again[1]))
        changed = copy.deepcopy(pairs)
        held_out = self.source["folds"][0]
        for row in changed:
            if row["season_id"] == held_out:
                row["delta_yield_t_ha"] += 1000
        perturbed = contrast.evaluate(changed, folds, absolute, self.protocol, self.source, trees)[1]
        get = lambda rows: {(r["method"], r["pair_id"]): r["predicted_delta_yield_t_ha"] for r in rows if r["season_id"] == held_out}
        self.assertEqual(get(predictions), get(perturbed))
        mean_prediction = fitted["training_mean_difference"][held_out]["predicted_difference"]
        self.assertAlmostEqual(mean_prediction, -0.15)

    def test_absolute_reference_is_complete_and_keeps_arm_identity(self):
        observations = [{"observation_id": "cover", "season_id": "s", "wheat_yield_t_ha": 1},
                        {"observation_id": "fallow", "season_id": "s", "wheat_yield_t_ha": 2}]
        reference = [{"cohort": "main", "feature_family": "water_weather", "model": "ridge",
                      "observation_id": r["observation_id"], "season_id": "s", "observed_yield_t_ha": r["wheat_yield_t_ha"],
                      "predicted_yield_t_ha": r["wheat_yield_t_ha"] + 0.5} for r in observations]
        indexed = contrast.absolute_index(reference, observations, ["ridge"])
        self.assertEqual(indexed[("ridge", "cover")] - indexed[("ridge", "fallow")], -1)
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            contrast.absolute_index(reference[:-1], observations, ["ridge"])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            contrast.absolute_index(reference + [reference[0]], observations, ["ridge"])
        reference[0]["season_id"] = "other"
        with self.assertRaisesRegex(ValueError, "source/season"):
            contrast.absolute_index(reference, observations, ["ridge"])

    def test_predictors_exclude_arm_yields_and_ids(self):
        allowed = {"delta_profile_water_mm", *self.weather}
        for features in self.protocol["feature_families"].values():
            self.assertTrue(set(features) <= allowed)
            self.assertNotIn(self.protocol["target"], features)


if __name__ == "__main__":
    unittest.main()
