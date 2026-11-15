"""Restore missing local pointers for legacy Clovis tests from published frozen runs.

No training, downloads, model selection changes or overwriting existing pointers.
The HTTP demo can instead use FIELD_SHIFT_MODEL_BUNDLE as documented previously.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "data/experiments/clovis_baselines/runs/20261114T192248000084Z-95c5a282"
REGRESSION = "data/experiments/clovis_regression/runs/20261114T193321417362Z-e60c4eb5"
PINS = {
    BASELINE + "/results.json": "b701262ea91a4a751bee09e2fbad652fc2c2d94a17e317454b9a443418ea9b81",
    BASELINE + "/provenance.json": "6635535bce52fe903b6686e5379123d2370aa42a288aa3ffaf44a4496dcb9180",
    REGRESSION + "/results.json": "2feb9b4ebdce965fc1e66911bf406720fc8cdf425e5e9195e922f0b8a838cd7e",
    REGRESSION + "/provenance.json": "aa7e300e17feede9abd1b4c66ecfadf28b3b8451e0778b5a9572bef2e1ab1c66",
    REGRESSION + "/forest_depth_4.joblib": "0ddf72d619dbf73079ec2e19dc4bd96f5cbb2700355eede7b002b74d8dabd62d",
}


def prepare(root=ROOT):
    root = Path(root).resolve()
    for name, checksum in PINS.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != checksum:
            raise ValueError(f"Published legacy artifact differs: {name}")
    provenance = json.loads((root / REGRESSION / "provenance.json").read_text(encoding="utf-8"))
    for name, checksum in provenance["input_sha256"].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != checksum:
            raise ValueError(f"Legacy input provenance differs: {name}")
    pointers = {
        root / "data/experiments/clovis_baselines/latest.json": {
            "mlflow_run_id": "95c5a282e10d4829a143d4db0f0a95ca", "run_directory": str(root / BASELINE)},
        root / "data/experiments/clovis_regression/latest.json": {
            "mlflow_run_id": "e60c4eb5b91d4a13b6bce45138efb0af", "run_directory": str(root / REGRESSION)},
    }
    # Validate every existing pointer before writing any missing one.
    for path, expected in pointers.items():
        if path.exists() and json.loads(path.read_text(encoding="utf-8")) != expected:
            raise ValueError(f"Existing pointer differs; no files changed: {path}")
    created = 0
    for path, expected in pointers.items():
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("x", encoding="utf-8") as stream:
                stream.write(json.dumps(expected, indent=2, sort_keys=True) + "\n")
            created += 1
    print(f"Verified frozen Clovis artifacts; created {created} missing local pointers; no training or promotion")


if __name__ == "__main__":
    prepare()
