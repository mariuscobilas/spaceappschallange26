"""
Pydantic schemas mirroring TypeScript contracts in shared/src/types.
Enables end-to-end type safety between FastAPI and Next.js.
"""

import math
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator

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

