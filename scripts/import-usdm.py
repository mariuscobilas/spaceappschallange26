#!/usr/bin/env python3
"""Fetch and reproducibly simplify one dated U.S. Drought Monitor GeoJSON export."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_URL = "https://droughtmonitor.unl.edu/data/json/usdm_{date}.json"
MAX_RAW_BYTES = 20 * 1024 * 1024
MAX_OUTPUT_BYTES = 2 * 1024 * 1024
SIMPLIFY_TOLERANCE = 0.005
COORDINATE_PRECISION = 5
CLASSES = set(range(5))
LICENSE_URL = "https://droughtmonitor.unl.edu/About/Permission.aspx"
METADATA_URL = "https://droughtmonitor.unl.edu/DmData/Metadata.aspx"
ATTRIBUTION = (
    "The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at "
    "the University of Nebraska–Lincoln, the U.S. Department of Agriculture, the National "
    "Oceanic and Atmospheric Administration and NASA. Map / Data courtesy of NDMC, via "
    "https://droughtmonitor.unl.edu."
)
CLASS_COLORS = {
    "DM0": "#FFFF00",
    "DM1": "#FCD37F",
    "DM2": "#FFAA00",
    "DM3": "#E60000",
    "DM4": "#730000",
}
LIMITATIONS = [
    "U.S. Drought Monitor categories are a weekly regional assessment, not a field measurement, forecast, or crop-specific drought impact.",
    "The map is display context only; it does not support field-wide agronomic recommendations or profitability estimates.",
    "Geometry is simplified in longitude/latitude by 0.005 degrees and snapped to a 0.00001-degree precision grid; narrow slivers may collapse.",
    "Per-class simplification can create small gaps or overlaps along class boundaries; the output is not suitable for area statistics or official decisions.",
    "The source map includes the U.S. extent represented by USDM, including Alaska, Hawaii, and Puerto Rico; it is not limited to CONUS.",
]


def parse_date(value: str) -> date:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise argparse.ArgumentTypeError("date must use YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("date must use YYYY-MM-DD") from exc
    if parsed.weekday() != 1:
        raise argparse.ArgumentTypeError("USDM archive dates must be Tuesdays")
    return parsed


def duplicate_key_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def download(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "FieldShift-USDM-import/1.0"})
    try:
        with urlopen(request, timeout=30) as response:
            final_url = response.geturl()
            if not final_url.startswith("https://droughtmonitor.unl.edu/"):
                raise ValueError("USDM download redirected outside droughtmonitor.unl.edu")
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > MAX_RAW_BYTES:
                raise ValueError("USDM source exceeds the 20 MB raw-file limit")
            raw = response.read(MAX_RAW_BYTES + 1)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise ValueError(f"USDM source download failed: {exc}") from exc
    if len(raw) > MAX_RAW_BYTES:
        raise ValueError("USDM source exceeds the 20 MB raw-file limit")
    return raw


def load_input(args: argparse.Namespace, source_url: str) -> bytes:
    if args.input is None:
        print(f"Downloading {source_url}", file=sys.stderr)
        return download(source_url)
    expected_name = f"usdm_{args.date:%Y%m%d}.json"
    path = args.input.expanduser().resolve()
    if path.name != expected_name:
        raise ValueError(f"--input must be the exact dated source file named {expected_name}")
    if not path.is_file() or path.stat().st_size > MAX_RAW_BYTES:
        raise ValueError("--input is missing or exceeds the 20 MB raw-file limit")
    return path.read_bytes()


def read_source(raw: bytes) -> dict:
    try:
        payload = json.loads(raw, object_pairs_hook=duplicate_key_object)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("USDM source is not valid UTF-8 JSON") from exc
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValueError("USDM source must be a GeoJSON FeatureCollection")
    features = payload.get("features")
    if not isinstance(features, list) or len(features) != 5:
        raise ValueError("USDM source must contain exactly five drought-class features")
    seen: set[int] = set()
    for feature in features:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        raw_class = properties.get("DM") if isinstance(properties, dict) else None
        if isinstance(raw_class, bool) or not isinstance(raw_class, int) or raw_class not in CLASSES:
            raise ValueError("USDM feature DM class must be an integer from 0 through 4")
        if raw_class in seen:
            raise ValueError(f"USDM source contains duplicate DM{raw_class} classes")
        seen.add(raw_class)
    if seen != CLASSES:
        raise ValueError("USDM source must include exactly DM0, DM1, DM2, DM3, and DM4")
    return payload


def validate_coordinates(geometry) -> None:
    # Keep the source in geographic coordinates and reject malformed source
    # geometry instead of silently repairing or dropping invalid positions.
    from shapely import get_coordinates

    coordinates = get_coordinates(geometry)
    if coordinates.size == 0 or not all(math.isfinite(float(value)) for value in coordinates.flat):
        raise ValueError("USDM geometry has missing or non-finite coordinates")
    longitudes = coordinates[:, 0]
    latitudes = coordinates[:, 1]
    if (longitudes.min() < -180 or longitudes.max() > 180 or
            latitudes.min() < -90 or latitudes.max() > 90):
        raise ValueError("USDM source geometry contains coordinates outside longitude/latitude ranges")


def process(payload: dict) -> tuple[dict, Counter[int], list[tuple[float, float, float, float]]]:
    try:
        from shapely import is_valid, set_precision, simplify
        from shapely.geometry import mapping, shape
    except ImportError as exc:
        raise ValueError("Shapely 2.1.2 is required; see docs/MAP-DATA.md for the isolated import environment") from exc

    output_features = []
    counts: Counter[int] = Counter()
    bounds: list[tuple[float, float, float, float]] = []
    for feature in sorted(payload["features"], key=lambda item: item["properties"]["DM"]):
        dm = feature["properties"]["DM"]
        geometry_json = feature.get("geometry")
        if not isinstance(geometry_json, dict) or geometry_json.get("type") != "MultiPolygon":
            raise ValueError(f"DM{dm} source geometry must be a MultiPolygon")
        try:
            source_geometry = shape(geometry_json)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"DM{dm} source geometry could not be parsed") from exc
        validate_coordinates(source_geometry)
        if source_geometry.is_empty or not is_valid(source_geometry):
            raise ValueError(f"DM{dm} raw source geometry is invalid; refusing to repair it silently")

        simplified = simplify(source_geometry, SIMPLIFY_TOLERANCE, preserve_topology=True)
        # Shapely's valid_output snap rounding rounds every coordinate to five
        # decimal places while dropping only collapsed remnants as necessary.
        rounded = set_precision(simplified, 10 ** -COORDINATE_PRECISION, mode="valid_output")
        if rounded.is_empty or rounded.geom_type != "MultiPolygon" or not is_valid(rounded):
            raise ValueError(f"DM{dm} processed geometry failed topology validation")
        validate_coordinates(rounded)
        bounds.append(tuple(float(value) for value in rounded.bounds))
        output_features.append({
            "type": "Feature",
            "properties": {"DM": dm},
            "geometry": mapping(rounded),
        })
        counts[dm] += 1

    return {"type": "FeatureCollection", "features": output_features}, counts, bounds


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")


def atomic_write(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_bytes(body)
    temp_path.replace(path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True, type=parse_date, help="Tuesday USDM assessment date in YYYY-MM-DD format")
    parser.add_argument("--input", type=Path, help="Optional exact dated source file (usdm_YYYYMMDD.json); downloads when omitted")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    date_key = args.date.strftime("%Y%m%d")
    source_url = RAW_URL.format(date=date_key)
    output_path = REPO_ROOT / "apps" / "web" / "public" / "data" / f"usdm-{args.date.isoformat()}.geojson"
    metadata_path = REPO_ROOT / "apps" / "web" / "data" / "usdm.json"
    try:
        raw = load_input(args, source_url)
        source = read_source(raw)
        output, counts, feature_bounds = process(source)
        output_bytes = canonical_json(output)
        if len(output_bytes) > MAX_OUTPUT_BYTES:
            raise ValueError("processed USDM GeoJSON exceeds the 2 MB output limit")
        output_hash = hashlib.sha256(output_bytes).hexdigest()
        raw_hash = hashlib.sha256(raw).hexdigest()
        metadata = {
            "asOf": args.date.isoformat(),
            "sourceUrl": source_url,
            "geojsonUrl": f"/data/{output_path.name}",
            "sha256": output_hash,
            "rawsha256": raw_hash,
            "license": "Authorized for third-party use with proper attribution.",
            "licenseUrl": LICENSE_URL,
            "metadataUrl": METADATA_URL,
            "attribution": ATTRIBUTION,
            "tolerance": SIMPLIFY_TOLERANCE,
            "toleranceUnit": "decimal degrees",
            "coordinatePrecision": COORDINATE_PRECISION,
            "coverage": "U.S. Drought Monitor source extent, including the contiguous United States, Alaska, Hawaii, and Puerto Rico.",
            "coverageBounds": [
                min(bounds[0] for bounds in feature_bounds),
                min(bounds[1] for bounds in feature_bounds),
                max(bounds[2] for bounds in feature_bounds),
                max(bounds[3] for bounds in feature_bounds),
            ],
            "featureCount": len(output["features"]),
            "classCounts": {f"DM{dm}": counts[dm] for dm in sorted(CLASSES)},
            "classColors": CLASS_COLORS,
            "limitations": LIMITATIONS,
        }
        metadata_bytes = canonical_json(metadata)
        atomic_write(output_path, output_bytes)
        atomic_write(metadata_path, metadata_bytes)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"USDM import failed: {exc}", file=sys.stderr)
        return 1

    print(f"Wrote {output_path.relative_to(REPO_ROOT)} ({len(output_bytes):,} bytes)")
    print(f"Wrote {metadata_path.relative_to(REPO_ROOT)}")
    print(f"asOf={metadata['asOf']} features={metadata['featureCount']} sha256={metadata['sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
