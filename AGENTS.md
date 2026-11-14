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

