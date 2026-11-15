"""Bounded USDA NASS CDL point lookup."""

from __future__ import annotations

import os
import logging
import re
import time
import xml.etree.ElementTree as ET
from collections import OrderedDict
from typing import Optional

import httpx
from pyproj import Transformer

from shared.python.schemas import GeoCoordinate, LandCoverResult

SOURCE = "USDA NASS Cropland Data Layer (CDL)"
UPSTREAM_URL = "https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue"
TIMEOUT_SECONDS = 3.0
MAX_BODY_BYTES = 64 * 1024
CACHE_TTL_SECONDS = 30 * 60
CACHE_MAX_ENTRIES = 512
TO_ALBERS = Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)
SUPPORTED_CROPS = {1: "corn", 2: "cotton", 4: "sorghum", 5: "soybeans", 22: "wheat", 23: "wheat", 24: "wheat"}

# USDA NASS CDL 2025 legend classes. Codes missing from the published legend,
# background, cloud/no-data, and undefined classes are not asserted as land cover.
_CROP_CLASS_CODES = (
    set(range(1, 61)) | {61} |
    {66, 67, 68, 69, 70, 71, 72, 74, 75, 76, 77} |
    {204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217,
     218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231,
     232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245,
     246, 247, 248, 249, 250, 254}
)
_NON_CROP_CLASS_CODES = (
    {62, 63, 64, 65, 82, 83, 87, 88, 92} |
    {111, 112, 121, 122, 123, 124, 131, 141, 142, 143, 152, 176, 190, 195}
)
_CACHE: OrderedDict[tuple[float, float, int], tuple[float, LandCoverResult]] = OrderedDict()
logger = logging.getLogger(__name__)


def latest_year() -> int:
    try:
        return max(1997, int(os.getenv("CDL_LATEST_YEAR", "2025")))
    except ValueError as exc:
        logger.warning("Invalid CDL_LATEST_YEAR setting; using 2025 (%s)", type(exc).__name__)
        return 2025


def parse_upstream(body: bytes) -> tuple[int, str]:
    """Read only numeric value/category from upstream XML; reject DTD/entity input."""
    if len(body) > MAX_BODY_BYTES:
        raise ValueError("Upstream response exceeded size limit")
    upper = body.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("Unsafe XML declaration")
    root = ET.fromstring(body)
    values: dict[str, str] = {}
    for el in root.iter():
        if el.tag.rsplit("}", 1)[-1].lower() in {"value", "category"} and el.text:
            values[el.tag.rsplit("}", 1)[-1].lower()] = el.text.strip()
    # A few service deployments serialize the Result object as a text value.
    if "value" not in values or "category" not in values:
        text = " ".join(root.itertext())
        m_value = re.search(r"\bvalue\s*[:=]\s*['\"]?(\d+)", text, re.I)
        m_category = re.search(r"\bcategory\s*[:=]\s*['\"]([^'\"]+)", text, re.I)
        if m_value and m_category:
            values = {"value": m_value.group(1), "category": m_category.group(1)}
    code = int(values["value"])
    if code < 0 or code > 65535 or not values.get("category"):
        raise ValueError("Invalid CDL result")
    return code, values["category"]


def classify(code: int, category: str, year: int, requested_year: int, sample: GeoCoordinate) -> LandCoverResult:
    crop = SUPPORTED_CROPS.get(code)
    if code in _CROP_CLASS_CODES:
        status = "cropland"
        message = f"CDL classified this point as {category}."
    elif code in _NON_CROP_CLASS_CODES:
        status = "non_cropland"
        message = f"CDL classified this point as {category}, outside the crop classes supported by this lookup."
    else:
        return unavailable(requested_year, sample, f"CDL returned {category} (class {code}), which is background, no-data, or not in the recognized legend. You can continue with a manually selected crop.")
    return LandCoverResult(status=status, code=code, category=category,
                           suggestedCrop=crop, year=year, requestedYear=requested_year,
                           sample=sample, source=SOURCE, message=message)


def unavailable(requested_year: int, sample: GeoCoordinate, reason: str) -> LandCoverResult:
    return LandCoverResult(status="unavailable", code=None, category=None,
                           suggestedCrop=None, year=None, requestedYear=requested_year,
                           sample=sample, source=SOURCE, message=reason)


async def lookup(latitude: float, longitude: float, requested_year: int) -> LandCoverResult:
    effective_year = min(requested_year, latest_year())
    sample = GeoCoordinate(latitude=latitude, longitude=longitude)
    key = (round(latitude, 6), round(longitude, 6), effective_year)
    now = time.monotonic()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        _CACHE.move_to_end(key)
        # Preserve this request's original year even when capped to latest year.
        result = cached[1]
        return result.model_copy(update={"requestedYear": requested_year, "sample": sample})
    x, y = TO_ALBERS.transform(longitude, latitude)
    params = {"year": effective_year, "x": f"{x:.3f}", "y": f"{y:.3f}"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
            async with client.stream("GET", UPSTREAM_URL, params=params) as response:
                response.raise_for_status()
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > MAX_BODY_BYTES:
                        raise ValueError("Upstream response exceeded size limit")
        code, category = parse_upstream(bytes(chunks))
        result = classify(code, category, effective_year, requested_year, sample)
        _CACHE[key] = (now, result)
        _CACHE.move_to_end(key)
        while len(_CACHE) > CACHE_MAX_ENTRIES:
            _CACHE.popitem(last=False)
        return result
    except (httpx.HTTPError, ValueError, ET.ParseError, KeyError, TypeError) as exc:
        logger.warning("USDA Cropland Data Layer lookup unavailable (%s)", type(exc).__name__)
        return unavailable(requested_year, sample, f"USDA CDL data is temporarily unavailable ({type(exc).__name__}). You can continue with a manually selected crop.")
