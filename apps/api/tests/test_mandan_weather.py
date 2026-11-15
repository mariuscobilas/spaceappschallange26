"""Reject silently misaligned weather and preserve the unresolved soil-water horizon."""

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
import verify_mandan_weather as weather


class MandanWeatherTests(unittest.TestCase):
    def setUp(self):
        self.policy = json.loads(weather.POLICY.read_text(encoding="utf-8"))
        self.request = {**self.policy["weather_request"], "start": "20090101", "end": "20090102"}
        self.features = json.loads(weather.prep.PROTOCOL.read_text(encoding="utf-8"))["weather_features"]
        self.payload = {"header": {"time_standard": "LST", "start": "20090101", "end": "20090102", "fill_value": -999},
            "geometry": {"coordinates": [-100.935, 46.780, 500]},
            "parameters": {f["parameter"]: {"units": f["source_unit"]} for f in self.features},
            "properties": {"parameter": {f["parameter"]: {"20090101": 1.0, "20090102": 2.0} for f in self.features}}}

    def check_bad(self, bad):
        with self.assertRaises(ValueError):
            weather.normalize_weather(bad, self.request, self.features)

    def test_complete_weather_and_inclusive_dates(self):
        daily = weather.normalize_weather(self.payload, self.request, self.features)
        result = weather.prep.aggregate_weather(daily, {"wheat_sowing_date": "2009-01-01", "wheat_harvest_date": "2009-01-02"}, self.features)
        self.assertEqual(result["weather_days"], 2)
        self.assertEqual(result["season_rain_mm"], 3)
        self.assertEqual(result["season_mean_solar_mj_m2_day"], 1.5)

    def test_missing_date_and_wrong_solar_unit_rejected(self):
        bad = copy.deepcopy(self.payload)
        del bad["properties"]["parameter"]["PRECTOTCORR"]["20090102"]
        self.check_bad(bad)
        bad = copy.deepcopy(self.payload)
        bad["parameters"]["ALLSKY_SFC_SW_DWN"]["units"] = "kW-hr/m^2/day"
        self.check_bad(bad)

    def test_wrong_location_and_time_standard_rejected(self):
        for section, field, value in (("header", "time_standard", "UTC"), ("geometry", "coordinates", [-101, 46.78, 500])):
            bad = copy.deepcopy(self.payload)
            bad[section][field] = value
            self.check_bad(bad)

    def test_fill_boolean_nonfinite_and_invalid_ranges_rejected(self):
        for name, value in (("PRECTOTCORR", -999), ("T2M_MAX", True), ("T2M_MAX", float("nan")), ("RH2M", 101), ("WS2M", -1), ("T2M_MIN", 50)):
            bad = copy.deepcopy(self.payload)
            bad["properties"]["parameter"][name]["20090101"] = value
            self.check_bad(bad)

    def test_management_calendar_independently_verified_and_changes_rejected(self):
        self.assertEqual(weather.verify_calendar(self.policy), self.policy["wheat_calendar"])
        bad = copy.deepcopy(self.policy)
        bad["wheat_calendar"][2]["planting"] = "2011-05-18"
        with self.assertRaises(ValueError):
            weather.verify_calendar(bad)

    def test_offline_snapshot_preserves_unresolved_horizon(self):
        findings = weather.run()
        self.assertEqual(findings["daily_dates"], 1461)
        self.assertEqual(findings["missing_values"], 0)
        self.assertTrue(findings["regional_wheat_season_weather_supported"])
        self.assertFalse(findings["initial_to_spring_exact_weather_window_supported"])
        self.assertFalse(findings["annual_field_assignment_verified"])
        self.assertEqual(findings["catalog_endpoint_minus_2011_wheat_sowing_days"], 1)


if __name__ == "__main__":
    unittest.main()
