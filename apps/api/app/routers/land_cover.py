import math

from fastapi import APIRouter, HTTPException, Query

from shared.python.schemas import LandCoverResult
from app.services.land_cover import lookup

router = APIRouter()


@router.get("/api/v1/land-cover", response_model=LandCoverResult)
async def get_land_cover(
    latitude: float = Query(...),
    longitude: float = Query(...),
    year: int = Query(..., ge=1997, le=2100),
) -> LandCoverResult:
    if not math.isfinite(latitude) or not 24 <= latitude <= 50:
        raise HTTPException(status_code=422, detail="latitude must be a finite value from 24 through 50 (CONUS coverage)")
    if not math.isfinite(longitude) or not -125 <= longitude <= -66:
        raise HTTPException(status_code=422, detail="longitude must be a finite value from -125 through -66 (CONUS coverage)")
    return await lookup(latitude, longitude, year)
