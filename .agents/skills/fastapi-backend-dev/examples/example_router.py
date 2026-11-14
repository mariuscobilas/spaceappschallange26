"""
Example modular APIRouter demonstrating best practices for Field Shift endpoints.
"""

from fastapi import APIRouter, HTTPException, status
from shared.python.schemas import (
    FieldAnalysisRequest,
    FieldAnalysisResponse,
    FieldProfile,
)

router = APIRouter(prefix="/api/v1/fields", tags=["Fields"])


@router.post(
    "/analyze",
    response_model=FieldAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze field climate adaptation options",
)
async def analyze_field_adaptation(payload: FieldAnalysisRequest) -> FieldAnalysisResponse:
    if payload.field.areaHectares <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field area in hectares must be greater than zero.",
        )

    # In production, call your ML pipeline:
    # from app.ml.inference import run_inference
    # result = await run_inference(payload)
    # return result

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Connect to app.ml.inference to complete real-time inference.",
    )

