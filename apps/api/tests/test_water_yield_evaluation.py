"""Checks that the yield experiment learns from training rows only."""

import copy
import csv
import io
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import prepare_water_yield as prep
import evaluate_water_yield as evaluation


class EvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
        cls.files = prep.build_snapshot()
        cls.schema = json.loads(cls.files["feature_schema.json"])
        cls.rows = list(csv.DictReader(io.StringIO(cls.files["observations.csv"].decode())))
        cls.folds = list(csv.DictReader(io.StringIO(cls.files["fold_memberships.csv"].decode())))

    def test_training_only_scaling_and_no_evaluation_target_access(self):
        feature, target = self.protocol["water"], self.protocol["target"]
        train = [{feature: "0", target: "1"}, {feature: "2", target: "3"}]
        test = [{feature: "1000", target: "9000"}]
        prediction, fitted = evaluation.fit_predict(train, test, [feature], self.protocol)
        self.assertEqual(fitted["scaler_mean"], [1.0])
        self.assertEqual(fitted["scaler_scale"], [1.0])
        del test[0][target]
        self.assertEqual(evaluation.fit_predict(train, test, [feature], self.protocol)[0], prediction)
        self.assertEqual(evaluation.fit_predict(train, test, [], self.protocol)[0], [2.0])

    def test_metrics_weighting_bias_and_negative_predictions(self):
        rows = [{"observed_yield_t_ha": 0, "predicted_yield_t_ha": -1},
                {"observed_yield_t_ha": 2, "predicted_yield_t_ha": 3}]
        score = evaluation.metrics(rows)
        self.assertEqual(score["mae"], 1)
        self.assertEqual(score["rmse"], 1)
        self.assertEqual(score["bias"], 0)
        self.assertEqual(score["negative_predictions"], 1)
        self.assertEqual(score["r2"], 0)

    def test_oof_completeness_common_cohort_and_determinism(self):
        report, predictions, fitted = evaluation.evaluate(self.rows, self.folds, self.schema, self.protocol)
        self.assertEqual(len(predictions), 88 * 4 + 86 * 5)
        self.assertEqual(len(fitted), 9)
        for cohort, n in (("main", 88), ("nitrate_common", 86)):
            ids = None
            for method, summary in report["methods"][cohort].items():
                items = [r["observation_id"] for r in predictions if r["cohort"] == cohort and r["method"] == method]
                self.assertEqual(len(items), n)
                self.assertEqual(len(set(items)), n)
                if ids is None:
                    ids = set(items)
                self.assertEqual(ids, set(items))
                expected = sum(v["mae"] for v in summary["per_season"].values()) / 5
                self.assertAlmostEqual(summary["macro_season_mae"], expected)
        again = evaluation.evaluate(self.rows, self.folds, self.schema, self.protocol)
        self.assertEqual(prep.json_bytes(report), prep.json_bytes(again[0]))
        self.assertEqual(prep.csv_bytes(predictions), prep.csv_bytes(again[1]))

    def test_fold_corruption_rejected(self):
        bad = copy.deepcopy(self.folds)
        bad[0]["role"] = "train" if bad[0]["role"] == "evaluation" else "evaluation"
        with self.assertRaisesRegex(ValueError, "Season leakage"):
            evaluation.evaluate(self.rows, bad, self.schema, self.protocol)
        with self.assertRaisesRegex(ValueError, "membership"):
            evaluation.evaluate(self.rows, self.folds[1:], self.schema, self.protocol)


if __name__ == "__main__":
    unittest.main()
