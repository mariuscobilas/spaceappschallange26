"""Prepare the frozen Mandan weather-ablation cohorts without fitting."""
from __future__ import annotations

import hashlib
import json
import platform
from pathlib import Path

import prepare_water_yield as io

ROOT = io.ROOT
PROTOCOL = Path(__file__).with_name("mandan_weather_protocol_v1.json")
OUTPUT = ROOT / "data/processed/mandan_weather_ablation_v1"
BASE = ROOT / "data/processed/mandan_linkage_v1"
WEATHER = ROOT / "data/analysis/mandan_weather_v1/season_weather.csv"


def build_snapshot() -> dict[str, bytes]:
    protocol_bytes = PROTOCOL.read_bytes()
    protocol = json.loads(protocol_bytes)
    io.verify_sources({"source_sha256": protocol["pinned_sha256"]})
    season_rows = io.read_csv(WEATHER)
    weather = {int(row["year"]): row for row in season_rows}
    if set(weather) != {2009, 2010, 2011}:
        raise ValueError("Weather years differ from frozen protocol")
    features = protocol["weather_features"]
    cohorts, memberships = {}, []
    for task_name, spec in protocol["tasks"].items():
        rows = io.read_csv(BASE / (spec["cohort"] + ".csv"))
        if len(rows) != spec["n"]:
            raise ValueError("Frozen cohort count changed")
        enriched = []
        for original in rows:
            row = dict(original)
            year = int(row["year"])
            if year not in weather:
                raise ValueError("Cohort year has no verified weather")
            for name in features:
                row[name] = weather[year][name]
            row["weather_days"] = weather[year]["weather_days"]
            enriched.append(row)
        cohorts[spec["cohort"]] = enriched
        frozen = [r for r in io.read_csv(BASE / "fold_memberships.csv") if r["cohort"] == spec["cohort"]]
        if len(frozen) != len(rows) * 3:
            raise ValueError("Frozen fold membership count changed")
        memberships.extend(frozen)
    outputs = {name + ".csv": io.csv_bytes(rows) for name, rows in cohorts.items()}
    outputs["fold_memberships.csv"] = io.csv_bytes(memberships)
    inventory = {
        "version": protocol["version"], "protocol_sha256": hashlib.sha256(protocol_bytes).hexdigest(),
        "preparation_code_sha256": io.digest(Path(__file__)), "python": platform.python_version(),
        "pinned_sha256": protocol["pinned_sha256"], "cohort_counts": {k: len(v) for k, v in cohorts.items()},
        "weather_by_year": [{"year": y, "weather_days": int(weather[y]["weather_days"]), **{f: float(weather[y][f]) for f in features}} for y in sorted(weather)],
        "fold_memberships": {name: sum(1 for x in memberships if x["cohort"] == name) for name in cohorts},
        "models_fitted": False, "farmer_ready": False,
        "output_sha256": {name: hashlib.sha256(data).hexdigest() for name, data in outputs.items()},
        "limitations": protocol["limitations"]
    }
    outputs["inventory.json"] = io.json_bytes(inventory)
    io.verify_sources({"source_sha256": protocol["pinned_sha256"]})
    if PROTOCOL.read_bytes() != protocol_bytes:
        raise ValueError("Protocol changed during preparation")
    return outputs


if __name__ == "__main__":
    snapshot = build_snapshot()
    io.write_snapshot(snapshot, OUTPUT)
    print(json.dumps(json.loads(snapshot["inventory.json"])["cohort_counts"], indent=2))
    print(f"Prepared {OUTPUT}; no model fitting")
