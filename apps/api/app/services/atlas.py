"""Load an explicitly configured, validated regional dataset; never invent atlas values."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import h3
from pydantic import ValidationError

from shared.python.schemas import AtlasDataset

MAX_DATASET_BYTES = 10 * 1024 * 1024
UNAVAILABLE_MESSAGE = "No validated regional dataset is configured on this service."


def unavailable(message: str = UNAVAILABLE_MESSAGE) -> AtlasDataset:
    return AtlasDataset(
        status="unavailable", message=message, datasetId=None, generatedAt=None,
        validation=None, scenarios=[], cells=[], provenance=[],
    )


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key] = value
    return result


def load_dataset(path_value: str | None = None) -> AtlasDataset:
    configured = path_value if path_value is not None else os.getenv("ATLAS_DATASET_PATH")
    if not configured:
        return unavailable()
    path = Path(configured).expanduser()
    try:
        if not path.is_file() or path.stat().st_size > MAX_DATASET_BYTES:
            return unavailable("Configured atlas dataset is missing or exceeds the 10 MB limit.")
        raw = path.read_bytes()
        if len(raw) > MAX_DATASET_BYTES:
            return unavailable("Configured atlas dataset is missing or exceeds the 10 MB limit.")
        payload = json.loads(raw, object_pairs_hook=_unique_object)
        dataset = AtlasDataset.model_validate(payload)
        if dataset.status != "available":
            return unavailable(dataset.message or UNAVAILABLE_MESSAGE)
        if len(dataset.cells) > 10_000:
            return unavailable("Configured atlas dataset exceeds the 10,000 cell limit.")
        for cell in dataset.cells:
            if not h3.is_valid_cell(cell.h3Index):
                return unavailable("Configured atlas dataset contains an invalid H3 cell index.")
            latitude, longitude = h3.cell_to_latlng(cell.h3Index)
            if not 24 <= latitude <= 50 or not -125 <= longitude <= -66:
                return unavailable("Configured atlas dataset contains cells outside the supported CONUS bounds.")
        resolutions: dict[tuple[str, str], set[int]] = {}
        for cell in dataset.cells:
            resolutions.setdefault((cell.crop, cell.scenarioId), set()).add(h3.get_resolution(cell.h3Index))
        if any(len(values) > 1 for values in resolutions.values()):
            return unavailable("Configured atlas dataset mixes H3 resolutions within a crop/scenario group.")
        return dataset
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, ValidationError, TypeError):
        return unavailable("Configured atlas dataset failed validation and was withheld.")
