---
name: fastapi-pro
description: >-
  Production-grade FastAPI development patterns including SQLAlchemy 2.0 async sessions,
  Pydantic v2 validation, Alembic migrations, OAuth2/JWT security, and pytest fixtures.
---

# FastAPI Pro Skill

Production engineering patterns for robust, scalable FastAPI backends in `apps/api`.

## 1. Async SQLAlchemy 2.0 Pattern

Avoid legacy 1.4 query APIs (`session.query()`). Use modern 2.0 syntax with `select()`:

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class FarmField(Base):
    __tablename__ = "fields"
    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    area_hectares: Mapped[float]

engine = create_async_engine("postgresql+asyncpg://user:pass@localhost:5432/fieldshift")
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

# Usage in route:
@router.get("/fields/{field_id}")
async def get_field(field_id: str, session: AsyncSession = Depends(get_session)):
    stmt = select(FarmField).where(FarmField.id == field_id)
    result = await session.execute(stmt)
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    return field
```

## 2. Pydantic v2 Best Practices

- Use `model_validate` instead of deprecated `parse_obj`.
- Use `model_dump(mode="json")` instead of deprecated `.dict()`.
- Define custom validators with `@field_validator(mode="before")` or `@field_validator(mode="after")`.

```python
from pydantic import BaseModel, Field, field_validator

class CoordinateInput(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        return round(v, 6)
```

## 3. Alembic Migrations

Keep migrations reproducible:
```bash
# Generate revision
alembic revision --autogenerate -m "create farm fields table"
# Apply migrations
alembic upgrade head
```

## 4. Pytest & Async Client Fixtures

Test endpoints using `httpx.AsyncClient` with `ASGITransport`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

@pytest.mark.anyio
async def test_health(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

