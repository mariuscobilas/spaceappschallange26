"""Offline, hash-pinned Colorado water/yield preparation. No model fitting."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import platform
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PROTOCOL = Path(__file__).with_name("water_yield_protocol_v1.json")
OUTPUT = ROOT / "data/processed/water_yield_v1"


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode()


def csv_bytes(rows):
    if not rows:
        raise ValueError("Cannot export an empty research table")
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def read_csv(path):
    with Path(path).open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def verify_sources(protocol, root=ROOT):
    for name, expected in protocol["source_sha256"].items():
        if digest(root / name) != expected:
            raise ValueError(f"Source hash mismatch: {name}")


def days(start, end):
    current = date.fromisoformat(start)
    final = date.fromisoformat(end)
    if final < current:
        raise ValueError("Reversed calendar")
    while current <= final:
        yield current.strftime("%Y%m%d")
        current += timedelta(days=1)


def normalize_weather(payload, request, features):
    header = payload["header"]
    coords = payload["geometry"]["coordinates"]
    if (header["time_standard"] != "LST" or request["time-standard"] != "LST"
            or abs(coords[0] - request["longitude"]) > 0.001
            or abs(coords[1] - request["latitude"]) > 0.001
            or request["latitude"] != 37.533333 or request["longitude"] != -108.733333
            or header["start"] != request["start"] or header["end"] != request["end"]):
        raise ValueError("Weather site/time metadata mismatch")
    start = date.strptime(request["start"], "%Y%m%d") if hasattr(date, "strptime") else date.fromisoformat(request["start"])
    end = date.fromisoformat(request["end"])
    expected = set(days(start.isoformat(), end.isoformat()))
    parameters = payload["properties"]["parameter"]
    names = {f["parameter"] for f in features}
    if set(parameters) != names or set(request["parameters"].split(",")) != names:
        raise ValueError("Unexpected NASA parameters")
    rows = {day: {} for day in sorted(expected)}
    for feature in features:
        name = feature["parameter"]
        values = parameters[name]
        if payload["parameters"][name]["units"] != feature["source_unit"]:
            raise ValueError(f"Unexpected unit for {name}; no implicit conversion")
        if set(values) != expected:
            raise ValueError(f"Missing or extra weather dates: {name}")
        for day in sorted(expected):
            value = values[day]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value == header["fill_value"]:
                raise ValueError(f"Missing/nonfinite weather {name} {day}")
            if ((name in {"PRECTOTCORR", "WS2M", "ALLSKY_SFC_SW_DWN"} and value < 0)
                    or (name == "RH2M" and not 0 <= value <= 100)):
                raise ValueError(f"Invalid weather range {name} {day}")
            rows[day][name] = value
    if any(r["T2M_MIN"] > r["T2M_MAX"] for r in rows.values()):
        raise ValueError("Minimum temperature exceeds maximum")
    return rows


def aggregate_weather(daily, calendar, features):
    keys = list(days(calendar["wheat_sowing_date"], calendar["wheat_harvest_date"]))
    if not all(key in daily for key in keys):
        raise ValueError("Incomplete crop-season weather")
    output = {"weather_days": len(keys)}
    for feature in features:
        total = math.fsum(daily[key][feature["parameter"]] for key in keys)
        if feature["aggregation"] not in {"sum", "mean"}:
            raise ValueError("Undeclared aggregation")
        output[feature["feature"]] = total if feature["aggregation"] == "sum" else total / len(keys)
    return output


def observation_id(row):
    return f"{row['plot']}/C{row['cycle']}"


def number(value):
    if value == "":
        return None
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError("Outcome/input must be finite and nonnegative; missing stays missing")
    return result


def matched_pairs(observations, protocol):
    controls = {}
    key = lambda row: tuple(row[k] for k in ("trial", "block", "tillage", "cycle"))
    for row in observations:
        if row["cover_mix"] == "Fallow":
            if key(row) in controls:
                raise ValueError("Ambiguous fallow control")
            controls[key(row)] = row
    pairs = []
    for cover in observations:
        if cover["cover_mix"] == "Fallow" or key(cover) not in controls:
            continue
        control = controls[key(cover)]
        pair = {"pair_id": cover["observation_id"], "control_id": control["observation_id"],
                "season_id": cover["season_id"], "trial": cover["trial"], "block": cover["block"],
                "tillage": cover["tillage"], "cycle": cover["cycle"],
                "planting_window": cover["planting_window"], "cover_mix": cover["cover_mix"]}
        for name in (protocol["water"], protocol["target"]):
            pair[name] = cover[name]
            pair[name + "_fallow"] = control[name]
            pair["cover_minus_fallow_" + name] = cover[name] - control[name]
        pairs.append(pair)
    audit = {observation_id(r): r for r in read_csv(ROOT / protocol["audit_pairs_path"])}
    if set(audit) != {r["pair_id"] for r in pairs}:
        raise ValueError("Matched cohort differs from source audit")
    for pair in pairs:
        for field in ("profile_water_at_wheat_sowing_mm_fallow", "wheat_yield_t_ha_fallow"):
            if not math.isclose(pair[field], float(audit[pair["pair_id"]][field]), abs_tol=1e-9):
                raise ValueError("Fallow match differs from audited value")
    return pairs


def make_folds(cohorts, seasons):
    rows = []
    for cohort, items in cohorts.items():
        for held_out in seasons:
            for item in items:
                rows.append({"cohort": cohort, "held_out_season": held_out,
                             "item_id": item.get("observation_id", item.get("pair_id")),
                             "season_id": item["season_id"],
                             "role": "evaluation" if item["season_id"] == held_out else "train"})
    return rows


def build_snapshot(protocol_path=PROTOCOL):
    protocol_path = Path(protocol_path)
    protocol_hash = digest(protocol_path)
    protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
    verify_sources(protocol)
    calendars = json.loads((ROOT / protocol["calendar_path"]).read_text(encoding="utf-8"))["records"]
    calendar = {(r["trial"], str(r["cycle"])): r for r in calendars}
    if len(calendar) != 6:
        raise ValueError("Unexpected calendar groups")
    daily = {}
    for name in protocol["weather_paths"]:
        path = ROOT / name
        source = json.loads(path.with_suffix(".source.json").read_text(encoding="utf-8"))
        if source["sha256"] != digest(path):
            raise ValueError("Weather provenance checksum mismatch")
        part = normalize_weather(json.loads(path.read_text(encoding="utf-8")), source["request"], protocol["weather_features"])
        if set(part) & set(daily):
            raise ValueError("Overlapping NASA snapshots")
        daily.update(part)
    weather = {}
    for c in calendars:
        if c["include_if_joint_labels"]:
            weather[c["season_id"]] = {"season_id": c["season_id"], "trial": c["trial"], "cycle": c["cycle"],
                "wheat_sowing_date": c["wheat_sowing_date"], "wheat_harvest_date": c["wheat_harvest_date"],
                **aggregate_weather(daily, c, protocol["weather_features"])}
    if set(weather) != set(protocol["folds"]):
        raise ValueError("Calendar seasons differ from declared folds")
    source_rows = read_csv(ROOT / protocol["observation_path"])
    observations, exclusions, seen = [], [], set()
    for raw in source_rows:
        identity = observation_id(raw)
        if identity in seen:
            raise ValueError("Duplicate plot-cycle")
        seen.add(identity)
        c = calendar[(raw["trial"], raw["cycle"])]
        values = {field: number(raw[field]) for field in (protocol["water"], protocol["target"], protocol["nitrate"])}
        reasons = ["missing_" + field for field in (protocol["water"], protocol["target"]) if values[field] is None]
        if not c["include_if_joint_labels"]:
            reasons.append(c["calendar_status"])
        if reasons:
            exclusions.append({"observation_id": identity, "trial": raw["trial"], "cycle": raw["cycle"], "reasons": ";".join(reasons)})
            continue
        row = {"observation_id": identity, "season_id": c["season_id"],
               **{k: raw[k] for k in ("trial", "plot", "block", "tillage", "planting_window", "cover_mix", "cycle")},
               **values, "water_definition": raw["water_definition"], "calendar_status": c["calendar_status"]}
        row.update({k: v for k, v in weather[c["season_id"]].items() if k not in {"trial", "cycle", "season_id"}})
        observations.append(row)
    observations.sort(key=lambda r: r["observation_id"])
    nitrate = [r for r in observations if r[protocol["nitrate"]] is not None]
    pairs = matched_pairs(observations, protocol)
    counts = {"source": len(source_rows), "main": len(observations), "nitrate_common": len(nitrate),
              "paired": len(pairs), "controls": len({r["control_id"] for r in pairs}), "seasons": len(weather)}
    if counts != protocol["expected_counts"]:
        raise ValueError(f"Cohort counts differ: {counts}")
    features = [f["feature"] for f in protocol["weather_features"]]
    families = {"mean": [], "water": [protocol["water"]], "weather": features,
                "water_weather": [protocol["water"], *features],
                "water_weather_nitrate": [protocol["water"], *features, protocol["nitrate"]]}
    files = {"observations.csv": csv_bytes(observations), "exclusions.csv": csv_bytes(exclusions),
             "paired_observations.csv": csv_bytes(pairs),
             "season_weather.csv": csv_bytes([weather[k] for k in sorted(weather)]),
             "fold_memberships.csv": csv_bytes(make_folds({"main": observations, "nitrate_common": nitrate, "paired": pairs}, protocol["folds"])),
             "feature_schema.json": json_bytes({"families": families, "target": protocol["target"],
                 "weather_definitions": protocol["weather_features"], "metadata_are_not_predictors": True})}
    verify_sources(protocol)
    if digest(protocol_path) != protocol_hash:
        raise ValueError("Protocol changed during preparation")
    files["manifest.json"] = json_bytes({"version": protocol["version"], "counts": counts,
        "season_counts": dict(sorted(Counter(r["season_id"] for r in observations).items())),
        "source_sha256": protocol["source_sha256"], "protocol_sha256": protocol_hash,
        "preparation_code_sha256": digest(Path(__file__)), "python": platform.python_version(),
        "weather_daily_dates": len(daily), "models_fitted": False, "farmer_ready": False,
        "output_sha256": {name: hashlib.sha256(value).hexdigest() for name, value in files.items()}})
    return files


def write_snapshot(files, output):
    output = Path(output)
    # Check every conflict before writing anything. Replays must be byte-identical.
    for name, value in files.items():
        path = output / name
        if path.exists() and path.read_bytes() != value:
            raise ValueError(f"Frozen output differs: {path}; use a new version")
    if output.exists() and set(p.name for p in output.iterdir()) - set(files):
        raise ValueError("Unexpected files in snapshot directory")
    output.mkdir(parents=True, exist_ok=True)
    for name, value in files.items():
        path = output / name
        if not path.exists():
            with path.open("xb") as stream:
                stream.write(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.parent != OUTPUT.parent.resolve() or not output.name.startswith("water_yield_"):
        raise ValueError("Output must be a separate data/processed/water_yield_* directory")
    files = build_snapshot()
    write_snapshot(files, output)
    print(json.dumps(json.loads(files["manifest.json"])["counts"], sort_keys=True))
    print(f"Prepared {output}; no model fitting")


if __name__ == "__main__":
    main()
