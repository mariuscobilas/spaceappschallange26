"""Portable numeric Ridge research weights; independent of the production model bundle."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path


def predict_yield(model, features, units):
    """Return unbounded t/ha, requiring exact named features and their source units."""
    names = model["features"]
    if model["format"] != "field-shift-research-ridge-v1" or model["status"] != "retrospective_research_only" or model["farmer_ready"] is not False:
        raise ValueError("Unsupported research model")
    if set(features) != set(names) or units != model["feature_units"]:
        raise ValueError("Research feature names/units differ")
    arrays = [model[key] for key in ("scaler_mean", "scaler_scale", "scaled_coefficients")]
    if len(set(names)) != len(names) or any(len(values) != len(names) for values in arrays):
        raise ValueError("Invalid model dimensions")
    values = [features[name] for name in names]
    numeric = values + [model["intercept"]] + [v for array in arrays for v in array]
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in numeric):
        raise ValueError("Nonfinite or nonnumeric research inputs/weights")
    if any(scale <= 0 for scale in model["scaler_scale"]):
        raise ValueError("Nonpositive scale")
    prediction = model["intercept"] + math.fsum((v - mean) / scale * coefficient for v, mean, scale, coefficient in zip(values, *arrays))
    if not math.isfinite(prediction):
        raise ValueError("Nonfinite prediction")
    return prediction


def load_research_model(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "bundle.json").read_text(encoding="utf-8"))
    if manifest["format"] != "field-shift-research-bundle-v1" or manifest["artifact"] != "model.json":
        raise ValueError("Unsupported research bundle")
    content = (directory / "model.json").read_bytes()
    if hashlib.sha256(content).hexdigest() != manifest["artifact_sha256"]:
        raise ValueError("Research model hash mismatch")
    model = json.loads(content)
    # Validate dimensions and all weights using a finite reference input.
    predict_yield(model, dict(zip(model["features"], model["scaler_mean"])), model["feature_units"])
    return model
