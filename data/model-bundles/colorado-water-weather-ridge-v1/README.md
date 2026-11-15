# Colorado water + weather Ridge: research only

`model.json` contains trained coefficients/scaler. `bundle.json` supplies its hash, provenance and original whole-season scores. See [selection and reproduction](../../../docs/ML_PUBLICATION.md).

Predicts absolute winter-wheat yield (t/ha) using observed **0–90 cm stored water (mm)** and realized wheat-season weather. It is not an early cover-planting forecast or validated cover/fallow decision. `farmer_ready=false`; API model selection is unchanged.

This fixed refit uses all 88 Colorado observations. The 0.545 t/ha average season MAE belongs to earlier fold fits, not this refit. No inputs are imputed; units must match exactly; negative predictions remain possible. Site/crop transfer is unvalidated.

```python
# From repository root:
import sys
from pathlib import Path
sys.path.insert(0, "apps/api/app/ml")
from research_yield_model import load_research_model, predict_yield
model = load_research_model(Path("data/model-bundles/colorado-water-weather-ridge-v1"))
# Supply all actual named inputs in model["features"] and their matching units.
# yield_t_ha = predict_yield(model, features, units)
```

Export with `python scripts/export_research_yield_model.py`. It checks source/prepared hashes and weight parity and refuses conflicting output.
