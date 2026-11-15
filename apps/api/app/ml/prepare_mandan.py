"""Prepare a separate, design-supported Mandan spring-wheat cohort. No fitting."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
from collections import Counter
from pathlib import Path

import prepare_water_yield as prep

ROOT = prep.ROOT
EVIDENCE = ROOT / "data/raw/mandan_linkage_v1/linkage_evidence.json"
OUTPUT = ROOT / "data/processed/mandan_linkage_v1"
COVER = ROOT / "data/raw/usda_mandan_cover_2009_2012"
SOIL = ROOT / "data/raw/usda_mandan_soil_2008_2011"
LINK = EVIDENCE.parent
PHASES = ("PREPLANT", "LATEFALL", "SPRING")


def read_csv(path: Path) -> list[dict]:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    return [r for r in csv.DictReader(io.StringIO(text)) if any(v is not None and str(v).strip() for v in r.values())]


def numeric(value: object) -> float | None:
    if value is None or str(value).strip() in {"", "-9999", "NA", "NE"}:
        return None
    number = float(value)
    if number == -9999:
        return None
    if not math.isfinite(number) or number < 0:
        raise ValueError("Unexpected negative/nonfinite source measurement")
    return number


def normalize_water(row: dict) -> dict:
    layers = [numeric(row[f"SWC{i}"]) for i in range(1, 8)]
    total = numeric(row["TOTAL"])
    complete = all(v is not None for v in layers) and total is not None
    if complete and abs(math.fsum(layers) - total) > 0.1:
        raise ValueError("Profile layer sum disagrees with source total in cm")
    shallow = all(v is not None for v in layers[:3])
    return {"storage_0_210cm_mm": total * 10 if complete else None,
        "storage_0_90cm_mm": math.fsum(layers[:3]) * 10 if shallow else None,
        "missing_layers": ";".join(str(i + 1) for i, v in enumerate(layers) if v is None),
        "source_total_missing": total is None}


def unique(rows: list[dict], year: str, treatment: str, year_offset: int = 0) -> dict:
    result = {}
    for row in rows:
        key = int(row[year]) + year_offset, int(row["REP"]), int(row[treatment])
        if key in result:
            raise ValueError("Ambiguous year/rep/treatment identity")
        result[key] = row
    return result


def plot_bridge(yields: list[dict], soil_biomass: list[dict], crop_biomass: list[dict]) -> tuple[dict, dict]:
    wheat = unique([r for r in yields if r["CROP"] == "SpringWheat"], "YEAR", "TRT")
    soil = unique(soil_biomass, "YEAR", "CCTRT", 1)
    crop = unique(crop_biomass, "YEAR", "TRT", 1)
    if set(wheat) != set(soil) or set(wheat) != set(crop):
        raise ValueError("Biomass bridge calendar/treatment coverage differs")
    for key, row in wheat.items():
        if int(row["PLOT"]) != int(soil[key]["PLOT"]) or int(row["PLOT"]) != int(crop[key]["PLOT"]):
            raise ValueError("Biomass plot bridge does not equal spring-wheat plot")
    counts = {"spring_wheat": len(wheat), "soil_biomass_plot_matches": len(wheat), "crop_biomass_plot_matches": len(wheat)}
    other = {}
    for name in ("Corn", "Soybean", "DryPea"):
        other[name] = sum(int(r["PLOT"]) == int(soil[(int(r["YEAR"]), int(r["REP"]), int(r["TRT"]))]["PLOT"]) for r in yields if r["CROP"] == name)
    if any(other.values()):
        raise ValueError("Sampling bridge is not specific to spring wheat")
    return wheat, {**counts, "other_crop_plot_matches": other}


def matched_pairs(observations: list[dict]) -> list[dict]:
    controls = {}
    for row in observations:
        if row["treatment"] == 1:
            key = row["year"], row["rep"]
            if key in controls:
                raise ValueError("Ambiguous untreated control")
            controls[key] = row
    result = []
    for row in observations:
        if not 2 <= row["treatment"] <= 19 or row["wheat_yield_t_ha"] is None:
            continue
        control = controls[(row["year"], row["rep"])]
        if control["wheat_yield_t_ha"] is None:
            continue
        pair = {"pair_id": row["observation_id"], "control_id": control["observation_id"],
            "year": row["year"], "rep": row["rep"], "treatment": row["treatment"],
            "treatment_description": row["treatment_description"],
            "cover_yield_t_ha": row["wheat_yield_t_ha"], "fallow_yield_t_ha": control["wheat_yield_t_ha"],
            "delta_yield_t_ha": row["wheat_yield_t_ha"] - control["wheat_yield_t_ha"]}
        for phase in ("preplant", "spring"):
            for depth in ("0_210cm", "0_90cm"):
                name = f"{phase}_storage_{depth}_mm"
                a, b = row[name], control[name]
                pair["cover_" + name], pair["fallow_" + name] = a, b
                pair["delta_" + name] = a - b if a is not None and b is not None else None
        pair["linkage_basis"] = row["linkage_basis"]
        result.append(pair)
    return result


def build_snapshot() -> dict[str, bytes]:
    evidence_hash = prep.digest(EVIDENCE)
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    verify = lambda: prep.verify_sources({"source_sha256": evidence["pinned_sha256"]})
    verify()
    yields = read_csv(COVER / "response_crop_yield.csv")
    soil_biomass = read_csv(LINK / "soil_study_biomass.csv")
    crop_biomass = read_csv(LINK / "cover_biomass.csv")
    wheat, bridge = plot_bridge(yields, soil_biomass, crop_biomass)
    if any(bridge[k] != evidence["expected_identity_counts"][k] for k in ("spring_wheat", "soil_biomass_plot_matches", "crop_biomass_plot_matches")):
        raise ValueError("Bridge count differs from verified source evidence")
    biomass = unique(soil_biomass, "YEAR", "CCTRT", 1)
    nplots = {}
    for row in read_csv(SOIL / "profile_soil_nitrogen.csv"):
        key = int(row["EXPYEAR"]) + 2008, int(row["REP"]), int(row["CCTRT"])
        value = int(row["PLOT"])
        if key in nplots and nplots[key] != value:
            raise ValueError("Ambiguous soil-nitrogen plot identity")
        nplots[key] = value
    water = {}
    missing_water_rows = 0
    for row in read_csv(SOIL / "profile_soil_water.csv"):
        key = int(row["EXPYEAR"]) + 2008, int(row["REP"]), int(row["CCTRT"])
        identity = (*key, row["TIME"])
        if key not in wheat or row["TIME"] not in PHASES or identity in water:
            raise ValueError("Water key missing/ambiguous/outside supported wheat design")
        value = normalize_water(row)
        missing_water_rows += value["storage_0_210cm_mm"] is None
        water[identity] = value
    # The soil release intentionally omits disturbed-no-seed treatment 20.
    expected_water = {(year, rep, treatment, phase) for year in (2009, 2010, 2011) for rep in range(1, 5) for treatment in range(1, 20) for phase in PHASES}
    if set(water) != expected_water:
        raise ValueError("Unexpected water phase/treatment coverage")
    audit = json.loads((ROOT / "data/analysis/water_yield_research_v1/inventory.json").read_text(encoding="utf-8"))
    operations = {(r["year"], r["operation"]): r["date"] for r in audit["mandan"]["operation_dates"]}
    observations, crosswalk = [], []
    basis = "published_wheat_strip_sampling_and_two_biomass_plot_bridges"
    for key, raw in sorted(wheat.items()):
        year, rep, treatment = key
        identity = f"mandan/{year}/R{rep}/T{treatment}"
        value = numeric(raw["YIELD"])
        row = {"observation_id": identity, "year": year, "cover_year": year - 1, "rep": rep,
            "response_plot": int(raw["PLOT"]), "treatment": treatment, "treatment_description": raw["TRT_DESC"],
            "crop": "SpringWheat", "wheat_yield_t_ha": value / 1000 if value is not None else None,
            "cover_biomass_kg_ha": numeric(biomass[key]["AGBIOMASS"]),
            "wheat_planting_date": operations[(year, "Planting")], "wheat_harvest_date": operations[(year, "Harvest")],
            "linkage_basis": basis, "water_sampling_date_status": "phase_only_not_exact_wheat_sowing",
            "water_definition": "stored_water_not_verified_PAW"}
        for phase in PHASES:
            sample = water.get((*key, phase))
            for depth in ("0_210cm", "0_90cm"):
                row[f"{phase.lower()}_storage_{depth}_mm"] = sample[f"storage_{depth}_mm"] if sample else None
            row[f"{phase.lower()}_water_status"] = "not_collected_for_treatment20" if sample is None else ("complete_0_210cm" if sample["storage_0_210cm_mm"] is not None else "missing_layer_or_total")
        observations.append(row)
        crosswalk.append({"observation_id": identity, "cover_year": year - 1, "response_year": year, "rep": rep, "treatment": treatment,
            "yield_plot": int(raw["PLOT"]), "soil_study_biomass_plot": int(biomass[key]["PLOT"]),
            "crop_study_biomass_plot": int(raw["PLOT"]), "soil_nitrogen_plot": nplots.get(key),
            "soil_nitrogen_plot_matches": nplots.get(key) == int(raw["PLOT"]),
            "water_raw_plot_id_present": False, "water_linkage_basis": basis})
    spring = [r for r in observations if r["wheat_yield_t_ha"] is not None and r["spring_storage_0_210cm_mm"] is not None]
    initial = [r for r in spring if r["preplant_storage_0_210cm_mm"] is not None]
    pairs = matched_pairs(observations)
    paired = [r for r in pairs if r["delta_spring_storage_0_210cm_mm"] is not None]
    paired_initial = [r for r in paired if r["delta_preplant_storage_0_210cm_mm"] is not None]
    if len(spring) != 176 or len(pairs) != 216:
        raise ValueError("Prepared cohort differs from prior independent source counts")
    cohorts = {"spring_water_yield": spring, "initial_spring_water_yield": initial,
        "yield_pairs": pairs, "water_yield_pairs": paired, "initial_water_yield_pairs": paired_initial}
    folds = [{"cohort": name, "held_out_year": year, "item_id": row.get("observation_id", row.get("pair_id")),
        "year": row["year"], "role": "evaluation" if row["year"] == year else "train"}
        for name, rows in cohorts.items() for year in (2009, 2010, 2011) for row in rows]
    files = {"observations.csv": prep.csv_bytes(observations), "plot_crosswalk.csv": prep.csv_bytes(crosswalk),
        "fold_memberships.csv": prep.csv_bytes(folds), **{name + ".csv": prep.csv_bytes(rows) for name, rows in cohorts.items()}}
    summary = {"version": "mandan-linkage-v1", "source_sha256": evidence["pinned_sha256"], "evidence_sha256": evidence_hash,
        "preparation_code_sha256": prep.digest(Path(__file__)), "bridge": bridge,
        "counts": {"observations": len(observations), "water_phase_rows": len(water), "water_phase_rows_missing_deep_profile": missing_water_rows,
            **{name: len(rows) for name, rows in cohorts.items()},
            "spring_shallow_water_yield": sum(r["spring_storage_0_90cm_mm"] is not None and r["wheat_yield_t_ha"] is not None for r in observations)},
        "cohort_by_year": {name: dict(sorted(Counter(r["year"] for r in rows).items())) for name, rows in cohorts.items()},
        "paired_outcomes": {name: {"benefits": sum(r["delta_yield_t_ha"] > 1e-12 for r in rows), "harms": sum(r["delta_yield_t_ha"] < -1e-12 for r in rows),
            "controls": len({r["control_id"] for r in rows})} for name, rows in cohorts.items() if "pairs" in name},
        "soil_nitrogen_plot_mismatches_retained": sum(not r["soil_nitrogen_plot_matches"] for r in crosswalk),
        "models_fitted": False, "farmer_ready": False, "limitations": evidence["limits"],
        "output_sha256": {name: hashlib.sha256(value).hexdigest() for name, value in files.items()}}
    verify()
    if prep.digest(EVIDENCE) != evidence_hash:
        raise ValueError("Linkage evidence changed during preparation")
    files["inventory.json"] = prep.json_bytes(summary)
    return files


if __name__ == "__main__":
    result = build_snapshot()
    prep.write_snapshot(result, OUTPUT)
    print(json.dumps(json.loads(result["inventory.json"])["counts"], indent=2))
    print(f"Prepared {OUTPUT}; no model fitting")
