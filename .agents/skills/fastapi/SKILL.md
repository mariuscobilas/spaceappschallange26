---
name: fastapi
description: >-
  Official guidance for FastAPI application design, router organization, lifespan management,
  and matching FastAPI version specifications in apps/api.
---

# FastAPI Core Skill

Guidance for core FastAPI conventions, lifecycle hooks, version alignment, and routing architecture.

## Lifespan State Pattern

In modern FastAPI (>=0.93+), use `asynccontextmanager` on `lifespan` instead of deprecated `@app.on_event("startup")` and `@app.on_event("shutdown")`:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load ML models, warm caches, initialize DB pools
    print("Initializing application resources...")
    app.state.ready = True
    yield
    # Shutdown: Cleanly close DB pools, flush logs
    print("Shutting down resources...")

app = FastAPI(title="Field Shift API", lifespan=lifespan)
```

## Router Modularization

Keep `main.py` lean by delegating routes to dedicated routers under `apps/api/app/routers/`:

```python
# apps/api/app/routers/fields.py
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/fields", tags=["Fields"])

@router.get("/")
async def list_fields():
    return []
```

In `apps/api/app/main.py`:

```python
from app.routers import fields
app.include_router(fields.router)
```

## Dependency Injection (DI)

Use FastAPI's `Depends` for request validation, session management, and auth tokens:

```python
from fastapi import Depends

async def get_db_session():
    # Provide scoped DB session
    yield session

@app.get("/items")
async def get_items(db = Depends(get_db_session)):
    ...
```

## Version Alignment

To synchronize version-specific features with your Python environment:
```bash
# Verify installed version
apps/api/.venv/bin/python -m pip show fastapi
```

