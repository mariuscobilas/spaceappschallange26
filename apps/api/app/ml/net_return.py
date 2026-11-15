"""Research-only economics for paired cover-minus-fallow yield predictions.

All monetary assumptions are supplied by the caller. This module contains no
market defaults and does not produce calibrated uncertainty estimates.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Iterable

REQUIRED_ASSUMPTIONS = (
    "crop_price_usd_per_t",
    "cover_income_usd_per_ha",
    "incentive_usd_per_ha",
    "seed_cost_usd_per_ha",
    "establishment_cost_usd_per_ha",
    "termination_cost_usd_per_ha",
    "other_additional_cost_usd_per_ha",
)


def _number(value: object, name: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a finite number") from exc
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite number")
    return result


def net_return_per_ha(delta_yield_t_ha: float, assumptions: dict) -> float:
    """Incremental cover-minus-fallow net return in USD/ha."""
    missing = [name for name in REQUIRED_ASSUMPTIONS if name not in assumptions or assumptions[name] is None]
    if missing:
        raise ValueError("Missing monetary assumptions: " + ", ".join(missing))
    values = {name: _number(assumptions[name], name) for name in REQUIRED_ASSUMPTIONS}
    for name in REQUIRED_ASSUMPTIONS:
        if values[name] < 0:
            raise ValueError(f"{name} cannot be negative")
    yield_delta = _number(delta_yield_t_ha, "delta_yield_t_ha")
    result = (values["crop_price_usd_per_t"] * yield_delta
            + values["cover_income_usd_per_ha"] + values["incentive_usd_per_ha"]
            - values["seed_cost_usd_per_ha"] - values["establishment_cost_usd_per_ha"]
            - values["termination_cost_usd_per_ha"] - values["other_additional_cost_usd_per_ha"])
    if not math.isfinite(result):
        raise ValueError("Net return arithmetic overflowed to a nonfinite result")
    return result


def break_even_yield_t_ha(assumptions: dict) -> float | None:
    """Yield change needed to break even; undefined at a zero crop price."""
    missing = [name for name in REQUIRED_ASSUMPTIONS if name not in assumptions or assumptions[name] is None]
    if missing:
        raise ValueError("Missing monetary assumptions: " + ", ".join(missing))
    price = _number(assumptions["crop_price_usd_per_t"], "crop_price_usd_per_t")
    if price < 0:
        raise ValueError("Crop price cannot be negative")
    other = net_return_per_ha(0.0, assumptions)
    return None if price == 0 else -other / price


def policy_gate(*, net_return_lower_bound_usd_per_ha: float | None,
                yield_lower_bound_t_ha: float | None, uncertainty_independently_validated: bool,
                max_tolerable_yield_loss_t_ha: float) -> dict:
    """Conservative gate. Missing/unvalidated uncertainty always abstains."""
    tolerance = _number(max_tolerable_yield_loss_t_ha, "max_tolerable_yield_loss_t_ha")
    if tolerance < 0:
        raise ValueError("Maximum tolerable yield loss must be nonnegative")
    reasons = []
    if not uncertainty_independently_validated:
        reasons.append("uncertainty_not_independently_validated")
    if net_return_lower_bound_usd_per_ha is None or yield_lower_bound_t_ha is None:
        reasons.append("conservative_bounds_unavailable")
    else:
        net_bound = _number(net_return_lower_bound_usd_per_ha, "net_return_lower_bound_usd_per_ha")
        yield_bound = _number(yield_lower_bound_t_ha, "yield_lower_bound_t_ha")
        if net_bound <= 0:
            reasons.append("net_return_lower_bound_not_positive")
        if yield_bound < -tolerance:
            reasons.append("yield_loss_limit_exceeded")
    return {"recommend_cover": not reasons, "action": "cover" if not reasons else "abstain",
            "reasons": reasons, "max_tolerable_yield_loss_t_ha": tolerance}


def _macro_year_mae(rows: list[dict], prediction_key: str) -> float | None:
    by_year: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        by_year[str(row["year"])].append(abs(float(row[prediction_key]) - float(row["observed"])))
    return sum(sum(v) / len(v) for v in by_year.values()) / len(by_year) if by_year else None


def evaluate_oof(rows: Iterable[dict], *, benefit_tolerance_t_ha: float = 0.0,
                 method: str | None = None) -> dict:
    """Score complete OOF pair contrasts against fallow and fold training mean.

    Expected columns follow Mandan OOF exports: task, item_id, year,
    control_id, unit, observed, predicted. Means are recomputed from other
    years only. This supports a descriptive baseline, not confidence intervals.
    """
    items = [dict(r) for r in rows]
    if not items:
        raise ValueError("OOF CSV has no rows")
    available_methods = sorted({str(r.get("method", "model")) for r in items})
    if method is None:
        if len(available_methods) > 1:
            raise ValueError("OOF CSV contains multiple methods; select one with --method")
        method = available_methods[0]
    items = [r for r in items if str(r.get("method", "model")) == method]
    if not items:
        raise ValueError(f"Requested method not found: {method}")
    tol = _number(benefit_tolerance_t_ha, "benefit_tolerance_t_ha")
    if tol < 0:
        raise ValueError("Benefit tolerance must be nonnegative")
    seen: set[tuple[str, str]] = set()
    control_year: dict[str, str] = {}
    for r in items:
        for field in ("task", "item_id", "year", "control_id", "unit", "observed", "predicted"):
            if field not in r or r[field] in (None, ""):
                raise ValueError(f"OOF row missing {field}")
        if r["task"] != "yield_difference":
            raise ValueError("OOF CSV must contain yield_difference rows")
        if r["unit"] != "t/ha":
            raise ValueError("Yield difference unit must be t/ha")
        r["year"] = str(r["year"])
        if r.get("role") not in (None, "", "evaluation", "held_out"):
            raise ValueError("OOF predictions must be evaluation/held-out rows")
        training_years = r.get("training_years")
        if training_years not in (None, ""):
            parsed = {part.strip() for part in str(training_years).replace(";", ",").split(",") if part.strip()}
            if r["year"] in parsed:
                raise ValueError("Held-out year overlaps supplied training years")
        r["observed"] = _number(r["observed"], "observed")
        r["predicted"] = _number(r["predicted"], "predicted")
        key = (r["year"], str(r["item_id"]))
        if key in seen:
            raise ValueError("Duplicate OOF item prediction")
        seen.add(key)
        control = str(r["control_id"])
        if not control:
            raise ValueError("OOF row missing control_id")
        if control:
            old_year = control_year.setdefault(control, r["year"])
            if old_year != r["year"]:
                raise ValueError("Shared control spans years; verify grouping")
    years = sorted({r["year"] for r in items})
    if len(years) < 2:
        raise ValueError("At least two years are required for a training-only mean baseline")
    fold_means = {}
    for year in years:
        train = [r["observed"] for r in items if r["year"] != year]
        fold_means[year] = sum(train) / len(train) if train else 0.0
    for r in items:
        r["always_fallow_prediction"] = 0.0
        r["training_mean_prediction"] = fold_means[r["year"]]
    methods = {"model": "predicted", "always_fallow": "always_fallow_prediction",
               "training_mean": "training_mean_prediction"}
    scores = {}
    for score_name, key in methods.items():
        errs = [abs(r[key] - r["observed"]) for r in items]
        cover_calls = [r[key] > tol for r in items]
        actual_benefit = [r["observed"] > tol for r in items]
        scores[score_name] = {"pooled_mae_t_ha": sum(errs) / len(errs),
            "macro_year_mae_t_ha": _macro_year_mae(items, key), "n_pairs": len(items),
            "predicted_cover_n": sum(cover_calls), "observed_benefit_n": sum(actual_benefit),
            "benefits_detected_n": sum(p and a for p, a in zip(cover_calls, actual_benefit)),
            "harmful_cover_calls_n": sum(p and r["observed"] < -tol for p, r in zip(cover_calls, items))}
    controls = {str(r.get("control_id")) for r in items if r.get("control_id") not in (None, "")}
    return {"method": method, "n_pairs": len(items), "n_years": len(years), "n_shared_controls": len(controls),
            "uncertainty_intervals": "not estimated; pairs share controls and years",
            "scores": scores, "training_mean_by_held_out_year_t_ha": fold_means}


def monetary_sensitivity(rows: list[dict], scenarios: list[dict], *, area_ha: float | None = None) -> dict:
    """Apply named, caller-supplied scenarios to observed and predicted contrasts."""
    if not rows:
        raise ValueError("At least one OOF row is required for monetary sensitivity")
    if area_ha is not None and _number(area_ha, "area_ha") <= 0:
        raise ValueError("Area must be positive")
    output = {}
    for scenario in scenarios:
        name = scenario.get("name")
        if not isinstance(name, str) or not name.strip() or name in output:
            raise ValueError("Scenarios require unique nonempty names")
        assumptions = scenario.get("assumptions", {})
        try:
            observed = [net_return_per_ha(float(r["observed"]), assumptions) for r in rows]
            predicted = [net_return_per_ha(float(r["predicted"]), assumptions) for r in rows]
        except ValueError as exc:
            output[name] = {"status": "unconfigured", "reason": str(exc)}
            continue
        if any("training_mean_prediction" not in r for r in rows):
            raise ValueError("Rows require fold-specific training_mean_prediction for baseline economics")
        strategies = {"model": lambda r: net_return_per_ha(float(r["predicted"]), assumptions) > 0,
                      "always_fallow": lambda r: False,
                      "training_mean": lambda r: net_return_per_ha(float(r["training_mean_prediction"]), assumptions) > 0}
        decisions = {}
        for strategy, choose_cover in strategies.items():
            net_errors = [net_return_per_ha(float(r["observed"]), assumptions) for r in rows]
            pairs = []
            for r, actual_net in zip(rows, net_errors):
                cover = choose_cover(r)
                pairs.append({"year": str(r["year"]), "control": str(r["control_id"]),
                              "regret": max(0.0, actual_net) - (actual_net if cover else 0.0),
                              "harmful_cover": cover and actual_net < 0,
                              "missed_opportunity": (not cover) and actual_net > 0,
                              "payoff": actual_net if cover else 0.0})
            by_year = defaultdict(list)
            for pair in pairs:
                by_year[pair["year"]].append(pair)
            macro = lambda key: sum(sum(p[key] for p in group) / len(group) for group in by_year.values()) / len(by_year)
            by_control = defaultdict(list)
            for pair in pairs:
                by_control[(pair["year"], pair["control"])].append(pair["regret"])
            control_year = defaultdict(list)
            for (year, _), values in by_control.items():
                control_year[year].append(sum(values) / len(values))
            control_macro = sum(sum(v) / len(v) for v in control_year.values()) / len(control_year)
            decisions[strategy] = {"mean_payoff_usd_per_ha": sum(p["payoff"] for p in pairs) / len(pairs),
                "macro_year_payoff_usd_per_ha": macro("payoff"),
                "mean_regret_usd_per_ha": sum(p["regret"] for p in pairs) / len(pairs),
                "macro_year_regret_usd_per_ha": macro("regret"),
                "control_balanced_macro_year_regret_usd_per_ha": control_macro,
                "harmful_cover_calls_n": sum(p["harmful_cover"] for p in pairs),
                "missed_opportunities_n": sum(p["missed_opportunity"] for p in pairs)}
        scenario_result = {"status": "configured", "currency": "USD", "unit": "USD/ha",
            "observed_mean_net_return": sum(observed) / len(observed) if observed else None,
            "predicted_mean_net_return": sum(predicted) / len(predicted) if predicted else None,
            "break_even_yield_t_ha": break_even_yield_t_ha(assumptions),
            "decision_diagnostics": decisions}
        if area_ha is not None:
            scenario_result["area_ha"] = float(area_ha)
            scenario_result["observed_mean_field_net_return_usd"] = scenario_result["observed_mean_net_return"] * float(area_ha)
            scenario_result["predicted_mean_field_net_return_usd"] = scenario_result["predicted_mean_net_return"] * float(area_ha)
        output[name] = scenario_result
    return output
