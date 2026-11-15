"""Adapt the unchanged Task 5 engine to the frontend contract and Task 6 math."""

from .contracts import (AnalysisRequest, AnalysisResponse, CalendarLimits, Choice, FinancialSummary,
                        InitialMoisture, ModelInfo, MoistureComparison, OptionsResponse, QualityInfo,
                        Recommendation, ScenarioResult, SiteOption, WeatherInfo)
from .contracts import EconomicAssumptions, RiskRules
from .decision import financial_result, planting_advice, relative_moisture_difference, water_risk
from .ml.runtime import scenario_module

legacy = scenario_module()


def default_request():
    import json
    scenario = json.loads(legacy.EXAMPLE.read_text(encoding="utf-8"))
    return AnalysisRequest(scenario=scenario)


def options():
    policy = legacy.load_protocol()
    site = legacy.prep.load_protocol()["site"]
    return OptionsResponse(
        sites=[SiteOption(id="clovis_nm", label="Clovis, New Mexico", latitude=site["latitude"], longitude=site["longitude"])],
        cover_crops=[Choice(id="pea", label="Pea"), Choice(id="oat", label="Oat"), Choice(id="six_species_mix", label="Six-species mix")],
        next_crops=[Choice(id="winter_wheat", label="Winter wheat")],
        scenarios=[Choice(id="dry", label="Dry historical case"), Choice(id="typical", label="Typical historical case"), Choice(id="very_rainy", label="Very rainy historical case")],
        calendar=CalendarLimits(cover_planting_months=policy["cover_planting_months"],
            cover_termination_months=policy["cover_termination_months"], wheat_planting_months=policy["wheat_planting_months"]),
        default_economics=EconomicAssumptions(), default_risk_rules=RiskRules(), example_request=default_request(),
        notes=["Moisture inputs and outputs are daily averages at 5 cm; 0.25 means 25%.",
               "Historical cases carry no forecast probabilities.",
               "Financial defaults and water-risk thresholds are editable assumptions, not calibrated agronomic or market estimates.",
               "Planting advice is a provisional scenario rule for prototype integration; validation and reliability flags remain visible."])


def load_engine():
    import os
    from pathlib import Path
    bundle = os.environ.get("FIELD_SHIFT_MODEL_BUNDLE")
    if bundle:
        from .ml.model_bundle import load_bundle
        model, model_info = load_bundle(Path(bundle).resolve())
        history, weather_info = legacy.load_history()
        default, default_info = legacy.load_default_moisture()
        return legacy.ScenarioEngine(model, history, default, model_info, weather_info, default_info)
    configured = os.environ.get("FIELD_SHIFT_REGRESSION_RUN")
    return legacy.ScenarioEngine.from_artifacts(Path(configured).resolve() if configured else None)


def analyze(engine, request: AnalysisRequest, request_id: str) -> AnalysisResponse:
    raw = engine.simulate(request.scenario)
    info = raw["model"]
    model = ModelInfo(name=info["name"], artifact_sha256=info["artifact_sha256"], source_run_id=info["regression_run_id"],
        status=info["status"], validation_mae_m3_m3=info["validation_mae_m3_m3"],
        persistence_validation_mae_m3_m3=info["persistence_validation_mae_m3_m3"])
    cases = []
    reasons = {"seasonal_model_unvalidated", "financial_conversion_assumed", "surface_moisture_only"}
    for case in raw["scenarios"]:
        cover, fallow = case["cover_final_7_day_average_m3_m3"], case["fallow_final_7_day_average_m3_m3"]
        relative = relative_moisture_difference(cover, fallow)
        diagnostic = case["diagnostics"]
        flags = sorted(set(case["quality_flags"]))
        if relative is None:
            flags.append("insufficient_relative_moisture_baseline")
        clipped = diagnostic["cover_clipped_days"] + diagnostic["fallow_clipped_days"] > 0
        quality = QualityInfo(reliability="invalid" if clipped else "limited",
            cover_clipped_days=diagnostic["cover_clipped_days"], fallow_clipped_days=diagnostic["fallow_clipped_days"],
            cover_unseen_phase_days=diagnostic["cover_unseen_phase_days"], fallow_unseen_phase_days=diagnostic["fallow_unseen_phase_days"],
            cover_out_of_training_range=diagnostic["cover_out_of_training_range"],
            fallow_out_of_training_range=diagnostic["fallow_out_of_training_range"], flags=flags)
        if clipped:
            reasons.add("moisture_predictions_clipped")
        if "no_detectable_final_week_cover_response" in flags:
            reasons.add("no_detectable_final_week_cover_response")
        if info["status"] == "experimental_not_selected":
            reasons.add("model_failed_validation_checks")
        cases.append(ScenarioResult(
            **{key: case[key] for key in ("scenario", "historical_start_date", "historical_end_date", "requested_rainfall_percentile",
                "actual_rainfall_percentile", "eligible_historical_seasons", "simulation_days", "total_rain_mm", "total_irrigation_mm")},
            moisture=MoistureComparison(cover_at_planting_m3_m3=case["cover_moisture_at_planting_m3_m3"],
                fallow_at_planting_m3_m3=case["fallow_moisture_at_planting_m3_m3"],
                cover_final_7_day_average_m3_m3=cover, fallow_final_7_day_average_m3_m3=fallow,
                final_7_day_difference_m3_m3=cover - fallow, relative_final_7_day_difference=relative,
                minimum_cover_m3_m3=case["minimum_cover_moisture_m3_m3"], minimum_fallow_m3_m3=case["minimum_fallow_moisture_m3_m3"]),
            water_risk=water_risk(relative, request.risk_rules), quality=quality,
            finances=financial_result(relative, request.economics, request.area_ha),
            daily_trajectory=case["daily_trajectory"] if request.include_daily_trajectory else None))
    benefits = [case.finances.incremental_net_benefit_usd_ha for case in cases if case.finances.incremental_net_benefit_usd_ha is not None]
    provenance = raw["initial_moisture_provenance"]
    return AnalysisResponse(execution_mode="computed", request_id=request_id, request=request, model=model,
        weather=WeatherInfo(history_start_date=raw["weather"]["start_date"], history_end_date=raw["weather"]["end_date"]),
        initial_moisture=InitialMoisture(value_m3_m3=raw["initial_moisture_m3_m3"], source=provenance["source"], source_dates=provenance.get("dates", [])),
        scenarios=cases, financial_summary=FinancialSummary(minimum_incremental_net_benefit_usd_ha=min(benefits) if benefits else None,
            maximum_incremental_net_benefit_usd_ha=max(benefits) if benefits else None,
            cases_with_positive_incremental_benefit=sum(value > 1e-9 for value in benefits), calculated_cases=len(benefits), case_count=len(cases)),
        recommendation=planting_advice(cases, sorted(reasons)),
        assumptions=["Same initial daily-average water, weather, and irrigation are used for cover and fallow.",
                     "Moisture is a daily average at 5 cm, not root-zone water storage or an end-of-day sensor reading.",
                     "Historical rainfall cases are scenarios without forecast probabilities.",
                     "Station day alignment with NASA local solar time is assumed.",
                     "Yield change is an editable moisture sensitivity with a cap, not a learned or validated yield forecast.",
                     "Incremental net benefit includes cover costs and specified cover revenue/incentives; common wheat production costs are excluded.",
                     "Water-risk labels are separate illustrative rules and do not multiply yield or revenue again.",
                     "Clipping or identical final-week predictions do not establish a physically valid crop comparison."])
