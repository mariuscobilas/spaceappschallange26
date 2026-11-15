"""Separate frozen data replay from exact-environment export reproducibility.

Read-only by default; never relabel runtime metadata, refit, or overwrite a bundle.
The original exporter deliberately requires byte-identical preparation manifests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/app/ml"))
import prepare_water_yield as prep


def compare_prepared(recorded: dict[str, bytes], rebuilt: dict[str, bytes]):
    if set(recorded) != set(rebuilt):
        raise ValueError("Prepared file membership differs")
    differences = []
    for name in sorted(recorded):
        if recorded[name] == rebuilt[name]:
            continue
        if name != "manifest.json":
            raise ValueError(f"Prepared data replay differs: {name}")
        old, new = json.loads(recorded[name]), json.loads(rebuilt[name])
        changed = sorted(key for key in set(old) | set(new) if old.get(key) != new.get(key))
        if changed != ["python"] or not isinstance(old.get("python"), str) or not isinstance(new.get("python"), str):
            raise ValueError(f"Prepared manifest differs beyond runtime provenance: {changed}")
        differences.append({"file": name, "field": "python", "recorded": old["python"], "current": new["python"]})
    return differences


def verify():
    policy = json.loads((ROOT / "apps/api/app/ml/research_export_policy_v1.json").read_text())
    for name, expected in policy["pinned_sha256"].items():
        if prep.digest(ROOT / name) != expected:
            raise ValueError(f"Pinned research source differs: {name}")
    rebuilt = prep.build_snapshot()
    recorded = {name: (prep.OUTPUT / name).read_bytes() for name in rebuilt}
    manifest = json.loads(recorded["manifest.json"])
    for name, expected in manifest["output_sha256"].items():
        if hashlib.sha256(recorded[name]).hexdigest() != expected:
            raise ValueError(f"Recorded prepared artifact hash differs: {name}")
    differences = compare_prepared(recorded, rebuilt)
    directory = ROOT / policy["output"]
    bundle = json.loads((directory / "bundle.json").read_text())
    if prep.digest(directory / bundle["artifact"]) != bundle["artifact_sha256"]:
        raise ValueError("Published model weights differ from bundle manifest")
    for key, path in (("export_code_sha256", ROOT / "scripts/export_research_yield_model.py"),
                      ("prediction_code_sha256", ROOT / "apps/api/app/ml/research_yield_model.py")):
        if prep.digest(path) != bundle[key]:
            raise ValueError(f"Published bundle code differs: {key}")
    return {"version": "research-replay-audit-v1", "data_replay_verified": True,
            "exact_prepared_replay": not differences, "current_python": platform.python_version(),
            "recorded_python": manifest["python"], "metadata_differences": differences,
            "weights_hash_verified": True, "model_fitted": False,
            "exact_export_reproduced": False,
            "interpretation": "Data bytes and frozen weights verified. Exact export reproduction requires the recorded Python and package versions; this check does not bypass the frozen exporter or claim cross-runtime refit parity."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = verify()
    content = prep.json_bytes(report)
    if args.output:
        if args.output.exists() and args.output.read_bytes() != content:
            raise ValueError("Existing audit differs; select a new output path")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if not args.output.exists():
            args.output.write_bytes(content)
    print(content.decode(), end="")


if __name__ == "__main__":
    main()
