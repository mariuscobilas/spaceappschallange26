---
name: project-conventions
description: >-
  Repository-specific conventions: pnpm package management, workspace structure,
  environment variables, shared Pydantic/TypeScript contracts, and git branch rules.
---

# Project Conventions Skill

The central reference for day-to-day development workflow for both engineers.

## 1. Package Management & Tooling

- **Always use pnpm**: Never invoke `npm` or `yarn`.
- **Install dependencies**:
  ```bash
  pnpm install
  ```
- **Run dev environment**:
  ```bash
  pnpm dev
  ```
- **Filter commands**:
  ```bash
  pnpm --filter @spaceapps/web dev
  pnpm --filter @spaceapps/shared typecheck
  ```
- **Build all packages**:
  ```bash
  pnpm run build
  ```

## 2. Directory Ownership

- `apps/web/`: Frontend developer ownership (Next.js, Tailwind, client state, geospatial visualizers).
- `apps/api/`: Backend developer ownership (FastAPI, routes, middleware, database, and ML in `apps/api/app/ml`).
- `shared/`: Shared ownership. **Always** update `shared/src/types` and `shared/python/schemas.py` in the same commit.

## 3. Environment Variables

- `apps/web/.env.local`:
  ```bash
  NEXT_PUBLIC_API_URL=http://localhost:8000
  ```
- `apps/api/.env`:
  ```bash
  HOST=127.0.0.1
  PORT=8000
  ```

## 4. Git Branching & Commit Discipline

- Main branch: `main` (protected, deployable).
- Feature branches: `feat/feature-name` or `fix/bug-name`.
- Never commit model weights or datasets larger than 10MB to git.
- Verify contracts before committing:
  ```bash
  node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs
  ```

