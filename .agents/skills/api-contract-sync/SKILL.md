---
name: api-contract-sync
description: >-
  Use this skill whenever creating, modifying, or verifying API endpoints, request/response models,
  TypeScript types, Pydantic schemas, or mock payload fixtures between Next.js and FastAPI.
---

# API Contract Synchronization Skill

Ensures zero drift between the FastAPI Python backend (`apps/api`), Next.js TypeScript frontend (`apps/web`), and shared JSON mock fixtures.

## Architecture

- **Single Source of Truth**: The `shared/` directory holds both TypeScript types (`shared/src/types/`) and Pydantic schemas (`shared/python/schemas.py`).
- **Payload Fixtures**: `shared/payloads/*.json` provides concrete examples for tests, documentation, and mock fallbacks.

## Workflow: Adding or Modifying an Endpoint

When a teammate or feature requires a new or changed API payload:

### Step 1: Update TypeScript Types in `shared/src/types/`
Add or update the interface in the relevant type file (`api.ts`, `field.ts`, `nasa.ts`, or `prediction.ts`), and ensure it is exported in `shared/src/types/index.ts`.

### Step 2: Mirror in Python Pydantic (`shared/python/schemas.py`)
Add or update the corresponding Pydantic v2 `BaseModel` in `shared/python/schemas.py`. Ensure field names and types match 1:1. Use `Optional[T] = None` for optional fields.

### Step 3: Create or Update Sample JSON Fixtures (`shared/payloads/`)
Add the concrete request and response JSON files in `shared/payloads/`.

### Step 4: Validate the Payloads
Run the validation script to verify that JSON fixtures are valid JSON and contain expected keys:

```bash
node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs
```

### Step 5: Implement in FastAPI (`apps/api/app/main.py`)
Import the schema and annotate the endpoint:

```python
from shared.python.schemas import FieldAnalysisRequest, FieldAnalysisResponse

@app.post("/api/v1/field-shift/analyze", response_model=FieldAnalysisResponse)
def analyze(payload: FieldAnalysisRequest) -> FieldAnalysisResponse:
    ...
```

### Step 6: Use in Next.js (`apps/web`)
Import the type from `@spaceapps/shared`:

```typescript
import type { FieldAnalysisRequest, FieldAnalysisResponse } from "@spaceapps/shared";
```

### Step 7: Update `apps/api/API.md`
Keep `apps/api/API.md` in sync with the method, URL, and sample request/response.

