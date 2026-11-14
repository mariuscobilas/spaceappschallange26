# @spaceapps/shared

Shared data contracts, TypeScript interfaces, Python Pydantic schemas, and sample JSON payloads for the **Space Apps Challenge 2026 - Field Shift** project.

## Directory Structure

```text
shared/
├── package.json               # Monorepo workspace package (@spaceapps/shared)
├── tsconfig.json              # TypeScript compilation config
├── src/
│   ├── index.ts               # Root TypeScript entry point
│   └── types/
│       ├── index.ts           # Barrel re-export
│       ├── api.ts             # Health, ApiResponse, Mock payloads, ApiError
│       ├── field.ts           # FieldProfile, GeoCoordinate, CropType, SoilType
│       ├── nasa.ts            # Satellite metrics (NDVI, SMAP soil moisture, LST)
│       └── prediction.ts      # ML predictions, crop shift options, action plans
├── payloads/                  # Concrete JSON sample payloads & contract fixtures
│   ├── health.json
│   ├── mock-demo.json
│   ├── prediction-request.json
│   ├── prediction-response.json
│   ├── field-analysis-request.json
│   └── field-analysis-response.json
└── python/                    # Python Pydantic schemas for FastAPI & ML
    ├── __init__.py
    └── schemas.py
```

## How to Use

### Frontend (`apps/web` - Next.js)

Import types directly from `@spaceapps/shared`:

```typescript
import type {
  FieldAnalysisRequest,
  FieldAnalysisResponse,
  FieldProfile,
  FieldShiftPrediction
} from "@spaceapps/shared";
```

### Backend (`apps/api` - FastAPI)

Import Pydantic models directly from `shared.python.schemas`:

```python
from shared.python.schemas import (
    FieldAnalysisRequest,
    FieldAnalysisResponse,
    FieldShiftPrediction,
    HealthResponse,
)

@app.post("/api/v1/field-shift/analyze", response_model=FieldAnalysisResponse)
def analyze_field(payload: FieldAnalysisRequest) -> FieldAnalysisResponse:
    ...
```

### Contract Rules
1. Whenever an API payload changes, update both `shared/src/types` and `shared/python/schemas.py`.
2. Keep sample payloads in `shared/payloads/` updated as fixtures for mock endpoints and unit tests.

