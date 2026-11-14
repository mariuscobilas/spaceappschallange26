---
name: architecture-designer
description: >-
  Designs system architecture diagrams, data flow representations with Mermaid,
  and Architecture Decision Records (ADRs) to align frontend, backend, and ML layers.
---

# Architecture Designer Skill

Guidelines for documenting system design, component boundaries, and technical decisions.

## System Architecture Diagram

```mermaid
flowchart TD
    subgraph Frontend["apps/web (Next.js 16 + React 19)"]
        UI["Field Dashboard / Map View"]
        Client["API Client (@spaceapps/shared)"]
    end

    subgraph Backend["apps/api (FastAPI)"]
        Routes["HTTP Routes (/api/v1)"]
        Schemas["Pydantic Schemas (shared.python)"]
        Lifespan["Lifespan Model Manager"]
    end

    subgraph ML["apps/api/app/ml"]
        Inference["Inference Engine"]
        NASA["NASA Earth Data Preprocessor"]
        Heuristics["Crop Shift Heuristics"]
    end

    subgraph External["NASA APIs & Data Products"]
        MODIS["MODIS / Landsat (NDVI / LST)"]
        SMAP["SMAP (Soil Moisture)"]
        GPM["GPM IMERG (Precipitation)"]
    end

    UI --> Client
    Client -->|HTTP / JSON (shared payloads)| Routes
    Routes --> Schemas
    Routes --> Lifespan
    Lifespan --> Inference
    NASA --> External
    Inference --> NASA
    Inference --> Heuristics
```

## Architecture Decision Records (ADRs)

Document significant structural decisions under `docs/adr/`:

### Template:
- **Title**: `ADR-001: Monorepo with Turborepo and pnpm`
- **Status**: Accepted
- **Context**: Need synchronized data contracts between Next.js and FastAPI without publishing public npm packages.
- **Decision**: Use `pnpm` workspaces with local `@spaceapps/shared` package and mirrored Python Pydantic models.
- **Consequences**: Fast feedback loop, unified contract verification, identical payload fixtures.

