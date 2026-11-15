"""Audit temporal split coverage and export label-free candidate memberships."""

from __future__ import annotations

import argparse
import copy
import json
import math
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import prepare_clovis as prep
import prepare_clovis_weather as weather

PROTOCOL_PATH = Path(__file__).with_name("clovis_split_audit_protocol.json")
OUTPUT = prep.ROOT / "data/analysis/clovis_split_audit_v1"
PARTITIONS = ("train", "validation", "test")


def load_protocol():
    return json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))


def pooled_pairs(observations):
    """Reconstruct usable one-day pairs without the old allocation's purge days."""
    pooled = [{**row, "partition": "pool"} for row in observations]
    return prep.make_pairs(pooled)[0]


def cutoffs(eligible_dates, ratios):
    dates = sorted(set(eligible_dates))
    train_count = math.floor(len(dates) * ratios["train"])
    validation_count = math.floor(len(dates) * ratios["validation"])
    if min(train_count, validation_count, len(dates) - train_count - validation_count) < 1:
        raise ValueError("Insufficient dates for three nonempty preliminary blocks")
    return dates[train_count - 1], dates[train_count + validation_count - 1]


def allocation(day, train_end, validation_end, buffer_days):
    if day <= train_end:
        return "train"
    if day <= train_end + timedelta(days=buffer_days):
        return "gap"
    if day <= validation_end:
        return "validation"
    if day <= validation_end + timedelta(days=buffer_days):
        return "gap"
    return "test"


def build_candidate(observations, pairs, source_protocol, policy, by_phase):
    groups = defaultdict(list)
    for pair in pairs:
        groups[pair["management_phase"] if by_phase else "all"].append(date.fromisoformat(pair["date"]))
    cuts = {key: cutoffs(values, policy["proportions_before_buffers"]) for key, values in groups.items()}
    assignments = {}
    for row in observations:
        day = date.fromisoformat(row["date"])
        key = row["management_phase"] if by_phase else "all"
        assignments[day.isoformat()] = allocation(day, *cuts[key], policy["boundary_buffer_calendar_days"])
    intervals = []
    for key, (train_end, validation_end) in sorted(cuts.items()):
        intervals.append({"group": key, "preliminary_eligible_dates": len(set(groups[key])),
                          "training_target_cutoff": train_end.isoformat(),
                          "validation_target_cutoff": validation_end.isoformat()})
    return assignments, intervals


def assess(observations, assignments, lookback_days, allow_buffer_context):
    if lookback_days < 1:
        raise ValueError("Lookback must be positive")
    lookup = {(row["date"], row["treatment"]): row for row in observations}
    if len(lookup) != len(observations):
        raise ValueError("Duplicate source date/treatment identity")
    memberships, exclusions = [], Counter()
    footprints = {partition: set() for partition in PARTITIONS}
    for row in observations:
        partition = assignments[row["date"]]
        if partition == "gap":
            exclusions["unscored_buffer_target"] += 1
            continue
        if partition not in PARTITIONS:
            raise ValueError("Unsupported partition assignment")
        day = date.fromisoformat(row["date"])
        history_dates = [(day - timedelta(days=i)).isoformat() for i in range(lookback_days, -1, -1)]
        window = [lookup.get((stamp, row["treatment"])) for stamp in history_dates]
        if any(item is None or not item["target_eligible"] for item in window):
            exclusions["missing_or_ineligible_target_or_history"] += 1
            continue
        if any(assignments[stamp] != partition
               and not (allow_buffer_context and assignments[stamp] == "gap") for stamp in history_dates):
            exclusions["history_in_other_partition"] += 1
            continue
        footprints[partition].update(history_dates)
        memberships.append({"date": row["date"], "treatment": row["treatment"],
                            "management_phase": row["management_phase"], "partition": partition,
                            "history_start_date": history_dates[0], "lookback_days": lookback_days,
                            "uses_buffer_context": any(assignments[stamp] == "gap" for stamp in history_dates[:-1])})
    coverage = {}
    for partition in PARTITIONS:
        selected = [row for row in memberships if row["partition"] == partition]
        phase_dates = defaultdict(set)
        for row in selected:
            phase_dates[row["management_phase"]].add(row["date"])
        coverage[partition] = {"rows": len(selected), "dates": len({r["date"] for r in selected}),
                               "fraction_accepted_rows": len(selected) / len(memberships) if memberships else 0,
                               "first_target_date": min((r["date"] for r in selected), default=None),
                               "last_target_date": max((r["date"] for r in selected), default=None),
                               "by_phase_rows": dict(sorted(Counter(r["management_phase"] for r in selected).items())),
                               "by_phase_dates": {key: len(value) for key, value in sorted(phase_dates.items())},
                               "by_treatment_rows": dict(sorted(Counter(r["treatment"] for r in selected).items())),
                               "uses_buffer_context_rows": sum(r["uses_buffer_context"] for r in selected)}
    chronology = {}
    for earlier, later in (("train", "validation"), ("train", "test"), ("validation", "test")):
        end = coverage[earlier]["last_target_date"]
        chronology[f"{later}_target_rows_on_or_before_latest_{earlier}_target"] = sum(
            row["partition"] == later and end is not None and row["date"] <= end for row in memberships)
    overlaps = {f"{a}_vs_{b}": sorted(footprints[a] & footprints[b])
                for a, b in (("train", "validation"), ("train", "test"), ("validation", "test"))}
    by_date = defaultdict(set)
    for row in memberships:
        by_date[row["date"]].add(row["partition"])
    phases = {row["management_phase"] for row in observations}
    summary = {"lookback_days": lookback_days, "buffer_context_allowed": allow_buffer_context,
               "accepted_rows": len(memberships), "accepted_dates": len(by_date), "coverage": coverage,
               "exclusions": dict(sorted(exclusions.items())), "chronology": chronology,
               "globally_chronological": all(value == 0 for value in chronology.values()),
               "every_phase_in_every_partition": all(set(value["by_phase_rows"]) == phases for value in coverage.values()),
               "same_date_treatment_partition_conflicts": sum(len(value) != 1 for value in by_date.values()),
               "shared_moisture_date_footprints": overlaps,
               "all_moisture_date_footprints_disjoint": not any(overlaps.values())}
    if summary["same_date_treatment_partition_conflicts"] or not summary["all_moisture_date_footprints_disjoint"]:
        raise ValueError("Candidate contains split identity or moisture-footprint leakage")
    return summary, sorted(memberships, key=lambda r: (r["date"], r["treatment"]))


def assignment_intervals(assignments):
    """Convert date membership into explicit intervals suitable for a later v2 protocol."""
    intervals = []
    for stamp, partition in sorted(assignments.items()):
        if (intervals and intervals[-1]["name"] == partition
                and date.fromisoformat(stamp) == date.fromisoformat(intervals[-1]["end"]) + timedelta(days=1)):
            intervals[-1]["end"] = stamp
        else:
            intervals.append({"name": partition, "start": stamp, "end": stamp})
    return intervals


def make_plot(variants, source_protocol, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    names = list(variants)
    fig, axes = plt.subplots(3, 2, figsize=(13, 9), layout="constrained")
    colors = {"train": "#3579ad", "validation": "#e4a93b", "test": "#9856a1", "gap": "#dddddd"}
    phases = [item["name"] for item in source_protocol["phases"]]
    first = date.fromisoformat(source_protocol["observation_start"])
    for index, name in enumerate(names):
        variant = variants[name]
        counts = variant["primary"]["coverage"]
        bottom = np.zeros(len(phases))
        for part in PARTITIONS:
            values = [counts[part]["by_phase_dates"].get(phase, 0) for phase in phases]
            axes[index, 0].bar(range(len(phases)), values, bottom=bottom, color=colors[part], label=part)
            bottom += values
        axes[index, 0].set_xticks(range(len(phases)), [phase.replace("_", " ") for phase in phases], rotation=18, ha="right", fontsize=8)
        axes[index, 0].set_ylabel("Eligible target dates")
        axes[index, 0].set_title(name.replace("_", " "), fontsize=10)
        for interval in assignment_intervals(variant["assignments"]):
            start, end = date.fromisoformat(interval["start"]), date.fromisoformat(interval["end"])
            axes[index, 1].broken_barh([((start - first).days, (end - start).days + 1)], (0, 1), facecolors=colors[interval["name"]])
        for phase in source_protocol["phases"]:
            start, end = date.fromisoformat(phase["start"]), date.fromisoformat(phase["end"])
            position = ((start - first).days + (end - first).days) / 2
            axes[index, 1].text(position, 1.12, phase["name"].replace("_", "\n"), ha="center", fontsize=8)
        axes[index, 1].set_ylim(-0.2, 1.9)
        axes[index, 1].set_xlim(0, (date.fromisoformat(source_protocol["observation_end"]) - first).days + 1)
        axes[index, 1].set_yticks([])
        axes[index, 1].set_xlabel("Calendar days since 16 July 2022")
        axes[index, 1].set_title("Date allocation; gray = unscored buffer", fontsize=10)
        for ax in axes[index]:
            ax.spines[["top", "right"]].set_visible(False)
    axes[0, 0].legend(fontsize=8)
    fig.suptitle("Clovis split audit: phase coverage versus future-only evaluation", fontsize=14)
    fig.savefig(output / "split_comparison.png", dpi=160)
    plt.close(fig)


def run_audit(output=OUTPUT):
    policy, source = load_protocol(), prep.load_protocol()
    weather.verify_labels(prep.OUTPUT, source)
    frozen_paths = [prep.PROTOCOL, prep.OUTPUT / "split_manifest.json",
                    prep.OUTPUT / "train_pairs.csv", prep.OUTPUT / "validation_pairs.csv", prep.OUTPUT / "test_pairs.csv"]
    before = {prep.relative(path): prep.digest(path) for path in frozen_paths}
    observations = prep.normalize(prep.read_daily(prep.DAILY, source), source)
    pairs = pooled_pairs(observations)
    original = {row["date"]: row["partition"] for row in observations}
    variants = {"original_v1": {"assignments": original, "cutoffs": source["partitions"], "allow_buffer_context": False}}
    for name, by_phase in (("global_chronological_70_15_15", False), ("phase_balanced_70_15_15", True)):
        assignments, cuts = build_candidate(observations, pairs, source, policy, by_phase)
        variants[name] = {"assignments": assignments, "cutoffs": cuts, "allow_buffer_context": True}
    output.mkdir(parents=True, exist_ok=True)
    for name, variant in variants.items():
        summary, memberships = assess(observations, variant["assignments"], policy["primary_lookback_days"], variant["allow_buffer_context"])
        sensitivity, _ = assess(observations, variant["assignments"], policy["future_history_sensitivity_days"], variant["allow_buffer_context"])
        variant["primary"], variant["three_day_history_sensitivity"] = summary, sensitivity
        folder = output / name
        folder.mkdir(exist_ok=True)
        date_rows = [{"date": stamp, "management_phase": prep.interval_name(date.fromisoformat(stamp), source["phases"]),
                      "partition": partition} for stamp, partition in sorted(variant["assignments"].items())]
        (folder / "date_assignments.csv").write_text(prep.csv_text(date_rows, list(date_rows[0])), encoding="utf-8", newline="\n")
        (folder / "eligible_target_membership.csv").write_text(prep.csv_text(memberships, list(memberships[0])), encoding="utf-8", newline="\n")
        (folder / "candidate_partitions.json").write_text(prep.json_text({
            "variant": name, "partitions": assignment_intervals(variant["assignments"]),
            "cutoffs": variant["cutoffs"], "context_policy": policy["candidate_context_policy"] if name != "original_v1" else "Both endpoints in the same original partition.",
            "fresh_independent_test": False, "status": "allocation_audit_only_no_model_training"}), encoding="utf-8")
    report = {"version": policy["version"], "source_observation_rows": len(observations),
              "pooled_eligible_pair_rows_without_original_partition_restrictions": len(pairs),
              "pooled_eligible_target_dates": len({r["date"] for r in pairs}),
              "variants": {name: {key: value for key, value in variant.items() if key != "assignments"} for name, variant in variants.items()},
              "original_inputs_unchanged": all(prep.digest(path) == before[prep.relative(path)] for path in frozen_paths),
              "target_values_used_to_select_boundaries": False, "model_trained": False,
              "fresh_independent_test": False,
              "interpretation": "Phase-balanced allocation is for exploratory historical coverage. It trains on some globally later dates than held-out targets and is not a future-season forecast test."}
    if report["variants"]["original_v1"]["primary"]["accepted_rows"] != 2648:
        raise ValueError("Original split reproduction disagrees with the frozen preparation")
    if not report["original_inputs_unchanged"]:
        raise ValueError("Frozen split inputs changed during audit")
    make_plot(variants, source, output)
    provenance = {"input_sha256": {**before, prep.relative(prep.DAILY): prep.digest(prep.DAILY),
                    prep.relative(Path(__file__)): prep.digest(Path(__file__)), prep.relative(PROTOCOL_PATH): prep.digest(PROTOCOL_PATH)},
                  "policy": policy, "all_model_artifacts_untouched": "No model is loaded or fitted by this script."}
    (output / "results.json").write_text(prep.json_text(report), encoding="utf-8")
    (output / "provenance.json").write_text(prep.json_text(provenance), encoding="utf-8")
    return {"output": str(output.resolve()), "original_inputs_unchanged": True,
            "variants": {name: {"rows": item["primary"]["accepted_rows"],
                         "partition_rows": {part: data["rows"] for part, data in item["primary"]["coverage"].items()},
                         "every_phase_in_every_partition": item["primary"]["every_phase_in_every_partition"],
                         "globally_chronological": item["primary"]["globally_chronological"]} for name, item in variants.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    print(json.dumps(run_audit(args.output.resolve()), indent=2))


if __name__ == "__main__":
    main()
