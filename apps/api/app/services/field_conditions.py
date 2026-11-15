"""Source-backed, point-level field conditions from NASA POWER and USDA NRCS SDA."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from shared.python.schemas import (
    FieldConditionMeasure,
    FieldConditionsResult,
    GeoCoordinate,
)

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
NASA_SOURCE = "NASA POWER daily meteorology (MERRA-2 / GEOS-IT)"
NASA_SOURCE_URL = "https://power.larc.nasa.gov/docs/services/api/temporal/daily/"
NASA_SPATIAL_RESOLUTION = "0.5° latitude × 0.625° longitude meteorology grid"
USDA_SDA_URL = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest"
USDA_SOURCE = "USDA NRCS Soil Data Access (SSURGO map unit)"
USDA_SOURCE_URL = "https://sdmdataaccess.sc.egov.usda.gov/"
USDA_SPATIAL_RESOLUTION = "SSURGO map-unit polygon"

REQUEST_TIMEOUT_SECONDS = 6.0
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
NASA_LOOKBACK_DAYS = 90
CACHE_TTL_SECONDS = 30 * 60
FAILURE_CACHE_TTL_SECONDS = 30
CACHE_MAX_ENTRIES = 256
logger = logging.getLogger(__name__)

_CACHE: OrderedDict[tuple[float, float, str], tuple[float, FieldConditionsResult]] = OrderedDict()


def _unavailable(
    *,
    unit: str,
    source: str,
    source_url: str,
    spatial_resolution: str,
    message: str,
) -> FieldConditionMeasure:
    return FieldConditionMeasure(
        status="unavailable",
        value=None,
        unit=unit,
        periodStart=None,
        periodEnd=None,
        source=source,
        sourceUrl=source_url,
        spatialResolution=spatial_resolution,
        message=message,
    )


def _measure(
    *,
    value: float,
    unit: str,
    period_start: date | None,
    period_end: date | None,
    source: str,
    source_url: str,
    spatial_resolution: str,
    message: str,
) -> FieldConditionMeasure:
    return FieldConditionMeasure(
        status="available",
        value=value,
        unit=unit,
        periodStart=period_start.isoformat() if period_start else None,
        periodEnd=period_end.isoformat() if period_end else None,
        source=source,
        sourceUrl=source_url,
        spatialResolution=spatial_resolution,
        message=message,
    )


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number) or number < 0:
        # NASA POWER uses negative missing-value sentinels (commonly -999).
        return None
    return number


def _json_from_body(body: bytes) -> Any:
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("Upstream response exceeded size limit")
    return json.loads(body)


async def _request_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
) -> Any:
    async with client.stream("POST" if data is not None else "GET", url, params=params, data=data) as response:
        response.raise_for_status()
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > MAX_RESPONSE_BYTES:
                raise ValueError("Upstream response exceeded size limit")
    return _json_from_body(bytes(body))


def _metadata_unit(payload: dict[str, Any], parameter: str) -> str | None:
    """Get the POWER declared unit from its response metadata, when present."""
    # Current POWER JSON puts parameter metadata at the top level and daily
    # date/value maps under properties.parameter.
    parameters = payload.get("parameters")
    entry = parameters.get(parameter) if isinstance(parameters, dict) else None
    if isinstance(entry, dict):
        unit = entry.get("units") or entry.get("unit")
        return str(unit).strip().lower() if unit is not None else None
    properties = payload.get("properties") or {}
    if not isinstance(properties, dict):
        properties = {}
    metadata = properties.get("parameter") or {}
    entry = metadata.get(parameter) if isinstance(metadata, dict) else None
    if isinstance(entry, dict):
        unit = entry.get("units") or entry.get("unit")
        return str(unit).strip().lower() if unit is not None else None
    header = payload.get("header") or {}
    if not isinstance(header, dict):
        header = {}
    # Some POWER response versions include parameter metadata in the header.
    parameters = header.get("parameters") or {}
    entry = parameters.get(parameter) if isinstance(parameters, dict) else None
    if isinstance(entry, dict):
        unit = entry.get("units") or entry.get("unit")
        return str(unit).strip().lower() if unit is not None else None
    return None


def _parameter_days(payload: dict[str, Any], parameter: str) -> dict[date, float]:
    properties = payload.get("properties") or {}
    if not isinstance(properties, dict):
        raise ValueError("NASA POWER properties were invalid")
    data = properties.get("parameter") or {}
    if not isinstance(data, dict):
        raise ValueError("NASA POWER parameter data were invalid")
    values = data.get(parameter)
    if not isinstance(values, dict):
        raise ValueError(f"NASA POWER response omitted {parameter}")
    parsed: dict[date, float] = {}
    for key, raw_value in values.items():
        try:
            day = datetime.strptime(str(key), "%Y%m%d").date()
        except ValueError:
            continue
        number = _finite_number(raw_value)
        if number is not None:
            parsed[day] = number
    return parsed


def _latest_daily_measure(
    payload: dict[str, Any],
    parameter: str,
    requested_date: date,
    *,
    unit: str,
    accepted_metadata_units: set[str],
    description: str,
    maximum: float | None = None,
) -> FieldConditionMeasure:
    actual_unit = _metadata_unit(payload, parameter)
    if actual_unit not in accepted_metadata_units:
        return _unavailable(
            unit=unit,
            source=NASA_SOURCE,
            source_url=NASA_SOURCE_URL,
            spatial_resolution=NASA_SPATIAL_RESOLUTION,
            message=(f"NASA POWER {parameter} metadata was missing or had an unexpected unit; "
                     "the measure was withheld."),
        )
    try:
        days = _parameter_days(payload, parameter)
    except ValueError:
        return _unavailable(
            unit=unit,
            source=NASA_SOURCE,
            source_url=NASA_SOURCE_URL,
            spatial_resolution=NASA_SPATIAL_RESOLUTION,
            message=f"NASA POWER did not return usable daily {description} data.",
        )
    available = [day for day in days if day <= requested_date]
    if maximum is not None:
        available = [day for day in available if days[day] <= maximum]
    if not available:
        return _unavailable(
            unit=unit,
            source=NASA_SOURCE,
            source_url=NASA_SOURCE_URL,
            spatial_resolution=NASA_SPATIAL_RESOLUTION,
            message=f"NASA POWER has no valid {description} observation on or before the requested date.",
        )
    day = max(available)
    return _measure(
        value=days[day], unit=unit, period_start=day, period_end=day,
        source=NASA_SOURCE, source_url=NASA_SOURCE_URL,
        spatial_resolution=NASA_SPATIAL_RESOLUTION,
        message=f"Latest valid NASA POWER {description} day on or before the requested date.",
    )


def _precipitation_30d(payload: dict[str, Any], requested_date: date) -> FieldConditionMeasure:
    actual_unit = _metadata_unit(payload, "PRECTOTCORR")
    if actual_unit not in {"mm/day", "mm d-1", "mm day-1"}:
        return _unavailable(
            unit="mm", source=NASA_SOURCE, source_url=NASA_SOURCE_URL,
            spatial_resolution=NASA_SPATIAL_RESOLUTION,
            message="NASA POWER precipitation metadata was missing or had an unexpected unit; the measure was withheld.",
        )
    try:
        days = _parameter_days(payload, "PRECTOTCORR")
    except ValueError:
        return _unavailable(
            unit="mm", source=NASA_SOURCE, source_url=NASA_SOURCE_URL,
            spatial_resolution=NASA_SPATIAL_RESOLUTION,
            message="NASA POWER did not return usable daily precipitation data.",
        )

    # Search newest to oldest. A partial window is never summed or zero-filled.
    for end_day in sorted((day for day in days if day <= requested_date), reverse=True):
        start_day = end_day - timedelta(days=29)
        window = [start_day + timedelta(days=offset) for offset in range(30)]
        if all(day in days for day in window):
            try:
                total = math.fsum(days[day] for day in window)
            except OverflowError:
                continue
            if not math.isfinite(total):
                continue
            return _measure(
                value=total, unit="mm", period_start=start_day, period_end=end_day,
                source=NASA_SOURCE, source_url=NASA_SOURCE_URL,
                spatial_resolution=NASA_SPATIAL_RESOLUTION,
                message="Sum of 30 contiguous valid NASA POWER daily precipitation values.",
            )
    return _unavailable(
        unit="mm", source=NASA_SOURCE, source_url=NASA_SOURCE_URL,
        spatial_resolution=NASA_SPATIAL_RESOLUTION,
        message="NASA POWER did not provide 30 contiguous valid daily precipitation values ending on or before the requested date.",
    )


def _sda_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        table = payload.get("Table") or payload.get("table")
    else:
        table = payload
    if not isinstance(table, list):
        raise ValueError("Unexpected SDA table response")
    if not table:
        return []
    # JSON+COLUMNNAME format has the column names in row 0.
    first = table[0]
    if isinstance(first, list) and all(isinstance(item, str) for item in first):
        names = [item.lower() for item in first]
        return [dict(zip(names, row)) for row in table[1:] if isinstance(row, list)]
    # Plain JSON format preserves SQL select order.
    rows = []
    for row in table:
        if isinstance(row, dict):
            rows.append({str(key).lower(): value for key, value in row.items()})
        elif isinstance(row, list) and len(row) >= 3:
            rows.append({"mukey": row[0], "muname": row[1], "aws0100wta": row[2]})
    return rows


async def _lookup_soil(client: httpx.AsyncClient, latitude: float, longitude: float) -> tuple[FieldConditionMeasure, str | None]:
    # Coordinates originate from validated float arguments and are rendered with
    # fixed precision before embedding in the SDA WKT SQL expression.
    point_wkt = f"point({longitude:.6f} {latitude:.6f})"
    query = (
        "SELECT TOP 2 m.mukey, m.muname, a.aws0100wta "
        "FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('"
        + point_wkt
        + "') AS s "
        "JOIN mapunit AS m ON m.mukey = s.mukey "
        "LEFT JOIN muaggatt AS a ON a.mukey = m.mukey "
        "ORDER BY m.mukey"
    )
    try:
        async with asyncio.timeout(7.0):
            payload = await _request_json(
                client,
                USDA_SDA_URL,
                data={"query": query, "format": "JSON+COLUMNNAME"},
            )
        rows = _sda_rows(payload)
    except (httpx.HTTPError, ValueError, TypeError, AttributeError, json.JSONDecodeError, TimeoutError) as exc:
        logger.warning("USDA field-condition lookup unavailable (%s)", type(exc).__name__)
        return (_unavailable(
            unit="mm", source=USDA_SOURCE, source_url=USDA_SOURCE_URL,
            spatial_resolution=USDA_SPATIAL_RESOLUTION,
            message="USDA NRCS Soil Data Access is temporarily unavailable or returned an unreadable response.",
        ), None)
    if not rows:
        return (_unavailable(
            unit="mm", source=USDA_SOURCE, source_url=USDA_SOURCE_URL,
            spatial_resolution=USDA_SPATIAL_RESOLUTION,
            message="USDA NRCS has no mapped SSURGO soil map unit for this point.",
        ), None)
    if len(rows) != 1:
        return (_unavailable(
            unit="mm", source=USDA_SOURCE, source_url=USDA_SOURCE_URL,
            spatial_resolution=USDA_SPATIAL_RESOLUTION,
            message="The point intersects multiple SSURGO map units, so a single map-unit storage value is ambiguous.",
        ), None)

    row = rows[0]
    mapunit_name = str(row.get("muname") or "").strip() or None
    aws_cm = _finite_number(row.get("aws0100wta"))
    if aws_cm is None:
        return (_unavailable(
            unit="mm", source=USDA_SOURCE, source_url=USDA_SOURCE_URL,
            spatial_resolution=USDA_SPATIAL_RESOLUTION,
            message="USDA NRCS has no valid 0–100 cm available water storage value for this map unit.",
        ), mapunit_name)
    aws_mm = aws_cm * 10.0
    if not math.isfinite(aws_mm):
        return (_unavailable(
            unit="mm", source=USDA_SOURCE, source_url=USDA_SOURCE_URL,
            spatial_resolution=USDA_SPATIAL_RESOLUTION,
            message="USDA NRCS returned an invalid 0–100 cm available water storage value for this map unit.",
        ), mapunit_name)
    return (_measure(
        value=aws_mm, unit="mm", period_start=None, period_end=None,
        source=USDA_SOURCE, source_url=USDA_SOURCE_URL,
        spatial_resolution=USDA_SPATIAL_RESOLUTION,
        message="Current mapped soil capacity for the 0–100 cm layer; not a historical soil survey or current water remaining.",
    ), mapunit_name)


async def _fetch_nasa(client: httpx.AsyncClient, latitude: float, longitude: float, requested_date: date) -> tuple[FieldConditionMeasure, FieldConditionMeasure]:
    start_date = max(
        date(1981, 1, 1),
        requested_date - timedelta(days=NASA_LOOKBACK_DAYS - 1),
    )
    params = {
        "parameters": "PRECTOTCORR,GWETROOT",
        "community": "AG",
        "longitude": f"{longitude:.6f}",
        "latitude": f"{latitude:.6f}",
        "start": start_date.strftime("%Y%m%d"),
        "end": requested_date.strftime("%Y%m%d"),
        "format": "JSON",
        "time-standard": "UTC",
    }
    try:
        async with asyncio.timeout(7.0):
            payload = await _request_json(client, NASA_POWER_URL, params=params)
        if not isinstance(payload, dict):
            raise ValueError("Unexpected NASA POWER response")
    except (httpx.HTTPError, ValueError, TypeError, AttributeError, json.JSONDecodeError, TimeoutError) as exc:
        logger.warning("NASA POWER field-condition lookup unavailable (%s)", type(exc).__name__)
        unavailable_precip = _unavailable(
            unit="mm", source=NASA_SOURCE, source_url=NASA_SOURCE_URL,
            spatial_resolution=NASA_SPATIAL_RESOLUTION,
            message="NASA POWER is temporarily unavailable or returned an unreadable response.",
        )
        unavailable_wetness = _unavailable(
            unit="fraction", source=NASA_SOURCE, source_url=NASA_SOURCE_URL,
            spatial_resolution=NASA_SPATIAL_RESOLUTION,
            message="NASA POWER is temporarily unavailable or returned an unreadable response.",
        )
        return unavailable_precip, unavailable_wetness

    precipitation = _precipitation_30d(payload, requested_date)
    wetness = _latest_daily_measure(
        payload, "GWETROOT", requested_date, unit="fraction",
        accepted_metadata_units={"fraction", "1", "unitless", "dimensionless"},
        description="root-zone wetness fraction",
        maximum=1.0,
    )
    return precipitation, wetness


async def lookup(latitude: float, longitude: float, requested_date: date) -> FieldConditionsResult:
    """Fetch bounded NASA daily observations and USDA mapped soil context."""
    if not math.isfinite(latitude) or not -90 <= latitude <= 90:
        raise ValueError("latitude must be finite and between -90 and 90")
    if not math.isfinite(longitude) or not -180 <= longitude <= 180:
        raise ValueError("longitude must be finite and between -180 and 180")
    if isinstance(requested_date, datetime) or not isinstance(requested_date, date):
        raise ValueError("requested_date must be a date")

    sample = GeoCoordinate(latitude=latitude, longitude=longitude)
    key = (round(latitude, 6), round(longitude, 6), requested_date.isoformat())
    now = time.monotonic()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        _CACHE.move_to_end(key)
        return cached[1].model_copy(update={"sample": sample})

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=False) as client:
        # Independent NASA and USDA requests are concurrent; each request has a
        # strict timeout and a bounded response body.
        nasa_task = asyncio.create_task(_fetch_nasa(client, latitude, longitude, requested_date))
        soil_task = asyncio.create_task(_lookup_soil(client, latitude, longitude))
        precipitation, wetness = await nasa_task
        aws, mapunit_name = await soil_task

    result = FieldConditionsResult(
        sample=sample,
        requestedDate=requested_date.isoformat(),
        retrievedAt=datetime.now(timezone.utc).isoformat(),
        precipitation30d=precipitation,
        rootZoneWetness=wetness,
        availableWaterStorage=aws,
        soilMapUnit=mapunit_name,
    )
    if all(measure.status == "available" for measure in (precipitation, wetness, aws)):
        ttl = CACHE_TTL_SECONDS
    else:
        ttl = FAILURE_CACHE_TTL_SECONDS
    _CACHE[key] = (now - (CACHE_TTL_SECONDS - ttl), result)
    _CACHE.move_to_end(key)
    while len(_CACHE) > CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)
    return result
