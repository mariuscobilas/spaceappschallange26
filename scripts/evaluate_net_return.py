#!/usr/bin/env python3
"""Standalone economics report from paired out-of-fold yield contrasts."""
from __future__ import annotations

import argparse
import csv
import hashlib
import math
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/app/ml"))
from net_return import evaluate_oof, monetary_sensitivity, policy_gate  # noqa: E402


def load_scenarios(path: Path | None) -> tuple[list[dict], bool]:
    if path is None:
        return [], False
    payload = json.loads(path.read_text(encoding="utf-8"))
    scenarios = payload.get("scenarios")
    if not isinstance(scenarios, list):
        raise ValueError("Assumptions JSON must contain a scenarios array")
    return scenarios, True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("oof_csv", type=Path, help="Paired yield_difference OOF predictions CSV")
    parser.add_argument("--assumptions", type=Path, help="JSON with named, explicit monetary scenarios")
    parser.add_argument("--output", type=Path, help="Write JSON report here (default: stdout)")
    parser.add_argument("--area-ha", type=float, help="Optional positive field area for whole-field totals")
    parser.add_argument("--benefit-tolerance-t-ha", type=float, default=0.0)
    parser.add_argument("--method", help="Select model method when OOF CSV contains multiple methods")
    parser.add_argument("--max-tolerable-yield-loss-t-ha", type=float, default=0.0,
                        help="Explicit loss limit; default permits no predicted yield reduction")
    args = parser.parse_args()
    if args.area_ha is not None and (not math.isfinite(args.area_ha) or args.area_ha <= 0):
        raise ValueError("Area must be a positive finite number")
    with args.oof_csv.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))
    rows = [row for row in rows if row.get("task") == "yield_difference"]
    if not rows:
        raise ValueError("OOF CSV contains no task=yield_difference rows")
    scenarios, configured = load_scenarios(args.assumptions)
    evaluation = evaluate_oof(rows, benefit_tolerance_t_ha=args.benefit_tolerance_t_ha, method=args.method)
    rows = [r for r in rows if str(r.get("method", "model")) == evaluation["method"]]
    for row in rows:
        row["training_mean_prediction"] = evaluation["training_mean_by_held_out_year_t_ha"][str(row["year"])]
    sensitivity = monetary_sensitivity(rows, scenarios, area_ha=args.area_ha) if scenarios else {}
    all_scenarios_configured = bool(sensitivity) and all(v["status"] == "configured" for v in sensitivity.values())
    report = {"input_oof_csv": str(args.oof_csv),
        "input_oof_sha256": hashlib.sha256(args.oof_csv.read_bytes()).hexdigest(),
        "evaluator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "net_return_module_sha256": hashlib.sha256((ROOT / "apps/api/app/ml/net_return.py").read_bytes()).hexdigest(),
        "evaluation": evaluation,
        "financial_configuration": "configured" if configured and all_scenarios_configured else "configuration_missing",
        "monetary_sensitivity": sensitivity,
        "decision_gate": policy_gate(net_return_lower_bound_usd_per_ha=None, yield_lower_bound_t_ha=None,
            uncertainty_independently_validated=False,
            max_tolerable_yield_loss_t_ha=args.max_tolerable_yield_loss_t_ha),
        "interpretation": "Research-only retrospective paired contrasts. No calibrated forecast probabilities or validated uncertainty bounds are available; abstain.",
        "area_ha": args.area_ha}
    serialized = json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
    else:
        print(serialized, end="")


if __name__ == "__main__":
    main()
