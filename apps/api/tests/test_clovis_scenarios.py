"""Complete-season selection, paired recursive inference, and artifact integrity."""

import copy
import csv
import json
import math
import statistics
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import clovis_scenarios as scenarios


def request(**changes):
    payload = json.loads(scenarios.EXAMPLE.read_text(encoding="utf-8"))
    return scenarios.ScenarioRequest.model_validate({**payload, **changes})


def history(start=date(2001, 1, 1), end=date(2025, 12, 31), same_rain=False):
    return [{"date": day.isoformat(), "rain_mm": 1.0 if same_rain else (day.year - 2000) / 10,
             "temperature_max_c": 20, "temperature_min_c": 5, "humidity_pct": 50,
             "wind_speed_m_s": 2, "solar_radiation_mj_m2_day": 20,
             "weather_eligible": True, "quality_flags": ""}
            for day in scenarios.prep.days(start, end)]


class RainRule:
    """Known response used to verify recurrence, pairing, and management inputs."""
    def __init__(self):
        self.seen = []
        self.metadata = {"numeric_training_ranges": {"rain_mm": {"min": 0, "max": 1},
                                                   "previous_moisture_m3_m3": {"min": 0, "max": 1}}}

    def predict_many(self, inputs):
        self.seen.append(copy.deepcopy(inputs))
        raw = [r["previous_moisture_m3_m3"] + (r["rain_mm"] + r["irrigation_mm"]) / 10000
               - r["cover_active"] / 100000 for r in inputs]
        values = [min(1, max(0, v)) for v in raw]
        return values, [a != b for a, b in zip(raw, values)], [r["management_phase"] == "fallow_after_cover" for r in inputs]


def engine(model=None, same_rain=False):
    return scenarios.ScenarioEngine(model or RainRule(), history(same_rain=same_rain), 0.21,
                                    {"name": "test_rule", "artifact_sha256": "test",
                                     "status": "experimental_not_selected"},
                                    {"time_standard": "LST"}, {"source": "training_fallow_median"})


class ScenarioTests(unittest.TestCase):
    def test_payload_rejects_invalid_dates_crops_water_and_extra_fields(self):
        invalid = [{"initial_soil_moisture_m3_m3": v} for v in (25, -0.1, float("nan"), float("inf"), "0.25", True)]
        invalid += [{"cover_crop": "corn"}, {"next_crop": "corn"}, {"site_id": "maryland"},
                    {"cover_termination_date": "2027-02-20"}, {"cover_planting_date": "2027-07-01"},
                    {"next_crop_planting_date": "2028-10-09"}, {"decision_date": "2025-01-01"},
                    {"decision_date": "2027-W08-2"}, {"decision_date": "2027-02-23T00:00:00"},
                    {"unexpected": 1}]
        for changes in invalid:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                request(**changes)

    def test_irrigation_rejects_duplicate_outside_and_invalid_amounts(self):
        for schedule in ([{"date": "2027-03-01", "amount_mm": -1}],
                         [{"date": "2027-02-23", "amount_mm": 1}],
                         [{"date": "2027-10-10", "amount_mm": 1}],
                         [{"date": "2027-03-01", "amount_mm": float("nan")}],
                         [{"date": "2027-03-01", "amount_mm": "1"}],
                         [{"date": "2027-03-01", "amount_mm": 1}] * 2):
            with self.subTest(schedule=schedule), self.assertRaises(ValidationError):
                request(irrigation_schedule=schedule)
        valid = request(irrigation_schedule=[{"date": "2027-10-09", "amount_mm": 5}])
        self.assertEqual(valid.irrigation_schedule[0].amount_mm, 5)

    def test_quantiles_use_complete_distinct_historical_seasons(self):
        selected, audit = scenarios.select_scenarios(request(), history(), scenarios.load_protocol())
        self.assertEqual(len(audit), 25)
        self.assertEqual(sum(row["eligible"] for row in audit), 19)
        self.assertEqual([row["historical_start_year"] for row in selected], [2003, 2013, 2022])
        self.assertEqual([row["scenario"] for row in selected], ["dry", "typical", "very_rainy"])
        for row in selected:
            self.assertEqual(len(row["sequence"]), 228)
            self.assertAlmostEqual(row["total_rain_mm"], sum(r["rain_mm"] for r in row["sequence"]))
            self.assertEqual(row["historical_start_date"][5:], "02-24")
            self.assertEqual(row["historical_end_date"][5:], "10-09")

    def test_missing_or_invalid_days_exclude_entire_seasons(self):
        rows = [r for r in history() if r["date"] != "2003-05-01"]
        next(r for r in rows if r["date"] == "2013-05-01")["weather_eligible"] = False
        selected, audit = scenarios.select_scenarios(request(), rows, scenarios.load_protocol())
        by_year = {r["historical_start_year"]: r for r in audit}
        self.assertEqual(by_year[2003]["exclusion_reason"], "incomplete_weather_coverage")
        self.assertEqual(by_year[2013]["exclusion_reason"], "invalid_weather_day")
        self.assertTrue(all(r["historical_start_year"] not in {2003, 2013} for r in selected))

    def test_leap_calendar_never_drops_or_fabricates_daily_weather(self):
        leap = request(decision_date="2028-02-23", cover_planting_date="2028-02-24",
                       cover_termination_date="2028-05-22", next_crop_planting_date="2028-10-09")
        selected, audit = scenarios.select_scenarios(leap, history(), scenarios.load_protocol())
        self.assertEqual(sum(r["eligible"] for r in audit), 6)
        for row in selected:
            self.assertEqual(len(row["sequence"]), 229)
            self.assertTrue(any(r["date"].endswith("02-29") for r in row["sequence"]))
            dates = [date.fromisoformat(r["date"]) for r in row["sequence"]]
            self.assertTrue(all((b - a).days == 1 for a, b in zip(dates, dates[1:])))

    def test_cross_year_mapping_keeps_original_daily_sequences(self):
        selected, audit = scenarios.select_scenarios(request(decision_date="2026-11-01"), history(), scenarios.load_protocol())
        self.assertEqual(audit[-1]["exclusion_reason"], "incomplete_weather_coverage")
        for row in selected:
            dates = [date.fromisoformat(r["date"]) for r in row["sequence"]]
            self.assertEqual(dates[-1].year, dates[0].year + 1)
            self.assertEqual(dates[0].strftime("%m-%d"), "11-02")
            self.assertTrue(all((b - a).days == 1 for a, b in zip(dates, dates[1:])))

    def test_duplicate_history_and_insufficient_seasons_fail(self):
        rows = history(date(2001, 1, 1), date(2002, 12, 31))
        with self.assertRaisesRegex(ValueError, "three complete"):
            scenarios.select_scenarios(request(), rows, scenarios.load_protocol())
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            scenarios.select_scenarios(request(), rows + [rows[0]], scenarios.load_protocol())

    def test_equal_rainfall_is_deterministic_and_flagged(self):
        simulator = engine(same_rain=True)
        result = simulator.simulate(request())
        selected = result["scenarios"]
        self.assertEqual([r["historical_start_year"] for r in selected], [2001, 2002, 2003])
        self.assertTrue(all("selected_rainfall_totals_not_distinct" in r["quality_flags"] for r in selected))

    def test_management_matches_training_conventions_at_boundaries(self):
        planned = request(cover_planting_date="2027-03-01")
        before = date(2027, 2, 28)
        self.assertEqual(scenarios.management(before, planned, True), scenarios.management(before, planned, False))
        planted = scenarios.management(planned.cover_planting_date, planned, True)
        self.assertEqual(planted["cover_active"], 1)
        self.assertEqual(planted["days_since_cover_planting"], 0)
        terminated = scenarios.management(planned.cover_termination_date, planned, True)
        self.assertEqual(terminated["cover_active"], 0)
        self.assertEqual(terminated["management_phase"], "cover_period")
        self.assertEqual(terminated["days_since_cover_termination"], 0)
        after = planned.cover_termination_date + timedelta(days=1)
        self.assertEqual(scenarios.management(after, planned, True)["management_phase"], "fallow_after_cover")
        self.assertEqual(scenarios.management(after, planned, False)["treatment"], "fallow")
        self.assertIsNone(scenarios.management(after, planned, False)["days_since_cover_planting"])

    def test_recursion_pairs_identical_weather_water_and_irrigation(self):
        simulator = engine()
        planned = request(cover_planting_date="2027-03-01",
                          irrigation_schedule=[{"date": "2027-02-24", "amount_mm": 5}])
        result = simulator.simulate(planned)
        self.assertEqual(len(simulator.model.seen), 228)
        for step, batch in enumerate(simulator.model.seen):
            self.assertEqual(len(batch), 6)
            for i in range(0, 6, 2):
                for key in [*scenarios.WEATHER_COLUMNS, "irrigation_mm", "date"]:
                    self.assertEqual(batch[i][key], batch[i + 1][key])
                if step == 0:
                    self.assertEqual(batch[i]["previous_moisture_m3_m3"], 0.25)
                else:
                    previous = result["scenarios"][i // 2]["daily_trajectory"][step - 1]
                    self.assertEqual(batch[i]["previous_moisture_m3_m3"], previous["cover_moisture_m3_m3"])
                    self.assertEqual(batch[i + 1]["previous_moisture_m3_m3"], previous["fallow_moisture_m3_m3"])
        for scenario in result["scenarios"]:
            rows = scenario["daily_trajectory"]
            self.assertEqual(scenario["total_irrigation_mm"], 5)
            self.assertAlmostEqual(sum(r["rain_mm"] for r in rows), scenario["total_rain_mm"])
            self.assertAlmostEqual(scenario["cover_final_7_day_average_m3_m3"], statistics.fmean(r["cover_moisture_m3_m3"] for r in rows[-7:]))
            self.assertLess(scenario["final_7_day_moisture_difference_m3_m3"], 0)
            self.assertIn("unseen_management_phase", scenario["quality_flags"])
            self.assertGreater(scenario["diagnostics"]["cover_unseen_phase_days"], 0)
        self.assertTrue(any("features_outside_training_range" in r["quality_flags"] for r in result["scenarios"]))
        self.assertFalse(result["recommendation_ready"])
        self.assertFalse(result["scenario_probabilities_assigned"])

    def test_missing_initial_moisture_uses_documented_training_default(self):
        result = engine().simulate(request(initial_soil_moisture_m3_m3=None))
        self.assertEqual(result["initial_moisture_m3_m3"], 0.21)
        self.assertEqual(result["initial_moisture_provenance"]["source"], "training_fallow_median")

    def test_clipping_and_identical_cover_response_are_exposed(self):
        class Constant:
            metadata = {"numeric_training_ranges": {}}
            def predict_many(self, rows):
                return [1.0] * len(rows), [True] * len(rows), [False] * len(rows)
        result = engine(Constant()).simulate(request())
        for row in result["scenarios"]:
            self.assertEqual(row["diagnostics"]["cover_clipped_days"], 228)
            self.assertIn("no_detectable_cover_response", row["quality_flags"])
            self.assertIn("moisture_predictions_clipped", row["quality_flags"])

    def test_invalid_model_outputs_fail(self):
        class Invalid:
            metadata = {"numeric_training_ranges": {}}
            def predict_many(self, rows):
                return [float("nan")] * len(rows), [False] * len(rows), [False] * len(rows)
        with self.assertRaisesRegex(ValueError, "invalid bounded moisture"):
            engine(Invalid()).simulate(request())
        with patch.object(Invalid, "predict_many", return_value=([], [], [])):
            with self.assertRaisesRegex(ValueError, "unexpected prediction shape"):
                engine(Invalid()).simulate(request())


class ScenarioArtifactTests(unittest.TestCase):
    def test_real_artifacts_repeat_without_training_test_access_or_source_changes(self):
        real_open = Path.open
        def guarded_open(path, *args, **kwargs):
            if path.name in {"test_features.csv", "test_pairs.csv", "validation_features.csv"}:
                raise AssertionError("Held-out labels opened during scenario inference")
            return real_open(path, *args, **kwargs)
        source = scenarios.weather.OUTPUT / "train_features.csv"
        before = scenarios.prep.digest(source)
        with patch.object(Path, "open", guarded_open), \
             patch.object(scenarios.regression.WeatherRegressor, "fit", side_effect=AssertionError("Unexpected training")), \
             patch.object(scenarios.weather.urllib.request, "urlopen", side_effect=AssertionError("Unexpected network")):
            simulator = scenarios.ScenarioEngine.from_artifacts()
            first = simulator.simulate(request())
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                scenarios.write_demo(simulator, request(), output)
                second = json.loads((output / "results.json").read_text(encoding="utf-8"))
                self.assertEqual(first, second)
                with (output / "trajectories.csv").open(newline="", encoding="utf-8") as stream:
                    self.assertEqual(len(list(csv.DictReader(stream))), 684)
                self.assertIn("identical final-week", (output / "summary.md").read_text(encoding="utf-8"))
            json.dumps(first, allow_nan=False)
        self.assertEqual(before, scenarios.prep.digest(source))
        self.assertEqual(simulator.model_info["status"], "experimental_not_selected")
        self.assertFalse(simulator.model_info["final_test_evaluated"])
        self.assertEqual(len(simulator.history), 9131)
        self.assertEqual(len(simulator.default_info["dates"]), 7)
        self.assertEqual([s["historical_start_year"] for s in first["scenarios"]], [2013, 2018, 2025])
        self.assertEqual([s["total_rain_mm"] for s in first["scenarios"]], [285.8, 350.76, 460.58])
        for scenario in first["scenarios"]:
            self.assertTrue(all(math.isfinite(r["cover_moisture_m3_m3"]) for r in scenario["daily_trajectory"]))
            self.assertIn("model_failed_validation_adoption_checks", scenario["quality_flags"])
            self.assertIn("seasonal_rollout_unvalidated", scenario["quality_flags"])
            self.assertIn("no_detectable_final_week_cover_response", scenario["quality_flags"])
            self.assertGreater(scenario["diagnostics"]["cover_clipped_days"], 0)

    def test_tampered_model_hash_rejected_before_deserialization(self):
        pointer = scenarios.prep.ROOT / "data/experiments/clovis_regression/latest.json"
        run = Path(json.loads(pointer.read_text(encoding="utf-8"))["run_directory"])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            for name in ("results.json", "provenance.json"):
                (output / name).write_bytes((run / name).read_bytes())
            (output / "forest_depth_4.joblib").write_bytes(b"tampered")
            with patch.object(scenarios.regression.WeatherRegressor, "load", side_effect=AssertionError("Unsafe load")):
                with self.assertRaisesRegex(ValueError, "hash mismatch"):
                    scenarios.load_saved_model(output)


if __name__ == "__main__":
    unittest.main()
