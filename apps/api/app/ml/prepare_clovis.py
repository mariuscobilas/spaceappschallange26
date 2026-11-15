"""Prepare Clovis labels and freeze splits. No weather downloads or model fitting.

Run from any directory: python apps/api/app/ml/prepare_clovis.py
The CSV reader uses the standard library; openpyxl reads the source activity log.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[4]
PROTOCOL = Path(__file__).with_name("clovis_protocol.json")
DAILY = ROOT / "data/figshare_yin_daily.csv"
ACTIVITY = ROOT / "data/figshare_yin_activity.xlsx"
OUTPUT = ROOT / "data/processed/clovis_v1"
OBS_FIELDS = [
    "site_id", "date", "partition", "treatment", "sensor_depth_cm",
    "soil_moisture_m3_m3", "target_eligible", "irrigation_mm", "management_phase",
    "cover_active", "days_since_cover_planting", "days_since_cover_termination",
    "quality_flags", "source_id", "source_column", "source_row",
]
PAIR_FIELDS = [
    "site_id", "date", "previous_date", "partition", "treatment", "sensor_depth_cm",
    "previous_moisture_m3_m3", "soil_moisture_m3_m3", "moisture_change_m3_m3",
    "irrigation_mm", "management_phase", "cover_active", "days_since_cover_planting",
    "days_since_cover_termination", "source_id",
]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def json_text(value: object) -> str:
    return json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n"


def days(start: date, end: date):
    while start <= end:
        yield start
        start += timedelta(days=1)


def load_protocol(path: Path = PROTOCOL) -> dict:
    protocol = json.loads(path.read_text(encoding="utf-8"))
    expected = set(days(date.fromisoformat(protocol["observation_start"]),
                        date.fromisoformat(protocol["observation_end"])))
    for key in ("partitions", "phases"):
        covered = []
        for interval in protocol[key]:
            covered.extend(days(date.fromisoformat(interval["start"]), date.fromisoformat(interval["end"])))
        if len(covered) != len(set(covered)) or set(covered) != expected:
            raise ValueError(f"Protocol {key} must cover every source date exactly once")
    if set(protocol["treatments"].values()) != {"fallow", "pea", "oat", "six_species_mix"}:
        raise ValueError("Unexpected treatment contract")
    return protocol


def interval_name(day: date, intervals: list[dict]) -> str:
    for interval in intervals:
        if date.fromisoformat(interval["start"]) <= day <= date.fromisoformat(interval["end"]):
            return interval["name"]
    raise ValueError(f"No interval for {day}")


def in_sensor_window(day: date, protocol: dict) -> bool:
    return any(date.fromisoformat(w["start"]) <= day <= date.fromisoformat(w["end"])
               for w in protocol["sensor_windows"])


def parse_moisture(raw: str | None, protocol: dict) -> tuple[float | None, list[str]]:
    value = (raw or "").strip()
    if value.upper() in protocol["rules"]["missing_tokens"]:
        return None, ["missing_moisture"]
    try:
        number = float(value)
    except ValueError:
        return None, ["non_numeric_moisture"]
    if not math.isfinite(number) or not (protocol["rules"]["moisture_min"] <= number
                                        <= protocol["rules"]["moisture_max"]):
        return None, ["invalid_moisture"]
    return number, []


def read_daily(path: Path, protocol: dict) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"Date", "Irr", *protocol["treatments"]}
        if not required <= set(reader.fieldnames or []):
            raise ValueError(f"Missing required daily columns: {sorted(required - set(reader.fieldnames or []))}")
        records = []
        seen = set()
        for line, row in enumerate(reader, start=2):
            day = datetime.strptime(row["Date"], "%m/%d/%Y").date()
            if day in seen:
                raise ValueError(f"Duplicate source date: {day}")
            seen.add(day)
            try:
                irrigation = float(row["Irr"])
            except (ValueError, TypeError) as error:
                raise ValueError(f"Missing/invalid irrigation at {day}") from error
            if not math.isfinite(irrigation) or irrigation < 0:
                raise ValueError(f"Invalid irrigation at {day}")
            records.append({"date": day, "row": row, "source_row": line,
                            "irrigation_mm": round(irrigation * protocol["rules"]["irrigation_multiplier"], 9)})
    expected = set(days(date.fromisoformat(protocol["observation_start"]),
                        date.fromisoformat(protocol["observation_end"])))
    if seen != expected:
        raise ValueError("Daily dates do not match the frozen protocol coverage")
    return sorted(records, key=lambda r: r["date"])


def read_activity(path: Path, protocol: dict) -> list[dict]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    events = []
    headings = []
    try:
        sheet = workbook["Sheet1"]
        for line, row in enumerate(sheet.iter_rows(values_only=True), start=1):
            day, irrigation, description = row[:3]
            if isinstance(day, datetime):
                day = day.date()
            if isinstance(day, date):
                if irrigation is not None and (not isinstance(irrigation, (float, int))
                                               or not math.isfinite(irrigation) or irrigation < 0):
                    raise ValueError(f"Invalid workbook irrigation at row {line}")
                events.append({"date": day.isoformat(), "irrigation_mm": (
                    round(irrigation * protocol["rules"]["irrigation_multiplier"], 9)
                    if irrigation is not None else None),
                    "activity": str(description or "").strip(), "source_sheet": "Sheet1", "source_row": line})
            elif isinstance(day, str):
                headings.append(day)
    finally:
        workbook.close()
    operations = {
        "cover_planting": "cover crop planting",
        "cover_termination": "cover crop termination",
        "wheat_planting": "planting of winter wheat",
    }
    for operation, text in operations.items():
        matches = [e for e in events if e["activity"].lower().startswith(text)]
        if len(matches) != 1 or matches[0]["date"] != protocol["operation_dates"][operation]:
            raise ValueError(f"Activity workbook disagrees with frozen {operation} date")
    # Require each documented sensor-phase boundary to remain visible in headings.
    for window in protocol["sensor_windows"]:
        for boundary in (window["start"], window["end"]):
            day = date.fromisoformat(boundary)
            marker = f"{day.month}/{day.day}/{day.year}"
            if not any(marker in heading for heading in headings):
                raise ValueError(f"Sensor-window boundary {boundary} not found in workbook headings")
    return events


def check_irrigation(records: list[dict], events: list[dict]) -> dict:
    recorded = {r["date"].isoformat(): r["irrigation_mm"] for r in records}
    logged = defaultdict(float)
    outside = []
    for event in events:
        if event["irrigation_mm"] is not None:
            if event["date"] in recorded:
                logged[event["date"]] += event["irrigation_mm"]
            else:
                outside.append(event["date"])
    for day, amount in recorded.items():
        if not math.isclose(amount, logged.get(day, 0.0), abs_tol=1e-6):
            raise ValueError(f"Daily/workbook irrigation mismatch at {day}: {amount} vs {logged.get(day, 0)} mm")
    return {"status": "passed", "events_in_coverage": len(logged),
            "event_dates_outside_coverage": sorted(set(outside)),
            "total_irrigation_mm": round(sum(recorded.values()), 6)}


def normalize(records: list[dict], protocol: dict) -> list[dict]:
    result = []
    planting = date.fromisoformat(protocol["operation_dates"]["cover_planting"])
    termination = date.fromisoformat(protocol["operation_dates"]["cover_termination"])
    for record in records:
        day = record["date"]
        for column, treatment in protocol["treatments"].items():
            moisture, flags = parse_moisture(record["row"][column], protocol)
            if not in_sensor_window(day, protocol):
                flags.append("outside_documented_sensor_window")
            cover = treatment != "fallow"
            result.append({
                "site_id": protocol["site"]["site_id"], "date": day.isoformat(),
                "partition": interval_name(day, protocol["partitions"]), "treatment": treatment,
                "sensor_depth_cm": protocol["site"]["sensor_depth_cm"],
                "soil_moisture_m3_m3": moisture, "target_eligible": not flags,
                "irrigation_mm": record["irrigation_mm"],
                "management_phase": interval_name(day, protocol["phases"]),
                "cover_active": cover and planting <= day < termination,
                "days_since_cover_planting": (day - planting).days if cover and day >= planting else None,
                "days_since_cover_termination": (day - termination).days if cover and day >= termination else None,
                "quality_flags": "|".join(flags), "source_id": protocol["source_ids"]["daily"],
                "source_column": column, "source_row": record["source_row"],
            })
    return result


def make_pairs(observations: list[dict]) -> tuple[list[dict], dict]:
    by_key = {(r["date"], r["treatment"]): r for r in observations}
    pairs = []
    excluded = Counter()
    for row in observations:
        if row["partition"] == "gap":
            excluded["purge_gap"] += 1
            continue
        previous_date = (date.fromisoformat(row["date"]) - timedelta(days=1)).isoformat()
        previous = by_key.get((previous_date, row["treatment"]))
        if previous is None:
            excluded["no_previous_calendar_day"] += 1
        elif row["partition"] != previous["partition"]:
            excluded["partition_boundary"] += 1
        elif not row["target_eligible"] or not previous["target_eligible"]:
            excluded["invalid_or_unobserved_endpoint"] += 1
        else:
            pair = {key: row[key] for key in PAIR_FIELDS if key in row}
            pair.update(previous_date=previous_date,
                        previous_moisture_m3_m3=previous["soil_moisture_m3_m3"],
                        moisture_change_m3_m3=round(row["soil_moisture_m3_m3"]
                                                  - previous["soil_moisture_m3_m3"], 12))
            pairs.append(pair)
    return pairs, dict(sorted(excluded.items()))


def csv_text(rows: list[dict], fields: list[str]) -> str:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n", extrasaction="raise")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: int(v) if isinstance(v, bool) else v for k, v in row.items()})
    return stream.getvalue()


def prepare(output: Path = OUTPUT) -> dict:
    protocol = load_protocol()
    input_hashes = {relative(p): digest(p) for p in (DAILY, ACTIVITY, PROTOCOL)}
    # The partition manifest is assembled before reading moisture values.
    split = {
        "protocol_version": protocol["protocol_version"], "input_sha256": input_hashes,
        "assignment_unit": "date; all treatments share the same partition",
        "partitions": protocol["partitions"],
        "pair_policy": "Both consecutive-day endpoints must be eligible and in the same non-gap partition.",
        "test_policy": "Do not use validation/test targets to fit preprocessing or tune on final test results.",
    }
    existing = output / "split_manifest.json"
    if existing.exists() and json.loads(existing.read_text(encoding="utf-8")) != split:
        raise ValueError("Frozen input hashes or split changed. Use a NEW versioned --output directory.")

    records = read_daily(DAILY, protocol)
    events = read_activity(ACTIVITY, protocol)
    irrigation_check = check_irrigation(records, events)
    observations = normalize(records, protocol)
    pairs, excluded = make_pairs(observations)
    if not pairs or any(not any(r["partition"] == part for r in pairs)
                        for part in ("train", "validation", "test")):
        raise ValueError("One or more required partitions have no eligible pairs")

    files = []
    candidates = [
        (DAILY, "primary_moisture_and_irrigation"), (ACTIVITY, "primary_management_log"),
        (ROOT / "5min.csv", "reference_only_not_used"),
        (ROOT / "5minSoilT.csv", "reference_only_not_used"),
        (ROOT / "5minWeather.csv", "reference_only_not_used"),
        (ROOT / "data/dryad_eash_2025/Cover_Crop_Trials_Data.xlsx", "separate_wheat_evidence_not_pooled"),
    ]
    for path, role in candidates:
        entry = {"path": relative(path), "role": role, "available": path.is_file()}
        if path.is_file():
            entry.update(bytes=path.stat().st_size, sha256=digest(path))
        files.append(entry)
    duplicates = []
    for original, copy in ((DAILY, ROOT / "daily.csv"),
                           (ACTIVITY, ROOT / "W14_Irrigation+fied activity7312025 (1).xlsx")):
        if copy.is_file():
            duplicates.append({"canonical": relative(original), "copy": relative(copy),
                               "identical": digest(original) == digest(copy)})
    sources = {
        "protocol_version": protocol["protocol_version"], "site": protocol["site"],
        "source_ids": protocol["source_ids"], "files": files, "duplicate_checks": duplicates,
        "excluded_channels": {"PO": "Reported sensor malfunction", "30cm": "Not validated for this MVP"},
        "nasa_weather": {"status": "not_fetched", "reason": "Separate next task"},
        "redistribution_license": "Not independently verified here; retain source attribution and check before redistribution.",
    }
    partitions = {}
    for part in ("train", "validation", "test", "gap"):
        subset = [r for r in observations if r["partition"] == part]
        part_pairs = [r for r in pairs if r["partition"] == part]
        partitions[part] = {
            "dates": len({r["date"] for r in subset}), "rows": len(subset),
            "eligible_observations": sum(r["target_eligible"] for r in subset),
            "eligible_pairs": len(part_pairs),
            "pairs_by_treatment": dict(sorted(Counter(r["treatment"] for r in part_pairs).items())),
            "pairs_by_phase": dict(sorted(Counter(r["management_phase"] for r in part_pairs).items())),
        }
    report = {
        "protocol_version": protocol["protocol_version"],
        "preparation_script_sha256": digest(Path(__file__)),
        "source_dates": len(records), "duplicate_dates": 0,
        "observation_rows": len(observations), "pair_rows": len(pairs),
        "flags": dict(sorted(Counter(flag for r in observations
                                     for flag in r["quality_flags"].split("|") if flag).items())),
        "excluded_pairs_by_primary_reason": excluded,
        "partitions": partitions, "irrigation_check": irrigation_check,
        "checks": {"source_coverage": "passed", "date_grouped_split": "passed",
                   "same_partition_pair_endpoints": "passed", "operation_date_agreement": "passed",
                   "sensor_window_heading_agreement": "passed", "no_fitted_preprocessing": "passed"},
        "limitations": [
            "Only one site and one cover-crop season; plot-days are correlated observations.",
            "5 cm volumetric moisture is not rooting-profile plant-available water.",
            "Known operation gaps are excluded; the release has no per-value original/interpolated provenance.",
            "Final test includes management phases absent from the initial training window; report phase metrics separately.",
            "No target-distribution summaries or fitted statistics are calculated from held-out partitions.",
            "Time-zone alignment and NASA weather availability remain to be checked in the next task.",
        ],
    }
    lines = ["# Clovis data-preparation quality report", "",
             f"Protocol: `{protocol['protocol_version']}`. No weather download or model fitting performed.", "",
             f"Source: {len(records)} dates; {len(observations)} treatment-day rows; {len(pairs)} eligible one-day pairs.", "",
             "| Partition | Dates | Rows | Eligible readings | Eligible pairs |",
             "| --- | ---: | ---: | ---: | ---: |"]
    for part, stats in partitions.items():
        lines.append(f"| {part} | {stats['dates']} | {stats['rows']} | {stats['eligible_observations']} | {stats['eligible_pairs']} |")
    lines.extend(["", "## Flags (can overlap)", ""])
    lines.extend(f"- `{name}`: {count}" for name, count in report["flags"].items())
    lines.extend(["", "## Verification", "", "All source/calendar/split checks passed.",
                  f"Irrigation agrees with the activity workbook: {irrigation_check['events_in_coverage']} events, "
                  f"{irrigation_check['total_irrigation_mm']} mm over the source period.",
                  "", "## Limits and next step", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    lines.extend(["", "Next task: fetch and validate NASA daily weather. These pairs are labels, not a trained model.", ""])
    artifacts = {
        "source_manifest.json": json_text(sources), "split_manifest.json": json_text(split),
        "daily_observations.csv": csv_text(observations, OBS_FIELDS),
        **{f"{part}_pairs.csv": csv_text([r for r in pairs if r["partition"] == part], PAIR_FIELDS)
           for part in ("train", "validation", "test")},
        "activity_events.csv": csv_text(events, ["date", "irrigation_mm", "activity", "source_sheet", "source_row"]),
        "quality_report.json": json_text(report), "quality_report.md": "\n".join(lines),
    }
    # Complete all validation/serialization before publishing any artifacts.
    output.mkdir(parents=True, exist_ok=True)
    for name, content in artifacts.items():
        temporary = output / (name + ".tmp")
        temporary.write_text(content, encoding="utf-8", newline="\n")
        temporary.replace(output / name)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT,
                        help="Generated directory; changed inputs/protocol require a new versioned directory")
    args = parser.parse_args()
    try:
        report = prepare(args.output.resolve())
    except (ValueError, FileNotFoundError, KeyError) as error:
        parser.exit(1, f"Preparation failed: {error}\n")
    print(json.dumps({"output": str(args.output.resolve()), "source_dates": report["source_dates"],
                      "observation_rows": report["observation_rows"], "eligible_pairs": report["pair_rows"],
                      "pairs_by_partition": {k: v["eligible_pairs"] for k, v in report["partitions"].items()}}, indent=2))


if __name__ == "__main__":
    main()
