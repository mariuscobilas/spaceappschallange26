---
name: fullstack-integration
description: >-
  Use this skill when running, orchestrating, or verifying the entire monorepo stack
  (Turborepo, Next.js, and FastAPI), performing health checks, or diagnosing networking issues.
---

# Fullstack Integration Skill

Runbook for running, testing, and debugging the combined frontend and backend environment.

## Monorepo Architecture

- **Root Task Runner**: Turborepo (`turbo.json`)
- **Frontend**: Next.js 16 (`apps/web`, port 3000)
- **Backend**: FastAPI (`apps/api`, port 8000 via `scripts/run-api.mjs`)
- **Shared Package**: `@spaceapps/shared` (`shared/`)

## Quickstart Commands

```bash
# 1. Install root & workspace packages
pnpm install

# 2. Run both apps concurrently
pnpm dev

# 3. Build all workspace projects
pnpm run build
```

## Health Verification

Run the integration health check script to verify both services are responsive:

```bash
node .agents/skills/fullstack-integration/scripts/check-health.mjs
```

## Common Issues & Solutions

### 1. "API virtual environment missing"
- **Cause**: The Python `.venv` in `apps/api` has not been initialized.
- **Fix**:
  ```bash
  python3 -m venv apps/api/.venv
  apps/api/.venv/bin/python -m pip install -r apps/api/requirements.txt
  ```

### 2. CORS Errors in the Browser
- **Cause**: Browser blocked fetch from `localhost:3000` to `localhost:8000`.
- **Fix**: Ensure `CORSMiddleware` in `apps/api/app/main.py` permits `http://localhost:3000` and `http://127.0.0.1:3000`.

### 3. TypeScript Cannot Find `@spaceapps/shared`
- **Cause**: `apps/web/tsconfig.json` path mapping or workspace symlink missing.
- **Fix**: Verify `paths` in `apps/web/tsconfig.json` includes:
  ```json
  "@spaceapps/shared": ["../../shared/src/index.ts"]
  ```

### 4. Port Conflicts (3000 or 8000 already in use)
- **Diagnostic**:
  ```bash
  lsof -i :8000
  lsof -i :3000
  ```
  Kill conflicting processes if a zombie server is running.

