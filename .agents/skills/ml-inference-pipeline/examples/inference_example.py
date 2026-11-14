"""
Sample inference module demonstrating how to package Field Shift logic
in apps/api/app/ml for clean consumption by FastAPI.
"""

from datetime import datetime, timezone
from shared.python.schemas import (
    FieldProfile,
    NasaEnvironmentalSnapshot,
    FieldShiftPrediction,
    ClimateRiskFactor,
    CropShiftOption,
    AdaptationAction,
)


def compute_vulnerability(field: FieldProfile, env: NasaEnvironmentalSnapshot) -> float:
    """
    Computes a 0-100 agricultural vulnerability score based on soil moisture
    deficit and temperature anomaly.
    """
    base_score = 30.0

    # Soil moisture penalty
    if env.soilMoistureDeficitPct > 20:
        base_score += min(35.0, env.soilMoistureDeficitPct * 0.8)

    # Temperature anomaly penalty
    if env.temperatureAnomalyCelsius > 1.5:
        base_score += min(25.0, env.temperatureAnomalyCelsius * 8.0)

    # Vegetation anomaly penalty
    if env.ndviAnomaly < -0.1:
        base_score += min(15.0, abs(env.ndviAnomaly) * 60.0)

    return round(min(100.0, max(0.0, base_score)), 1)


def run_field_shift_inference(
    field: FieldProfile,
    env: NasaEnvironmentalSnapshot,
) -> FieldShiftPrediction:
    """
    Executes the inference logic and returns a typed FieldShiftPrediction.
    """
    vuln_score = compute_vulnerability(field, env)

    risk_factors = []
    if env.soilMoistureDeficitPct > 15:
        risk_factors.append(
            ClimateRiskFactor(
                id="risk-soil-deficit",
                name="Root Zone Moisture Stress",
                category="drought",
                level="high" if vuln_score > 60 else "medium",
                impactScore=vuln_score * 0.9,
                description=f"SMAP indicates {env.soilMoistureDeficitPct:.1f}% deficit relative to baseline.",
                mitigationAdvice="Implement cover cropping or supplemental irrigation.",
            )
        )

    recommendations = [
        CropShiftOption(
            crop="sorghum",
            cropName="Grain Sorghum",
            suitabilityScore=92.0,
            expectedYieldDeltaPct=16.0,
            waterDemandRating="low",
            heatToleranceRating="excellent",
            estimatedTransitionCostUsdPerHa=120.0,
            paybackPeriodYears=1.1,
            recommendationReason="Low water requirement and high heat resilience.",
        )
    ]

    return FieldShiftPrediction(
        predictionId=f"pred-{field.id}-{int(datetime.now().timestamp())}",
        fieldId=field.id,
        generatedAt=datetime.now(timezone.utc).isoformat(),
        modelVersion="field-shift-baseline-v1.0",
        confidenceScore=0.88,
        vulnerabilityScore=vuln_score,
        primaryRiskSummary="Moisture deficit drives elevated crop vulnerability.",
        riskFactors=risk_factors,
        recommendedCrops=recommendations,
        suggestedPlantingWindowShiftDays=-10,
        recommendedIrrigationAdjustment="Optimize irrigation timing to early morning hours.",
        actionPlan=[
            AdaptationAction(
                id="act-1",
                stepNumber=1,
                phase="immediate_season",
                title="Shift Planting Date",
                action="Plant 10 days earlier to evade mid-summer peak temperatures.",
                timeframe="Spring",
                expectedBenefit="Protects reproductive crop phase.",
            )
        ],
    )

