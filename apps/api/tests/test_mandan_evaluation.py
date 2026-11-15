"""Mandan tasks preserve year folds, training boundaries and physical units."""

import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import evaluate_mandan as evaluation


class MandanEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = json.loads(evaluation.PROTOCOL.read_text(encoding="utf-8"))

    def synthetic(self):
        observations, pairs = [], []
        for i, year in enumerate(self.protocol["years"]):
            control = {"observation_id": f"m/{year}/T1", "year": year, "rep": 1, "treatment": 1,
                "treatment_description": "untreated", "preplant_storage_0_210cm_mm": 400 + i * 20,
                "spring_storage_0_210cm_mm": 600 + i * 10, "wheat_yield_t_ha": 3 - i * 0.2}
            observations.append(control)
            for t, delta_initial, delta_spring, delta_yield in ((2, 10, 5, 0.1), (3, 20, -5, -0.2)):
                cover = {**control, "observation_id": f"m/{year}/T{t}", "treatment": t, "treatment_description": f"cover{t}",
                    "preplant_storage_0_210cm_mm": control["preplant_storage_0_210cm_mm"] + delta_initial,
                    "spring_storage_0_210cm_mm": control["spring_storage_0_210cm_mm"] + delta_spring,
                    "wheat_yield_t_ha": control["wheat_yield_t_ha"] + delta_yield}
                observations.append(cover)
                pairs.append({"pair_id": cover["observation_id"], "control_id": control["observation_id"],
                    "year": year, "rep": 1, "treatment": t, "treatment_description": cover["treatment_description"],
                    "delta_yield_t_ha": delta_yield, "delta_spring_storage_0_210cm_mm": delta_spring,
                    "delta_preplant_storage_0_210cm_mm": delta_initial})
        cohorts = {"spring_water_yield": copy.deepcopy(observations), "initial_spring_water_yield": copy.deepcopy(observations),
            "water_yield_pairs": copy.deepcopy(pairs), "initial_water_yield_pairs": copy.deepcopy(pairs)}
        protocol = copy.deepcopy(self.protocol)
        for task in protocol["tasks"].values():
            task["expected_n"] = len(cohorts[task["cohort"]])
        folds = [{"cohort": name, "held_out_year": year, "item_id": r.get("observation_id", r.get("pair_id")),
            "year": r["year"], "role": "evaluation" if r["year"] == year else "train"}
            for name, rows in cohorts.items() for year in protocol["years"] for r in rows]
        return cohorts, folds, observations, protocol

    def test_baselines_learn_change_only_from_training_and_do_not_read_future_target(self):
        task = self.protocol["tasks"]["spring_water"]
        train = [{"preplant_storage_0_210cm_mm": 100, "spring_storage_0_210cm_mm": 150},
                 {"preplant_storage_0_210cm_mm": 200, "spring_storage_0_210cm_mm": 260}]
        test = [{"preplant_storage_0_210cm_mm": 1000}]
        predicted, metadata = evaluation.fit_predict(train, test, task, task["methods"]["mean_change"], self.protocol)
        self.assertEqual(predicted, [1055])
        self.assertEqual(metadata["training_mean_change"], 55)
        self.assertEqual(evaluation.fit_predict(train, test, task, task["methods"]["persistence"], self.protocol)[0], [1000])
        self.assertEqual(evaluation.fit_predict(train, test, task, task["methods"]["mean_spring"], self.protocol)[0], [205])

    def test_ridge_scaler_and_treatment_categories_are_train_only(self):
        task = self.protocol["tasks"]["spring_water"]
        train = [{"preplant_storage_0_210cm_mm": x, "spring_storage_0_210cm_mm": x + 50, "treatment_description": "known"} for x in (100, 200)]
        test = [{"preplant_storage_0_210cm_mm": 1000, "treatment_description": "unseen"}]
        config = task["methods"]["ridge_initial_treatment"]
        first, fitted = evaluation.fit_predict(train, test, task, config, self.protocol)
        self.assertEqual(fitted["numeric_mean"], [150])
        self.assertEqual(fitted["numeric_scale"], [50])
        self.assertEqual(fitted["training_categories"], {"treatment_description": ["known"]})
        self.assertEqual(fitted["evaluation_unknown_category_rows"], 1)
        test[0]["spring_storage_0_210cm_mm"] = -999999
        self.assertEqual(evaluation.fit_predict(train, test, task, config, self.protocol)[0], first)

    def test_subtraction_requires_both_arms_from_same_held_out_year(self):
        row = {"pair_id": "c", "control_id": "f", "year": 2009}
        config = {"source_task": "yield_absolute", "source_method": "water"}
        lookup = {("yield_absolute", "water", "c"): {"year": 2009, "predicted": 4.2},
                  ("yield_absolute", "water", "f"): {"year": 2009, "predicted": 4.0}}
        self.assertAlmostEqual(evaluation.subtract_prediction(row, config, lookup, 2009), 0.2)
        lookup[("yield_absolute", "water", "f")]["year"] = 2010
        with self.assertRaisesRegex(ValueError, "same held-out year"):
            evaluation.subtract_prediction(row, config, lookup, 2009)
        del lookup[("yield_absolute", "water", "f")]
        with self.assertRaisesRegex(ValueError, "Missing held-out"):
            evaluation.subtract_prediction(row, config, lookup, 2009)

    def test_year_and_shared_control_leakage_rejected(self):
        cohorts, folds, source, protocol = self.synthetic()
        task = protocol["tasks"]["yield_difference"]
        bad = copy.deepcopy(folds)
        first = next(r for r in bad if r["cohort"] == task["cohort"])
        first["role"] = "train" if first["role"] == "evaluation" else "evaluation"
        with self.assertRaisesRegex(ValueError, "Year leakage"):
            evaluation.task_folds(cohorts[task["cohort"]], bad, task, protocol["years"], source)
        rows = copy.deepcopy(cohorts[task["cohort"]])
        rows[0]["control_id"] = "m/2010/T1"
        with self.assertRaisesRegex(ValueError, "Shared-control"):
            evaluation.task_folds(rows, folds, task, protocol["years"], source)

    def test_all_task_predictions_are_complete_and_deterministic(self):
        cohorts, folds, source, protocol = self.synthetic()
        result, predictions, fitted = evaluation.evaluate(cohorts, folds, source, protocol)
        self.assertEqual(len(predictions), 138)
        self.assertEqual(len(fitted), 19)
        for task_name, task in protocol["tasks"].items():
            for method in task["methods"]:
                selected = [p for p in predictions if p["task"] == task_name and p["method"] == method]
                self.assertEqual(len(selected), task["expected_n"])
                self.assertEqual(len({p["item_id"] for p in selected}), task["expected_n"])
                self.assertEqual(result["tasks"][task_name][method]["unit"], task["unit"])
                self.assertEqual(set(fitted[task_name + "/" + method]), {str(y) for y in protocol["years"]})
        again = evaluation.evaluate(cohorts, folds, source, protocol)
        self.assertEqual(evaluation.prep.json_bytes(result), evaluation.prep.json_bytes(again[0]))
        self.assertEqual(evaluation.prep.csv_bytes(predictions), evaluation.prep.csv_bytes(again[1]))

    def test_future_water_and_outcome_columns_are_excluded_from_early_predictors(self):
        early = self.protocol["tasks"]["spring_water"]
        for config in early["methods"].values():
            self.assertTrue(set(config.get("numeric", [])) <= {"preplant_storage_0_210cm_mm"})
            self.assertTrue(set(config.get("categorical", [])) <= {"treatment_description"})
        forbidden = {"observation_id", "pair_id", "rep", "year", "response_plot", "cover_biomass_kg_ha", "latefall_storage_0_210cm_mm"}
        for task in self.protocol["tasks"].values():
            for config in task["methods"].values():
                self.assertTrue(set(config.get("numeric", []) + config.get("categorical", [])).isdisjoint(forbidden))
                self.assertNotIn(task["target"], config.get("numeric", []))

    def test_water_difference_error_keeps_mm_and_control_balancing(self):
        rows = [{"year": year, "control_id": c, "observed": 0, "predicted": p, "treatment": 2}
            for year in self.protocol["years"] for c, p in (("A", 1), ("A", 1), ("B", 4))]
        task = self.protocol["tasks"]["spring_water_difference"]
        score = evaluation.summarize(rows, "spring_water_difference", task, self.protocol)
        self.assertEqual(score["unit"], "mm")
        self.assertEqual(score["macro_year_mae"], 2)
        self.assertEqual(score["macro_control_balanced_mae"], 2.5)
        self.assertNotIn("negative_predictions", score["pooled"])

    def test_yield_decisions_keep_rare_benefit_and_harm_counts(self):
        score = evaluation.scores([{"observed": 0.1, "predicted": 0}, {"observed": -0.2, "predicted": 0}], "yield_difference", 1e-12)
        self.assertAlmostEqual(score["mae"], 0.15)
        self.assertEqual(score["benefit_recall"], 0)
        self.assertEqual(score["harm_recall"], 1)
        self.assertEqual(score["balanced_accuracy"], 0.5)
        self.assertAlmostEqual(score["observed_pair_opportunity_loss_t_ha"], 0.05)


if __name__ == "__main__":
    unittest.main()
