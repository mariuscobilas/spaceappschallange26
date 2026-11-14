from datetime import datetime, timezone
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure shared schemas are importable across different execution contexts
try:
    from shared.python.schemas import (
        FieldAnalysisRequest,
        FieldAnalysisResponse,
        FieldShiftPrediction,
        NasaEnvironmentalSnapshot,
        HealthResponse,
        MockRequest,
        MockResponse,
    )
except ImportError:
    # Resolve project root from apps/api/app/main.py -> apps/api/app -> apps/api -> apps -> root
    root_dir = Path(__file__).resolve().parents[3]
    if str(root_dir) not in sys.path:
        sys.path.insert(0, str(root_dir))
    from shared.python.schemas import (
        FieldAnalysisRequest,
        FieldAnalysisResponse,
        FieldShiftPrediction,
        NasaEnvironmentalSnapshot,
        HealthResponse,
        MockRequest,
        MockResponse,
    )

app = FastAPI(
    title="Field Shift API",
    version="0.1.0",
    description="Backend API for NASA Space Apps Challenge 2026: Field Shift",
)

# Enable CORS for Next.js frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="field-shift-api",
        version="0.1.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
        uptimeSeconds=0.0,
        checks={"api": True, "mlModelLoaded": False, "nasaDataService": True},
    )


@app.post("/api/v1/mock", response_model=MockResponse)
def mock(payload: MockRequest) -> MockResponse:
    return MockResponse(
        message=payload.message,
        mock=True,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.post("/api/v1/field-shift/analyze", response_model=FieldAnalysisResponse)
def analyze_field(payload: FieldAnalysisRequest) -> FieldAnalysisResponse:
    """
    Analyzes farm field resilience against NASA satellite environmental data.
    Provides climate risk metrics and recommended crop / management shifts.
    """
    # Demo mock analysis adhering strictly to @spaceapps/shared contract
    field = payload.field
    env_snapshot = NasaEnvironmentalSnapshot(
        coordinate={"latitude": field.location.latitude, "longitude": field.location.longitude},
        observationDate=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        currentNdvi=0.48,
        historicalAverageNdvi=0.62,
        ndviAnomaly=-0.14,
        soilMoistureCurrent=0.18,
        soilMoistureDeficitPct=26.5,
        temperatureAnomalyCelsius=2.4,
        recentPrecipitation7dMm=3.2,
        projectedPrecipitation30dMm=32.0,
        droughtSeverityIndex=-2.3,
    )

    prediction = FieldShiftPrediction(
        predictionId=f"pred-{field.id}-live",
        fieldId=field.id,
        generatedAt=datetime.now(timezone.utc).isoformat(),
        modelVersion="field-shift-v0.2.1-ensemble",
        confidenceScore=0.88,
        vulnerabilityScore=68.4,
        primaryRiskSummary="Moisture deficit and elevated temperature increase risk for current crop cycle.",
        riskFactors=[
            {
                "id": "risk-drought-01",
                "name": "Soil Moisture Deficit",
                "category": "drought",
                "level": "high",
                "impactScore": 75.0,
                "description": "SMAP observations show volumetric soil moisture 26% below historical average.",
                "mitigationAdvice": "Adopt cover crops to reduce evaporation and consider supplemental drip irrigation.",
            }
        ],
        recommendedCrops=[
            {
                "crop": "sorghum",
                "cropName": "Grain Sorghum",
                "suitabilityScore": 91.0,
                "expectedYieldDeltaPct": 18.5,
                "waterDemandRating": "low",
                "heatToleranceRating": "excellent",
                "estimatedTransitionCostUsdPerHa": 140.0,
                "paybackPeriodYears": 1.2,
                "recommendationReason": "High heat tolerance and 30-40% lower water requirements than corn.",
            }
        ],
        suggestedPlantingWindowShiftDays=-10,
        recommendedIrrigationAdjustment="Introduce sensor-driven drip fertigation on high-slope zones.",
        actionPlan=[
            {
                "id": "action-1",
                "stepNumber": 1,
                "phase": "immediate_season",
                "title": "Early Spring Planting Window Adjustment",
                "action": "Advance seed planting by 10 days to maximize early rainfall.",
                "timeframe": "March 25 - April 10",
                "estimatedCostEstimateUsd": 0.0,
                "expectedBenefit": "Shields critical flowering phase from late July heat peaks.",
            }
        ],
    )

    return FieldAnalysisResponse(
        fieldId=field.id,
        fieldName=field.name,
        environmentSnapshot=env_snapshot,
        prediction=prediction,
    )
