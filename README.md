# Space Apps Challenge 2026

**ML research package:** [model selection, weights and reproduction](docs/ML_PUBLICATION.md). The portable Colorado water+weather Ridge is for retrospective yield research; cover/fallow decision validity remains unsupported. [Mandan weather verification](docs/MANDAN_WEATHER_VERIFICATION.md) confirms regional NASA coverage while retaining unresolved soil sampling dates.

Meridian (original project name: Field Shift) is a NASA Earth observation workspace for field exploration, cover-crop planning and transparent manual economics. It uses Next.js, FastAPI and Turborepo. The client baseline and first numeric environmental context are implemented locally; validated agronomic analysis remains pending.

**Current ML continuation:** read the [research plan](docs/ML_RESEARCH_PLAN.md) and [cover-versus-fallow evaluation](docs/COVER_FALLOW_EVALUATION.md). Colorado field records and NASA POWER weather support some yield-difference magnitude prediction, but the tested models miss most observed cover benefits. Farmer-use validity remains unresolved; paired-data/context and initial-water gaps need attention next. Older Clovis and termination-first notes below retain their historical scope.

**Task 6 and provisional planting advice are ready for frontend integration.** [Start with the API handoff](docs/API_HANDOFF.md): FastAPI endpoints, editable financial/risk assumptions, [OpenAPI](docs/openapi.json), checked [JSON payloads](examples/api/analyze.request.json), and a [typed frontend client](apps/web/lib/field-shift-api.ts). Shared fixtures cover plant, do not plant, review, and insufficient evidence. The saved example endpoint supports web development without local model artifacts. Advice remains unvalidated; compatible model bundles can be replaced without changing frontend payloads.

The one-day MVP now starts with the Clovis, New Mexico cover-crop observations. [Data preparation](docs/CLOVIS_DATA_PREPARATION.md) implements the first task: source audit, frozen evaluation splits, cleaned moisture labels, and verification. The Kansas-first documents below describe the earlier research scope.

[NASA weather preparation](docs/CLOVIS_WEATHER_PREPARATION.md) caches Clovis daily weather for 2001â€“2025 and joins it to the unchanged train/validation/test labels, ready for baseline evaluation.

[Baseline feasibility](docs/CLOVIS_BASELINE_EVALUATION.md) compares persistence with a training-only daily-change rule using validation data and local MLflow tracking. Persistence was the reference to beat; this stage used validation only.

[Weather-aware regression evaluation](docs/CLOVIS_REGRESSION_EVALUATION.md) adds shared training/inference features and four tracked Ridge/Random Forest candidates. None beat the adoption gates; the best experimental model is retained without replacing persistence.

[Historical scenario simulation](docs/CLOVIS_SCENARIO_SIMULATION.md) implements Task 5: complete dry/typical/very-rainy weather sequences, paired cover/fallow moisture trajectories, a validated request payload, and diagnostics. The current experimental model drifts and clips during seasonal rollouts; these outputs are not ready for planting advice.

[Held-out test evaluation](docs/CLOVIS_FINAL_TEST_EVALUATION.md) scores the frozen shallow Random Forest against persistence on 1,548 observations. Its next-day MAE is 44% higher, and 7/30/90-day recursive errors are worse. The test set is now evaluated; no model was retrained or promoted.

[Model diagnosis and repair plan](docs/CLOVIS_MODEL_DIAGNOSIS.md) identifies missing management-phase coverage, negligible learned crop response, recursive drift, and a daily-mean versus end-of-day target mismatch. The saved model remains unchanged; the next proposed task is a versioned moisture/history contract.

[Split audit](docs/CLOVIS_SPLIT_AUDIT.md) compares the original 39.6/2.0/58.5 allocation with global chronological and phase-balanced 70/15/15 candidates. The phase-balanced candidate includes every management phase in each partition, with 1,856 training examples, but is an exploratory historical evaluation. The audit prepared the memberships used in the following experiment.

[Evaluation of the new allocations](docs/CLOVIS_SPLIT_MODEL_EVALUATION.md) subsequently fits the same fixed forest independently on both versioned datasets. Validation gains are modest and exposed-test next-day errors are approximately tied with persistence. The report examines recharge events, phase coverage, feature use, and short recursive forecasts; no artifact was promoted.

The first research and product scope is western Kansas dryland winter wheat. See [KANSAS_FIRST.md](KANSAS_FIRST.md) for the decision, evidence, data sources, model approach, and validation limits.
See [KANSAS_FEATURES_AND_READING.md](KANSAS_FEATURES_AND_READING.md) for the initial feature contract and dissertation reading order.
See [WATER_DEBT_FACTOR_REVIEW.md](WATER_DEBT_FACTOR_REVIEW.md) for the location-independent evidence on which factors affect water carryover and the next crop.
See [DATA_AUDIT.md](DATA_AUDIT.md) for the verified public trial files, missing fields, and external NASA/USDA inputs.
See [BENCHMARK_FINDINGS.md](BENCHMARK_FINDINGS.md) for the first five-model benchmark and its held-out results.
See [AUSTRALIA_BENCHMARK_FINDINGS.md](AUSTRALIA_BENCHMARK_FINDINGS.md) for the separate two-year Australian phase-level experiment.
See [COVER_CROP_DECISION_RESEARCH.md](COVER_CROP_DECISION_RESEARCH.md) for crop water-use evidence, U.S. trial locations, and the proposed decision API payload.

## Project areas

- `apps/web` â€” Next.js frontend
- `apps/api` â€” FastAPI endpoints and API documentation
- `apps/api/app/ml` â€” Python ML work area; see its README before adding model code

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
navigation sidebar ordered Explore, My fields, Regional Atlas, Field Planner,
Economics and Ask Meridian. Explore (`/`) is for map browsing and filters; My fields
(`/fields`) owns point selection, drawing and saved-field management; Atlas (`/atlas`)
owns regional inspection. These map routes share one mounted map and preserve context. Production builds use Next.js Webpack; development uses Turbopack.

Explore keeps only location/crop filters and Map options in its toolbar. Layers,
opacity, source legends and dates live in the options Sheet. Field creation and
management live on My fields; browsing Explore does not create a field draft. The light OpenFreeMap basemap retains
roads and place names under selectable H3 cells. The map workspaces preserve crop, location and dates. Kansas locality shortcuts are Tribune, Colby, Hays, Salina,
Manhattan and Ottawa. H3 resolution is 2 below zoom 4, 3 below 6, 4 below 9, then
viewport-scoped 5. Cells represent regional geography, not verified farm parcels.

NASA SMAP, VIIRS NDVI and IMERG imagery is opt-in. Historical dates resolve to the
last advertised observation on/before the request; actual dates, units and legends
remain visible. IMERG depicts precipitation rate. Loading or external failures
leave map navigation usable. On-demand location details open in a Sheet.

My fields selects exact map points and supports named, saved polygon fields with
Terra Draw. Draw or edit a boundary, finish it, then save or cancel. Geodesic area
and centroid are calculated locally; fields above 5,000 ha remain editable and are
directed to Atlas. Unsaved changes have Save / Discard / Stay protection.

Field details request a USDA Cropland Data Layer point sample through the API.
The source year is shown, detected crops require explicit acceptance, and manual
crop selection remains available when classification is unsupported or unavailable.
This is a point sample, not a whole-field crop assessment.

Field details and Planner show source-backed field context from the API: complete
30-day NASA POWER precipitation, modeled root-zone relative wetness, and USDA
mapped soil water-storage capacity. Actual source periods, grid/map-unit meaning,
source links and missing states are available in the panel. Soil capacity is not
current moisture; historical weather uses its selected period while soil mapping
uses the current survey. These values are not yield forecasts or recommendations.

Field Planner saves management assumptions per saved field and crop. Polygon
hectares are authoritative in both Planner and Economics; point areas are manual.
The same field and intended next crop stay switchable in every workspace. Planner
leads with planting date and shows your planned termination date; unfinished drafts
survive navigation and reload separately from confirmed plans. Economics and Planner
offer U.S./metric units while storing metric assumptions. Economics can show per-area
change before acreage is entered; parcel totals require a valid managed area.
Confirmed plans are available under **Field Planner â†’ Saved plans** at
`/planner/saved`. Open restores the field and crop; differing working drafts have
an explicit restore choice. Deleting a plan preserves its field and economic inputs.
Regional Atlas selections open a docked regional overview on desktop and a Sheet on phones:
hex area/centre/detail, crop/date context and clearly identified centre-point
conditions. The map remains interactive beside the desktop overview.
Economics calculates from explicitly entered prices, yields, percentage change,
costs, support and area; blank inputs are not zero. It supplies no market values or
model forecasts. Saved plans also supports two-plan calendar comparison and text
export, with a warning when field or crop contexts differ. This compares confirmed
records; it does not store multiple scenario versions for one field/crop.

Ask Meridian prepares, copies and exports a question with field/plan context and
verified numeric conditions, including sample coordinates, periods, units, sources
and missing states. Saved plans and distinct working drafts are labeled. Analysis
is not connected. No risk scores or drought simulation are fabricated.

**Workspace backup** in the sidebar exports versioned JSON for fields, plans,
drafts, economics, map preferences and display units. Import validates the file,
shows a preview and merges on explicit confirmation; existing local records win
collisions. Settings and units are restored from the backup. Unsaved field edits
block import, and storage failure triggers rollback of preceding writes. Keep a
downloaded backup before clearing browser data; this is not cloud synchronization.

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
See [next product delivery](docs/PRODUCT-NEXT.md) for the SPA-85/86/88 dependency
split and the proposed simulation contract handoff.

Current progress (14 November 2026): 58 frontend checks passed across the complete
regression run and focused reruns; TypeScript and production build passed. These
are local checks, not deployed acceptance. Earlier backend verification recorded
20 tests and 13 shared fixtures passing; those were not rerun in the client pass.
See [client delivery](docs/CLIENT-DELIVERY.md), [PRD](docs/PRD.md), and the
[future delivery plan](docs/PRODUCT-NEXT.md).

## Regional Atlas assessments

Atlas now supports deck.gl H3 net-return rendering, crop/scenario filters,
source-aware diagnostics and a real USDA soil horizon profile. The API requires an
explicitly supplied, reviewed regional JSON dataset via `ATLAS_DATASET_PATH`;
without one it shows unavailable assessment coverage and retains geographic browsing.
Illustrative Kansas benchmarks are not used as production regional values.
See [Atlas delivery and acceptance](docs/ATLAS-DELIVERY.md) for dataset requirements,
soil-source verification and measured performance limits.

## Map providers and real drought data

Map options offers OpenFreeMap Light, Streets and Dark plus USGS topographic and aerial imagery, with persistent selection, attribution and provider-failure recovery. Aerial imagery is historical and its vintage varies. Explore and My fields also offer an optional, dated U.S. Drought Monitor overlay (2026-11-10), bundled from the official source with a category legend, provenance and reproducible import script. It provides regional context independently of NASA observation dates and Atlas economics. See [map sources and refresh steps](docs/MAP-DATA.md).

Source-backed historical cover-crop observations and published budget comparisons are available in the [prepared research evidence bundle](data/research/cover-crops/v1/README.md), with reproducible preparation and independent source review. Its research-site scope is distinct from regional Atlas predictions.

Regional Atlas now defaults to [published county yield effects](docs/REGIONAL-ATLAS.md):
486 county geometries and corn/soybean estimates from the authors' archived 2019–2020
research outputs, with crop/year filters and sample support. The bundled API endpoint
works without dataset configuration. These historical sample means are separate
from H3 net-return scenarios and current field forecasts.
