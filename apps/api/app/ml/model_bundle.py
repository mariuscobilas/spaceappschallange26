"""Portable trusted model bundles; compatible pipeline swaps preserve the HTTP contract."""

import json
import shutil
from pathlib import Path

from .runtime import scenario_module


def load_bundle(directory: Path) -> tuple[object, dict]:
    legacy = scenario_module()
    manifest = json.loads((directory / "bundle.json").read_text(encoding="utf-8"))
    if manifest["format_version"] != "field-shift-model-bundle-v1":
        raise ValueError("Unsupported model bundle version")
    filename = manifest["artifact"]
    if filename != Path(filename).name or not filename.endswith(".joblib"):
        raise ValueError("Bundle artifact must be a local joblib filename")
    artifact = directory / filename
    if legacy.prep.digest(artifact) != manifest["artifact_sha256"]:
        raise ValueError("Model bundle hash mismatch")
    model = legacy.regression.WeatherRegressor.load(artifact)
    if manifest["feature_columns"] != model.metadata["feature_columns"] or manifest["sklearn_version"] != model.metadata["sklearn_version"]:
        raise ValueError("Bundle feature/runtime metadata differs")
    info = manifest["model_info"]
    if model.name != info["name"] or manifest["artifact_sha256"] != info["artifact_sha256"]:
        raise ValueError("Bundle model identity differs")
    return model, info


def export_bundle(directory: Path, regression_run: Path | None = None) -> dict:
    legacy = scenario_module()
    model, info = legacy.load_saved_model(regression_run)
    directory.mkdir(parents=True, exist_ok=True)
    if regression_run is None:
        pointer = legacy.prep.ROOT / "data/experiments/clovis_regression/latest.json"
        regression_run = Path(json.loads(pointer.read_text(encoding="utf-8"))["run_directory"])
    destination = directory / "model.joblib"
    if destination.exists() and legacy.prep.digest(destination) != info["artifact_sha256"]:
        raise ValueError("Use a new bundle directory instead of overwriting a different model")
    shutil.copyfile(regression_run / f"{model.name}.joblib", destination)
    manifest = {"format_version": "field-shift-model-bundle-v1", "artifact": destination.name,
                "artifact_sha256": info["artifact_sha256"], "model_info": info,
                "feature_columns": model.metadata["feature_columns"], "sklearn_version": model.metadata["sklearn_version"]}
    (directory / "bundle.json").write_text(legacy.prep.json_text(manifest), encoding="utf-8")
    return manifest
