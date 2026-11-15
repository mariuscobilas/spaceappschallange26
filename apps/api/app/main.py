from datetime import datetime, timezone
import sys
from pathlib import Path
from fastapi import APIRouter, FastAPI, Request
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

from app.routers.land_cover import router as land_cover_router
from app.routers.field_conditions import router as field_conditions_router
from app.routers.atlas import router as atlas_router
from app.routers.soil_profile import router as soil_profile_router
from app.routers.regional_yield import router as regional_yield_router

legacy_router = APIRouter(tags=["Existing Meridian routes"])


@legacy_router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="field-shift-api",
        version="0.1.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
        uptimeSeconds=0.0,
        checks={"api": True, "mlModelLoaded": getattr(request.app.state, "engine", None) is not None, "nasaDataService": True},
    )


@legacy_router.post("/api/v1/mock", response_model=MockResponse)
def mock(payload: MockRequest) -> MockResponse:
    return MockResponse(
        message=payload.message,
        mock=True,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@legacy_router.post("/api/v1/field-shift/analyze", response_model=FieldAnalysisResponse)
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

import json
import sqlite3
import os
from .api import configure_errors, lifecycle, router

BENCHMARK_RESULTS = Path(__file__).resolve().parents[3] / "data/benchmark_results.json"
AUSTRALIA_RESULTS = Path(__file__).resolve().parents[3] / "data/australia_benchmark_results.json"
BENCHMARK_DB = Path(__file__).resolve().parents[3] / "data/water_debt.sqlite3"


@legacy_router.get("/api/v1/benchmark")
def benchmark_results() -> dict:
    """Return the most recent season-held-out five-model evaluation."""
    if not BENCHMARK_RESULTS.is_file():
        return {"status": "not_run", "message": "Run python -m app.ml.benchmark --fetch-weather first."}
    return json.loads(BENCHMARK_RESULTS.read_text(encoding="utf-8"))


@legacy_router.get("/api/v1/benchmark/australia")
def australia_benchmark_results() -> dict:
    if not AUSTRALIA_RESULTS.is_file():
        return {"status": "not_run", "message": "Run apps/api/app/ml/australia_benchmark.py first."}
    return json.loads(AUSTRALIA_RESULTS.read_text(encoding="utf-8"))


@legacy_router.get("/api/v1/benchmark/predictions")
def benchmark_predictions(model: str = "Treatment mean") -> dict:
    """Return held-out observed/predicted pairs for plots and a confusion-matrix view."""
    if not BENCHMARK_DB.is_file():
        return {"status": "not_run", "predictions": []}
    with sqlite3.connect(BENCHMARK_DB) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """SELECT trial, plot, cycle, wheat_planting_year, planting_window,
                      actual_delta_mm, predicted_delta_mm
               FROM benchmark_prediction WHERE model = ?
               ORDER BY wheat_planting_year, trial, plot, cycle""", (model,)
        ).fetchall()
    return {"model": model, "predictions": [dict(row) for row in rows]}


def create_app(engine_factory=None) -> FastAPI:
    app = FastAPI(title="Field Shift API", version="0.2.0", lifespan=lifecycle(engine_factory),
        description="Clovis MVP: historical moisture scenarios and illustrative financial/risk calculations. Model outputs remain experimental.")
    configure_errors(app)
    origins = [value.strip() for value in os.environ.get("FIELD_SHIFT_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if value.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"],
        expose_headers=["X-Request-ID", "X-Process-Time-Ms", "Retry-After"])
    app.include_router(land_cover_router)
    app.include_router(field_conditions_router)
    app.include_router(atlas_router)
    app.include_router(soil_profile_router)
    app.include_router(regional_yield_router)
    app.include_router(router)
    app.include_router(legacy_router)
    return app


app = create_app()
