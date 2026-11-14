from datetime import date, datetime, timezone
import math

from fastapi import APIRouter, HTTPException, Query

from shared.python.schemas import FieldConditionsResult
from app.services.field_conditions import lookup

router = APIRouter()


@router.get("/api/v1/field-conditions", response_model=FieldConditionsResult)
async def get_field_conditions(
    latitude: float = Query(...),
    longitude: float = Query(...),
    as_of: date | None = Query(None),
) -> FieldConditionsResult:
    if not math.isfinite(latitude) or not 24 <= latitude <= 50:
        raise HTTPException(status_code=422, detail="latitude must be finite and within the CONUS bounding box (24–50)")
    if not math.isfinite(longitude) or not -125 <= longitude <= -66:
        raise HTTPException(status_code=422, detail="longitude must be finite and within the CONUS bounding box (-125–-66)")
    requested = as_of or datetime.now(timezone.utc).date()
    if requested < date(1981, 1, 1) or requested > datetime.now(timezone.utc).date():
        raise HTTPException(status_code=422, detail="as_of must be from 1981-01-01 through today (UTC)")
    return await lookup(latitude, longitude, requested)
