"""
Pydantic schemas mirroring TypeScript contracts in shared/src/types.
Enables end-to-end type safety between FastAPI and Next.js.
"""

import math
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr, model_validator

# Clovis analysis contracts are canonical here alongside Meridian's existing types.
from .clovis_schemas import *  # noqa: F403

# ==========================================
# API Envelope & Common Schemas
# ==========================================

class ApiError(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[ApiError] = None
    meta: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "error"] = "ok"
    service: str = "field-shift-api"
    version: str = "0.1.0"
    timestamp: str
    uptimeSeconds: Optional[float] = None
    checks: Optional[Dict[str, bool]] = None


class MockRequest(BaseModel):
    message: str


class MockResponse(BaseModel):
    message: str
    mock: bool = True
    timestamp: Optional[str] = None


# ==========================================
# Meridian Chat
# ==========================================

class MeridianChatTextPart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["text"]
    text: StrictStr = Field(min_length=1, max_length=16000)


class MeridianChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: StrictStr = Field(min_length=1, max_length=200)
    role: Literal["user", "assistant"]
    parts: List[MeridianChatTextPart] = Field(min_length=1, max_length=8)


class MeridianChatPlanContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    coverCrop: StrictStr = Field(min_length=1, max_length=40)
    terminationDays: StrictInt = Field(ge=0, le=60)
    plantingDate: StrictStr = Field(max_length=10)
    cashCropPlantingDate: Optional[StrictStr] = Field(default=None, max_length=10)
    id: Optional[StrictStr] = Field(default=None, max_length=200)
    name: Optional[StrictStr] = Field(default=None, max_length=200)
    crop: Optional[StrictStr] = Field(default=None, max_length=40)
    budget: Optional[Dict[Literal["grainPrice", "baselineYield", "yieldChange", "seedCost", "terminationCost", "subsidy", "areaHa"], StrictStr]] = None
    areaHa: StrictStr = Field(max_length=40)
    notes: StrictStr = Field(max_length=4000)
    status: Literal["draft", "saved"]

    @model_validator(mode="after")
    def validate_planting_date(self):
        for field_name in ("plantingDate", "cashCropPlantingDate"):
            value = getattr(self, field_name)
            if not value:
                continue
            try:
                parsed = date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{field_name} must be empty or an ISO calendar date") from exc
            if parsed.isoformat() != value:
                raise ValueError(f"{field_name} must be empty or an ISO calendar date")
        return self


class MeridianChatBudget(BaseModel):
    model_config = ConfigDict(extra="forbid")
    grainPrice: Optional[StrictStr] = Field(default=None, max_length=40)
    baselineYield: Optional[StrictStr] = Field(default=None, max_length=40)
    yieldChange: Optional[StrictStr] = Field(default=None, max_length=40)
    seedCost: Optional[StrictStr] = Field(default=None, max_length=40)
    terminationCost: Optional[StrictStr] = Field(default=None, max_length=40)
    subsidy: Optional[StrictStr] = Field(default=None, max_length=40)
    areaHa: Optional[StrictStr] = Field(default=None, max_length=40)


class MeridianChatActivePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Optional[StrictStr] = Field(default=None, max_length=200)
    name: Optional[StrictStr] = Field(default=None, max_length=200)
    crop: StrictStr = Field(min_length=1, max_length=40)
    budget: Optional[MeridianChatBudget] = None


class MeridianChatAlternative(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Optional[StrictStr] = Field(default=None, max_length=200)
    name: Optional[StrictStr] = Field(default=None, max_length=200)
    crop: StrictStr = Field(min_length=1, max_length=40)
    coverCrop: StrictStr = Field(min_length=1, max_length=40)
    terminationDays: StrictInt = Field(ge=0, le=60)
    cashCropPlantingDate: StrictStr = Field(max_length=10)
    areaHa: StrictStr = Field(max_length=40)
    budget: Optional[MeridianChatBudget] = None

    @model_validator(mode="after")
    def validate_cash_crop_date(self):
        try:
            parsed = date.fromisoformat(self.cashCropPlantingDate)
        except ValueError as exc:
            raise ValueError("cashCropPlantingDate must be an ISO calendar date") from exc
        if parsed.isoformat() != self.cashCropPlantingDate:
            raise ValueError("cashCropPlantingDate must be an ISO calendar date")
        return self


class MeridianChatIrrigation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["available", "unavailable", "unknown"]
    summary: Optional[StrictStr] = Field(default=None, max_length=1000)


class MeridianChatContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: StrictFloat = Field(ge=24, le=50)
    longitude: StrictFloat = Field(ge=-125, le=-66)
    locationName: StrictStr = Field(min_length=1, max_length=200)
    fieldId: Optional[StrictStr] = Field(default=None, min_length=1, max_length=200)
    crop: StrictStr = Field(min_length=1, max_length=40)
    observationDate: date
    plan: Optional[MeridianChatPlanContext] = None
    contextVersion: Optional[StrictStr] = Field(default=None, max_length=250)
    displayUnits: Optional[Literal["metric", "us"]] = None
    areaHa: Optional[StrictFloat] = Field(default=None, ge=0, le=1_000_000)
    areaSource: Optional[Literal["boundary", "field", "plan", "unknown"]] = None
    activePlan: Optional[MeridianChatActivePlan] = None
    planStatus: Optional[Literal["draft", "saved", "none"]] = None
    calendarStatus: Optional[Literal["complete", "incomplete", "unknown"]] = None
    budgetStatus: Optional[Literal["complete", "incomplete", "unknown"]] = None
    budgetState: Optional[Literal["draft", "saved", "none"]] = None
    economicsDraft: Optional[MeridianChatBudget] = None
    savedAlternatives: Optional[List[MeridianChatAlternative]] = Field(default=None, max_length=50)
    planningYear: Optional[StrictInt] = Field(default=None, ge=1900, le=2200)
    irrigation: Optional[MeridianChatIrrigation] = None

    @model_validator(mode="after")
    def validate_chat_coordinates(self):
        if not math.isfinite(self.latitude) or not math.isfinite(self.longitude):
            raise ValueError("coordinates must be finite")
        if self.observationDate < date(1981, 1, 1) or self.observationDate > date.today():
            raise ValueError("observationDate must be between 1981-01-01 and today")
        if self.planningYear is not None and not 1900 <= self.planningYear <= 2200:
            raise ValueError("planningYear must be between 1900 and 2200")
        return self


class MeridianChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: List[MeridianChatMessage] = Field(min_length=1, max_length=40)
    context: MeridianChatContext


class MeridianSeasonFactsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fieldId: StrictStr = Field(min_length=1, max_length=200)
    planningYear: StrictInt = Field(ge=1900, le=2200)
    irrigation: MeridianChatIrrigation
    sourceMessageId: StrictStr = Field(min_length=1, max_length=200)
    contextVersion: StrictStr = Field(min_length=1, max_length=250)
    sourceQuote: Optional[StrictStr] = Field(default=None, min_length=1, max_length=500)


class MeridianPlanProposalChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop: Optional[StrictStr] = Field(default=None, max_length=40)
    coverCrop: Optional[StrictStr] = Field(default=None, max_length=40)
    cashCropPlantingDate: Optional[StrictStr] = Field(default=None, max_length=10)
    terminationDays: Optional[StrictInt] = Field(default=None, ge=0, le=60)
    areaHa: Optional[StrictStr] = Field(default=None, max_length=40)
    notes: Optional[StrictStr] = Field(default=None, max_length=4000)
    budget: Optional[MeridianChatBudget] = None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("proposal must include at least one change")
        if self.cashCropPlantingDate:
            parsed = date.fromisoformat(self.cashCropPlantingDate)
            if parsed.isoformat() != self.cashCropPlantingDate:
                raise ValueError("cashCropPlantingDate must be an ISO calendar date")
        return self


class MeridianPlanProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: StrictStr = Field(min_length=1, max_length=200)
    fieldId: StrictStr = Field(min_length=1, max_length=200)
    contextVersion: StrictStr = Field(min_length=1, max_length=250)
    changes: MeridianPlanProposalChanges


class MeridianToolSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: Literal[True]
    result: Any


class MeridianToolFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: Literal[False]
    error: str


# ==========================================
# Geographic & Field Schemas
# ==========================================

CropType = Literal[
    "corn",
    "wheat",
    "soybeans",
    "barley",
    "cotton",
    "rice",
    "sorghum",
    "sunflower",
    "grapes",
    "potatoes",
    "other",
]

SoilType = Literal[
    "clay",
    "sandy_clay",
    "silty_clay",
    "clay_loam",
    "sandy_clay_loam",
    "silty_clay_loam",
    "loam",
    "sandy_loam",
    "loamy_sand",
    "sand",
    "silt_loam",
    "silt",
]

IrrigationType = Literal[
    "rainfed",
    "drip",
    "sprinkler",
    "center_pivot",
    "furrow_flood",
    "none",
]


class GeoCoordinate(BaseModel):
    latitude: float
    longitude: float
    altitudeMeters: Optional[float] = None

    @model_validator(mode="after")
    def validate_finite_coordinate(self):
        if not math.isfinite(self.latitude) or not -90 <= self.latitude <= 90:
            raise ValueError("latitude must be finite and between -90 and 90")
        if not math.isfinite(self.longitude) or not -180 <= self.longitude <= 180:
            raise ValueError("longitude must be finite and between -180 and 180")
        if self.altitudeMeters is not None and not math.isfinite(self.altitudeMeters):
            raise ValueError("altitudeMeters must be finite")
        return self


class GeoPolygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]]

    @model_validator(mode="after")
    def validate_polygon_coordinates(self):
        if not self.coordinates:
            raise ValueError("Polygon must contain at least one linear ring")
        for ring in self.coordinates:
            if len(ring) < 4:
                raise ValueError("Polygon linear rings must contain at least four positions")
            positions = []
            for position in ring:
                if len(position) != 2 or not all(math.isfinite(value) for value in position):
                    raise ValueError("Polygon positions must be finite [longitude, latitude] pairs")
                longitude, latitude = position
                if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
                    raise ValueError("Polygon positions must use valid longitude and latitude ranges")
                positions.append(position)
            if positions[0] != positions[-1]:
                raise ValueError("Polygon linear rings must be closed")
        return self


class FieldProfile(BaseModel):
    id: str
    name: str
    location: GeoCoordinate
    boundary: Optional[GeoPolygon] = None
    areaHectares: float
    currentCrop: CropType
    plantingDate: Optional[str] = None
    soilType: SoilType
    irrigation: IrrigationType
    notes: Optional[str] = None


class SavedField(BaseModel):
    id: str
    name: str
    location: GeoCoordinate
    boundary: Optional[GeoPolygon] = None
    areaHectares: Optional[float] = None
    currentCrop: CropType
    cropSource: Literal["manual", "cdl"]
    benchmarkId: Optional[str] = None
    createdAt: str
    updatedAt: str


class LandCoverResult(BaseModel):
    status: Literal["cropland", "non_cropland", "unavailable"]
    code: Optional[int] = None
    category: Optional[str] = None
    suggestedCrop: Optional[CropType] = None
    year: Optional[int] = None
    requestedYear: int
    sample: GeoCoordinate
    source: str
    message: str


# ==========================================
# NASA Earth Observation Schemas
# ==========================================

class NasaObservationPoint(BaseModel):
    date: str
    ndvi: float
    soilMoistureVwc: float
    surfaceTemperatureCelsius: float
    precipitationMm: float
    solarRadiationWm2: Optional[float] = None


class ClimateTrend(BaseModel):
    warmingRatePerDecadeCelsius: float
    precipitationTrendPct: float
    extremeHeatDaysProjected: int
    consecutiveDryDaysAverage: int


class NasaEnvironmentalSnapshot(BaseModel):
    coordinate: Dict[str, float]
    observationDate: str
    currentNdvi: float
    historicalAverageNdvi: float
    ndviAnomaly: float
    soilMoistureCurrent: float
    soilMoistureDeficitPct: float
    temperatureAnomalyCelsius: float
    recentPrecipitation7dMm: float
    projectedPrecipitation30dMm: float
    droughtSeverityIndex: float
    climateTrends: Optional[ClimateTrend] = None


# ==========================================
# Field Shift Prediction & Recommendations
# ==========================================

ClimateRiskLevel = Literal["low", "medium", "high", "critical"]


class ClimateRiskFactor(BaseModel):
    id: str
    name: str
    category: Literal["heat_stress", "drought", "waterlogging", "frost_shift", "pest_disease"]
    level: ClimateRiskLevel
    impactScore: float
    description: str
    mitigationAdvice: str


class CropShiftOption(BaseModel):
    crop: CropType
    cropName: str
    suitabilityScore: float
    expectedYieldDeltaPct: float
    waterDemandRating: Literal["very_low", "low", "moderate", "high"]
    heatToleranceRating: Literal["poor", "moderate", "good", "excellent"]
    estimatedTransitionCostUsdPerHa: float
    paybackPeriodYears: float
    recommendationReason: str


class AdaptationAction(BaseModel):
    id: str
    stepNumber: int
    phase: Literal["immediate_season", "next_year", "long_term"]
    title: str
    action: str
    timeframe: str
    estimatedCostEstimateUsd: Optional[float] = None
    expectedBenefit: str


class FieldShiftPrediction(BaseModel):
    predictionId: str
    fieldId: str
    generatedAt: str
    modelVersion: str
    confidenceScore: float
    vulnerabilityScore: float
    primaryRiskSummary: str
    riskFactors: List[ClimateRiskFactor] = Field(default_factory=list)
    recommendedCrops: List[CropShiftOption] = Field(default_factory=list)
    suggestedPlantingWindowShiftDays: int = 0
    recommendedIrrigationAdjustment: str = ""
    actionPlan: List[AdaptationAction] = Field(default_factory=list)


class FieldAnalysisRequest(BaseModel):
    field: FieldProfile
    nasaOverride: Optional[Dict[str, Any]] = None
    planningHorizonYears: Optional[int] = 5


class FieldAnalysisResponse(BaseModel):
    fieldId: str
    fieldName: str
    environmentSnapshot: NasaEnvironmentalSnapshot
    prediction: FieldShiftPrediction


class FieldConditionMeasure(BaseModel):
    status: Literal["available", "unavailable"]
    value: Optional[float]
    unit: Literal["mm", "fraction"]
    periodStart: Optional[date]
    periodEnd: Optional[date]
    source: str
    sourceUrl: str
    spatialResolution: str
    message: str

    @model_validator(mode="after")
    def check_measure(self):
        if self.status == "available":
            if self.value is None or not math.isfinite(self.value) or self.value < 0:
                raise ValueError("Available measures require a finite nonnegative value")
            if self.unit == "fraction" and self.value > 1:
                raise ValueError("Relative wetness fraction must be between 0 and 1")
        elif self.value is not None:
            raise ValueError("Unavailable measures must have null value")
        if (self.periodStart is None) != (self.periodEnd is None):
            raise ValueError("Period requires both start and end")
        if self.periodStart and self.periodEnd and self.periodStart > self.periodEnd:
            raise ValueError("Period start must precede end")
        return self


class FieldConditionsResult(BaseModel):
    sample: GeoCoordinate
    requestedDate: date
    retrievedAt: datetime
    precipitation30d: FieldConditionMeasure
    rootZoneWetness: FieldConditionMeasure
    availableWaterStorage: FieldConditionMeasure
    soilMapUnit: Optional[str]

    @model_validator(mode="after")
    def check_periods_and_units(self):
        for name, unit in (("precipitation30d", "mm"), ("rootZoneWetness", "fraction"), ("availableWaterStorage", "mm")):
            measure = getattr(self, name)
            if measure.unit != unit:
                raise ValueError(f"{name} has incorrect unit")
            if measure.periodEnd and measure.periodEnd > self.requestedDate:
                raise ValueError("Observation period exceeds the requested date")
        rain = self.precipitation30d
        if rain.status == "available" and (rain.periodStart is None or rain.periodEnd - rain.periodStart != timedelta(days=29)):
            raise ValueError("Precipitation requires a complete 30-day interval")
        wetness = self.rootZoneWetness
        if wetness.status == "available" and (wetness.periodStart is None or wetness.periodStart != wetness.periodEnd):
            raise ValueError("Wetness requires an actual single observation day")
        if self.availableWaterStorage.periodStart is not None:
            raise ValueError("Mapped soil capacity is not a dated moisture observation")
        if self.retrievedAt.tzinfo is None:
            raise ValueError("Retrieval timestamp must include a timezone")
        return self


class AtlasValidation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["validated"]
    method: str = Field(min_length=1, max_length=300)
    reference: str = Field(min_length=1, max_length=1000)


class AtlasScenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=200)
    baseline: str = Field(min_length=1, max_length=300)
    periodStart: date
    periodEnd: date

    @model_validator(mode="after")
    def check_period(self):
        if self.periodStart > self.periodEnd:
            raise ValueError("scenario periodStart must precede periodEnd")
        return self


class AtlasCell(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    h3Index: str = Field(pattern=r"^8[0-9a-f]{14}$")
    crop: Literal["wheat", "corn", "soybeans", "cotton", "sorghum"]
    scenarioId: str = Field(min_length=1, max_length=100)
    activeAreaHa: Optional[float]
    netReturnUsdHa: Optional[float]
    yieldPenaltyPct: Optional[float]
    rootZoneWetness: Optional[float]
    soilTexture: Optional[str] = Field(max_length=100)

    @model_validator(mode="after")
    def finite_and_bounded(self):
        for name in ("activeAreaHa", "netReturnUsdHa", "yieldPenaltyPct", "rootZoneWetness"):
            value = getattr(self, name)
            if value is not None and not math.isfinite(value):
                raise ValueError(f"{name} must be finite or null")
        if self.activeAreaHa is not None and self.activeAreaHa < 0:
            raise ValueError("activeAreaHa cannot be negative")
        if self.yieldPenaltyPct is not None and self.yieldPenaltyPct > 100:
            raise ValueError("yieldPenaltyPct cannot exceed 100; negative means yield gain")
        if self.rootZoneWetness is not None and not 0 <= self.rootZoneWetness <= 1:
            raise ValueError("rootZoneWetness must be between 0 and 1")
        if (self.activeAreaHa is None or self.activeAreaHa == 0) and any(getattr(self, name) is not None for name in ("netReturnUsdHa", "yieldPenaltyPct")):
            raise ValueError("cells without verified active area must not include return or yield outputs")
        return self


class AtlasProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=300)
    url: str = Field(min_length=1, max_length=1000)
    periodStart: Optional[date] = None
    periodEnd: Optional[date] = None
    spatialMeaning: str = Field(min_length=1, max_length=500)


class AtlasDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["available", "unavailable"]
    message: str = Field(max_length=1000)
    datasetId: Optional[str] = Field(max_length=200)
    generatedAt: Optional[datetime]
    validation: Optional[AtlasValidation]
    scenarios: List[AtlasScenario] = Field(max_length=20)
    cells: List[AtlasCell] = Field(max_length=10_000)
    provenance: List[AtlasProvenance] = Field(max_length=50)

    @model_validator(mode="after")
    def check_dataset(self):
        if self.status == "unavailable":
            if self.validation is not None or self.datasetId is not None or self.generatedAt is not None or self.scenarios or self.cells or self.provenance:
                raise ValueError("unavailable dataset must contain no dataset metadata, validation, cells, scenarios, or provenance")
            return self
        if not self.datasetId or not self.generatedAt or not self.validation or not self.scenarios or not self.cells or not self.provenance:
            raise ValueError("available atlas requires identity, validation, scenarios, cells, and provenance")
        scenario_ids = {scenario.id for scenario in self.scenarios}
        if len(scenario_ids) != len(self.scenarios):
            raise ValueError("scenario IDs must be unique")
        keys = set()
        for cell in self.cells:
            if cell.scenarioId not in scenario_ids:
                raise ValueError("cell refers to an unknown scenario")
            key = (cell.h3Index, cell.crop, cell.scenarioId)
            if key in keys:
                raise ValueError("atlas cell keys must be unique")
            keys.add(key)
        return self


class SoilMeasure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["available", "unavailable"]
    value: Optional[float | str]
    unit: str = Field(max_length=80)
    source: str = Field(max_length=200)
    sourceUrl: str = Field(max_length=1000)
    message: str = Field(max_length=500)

    @model_validator(mode="after")
    def check_value(self):
        if self.status == "available" and self.value is None:
            raise ValueError("available soil measures require a value")
        if self.status == "unavailable" and self.value is not None:
            raise ValueError("unavailable soil measures must have null value")
        if isinstance(self.value, float) and not math.isfinite(self.value):
            raise ValueError("soil measure must be finite")
        return self


class SoilHorizon(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topCm: float = Field(ge=0, le=300)
    bottomCm: float = Field(gt=0, le=300)
    texture: SoilMeasure
    sandPct: SoilMeasure
    siltPct: SoilMeasure
    clayPct: SoilMeasure
    organicMatterPct: SoilMeasure
    bulkDensityGcm3: SoilMeasure
    ph: SoilMeasure
    saturatedConductivityUmS: SoilMeasure

    @model_validator(mode="after")
    def check_depth(self):
        if self.bottomCm <= self.topCm:
            raise ValueError("horizon bottom must be deeper than top")
        fractions = [self.sandPct.value, self.siltPct.value, self.clayPct.value]
        if all(isinstance(value, (int, float)) for value in fractions) and abs(sum(fractions) - 100) > 2:
            raise ValueError("soil texture fractions must sum to approximately 100 percent")
        return self


class SoilProfileComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mapUnitSymbol: str = Field(max_length=100)
    mapUnitName: str = Field(max_length=300)
    componentName: str = Field(max_length=300)
    componentPercent: Optional[float] = Field(ge=0, le=100)
    drainageClass: SoilMeasure
    hydrologicGroup: SoilMeasure
    horizons: List[SoilHorizon] = Field(max_length=30)


class SoilProfileResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["available", "unavailable"]
    message: str = Field(max_length=1000)
    sample: GeoCoordinate
    retrievedAt: datetime
    source: str = Field(max_length=200)
    sourceUrl: str = Field(max_length=1000)
    components: List[SoilProfileComponent] = Field(max_length=20)

    @model_validator(mode="after")
    def check_status(self):
        if self.status == "unavailable" and self.components:
            raise ValueError("unavailable soil result cannot contain components")
        return self



class RegionalYieldEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    crop: Literal["corn", "soybeans"]
    period: Literal["2019", "2020", "2019-2020"]
    sampleRecords: int = Field(ge=10)
    sampleRecordsByYear: dict[Literal["2019", "2020"], int]
    meanYieldEffectPct: float = Field(gt=-100)

    @model_validator(mode="after")
    def finite_estimate(self):
        if set(self.sampleRecordsByYear) != {"2019", "2020"} or any(v < 0 for v in self.sampleRecordsByYear.values()) or sum(self.sampleRecordsByYear.values()) != self.sampleRecords:
            raise ValueError("invalid sample year counts")
        if self.period in ("2019", "2020") and self.sampleRecordsByYear[self.period] != self.sampleRecords:
            raise ValueError("sample counts must match selected year")
        if not math.isfinite(self.meanYieldEffectPct):
            raise ValueError("yield effect must be finite")
        return self


class RegionalYieldGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list

    @model_validator(mode="after")
    def geographic_rings(self):
        polygons = [self.coordinates] if self.type == "Polygon" else self.coordinates
        if not polygons or len(polygons) > 2000:
            raise ValueError("invalid county polygons")
        positions = 0
        for polygon in polygons:
            if not isinstance(polygon, list) or not polygon:
                raise ValueError("invalid polygon")
            for ring in polygon:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError("county rings must be closed")
                for position in ring:
                    positions += 1
                    if not isinstance(position, list) or len(position) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) for v in position):
                        raise ValueError("invalid geographic position")
                    if not -125 <= position[0] <= -66 or not 24 <= position[1] <= 50:
                        raise ValueError("county outside CONUS")
        if positions > 20000:
            raise ValueError("county geometry too large")
        return self


class RegionalYieldRegion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fips: str = Field(pattern=r"^\d{5}$")
    name: str = Field(min_length=1, max_length=150)
    state: Literal["IA", "IL", "IN", "MI", "MO", "OH"]
    centroid: List[StrictFloat] = Field(min_length=2, max_length=2)
    geometry: RegionalYieldGeometry
    estimates: List[RegionalYieldEstimate] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def unique_estimates(self):
        if any(not math.isfinite(v) for v in self.centroid) or not (-125 <= self.centroid[0] <= -66 and 24 <= self.centroid[1] <= 50):
            raise ValueError("invalid county centre")
        state_fips = {"IA":"19", "IL":"17", "IN":"18", "MI":"26", "MO":"29", "OH":"39"}
        if not self.fips.startswith(state_fips[self.state]):
            raise ValueError("county/state FIPS mismatch")
        keys = [(e.crop, e.period) for e in self.estimates]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate county estimates")
        return self


class RegionalYieldSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=300)
    url: str = Field(pattern=r"^https://", max_length=1000)
    doi: str = Field(min_length=1, max_length=150)
    archiveSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    license: str = Field(min_length=1, max_length=150)


class RegionalYieldMethod(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=1000)
    units: Literal["percent"]
    sampleUnit: Literal["model sample record"]
    minimumSampleRecords: Literal[10]
    interpretation: str = Field(min_length=1, max_length=1000)
    limitations: List[str] = Field(min_length=1, max_length=20)


class RegionalYieldDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["available", "unavailable"]
    message: str = Field(min_length=1, max_length=1000)
    datasetId: Optional[str] = Field(max_length=200)
    generatedAt: Optional[datetime]
    source: Optional[RegionalYieldSource]
    method: Optional[RegionalYieldMethod]
    regions: List[RegionalYieldRegion] = Field(max_length=1000)

    @model_validator(mode="after")
    def complete_dataset(self):
        if self.status == "unavailable":
            if self.datasetId is not None or self.generatedAt is not None or self.source is not None or self.method is not None or self.regions:
                raise ValueError("unavailable regional data must be empty")
        elif not self.datasetId or self.generatedAt is None or self.source is None or self.method is None or not self.regions:
            raise ValueError("available regional data requires complete metadata and regions")
        if len({r.fips for r in self.regions}) != len(self.regions):
            raise ValueError("duplicate county FIPS")
        return self


# Typed Meridian tool-result payloads are shared with the web chat renderer.
class MeridianCropReferenceRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop: StrictStr
    yieldTHa: Optional[Union[StrictFloat, StrictInt]]
    priceUsdT: Optional[Union[StrictFloat, StrictInt]]
    totalCostUsdHa: Optional[Union[StrictFloat, StrictInt]]
    sourceRegion: StrictStr
    sourceYear: StrictInt
    geographicMatch: Literal["regional", "national_fallback"]
    units: StrictStr
    sourceUrl: StrictStr = Field(pattern=r"^https://")


class MeridianCropReferenceProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop: StrictStr
    sourceUrl: StrictStr = Field(pattern=r"^https://")
    retrievedAt: datetime
    sha256: StrictStr = Field(pattern=r"^[a-f0-9]{64}$")
    rawBytes: StrictInt = Field(ge=0)
    snapshotPath: Optional[StrictStr] = None


class MeridianCropReferencesResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    referenceYear: StrictInt
    geographicMatch: Literal["regional", "partial_regional", "national_fallback"]
    geographicRegion: Optional[StrictStr]
    countyFips: Optional[StrictStr]
    rows: List[MeridianCropReferenceRow]
    provenance: List[MeridianCropReferenceProvenance]
    assumptions: List[StrictStr]
    status: Literal["available", "stale_fallback"]
    message: StrictStr


class MeridianCropComparisonRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop: StrictStr
    yieldTHa: Optional[Union[StrictFloat, StrictInt]]
    priceUsdT: Optional[Union[StrictFloat, StrictInt]]
    totalCostUsdHa: Optional[Union[StrictFloat, StrictInt]]
    grossRevenueUsdHa: Optional[Union[StrictFloat, StrictInt]]
    netReturnUsdHa: Optional[Union[StrictFloat, StrictInt]]
    wholeFieldNetReturnUsd: Optional[Union[StrictFloat, StrictInt]]
    wholeFieldGrossRevenueUsd: Optional[Union[StrictFloat, StrictInt]]
    breakEvenPriceUsdT: Optional[Union[StrictFloat, StrictInt]]
    breakEvenYieldTHa: Optional[Union[StrictFloat, StrictInt]]
    sourceYear: Optional[StrictInt]
    sourceRegion: Optional[StrictStr]
    geographicMatch: Literal["regional", "national_fallback"]
    provenance: StrictStr
    inputBasis: List[StrictStr]


class MeridianCropComparisonResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    planningYear: StrictInt
    referenceYear: StrictInt
    geographicMatch: Literal["regional", "partial_regional", "national_fallback"]
    geographicRegion: Optional[StrictStr]
    countyFips: Optional[StrictStr]
    referenceStatus: Literal["available", "stale_fallback"]
    referenceMessage: StrictStr
    provenance: List[MeridianCropReferenceProvenance]
    rows: List[MeridianCropComparisonRow]
    ranking: List[StrictStr]
    assumptions: List[StrictStr]


class MeridianFieldConditionsSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: Literal[True]
    result: FieldConditionsResult


class MeridianSoilProfileSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: Literal[True]
    result: SoilProfileResult


class MeridianFieldEvidenceResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conditions: Union[MeridianFieldConditionsSuccess, MeridianToolFailure]
    soil: Union[MeridianSoilProfileSuccess, MeridianToolFailure]
    interpretation: StrictStr
