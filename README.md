# Space Apps Challenge 2026

Field Shift starter: Next.js web app, FastAPI backend, and Turborepo task runner. The ML goal and pipeline will be designed separately.

## Project areas

- `apps/web` — Next.js frontend
- `apps/api` — FastAPI endpoints and API documentation
- `apps/api/app/ml` — Python ML work area; see its README before adding model code

## Requirements

Node.js 20.9+, pnpm 9+, and Python 3.11+.

## Setup

Run `pnpm install` at the repository root, then create the API environment:

```powershell
# Windows PowerShell
py -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
```

```sh
# macOS / Linux
python3 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -r apps/api/requirements.txt
```

Run `pnpm dev` from the root. The web app is at http://localhost:3000 and the API at http://localhost:8000. See [apps/api/API.md](apps/api/API.md) for endpoints and mock payloads. Run `pnpm run build` to build the frontend. FastAPI is interpreted and has no build step.

## Meridian workspace

Run `pnpm --filter @spaceapps/web dev`, then open http://localhost:3000.
The frontend uses shadcn/ui (Base UI / Nova), Tailwind v4, and a full-height
navigation sidebar with separate Explore, Field Planner, Economics and Ask Meridian
workspaces. Production builds use Next.js Webpack; development uses Turbopack.

Explore places map controls in one toolbar. The light OpenFreeMap basemap retains
roads and place names under selectable H3 cells. Field / Atlas modes preserve crop,
location and dates. Kansas locality shortcuts are Tribune, Colby, Hays, Salina,
Manhattan and Ottawa. H3 resolution is 2 below zoom 4, 3 below 6, 4 below 9, then
viewport-scoped 5. Cells represent regional geography, not verified farm parcels.

NASA SMAP, VIIRS NDVI and IMERG imagery is opt-in. Historical dates resolve to the
last advertised observation on/before the request; actual dates, units and legends
remain visible. IMERG depicts precipitation rate. Loading or external failures
leave map navigation usable. On-demand location details open in a Sheet.

Field mode selects exact map points and supports named, saved polygon fields with
Terra Draw. Draw or edit a boundary, finish it, then save or cancel. Geodesic area
and centroid are calculated locally; fields above 5,000 ha remain editable and are
directed to Atlas. Unsaved changes have Save / Discard / Stay protection.

Field details request a USDA Cropland Data Layer point sample through the API.
The source year is shown, detected crops require explicit acceptance, and manual
crop selection remains available when classification is unsupported or unavailable.
This is a point sample, not a whole-field crop assessment.

Field Planner saves management assumptions per saved field and crop. Polygon
hectares are authoritative in both Planner and Economics; point areas are manual.
Economics calculates from explicitly entered prices, yields, percentage change,
costs, support and area; blank inputs are not zero. It supplies no market values or
model forecasts. Ask Meridian copies a question with selected map and plan context;
analysis is not connected. No risk scores or drought simulation are fabricated.

Geography: Natural Earth (public domain). Hexagons: H3. Imagery/legends: NASA GIBS.
No login or Meteomatics credentials are needed. ML/analysis integration and
Azure/GoDaddy deployment remain deferred. Fields, plans and economic inputs stay
in browser storage; existing location-based inputs migrate when a field is saved.

Validation:

```sh
pnpm --filter @spaceapps/web exec tsc --noEmit
pnpm --filter @spaceapps/web build
pnpm --filter @spaceapps/web exec playwright install chromium
pnpm --filter @spaceapps/web exec playwright test
```

## Project progress

See [milestones](docs/MILESTONES.md) for delivery gates and
[continuation handoff](docs/HANDOFF.md) for current decisions and implementation state.
