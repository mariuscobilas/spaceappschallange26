"""Weather conversion, provenance, and frozen-join tests; no network access."""

import copy
import csv
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import prepare_clovis as prep
import prepare_clovis_weather as weather


class WeatherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = prep.load_protocol()

    def fixture(self, start=date(2023, 4, 1), end=date(2023, 4, 2)):
        request = weather.request_parameters(self.protocol["site"], start, end)
        values = {"PRECTOTCORR": 0, "T2M_MAX": 20, "T2M_MIN": 5, "RH2M": 50,
                  "WS2M": 2, "ALLSKY_SFC_SW_DWN": 5}
        payload = {
            "header": {"time_standard": "LST", "fill_value": -999},
            "geometry": {"coordinates": [-103.2, 34.583333, 1368]},
            "properties": {"parameter": {
                parameter: {day.strftime("%Y%m%d"): value for day in prep.days(start, end)}
                for parameter, value in values.items()}},
            "parameters": {key: {"units": unit} for key, (_, unit) in weather.PARAMETERS.items()},
        }
        payload["parameters"]["ALLSKY_SFC_SW_DWN"]["units"] = "kW-hr/m^2/day"
        return payload, request

    def pairs(self):
        records = [{"date": day, "source_row": 2, "irrigation_mm": 0,
                    "row": {key: "0.25" for key in self.protocol["treatments"]}}
                   for day in (date(2023, 4, 1), date(2023, 4, 2))]
        return prep.make_pairs(prep.normalize(records, self.protocol))[0]

    def test_units_are_metadata_driven(self):
        payload, request = self.fixture()
        rows, _ = weather.normalize_payload(payload, request)
        self.assertEqual(rows[0]["solar_radiation_mj_m2_day"], 18)
        self.assertEqual(rows[0]["rain_mm"], 0)
        self.assertTrue(rows[0]["weather_eligible"])
        payload["parameters"]["ALLSKY_SFC_SW_DWN"]["units"] = "MJ/m^2/day"
        self.assertEqual(weather.normalize_payload(payload, request)[0][0]["solar_radiation_mj_m2_day"], 5)
        payload["parameters"]["WS2M"]["units"] = "mph"
        with self.assertRaisesRegex(ValueError, "Unsupported NASA unit"):
            weather.normalize_payload(payload, request)

    def test_missing_invalid_and_nonfinite_values_are_flagged(self):
        for value in (-999, None, "NaN", -1):
            payload, request = self.fixture()
            payload["properties"]["parameter"]["PRECTOTCORR"]["20230401"] = value
            rows, _ = weather.normalize_payload(payload, request)
            self.assertFalse(rows[0]["weather_eligible"])
            self.assertIsNone(rows[0]["rain_mm"])

    def test_missing_date_or_parameter_fails(self):
        payload, request = self.fixture()
        del payload["properties"]["parameter"]["RH2M"]["20230402"]
        with self.assertRaisesRegex(ValueError, "date coverage mismatch"):
            weather.normalize_payload(payload, request)

    def test_wrong_site_or_time_standard_fails(self):
        payload, request = self.fixture()
        payload["geometry"]["coordinates"][0] = -108
        with self.assertRaisesRegex(ValueError, "location"):
            weather.normalize_payload(payload, request)
        payload, request = self.fixture()
        payload["header"]["time_standard"] = "UTC"
        with self.assertRaisesRegex(ValueError, "time standard"):
            weather.normalize_payload(payload, request)

    def test_humidity_and_temperature_order_are_checked(self):
        payload, request = self.fixture()
        payload["properties"]["parameter"]["RH2M"]["20230401"] = 101
        payload["properties"]["parameter"]["T2M_MIN"]["20230402"] = 25
        rows, _ = weather.normalize_payload(payload, request)
        self.assertFalse(rows[0]["weather_eligible"])
        self.assertIn("invalid:temperature_order", rows[1]["quality_flags"])

    def test_leap_day_is_required_for_historical_coverage(self):
        payload, request = self.fixture(date(2024, 2, 28), date(2024, 3, 1))
        self.assertEqual(len(weather.normalize_payload(payload, request)[0]), 3)
        del payload["properties"]["parameter"]["PRECTOTCORR"]["20240229"]
        with self.assertRaisesRegex(ValueError, "date coverage mismatch"):
            weather.normalize_payload(payload, request)

    def test_join_matches_target_date_independent_of_weather_order(self):
        payload, request = self.fixture()
        payload["properties"]["parameter"]["PRECTOTCORR"]["20230402"] = 12.5
        rows, _ = weather.normalize_payload(payload, request)
        joined = weather.join_pairs(self.pairs(), list(reversed(rows)), "train", self.protocol)
        self.assertEqual(len(joined), 4)
        self.assertEqual({r["rain_mm"] for r in joined}, {12.5})
        self.assertEqual({r["treatment"] for r in joined}, set(self.protocol["treatments"].values()))

    def test_join_rejects_missing_duplicate_or_invalid_weather(self):
        payload, request = self.fixture()
        rows, _ = weather.normalize_payload(payload, request)
        for bad in ([rows[0]], rows + [rows[0]],
                    [rows[0], {**rows[1], "weather_eligible": False}]):
            with self.subTest(weather=bad):
                with self.assertRaises(ValueError):
                    weather.join_pairs(self.pairs(), bad, "train", self.protocol)

    def test_join_rejects_wrong_site_partition_and_duplicate_pairs(self):
        payload, request = self.fixture()
        rows, _ = weather.normalize_payload(payload, request)
        for column, value in (("site_id", "another_site"), ("partition", "test"),
                              ("previous_date", "2023-03-31")):
            pairs = self.pairs()
            pairs[0][column] = value
            with self.assertRaisesRegex(ValueError, "Invalid pair"):
                weather.join_pairs(pairs, rows, "train", self.protocol)
        pairs = self.pairs()
        with self.assertRaisesRegex(ValueError, "Duplicate moisture pair"):
            weather.join_pairs(pairs + [pairs[0]], rows, "train", self.protocol)

    def test_cache_tampering_or_absence_fails_without_download(self):
        payload, request = self.fixture(date(2001, 1, 1), date(2005, 12, 31))
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            with self.assertRaises(FileNotFoundError):
                weather.load_block(self.protocol["site"], date(2001, 1, 1), date(2005, 12, 31), cache, False)
            envelope = {"request": request, "payload": payload, "payload_sha256": "tampered"}
            (cache / "clovis_2001_2005_lst.json").write_text(json.dumps(envelope))
            with self.assertRaisesRegex(ValueError, "Cache request/hash mismatch"):
                weather.load_block(self.protocol["site"], date(2001, 1, 1), date(2005, 12, 31), cache, False)

    @unittest.skipUnless((weather.CACHE / "clovis_2021_2025_lst.json").is_file(),
                         "Live NASA snapshot is optional; fixture tests always run")
    def test_cached_pipeline_is_reproducible_and_preserves_labels(self):
        label_hashes = {p.name: prep.digest(p) for p in weather.LABELS.iterdir() if p.is_file()}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            report = weather.prepare(output=output)
            hashes = {p.name: prep.digest(p) for p in output.iterdir()}
            weather.prepare(output=output)
            self.assertEqual(hashes, {p.name: prep.digest(p) for p in output.iterdir()})
            self.assertEqual(report["rows_dropped"], 0)
            for partition in ("train", "validation", "test"):
                with (weather.LABELS / f"{partition}_pairs.csv").open(newline="") as stream:
                    before = list(csv.DictReader(stream))
                with (output / f"{partition}_features.csv").open(newline="") as stream:
                    after = list(csv.DictReader(stream))
                self.assertEqual(before, [{k: row[k] for k in prep.PAIR_FIELDS} for row in after])
        self.assertEqual(label_hashes, {p.name: prep.digest(p) for p in weather.LABELS.iterdir() if p.is_file()})


if __name__ == "__main__":
    unittest.main()
