import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "app/ml"))
import net_return as economics


ASSUMPTIONS = {"crop_price_usd_per_t": 200, "cover_income_usd_per_ha": 10,
    "incentive_usd_per_ha": 0, "seed_cost_usd_per_ha": 20,
    "establishment_cost_usd_per_ha": 5, "termination_cost_usd_per_ha": 15,
    "other_additional_cost_usd_per_ha": 0}


class NetReturnTests(unittest.TestCase):
    def test_net_return_sign_and_costs(self):
        self.assertEqual(economics.net_return_per_ha(0.2, ASSUMPTIONS), 10)
        self.assertEqual(economics.net_return_per_ha(-0.1, ASSUMPTIONS), -50)

    def test_missing_is_not_zero_and_explicit_zero_is_valid(self):
        incomplete = dict(ASSUMPTIONS)
        del incomplete["incentive_usd_per_ha"]
        with self.assertRaisesRegex(ValueError, "Missing monetary assumptions"):
            economics.net_return_per_ha(0, incomplete)
        self.assertEqual(economics.net_return_per_ha(0, ASSUMPTIONS), -30)
        with self.assertRaisesRegex(ValueError, "cannot be negative"):
            economics.net_return_per_ha(0, dict(ASSUMPTIONS, seed_cost_usd_per_ha=-1))

    def test_break_even_and_zero_price(self):
        self.assertAlmostEqual(economics.break_even_yield_t_ha(ASSUMPTIONS), 0.15)
        zero = dict(ASSUMPTIONS, crop_price_usd_per_t=0)
        self.assertIsNone(economics.break_even_yield_t_ha(zero))

    def test_gate_requires_validated_bounds_and_loss_limit(self):
        abstain = economics.policy_gate(net_return_lower_bound_usd_per_ha=2,
            yield_lower_bound_t_ha=0.1, uncertainty_independently_validated=False,
            max_tolerable_yield_loss_t_ha=0)
        self.assertEqual(abstain["action"], "abstain")
        with self.assertRaisesRegex(ValueError, "must be a boolean"):
            economics.policy_gate(net_return_lower_bound_usd_per_ha=2,
                yield_lower_bound_t_ha=0.1, uncertainty_independently_validated="false",
                max_tolerable_yield_loss_t_ha=0)
        ok = economics.policy_gate(net_return_lower_bound_usd_per_ha=2,
            yield_lower_bound_t_ha=0, uncertainty_independently_validated=True,
            max_tolerable_yield_loss_t_ha=0)
        self.assertEqual(ok["action"], "cover")
        no = economics.policy_gate(net_return_lower_bound_usd_per_ha=2,
            yield_lower_bound_t_ha=-0.1, uncertainty_independently_validated=True,
            max_tolerable_yield_loss_t_ha=0)
        self.assertIn("yield_loss_limit_exceeded", no["reasons"])
        with self.assertRaisesRegex(ValueError, "nonnegative"):
            economics.policy_gate(net_return_lower_bound_usd_per_ha=1,
                yield_lower_bound_t_ha=0, uncertainty_independently_validated=True,
                max_tolerable_yield_loss_t_ha=-1)

    def test_oof_metrics_against_fallow_and_training_mean(self):
        rows = [
            {"task": "yield_difference", "item_id": "a", "year": 1, "control_id": "c1", "unit": "t/ha", "observed": 1, "predicted": 0.8},
            {"task": "yield_difference", "item_id": "b", "year": 1, "control_id": "c1", "unit": "t/ha", "observed": -1, "predicted": -0.4},
            {"task": "yield_difference", "item_id": "c", "year": 2, "control_id": "c2", "unit": "t/ha", "observed": 0.5, "predicted": 0.2},
        ]
        result = economics.evaluate_oof(rows)
        self.assertEqual(result["method"], "model")
        self.assertEqual(result["scores"]["always_fallow"]["pooled_mae_t_ha"], 0.8333333333333334)
        self.assertEqual(result["training_mean_by_held_out_year_t_ha"]["1"], 0.5)
        self.assertEqual(result["scores"]["model"]["harmful_cover_calls_n"], 0)
        self.assertIn("not estimated", result["uncertainty_intervals"])

    def test_detects_shared_control_cross_year_leakage(self):
        rows = [{"task": "yield_difference", "unit": "t/ha", "item_id": "a", "year": 1, "control_id": "same", "observed": 0, "predicted": 0},
                {"task": "yield_difference", "unit": "t/ha", "item_id": "b", "year": 2, "control_id": "same", "observed": 0, "predicted": 0}]
        with self.assertRaisesRegex(ValueError, "spans years"):
            economics.evaluate_oof(rows)

    def test_requires_two_years_and_rejects_fold_overlap(self):
        one_year = [{"task": "yield_difference", "unit": "t/ha", "item_id": "a", "year": 1,
                     "control_id": "c1", "observed": 0, "predicted": 0}]
        with self.assertRaisesRegex(ValueError, "At least two years"):
            economics.evaluate_oof(one_year)
        rows = [{"task": "yield_difference", "unit": "t/ha", "item_id": "a", "year": 1,
                 "control_id": "c1", "observed": 0, "predicted": 0, "training_years": "1,2"},
                {"task": "yield_difference", "unit": "t/ha", "item_id": "b", "year": 2,
                 "control_id": "c2", "observed": 1, "predicted": 1}]
        with self.assertRaisesRegex(ValueError, "overlaps"):
            economics.evaluate_oof(rows)

    def test_rejects_same_pair_identity_reappearing_in_another_year(self):
        rows = [{"task": "yield_difference", "unit": "t/ha", "item_id": "pair-a", "year": 1,
                 "control_id": "c1", "observed": 0, "predicted": 0},
                {"task": "yield_difference", "unit": "t/ha", "item_id": "pair-a", "year": 2,
                 "control_id": "c2", "observed": 1, "predicted": 1}]
        with self.assertRaisesRegex(ValueError, "identities must be unique"):
            economics.evaluate_oof(rows)

    def test_sensitivity_unconfigured_and_field_area(self):
        rows = [{"year": "1", "control_id": "c1", "observed": 0.2, "predicted": 0.1, "training_mean_prediction": 0.3}]
        result = economics.monetary_sensitivity(rows, [{"name": "missing", "assumptions": {}},
            {"name": "fixture", "assumptions": ASSUMPTIONS}], area_ha=2)
        self.assertEqual(result["missing"]["status"], "unconfigured")
        self.assertEqual(result["fixture"]["observed_mean_field_net_return_usd"], 20)
        self.assertIn("control_balanced_macro_year_regret_usd_per_ha",
                      result["fixture"]["decision_diagnostics"]["model"])
        self.assertEqual(result["fixture"]["decision_diagnostics"]["model"]["missed_opportunities_n"], 1)
        self.assertEqual(result["fixture"]["decision_diagnostics"]["model"]["mean_regret_usd_per_ha"], 10)
        self.assertEqual(result["fixture"]["decision_diagnostics"]["training_mean"]["mean_regret_usd_per_ha"], 0)
        with self.assertRaises(ValueError):
            economics.monetary_sensitivity(rows, [], area_ha=0)
        with self.assertRaisesRegex(ValueError, "At least one OOF"):
            economics.monetary_sensitivity([], [{"name": "x", "assumptions": ASSUMPTIONS}])

    def test_method_filter_preserves_requested_method(self):
        rows = [
            {"task": "yield_difference", "method": "one", "item_id": "a", "year": 1, "control_id": "c1", "unit": "t/ha", "observed": 1, "predicted": 0.8},
            {"task": "yield_difference", "method": "one", "item_id": "b", "year": 2, "control_id": "c2", "unit": "t/ha", "observed": -1, "predicted": -0.4},
            {"task": "yield_difference", "method": "two", "item_id": "a", "year": 1, "control_id": "c1", "unit": "t/ha", "observed": 1, "predicted": -10},
            {"task": "yield_difference", "method": "two", "item_id": "b", "year": 2, "control_id": "c2", "unit": "t/ha", "observed": -1, "predicted": 10},
        ]
        self.assertEqual(economics.evaluate_oof(rows, method="one")["method"], "one")
        self.assertEqual(economics.evaluate_oof(rows, method="two")["method"], "two")


if __name__ == "__main__":
    unittest.main()
