---
name: database-design
description: >-
  Postgres, SQLAlchemy, and Alembic database design patterns: index optimization,
  preventing N+1 ORM queries, foreign key constraints, and pgvector schema migrations.
---

# Database Design & Query Optimization Skill

Guidelines for schema modeling, index design, and high-performance querying in PostgreSQL.

## 1. Indexing Strategies

- **Foreign Keys**: Always index foreign key columns (`field_id`, `user_id`). Postgres does not automatically index foreign keys!
- **Temporal Queries**: For time-series satellite telemetry, create composite indexes on `(field_id, observation_date DESC)`.
- **Spatial Queries**: Use PostGIS `GIST` indexes on geometry columns for fast polygon containment and bounding-box queries:
  ```sql
  CREATE INDEX idx_fields_boundary ON farm_fields USING GIST (boundary);
  ```

## 2. Preventing N+1 ORM Queries

- ❌ **Anti-Pattern**: Iterating over fields and accessing `field.observations` in a loop, triggering 1 query for fields + $N$ queries for observations.
- ✅ **Fix**: Use SQLAlchemy `selectinload` or `joinedload`:
  ```python
  from sqlalchemy.orm import selectinload

  stmt = select(FarmField).options(selectinload(FarmField.observations))
  result = await session.execute(stmt)
  fields = result.scalars().all()
  ```

## 3. Migration Safety (Alembic)

- Never alter existing production columns destructively in a single step (use expand-and-contract pattern).
- Always include `downgrade()` procedures in every migration script.
- Test migrations locally:
  ```bash
  alembic upgrade head
  alembic downgrade -1
  alembic upgrade head
  ```

