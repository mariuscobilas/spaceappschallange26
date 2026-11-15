"""Check held-out data integrity and frozen-model scoring using synthetic targets."""

import csv
import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import evaluate_clovis_final_test as final


def row(index=0):
    day = date(2023, 5, 11) + timedelta(days=index)
    return {"site_id": "clovis_nm", "date": day.isoformat(),
            "previous_date": (day - timedelta(days=1)).isoformat(), "partition": "test",
            "treatment": "pea", "sensor_depth_cm": "5", "soil_moisture_m3_m3": 0.2,
            "previous_moisture_m3_m3": 0.2, "moisture_change_m3_m3": 0.0,
            "management_phase": "cover_period", "cover_active": 1, "irrigation_mm": 0.0,
            "days_since_cover_planting": 76 + index, "days_since_cover_termination": "",
            "source_id": "synthetic", "rain_mm": 0.0, "temperature_max_c": 20.0,
            "temperature_min_c": 5.0, "humidity_pct": 50.0, "wind_speed_m_s": 2.0,
            "solar_radiation_mj_m2_day": 20.0}


class FixedDelta:
    def predict_many(self, rows):
        return ([r["previous_moisture_m3_m3"] + 0.001 for r in rows],
                [False] * len(rows), [r["management_phase"] == "winter_wheat" for r in rows])


class FinalTestTests(unittest.TestCase):
    def test_one_step_and_recursive_scores_have_known_values(self):
        rows = [row(i) for i in range(100)]
        with patch.object(final.regression.WeatherRegressor, "fit", side_effect=AssertionError("Unexpected fit")):
            report, predictions = final.score_frozen(FixedDelta(), rows, final.load_protocol())
        self.assertAlmostEqual(report["model"]["test"]["moisture"]["mae"], 0.001)
        self.assertEqual(report["reference"]["test"]["moisture"]["mae"], 0)
        self.assertIsNone(report["mae_improvement_fraction"])
        for horizon in (7, 30, 90):
            metrics = report["model"]["rollouts"][str(horizon)]
            self.assertEqual(metrics["windows"], 101 - horizon)
            self.assertAlmostEqual(metrics["endpoint"]["mae"], horizon / 1000)
            self.assertEqual(report["reference"]["rollouts"][str(horizon)]["endpoint"]["mae"], 0)
        self.assertTrue(report["test_set_now_exposed"])
        self.assertFalse(report["recommendation_ready"])
        self.assertFalse(report["prior_validation_selection_changed"])
        self.assertEqual(len(predictions), 200)
        self.assertTrue(all(list(r) == list(predictions[0]) for r in predictions))
        json.dumps(report, allow_nan=False)

    def test_gaps_break_rollouts_and_unseen_phases_are_reported(self):
        rows = [row(0), row(2)]
        rows[1]["management_phase"] = "winter_wheat"
        report, _ = final.score_frozen(FixedDelta(), rows, final.load_protocol())
        self.assertEqual(report["unseen_phase_rows"], {"winter_wheat": 1})
        self.assertTrue(all(r["windows"] == 0 for r in report["model"]["rollouts"].values()))
        self.assertTrue(all(r["status"] == "insufficient_contiguous_test_data"
                            for r in report["model"]["rollouts"].values()))

    def fixture(self, root):
        pairs = [{k: str(v) for k, v in row(i).items() if k in final.prep.PAIR_FIELDS} for i in range(2)]
        pair_path = root / "test_pairs.csv"
        pair_path.write_text(final.prep.csv_text(pairs, final.prep.PAIR_FIELDS), encoding="utf-8", newline="\n")
        (root / "weather_manifest.json").write_text(json.dumps({"input_label_sha256": {
            "test_pairs.csv": final.prep.digest(pair_path)}}), encoding="utf-8")
        history = [{"date": r["date"], "weather_eligible": True,
                    **{key: r[key] for key in final.scenarios.WEATHER_COLUMNS}} for r in [row(0), row(1)]]
        protocol = final.prep.load_protocol()
        joined = final.weather.join_pairs(pairs, history, "test", protocol)
        (root / "test_features.csv").write_text(final.prep.csv_text(joined, final.weather.JOIN_FIELDS),
                                                encoding="utf-8", newline="\n")
        return history, protocol

    def test_dedicated_reader_accepts_only_verified_join(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            history, protocol = self.fixture(root)
            with patch.object(final.weather, "verify_labels"):
                rows = final.read_test(root, root, history, protocol)
            self.assertEqual(len(rows), 2)
            self.assertIsInstance(rows[0]["soil_moisture_m3_m3"], float)
            self.assertEqual(rows[0]["partition"], "test")

    def test_changed_label_or_feature_file_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            history, protocol = self.fixture(root)
            path = root / "test_pairs.csv"
            path.write_bytes(path.read_bytes() + b"\n")
            with patch.object(final.weather, "verify_labels"), self.assertRaisesRegex(ValueError, "labels differ"):
                final.read_test(root, root, history, protocol)
            history, protocol = self.fixture(root)
            (root / "test_features.csv").write_text("tampered", encoding="utf-8")
            with patch.object(final.weather, "verify_labels"), self.assertRaisesRegex(ValueError, "features differ"):
                final.read_test(root, root, history, protocol)

    def test_baseline_matches_shared_reference_and_validation_guard_stays_closed(self):
        rows = [row(0), {**row(1), "previous_moisture_m3_m3": 0.3}]
        reference = final.base.Baseline("persistence", 0.0, {}, {})
        self.assertEqual(final.Persistence().predict_many(rows)[0], [reference.predict(r)[0] for r in rows])
        with patch.object(Path, "open", side_effect=AssertionError("File must stay closed")):
            with self.assertRaisesRegex(ValueError, "final test stays closed"):
                final.base.read_partition(Path("unused"), "test", {})


if __name__ == "__main__":
    unittest.main()
