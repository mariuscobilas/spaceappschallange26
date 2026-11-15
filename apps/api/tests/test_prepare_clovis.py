"""Data-contract tests; no downloads, learned transforms, or model training."""

import copy
import csv
import io
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import prepare_clovis as prep


class PreparationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = prep.load_protocol()

    def source_record(self, day, value="0.25", irrigation_mm=0):
        return {"date": date.fromisoformat(day), "source_row": 2,
                "irrigation_mm": irrigation_mm,
                "row": {column: value for column in self.protocol["treatments"]}}

    def test_invalid_values_do_not_become_targets(self):
        for raw in ("", "None", "NA", "-888.88", "NaN", "inf", "-0.1", "1.01", "broken"):
            with self.subTest(raw=raw):
                value, flags = prep.parse_moisture(raw, self.protocol)
                self.assertIsNone(value)
                self.assertTrue(flags)
        self.assertEqual(prep.parse_moisture("0", self.protocol), (0.0, []))

    def test_all_treatments_share_frozen_split(self):
        dates = {"2023-04-23": "train", "2023-04-24": "gap", "2023-04-25": "validation",
                 "2023-05-08": "validation", "2023-05-09": "gap", "2023-05-10": "test"}
        for day, partition in dates.items():
            rows = prep.normalize([self.source_record(day)], self.protocol)
            self.assertEqual({r["partition"] for r in rows}, {partition})
            self.assertEqual({r["treatment"] for r in rows}, set(self.protocol["treatments"].values()))

    def test_no_pair_crosses_gap_or_partition_boundary(self):
        records = [self.source_record(day) for day in (
            "2023-04-23", "2023-04-24", "2023-04-25", "2023-04-26",
            "2023-05-08", "2023-05-09", "2023-05-10", "2023-05-11")]
        pairs, _ = prep.make_pairs(prep.normalize(records, self.protocol))
        self.assertEqual({p["date"] for p in pairs}, {"2023-04-26", "2023-05-11"})
        for pair in pairs:
            self.assertEqual(prep.interval_name(date.fromisoformat(pair["previous_date"]),
                                               self.protocol["partitions"]), pair["partition"])

    def test_pair_does_not_jump_missing_day_or_invalid_endpoint(self):
        records = [self.source_record("2023-04-01"), self.source_record("2023-04-03"),
                   self.source_record("2023-04-04", "-888.88"), self.source_record("2023-04-05")]
        pairs, _ = prep.make_pairs(prep.normalize(records, self.protocol))
        self.assertEqual(pairs, [])

    def test_sensor_reinstallation_day_is_not_a_measured_target(self):
        records = [self.source_record("2023-03-09"), self.source_record("2023-03-10"),
                   self.source_record("2023-03-11")]
        rows = prep.normalize(records, self.protocol)
        self.assertFalse(rows[0]["target_eligible"])
        self.assertIn("outside_documented_sensor_window", rows[0]["quality_flags"])
        pairs, _ = prep.make_pairs(rows)
        self.assertEqual({p["date"] for p in pairs}, {"2023-03-11"})

    def test_management_dates_are_distinct_from_sensor_dates(self):
        rows = prep.normalize([self.source_record("2023-02-24"),
                               self.source_record("2023-05-22")], self.protocol)
        pea = [r for r in rows if r["treatment"] == "pea"]
        self.assertTrue(pea[0]["cover_active"])
        self.assertEqual(pea[0]["days_since_cover_planting"], 0)
        self.assertFalse(pea[0]["target_eligible"])
        self.assertFalse(pea[1]["cover_active"])
        self.assertEqual(pea[1]["days_since_cover_termination"], 0)
        self.assertFalse(any(r["cover_active"] for r in rows if r["treatment"] == "fallow"))

    def test_heldout_target_changes_do_not_change_training_pairs(self):
        records = [self.source_record(day) for day in
                   ("2023-04-01", "2023-04-02", "2023-05-10", "2023-05-11")]
        modified = copy.deepcopy(records)
        modified[-1]["row"]["Pea5"] = "0.75"
        original_pairs, _ = prep.make_pairs(prep.normalize(records, self.protocol))
        changed_pairs, _ = prep.make_pairs(prep.normalize(modified, self.protocol))
        self.assertEqual([p for p in original_pairs if p["partition"] == "train"],
                         [p for p in changed_pairs if p["partition"] == "train"])
        self.assertNotEqual(original_pairs, changed_pairs)

    def test_duplicate_source_dates_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.csv"
            path.write_text("Date,Irr,F5,Pea5,Oat5,SSM5\n7/16/2022,0,0.2,0.2,0.2,0.2\n"
                            "7/16/2022,0,0.2,0.2,0.2,0.2\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Duplicate source date"):
                prep.read_daily(path, self.protocol)

    def test_irrigation_conversion_and_workbook_reconciliation(self):
        records = prep.read_daily(prep.DAILY, self.protocol)
        events = prep.read_activity(prep.ACTIVITY, self.protocol)
        example = next(r for r in records if r["date"] == date(2023, 2, 24))
        self.assertAlmostEqual(example["irrigation_mm"], 25.4)
        self.assertEqual(prep.check_irrigation(records, events)["events_in_coverage"], 11)
        example["irrigation_mm"] = 2.54
        with self.assertRaisesRegex(ValueError, "irrigation mismatch"):
            prep.check_irrigation(records, events)

    def test_outputs_are_reproducible_and_freeze_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            report = prep.prepare(output)
            hashes = {p.name: prep.digest(p) for p in output.iterdir()}
            prep.prepare(output)
            self.assertEqual(hashes, {p.name: prep.digest(p) for p in output.iterdir()})
            self.assertEqual(report["observation_rows"], 4 * report["source_dates"])
            self.assertEqual(sum(report["excluded_pairs_by_primary_reason"].values())
                             + report["pair_rows"], report["observation_rows"])
            for partition in ("train", "validation", "test"):
                with (output / f"{partition}_pairs.csv").open(newline="") as stream:
                    rows = list(csv.DictReader(stream))
                self.assertTrue(rows)
                self.assertEqual({r["partition"] for r in rows}, {partition})
                self.assertEqual(len(rows), report["partitions"][partition]["eligible_pairs"])
            manifest = output / "split_manifest.json"
            modified = json.loads(manifest.read_text())
            modified["input_sha256"]["tampered"] = "changed"
            manifest.write_text(json.dumps(modified))
            with self.assertRaisesRegex(ValueError, "Frozen input hashes or split changed"):
                prep.prepare(output)


if __name__ == "__main__":
    unittest.main()
