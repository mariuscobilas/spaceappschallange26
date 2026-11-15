"""Verify NASA study-area weather without inventing soil sampling dates; no fitting."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/app/ml"))
import prepare_water_yield as prep

RAW = ROOT / "data/raw/mandan_weather_v1"
OUTPUT = ROOT / "data/analysis/mandan_weather_v1"
POLICY = RAW / "verification_policy.json"
WEATHER = RAW / "mandan_area_20080101_20111231.json"


def verify_pins(policy):
    for name, expected in policy["pinned_sha256"].items():
        if prep.digest(ROOT / name) != expected:
            raise ValueError(f"Source hash mismatch: {name}")


def verify_calendar(policy):
    """Re-read dated operations, independently of the earlier eligibility audit."""
    workbook = load_workbook(ROOT / "data/raw/usda_mandan_cover_2009_2012/management.xlsx", read_only=True, data_only=True)
    try:
        records = list(workbook["CCS_Management"].values)
        header = records[4]
        operations = {}
        for values in records[5:]:
            row = dict(zip(header, values))
            if row.get("RESPONSECROP") != "SpringWheat" or row.get("ACTIVITY") not in {"Planting", "Harvest"}:
                continue
            when = row["DATE"]
            key = (int(row["YEAR"]), row["ACTIVITY"])
            if not isinstance(when, datetime) or when.year != key[0] or key in operations:
                raise ValueError("Invalid or ambiguous wheat operation")
            operations[key] = when.date().isoformat()
        expected = {(row["year"], operation): row[field] for row in policy["wheat_calendar"]
                    for operation, field in (("Planting", "planting"), ("Harvest", "harvest"))}
        if operations != expected:
            raise ValueError("Wheat calendar differs from source workbook")
        return policy["wheat_calendar"]
    finally:
        workbook.close()


def normalize_weather(payload, request, features):
    header = payload["header"]
    coordinates = payload["geometry"]["coordinates"]
    if (header["time_standard"] != "LST" or request["time-standard"] != "LST"
            or str(header["start"]) != request["start"] or str(header["end"]) != request["end"]
            or abs(coordinates[0] - request["longitude"]) > 0.001
            or abs(coordinates[1] - request["latitude"]) > 0.001):
        raise ValueError("NASA location/date/time standard mismatch")
    expected = set(prep.days(date.fromisoformat(request["start"]).isoformat(), date.fromisoformat(request["end"]).isoformat()))
    parameters = payload["properties"]["parameter"]
    names = {f["parameter"] for f in features}
    if set(parameters) != names or set(request["parameters"].split(",")) != names:
        raise ValueError("NASA parameter mismatch")
    daily = {day: {} for day in sorted(expected)}
    for feature in features:
        name = feature["parameter"]
        if payload["parameters"][name]["units"] != feature["source_unit"]:
            raise ValueError(f"Unexpected NASA unit: {name}")
        values = parameters[name]
        if set(values) != expected:
            raise ValueError(f"Incomplete NASA dates: {name}")
        for day, value in values.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value == header["fill_value"]:
                raise ValueError(f"Invalid NASA observation: {name}/{day}")
            if ((name in {"PRECTOTCORR", "WS2M", "ALLSKY_SFC_SW_DWN"} and value < 0)
                    or (name == "RH2M" and not 0 <= value <= 100)):
                raise ValueError(f"Invalid NASA range: {name}")
            daily[day][name] = value
    if any(row["T2M_MIN"] > row["T2M_MAX"] for row in daily.values()):
        raise ValueError("Reversed temperatures")
    return daily


def acquire(policy):
    sidecar = WEATHER.with_suffix(".source.json")
    url = "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode(policy["weather_request"])
    if WEATHER.exists():
        metadata = json.loads(sidecar.read_text(encoding="utf-8"))
        if metadata["url"] != url or metadata["sha256"] != prep.digest(WEATHER):
            raise ValueError("Cached weather/provenance differs")
        return
    with urlopen(Request(url, headers={"User-Agent": "FieldShift-weather-verification/1"}), timeout=50) as response:
        content = response.read(10_000_001)
    if not content or len(content) > 10_000_000:
        raise ValueError("Unexpected NASA payload size")
    payload = json.loads(content)
    features = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))["weather_features"]
    normalize_weather(payload, policy["weather_request"], features)
    WEATHER.write_bytes(content)
    sidecar.write_bytes(prep.json_bytes({"url": url, "request": policy["weather_request"],
        "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content),
        "retrieved_utc": datetime.now(timezone.utc).isoformat(),
        "spatial_interpretation": policy["representative_point_rule"]}))


def run(fetch=False):
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    policy_hash = prep.digest(POLICY)
    verify_pins(policy)
    calendar = verify_calendar(policy)
    if fetch:
        acquire(policy)
    metadata_path = WEATHER.with_suffix(".source.json")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    expected_url = "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode(policy["weather_request"])
    if metadata["url"] != expected_url or metadata["request"] != policy["weather_request"] or metadata["sha256"] != prep.digest(WEATHER):
        raise ValueError("NASA source provenance mismatch")
    features = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))["weather_features"]
    payload = json.loads(WEATHER.read_text(encoding="utf-8"))
    daily = normalize_weather(payload, policy["weather_request"], features)
    rows = []
    for crop in calendar:
        window = {"wheat_sowing_date": crop["planting"], "wheat_harvest_date": crop["harvest"]}
        rows.append({**crop, "spatial_status": "study_area_proxy_annual_field_unassigned",
                     **prep.aggregate_weather(daily, window, features)})
    extent_end = policy["catalog_temporal_extent"].split("/")[1]
    findings = {"version": policy["version"], "daily_dates": len(daily), "parameter_count": len(features),
        "missing_values": 0, "wheat_seasons": len(rows), "models_fitted": False,
        "calendar_verified_against_management_workbook": True,
        "annual_field_assignment_verified": False, "exact_soil_sampling_dates_verified": False,
        "initial_to_spring_exact_weather_window_supported": False,
        "regional_wheat_season_weather_supported": True,
        "catalog_endpoint_minus_2011_wheat_sowing_days": (date.fromisoformat(extent_end) - date.fromisoformat(calendar[-1]["planting"])).days,
        "soil_timing_caution": "Catalog extent endpoint is not proof that every SPRING row was sampled on that day; no row-level ordering is inferred",
        "weather_geometry": payload["geometry"], "feature_definitions": features,
        "limitations": policy["restrictions"],
        "source_sha256": {**policy["pinned_sha256"], POLICY.relative_to(ROOT).as_posix(): policy_hash,
            WEATHER.relative_to(ROOT).as_posix(): prep.digest(WEATHER),
            metadata_path.relative_to(ROOT).as_posix(): prep.digest(metadata_path)},
        "verification_code_sha256": prep.digest(Path(__file__))}
    files = {"season_weather.csv": prep.csv_bytes(rows)}
    findings["output_sha256"] = {name: hashlib.sha256(value).hexdigest() for name, value in files.items()}
    files["verification.json"] = prep.json_bytes(findings)
    verify_pins(policy)
    if prep.digest(POLICY) != policy_hash:
        raise ValueError("Verification policy changed")
    prep.write_snapshot(files, OUTPUT)
    print(json.dumps({k: findings[k] for k in ("daily_dates", "missing_values", "wheat_seasons", "initial_to_spring_exact_weather_window_supported")}, indent=2))
    return findings


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Acquire missing NASA snapshot; otherwise fully offline")
    run(parser.parse_args().fetch)
