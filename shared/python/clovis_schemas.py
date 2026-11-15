"""Versioned frontend request and response contracts for the Clovis MVP."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from datetime import timedelta


MoneyInput = Annotated[float, Field(strict=True, ge=0, le=1_000_000, allow_inf_nan=False)]
Finite = Annotated[float, Field(allow_inf_nan=False)]
Moisture = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, json_schema_serialization_defaults_required=True)


def calendar_date(value: object) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and len(value) == 10:
        parsed = date.fromisoformat(value)
        if parsed.isoformat() == value:
            return parsed
    raise ValueError("Use a calendar date formatted YYYY-MM-DD")


class IrrigationEvent(Contract):
    date: date
    amount_mm: float = Field(ge=0, le=10000, strict=True)
    _date = field_validator("date", mode="before")(calendar_date)


class ScenarioInput(Contract):
    site_id: Literal["clovis_nm"] = "clovis_nm"
    decision_date: date
    initial_soil_moisture_m3_m3: float | None = Field(default=None, ge=0, le=1, strict=True, allow_inf_nan=False,
        description="Daily-average 5 cm moisture on decision_date; 0.25 means 25%. Null uses a historical training default.")
    cover_crop: Literal["pea", "oat", "six_species_mix"]
    cover_planting_date: date
    cover_termination_date: date
    next_crop: Literal["winter_wheat"] = "winter_wheat"
    next_crop_planting_date: date
    irrigation_schedule: list[IrrigationEvent] = Field(default_factory=list)
    _dates = field_validator("decision_date", "cover_planting_date", "cover_termination_date", "next_crop_planting_date", mode="before")(calendar_date)

    @model_validator(mode="after")
    def check_calendar(self):
        if not self.decision_date <= self.cover_planting_date < self.cover_termination_date < self.next_crop_planting_date:
            raise ValueError("Require decision <= cover planting < termination < next planting")
        if not 7 <= (self.next_crop_planting_date - self.decision_date).days <= 365:
            raise ValueError("Simulation horizon must be 7-365 days")
        if self.decision_date.year < 2001 or self.next_crop_planting_date.year > 2100:
            raise ValueError("The MVP supports decision/planting years 2001-2100")
        if not self.cover_planting_date.year == self.cover_termination_date.year == self.next_crop_planting_date.year:
            raise ValueError("Spring cover and autumn wheat must be in the same year")
        if self.cover_planting_date.month not in (2, 3, 4) or self.cover_termination_date.month not in (5, 6) or self.next_crop_planting_date.month not in (9, 10, 11):
            raise ValueError("Date outside the supported Clovis calendar")
        days = [event.date for event in self.irrigation_schedule]
        if len(days) != len(set(days)) or any(not self.decision_date < day <= self.next_crop_planting_date for day in days):
            raise ValueError("Irrigation dates must be unique and after decision_date through next planting")
        return self

class EconomicAssumptions(Contract):
    currency: Literal["USD"] = "USD"
    baseline_wheat_yield_t_ha: float = Field(default=3.0, ge=0, le=100, strict=True)
    wheat_price_usd_t: MoneyInput = 250.0
    moisture_to_yield_sensitivity: float = Field(default=1.0, ge=0, le=10, strict=True,
        description="Illustrative multiplier: relative final-week moisture difference times this value gives uncapped relative yield change.")
    max_relative_yield_change: float = Field(default=0.25, ge=0, le=1, strict=True)
    seed_cost_usd_ha: MoneyInput = 50.0
    establishment_cost_usd_ha: MoneyInput = 10.0
    termination_cost_usd_ha: MoneyInput = 25.0
    additional_cost_usd_ha: MoneyInput = 0.0
    net_cover_revenue_usd_ha: float = Field(default=0.0, ge=-1_000_000, le=1_000_000, strict=True)
    incentive_usd_ha: MoneyInput = 0.0


class RiskRules(Contract):
    moderate_relative_moisture_loss: float = Field(default=0.05, gt=0, lt=1, strict=True)
    high_relative_moisture_loss: float = Field(default=0.15, gt=0, le=1, strict=True)

    @model_validator(mode="after")
    def ordered(self):
        if self.moderate_relative_moisture_loss >= self.high_relative_moisture_loss:
            raise ValueError("Moderate loss threshold must be below the high threshold")
        return self


class AnalysisRequest(Contract):
    scenario: ScenarioInput
    area_ha: float = Field(default=1.0, gt=0, le=1_000_000, strict=True)
    economics: EconomicAssumptions = Field(default_factory=EconomicAssumptions)
    risk_rules: RiskRules = Field(default_factory=RiskRules)
    include_daily_trajectory: bool = True


class ModelInfo(Contract):
    name: str
    artifact_sha256: str
    source_run_id: str
    status: Literal["experimental_not_selected", "passed_validation_checks"]
    validation_mae_m3_m3: Finite
    persistence_validation_mae_m3_m3: Finite
    seasonal_validation_status: Literal["unvalidated"] = "unvalidated"


class WeatherInfo(Contract):
    provider: Literal["NASA_POWER"] = "NASA_POWER"
    source_kind: Literal["historical_scenarios"] = "historical_scenarios"
    history_start_date: date
    history_end_date: date
    time_standard: Literal["LST"] = "LST"
    calendar_alignment_assumed: bool = True
    probabilities_assigned: Literal[False] = False


class InitialMoisture(Contract):
    value_m3_m3: Moisture
    source: Literal["user_supplied", "training_fallow_median"]
    source_dates: list[date] = Field(default_factory=list)
    interpretation: Literal["decision_date_daily_average"] = "decision_date_daily_average"


class TrajectoryPoint(Contract):
    date: date
    historical_weather_date: date
    rain_mm: Finite
    temperature_max_c: Finite
    temperature_min_c: Finite
    humidity_pct: Finite
    wind_speed_m_s: Finite
    solar_radiation_mj_m2_day: Finite
    irrigation_mm: Finite
    management_phase: str
    cover_active: int
    cover_moisture_m3_m3: Moisture
    fallow_moisture_m3_m3: Moisture
    cover_prediction_clipped: bool
    fallow_prediction_clipped: bool
    cover_unseen_phase: bool
    fallow_unseen_phase: bool


class MoistureComparison(Contract):
    cover_at_planting_m3_m3: Moisture
    fallow_at_planting_m3_m3: Moisture
    cover_final_7_day_average_m3_m3: Moisture
    fallow_final_7_day_average_m3_m3: Moisture
    final_7_day_difference_m3_m3: Finite
    relative_final_7_day_difference: Finite | None
    minimum_cover_m3_m3: Moisture
    minimum_fallow_m3_m3: Moisture


class WaterRisk(Contract):
    level: Literal["low", "moderate", "high", "unknown"]
    relative_loss: Finite | None
    method: Literal["editable_relative_moisture_loss_rule"] = "editable_relative_moisture_loss_rule"
    validated: Literal[False] = False


class QualityInfo(Contract):
    reliability: Literal["invalid", "limited"]
    usable_for_recommendation: Literal[False] = False
    cover_clipped_days: int
    fallow_clipped_days: int
    cover_unseen_phase_days: int
    fallow_unseen_phase_days: int
    cover_out_of_training_range: dict[str, int]
    fallow_out_of_training_range: dict[str, int]
    flags: list[str]


class FinancialResult(Contract):
    status: Literal["calculated", "insufficient_moisture_baseline"]
    interpretation: Literal["illustrative_assumption_based"] = "illustrative_assumption_based"
    usable_for_recommendation: Literal[False] = False
    raw_relative_yield_change: Finite | None
    relative_yield_change: Finite | None
    yield_change_was_capped: bool
    fallow_wheat_yield_t_ha: Finite
    cover_wheat_yield_t_ha: Finite | None
    fallow_wheat_gross_revenue_usd_ha: Finite
    cover_wheat_gross_revenue_usd_ha: Finite | None
    wheat_revenue_difference_usd_ha: Finite | None
    total_cover_cost_usd_ha: Finite
    net_cover_revenue_usd_ha: Finite
    incentive_usd_ha: Finite
    incremental_net_benefit_usd_ha: Finite | None
    incremental_net_benefit_usd_total: Finite | None
    additional_revenue_to_break_even_usd_ha: Finite | None
    financial_signal: Literal["positive", "negative", "neutral", "unknown"]


class ScenarioResult(Contract):
    scenario: Literal["dry", "typical", "very_rainy"]
    historical_start_date: date
    historical_end_date: date
    requested_rainfall_percentile: Finite
    actual_rainfall_percentile: Finite
    eligible_historical_seasons: int
    simulation_days: int
    total_rain_mm: Finite
    total_irrigation_mm: Finite
    moisture: MoistureComparison
    water_risk: WaterRisk
    quality: QualityInfo
    finances: FinancialResult
    daily_trajectory: list[TrajectoryPoint] | None


class FinancialSummary(Contract):
    minimum_incremental_net_benefit_usd_ha: Finite | None
    maximum_incremental_net_benefit_usd_ha: Finite | None
    cases_with_positive_incremental_benefit: int
    calculated_cases: int
    case_count: int
    interpretation: Literal["unweighted_scenario_range_not_expected_return"] = "unweighted_scenario_range_not_expected_return"


class Recommendation(Contract):
    status: Literal["provisional", "unavailable"]
    validated: Literal[False] = False
    method_version: Literal["planting-rule-v1"] = "planting-rule-v1"
    decision: Literal["plant", "do_not_plant", "review", "insufficient_evidence"]
    reason_codes: list[str]
    message: str


class AnalysisResponse(Contract):
    api_version: Literal["1.0"] = "1.0"
    execution_mode: Literal["computed", "example"]
    status: Literal["experimental"] = "experimental"
    request_id: str
    request: AnalysisRequest
    model: ModelInfo
    weather: WeatherInfo
    initial_moisture: InitialMoisture
    moisture_unit: Literal["m3/m3"] = "m3/m3"
    sensor_depth_cm: Literal[5] = 5
    moisture_temporal_resolution: Literal["daily_average"] = "daily_average"
    scenarios: list[ScenarioResult]
    financial_summary: FinancialSummary
    recommendation: Recommendation
    assumptions: list[str]


class FieldError(Contract):
    location: list[str | int]
    message: str
    type: str


class ErrorBody(Contract):
    code: str
    message: str
    details: list[FieldError] = Field(default_factory=list)


class ErrorResponse(Contract):
    request_id: str
    error: ErrorBody


class ReadinessResponse(Contract):
    status: Literal["ready", "unavailable"]
    inference_available: bool
    recommendation_ready: Literal[False] = False
    model_name: str | None
    model_status: str | None
    reason: str | None


class SiteOption(Contract):
    id: str
    label: str
    latitude: Finite
    longitude: Finite


class Choice(Contract):
    id: str
    label: str


class CalendarLimits(Contract):
    decision_year_min: int = 2001
    planting_year_max: int = 2100
    minimum_horizon_days: int = 7
    maximum_horizon_days: int = 365
    cover_planting_months: list[int]
    cover_termination_months: list[int]
    wheat_planting_months: list[int]


class OptionsResponse(Contract):
    api_version: Literal["1.0"] = "1.0"
    sites: list[SiteOption]
    cover_crops: list[Choice]
    next_crops: list[Choice]
    scenarios: list[Choice]
    calendar: CalendarLimits
    default_economics: EconomicAssumptions
    default_risk_rules: RiskRules
    example_request: AnalysisRequest
    defaults_source: Literal["illustrative_not_market_or_agronomic_calibration"] = "illustrative_not_market_or_agronomic_calibration"
    served_model_source: Literal["task5_frozen_model"] = "task5_frozen_model"
    notes: list[str]


class AnalysisExample(Contract):
    request: AnalysisRequest
    response: AnalysisResponse


__all__ = [name for name, value in tuple(globals().items()) if isinstance(value, type) and issubclass(value, BaseModel) and value.__module__ == __name__]
