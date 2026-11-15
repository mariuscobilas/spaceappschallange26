"""Inventory public water/yield sources without fitting models or changing serving.

Run with the API virtualenv; --fetch adds small, public source files.
Outputs are research eligibility tables, not a frozen training/test dataset.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

import pandas as pd
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/analysis/water_yield_research_v1"
DOWNLOADS = {
    "data/raw/usda_beltsville_weather_2023/et_inputs_outputs.xlsx": 43734174,
    "data/raw/usda_beltsville_weather_2023/station_weather.xlsx": 43734177,
    "data/raw/usda_beltsville_weather_2023/yield_biomass_provider.xlsx": 43734171,
    "data/raw/usda_mandan_cover_2009_2012/data_dictionary.csv": 49752696,
    "data/raw/usda_mandan_cover_2009_2012/response_crop_yield.csv": 49752708,
    "data/raw/usda_mandan_cover_2009_2012/treatments.csv": 49752723,
    "data/raw/usda_mandan_cover_2009_2012/management.xlsx": 49735740,
    "data/raw/usda_mandan_soil_2008_2011/profile_soil_water.csv": 46309591,
    "data/raw/usda_mandan_soil_2008_2011/profile_soil_water_metadata.csv": 46309594,
    "data/raw/usda_mandan_soil_2008_2011/profile_soil_nitrogen.csv": 46309585,
    "data/raw/usda_mandan_soil_2008_2011/profile_soil_nitrogen_metadata.csv": 46309588,
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_text(path, value):
    """Never replace a different audit snapshot silently."""
    path.parent.mkdir(parents=True, exist_ok=True)
    content = value.encode("utf-8")
    if path.exists() and path.read_bytes() != content:
        raise ValueError(f"Use a new --output directory: {path} already differs")
    path.write_bytes(content)


def write_json(path, value):
    write_text(path, json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n")


def fetch_sources():
    for relative, file_id in DOWNLOADS.items():
        target = ROOT / relative
        provenance = target.with_suffix(target.suffix + ".source.json")
        url = f"https://ndownloader.figshare.com/files/{file_id}"
        if target.exists():
            recorded = json.loads(provenance.read_text(encoding="utf-8"))
            if recorded["sha256"] != digest(target) or recorded["url"] != url:
                raise ValueError(f"Cached source/provenance differs: {target}")
            continue
        with urlopen(Request(url, headers={"User-Agent": "FieldShift-data-audit/1"}), timeout=40) as response:
            content = response.read(10_000_001)
        if len(content) > 10_000_000 or not content:
            raise ValueError(f"Unexpected source size: {url}")
        if target.suffix == ".xlsx" and not content.startswith(b"PK"):
            raise ValueError(f"Not an XLSX archive: {url}")
        if target.suffix == ".csv" and content.lstrip().startswith(b"<"):
            raise ValueError(f"HTML returned for CSV: {url}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        write_json(provenance, {"url": url, "file_id": file_id, "bytes": len(content),
                               "sha256": digest(target),
                               "retrieved_utc": datetime.now(timezone.utc).isoformat()})
        print(f"Downloaded {relative}: {len(content)} bytes", flush=True)


def fetch_power():
    """Separate provider snapshots for the Colorado yield study, not Clovis."""
    for start, end in (("20160101", "20201231"), ("20210101", "20211231")):
        path = ROOT / f"data/raw/nasa_power_water_yield_v1/yellow_jacket_{start}_{end}.json"
        params = {"parameters": "PRECTOTCORR,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN",
                  "community": "AG", "latitude": 37.533333, "longitude": -108.733333,
                  "start": start, "end": end, "format": "JSON", "time-standard": "LST"}
        url = "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode(params)
        provenance = path.with_suffix(".source.json")
        if path.exists():
            prior = json.loads(provenance.read_text(encoding="utf-8"))
            if prior["sha256"] != digest(path) or prior["url"] != url:
                raise ValueError("NASA POWER snapshot changed")
            continue
        with urlopen(Request(url, headers={"User-Agent": "FieldShift-data-audit/1"}), timeout=40) as response:
            payload = json.load(response)
        if payload["header"]["time_standard"] != "LST":
            raise ValueError("NASA POWER time standard differs")
        write_json(path, payload)
        write_json(provenance, {"url": url, "request": params, "sha256": digest(path),
                               "retrieved_utc": datetime.now(timezone.utc).isoformat(),
                               "site": "Yellow Jacket Colorado, published study coordinates rounded to arcminutes"})
        print(f"Downloaded NASA POWER: {start} through {end}", flush=True)


def workbook_records(path, sheet, header_row=1):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = workbook[sheet].iter_rows(min_row=header_row, values_only=True)
        headers = [str(v).strip() if v is not None else f"_blank_{i}" for i, v in enumerate(next(rows))]
        return [dict(zip(headers, row)) for row in rows if any(v is not None for v in row)]
    finally:
        workbook.close()


def numeric(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) and result != -9999 else None
    except (TypeError, ValueError):
        return None


def save_csv(path, rows):
    import io
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    write_text(path, stream.getvalue())


def eash(output):
    source = ROOT / "data/dryad_eash_2025/Cover_Crop_Trials_Data.xlsx"
    raw = workbook_records(source, "Field Data")
    rows = []
    for row in raw:
        for cycle in (1, 2, 3):
            rows.append({"trial": row["Trial"], "plot": row["Plot"], "block": row["Block"],
                         "tillage": row["Tillage"], "planting_window": row["CC.Planting.Window"],
                         "cover_mix": row["Cover.Crop.Mix"], "cycle": cycle,
                         "profile_water_at_wheat_sowing_mm": numeric(row[f"C{cycle}.SoilMoisture"]),
                         "wheat_yield_t_ha": numeric(row[f"C{cycle}.WheatYield"]),
                         "nitrate_0_30cm_mg_kg": numeric(row[f"C{cycle}.SoilN"]),
                         "calendar_status": "unverified_exact_dates_and_T2_cycle3_year",
                         "water_definition": "source_0_90cm_storage_not_verified_plant_available_water"})
    frame = pd.DataFrame(rows)
    if frame.duplicated(["trial", "plot", "cycle"]).any():
        raise ValueError("Duplicate Eash plot-cycle")
    complete = frame.dropna(subset=["profile_water_at_wheat_sowing_mm", "wheat_yield_t_ha"])
    keys = ["trial", "block", "tillage", "cycle"]
    controls = complete.loc[complete.planting_window == "Fallow", keys + ["profile_water_at_wheat_sowing_mm", "wheat_yield_t_ha"]]
    if controls.duplicated(keys).any():
        raise ValueError("Ambiguous Eash control matching")
    paired = complete.loc[complete.planting_window != "Fallow"].merge(controls, on=keys, validate="many_to_one", suffixes=("", "_fallow"))
    paired["cover_minus_fallow_profile_water_mm"] = paired.profile_water_at_wheat_sowing_mm - paired.profile_water_at_wheat_sowing_mm_fallow
    paired["cover_minus_fallow_wheat_yield_t_ha"] = paired.wheat_yield_t_ha - paired.wheat_yield_t_ha_fallow
    save_csv(output / "eash_plot_cycles.csv", rows)
    # Missing nitrate remains missing; no outcome or feature imputation in this audit.
    serializable = paired.astype(object).where(pd.notna(paired), None).to_dict("records")
    save_csv(output / "eash_matched_water_yield_pairs.csv", serializable)
    return {"source_sha256": digest(source), "plots": len(raw), "plot_cycles": len(rows),
            "water_observations": int(frame.profile_water_at_wheat_sowing_mm.notna().sum()),
            "yield_observations": int(frame.wheat_yield_t_ha.notna().sum()),
            "joint_water_yield_observations": len(complete), "matched_cover_fallow_pairs": len(paired),
            "distinct_fallow_controls_used": len(paired[keys].drop_duplicates()),
            "joint_water_yield_nitrate_observations": len(complete.dropna(subset=["nitrate_0_30cm_mg_kg"])),
            "by_trial_cycle": complete.groupby(["trial", "cycle"]).size().rename("rows").reset_index().to_dict("records"),
            "calendar_join_ready": False, "fresh_independent_test": False,
            "limitations": ["One location, two adjacent trials, repeated plots, only three cycles per trial.",
                            "Exact operation dates and T2 third-cycle calendar unresolved; no new weather join assigned.",
                            "Storage at 0-90 cm is not automatically plant-available water.",
                            "Water at wheat sowing is a future intermediate outcome at the earlier cover-planting decision.",
                            "Shared fallow controls and plots create dependence among paired rows."]}


def beltsville(output):
    folder = ROOT / "data/usda_beltsville_2023"
    yields = workbook_records(folder / "yield_biomass.xlsx", "Sheet5", 4)
    yields = [r for r in yields if numeric(r.get("year")) is not None]
    lookup = {}
    for row in yields:
        key = (int(row["year"]), int(row["rep"]), int(row["system"]))
        if key in lookup:
            raise ValueError("Duplicate Beltsville year-rep-system yield")
        lookup[key] = row
    series = []
    for year in (2017, 2018, 2019, 2020):
        raw = workbook_records(folder / "soil_water.xlsx", f"SWS_{year}")
        frame = pd.DataFrame(raw)
        if frame.duplicated(["Rep", "System", "Date"]).any():
            raise ValueError("Duplicate Beltsville daily water key")
        for (rep, system), group in frame.groupby(["Rep", "System"]):
            row = lookup.get((year, int(rep), int(system)), {})
            dates = sorted(group.Date)
            if any(v.year != year for v in dates):
                raise ValueError("Beltsville daily-water year mismatch")
            series.append({"year": year, "rep": int(rep), "system": int(system),
                           "daily_water_rows": len(group), "first_water_date": dates[0].date().isoformat(),
                           "last_water_date": dates[-1].date().isoformat(),
                           "missing_dates_within_series": (dates[-1] - dates[0]).days + 1 - len(dates),
                           "corn_yield_kg_ha": numeric(row.get("Corn Yield  kg/ha")),
                           "cover_type": row.get("cover_type"),
                           "water_definition": "source_daily_profile_storage_0_862mm_not_PAW",
                           "sowing_water_status": "not_established_measurements_begin_after_planting"})
    save_csv(output / "beltsville_water_yield_series.csv", series)
    provider_copy = ROOT / "data/raw/usda_beltsville_weather_2023/yield_biomass_provider.xlsx"
    return {"yield_source_sha256": digest(folder / "yield_biomass.xlsx"),
            "provider_yield_copy_matches": provider_copy.exists() and digest(provider_copy) == digest(folder / "yield_biomass.xlsx"),
            "water_source_sha256": digest(folder / "soil_water.xlsx"),
            "yield_table_rows": len(yields),
            "numeric_yield_observations": sum(numeric(r.get("Corn Yield  kg/ha")) is not None for r in yields),
            "water_series": len(series), "daily_water_rows": sum(r["daily_water_rows"] for r in series),
            "water_series_with_yield": sum(r["corn_yield_kg_ha"] is not None for r in series),
            "series_by_year": dict(sorted(Counter(r["year"] for r in series).items())),
            "yield_year_counts": dict(sorted(Counter(int(r["year"]) for r in yields if numeric(r.get("Corn Yield  kg/ha")) is not None).items())),
            "limitations": ["Corn in humid Maryland; keep separate from dryland winter wheat.",
                            "Daily water measurements are repeated observations, not independent yield labels.",
                            "Source Table 2 contains 2023 Excel dates under 2017-2020 year labels; do not silently repair.",
                            "No-cover and cover systems differ in rotation and planting schedule; not a pure water-only contrast.",
                            "Source metadata describes replaced sensor errors; measured/imputed provenance needs audit."]}


def source_csv(path):
    # USDA's soil tables contain a UTF-8 BOM; the yield dictionary uses CP1252.
    try:
        return pd.read_csv(path, encoding="utf-8-sig")
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="cp1252")


def mandan(output):
    yield_path = ROOT / "data/raw/usda_mandan_cover_2009_2012/response_crop_yield.csv"
    water_path = ROOT / "data/raw/usda_mandan_soil_2008_2011/profile_soil_water.csv"
    if not yield_path.exists() or not water_path.exists():
        return {"status": "run_with_fetch_to_acquire_sources"}
    water = source_csv(water_path)
    yields = source_csv(yield_path)
    metadata_path = water_path.with_name("profile_soil_water_metadata.csv")
    metadata = source_csv(metadata_path)
    calendar_note = metadata.loc[metadata.ATTRIBUTE == "EXPYEAR", "NOTE"].iloc[0]
    if "Spring 2009" not in calendar_note or "Spring 2011" not in calendar_note:
        raise ValueError("Mandan experiment-year calendar changed")
    water["YEAR"] = water.EXPYEAR + 2008
    water["TRT"] = water.CCTRT
    keys = ["YEAR", "REP", "TRT"]
    if water.duplicated(keys + ["TIME"]).any() or yields.duplicated(keys + ["CROP"]).any():
        raise ValueError("Mandan water or yield keys are not unique")
    layers = [f"SWC{i}" for i in range(1, 8)]
    values = water[layers + ["TOTAL"]].apply(pd.to_numeric, errors="coerce").replace(-9999, float("nan"))
    complete = values.notna().all(axis=1)
    if (values.loc[complete, layers].sum(axis=1) - values.loc[complete, "TOTAL"]).abs().max() > 0.1:
        raise ValueError("Mandan layer sums do not reconcile with source total in cm")
    if (values < 0).any().any():
        raise ValueError("Unexpected negative water storage")
    water["profile_storage_mm"] = values.TOTAL.where(complete) * 10
    spring = water.loc[water.TIME == "SPRING", keys + ["profile_storage_mm"]].rename(columns={"profile_storage_mm": "spring_profile_water_mm"})
    start = water.loc[water.TIME == "PREPLANT", keys + ["profile_storage_mm"]].rename(columns={"profile_storage_mm": "before_cover_profile_water_mm"})
    wheat = yields.loc[yields.CROP == "SpringWheat"].copy()
    wheat["yield_kg_ha"] = pd.to_numeric(wheat.YIELD, errors="coerce").replace(-9999, float("nan"))
    wheat = wheat.merge(spring, on=keys, how="left", validate="one_to_one").merge(start, on=keys, how="left", validate="one_to_one")
    # Nitrogen file has parent plot IDs, unlike water. Verify the cross-release
    # treatment/rep/year identity before interpreting the join as the same trial.
    nitrogen = source_csv(water_path.with_name("profile_soil_nitrogen.csv"))
    nitrogen["YEAR"] = nitrogen.EXPYEAR + 2008
    nitrogen["TRT"] = nitrogen.CCTRT
    plot_ids = nitrogen[keys + ["PLOT"]].drop_duplicates()
    if plot_ids.duplicated(keys).any():
        raise ValueError("Ambiguous Mandan parent plot identity")
    identity = wheat.merge(plot_ids.rename(columns={"PLOT": "soil_parent_plot"}), on=keys, how="left", validate="one_to_one")
    known = identity.soil_parent_plot.notna()
    verified = known & (identity.PLOT == identity.soil_parent_plot)
    # A shared treatment code is insufficient. Keep mismatches as an audit
    # finding and exclude them from all accepted water/yield training pairs.
    wheat["parent_plot_identity_verified"] = verified.to_numpy()
    operations = workbook_records(yield_path.with_name("management.xlsx"), "CCS_Management", 5)
    dates = {}
    for row in operations:
        if row["RESPONSECROP"] == "SpringWheat" and row["ACTIVITY"] in {"Planting", "Harvest"}:
            if not isinstance(row["DATE"], datetime) or row["DATE"].year != row["YEAR"]:
                raise ValueError("Mandan wheat operation date is not verified")
            key = (int(row["YEAR"]), row["ACTIVITY"])
            if key in dates:
                raise ValueError("Ambiguous Mandan wheat operation date")
            dates[key] = row["DATE"].date().isoformat()
    wheat["wheat_planting_date"] = wheat.YEAR.map(lambda year: dates.get((int(year), "Planting")))
    wheat["wheat_harvest_date"] = wheat.YEAR.map(lambda year: dates.get((int(year), "Harvest")))
    wheat["water_definition"] = "total_storage_0_210cm_not_verified_plant_available_water"
    wheat["spring_sample_date_status"] = "phase_only_not_exact_wheat_sowing_measurement"
    # TESTWT, MOISTURE, TKW are harvest measurements and must not become predictors.
    columns = keys + ["PLOT", "CROP", "TRT_DESC", "yield_kg_ha", "spring_profile_water_mm", "before_cover_profile_water_mm",
                      "parent_plot_identity_verified", "wheat_planting_date", "wheat_harvest_date", "water_definition", "spring_sample_date_status"]
    exported = wheat[columns].rename(columns={"spring_profile_water_mm": "candidate_spring_profile_water_mm",
                                             "before_cover_profile_water_mm": "candidate_before_cover_profile_water_mm"})
    save_csv(output / "mandan_spring_wheat_eligibility.csv", exported.astype(object).where(pd.notna(exported), None).to_dict("records"))
    eligible = wheat.dropna(subset=["yield_kg_ha", "spring_profile_water_mm"])
    eligible = eligible.loc[eligible.parent_plot_identity_verified]
    controls = eligible.loc[eligible.TRT == 1, ["YEAR", "REP", "yield_kg_ha", "spring_profile_water_mm"]]
    pairs = eligible.loc[eligible.TRT.between(2, 19)].merge(controls, on=["YEAR", "REP"], validate="many_to_one", suffixes=("", "_fallow"))
    pairs["cover_minus_control_yield_kg_ha"] = pairs.yield_kg_ha - pairs.yield_kg_ha_fallow
    pairs["cover_minus_control_spring_storage_mm"] = pairs.spring_profile_water_mm - pairs.spring_profile_water_mm_fallow
    if len(pairs):
        save_csv(output / "mandan_matched_water_yield_pairs.csv", pairs[columns + ["yield_kg_ha_fallow", "spring_profile_water_mm_fallow", "cover_minus_control_yield_kg_ha", "cover_minus_control_spring_storage_mm"]].astype(object).where(pd.notna(pairs), None).to_dict("records"))
    return {"water_sha256": digest(water_path), "yield_sha256": digest(yield_path),
            "soil_calendar_mapping": calendar_note, "all_crop_yield_rows": len(yields),
            "yield_rows_by_crop": yields.groupby("CROP").size().to_dict(), "water_rows": len(water),
            "water_rows_with_missing_layer_or_total": int((~complete).sum()),
            "spring_wheat_rows": len(wheat), "parent_plot_ids_verified": int(verified.sum()),
            "parent_plot_id_mismatches": int((known & ~verified).sum()),
            "treatment_rep_year_candidate_water_yield_rows": len(wheat.dropna(subset=["yield_kg_ha", "spring_profile_water_mm"])),
            "joint_spring_water_wheat_yield_rows": len(eligible),
            "joint_start_water_spring_water_yield_rows": len(eligible.dropna(subset=["before_cover_profile_water_mm"])),
            "matched_cover_control_pairs": len(pairs), "distinct_controls_used": len(pairs[["YEAR", "REP"]].drop_duplicates()),
            "joint_by_year": eligible.groupby("YEAR").size().to_dict(),
            "operation_dates": [{"year": year, "operation": operation, "date": value} for (year, operation), value in sorted(dates.items())],
            "limitations": ["Soil-nitrogen and response-crop plot IDs disagree for every candidate; do not train on a treatment/rep/year join without a documented crosswalk.",
                            "Three northern Great Plains spring-wheat seasons, not winter wheat in Kansas/New Mexico.",
                            "Spring soil sampling has a phase label, not an exact sowing-date water measurement.",
                            "0-210 cm total storage is not plant-available water without soil extraction limits.",
                            "Winterkill cover management differs from the current spring-cover demo.",
                            "Shared controls and four response-crop strips do not create independent weather seasons.",
                            "Harvest test weight, grain moisture and kernel weight are outcome-time variables, excluded."]}


def auxiliary_sources():
    source = ROOT / "data/garba_2022_mmc1.xlsx"
    rows = workbook_records(source, "Dataset2_Soil_water")
    keys = [(r["Year"], r["Site"], r["PlotNo"], r["Phase"], r["Depth"]) for r in rows]
    workbook = load_workbook(source, read_only=True, data_only=True)
    sheets = workbook.sheetnames
    workbook.close()
    nasa = []
    for path in sorted((ROOT / "data/raw/nasa_power_water_yield_v1").glob("yellow_jacket_*.json")):
        if path.name.endswith(".source.json"):
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        provenance = json.loads(path.with_suffix(".source.json").read_text(encoding="utf-8"))
        if provenance["sha256"] != digest(path):
            raise ValueError("NASA POWER provenance hash differs")
        parameters = payload["properties"]["parameter"]
        request = provenance["request"]
        if set(parameters) != set(request["parameters"].split(",")) or payload["header"]["time_standard"] != "LST":
            raise ValueError("NASA POWER parameter or time contract differs")
        first = datetime.strptime(request["start"], "%Y%m%d").date()
        last = datetime.strptime(request["end"], "%Y%m%d").date()
        expected_dates = {(first + timedelta(days=i)).strftime("%Y%m%d") for i in range((last - first).days + 1)}
        if any(set(values) != expected_dates for values in parameters.values()):
            raise ValueError("NASA POWER calendar incomplete")
        longitude, latitude, _ = payload["geometry"]["coordinates"]
        if abs(longitude - request["longitude"]) > 0.001 or abs(latitude - request["latitude"]) > 0.001:
            raise ValueError("NASA POWER response location differs")
        dates = sorted(set.intersection(*(set(values) for values in parameters.values())))
        fill = payload["header"].get("fill_value", -999)
        nasa.append({"path": str(path.relative_to(ROOT)), "sha256": digest(path),
                     "days": len(dates), "first_date": dates[0], "last_date": dates[-1],
                     "time_standard": payload["header"]["time_standard"],
                     "parameter_units": {k: v.get("units") for k, v in payload["parameters"].items()},
                     "missing_values": sum(v == fill or not math.isfinite(v) for values in parameters.values() for v in values.values()),
                     "geometry": payload["geometry"]})
    return {"nasa_power_colorado": nasa,
            "garba": {"sha256": digest(source), "water_rows": len(rows), "sites": sorted({r["Site"] for r in rows}),
                      "years": sorted({r["Year"] for r in rows}), "phases": sorted({r["Phase"] for r in rows}),
                      "duplicate_plot_phase_depth_rows": len(keys) - len(set(keys)), "sheets": sheets,
                      "cash_crop_yield_sheet_present": False},
            "new_downloads": {relative: {"sha256": digest(ROOT / relative), "bytes": (ROOT / relative).stat().st_size}
                              for relative in DOWNLOADS if (ROOT / relative).exists()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.fetch:
        fetch_sources()
        fetch_power()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"version": "water-yield-feasibility-v1", "purpose": "Source eligibility and joins; no model fitting, feature selection, or correlation claims.",
              "eash": eash(args.output), "beltsville": beltsville(args.output), "mandan": mandan(args.output), **auxiliary_sources()}
    write_json(args.output / "inventory.json", report)
    print(json.dumps({"output": str(args.output),
                      "colorado_joint_water_yield_rows": report["eash"]["joint_water_yield_observations"],
                      "colorado_matched_pairs": report["eash"]["matched_cover_fallow_pairs"],
                      "beltsville_numeric_yields": report["beltsville"]["numeric_yield_observations"],
                      "mandan_verified_joint_rows": report["mandan"].get("joint_spring_water_wheat_yield_rows"),
                      "nasa_colorado_days": sum(block["days"] for block in report["nasa_power_colorado"])}, indent=2))


if __name__ == "__main__":
    main()
