"""Read-only contrast diagnostics: eligibility, benefit support and OOF ranking. No fitting."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "data/experiments/cover_fallow_v1/runs/20261115T105621737490Z"
OUTPUT = ROOT / "data/analysis/cover_fallow_diagnosis_v1/diagnosis.json"


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def number(value: object) -> float | None:
    if value is None or value in ("", "NA", "NE"):
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Nonfinite source value")
    return result


def summarize(pairs: list[dict]) -> dict:
    return {"pairs": len(pairs), "unique_controls": len({r["control_id"] for r in pairs}),
        "benefits": sum(r["delta_yield_t_ha"] > 1e-12 for r in pairs),
        "harms": sum(r["delta_yield_t_ha"] < -1e-12 for r in pairs)}


def ranking(rows: list[dict]) -> dict:
    y = [float(r["observed_delta_yield_t_ha"]) > 1e-12 for r in rows]
    scores = [float(r["predicted_delta_yield_t_ha"]) for r in rows]
    both_classes = 0 < sum(y) < len(y)
    return {"n": len(y), "benefits": sum(y), "prevalence": sum(y) / len(y),
        "average_precision": float(average_precision_score(y, scores)) if both_classes else None,
        "roc_auc": float(roc_auc_score(y, scores)) if both_classes else None,
        "note": "Raw regression score ranking, not calibrated probabilities; no threshold selected"}


def main() -> None:
    source_protocol = json.loads((ROOT / "apps/api/app/ml/water_yield_protocol_v1.json").read_text(encoding="utf-8"))
    contrast_protocol_path = ROOT / "apps/api/app/ml/cover_fallow_protocol_v1.json"
    contrast_protocol = json.loads(contrast_protocol_path.read_text(encoding="utf-8"))
    for name, expected in {**source_protocol["source_sha256"], **contrast_protocol["pinned_sha256"]}.items():
        if digest(ROOT / name) != expected:
            raise ValueError(f"Frozen source mismatch: {name}")
    workbook_path = ROOT / "data/dryad_eash_2025/Cover_Crop_Trials_Data.xlsx"
    audit_path = ROOT / source_protocol["observation_path"]
    pair_path = ROOT / "data/processed/water_yield_v1/paired_observations.csv"
    paths = [Path(__file__), contrast_protocol_path, workbook_path, audit_path, pair_path,
        RUN / "oof_predictions.csv", RUN / "results.json", ROOT / source_protocol["calendar_path"]]
    hashes = {p.relative_to(ROOT).as_posix(): digest(p) for p in paths}
    calendar = json.loads((ROOT / source_protocol["calendar_path"]).read_text(encoding="utf-8"))["records"]
    seasons = {(r["trial"], str(r["cycle"])): r["season_id"] for r in calendar if r["include_if_joint_labels"]}
    audit = read_csv(audit_path)
    identity = lambda r: f"{r['plot']}/C{r['cycle']}"
    matching = lambda r: tuple(r[k] for k in ("trial", "block", "tillage", "cycle"))
    controls = {}
    for row in audit:
        if row["cover_mix"] == "Fallow" and number(row["wheat_yield_t_ha"]) is not None:
            if matching(row) in controls:
                raise ValueError("Ambiguous yield-only control")
            controls[matching(row)] = row
    expanded = []
    workbook = load_workbook(workbook_path, data_only=True, read_only=True)
    try:
        values = iter(workbook["Field Data"].iter_rows(values_only=True))
        header = next(values)
        plots = {row["Plot"]: row for values in values if (row := dict(zip(header, values))).get("Plot") is not None}
        metadata = [list(r) for r in workbook["Metadata"].iter_rows(values_only=True) if any("CCBiomass" in str(v) for v in r)]
    finally:
        workbook.close()
    for row in audit:
        if row["cover_mix"] == "Fallow" or matching(row) not in controls or number(row["wheat_yield_t_ha"]) is None:
            continue
        control = controls[matching(row)]
        season = seasons.get((row["trial"], row["cycle"]))
        if season is None:
            raise ValueError("Yield label lacks verified completed season")
        water = number(row["profile_water_at_wheat_sowing_mm"])
        fallow_water = number(control["profile_water_at_wheat_sowing_mm"])
        nitrate = number(row["nitrate_0_30cm_mg_kg"])
        fallow_nitrate = number(control["nitrate_0_30cm_mg_kg"])
        expanded.append({"pair_id": identity(row), "control_id": identity(control), "season_id": season,
            "delta_yield_t_ha": number(row["wheat_yield_t_ha"]) - number(control["wheat_yield_t_ha"]),
            "water_complete": water is not None and fallow_water is not None,
            "nitrate_complete": nitrate is not None and fallow_nitrate is not None,
            "cover_biomass_kg_ha": number(plots[row["plot"]][f"C{row['cycle']}.CCBiomass"]),
            "delta_profile_water_mm": water - fallow_water if water is not None and fallow_water is not None else None,
            "delta_nitrate_mg_kg": nitrate - fallow_nitrate if nitrate is not None and fallow_nitrate is not None else None,
            "planting_window": row["planting_window"], "tillage": row["tillage"], "cover_mix": row["cover_mix"]})
    joint = [r for r in expanded if r["water_complete"]]
    if {r["pair_id"] for r in joint} != {r["pair_id"] for r in read_csv(pair_path)}:
        raise ValueError("Expanded reconstruction changed original joint cohort")
    if summarize(expanded) != {"pairs": 123, "unique_controls": 21, "benefits": 12, "harms": 111}:
        raise ValueError("Yield-only eligibility differs from independent count check")
    positive = [r for r in joint if r["delta_yield_t_ha"] > 1e-12]
    predictions = read_csv(RUN / "oof_predictions.csv")
    support = {}
    for season in source_protocol["folds"]:
        positives = [r for r in positive if r["season_id"] != season]
        support[season] = {"training_benefits": len(positives),
            "training_benefit_seasons": sorted({r["season_id"] for r in positives}),
            "training_benefit_controls": len({r["control_id"] for r in positives})}
    rank_report = {}
    for method in sorted({r["method"] for r in predictions}):
        selected = [r for r in predictions if r["method"] == method]
        rank_report[method] = {"pooled_descriptive": ranking(selected),
            "per_season": {s: ranking([r for r in selected if r["season_id"] == s]) for s in source_protocol["folds"]}}
    output = {"purpose": "Post-experiment diagnosis and next-experiment design; no model fit or threshold tuning",
        "input_sha256": hashes, "yield_only": summarize(expanded), "joint_water_yield": summarize(joint),
        "yield_only_per_season": {s: summarize([r for r in expanded if r["season_id"] == s]) for s in source_protocol["folds"]},
        "water_missing_yield_pairs": summarize([r for r in expanded if not r["water_complete"]]),
        "biomass_coverage": {"yield_only_pairs": sum(r["cover_biomass_kg_ha"] is not None for r in expanded),
            "joint_pairs": sum(r["cover_biomass_kg_ha"] is not None for r in joint), "source_metadata": metadata},
        "nitrate_complete_joint": summarize([r for r in joint if r["nitrate_complete"]]),
        "benefit_details": positive, "benefit_size_t_ha": {"min": min(r["delta_yield_t_ha"] for r in positive),
            "median": statistics.median(r["delta_yield_t_ha"] for r in positive), "max": max(r["delta_yield_t_ha"] for r in positive)},
        "training_benefit_support": support, "ranking": rank_report,
        "limitations": ["All labels are exposed development data", "Expanded yield-only cohort is not extra seasons or measured-water evidence",
            "Missing water/nitrate is retained, not imputed", "Pooled OOF score scales can differ by fold; within-season ranking is also reported",
            "No probabilities or decision threshold were calibrated", "Measured biomass and sowing nitrate/water are future intermediates at cover planting"]}
    for name, expected in hashes.items():
        if digest(ROOT / name) != expected:
            raise ValueError("Diagnostic input changed during inspection")
    value = (json.dumps(output, indent=2, sort_keys=True, allow_nan=False) + "\n").encode()
    if OUTPUT.exists() and OUTPUT.read_bytes() != value:
        raise ValueError("Diagnostic snapshot differs; use a new version")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if not OUTPUT.exists():
        OUTPUT.write_bytes(value)
    print(json.dumps({k: output[k] for k in ("yield_only", "joint_water_yield", "biomass_coverage", "benefit_size_t_ha", "training_benefit_support")}, indent=2))
    print(f"Saved {OUTPUT}; no fitting")


if __name__ == "__main__":
    main()
