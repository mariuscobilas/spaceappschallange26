"""
Pydantic schemas mirroring TypeScript contracts in shared/src/types.
Enables end-to-end type safety between FastAPI and Next.js.
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

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


class GeoPolygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]]


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

