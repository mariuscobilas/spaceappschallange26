"""Historical weather selection and experimental cover/fallow moisture simulation.

Uses saved artifacts only. Never trains, evaluates final-test labels, or fetches data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import time
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

import clovis_baselines as base
import clovis_regression as regression
import prepare_clovis as prep
import prepare_clovis_weather as weather

PROTOCOL_PATH = Path(__file__).with_name("clovis_scenario_protocol.json")
EXAMPLE = prep.ROOT / "examples/clovis_scenario_request.json"
OUTPUT = prep.ROOT / "data/scenarios/clovis_v1"
WEATHER_COLUMNS = [v[0] for v in weather.PARAMETERS.values()]


def load_protocol() -> dict:
    return json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))


def iso_date(value):
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str) and len(value) == 10:
        parsed = date.fromisoformat(value)
        if parsed.isoformat() == value:
            return parsed
    raise ValueError("Use a calendar date formatted YYYY-MM-DD")


class IrrigationEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: date
    amount_mm: float = Field(ge=0, allow_inf_nan=False, strict=True)

    _date = field_validator("date", mode="before")(iso_date)


class ScenarioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    site_id: Literal["clovis_nm"] = "clovis_nm"
    decision_date: date
    initial_soil_moisture_m3_m3: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False, strict=True)
    cover_crop: Literal["pea", "oat", "six_species_mix"]
    cover_planting_date: date
    cover_termination_date: date
    next_crop: Literal["winter_wheat"] = "winter_wheat"
    next_crop_planting_date: date
    irrigation_schedule: list[IrrigationEvent] = Field(default_factory=list)

    _dates = field_validator("decision_date", "cover_planting_date", "cover_termination_date",
                            "next_crop_planting_date", mode="before")(iso_date)

    @model_validator(mode="after")
    def check_calendar(self):
        policy = load_protocol()
        if not self.decision_date <= self.cover_planting_date < self.cover_termination_date < self.next_crop_planting_date:
            raise ValueError("Require decision <= cover planting < termination < next crop planting")
        horizon = (self.next_crop_planting_date - self.decision_date).days
        if not 7 <= horizon <= policy["maximum_horizon_days"]:
            raise ValueError("Simulation horizon must be 7-365 days")
        if not self.cover_planting_date.year == self.cover_termination_date.year == self.next_crop_planting_date.year:
            raise ValueError("Spring cover and autumn wheat must be in the same year")
        for day, key in ((self.cover_planting_date, "cover_planting_months"),
                         (self.cover_termination_date, "cover_termination_months"),
                         (self.next_crop_planting_date, "wheat_planting_months")):
            if day.month not in policy[key]:
                raise ValueError(f"Date outside supported Clovis demonstration calendar: {day}")
        event_dates = [e.date for e in self.irrigation_schedule]
        if len(event_dates) != len(set(event_dates)):
            raise ValueError("Irrigation dates must be unique")
        if any(not self.decision_date < day <= self.next_crop_planting_date for day in event_dates):
            raise ValueError("Irrigation must fall inside the simulated dates after decision_date")
        return self


def quantile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def select_scenarios(request: ScenarioRequest, history: list[dict], policy: dict) -> tuple[list[dict], list[dict]]:
    lookup = {}
    for row in history:
        if row["date"] in lookup:
            raise ValueError(f"Duplicate historical weather date: {row['date']}")
        lookup[row["date"]] = row
    if not lookup:
        raise ValueError("No historical weather available")
    targets = list(prep.days(request.decision_date + timedelta(days=1), request.next_crop_planting_date))
    first_year = targets[0].year
    first_available, last_available = min(lookup), max(lookup)
    audit, candidates = [], []
    for year in range(date.fromisoformat(first_available).year, date.fromisoformat(last_available).year + 1):
        entry = {"historical_start_year": year, "eligible": False,
                 "historical_start_date": None, "historical_end_date": None,
                 "total_rain_mm": None, "exclusion_reason": ""}
        try:
            mapped = [d.replace(year=year + d.year - first_year) for d in targets]
        except ValueError:
            entry["exclusion_reason"] = "incompatible_leap_calendar"
            audit.append(entry)
            continue
        entry.update(historical_start_date=mapped[0].isoformat(), historical_end_date=mapped[-1].isoformat())
        if any((mapped[i] - mapped[i - 1]).days != 1 for i in range(1, len(mapped))):
            entry["exclusion_reason"] = "incompatible_leap_calendar"
        elif any(d.isoformat() not in lookup for d in mapped):
            entry["exclusion_reason"] = "incomplete_weather_coverage"
        elif any(not lookup[d.isoformat()]["weather_eligible"] for d in mapped):
            entry["exclusion_reason"] = "invalid_weather_day"
        else:
            sequence = [lookup[d.isoformat()] for d in mapped]
            total = math.fsum(r["rain_mm"] for r in sequence)
            entry.update(eligible=True, total_rain_mm=total)
            candidates.append({**entry, "sequence": sequence})
        audit.append(entry)
    if len(candidates) < 3:
        raise ValueError("Need at least three complete calendar-compatible historical seasons")
    chosen, used = [], set()
    totals = [c["total_rain_mm"] for c in candidates]
    for scenario, percentile in policy["scenarios"].items():
        target = quantile(totals, percentile)
        candidate = min((c for c in candidates if c["historical_start_year"] not in used),
                        key=lambda c: (abs(c["total_rain_mm"] - target), c["historical_start_year"]))
        used.add(candidate["historical_start_year"])
        less = sum(v < candidate["total_rain_mm"] for v in totals)
        equal = sum(v == candidate["total_rain_mm"] for v in totals)
        rank = 100 * (less + (equal - 1) / 2) / (len(totals) - 1)
        chosen.append({**candidate, "scenario": scenario, "requested_rainfall_percentile": percentile,
                       "rainfall_target_mm": target, "actual_rainfall_percentile": rank,
                       "eligible_historical_seasons": len(candidates)})
    return chosen, audit


def load_history(directory: Path = weather.OUTPUT, cache: Path = weather.CACHE) -> tuple[list[dict], dict]:
    manifest_path = directory / "weather_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source_protocol = prep.load_protocol()
    if manifest["site"] != source_protocol["site"] or manifest["time_standard"] != "LST":
        raise ValueError("Historical site or time standard differs from the demonstration")
    rows = []
    for block in manifest["blocks"]:
        path = cache / block["cache_file"]
        if prep.digest(path) != block["cache_sha256"]:
            raise ValueError("Historical cache differs from frozen weather manifest")
        start = datetime.strptime(block["request"]["start"], "%Y%m%d").date()
        end = datetime.strptime(block["request"]["end"], "%Y%m%d").date()
        normalized, metadata = weather.load_block(source_protocol["site"], start, end, cache, False)
        if metadata != block:
            raise ValueError("Historical response metadata differs from frozen manifest")
        rows.extend(normalized)
    expected = hashlib.sha256(prep.csv_text(rows, weather.WEATHER_FIELDS).encode("utf-8")).hexdigest()
    if prep.digest(directory / "weather_daily.csv") != expected:
        raise ValueError("Normalized historical weather differs from cached provider responses")
    if [r["date"] for r in rows] != [d.isoformat() for d in prep.days(weather.START, weather.END)]:
        raise ValueError("Historical weather coverage is incomplete or unordered")
    return rows, {"weather_version": manifest["weather_version"],
                  "weather_manifest_sha256": prep.digest(manifest_path), "weather_daily_sha256": expected,
                  "calendar_alignment": manifest["calendar_alignment"], "start_date": manifest["start_date"],
                  "end_date": manifest["end_date"], "time_standard": "LST"}


def load_default_moisture(directory: Path = weather.OUTPUT) -> tuple[float, dict]:
    protocol = prep.load_protocol()
    rows = base.read_partition(directory, "train", protocol)
    subset = [r for r in rows if r["treatment"] == "fallow" and "2023-02-16" <= r["date"] <= "2023-02-22"]
    if len(subset) != 7:
        raise ValueError("Expected seven training fallow readings for the documented initial-water default")
    return statistics.median(r["soil_moisture_m3_m3"] for r in subset), {
        "source": "training_fallow_median", "dates": [r["date"] for r in subset],
        "train_features_sha256": prep.digest(directory / "train_features.csv"),
        "note": "Historical demonstration default, not measured water on the farmer's decision date."}


def load_saved_model(run: Path | None = None) -> tuple[regression.WeatherRegressor, dict]:
    if run is None:
        pointer = prep.ROOT / "data/experiments/clovis_regression/latest.json"
        run = Path(json.loads(pointer.read_text(encoding="utf-8"))["run_directory"])
    report = json.loads((run / "results.json").read_text(encoding="utf-8"))
    provenance = json.loads((run / "provenance.json").read_text(encoding="utf-8"))
    for path in (Path(regression.__file__), regression.PROTOCOL_PATH, weather.OUTPUT / "weather_manifest.json",
                 weather.OUTPUT / "train_features.csv"):
        if prep.digest(path) != provenance["input_sha256"][prep.relative(path)]:
            raise ValueError("Model code/protocol/weather provenance differs from the saved experiment")
    selection = report["selection"]
    name = selection["selected_regression"] or selection["best_experimental_candidate"]
    if name not in regression.load_protocol()["candidate_order"]:
        raise ValueError("Unsupported saved candidate identifier")
    path = run / f"{name}.joblib"
    expected = report["candidates"][name]["artifact_sha256"]
    if prep.digest(path) != expected:
        raise ValueError("Saved experimental model hash mismatch")
    model = regression.WeatherRegressor.load(path)
    return model, {"name": name, "artifact_sha256": expected,
                   "regression_run_id": report["mlflow_parent_run_id"],
                   "status": "passed_validation_checks" if selection["selected_regression"] else "experimental_not_selected",
                   "adoption_checks": report["candidates"][name]["adoption_checks"],
                   "validation_mae_m3_m3": report["candidates"][name]["validation"]["moisture"]["mae"],
                   "persistence_validation_mae_m3_m3": report["reference"]["validation"]["moisture"]["mae"],
                   "final_test_evaluated": False, "refit_on_all_data": False}


def management(day: date, request: ScenarioRequest, cover_choice: bool) -> dict:
    planted = day >= request.cover_planting_date
    after_termination = day > request.cover_termination_date
    phase = ("fallow_before_cover" if not planted else "fallow_after_cover" if after_termination else "cover_period")
    return {"treatment": request.cover_crop if cover_choice and planted else "fallow",
            "management_phase": phase,
            "cover_active": int(cover_choice and request.cover_planting_date <= day < request.cover_termination_date),
            "days_since_cover_planting": (day - request.cover_planting_date).days if cover_choice and planted else None,
            "days_since_cover_termination": (day - request.cover_termination_date).days
                if cover_choice and day >= request.cover_termination_date else None}


class ScenarioEngine:
    def __init__(self, model, history: list[dict], default_moisture: float, model_info: dict,
                 weather_info: dict, default_info: dict):
        self.model, self.history, self.default_moisture = model, history, default_moisture
        self.model_info, self.weather_info, self.default_info = model_info, weather_info, default_info
        self.policy = load_protocol()

    @classmethod
    def from_artifacts(cls, regression_run: Path | None = None):
        model, model_info = load_saved_model(regression_run)
        history, weather_info = load_history()
        default, default_info = load_default_moisture()
        return cls(model, history, default, model_info, weather_info, default_info)

    def simulate(self, request: ScenarioRequest) -> dict:
        selected, audit = select_scenarios(request, self.history, self.policy)
        initial = self.default_moisture if request.initial_soil_moisture_m3_m3 is None else request.initial_soil_moisture_m3_m3
        provenance = self.default_info if request.initial_soil_moisture_m3_m3 is None else {"source": "user_supplied"}
        dates = list(prep.days(request.decision_date + timedelta(days=1), request.next_crop_planting_date))
        irrigation = {event.date: event.amount_mm for event in request.irrigation_schedule}
        states = [initial] * (len(selected) * 2)
        trajectories = [[] for _ in selected]
        diagnostics = [{"cover_clipped_days": 0, "fallow_clipped_days": 0,
                        "cover_unseen_phase_days": 0, "fallow_unseen_phase_days": 0,
                        "cover_out_of_training_range": Counter(), "fallow_out_of_training_range": Counter()}
                       for _ in selected]
        for step, day in enumerate(dates):
            inputs = []
            for index, scenario in enumerate(selected):
                daily_weather = scenario["sequence"][step]
                for choice in (True, False):
                    inputs.append({"date": day.isoformat(), **management(day, request, choice),
                                   "previous_moisture_m3_m3": states[index * 2 + (0 if choice else 1)],
                                   "irrigation_mm": irrigation.get(day, 0),
                                   **{key: daily_weather[key] for key in WEATHER_COLUMNS}})
            states, clipped, unseen = self.model.predict_many(inputs)
            if len(states) != len(inputs) or len(clipped) != len(inputs) or len(unseen) != len(inputs):
                raise ValueError("Scenario model returned an unexpected prediction shape")
            if any(not math.isfinite(v) or not 0 <= v <= 1 for v in states):
                raise ValueError("Scenario model returned invalid bounded moisture")
            frame = regression.feature_frame(inputs)
            for index, scenario in enumerate(selected):
                cover_index, fallow_index = index * 2, index * 2 + 1
                for label, position in (("cover", cover_index), ("fallow", fallow_index)):
                    diagnostics[index][f"{label}_clipped_days"] += int(clipped[position])
                    diagnostics[index][f"{label}_unseen_phase_days"] += int(unseen[position])
                    for key, bounds in self.model.metadata["numeric_training_ranges"].items():
                        if not bounds["min"] <= float(frame.iloc[position][key]) <= bounds["max"]:
                            diagnostics[index][f"{label}_out_of_training_range"][key] += 1
                daily_weather = scenario["sequence"][step]
                trajectories[index].append({"date": day.isoformat(), "historical_weather_date": daily_weather["date"],
                                            **{key: daily_weather[key] for key in WEATHER_COLUMNS},
                                            "irrigation_mm": irrigation.get(day, 0),
                                            "management_phase": inputs[cover_index]["management_phase"],
                                            "cover_active": inputs[cover_index]["cover_active"],
                                            "cover_moisture_m3_m3": states[cover_index],
                                            "fallow_moisture_m3_m3": states[fallow_index],
                                            "cover_prediction_clipped": bool(clipped[cover_index]),
                                            "fallow_prediction_clipped": bool(clipped[fallow_index]),
                                            "cover_unseen_phase": bool(unseen[cover_index]),
                                            "fallow_unseen_phase": bool(unseen[fallow_index])})
        results = []
        for index, scenario in enumerate(selected):
            trajectory = trajectories[index]
            last, tail = trajectory[-1], trajectory[-7:]
            cover_average = statistics.fmean(r["cover_moisture_m3_m3"] for r in tail)
            fallow_average = statistics.fmean(r["fallow_moisture_m3_m3"] for r in tail)
            diagnostic = {key: dict(sorted(value.items())) if isinstance(value, Counter) else value
                          for key, value in diagnostics[index].items()}
            maximum_difference = max(abs(r["cover_moisture_m3_m3"] - r["fallow_moisture_m3_m3"]) for r in trajectory)
            diagnostic["maximum_absolute_cover_fallow_difference_m3_m3"] = maximum_difference
            tail_difference = max(abs(r["cover_moisture_m3_m3"] - r["fallow_moisture_m3_m3"]) for r in tail)
            diagnostic["final_week_maximum_absolute_cover_fallow_difference_m3_m3"] = tail_difference
            flags = ["experimental_seasonal_rollout", "seasonal_rollout_unvalidated", "surface_moisture_only",
                     "station_day_alignment_assumed"]
            if maximum_difference <= 1e-12:
                flags.append("no_detectable_cover_response")
            if tail_difference <= 1e-12:
                flags.append("no_detectable_final_week_cover_response")
            if len({s["total_rain_mm"] for s in selected}) != len(selected):
                flags.append("selected_rainfall_totals_not_distinct")
            if self.model_info["status"] == "experimental_not_selected":
                flags.append("model_failed_validation_adoption_checks")
            if diagnostic["cover_unseen_phase_days"] or diagnostic["fallow_unseen_phase_days"]:
                flags.append("unseen_management_phase")
            if diagnostic["cover_clipped_days"] or diagnostic["fallow_clipped_days"]:
                flags.append("moisture_predictions_clipped")
            if diagnostic["cover_out_of_training_range"] or diagnostic["fallow_out_of_training_range"]:
                flags.append("features_outside_training_range")
            results.append({**{key: value for key, value in scenario.items() if key != "sequence"},
                            "simulation_days": len(trajectory), "total_irrigation_mm": math.fsum(irrigation.values()),
                            "cover_moisture_at_planting_m3_m3": last["cover_moisture_m3_m3"],
                            "fallow_moisture_at_planting_m3_m3": last["fallow_moisture_m3_m3"],
                            "cover_final_7_day_average_m3_m3": cover_average,
                            "fallow_final_7_day_average_m3_m3": fallow_average,
                            "final_7_day_moisture_difference_m3_m3": cover_average - fallow_average,
                            "minimum_cover_moisture_m3_m3": min(r["cover_moisture_m3_m3"] for r in trajectory),
                            "minimum_fallow_moisture_m3_m3": min(r["fallow_moisture_m3_m3"] for r in trajectory),
                            "persistence_reference_moisture_m3_m3": initial,
                            "diagnostics": diagnostic, "quality_flags": flags, "daily_trajectory": trajectory})
        return {"scenario_version": self.policy["version"], "site_id": request.site_id,
                "request": request.model_dump(mode="json"), "model": self.model_info,
                "weather": self.weather_info, "initial_moisture_m3_m3": initial,
                "initial_moisture_provenance": provenance,
                "sensor_depth_cm": 5, "moisture_unit": "m3/m3", "recommendation_ready": False,
                "scenario_probabilities_assigned": False,
                "selection_audit": audit, "scenarios": results,
                "assumptions": ["Historical rainfall cases are scenarios, not forecasts or confidence intervals.",
                                "Both options receive identical initial water, weather, and irrigation.",
                                "Cover residue effects are not explicitly modeled; post-termination differences are experimental.",
                                "Planting-date moisture is an end-of-day estimate; following-wheat growth is not simulated.",
                                "No yield, money, risk category, or planting advice is calculated in Task 5."]}


def write_demo(engine: ScenarioEngine, request: ScenarioRequest, output: Path) -> dict:
    started = time.perf_counter()
    result = engine.simulate(request)
    elapsed = time.perf_counter() - started
    verification = {"scenario_protocol_sha256": prep.digest(PROTOCOL_PATH),
                    "scenario_code_sha256": prep.digest(Path(__file__)), "simulation_seconds": elapsed,
                    "source_model_artifact_sha256": engine.model_info["artifact_sha256"],
                    "final_test_evaluated": False, "refit_on_all_data": False}
    output.mkdir(parents=True, exist_ok=True)
    result_text = prep.json_text(result)
    flat = [{"scenario": s["scenario"], **row} for s in result["scenarios"] for row in s["daily_trajectory"]]
    audit = result["selection_audit"]
    artifacts = {"request.json": prep.json_text(request.model_dump(mode="json")),
                 "results.json": result_text, "verification.json": prep.json_text(verification),
                 "trajectories.csv": prep.csv_text(flat, list(flat[0])),
                 "selection_audit.csv": prep.csv_text(audit, list(audit[0]))}
    lines = ["# Clovis Task 5: historical weather scenarios", "",
             f"Model: **{engine.model_info['name']}**; status: **{engine.model_info['status']}**.",
             "Seasonal predictions are unvalidated. Read model adoption checks and scenario diagnostics before interpreting them.", "",
             "| Case | Historical interval | Rain mm | Cover moisture | Fallow moisture | Final-week difference | Clipped cover/fallow days |",
             "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    for scenario in result["scenarios"]:
        lines.append(f"| {scenario['scenario']} | {scenario['historical_start_date']} to {scenario['historical_end_date']} | {scenario['total_rain_mm']:.2f} | {scenario['cover_moisture_at_planting_m3_m3']:.4f} | {scenario['fallow_moisture_at_planting_m3_m3']:.4f} | {scenario['final_7_day_moisture_difference_m3_m3']:.6f} | {scenario['diagnostics']['cover_clipped_days']}/{scenario['diagnostics']['fallow_clipped_days']} |")
    lines.extend(["", "Moisture is a volumetric fraction at 5 cm. These are end-of-planting-date simulations, not measured outcomes.",
                  "", "## Limitations", ""])
    lines.extend(f"- {note}" for note in result["assumptions"])
    if any("no_detectable_cover_response" in s["quality_flags"] for s in result["scenarios"]):
        lines.append("- Identical cover/fallow trajectories occur in at least one case. This model output does not establish that cover crops have no water effect.")
    if any("no_detectable_final_week_cover_response" in s["quality_flags"] for s in result["scenarios"]):
        lines.append("- Cover and fallow have identical final-week estimates in at least one case. This is not evidence of a zero crop effect; inspect earlier differences and clipping before using the comparison.")
    if any("moisture_predictions_clipped" in s["quality_flags"] for s in result["scenarios"]):
        lines.append("- At least one trajectory hits the broad [0,1] mathematical bounds. These are not soil-specific field capacity or saturation limits; clipping does not make the trajectory agronomically valid.")
    lines.extend(["- Clipping, unseen phases, and out-of-training-range feature counts are retained in each scenario's diagnostics.",
                  "- Final-test labels were not used. No model was retrained or promoted.", ""])
    artifacts["summary.md"] = "\n".join(lines)
    for name, text in artifacts.items():
        weather.write_text(output / name, text)
    return {"output": str(output.resolve()), "model": engine.model_info["name"], "model_status": engine.model_info["status"],
            "simulation_seconds": elapsed, "initial_moisture_m3_m3": result["initial_moisture_m3_m3"],
            "scenarios": [{"scenario": s["scenario"], "historical_start_year": s["historical_start_year"],
                           "rain_mm": s["total_rain_mm"], "simulation_days": s["simulation_days"]} for s in result["scenarios"]]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path, default=EXAMPLE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--regression-run", type=Path)
    args = parser.parse_args()
    request = ScenarioRequest.model_validate_json(args.request.read_text(encoding="utf-8"))
    engine = ScenarioEngine.from_artifacts(args.regression_run)
    print(json.dumps(write_demo(engine, request, args.output.resolve()), indent=2))


if __name__ == "__main__":
    main()
