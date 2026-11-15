"""Package a trusted compatible model for transfer; does not train or publish."""

import argparse
import json
from pathlib import Path

from app.ml.model_bundle import export_bundle


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--regression-run", type=Path)
    args = parser.parse_args()
    manifest = export_bundle(args.output.resolve(), args.regression_run)
    print(json.dumps({"bundle": str(args.output.resolve()), "artifact_sha256": manifest["artifact_sha256"]}, indent=2))
