---
name: ml-inference-pipeline
description: >-
  Use this skill when developing, training, packaging, or serving machine learning models
  and NASA Earth observation data pipelines inside apps/api/app/ml.
---

# ML Inference Pipeline Skill

Guides development of models, heuristics, and satellite data processors in `apps/api/app/ml`.

## Purpose & Scope

The Field Shift challenge uses NASA Earth observation datasets (MODIS, Landsat, SMAP, GPM) to model agricultural vulnerability and recommend adaptive farming strategies (crop shifting, planting date modification, irrigation optimization).

## Directory Structure

```text
apps/api/app/ml/
├── README.md              # High-level architecture notes
├── __init__.py            # Export public inference functions
├── data/                  # Sample CSVs, geojsons, or satellite tiles (<10MB only)
├── models/                # Serialized model wrappers / weights
├── features.py            # Feature engineering from NASA indicators (NDVI, SMAP, LST)
├── inference.py           # Clean callable Python inference functions
└── heuristics.py          # Agronomic baseline rules and recommendation logic
```

## Core Principles

1. **Separation of Concerns**:
   - HTTP routes in `apps/api/app/main.py` handle request validation and response formatting.
   - Core ML logic in `apps/api/app/ml/` should accept pure Python data or Pydantic models and return prediction objects.
2. **Deterministic Mock/Fallback Mode**:
   - In hackathon and development settings, NASA APIs may rate-limit or fail.
   - Always implement an offline deterministic baseline (heuristic or synthetic prediction) so the entire web app functions without network dependencies.
3. **NASA Data Inputs**:
   - **NDVI** (MODIS / Landsat): Range `[-1.0, 1.0]`, reflects vegetation vigor and anomalies.
   - **Soil Moisture** (SMAP): Volumetric water content fraction `[0.0, 1.0]`.
   - **Precipitation** (GPM IMERG): Rainfall in mm.
   - **Land Surface Temperature** (MODIS/Landsat): Daytime and nighttime thermal stress.
4. **No Giant Binaries in Git**:
   - Never commit raw datasets or model files larger than 10MB to the repository.
   - Provide a download script or store artifacts in Cloud Storage/Git LFS if needed.

See [inference_example.py](./examples/inference_example.py) for a clean baseline model implementation.

