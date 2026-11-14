---
name: ml-pipeline
description: >-
  Standardizes data preparation, satellite feature engineering (NDVI, SMAP, GPM),
  experiment tracking, and reproducible training/evaluation pipelines.
---

# ML Pipeline & Data Engineering Skill

Workflows for processing NASA Earth observations and training agricultural resilience models.

## Pipeline Architecture

```text
apps/api/app/ml/
├── data/                  # Small sample datasets, geojson test polygons (<10MB)
├── features/              # Feature engineering functions
│   ├── ndvi.py            # MODIS/Landsat red & NIR band ratio computation
│   ├── soil_moisture.py   # SMAP root-zone and topsoil moisture extraction
│   └── weather.py         # Precipitation (GPM) & thermal anomalies
├── models/                # Model wrappers (scikit-learn, XGBoost, PyTorch)
├── train.py               # Reproducible training script
├── evaluate.py            # Validation metrics (RMSE, Precision/Recall, Brier score)
└── inference.py           # Clean callable function for FastAPI
```

## Feature Engineering Principles

1. **NDVI Computation**:
   $$\text{NDVI} = \frac{\text{NIR} - \text{Red}}{\text{NIR} + \text{Red}}$$
   Clean clouds and shadow flags before aggregation.
2. **Standardization & Missing Values**:
   - Use median imputation for missing satellite observations (e.g., cloudy revisit dates).
   - Normalize temporal trends against 10-year historical baselines.
3. **Reproducible Experimentation**:
   - Fix random seeds across NumPy, PyTorch, and scikit-learn (`seed=42`).
   - Log dataset hash, hyperparameters, and cross-validation scores.

## Clean Export to FastAPI

Ensure the pipeline exposes a clean, single-point inference interface:

```python
# apps/api/app/ml/inference.py
def predict_adaptation(features: dict) -> dict:
    ...
```

