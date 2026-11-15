#!/usr/bin/env python3
"""Refresh the compact, national USDA ERS crop-reference snapshot from official CSVs."""
import csv
import argparse
import hashlib
import io
import json
import sys
import math
import os
import tempfile
import urllib.request
import urllib.error
from datetime import date
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "shared/data/crop-references.json"
RAW_DIR = Path(__file__).resolve().parents[1] / "data/raw/crop-references-v1"
HECTARES_PER_ACRE = 0.40468564224
POUNDS_TO_TONNES = 0.00045359237
SOURCES = {
    "corn": ("https://www.ers.usda.gov/media/4962/corn.csv?v=13755", 56),
    "cotton": ("https://www.ers.usda.gov/media/4964/cotton.csv?v=97889", None),
    "sorghum": ("https://www.ers.usda.gov/media/4972/sorghum.csv?v=67371", 56),
    "soybeans": ("https://www.ers.usda.gov/media/4976/soybeans.csv?v=42084", 60),
    "wheat": ("https://www.ers.usda.gov/media/4978/wheat.csv?v=86392", 60),
}


def parse(crop: str, url: str, pounds_per_bushel: int | None, payload: bytes):
    text = payload.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    required_columns = {"Year", "Region", "Item", "Units", "Value"}
    if not reader.fieldnames or not required_columns.issubset(set(reader.fieldnames)):
        raise RuntimeError(f"ERS {crop} CSV is missing required columns")
    rows = list(reader)
    dated = [row for row in rows if row.get("Year", "").isdigit() and int(row["Year"]) < date.today().year and row.get("Region", "").strip() == "U.S. total"]
    output = {}
    for year in sorted({int(row["Year"]) for row in dated}):
        selected = [row for row in dated if int(row["Year"]) == year and row.get("Value", "").strip()]
        values = {}
        units = {}
        for row in selected:
            item = row["Item"].strip()
            value = float(row["Value"])
            if not math.isfinite(value) or (item in {"Yield", "Price", "Total, operating costs", "Total, allocated overhead"} and value < 0):
                raise RuntimeError(f"Invalid ERS {item} value for {crop} in {year}")
            if item in values and values[item] != value:
                raise RuntimeError(f"Conflicting duplicate ERS {item} rows for {crop} in {year}")
            if item in units and units[item] != row["Units"].strip():
                raise RuntimeError(f"Conflicting duplicate ERS units for {crop} in {year}")
            values[item], units[item] = value, row["Units"].strip()
        if "Yield" not in values or "Price" not in values:
            continue
        expected_yield = "bushels per planted acre" if pounds_per_bushel else "pounds per planted acre"
        expected_price = units["Price"].startswith("dollars per bushel") if pounds_per_bushel else units["Price"] == "dollars per pound"
        expected_cost_units = all(units[key] == "dollars per planted acre" for key in ("Total, operating costs", "Total, allocated overhead") if key in units)
        if units["Yield"] != expected_yield or not expected_price or not expected_cost_units:
            raise RuntimeError(f"Unexpected ERS units for {crop} in {year}")
        operating, overhead = values.get("Total, operating costs"), values.get("Total, allocated overhead")
        weight = pounds_per_bushel * POUNDS_TO_TONNES if pounds_per_bushel else POUNDS_TO_TONNES
        output[year] = {
            "crop": crop, "yieldTHa": values["Yield"] * weight / HECTARES_PER_ACRE,
            "priceUsdT": values["Price"] / weight,
            "totalCostUsdHa": (operating + overhead) / HECTARES_PER_ACRE if operating is not None and overhead is not None else None,
            "sourceRegion": "U.S. total", "sourceYear": year, "geographicMatch": "national_fallback",
            "units": "tonnes/ha; USD/tonne; USD/ha", "sourceUrl": url,
        }
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="rebuild the normalized snapshot from the bundled raw CSVs")
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR, help="raw source snapshot directory")
    parser.add_argument("--output", type=Path, default=OUTPUT, help="normalized JSON output path")
    args = parser.parse_args()
    datasets, provenance = [], []
    raw_dir = args.raw_dir
    raw_dir.mkdir(parents=True, exist_ok=True)
    previous_provenance = {}
    if args.offline and args.output.exists():
        previous_provenance = {item.get("crop"): item for item in json.loads(args.output.read_text(encoding="utf-8")).get("provenance", [])}
    payloads = {}
    for crop, (url, pounds_per_bushel) in SOURCES.items():
        if args.offline:
            payload = (raw_dir / f"{crop}.csv").read_bytes()
        else:
            request = urllib.request.Request(url, headers={"User-Agent": "FieldShift crop reference refresh"})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    if response.geturl().split("/", 3)[2].lower() != "www.ers.usda.gov":
                        raise RuntimeError(f"Unexpected redirect while retrieving {crop}")
                    payload = response.read(3_000_001)
            except urllib.error.URLError as error:
                raise RuntimeError(f"Could not retrieve {crop} from USDA ERS: {error.reason}. HTTPS certificate verification remained enabled.") from error
        if len(payload) > 3_000_000:
            raise RuntimeError(f"ERS CSV unexpectedly large for {crop}")
        payloads[crop] = payload
        datasets.append(parse(crop, url, pounds_per_bushel, payload))
        source_hash = hashlib.sha256(payload).hexdigest()
        previous = previous_provenance.get(crop, {})
        retrieved_at = previous.get("retrievedAt", "unknown") if previous.get("sha256") == source_hash else ("unknown" if args.offline else date.today().isoformat())
        provenance.append({"crop": crop, "sourceUrl": url, "retrievedAt": retrieved_at, "sha256": source_hash, "rawBytes": len(payload), "snapshotPath": f"data/raw/crop-references-v1/{crop}.csv"})
    common_years = set.intersection(*(set(dataset) for dataset in datasets))
    if not common_years:
        raise RuntimeError("The five official CSVs have no common U.S. actual year")
    common_year = max(common_years)
    records = [dataset[common_year] for dataset in datasets]
    crosswalk = json.loads((OUTPUT.parent / "ers-resource-regions.json").read_text(encoding="utf-8"))
    if not isinstance(crosswalk, dict) or not isinstance(crosswalk.get("sha256"), str) or not isinstance(crosswalk.get("sourceUrl"), str):
        raise RuntimeError("Bundled ERS county crosswalk manifest is invalid")
    crosswalk_bytes = (raw_dir / "ers-county-region-crosswalk.xls").read_bytes()
    if hashlib.sha256(crosswalk_bytes).hexdigest() != crosswalk["sha256"]:
        raise RuntimeError("Bundled ERS county crosswalk hash does not match its normalized copy")
    previous_crosswalk = previous_provenance.get("all", {})
    crosswalk_retrieved_at = previous_crosswalk.get("retrievedAt", "unknown") if previous_crosswalk.get("sha256") == crosswalk["sha256"] else "unknown"
    provenance.append({"crop": "all", "sourceUrl": crosswalk["sourceUrl"], "retrievedAt": crosswalk_retrieved_at, "sha256": crosswalk["sha256"], "rawBytes": len(crosswalk_bytes), "snapshotPath": "data/raw/crop-references-v1/ers-county-region-crosswalk.xls"})
    data = {
        "dataset": "USDA ERS Commodity Costs and Returns; U.S. total", "referenceYear": common_year,
        "geographicMatch": "national_fallback", "geographicRegion": None, "countyFips": None, "status": "available", "rows": records,
        "provenance": provenance,
        "assumptions": [
            "National U.S. estimates; no regional or field-specific match is asserted.",
            "Historical realized reference year; not a planning-year forecast.",
            "Total main-crop cost is ERS operating costs plus allocated overhead, including land and machinery costs. Cover-crop expenses are not included.",
            "ERS estimates are not adjusted for irrigation status or field-specific management.",
            "Price and yield represent the primary commodity; secondary-product revenue is excluded from revenue calculations.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=args.output.parent, prefix=f".{args.output.name}.", suffix=".tmp", delete=False) as temp:
            temp.write(json.dumps(data, indent=2) + "\n")
            temp_path = Path(temp.name)
        if not args.offline:
            for crop, payload in payloads.items():
                raw_path = raw_dir / f"{crop}.csv"
                raw_temp = None
                try:
                    with tempfile.NamedTemporaryFile("wb", dir=raw_dir, prefix=f".{crop}.", suffix=".tmp", delete=False) as raw_file:
                        raw_file.write(payload)
                        raw_temp = Path(raw_file.name)
                    os.replace(raw_temp, raw_path)
                    raw_temp = None
                finally:
                    if raw_temp is not None:
                        raw_temp.unlink(missing_ok=True)
        os.replace(temp_path, args.output)
        temp_path = None
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    print(f"Wrote {len(records)} USDA ERS crop references for common year {common_year}: {args.output}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, UnicodeDecodeError, csv.Error) as error:
        print(f"prepare-crop-references: {error}", file=sys.stderr)
        raise SystemExit(1) from error
