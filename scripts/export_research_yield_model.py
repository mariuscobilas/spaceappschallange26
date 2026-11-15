"""Export the best compared Colorado absolute-yield model for research transfer only."""

from __future__ import annotations

import importlib.metadata
import json
import math
import platform
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/app/ml"))
import prepare_water_yield as prep
import evaluate_water_yield as evaluation
from research_yield_model import predict_yield

POLICY = ROOT / "apps/api/app/ml/research_export_policy_v1.json"


def build_bundle():
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    for name, expected in policy["pinned_sha256"].items():
        if prep.digest(ROOT / name) != expected:
            raise ValueError(f"Export source hash mismatch: {name}")
    prepared = prep.build_snapshot()
    for name, content in prepared.items():
        if (prep.OUTPUT / name).read_bytes() != content:
            raise ValueError(f"Prepared replay differs: {name}")
    comparison = json.loads((ROOT / policy["comparison_path"]).read_text(encoding="utf-8"))
    scores = comparison["methods"]["main"][policy["feature_family"]]
    ranking = {method: score[policy["selection_metric"]] for method, score in scores.items()}
    if set(ranking) != {"ridge", "random_forest", "gradient_boosting"} or min(ranking, key=ranking.get) != policy["estimator"]:
        raise ValueError("Recorded same-cohort ranking differs from export policy")
    protocol = json.loads(prep.PROTOCOL.read_text(encoding="utf-8"))
    features = json.loads(prepared["feature_schema.json"])["families"][policy["feature_family"]]
    rows = prep.read_csv(prep.OUTPUT / "observations.csv")
    if len(rows) != 88 or {r["season_id"] for r in rows} != set(protocol["folds"]):
        raise ValueError("Export cohort differs")
    expected, fitted = evaluation.fit_predict(rows, rows, features, protocol)
    units = {protocol["water"]: "mm", **{f["feature"]: f["unit"] for f in protocol["weather_features"]}}
    model = {"format": "field-shift-research-ridge-v1", "status": policy["status"], "farmer_ready": False,
        "task": "Colorado winter-wheat absolute yield from observed sowing water and realized crop-season weather",
        "target": protocol["target"], "target_unit": "t/ha", "features": features, "feature_units": units,
        "water_definition": "0-90 cm stored water, not verified plant-available water",
        **{key: fitted[key] for key in ("scaler_mean", "scaler_scale", "scaled_coefficients", "intercept")},
        "estimator_parameters": protocol["estimator"], "training_n": len(rows), "all_data_refit": True,
        "prediction_clipping": False,
        "limitations": ["Realized crop-season weather and observed sowing water are unavailable at earlier cover planting",
            "No validated cover-versus-fallow decision or causal treatment effect", "Five exposed historical seasons, not an untouched final test",
            "Negative predictions are possible and deliberately not clipped", "Refit training fit is not held-out performance",
            "No extrapolation validation outside the source site, crop, depth and measurement definitions"]}
    predictions = [predict_yield(model, {f: float(row[f]) for f in features}, units) for row in rows]
    if any(not math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12) for a, b in zip(predictions, expected)):
        raise ValueError("Portable weights differ from fitted scikit-learn pipeline")
    content = prep.json_bytes(model)
    validation = json.loads((ROOT / policy["evaluation_path"]).read_text(encoding="utf-8"))["methods"]["main"]["water_weather"]
    manifest = {"format": "field-shift-research-bundle-v1", "artifact": "model.json",
        "artifact_sha256": __import__("hashlib").sha256(content).hexdigest(),
        "status": policy["status"], "farmer_ready": False, "all_data_refit": True,
        "production_serving_changed": False,
        "ranking_scope": policy["cohort"] + "; identical water_weather features",
        "historical_macro_season_mae_t_ha": ranking, "held_out_validation": validation,
        "validation_belongs_to": "Original cross-season fold fits, not this all-data refit",
        "source_sha256": policy["pinned_sha256"], "export_policy_sha256": prep.digest(POLICY),
        "export_code_sha256": prep.digest(Path(__file__)),
        "prediction_code_sha256": prep.digest(ROOT / "apps/api/app/ml/research_yield_model.py"),
        "runtime": {"python": platform.python_version(), **{p: importlib.metadata.version(p) for p in ("numpy", "scipy", "scikit-learn")}},
        "portable_parity_checked_rows": len(rows), "input_ranges": {f: {"min": min(float(r[f]) for r in rows), "max": max(float(r[f]) for r in rows)} for f in features}}
    for name, expected_hash in policy["pinned_sha256"].items():
        if prep.digest(ROOT / name) != expected_hash:
            raise ValueError(f"Source changed during export: {name}")
    return {"model.json": content, "bundle.json": prep.json_bytes(manifest)}, policy


if __name__ == "__main__":
    files, policy = build_bundle()
    prep.write_snapshot(files, ROOT / policy["output"])
    print(json.dumps({"output": policy["output"], "farmer_ready": False,
        "model_bytes": len(files["model.json"]), "weights_reproduced_against_sklearn": True}, indent=2))
