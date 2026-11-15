"""Bounded USDA NRCS SDA profile lookup for the dominant map-unit component."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

import httpx

from shared.python.schemas import (
    GeoCoordinate, SoilHorizon, SoilMeasure, SoilProfileComponent, SoilProfileResult,
)

SDA_URL = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest"
SDA_SOURCE = "USDA NRCS Soil Data Access (SSURGO)"
SDA_SOURCE_URL = "https://sdmdataaccess.sc.egov.usda.gov/"
TIMEOUT_SECONDS = 7.0
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
CACHE_TTL_SECONDS = 30 * 60
FAILURE_CACHE_TTL_SECONDS = 30
CACHE_MAX_ENTRIES = 256
_CACHE: OrderedDict[tuple[float, float], tuple[float, SoilProfileResult]] = OrderedDict()
logger = logging.getLogger(__name__)


def _unavailable_measure(unit: str, message: str) -> SoilMeasure:
    return SoilMeasure(status="unavailable", value=None, unit=unit, source=SDA_SOURCE, sourceUrl=SDA_SOURCE_URL, message=message)


def _measure(value: Any, unit: str, message: str, *, text: bool = False, minimum: float | None = None, maximum: float | None = None) -> SoilMeasure:
    if text:
        if not isinstance(value, str) or not value.strip():
            return _unavailable_measure(unit, message)
        return SoilMeasure(status="available", value=value.strip()[:300], unit=unit, source=SDA_SOURCE, sourceUrl=SDA_SOURCE_URL, message=message)
    if isinstance(value, bool):
        return _unavailable_measure(unit, message)
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return _unavailable_measure(unit, message)
    if not math.isfinite(number) or (minimum is not None and number < minimum) or (maximum is not None and number > maximum):
        return _unavailable_measure(unit, message)
    return SoilMeasure(status="available", value=number, unit=unit, source=SDA_SOURCE, sourceUrl=SDA_SOURCE_URL, message=message)


def _rows(payload: Any) -> list[dict[str, Any]]:
    table = payload.get("Table") or payload.get("table") if isinstance(payload, dict) else payload
    if not isinstance(table, list) or not table:
        return []
    if isinstance(table[0], list) and all(isinstance(value, str) for value in table[0]):
        names = [name.lower() for name in table[0]]
        return [dict(zip(names, row)) for row in table[1:] if isinstance(row, list) and len(row) == len(names)]
    return [{str(key).lower(): value for key, value in row.items()} for row in table if isinstance(row, dict)]


async def _json(client: httpx.AsyncClient, query: str) -> Any:
    async with asyncio.timeout(TIMEOUT_SECONDS):
        async with client.stream("POST", SDA_URL, data={"query": query, "format": "JSON+COLUMNNAME"}) as response:
            response.raise_for_status()
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise ValueError("SDA response exceeded size limit")
    return json.loads(body)


def _unavailable(sample: GeoCoordinate, message: str) -> SoilProfileResult:
    return SoilProfileResult(
        status="unavailable", message=message, sample=sample,
        retrievedAt=datetime.now(timezone.utc).isoformat(), source=SDA_SOURCE,
        sourceUrl=SDA_SOURCE_URL, components=[],
    )


def _dominant_component(rows: list[dict[str, Any]], sample: GeoCoordinate) -> SoilProfileResult:
    if not rows:
        return _unavailable(sample, "USDA NRCS has no mapped soil component at this point.")
    try:
        intersected = int(rows[0].get("intersected_mapunit_count") or 0)
    except (TypeError, ValueError):
        intersected = 0
    if intersected > 1:
        return _unavailable(sample, "The point intersects more than one mapped soil unit; a dominant component is ambiguous.")
    mapunits = {(str(row.get("mukey")), str(row.get("musym") or ""), str(row.get("muname") or "")) for row in rows}
    if len({key[0] for key in mapunits}) != 1:
        return _unavailable(sample, "The point intersects more than one mapped soil unit; an unambiguous dominant component could not be selected.")
    mapunit = next(iter(mapunits))
    components: dict[str, dict[str, Any]] = {}
    for row in rows:
        cokey = str(row.get("cokey") or "").strip()
        if not cokey:
            continue
        current = components.get(cokey)
        try:
            pct = float(row.get("comppct_r"))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(pct) or not 0 <= pct <= 100:
            continue
        if current is None or pct > current["pct"]:
            components[cokey] = {"pct": pct, "row": row}
    if not components:
        return _unavailable(sample, "USDA NRCS did not return a verified dominant soil component.")
    dominant = max(components.values(), key=lambda entry: entry["pct"])
    cokey = str(dominant["row"].get("cokey"))
    rows = [row for row in rows if str(row.get("cokey")) == cokey]
    horizons: list[SoilHorizon] = []
    for row in rows:
        try:
            top, bottom = float(row.get("hzdept_r")), float(row.get("hzdepb_r"))
        except (TypeError, ValueError, OverflowError):
            continue
        if not math.isfinite(top) or not math.isfinite(bottom) or top >= 30 or bottom <= top:
            continue
        clip_bottom = min(bottom, 30.0)
        top = max(top, 0.0)
        if clip_bottom <= top:
            continue
        horizons.append(SoilHorizon(
            topCm=top, bottomCm=clip_bottom,
            texture=_measure(row.get("texdesc"), "textural class", "USDA horizon texture description.", text=True),
            sandPct=_measure(row.get("sandtotal_r"), "%", "USDA horizon sand fraction.", minimum=0, maximum=100),
            siltPct=_measure(row.get("silttotal_r"), "%", "USDA horizon silt fraction.", minimum=0, maximum=100),
            clayPct=_measure(row.get("claytotal_r"), "%", "USDA horizon clay fraction.", minimum=0, maximum=100),
            organicMatterPct=_measure(row.get("om_r"), "%", "USDA horizon organic matter.", minimum=0, maximum=100),
            bulkDensityGcm3=_measure(row.get("dbthirdbar_r"), "g/cm³", "USDA horizon bulk density at 1/3 bar.", minimum=0, maximum=3),
            ph=_measure(row.get("ph1to1h2o_r"), "pH", "USDA horizon pH in 1:1 water.", minimum=0, maximum=14),
            saturatedConductivityUmS=_measure(row.get("ksat_r"), "µm/s", "USDA saturated hydraulic conductivity.", minimum=0),
        ))
    horizons.sort(key=lambda horizon: (horizon.topCm, horizon.bottomCm))
    row = dominant["row"]
    component = SoilProfileComponent(
        mapUnitSymbol=mapunit[1][:100], mapUnitName=mapunit[2][:300],
        componentName=str(row.get("compname") or "")[:300],
        componentPercent=_measure(row.get("comppct_r"), "%", "USDA component proportion.", minimum=0, maximum=100).value,
        drainageClass=_measure(row.get("drainagecl"), "class", "USDA component drainage class.", text=True),
        hydrologicGroup=_measure(row.get("hydgrp"), "group", "USDA component hydrologic soil group.", text=True),
        horizons=horizons,
    )
    return SoilProfileResult(
        status="available" if horizons else "unavailable",
        message="Dominant SSURGO map-unit component and horizon data for the upper 0–30 cm." if horizons else "USDA NRCS returned a dominant component but no usable horizon values from 0–30 cm.",
        sample=sample, retrievedAt=datetime.now(timezone.utc).isoformat(), source=SDA_SOURCE,
        sourceUrl=SDA_SOURCE_URL, components=[component] if horizons else [],
    )


async def lookup(sample: GeoCoordinate) -> SoilProfileResult:
    key = (round(sample.latitude, 6), round(sample.longitude, 6))
    now = time.monotonic()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        _CACHE.move_to_end(key)
        return cached[1].model_copy(update={"sample": sample})
    point = f"point({sample.longitude:.6f} {sample.latitude:.6f})"
    query = (
        "WITH point_mu AS (SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('" + point + "')), "
        "dominant AS (SELECT TOP 1 m.mukey, m.musym, m.muname, c.cokey, c.compname, c.comppct_r, c.drainagecl, c.hydgrp "
        "FROM point_mu s JOIN mapunit m ON m.mukey=s.mukey JOIN component c ON c.mukey=m.mukey "
        "WHERE c.comppct_r IS NOT NULL ORDER BY c.comppct_r DESC, c.cokey) "
        "SELECT d.mukey, d.musym, d.muname, d.cokey, d.compname, d.comppct_r, d.drainagecl, d.hydgrp, "
        "(SELECT COUNT(*) FROM point_mu) AS intersected_mapunit_count, "
        "h.hzdept_r, h.hzdepb_r, t.texdesc, h.sandtotal_r, h.silttotal_r, h.claytotal_r, h.om_r, "
        "h.dbthirdbar_r, h.ph1to1h2o_r, h.ksat_r "
        "FROM dominant d LEFT JOIN chorizon h ON h.cokey=d.cokey AND h.hzdept_r < 30 AND h.hzdepb_r > 0 "
        "LEFT JOIN (SELECT chkey, MAX(texdesc) AS texdesc FROM chtexturegrp WHERE rvindicator='Yes' GROUP BY chkey) t ON t.chkey=h.chkey "
        "ORDER BY h.hzdept_r"
    )
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
            payload = await _json(client, query)
        result = _dominant_component(_rows(payload), sample)
    except (httpx.HTTPError, TimeoutError, ValueError, TypeError, AttributeError, json.JSONDecodeError) as exc:
        logger.warning("USDA soil profile lookup unavailable (%s)", type(exc).__name__)
        result = _unavailable(sample, "USDA NRCS Soil Data Access is temporarily unavailable or returned unreadable profile data.")
    ttl = CACHE_TTL_SECONDS if result.status == "available" else FAILURE_CACHE_TTL_SECONDS
    _CACHE[key] = (now - (CACHE_TTL_SECONDS - ttl), result)
    _CACHE.move_to_end(key)
    while len(_CACHE) > CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)
    return result
