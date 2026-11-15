"""Load and validate the bundled county-scale historical yield dataset."""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from shared.python.schemas import RegionalYieldDataset

MAX_DATASET_BYTES = 10 * 1024 * 1024
MAX_REGIONS = 1000
UNAVAILABLE_MESSAGE = "No validated county yield dataset is available on this service."
DEFAULT_DATASET_PATH = Path(__file__).resolve().parents[4] / "shared" / "data" / "regional-yield.json"
logger = logging.getLogger(__name__)


def unavailable(message: str = UNAVAILABLE_MESSAGE) -> RegionalYieldDataset:
    return RegionalYieldDataset(
        status="unavailable",
        message=message,
        datasetId=None,
        generatedAt=None,
        source=None,
        method=None,
        regions=[],
    )


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate JSON object key")
        value[key] = item
    return value


def _check_centroids(payload: Any) -> None:
    """Prevent JSON booleans/strings being coerced to numeric centroid values."""
    if not isinstance(payload, dict) or not isinstance(payload.get("regions"), list):
        raise ValueError("invalid regional dataset structure")
    for region in payload["regions"]:
        if not isinstance(region, dict):
            raise ValueError("invalid county record")
        centroid = region.get("centroid")
        if (not isinstance(centroid, list) or len(centroid) != 2
                or any(type(value) not in (int, float) for value in centroid)):
            raise ValueError("invalid county centroid")


@lru_cache(maxsize=16)
def _load_cached(path: str, modified_ns: int, size: int) -> RegionalYieldDataset:
    """Cache validated parsed data by canonical path and file identity."""
    del modified_ns, size  # Included in the cache key to invalidate on replacement.
    file_path = Path(path)
    try:
        if file_path.stat().st_size > MAX_DATASET_BYTES:
            return unavailable("Configured county yield dataset exceeds the 10 MB limit.")
        raw = file_path.read_bytes()
        if len(raw) > MAX_DATASET_BYTES:
            return unavailable("Configured county yield dataset exceeds the 10 MB limit.")
        payload = json.loads(raw, object_pairs_hook=_unique_object)
        _check_centroids(payload)
        dataset = RegionalYieldDataset.model_validate(payload)
        if dataset.status != "available":
            return unavailable(dataset.message)
        if len(dataset.regions) > MAX_REGIONS:
            return unavailable("Configured county yield dataset exceeds the 1,000 county limit.")
        return dataset
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, ValidationError, TypeError) as exc:
        logger.warning("Configured county yield dataset rejected (%s)", type(exc).__name__)
        return unavailable("Configured county yield dataset failed validation and was withheld.")


def load_regional_yield(path_value: str | None = None) -> RegionalYieldDataset:
    """Return validated bundled/overridden data, or an honest empty unavailable envelope."""
    configured = path_value if path_value is not None else os.getenv("ATLAS_REGIONAL_YIELD_PATH")
    path = Path(configured).expanduser() if configured else DEFAULT_DATASET_PATH
    try:
        resolved = path.resolve(strict=True)
        stat = resolved.stat()
        if not resolved.is_file():
            return unavailable()
        if stat.st_size > MAX_DATASET_BYTES:
            return unavailable("Configured county yield dataset exceeds the 10 MB limit.")
        dataset = _load_cached(str(resolved), stat.st_mtime_ns, stat.st_size)
        # Avoid sharing a mutable response model between request handlers.
        return dataset.model_copy(deep=True)
    except OSError as exc:
        logger.warning("County yield dataset could not be opened (%s)", type(exc).__name__)
        return unavailable()
