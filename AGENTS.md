# Agents Guide: Space Apps Challenge 2026 - Field Shift

Welcome! This repository is a collaborative monorepo for the NASA Space Apps Challenge 2026: **Field Shift** (Adapting farms with NASA Earth observation data).

## Team Roles & Codebase Ownership

- **Frontend Engineer**: Works primarily in `apps/web` (Next.js 16, React 19, TypeScript). Responsible for UI, geospatial views, user interaction, and integrating with API endpoints.
- **Backend Engineer**: Works primarily in `apps/api` (FastAPI, Python 3.11) and `apps/api/app/ml` (model training, feature preparation, inference pipelines).
- **Shared Contracts**: Lives in `shared/` (`@spaceapps/shared`). **Both** frontend and backend developers must align on types and payloads here before implementing breaking changes.

## Core Architecture

```text
├── apps/
│   ├── web/                     # Next.js frontend (App Router)
│   └── api/                     # FastAPI backend
│       └── app/
│           ├── main.py          # API entry point & routes
│           └── ml/              # Machine learning models & inference logic
├── shared/                      # Canonical single source of truth for contracts
│   ├── src/types/               # TypeScript interfaces
│   ├── payloads/                # Concrete sample JSON payloads / fixtures
│   └── python/schemas.py        # Pydantic v2 schemas
├── .agents/                     # AI Agent skills, rules, and runbooks
│   ├── rules/                   # Workspace rules & coding conventions
│   └── skills/                  # Specialized developer skills
└── scripts/                     # Monorepo runner and dev automation
```

## Ground Rules for AI Agents

1. **Contracts First**: Never change endpoint payloads in `apps/web` or `apps/api` in isolation. Update `shared/src/types` and `shared/python/schemas.py` first, along with a fixture in `shared/payloads/`.
2. **CORS & Networking**: Frontend runs at `http://localhost:3000`; API runs at `http://localhost:8000`. Keep CORS middleware in `apps/api/app/main.py` properly configured.
3. **No Large Model Binaries in Git**: ML weights (`.pt`, `.onnx`, `.joblib`, `.pkl` > 10MB) must not be committed to Git. Use scripts to download or generate mock weights during development.
4. **Always use pnpm**: Never use `npm` or `yarn`. Use `pnpm install`, `pnpm dev`, `pnpm run build`, and `pnpm --filter <package> <cmd>`.
5. **Mock Graceful Fallbacks**: Frontend components should handle API disconnection gracefully using fallback payloads from `@spaceapps/shared`.
6. **Check Skills**: Before performing backend, frontend, ML, or contract tasks, reference the relevant skill in `.agents/skills/`.

## Current ML continuation (15 November 2026)

Publication checkpoint: [research package and model weights](docs/ML_PUBLICATION.md), [Mandan weather verification](docs/MANDAN_WEATHER_VERIFICATION.md). Regional NASA crop-season data are complete; exact soil sampling dates and annual field assignments remain unresolved. A separate Colorado absolute-yield Ridge refit is packaged for research transfer, not API serving or farmer advice. Next freeze a Mandan retrospective weather ablation if continuing; no weather-aware Mandan model has been tested.

Before continuing ML work, read [the ML research plan and handoff](docs/ML_RESEARCH_PLAN.md) and [the water/yield data audit](docs/WATER_YIELD_DATA_FEASIBILITY.md). These record the current user decisions, completed work, source paths, unresolved issues, experiment rationale, and phase exit conditions.

- The farmer's decision is **whether to plant a proposed cover crop before a following cash crop, versus leaving the interval fallow**, while protecting the following crop's water supply and yield. Older termination-first notes describe a previous frontend scope.
- Keep current API payloads during this research. Internal model changes do not require payload changes; existing fields must retain their units, depth and meaning.
- Auditing, preparation and absolute-yield/model-family/paired-contrast experiments are complete. Read [the cover-versus-fallow evaluation](docs/COVER_FALLOW_EVALUATION.md): magnitude error improves for some methods, but benefit detection is inadequate. **Next address paired-data/context and initial-water gaps before Phase 4.** No model was promoted.
- Preserve existing Clovis source/artifact hashes, model-selection pointers and serving behavior. Keep new research data and runs separate. Use the plan's verified eligibility counts and linkage exclusions rather than assuming every downloaded record is a training label.
- Mandan water linkage and its first component experiments are complete; read [the evidence](docs/MANDAN_LINKAGE.md) and [evaluation](docs/MANDAN_EVALUATION.md). Absolute yield error improves over a weak mean baseline, but yield decisions and phase-water Ridge lose to stronger baselines. Next investigate weather/timing/location definitions before a new protocol. Do not merge crops/depths or import the still-unverified soil-nitrogen linkage. The older zero-row audit is historical; no model is promoted.

