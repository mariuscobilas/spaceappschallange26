---
name: docker-expert
description: >-
  Guides containerization, multi-stage Docker builds, and reproducible multi-service
  docker-compose setups (FastAPI, Next.js, Postgres, ML worker).
---

# Docker & Containerization Skill

Runbook for multi-container development and deployment setups.

## Multi-Service Architecture (`docker-compose.yml`)

A reproducible setup for both developers:

```yaml
version: "3.8"

services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: fieldshift
      POSTGRES_PASSWORD: secretpassword
      POSTGRES_DB: fieldshift
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://fieldshift:secretpassword@db:5432/fieldshift
    depends_on:
      - db

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    depends_on:
      - api

volumes:
  pgdata:
```

## Best Practices

1. **Multi-Stage Builds**: Keep production images lean by building static assets in build stages and copying only runtime artifacts into minimal images (e.g. `node:20-alpine` or `python:3.11-slim`).
2. **Layer Caching**: Copy `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` (or `requirements.txt`) before copying application code so layer caches persist across code changes.
3. **Non-Root User**: Always execute the runtime process as an unprivileged user (`USER node` or `USER appuser`).

