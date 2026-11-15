"""A runtime-only discrepancy must never conceal changed research data."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
from verify_research_replay import compare_prepared, verify


class ReplayAuditTests(unittest.TestCase):
    def test_identical_bytes_and_runtime_only_difference(self):
        original = {"rows.csv": b"value\n1\n", "manifest.json": json.dumps({"python": "3.14.4", "n": 1}).encode()}
        self.assertEqual(compare_prepared(original, original), [])
        current = {**original, "manifest.json": json.dumps({"python": "3.14.6", "n": 1}).encode()}
        self.assertEqual(compare_prepared(original, current)[0]["field"], "python")

    def test_changed_data_counts_and_membership_are_rejected(self):
        original = {"rows.csv": b"value\n1\n", "manifest.json": json.dumps({"python": "3.14.4", "n": 1}).encode()}
        for current in ({**original, "rows.csv": b"value\n2\n"},
                        {**original, "manifest.json": json.dumps({"python": "3.14.6", "n": 2}).encode()},
                        {"rows.csv": original["rows.csv"]}):
            with self.assertRaises(ValueError):
                compare_prepared(original, current)

    def test_real_replay_does_not_refit_or_claim_exact_export(self):
        report = verify()
        self.assertTrue(report["data_replay_verified"])
        self.assertTrue(report["weights_hash_verified"])
        self.assertFalse(report["model_fitted"])
        self.assertFalse(report["exact_export_reproduced"])


if __name__ == "__main__":
    unittest.main()
