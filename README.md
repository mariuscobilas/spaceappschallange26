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

## Meridian map design preview

Run `pnpm --filter @spaceapps/web dev`, then open http://localhost:3000.
Meridian uses one compact header, a right-aligned latest/past observation selector,
and one collapsible location panel. The map combines a light OpenFreeMap basemap (roads and place names)
with translucent geographic hexagons. Legacy design links open the same workspace.

Both field and atlas modes support six Kansas locality shortcuts and crop context.
The map uses H3 resolution 2 below zoom 4, resolution 3 from zoom 4, resolution 4
from zoom 6, and viewport-scoped resolution 5 from zoom 9. Cells represent regional
geography, not verified farm parcels or a crop classification.

NASA imagery is opt-in. Historical selections use the most recent advertised
observation on or before the chosen date; each product's actual date and units
remain visible. There are no risk scores or drought simulations. The Meridian
Intel request view prepares/copies selected context and a question; analysis is
not connected and no model response is fabricated.

Geography: Natural Earth (public domain). Hexagons: H3. Imagery/legends: NASA GIBS.
No Meteomatics credentials are needed. Backend/model integration and Azure/GoDaddy
deployment remain deferred. Settings persist locally without login.

Validation:

```sh
pnpm --filter @spaceapps/web exec tsc --noEmit
pnpm --filter @spaceapps/web build
pnpm --filter @spaceapps/web exec playwright install chromium
pnpm --filter @spaceapps/web exec playwright test
```
