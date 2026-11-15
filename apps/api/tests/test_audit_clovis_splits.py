"""Date grouping, category coverage, buffers, and honest chronology diagnostics."""

import copy
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app/ml"))
import audit_clovis_splits as audit


def observations():
    rows = []
    for index in range(300):
        day = date(2022, 1, 1) + timedelta(days=index)
        phase = "sorghum" if index < 60 else "cover_period" if index < 120 else "winter_wheat"
        for treatment in ("fallow", "pea", "oat", "six_species_mix"):
            rows.append({"date": day.isoformat(), "treatment": treatment, "partition": "train",
                         "management_phase": phase, "target_eligible": True, "soil_moisture_m3_m3": 0.2})
    return rows


class SplitAuditTests(unittest.TestCase):
    def setUp(self):
        self.rows = observations()
        self.pairs = audit.pooled_pairs(self.rows)
        self.policy = audit.load_protocol()

    def candidate(self, by_phase=True):
        return audit.build_candidate(self.rows, self.pairs, {}, self.policy, by_phase)[0]

    def test_phase_balancing_preserves_all_categories_and_dates_but_flags_global_time_inversion(self):
        assignments = self.candidate()
        result, memberships = audit.assess(self.rows, assignments, 1, True)
        self.assertTrue(result["every_phase_in_every_partition"])
        self.assertFalse(result["globally_chronological"])
        self.assertTrue(result["all_moisture_date_footprints_disjoint"])
        self.assertEqual(result["same_date_treatment_partition_conflicts"], 0)
        for day in {r["date"] for r in memberships}:
            group = [r for r in memberships if r["date"] == day]
            self.assertEqual(len(group), 4)
            self.assertEqual(len({r["partition"] for r in group}), 1)

    def test_global_split_is_chronological_without_promising_every_category(self):
        result, _ = audit.assess(self.rows, self.candidate(False), 1, True)
        self.assertTrue(result["globally_chronological"])
        self.assertFalse(result["every_phase_in_every_partition"])
        self.assertGreater(result["coverage"]["train"]["fraction_accepted_rows"], 0.7)

    def test_three_day_buffers_are_unscored_but_can_supply_observed_context(self):
        assignments, cuts = audit.build_candidate(self.rows, self.pairs, {}, self.policy, False)
        boundary = date.fromisoformat(cuts[0]["training_target_cutoff"])
        for offset in (1, 2, 3):
            self.assertEqual(assignments[(boundary + timedelta(days=offset)).isoformat()], "gap")
        self.assertEqual(assignments[(boundary + timedelta(days=4)).isoformat()], "validation")
        result, memberships = audit.assess(self.rows, assignments, 3, True)
        first_val = [r for r in memberships if r["partition"] == "validation"][0]
        self.assertEqual(first_val["date"], (boundary + timedelta(days=4)).isoformat())
        self.assertTrue(first_val["uses_buffer_context"])
        self.assertTrue(result["all_moisture_date_footprints_disjoint"])

    def test_missing_measurements_are_not_filled_and_footprints_never_cross_partition(self):
        assignments = self.candidate()
        baseline, _ = audit.assess(self.rows, assignments, 1, True)
        changed = copy.deepcopy(self.rows)
        stamp = "2022-01-10"
        for row in changed:
            if row["date"] == stamp:
                row["target_eligible"] = False
        result, memberships = audit.assess(changed, assignments, 1, True)
        self.assertEqual(baseline["accepted_rows"] - result["accepted_rows"], 8)
        self.assertTrue(all(row["date"] not in {stamp, "2022-01-11"} for row in memberships))
        self.assertTrue(result["all_moisture_date_footprints_disjoint"])

    def test_boundaries_do_not_depend_on_target_values_and_intervals_roundtrip(self):
        assignments = self.candidate()
        changed = [{**row, "soil_moisture_m3_m3": 0.1 + (i % 7) / 100} for i, row in enumerate(self.rows)]
        other, _ = audit.build_candidate(changed, audit.pooled_pairs(changed), {}, self.policy, True)
        self.assertEqual(assignments, other)
        reconstructed = {}
        for interval in audit.assignment_intervals(assignments):
            for day in audit.prep.days(date.fromisoformat(interval["start"]), date.fromisoformat(interval["end"])):
                reconstructed[day.isoformat()] = interval["name"]
        self.assertEqual(assignments, reconstructed)

    def test_original_allocation_counts_match_frozen_preparation(self):
        protocol = audit.prep.load_protocol()
        audit.weather.verify_labels(audit.prep.OUTPUT, protocol)
        rows = audit.prep.normalize(audit.prep.read_daily(audit.prep.DAILY, protocol), protocol)
        assignments = {row["date"]: row["partition"] for row in rows}
        result, _ = audit.assess(rows, assignments, 1, False)
        self.assertEqual([result["coverage"][part]["rows"] for part in audit.PARTITIONS], [1048, 52, 1548])
        self.assertTrue(result["globally_chronological"])
        self.assertFalse(result["every_phase_in_every_partition"])
        self.assertEqual(len(audit.pooled_pairs(rows)), 2664)


if __name__ == "__main__":
    unittest.main()
