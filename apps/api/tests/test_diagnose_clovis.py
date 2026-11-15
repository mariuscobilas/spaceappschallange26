"""Diagnosis respects training scope, paired dates, and measurement semantics."""

import csv
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import diagnose_clovis as diagnosis
from test_clovis_regression import observation


class DiagnosticTests(unittest.TestCase):
    def test_eda_is_training_only_and_exposes_constant_management_feature(self):
        rows = [observation(i) for i in range(3)]
        result = diagnosis.training_eda(rows)
        self.assertEqual(result["rows"], 3)
        self.assertTrue(result["target_columns_excluded"])
        self.assertEqual(result["missing_raw_values"]["days_since_cover_termination"], 3)
        self.assertIn("days_since_cover_termination", result["constant_numeric_features"])
        for partition in ("validation", "test"):
            with self.assertRaisesRegex(ValueError, "training rows only"):
                diagnosis.training_eda([observation(partition=partition)])

    def test_date_block_uncertainty_averages_treatments_and_pairs_methods(self):
        rows = [{"date": day, "treatment": crop, "method": method, "absolute_error": error}
                for day in ("2023-05-11", "2023-05-12", "2023-05-13")
                for crop in ("fallow", "pea", "oat", "six_species_mix")
                for method, error in (("forest_depth_4", 0.03), ("persistence", 0.02))]
        config = {"block_days": 2, "replicates": 30, "seed": 42}
        result = diagnosis.date_block_uncertainty(rows, config)
        self.assertEqual(result["dates"], 3)
        self.assertEqual(result["eligible_blocks"], 2)
        self.assertAlmostEqual(result["mean_model_minus_persistence_absolute_error"], 0.01)
        for endpoint in result["conditional_95_percent_interval"]:
            self.assertAlmostEqual(endpoint, 0.01)
        self.assertEqual(result, diagnosis.date_block_uncertainty(rows, config))
        with self.assertRaisesRegex(ValueError, "Unpaired"):
            diagnosis.date_block_uncertainty(rows[:-1], config)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            diagnosis.date_block_uncertainty(rows + [rows[0]], config)

    def test_date_blocks_do_not_cross_missing_dates(self):
        rows = [{"date": day, "treatment": "pea", "method": method, "absolute_error": error}
                for day in ("2023-05-11", "2023-05-13")
                for method, error in (("forest_depth_4", 0.03), ("persistence", 0.02))]
        with self.assertRaisesRegex(ValueError, "No contiguous"):
            diagnosis.date_block_uncertainty(rows, {"block_days": 2, "replicates": 10, "seed": 42})

    def test_source_audit_distinguishes_daily_mean_from_last_reading(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            daily = root / "daily.csv"
            with daily.open("w", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=["Date", "Rain", "F5", "Pea5", "Oat5", "SSM5"])
                writer.writeheader()
                writer.writerow({"Date": "4/1/2023", "Rain": 0, "F5": 0.2, "Pea5": 0.2, "Oat5": 0.2, "SSM5": 0.2})
                writer.writerow({"Date": "4/24/2023", "Rain": "not parsed"})
            with (root / "5min.csv").open("w", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=["Time", "F5", "Pea5", "Oat5", "SSM5"])
                writer.writeheader()
                for stamp, value in (("4/1/2023 0:00", 0.1), ("4/1/2023 0:05", 0.3), ("4/24/2023 0:00", "not parsed")):
                    writer.writerow({"Time": stamp, **{key: value for key in ("F5", "Pea5", "Oat5", "SSM5")}})
            with patch.object(diagnosis.prep, "DAILY", daily), patch.object(diagnosis.prep, "ROOT", root):
                result = diagnosis.training_source_audit([observation()])
            self.assertEqual(result["checked_series_days"], 4)
            self.assertAlmostEqual(result["daily_value_vs_five_min_mean_mae"], 0)
            self.assertAlmostEqual(result["daily_value_vs_last_five_min_value_mae"], 0.1)


if __name__ == "__main__":
    unittest.main()
