import math

from fastapi import APIRouter, HTTPException, Query

from app.services.soil_profile import lookup
from shared.python.schemas import GeoCoordinate, SoilProfileResult

router = APIRouter()


@router.get("/api/v1/soil-profile", response_model=SoilProfileResult)
async def get_soil_profile(
    latitude: float = Query(...),
    longitude: float = Query(...),
) -> SoilProfileResult:
    if not math.isfinite(latitude) or not 24 <= latitude <= 50:
        raise HTTPException(status_code=422, detail="latitude must be finite and within the CONUS bounding box (24–50)")
    if not math.isfinite(longitude) or not -125 <= longitude <= -66:
        raise HTTPException(status_code=422, detail="longitude must be finite and within the CONUS bounding box (-125–-66)")
    return await lookup(GeoCoordinate(latitude=latitude, longitude=longitude))
