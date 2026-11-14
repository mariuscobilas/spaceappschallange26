# Workspace Collaboration Rules

These rules apply across `apps/web`, `apps/api`, and `shared`.

## 1. Type Safety & Contract Synchronization
- **TypeScript**: Strictest TypeScript settings enabled. Do not use `any` unless explicitly typing arbitrary third-party inputs.
- **Python**: Use type hints on all route handlers and utility functions. All request/response bodies must use Pydantic models from `shared.python.schemas`.
- **Payload Verification**: When adding or updating endpoints, run `node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs` to ensure JSON fixtures match schemas.

## 2. Frontend Development Standards (`apps/web`)
- Utilize React 19 and Next.js App Router idioms.
- Keep server components as default; mark interactive components with `'use client'`.
- All API calls to `apps/api` should route through a typed API client or server actions that reference `@spaceapps/shared` types.
- Ensure all coordinate systems comply with WGS84 standard `[longitude, latitude]` for GeoJSON polygons and `{ latitude, longitude }` for points.

## 3. Backend Development Standards (`apps/api`)
- Keep HTTP routing and dependency injection in `apps/api/app/main.py` or modular routers in `apps/api/app/routers/`.
- Heavy ML inference or data transforms must reside in `apps/api/app/ml/`, exposing pure Python functions or classes that `main.py` can call.
- Always handle exceptions gracefully and return structured `ApiResponse` or FastAPI `HTTPException` with informative error details.

## 4. Machine Learning & NASA Data Standards (`apps/api/app/ml`)
- Explicitly document data sources (e.g. MODIS Terra/Aqua, Landsat 8/9, SMAP L4, GPM IMERG).
- If satellite data cannot be downloaded in real-time, provide deterministic synthetic fallback data so the demo runs offline.

