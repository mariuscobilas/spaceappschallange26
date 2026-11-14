---
name: fastapi-ml-endpoint
description: >-
  Bridges machine learning and backend services by enforcing lifespan model loading,
  threadpool isolation, input tensor/feature validation, and memory-safe inference.
---

# FastAPI ML Endpoint Skill

Architectural patterns for serving ML models and NASA Earth observation inference pipelines in FastAPI.

## 1. Lifespan Model Loading (Never Load Per-Request)

Loading weights on every request causes massive latency spikes and Out-Of-Memory (OOM) errors:

```python
# apps/api/app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.ml.inference import FieldShiftModel

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load model weights ONCE at application boot
    print("Loading Field Shift ML model weights...")
    app.state.ml_model = FieldShiftModel.load()
    yield
    # Clean up model resources on shutdown
    app.state.ml_model = None

app = FastAPI(lifespan=lifespan)
```

In route handlers, access the preloaded model via request state:

```python
from fastapi import Request

@app.post("/api/v1/field-shift/predict")
async def predict(request: Request, payload: FieldAnalysisRequest):
    model: FieldShiftModel = request.app.state.ml_model
    # Offload CPU-bound inference to threadpool so event loop remains unblocked
    prediction = await asyncio.to_thread(model.predict, payload)
    return prediction
```

## 2. Input Feature Validation

Validate feature bounds strictly before feeding tensors or scikit-learn models:

```python
from pydantic import BaseModel, Field

class ModelFeatureInput(BaseModel):
    ndvi: float = Field(..., ge=-1.0, le=1.0, description="Normalized Difference Vegetation Index")
    soil_moisture: float = Field(..., ge=0.0, le=1.0, description="Volumetric water content")
    temperature_anomaly: float = Field(..., ge=-30.0, le=50.0, description="Celsius anomaly")
```

## 3. Graceful Fallbacks / Mock Mode

Always implement a deterministic heuristic fallback when model weights are not downloaded:

```python
class FieldShiftModel:
    def __init__(self, weights=None):
        self.weights = weights

    @classmethod
    def load(cls):
        try:
            # Attempt to load PyTorch or Scikit-Learn weights
            return cls(weights="loaded")
        except Exception:
            print("Model weights not found. Falling back to heuristic baseline.")
            return cls(weights=None)
```

