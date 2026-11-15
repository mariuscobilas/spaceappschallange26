import csv
import json
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))

import evaluate_mandan_weather as evaluation
import prepare_mandan_weather as preparation
import prepare_water_yield as io

RUN = io.ROOT / "data/experiments/mandan_weather_ablation_v1/runs/20261115T143248469336Z"


class MandanWeatherAblationTests(unittest.TestCase):
    def test_prepared_snapshot_counts_and_weather_join(self):
        snapshot = preparation.build_snapshot()
        self.assertEqual(set(snapshot), {"spring_water_yield.csv", "water_yield_pairs.csv", "fold_memberships.csv", "inventory.json"})
        self.assertEqual(len(io.read_csv(preparation.OUTPUT / "spring_water_yield.csv")), 176)
        self.assertEqual(len(io.read_csv(preparation.OUTPUT / "water_yield_pairs.csv")), 142)
        rows = io.read_csv(preparation.OUTPUT / "spring_water_yield.csv")
        for year in (2009, 2010, 2011):
            vectors = {tuple(float(r[f]) for f in evaluation.WEATHER) for r in rows if int(r["year"]) == year}
            self.assertEqual(len(vectors), 1)

    def test_saved_oof_subtractions_use_same_year_absolute_arms(self):
        with (RUN / "oof_predictions.csv").open(newline="", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        absolute = {(r["method"], r["item_id"]): r for r in rows if r["task"] == "yield_absolute"}
        paired = [r for r in rows if r["task"] == "yield_difference"]
        for method, absolute_method in (("subtract_water", "water"), ("subtract_weather", "weather"),
                                        ("subtract_water_weather", "water_weather")):
            selected = [r for r in paired if r["method"] == method]
            self.assertEqual(len(selected), 142)
            self.assertEqual(len({r["item_id"] for r in selected}), 142)
            for row in selected:
                cover = absolute[(absolute_method, row["item_id"])]
                control = absolute[(absolute_method, row["control_id"])]
                self.assertEqual(cover["year"], row["year"])
                self.assertEqual(control["year"], row["year"])
                expected = float(cover["predicted"]) - float(control["predicted"])
                self.assertAlmostEqual(float(row["predicted"]), expected, places=14)
                if method == "subtract_weather":
                    self.assertEqual(float(row["predicted"]), 0.0)

    def test_oof_methods_have_one_complete_prediction_per_item(self):
        with (RUN / "oof_predictions.csv").open(newline="", encoding="utf-8") as stream:
            predictions = list(csv.DictReader(stream))
        cohort_sizes = {"yield_absolute": 176, "yield_difference": 142}
        methods = {"yield_absolute": {"mean", "water", "weather", "water_weather"},
                   "yield_difference": {"zero", "mean_difference", "direct_water", "direct_water_weather",
                                       "subtract_water", "subtract_weather", "subtract_water_weather"}}
        for task, expected_n in cohort_sizes.items():
            for method in methods[task]:
                rows = [r for r in predictions if r["task"] == task and r["method"] == method]
                self.assertEqual(len(rows), expected_n)
                self.assertEqual(len({r["item_id"] for r in rows}), expected_n)
                self.assertEqual({int(r["year"]) for r in rows}, {2009, 2010, 2011})

    def test_fold_memberships_keep_pairs_and_controls_in_one_year_role(self):
        pairs = {r["pair_id"]: r for r in io.read_csv(preparation.OUTPUT / "water_yield_pairs.csv")}
        memberships = io.read_csv(preparation.OUTPUT / "fold_memberships.csv")
        for held_year in (2009, 2010, 2011):
            fold = [r for r in memberships if r["cohort"] == "water_yield_pairs" and int(r["held_out_year"]) == held_year]
            self.assertEqual(len(fold), 142)
            roles = {}
            for member in fold:
                pair = pairs[member["item_id"]]
                self.assertEqual(int(pair["year"]), int(member["year"]))
                self.assertEqual(member["role"], "evaluation" if int(pair["year"]) == held_year else "train")
                for identifier in (pair["pair_id"], pair["control_id"]):
                    assignment = (pair["year"], member["role"])
                    if identifier in roles:
                        self.assertEqual(roles[identifier], assignment)
                    else:
                        roles[identifier] = assignment
            self.assertEqual(len(roles), 142 + len({r["control_id"] for r in pairs.values()}))
            self.assertTrue(all(year != held_year or role == "evaluation" for year, role in roles.values()))

    def test_mean_baseline_is_computed_from_training_years_only(self):
        with (RUN / "oof_predictions.csv").open(newline="", encoding="utf-8") as stream:
            predictions = list(csv.DictReader(stream))
        cohort = {r["observation_id"]: r for r in io.read_csv(preparation.OUTPUT / "spring_water_yield.csv")}
        for held_year in (2009, 2010, 2011):
            train = [float(r["wheat_yield_t_ha"]) for r in cohort.values() if int(r["year"]) != held_year]
            expected = sum(train) / len(train)
            oof = [r for r in predictions if r["task"] == "yield_absolute" and r["method"] == "mean" and int(r["year"]) == held_year]
            self.assertEqual(len(oof), sum(int(r["year"]) == held_year for r in cohort.values()))
            self.assertTrue(all(abs(float(r["predicted"]) - expected) < 1e-12 for r in oof))

    def test_heldout_target_changes_do_not_change_fit_predictions(self):
        rows = io.read_csv(preparation.OUTPUT / "spring_water_yield.csv")
        train = [r for r in rows if int(r["year"]) != 2011]
        test = [r for r in rows if int(r["year"]) == 2011]
        features = ["spring_storage_0_210cm_mm", *evaluation.WEATHER]
        first, metadata = evaluation.fit(train, test, "wheat_yield_t_ha", features, {"alpha": 1.0, "fit_intercept": True, "solver": "svd", "positive": False})
        altered = [dict(row, wheat_yield_t_ha=str(float(row["wheat_yield_t_ha"]) + 1000)) for row in test]
        second, _ = evaluation.fit(train, altered, "wheat_yield_t_ha", features, {"alpha": 1.0, "fit_intercept": True, "solver": "svd", "positive": False})
        self.assertEqual(first, second)
        for actual, feature in zip(metadata["training_scaler_mean"], features):
            expected = sum(float(r[feature]) for r in train) / len(train)
            self.assertAlmostEqual(actual, expected, places=10)
        self.assertEqual(metadata["independent_weather_vectors_train"], 2)

    def test_tampered_protocol_source_hash_is_rejected(self):
        protocol = json.loads(preparation.PROTOCOL.read_text(encoding="utf-8"))
        source = next(iter(protocol["pinned_sha256"]))
        protocol["pinned_sha256"][source] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tampered_protocol.json"
            path.write_text(json.dumps(protocol), encoding="utf-8")
            with patch.object(preparation, "PROTOCOL", path):
                with self.assertRaisesRegex(ValueError, "Source hash mismatch"):
                    preparation.build_snapshot()

    def test_paired_metrics_report_harms_and_missed_benefits(self):
        rows = [
            {"observed": 0.5, "predicted": -0.1},
            {"observed": -0.2, "predicted": 0.3},
        ]
        metrics = evaluation.score(rows, paired=True)
        self.assertEqual(metrics["missed_benefits"], 1)
        self.assertEqual(metrics["harmful_cover_choices"], 1)
        self.assertEqual(metrics["balanced_accuracy"], 0.0)


if __name__ == "__main__":
    unittest.main()
