"""Cache NASA POWER weather and join it to frozen Clovis labels; no model fitting.

First run with --fetch. Subsequent runs are offline and reuse verified caches.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

import prepare_clovis as prep

ROOT = prep.ROOT
LABELS = prep.OUTPUT
CACHE = ROOT / "data/weather/nasa_power/clovis_v1"
OUTPUT = ROOT / "data/processed/clovis_weather_v1"
API = "https://power.larc.nasa.gov/api/temporal/daily/point"
START = date(2001, 1, 1)
END = date(2025, 12, 31)
PARAMETERS = {
    "PRECTOTCORR": ("rain_mm", "mm/day"),
    "T2M_MAX": ("temperature_max_c", "C"),
    "T2M_MIN": ("temperature_min_c", "C"),
    "RH2M": ("humidity_pct", "%"),
    "WS2M": ("wind_speed_m_s", "m/s"),
    "ALLSKY_SFC_SW_DWN": ("solar_radiation_mj_m2_day", "MJ/m^2/day"),
}
WEATHER_FIELDS = ["date", *[v[0] for v in PARAMETERS.values()], "weather_eligible", "quality_flags"]
JOIN_FIELDS = [*prep.PAIR_FIELDS, *[v[0] for v in PARAMETERS.values()],
               "weather_source", "weather_time_standard"]


def request_parameters(site: dict, start: date, end: date) -> dict:
    return {"parameters": ",".join(PARAMETERS), "community": "AG",
            "longitude": site["longitude"], "latitude": site["latitude"],
            "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"),
            "format": "JSON", "time-standard": "LST"}


def payload_hash(payload: dict) -> str:
    return hashlib.sha256(prep.json_text(payload).encode("utf-8")).hexdigest()


def write_text(path: Path, text: str) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    temporary.replace(path)


def unit_multiplier(parameter: str, unit: str) -> float:
    normalized = unit.strip().lower().replace(" ", "").replace("²", "^2")
    if parameter == "ALLSKY_SFC_SW_DWN":
        if normalized in {"kw-hr/m^2/day", "kwh/m^2/day", "kwhr/m^2/day"}:
            return 3.6
        if normalized == "mj/m^2/day":
            return 1.0
    expected = PARAMETERS[parameter][1].lower()
    if parameter != "ALLSKY_SFC_SW_DWN" and normalized == expected:
        return 1.0
    raise ValueError(f"Unsupported NASA unit for {parameter}: {unit!r}")


def normalize_payload(payload: dict, request: dict) -> tuple[list[dict], dict]:
    header = payload["header"]
    if header.get("time_standard") != request["time-standard"]:
        raise ValueError("NASA time standard does not match the requested LST calendar")
    coordinates = payload["geometry"]["coordinates"]
    if not (math.isclose(float(coordinates[0]), request["longitude"], abs_tol=0.001)
            and math.isclose(float(coordinates[1]), request["latitude"], abs_tol=0.001)):
        raise ValueError("NASA response location does not match Clovis")
    start = datetime.strptime(request["start"], "%Y%m%d").date()
    end = datetime.strptime(request["end"], "%Y%m%d").date()
    expected_dates = {d.strftime("%Y%m%d") for d in prep.days(start, end)}
    series = payload["properties"]["parameter"]
    conversions = {}
    for parameter, (column, canonical_unit) in PARAMETERS.items():
        if parameter not in series or set(series[parameter]) != expected_dates:
            raise ValueError(f"NASA date coverage mismatch for {parameter}")
        unit = payload["parameters"][parameter]["units"]
        conversions[parameter] = {"column": column, "source_unit": unit,
                                  "output_unit": canonical_unit,
                                  "multiplier": unit_multiplier(parameter, unit)}
    fill_value = float(header.get("fill_value", -999))
    rows = []
    for key in sorted(expected_dates):
        row = {"date": datetime.strptime(key, "%Y%m%d").date().isoformat()}
        flags = []
        for parameter, conversion in conversions.items():
            raw = series[parameter][key]
            try:
                value = float(raw)
            except (ValueError, TypeError):
                value = math.nan
            column = conversion["column"]
            if not math.isfinite(value) or value == fill_value or value <= -900:
                flags.append(f"missing:{column}")
                row[column] = None
                continue
            value *= conversion["multiplier"]
            invalid = ((column in {"rain_mm", "wind_speed_m_s", "solar_radiation_mj_m2_day"} and value < 0)
                       or (column == "humidity_pct" and not 0 <= value <= 100)
                       or (column in {"temperature_min_c", "temperature_max_c"} and not -100 <= value <= 70))
            if invalid:
                flags.append(f"invalid:{column}")
                row[column] = None
            else:
                row[column] = round(value, 9)
        if (row["temperature_min_c"] is not None and row["temperature_max_c"] is not None
                and row["temperature_min_c"] > row["temperature_max_c"]):
            flags.append("invalid:temperature_order")
        row.update(weather_eligible=not flags, quality_flags="|".join(flags))
        rows.append(row)
    return rows, {"header": header, "geometry": payload["geometry"], "conversions": conversions,
                  "messages": payload.get("messages", [])}


def load_block(site: dict, start: date, end: date, cache: Path, fetch: bool) -> tuple[list[dict], dict]:
    request = request_parameters(site, start, end)
    path = cache / f"clovis_{start.year}_{end.year}_lst.json"
    if path.exists():
        envelope = json.loads(path.read_text(encoding="utf-8"))
        if envelope["request"] != request or envelope["payload_sha256"] != payload_hash(envelope["payload"]):
            raise ValueError(f"Cache request/hash mismatch: {path}")
    else:
        if not fetch:
            raise FileNotFoundError(f"Missing weather cache: {path}; run with --fetch")
        url = API + "?" + urllib.parse.urlencode(request)
        print(f"Fetching NASA POWER {start.year}-{end.year}...", flush=True)
        for attempt in range(3):
            try:
                http_request = urllib.request.Request(url, headers={"User-Agent": "FieldShift-Clovis-MVP/1.0"})
                with urllib.request.urlopen(http_request, timeout=40) as response:
                    payload = json.load(response)
                break
            except (urllib.error.URLError, TimeoutError) as error:
                if attempt == 2:
                    raise RuntimeError(f"NASA download failed for {start.year}-{end.year}: {error}") from error
                time.sleep(2 ** attempt)
        normalize_payload(payload, request)
        envelope = {"request": request, "url": url, "payload": payload,
                    "payload_sha256": payload_hash(payload),
                    "fetched_at_utc": datetime.now(timezone.utc).isoformat()}
        cache.mkdir(parents=True, exist_ok=True)
        write_text(path, prep.json_text(envelope))
    rows, metadata = normalize_payload(envelope["payload"], request)
    return rows, {"cache_file": path.name, "cache_sha256": prep.digest(path),
                  "request": request, "url": envelope["url"],
                  "fetched_at_utc": envelope["fetched_at_utc"], **metadata}


def verify_labels(labels: Path, protocol: dict) -> dict:
    manifest = json.loads((labels / "split_manifest.json").read_text(encoding="utf-8"))
    if manifest["partitions"] != protocol["partitions"]:
        raise ValueError("Prepared labels disagree with frozen partition policy")
    for name, expected_hash in manifest["input_sha256"].items():
        if prep.digest(ROOT / name) != expected_hash:
            raise ValueError(f"Frozen source/protocol hash changed: {name}")
    return manifest


def join_pairs(pairs: list[dict], weather: list[dict], partition: str, protocol: dict) -> list[dict]:
    lookup = {}
    for row in weather:
        if row["date"] in lookup:
            raise ValueError(f"Duplicate NASA weather date: {row['date']}")
        lookup[row["date"]] = row
    result = []
    seen = set()
    for pair in pairs:
        key = (pair["date"], pair["treatment"])
        if key in seen:
            raise ValueError(f"Duplicate moisture pair: {key}")
        seen.add(key)
        current = date.fromisoformat(pair["date"])
        previous = date.fromisoformat(pair["previous_date"])
        if (pair["partition"] != partition or pair["site_id"] != protocol["site"]["site_id"]
                or (current - previous).days != 1
                or prep.interval_name(current, protocol["partitions"]) != partition
                or prep.interval_name(previous, protocol["partitions"]) != partition):
            raise ValueError(f"Invalid pair/site/partition boundary: {key}")
        day_weather = lookup.get(pair["date"])
        if day_weather is None or not day_weather["weather_eligible"]:
            raise ValueError(f"Missing or invalid target-day weather for {key}; no rows silently dropped")
        result.append({**pair, **{v[0]: day_weather[v[0]] for v in PARAMETERS.values()},
                       "weather_source": "NASA_POWER_DAILY", "weather_time_standard": "LST"})
    return result


def prepare(cache: Path = CACHE, output: Path = OUTPUT, labels: Path = LABELS, fetch: bool = False) -> dict:
    protocol = prep.load_protocol()
    verify_labels(labels, protocol)
    source_files = ["split_manifest.json", "train_pairs.csv", "validation_pairs.csv", "test_pairs.csv"]
    label_hashes = {name: prep.digest(labels / name) for name in source_files}
    report_source = json.loads((labels / "quality_report.json").read_text(encoding="utf-8"))
    weather = []
    blocks = []
    for year in range(START.year, END.year + 1, 5):
        block, metadata = load_block(protocol["site"], date(year, 1, 1), date(min(year + 4, END.year), 12, 31), cache, fetch)
        weather.extend(block)
        blocks.append(metadata)
    if {r["date"] for r in weather} != {d.isoformat() for d in prep.days(START, END)}:
        raise ValueError("Combined historical weather has incomplete date coverage")
    joined = {}
    for partition in ("train", "validation", "test"):
        with (labels / f"{partition}_pairs.csv").open(encoding="utf-8", newline="") as stream:
            pairs = list(csv.DictReader(stream))
        expected = report_source["partitions"][partition]["eligible_pairs"]
        if len(pairs) != expected:
            raise ValueError(f"Prepared {partition} row count differs from task-1 quality report")
        joined[partition] = join_pairs(pairs, weather, partition, protocol)
    manifest = {
        "weather_version": "clovis-power-v1", "protocol_version": protocol["protocol_version"],
        "site": protocol["site"], "start_date": START.isoformat(), "end_date": END.isoformat(),
        "time_standard": "LST", "source": "NASA POWER daily point API", "blocks": blocks,
        "input_label_sha256": label_hashes,
        "calendar_alignment": "Same source date joined to NASA LST date without shifting. Station time zone is undocumented; alignment is an MVP assumption, not independently verified.",
        "weather_join_date": "Target day: prior end-of-day moisture + this day's weather predicts this day's moisture change.",
    }
    manifest_path = output / "weather_manifest.json"
    if manifest_path.exists() and json.loads(manifest_path.read_text(encoding="utf-8")) != manifest:
        raise ValueError("Frozen weather or label inputs changed; use a new versioned output directory")
    report = {
        "weather_version": "clovis-power-v1", "weather_days": len(weather),
        "eligible_weather_days": sum(r["weather_eligible"] for r in weather),
        "weather_flags": dict(sorted(Counter(flag for row in weather
                                             for flag in row["quality_flags"].split("|") if flag).items())),
        "joined_rows": {part: len(rows) for part, rows in joined.items()}, "rows_dropped": 0,
        "split_manifest_unchanged": prep.digest(labels / "split_manifest.json") == label_hashes["split_manifest.json"],
        "checks": {"source_hashes": "passed", "parameter_units": "passed", "location": "passed",
                   "daily_coverage": "passed", "target_day_join": "passed", "partition_boundaries": "passed"},
        "training_script_sha256": prep.digest(Path(__file__)),
        "limitations": ["Weather is gridded, not the study's on-site sensor readings.",
                        "Station civil-day versus NASA local-solar-day alignment remains an explicit assumption.",
                        "Current-day observed weather is a hindcast input; future runs must use scenario weather.",
                        "No model fitting, statistical feature selection, or held-out target analysis was performed."],
    }
    schema = {
        "categorical_inputs": ["treatment", "management_phase"],
        "numeric_inputs": ["previous_moisture_m3_m3", "irrigation_mm", "cover_active",
                           "days_since_cover_planting", "days_since_cover_termination",
                           *[v[0] for v in PARAMETERS.values()]],
        "target": "moisture_change_m3_m3",
        "evaluation_only_columns": ["soil_moisture_m3_m3"],
        "metadata_only_columns": ["site_id", "date", "previous_date", "partition", "sensor_depth_cm",
                                  "source_id", "weather_source", "weather_time_standard"],
        "units": {**{v[0]: v[1] for v in PARAMETERS.values()}, "irrigation_mm": "mm/day",
                  "previous_moisture_m3_m3": "m3/m3", "moisture_change_m3_m3": "m3/m3 per one-day step"},
        "missing_value_policy": "No weather imputation; nullable management ages mean not-yet-applicable and need explicit handling in the later training/serving pipeline.",
        "seasonal_features": "Derive from date with shared training/serving code in the model task; not fitted here.",
    }
    lines = ["# Clovis task 2: NASA weather join", "",
             f"Weather: {len(weather)} daily records, {START} through {END}, local solar time (LST).", "",
             "| Partition | Joined pairs | Dropped |", "| --- | ---: | ---: |"]
    lines.extend(f"| {part} | {len(rows)} | 0 |" for part, rows in joined.items())
    lines.extend(["", f"Eligible historical weather days: {report['eligible_weather_days']}/{len(weather)}.",
                  "", "All six parameters have validated units. Frozen label sources and partition boundaries are unchanged.",
                  "", "## Limits", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    artifacts = {
        "weather_daily.csv": prep.csv_text(weather, WEATHER_FIELDS),
        **{f"{part}_features.csv": prep.csv_text(rows, JOIN_FIELDS) for part, rows in joined.items()},
        "weather_manifest.json": prep.json_text(manifest), "feature_schema.json": prep.json_text(schema),
        "quality_report.json": prep.json_text(report), "quality_report.md": "\n".join(lines) + "\n",
    }
    output.mkdir(parents=True, exist_ok=True)
    for name, content in artifacts.items():
        write_text(output / name, content)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Download only missing historical blocks")
    parser.add_argument("--cache-dir", type=Path, default=CACHE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--labels-dir", type=Path, default=LABELS)
    args = parser.parse_args()
    try:
        report = prepare(args.cache_dir.resolve(), args.output.resolve(), args.labels_dir.resolve(), args.fetch)
    except (ValueError, KeyError, FileNotFoundError, RuntimeError) as error:
        parser.exit(1, f"Weather preparation failed: {error}\n")
    print(json.dumps({"output": str(args.output.resolve()), "weather_days": report["weather_days"],
                      "eligible_weather_days": report["eligible_weather_days"], "joined_rows": report["joined_rows"],
                      "rows_dropped": report["rows_dropped"]}, indent=2))


if __name__ == "__main__":
    main()
