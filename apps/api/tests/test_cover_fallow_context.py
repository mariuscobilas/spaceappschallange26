"""Context ablation keeps source labels, whole seasons and preprocessing isolated."""

import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import evaluate_cover_fallow_context as context
import evaluate_cover_fallow as contrast
import prepare_water_yield as prep


class ContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = json.loads(context.PROTOCOL.read_text(encoding="utf-8"))
        cls.source = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))

    def synthetic(self):
        pairs, main = [], []
        for i, season in enumerate(self.source["folds"]):
            control = "fallow_" + season
            main.append({"observation_id": control, "season_id": season})
            for j in range(2):
                identity = f"cover_{season}_{j}"
                pairs.append({"pair_id": identity, "control_id": control, "season_id": season,
                    "trial": "synthetic", "tillage": "NT" if j else "CT", "planting_window": "Fall" if j else "Spring", "cover_mix": "test",
                    "delta_profile_water_mm": -10 + j * 15 + i, "fallow_profile_water_mm": 150 + i * 10,
                    "season_rain_mm": 200 + i * 50, "delta_yield_t_ha": -0.5 if j == 0 else 0.2})
                main.append({"observation_id": identity, "season_id": season})
        pairs = context.attach_growth(pairs, {p["pair_id"]: 1000 + i * 20 for i, p in enumerate(pairs)})
        memberships = prep.make_folds({"main": main, "paired": pairs}, self.source["folds"])
        references, summaries = [], {}
        for method in self.protocol["reference_methods"]:
            selected = [{"method": method, **{k: p[k] for k in ("pair_id", "control_id", "season_id", "trial", "tillage", "planting_window", "cover_mix")},
                "observed_delta_yield_t_ha": p["delta_yield_t_ha"], "predicted_delta_yield_t_ha": 0.0 if method == "zero_difference" else -0.15} for p in pairs]
            references.extend(selected)
            summaries[method] = contrast.summarize(selected, self.source["folds"], 1e-12)
        return pairs, memberships, references, {"methods": summaries}

    def test_source_biomass_covers_unchanged_68_pairs(self):
        previous = json.loads(contrast.PROTOCOL.read_text(encoding="utf-8"))
        pairs = contrast.build_pairs(prep.read_csv(prep.OUTPUT / "observations.csv"), prep.read_csv(prep.OUTPUT / "paired_observations.csv"),
            [f["feature"] for f in self.source["weather_features"]], previous)
        grown = context.attach_growth(pairs, context.read_biomass(prep.ROOT / "data/dryad_eash_2025/Cover_Crop_Trials_Data.xlsx"))
        self.assertEqual(len(grown), 68)
        self.assertEqual({p["pair_id"] for p in grown}, {p["pair_id"] for p in pairs})
        self.assertTrue(all(p["biomass_rain_kg_mm_ha"] == p["cover_biomass_kg_ha"] * p["season_rain_mm"] for p in grown))
        self.assertTrue(all("cover_biomass_kg_ha" not in p for p in pairs))
        with self.assertRaisesRegex(ValueError, "no imputation"):
            context.attach_growth(pairs, {})

    def test_numeric_scaling_and_categories_learn_only_from_training(self):
        train = [{"delta_profile_water_mm": i, "fallow_profile_water_mm": 100 + i, "season_rain_mm": 200 + i,
                  "planting_window": "Fall", "tillage": "NT", "control_id": "A", "delta_yield_t_ha": i * 0.1} for i in (0, 2)]
        test = [{**train[0], "delta_profile_water_mm": 1000, "planting_window": "Unseen", "tillage": "New"}]
        predicted, fitted = context.fit_predict(train, test, self.protocol["numeric_features"]["context"], self.protocol)
        self.assertEqual(fitted["numeric_mean"], [1, 101, 201])
        self.assertEqual(fitted["training_categories"], {"planting_window": ["Fall"], "tillage": ["NT"]})
        self.assertEqual(fitted["evaluation_unknown_category_rows"], 1)
        del test[0]["delta_yield_t_ha"]
        self.assertEqual(predicted, context.fit_predict(train, test, self.protocol["numeric_features"]["context"], self.protocol)[0])

    def test_reference_corruption_fails_before_fit(self):
        pairs, memberships, references, old_results = self.synthetic()
        references[0]["predicted_delta_yield_t_ha"] = 999
        with patch.object(context, "fit_predict") as fit:
            with self.assertRaisesRegex(ValueError, "metrics failed exact replay"):
                context.evaluate(pairs, memberships, references, self.protocol, self.source, old_results)
            fit.assert_not_called()
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            context.reference_rows(references[:-1], pairs, self.protocol["reference_methods"])

    def test_prediction_cohort_completeness_and_determinism(self):
        pairs, memberships, references, old_results = self.synthetic()
        first = context.evaluate(pairs, memberships, references, self.protocol, self.source, old_results)
        report, predictions, metadata = first
        self.assertEqual(len(predictions), 60)
        self.assertEqual(len(report["methods"]), 6)
        self.assertTrue(report["references_replayed"])
        self.assertEqual(set(metadata), {"context", "context_biomass"})
        for method, summary in report["methods"].items():
            self.assertEqual(summary["pooled"]["n"], 10)
            self.assertEqual(len({p["pair_id"] for p in predictions if p["method"] == method}), 10)
        second = context.evaluate(pairs, memberships, references, self.protocol, self.source, old_results)
        self.assertEqual(prep.json_bytes(first[0]), prep.json_bytes(second[0]))
        self.assertEqual(prep.csv_bytes(first[1]), prep.csv_bytes(second[1]))

    def test_leaked_folds_rejected(self):
        pairs, memberships, references, old_results = self.synthetic()
        bad = copy.deepcopy(memberships)
        item = next(r for r in bad if r["cohort"] == "paired")
        item["role"] = "train" if item["role"] == "evaluation" else "evaluation"
        with self.assertRaisesRegex(ValueError, "leakage"):
            context.evaluate(pairs, bad, references, self.protocol, self.source, old_results)

    def test_allowlists_nested_family_and_invalid_inputs(self):
        basic, grown = (self.protocol["numeric_features"][k] for k in ("context", "context_biomass"))
        self.assertEqual(grown[:len(basic)], basic)
        self.assertEqual(set(grown) - set(basic), {"cover_biomass_kg_ha", "biomass_rain_kg_mm_ha"})
        self.assertTrue(set(grown).isdisjoint({"pair_id", "control_id", "delta_yield_t_ha", "cover_yield_t_ha", "fallow_yield_t_ha"}))
        for value in (None, -1, float("nan"), float("inf")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                context.attach_growth([{"pair_id": "A", "season_rain_mm": 100}], {"A": value})


if __name__ == "__main__":
    unittest.main()
