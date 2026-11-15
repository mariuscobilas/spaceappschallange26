"""Scientific integrity checks for the separate water/yield research cohort."""

import copy
import csv
import io
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import prepare_water_yield as prep


class PreparationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
        cls.files = prep.build_snapshot()

    def rows(self, name):
        return list(csv.DictReader(io.StringIO(self.files[name].decode())))

    def test_frozen_cohort_and_exact_calendar(self):
        rows = self.rows("observations.csv")
        self.assertEqual(len(rows), 88)
        self.assertEqual(Counter(r["season_id"] for r in rows), {
            "wheat_2017": 8, "wheat_2018": 27, "wheat_2019": 11,
            "wheat_2020": 30, "wheat_2021": 12})
        self.assertEqual({r["wheat_sowing_date"] for r in rows if r["season_id"] == "wheat_2020"}, {"2019-10-23"})
        self.assertEqual({r["wheat_harvest_date"] for r in rows if r["season_id"] == "wheat_2019"}, {"2019-08-07"})
        self.assertFalse(any(r["trial"] == "T2" and r["cycle"] == "3" for r in rows))
        self.assertEqual(len(self.rows("exclusions.csv")), 110)
        self.assertTrue(all("project_ended_before_harvest" in r["reasons"] for r in self.rows("exclusions.csv") if r["trial"] == "T2" and r["cycle"] == "3"))

    def test_weather_window_is_inclusive_and_solar_is_already_mj(self):
        features = self.protocol["weather_features"]
        daily = {d: {f["parameter"]: 2.0 for f in features} for d in ("20200101", "20200102", "20200103")}
        daily["20200103"]["PRECTOTCORR"] = 999
        calendar = {"wheat_sowing_date": "2020-01-01", "wheat_harvest_date": "2020-01-02"}
        result = prep.aggregate_weather(daily, calendar, features)
        self.assertEqual(result["weather_days"], 2)
        self.assertEqual(result["season_rain_mm"], 4)
        self.assertEqual(result["season_mean_solar_mj_m2_day"], 2)
        del daily["20200102"]
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            prep.aggregate_weather(daily, calendar, features)

    def test_bad_weather_is_rejected_without_interpolation(self):
        path = prep.ROOT / self.protocol["weather_paths"][1]
        payload = json.loads(path.read_text(encoding="utf-8"))
        request = json.loads(path.with_suffix(".source.json").read_text(encoding="utf-8"))["request"]
        for kind in ("gap", "fill", "unit", "location", "nan", "range"):
            bad = copy.deepcopy(payload)
            if kind == "gap":
                del bad["properties"]["parameter"]["PRECTOTCORR"]["20210101"]
            elif kind == "fill":
                bad["properties"]["parameter"]["PRECTOTCORR"]["20210101"] = -999
            elif kind == "nan":
                bad["properties"]["parameter"]["PRECTOTCORR"]["20210101"] = float("nan")
            elif kind == "range":
                bad["properties"]["parameter"]["RH2M"]["20210101"] = 101
            elif kind == "unit":
                bad["parameters"]["ALLSKY_SFC_SW_DWN"]["units"] = "kW-hr/m^2/day"
            else:
                bad["geometry"]["coordinates"][0] = 0
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                prep.normalize_weather(bad, request, self.protocol["weather_features"])

    def test_fold_memberships_hold_all_season_rows_together(self):
        folds = self.rows("fold_memberships.csv")
        for cohort, expected in (("main", 88), ("nitrate_common", 86), ("paired", 68)):
            selected = [r for r in folds if r["cohort"] == cohort]
            evaluated = [r["item_id"] for r in selected if r["role"] == "evaluation"]
            self.assertEqual(len(evaluated), expected)
            self.assertEqual(len(set(evaluated)), expected)
            for season in self.protocol["folds"]:
                fold = [r for r in selected if r["held_out_season"] == season]
                self.assertEqual(len(fold), expected)
                self.assertTrue(all((r["role"] == "evaluation") == (r["season_id"] == season) for r in fold))

    def test_pair_controls_and_deltas(self):
        observations = {r["observation_id"]: r for r in self.rows("observations.csv")}
        pairs = self.rows("paired_observations.csv")
        self.assertEqual(len(pairs), 68)
        self.assertEqual(len({r["control_id"] for r in pairs}), 20)
        for pair in pairs:
            cover, control = observations[pair["pair_id"]], observations[pair["control_id"]]
            self.assertEqual(control["cover_mix"], "Fallow")
            for field in ("trial", "block", "tillage", "cycle", "season_id"):
                self.assertEqual(cover[field], control[field])
            self.assertAlmostEqual(float(pair["cover_minus_fallow_wheat_yield_t_ha"]), float(cover["wheat_yield_t_ha"]) - float(control["wheat_yield_t_ha"]))
            for season in self.protocol["folds"]:
                self.assertEqual(cover["season_id"] == season, control["season_id"] == season)

    def test_snapshot_replay_and_conflict_does_not_partially_write(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            prep.write_snapshot(self.files, path)
            prep.write_snapshot(prep.build_snapshot(), path)
            self.assertEqual({p.name: p.read_bytes() for p in path.iterdir()}, self.files)
            changed = {"new.csv": b"new", **self.files, "manifest.json": b"changed"}
            with self.assertRaisesRegex(ValueError, "Frozen output differs"):
                prep.write_snapshot(changed, path)
            self.assertFalse((path / "new.csv").exists())

    def test_tampered_sources_and_invalid_labels_rejected(self):
        bad = copy.deepcopy(self.protocol)
        bad["source_sha256"][bad["observation_path"]] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            prep.verify_sources(bad)
        self.assertIsNone(prep.number(""))
        self.assertEqual(prep.number("0"), 0)
        for value in ("NaN", "inf", "-1"):
            with self.assertRaises(ValueError):
                prep.number(value)

    def test_feature_allowlists_exclude_ids_and_outcomes(self):
        schema = json.loads(self.files["feature_schema.json"])
        allowed = {self.protocol["water"], self.protocol["nitrate"], *[f["feature"] for f in self.protocol["weather_features"]]}
        for family in schema["families"].values():
            self.assertTrue(set(family) <= allowed)
            self.assertNotIn(self.protocol["target"], family)


if __name__ == "__main__":
    unittest.main()
