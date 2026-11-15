"""Mandan design bridge, units, missingness and dependent-pair integrity."""

import csv
import io
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import prepare_mandan as mandan
import prepare_water_yield as prep


class MandanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = mandan.build_snapshot()

    def rows(self, name):
        return list(csv.DictReader(io.StringIO(self.files[name].decode())))

    def test_biomass_plot_bridge_requires_calendar_and_two_id_checks(self):
        yields = [{"YEAR": "2009", "REP": "1", "TRT": "1", "PLOT": "123", "CROP": "SpringWheat"},
                  {"YEAR": "2009", "REP": "1", "TRT": "1", "PLOT": "161", "CROP": "Corn"}]
        soil = [{"YEAR": "2008", "REP": "1", "CCTRT": "1", "PLOT": "123"}]
        crop = [{"YEAR": "2008", "REP": "1", "TRT": "1", "PLOT": "123"}]
        _, result = mandan.plot_bridge(yields, soil, crop)
        self.assertEqual(result["soil_biomass_plot_matches"], 1)
        soil[0]["PLOT"] = "180"
        with self.assertRaisesRegex(ValueError, "does not equal"):
            mandan.plot_bridge(yields, soil, crop)
        soil[0]["PLOT"], soil[0]["YEAR"] = "123", "2009"
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            mandan.plot_bridge(yields, soil, crop)

    def test_water_bridge_does_not_extend_to_other_response_crops(self):
        yields = [{"YEAR": "2009", "REP": "1", "TRT": "1", "PLOT": "123", "CROP": crop} for crop in ("SpringWheat", "Corn")]
        soil = [{"YEAR": "2008", "REP": "1", "CCTRT": "1", "PLOT": "123"}]
        crop = [{"YEAR": "2008", "REP": "1", "TRT": "1", "PLOT": "123"}]
        with self.assertRaisesRegex(ValueError, "not specific"):
            mandan.plot_bridge(yields, soil, crop)

    def test_layer_units_missing_total_and_partial_depth(self):
        row = {**{f"SWC{i}": str(i) for i in range(1, 8)}, "TOTAL": "28"}
        normalized = mandan.normalize_water(row)
        self.assertEqual(normalized["storage_0_210cm_mm"], 280)
        self.assertEqual(normalized["storage_0_90cm_mm"], 60)
        row["TOTAL"] = "30"
        with self.assertRaisesRegex(ValueError, "layer sum"):
            mandan.normalize_water(row)
        row["TOTAL"], row["SWC7"] = "28", "-9999"
        self.assertIsNone(mandan.normalize_water(row)["storage_0_210cm_mm"])
        self.assertEqual(mandan.normalize_water(row)["storage_0_90cm_mm"], 60)
        row["SWC7"], row["TOTAL"] = "7", "-9999"
        self.assertIsNone(mandan.normalize_water(row)["storage_0_210cm_mm"])
        self.assertIsNone(mandan.numeric("-9999.0"))
        self.assertEqual(mandan.numeric("0"), 0)
        for value in ("nan", "inf", "-2"):
            with self.assertRaises(ValueError):
                mandan.numeric(value)

    def test_actual_bridge_cohorts_and_unverified_nitrogen_are_explicit(self):
        report = json.loads(self.files["inventory.json"])
        self.assertEqual(report["bridge"]["spring_wheat"], 236)
        self.assertEqual(report["soil_nitrogen_plot_mismatches_retained"], 236)
        self.assertEqual(report["counts"]["spring_water_yield"], 176)
        self.assertEqual(report["counts"]["initial_spring_water_yield"], 164)
        self.assertEqual(report["counts"]["water_yield_pairs"], 142)
        self.assertEqual(report["counts"]["initial_water_yield_pairs"], 110)
        self.assertTrue(all(r["soil_nitrogen_plot_matches"] == "False" for r in self.rows("plot_crosswalk.csv")))
        self.assertTrue(all(r["water_raw_plot_id_present"] == "False" for r in self.rows("plot_crosswalk.csv")))
        self.assertFalse(report["models_fitted"])

    def test_pairs_use_only_cover_vs_untreated_control_and_valid_units(self):
        observations = {r["observation_id"]: r for r in self.rows("observations.csv")}
        pairs = self.rows("yield_pairs.csv")
        self.assertEqual(len(pairs), 216)
        for pair in pairs:
            cover, control = observations[pair["pair_id"]], observations[pair["control_id"]]
            self.assertTrue(2 <= int(cover["treatment"]) <= 19)
            self.assertEqual(control["treatment"], "1")
            self.assertEqual((cover["year"], cover["rep"]), (control["year"], control["rep"]))
            self.assertAlmostEqual(float(pair["delta_yield_t_ha"]), float(cover["wheat_yield_t_ha"]) - float(control["wheat_yield_t_ha"]))
        first = observations["mandan/2009/R1/T1"]
        self.assertEqual(float(first["wheat_yield_t_ha"]), 3.794)
        drilled = [r for r in observations.values() if r["treatment"] == "20"]
        self.assertEqual(len(drilled), 8)
        self.assertTrue(all(r["spring_storage_0_210cm_mm"] == "" for r in drilled))

    def test_whole_year_folds_preserve_shared_controls(self):
        folds = self.rows("fold_memberships.csv")
        observations = {r["observation_id"]: r for r in self.rows("observations.csv")}
        for name in ("spring_water_yield", "initial_spring_water_yield", "yield_pairs", "water_yield_pairs", "initial_water_yield_pairs"):
            rows = self.rows(name + ".csv")
            selected = [r for r in folds if r["cohort"] == name]
            evaluated = [r["item_id"] for r in selected if r["role"] == "evaluation"]
            self.assertEqual(len(evaluated), len(rows))
            self.assertEqual(len(set(evaluated)), len(rows))
            for row in selected:
                self.assertEqual(row["role"] == "evaluation", row["year"] == row["held_out_year"])
            for pair in rows if "pairs" in name else []:
                self.assertEqual(observations[pair["pair_id"]]["year"], observations[pair["control_id"]]["year"])

    def test_ambiguous_identities_and_tampering_rejected(self):
        row = {"YEAR": "2008", "REP": "1", "CCTRT": "1"}
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            mandan.unique([row, row], "YEAR", "CCTRT")
        with patch.object(prep, "digest", return_value="0" * 64):
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                mandan.build_snapshot()

    def test_snapshot_replay_is_byte_identical(self):
        self.assertEqual(self.files, mandan.build_snapshot())
        with tempfile.TemporaryDirectory() as temporary:
            prep.write_snapshot(self.files, Path(temporary))
            prep.write_snapshot(mandan.build_snapshot(), Path(temporary))
            self.assertEqual(len(list(Path(temporary).iterdir())), len(self.files))


if __name__ == "__main__":
    unittest.main()
