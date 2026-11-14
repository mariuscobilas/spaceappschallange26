---
name: fastapi-backend-dev
description: >-
  Use this skill when developing, refactoring, or debugging the FastAPI backend in apps/api,
  including creating new routers, configuring middleware, handling errors, and connecting
  services to the ML inference layer.
---

# FastAPI Backend Development Skill

Guides the backend coworker and agents in maintaining, expanding, and optimizing the FastAPI service in `apps/api`.

## Key Commands & Setup

```bash
# Activate API virtual environment
# macOS / Linux:
source apps/api/.venv/bin/activate
# Windows:
apps/api/.venv/Scripts/activate

# Install dependencies
pip install -r apps/api/requirements.txt

# Run API standalone (with auto-reload on http://localhost:8000)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Structure of `apps/api`

```text
apps/api/
├── API.md                 # API documentation & curl examples
├── package.json           # npm run dev wrapper for Turborepo
├── requirements.txt       # Python dependencies
└── app/
    ├── __init__.py
    ├── main.py            # FastAPI application & base endpoints
    ├── routers/           # Sub-routers for feature areas (e.g. fields, analytics)
    └── ml/                # ML models, feature engineering, and inference logic
```

## Guidelines

1. **Schemas & Contracts**:
   - Always import schemas from `shared.python.schemas` instead of defining ad-hoc dictionaries.
   - Use `response_model` annotations on all routes.
2. **CORS Configuration**:
   - The Next.js frontend runs on `http://localhost:3000`. Keep CORS configured in `app/main.py`.
3. **ML Integration**:
   - Do not perform heavy numerical operations directly in route functions.
   - Import inference functions from `app.ml` (e.g., `from app.ml.inference import predict_field_shift`).
4. **Error Handling**:
   - Raise `fastapi.HTTPException` with explicit status codes (`400`, `404`, `422`, `500`).
   - Return descriptive `detail` messages for client troubleshooting.
5. **Interactive Docs**:
   - OpenAPI Swagger UI is available at `http://localhost:8000/docs`.
   - ReDoc is available at `http://localhost:8000/redoc`.

See [example_router.py](./examples/example_router.py) for a modular router pattern.

