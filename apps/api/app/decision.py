"""Task 6: visible assumptions and arithmetic, independent of model fitting."""

from .contracts import EconomicAssumptions, FinancialResult, Recommendation, RiskRules, ScenarioResult, WaterRisk

MINIMUM_RELATIVE_BASELINE = 1e-6


def planting_advice(cases: list[ScenarioResult], quality_reasons: list[str]) -> Recommendation:
    """Provisional UI policy; validation flags are retained but do not suppress demo advice."""
    reasons = set(quality_reasons)
    if len(cases) != 3 or any(case.finances.incremental_net_benefit_usd_ha is None or case.water_risk.level == "unknown" for case in cases):
        reasons.add("missing_scenario_comparison")
        return Recommendation(decision="insufficient_evidence", status="unavailable", reason_codes=sorted(reasons),
            message="No planting advice is available because a scenario moisture or financial comparison is missing.")
    benefits = [case.finances.incremental_net_benefit_usd_ha for case in cases]
    if any(case.water_risk.level == "high" for case in cases):
        decision, reason = "do_not_plant", "high_relative_water_loss_in_a_case"
        message = "Provisional demo advice: leave the interval fallow; at least one historical case exceeds the high relative moisture-loss threshold."
    elif all(value < -1e-9 for value in benefits):
        decision, reason = "do_not_plant", "negative_incremental_return_in_all_cases"
        message = "Provisional demo advice: leave the interval fallow; incremental return is negative in all three cases under these assumptions."
    elif all(value > 1e-9 for value in benefits):
        decision, reason = "plant", "positive_incremental_return_in_all_cases"
        message = "Provisional demo advice: plant the selected cover crop; all three cases have positive incremental return and none has high relative moisture loss."
    else:
        decision, reason = "review", "mixed_or_break_even_returns"
        message = "Provisional demo advice: review the trade-offs; the cases include mixed returns or a break-even result."
    reasons.update((reason, "provisional_unvalidated_advice"))
    return Recommendation(decision=decision, status="provisional", reason_codes=sorted(reasons), message=message)


def relative_moisture_difference(cover: float, fallow: float) -> float | None:
    if fallow <= MINIMUM_RELATIVE_BASELINE:
        return None
    return (cover - fallow) / fallow


def water_risk(relative_difference: float | None, rules: RiskRules) -> WaterRisk:
    if relative_difference is None:
        return WaterRisk(level="unknown", relative_loss=None)
    loss = max(0.0, -relative_difference)
    level = ("high" if loss >= rules.high_relative_moisture_loss else
             "moderate" if loss >= rules.moderate_relative_moisture_loss else "low")
    return WaterRisk(level=level, relative_loss=loss)


def financial_result(relative_difference: float | None, assumptions: EconomicAssumptions, area_ha: float) -> FinancialResult:
    a = assumptions
    costs = a.seed_cost_usd_ha + a.establishment_cost_usd_ha + a.termination_cost_usd_ha + a.additional_cost_usd_ha
    baseline_revenue = a.baseline_wheat_yield_t_ha * a.wheat_price_usd_t
    common = {"fallow_wheat_yield_t_ha": a.baseline_wheat_yield_t_ha,
              "fallow_wheat_gross_revenue_usd_ha": baseline_revenue, "total_cover_cost_usd_ha": costs,
              "net_cover_revenue_usd_ha": a.net_cover_revenue_usd_ha, "incentive_usd_ha": a.incentive_usd_ha}
    if relative_difference is None:
        return FinancialResult(**common, status="insufficient_moisture_baseline", raw_relative_yield_change=None,
            relative_yield_change=None, yield_change_was_capped=False, cover_wheat_yield_t_ha=None,
            cover_wheat_gross_revenue_usd_ha=None, wheat_revenue_difference_usd_ha=None,
            incremental_net_benefit_usd_ha=None, incremental_net_benefit_usd_total=None,
            additional_revenue_to_break_even_usd_ha=None, financial_signal="unknown")
    raw = relative_difference * a.moisture_to_yield_sensitivity
    change = min(a.max_relative_yield_change, max(-a.max_relative_yield_change, raw))
    cover_yield = a.baseline_wheat_yield_t_ha * (1 + change)
    cover_revenue = cover_yield * a.wheat_price_usd_t
    revenue_difference = cover_revenue - baseline_revenue
    benefit = revenue_difference + a.net_cover_revenue_usd_ha + a.incentive_usd_ha - costs
    return FinancialResult(**common, status="calculated", raw_relative_yield_change=raw,
        relative_yield_change=change, yield_change_was_capped=change != raw, cover_wheat_yield_t_ha=cover_yield,
        cover_wheat_gross_revenue_usd_ha=cover_revenue, wheat_revenue_difference_usd_ha=revenue_difference,
        incremental_net_benefit_usd_ha=benefit, incremental_net_benefit_usd_total=benefit * area_ha,
        additional_revenue_to_break_even_usd_ha=max(0.0, -benefit),
        financial_signal="positive" if benefit > 1e-9 else "negative" if benefit < -1e-9 else "neutral")
