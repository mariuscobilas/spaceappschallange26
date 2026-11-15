# Meridian — continuation handoff

Frontend checkpoint: 14 November 2026. ML continuation update: 15 November 2026.

## Current ML research continuation

Start with [ML_RESEARCH_PLAN.md](ML_RESEARCH_PLAN.md) for the current user decisions, completed audit, dataset paths, experiment rationale and continuation steps. The user reopened ML research and clarified the decision as **planting a proposed cover crop versus leaving the interval fallow before a following cash crop**, while protecting water and yield. Current payloads are retained.

Auditing, NASA acquisition, preparation and absolute-yield/model-family/matched-contrast experiments are complete. Read [COVER_FALLOW_EVALUATION.md](COVER_FALLOW_EVALUATION.md): benefit discrimination is inadequate despite some magnitude predictability. **Next address paired-data/context and initial-water gaps before Phase 4.** No model was promoted. [WATER_YIELD_DATA_FEASIBILITY.md](WATER_YIELD_DATA_FEASIBILITY.md) records source eligibility and gaps.

The remaining sections retain the earlier frontend delivery checkpoint. Its repository path, branch/HEAD, test counts, termination-first framing and instruction to defer ML are historical; inspect the current workspace and follow the ML plan for this research track. Frontend delivery remains intact.

## Frontend checkpoint (14 November 2026)

- Repository: `/Users/mariuscobilas/Developer/projects/spaceappschallange26`.
- Branch: `feat/meridian-sidebar`. Current HEAD is `d4cadaa` (`feat: milestone 5 done.`);
  `3984822` is an older map baseline. Substantial API, shared-contract, frontend and
  documentation work remains modified/untracked. Review the full working tree before
  checkpointing; no commit was made during the client or documentation passes.
- No push, deployment, domain purchase or Azure provisioning was performed in these
  delivery passes. Deployed acceptance remains pending.
- Latest user-approved structure supersedes the previous control-panel design:
  **Explore, Field Planner, Economics, Ask Meridian** are separate workspaces in
  a full-height app navigation sidebar. There is no Compare navigation item.
- Official shadcn skill installed with the requested pnpm command in
  `.agents/skills/shadcn/`; `skills-lock.json` records it. Read its rules/docs.
- Production build now uses `next build --webpack`: Turbopack's PostCSS workers
  failed to bind local ports in this environment. Development still uses Turbopack.
  The latest production build passed the four workspace routes and `/planner/saved`.

## Frontend decisions recorded on 14 November 2026

- Meridian is the working name (earlier PRD: FieldShift). One modern restrained UI;
  no A/B design, fake risk scores, severe drought demo or invented model outputs.
- Full-height left sidebar provides navigation and Workspace backup; Explore has a single map toolbar.
  Location/crop/mode/layers/date in toolbar; details open on demand in a Sheet.
- Roads and place labels beneath translucent hexagons are explicitly wanted.
- Four progressive H3 resolutions, both modes, Kansas benchmarks, no login.
- Planner saves working management inputs. Economics is a manual calculator with
  explicit user assumptions; no live prices or predicted yields are implied.
- Ask Meridian prepares/copies/exports selected map and plan/draft context plus numeric
  evidence with source dates, units and missing states. Analysis remains disconnected.
- Scope during that frontend pass: complete client work and documentation while leaving
  the AI model, training and inference untouched. The later ML research scope and
  completed/prepared work are recorded in the current ML continuation section above.
- Deployment last: Azure with GoDaddy domain. Meteomatics remains an optional future
  backend integration. User leads the project and prefers hackathon speed.
- Any workers must be `gpt-6-luna` with a fresh, non-inherited context.

## Next work proposed at the frontend checkpoint

The completed client scope is recorded in [CLIENT-DELIVERY.md](CLIENT-DELIVERY.md).
[PRODUCT-NEXT.md](PRODUCT-NEXT.md) is the future plan with dependencies, proposed
owners and exit gates. Immediate preparation: review/checkpoint existing local work,
inventory usable evidence, and propose one crop/geography, comparison baseline and
validation approach. These preparation tasks are planned, not claimed complete.

When authorized, agree shared simulation contracts before implementing a service
or prediction client. The old analysis endpoint is hard-coded demo content; do not
wire it into the live workflow. Validated Planner outputs and grounded explanations
precede quantitative Atlas; demo acceptance and Azure/domain deployment come last.

## Implementation pointers

- Root shell: `apps/web/components/workspace/AppShell.tsx`. App Router URLs `/`,
  `/planner`, `/economics`, `/intel`. Map stays mounted, hidden/inert off Explore.
- Context/persistence: `components/workspace/MeridianProvider.tsx`,
  `lib/workspace.ts`. Existing map key `meridian.map-settings.v3` migrates v1/v2.
  Fields key `meridian.fields.v1`; plans `meridian.field-plans.v2`; economics
  `meridian.economics.v2`. Saved-field inputs use stable field ID plus crop; legacy
  v1 location-based records are preserved and migrated on first field save.
  Previous Compare state key is ignored.
- Workspaces: `PlannerWorkspace.tsx`, `EconomicsWorkspace.tsx`,
  `IntelWorkspace.tsx`. Economics core: `lib/economics.ts`, finite/overflow checks.
- UI primitives: generated `components/ui`, Base UI Nova, Tailwind v4, semantic
  theme tokens in `app/globals.css`, config in `components.json`.
- Generated Slider needed corrections: scalar values render one thumb, and ARIA
  labels/descriptions are forwarded to the actual range input. Preserve these.
- FieldGroup uses CSS inline-size containment. Toolbar groups override that to
  `container-type: normal` to retain intrinsic horizontal sizing.
- Map: `components/map/MapPreview.tsx` (toolbar/details), `MapCanvas.tsx` (engine),
  `lib/map/engine.ts`. ResizeObserver preserves fit across sidebar/nav changes.
- Basemap OpenFreeMap Positron with local hex fallback. H3 res2 zoom<4, res3<6,
  res4<9, viewport-scoped res5 above. Locality references are not verified farms.
- NASA GIBS EPSG:3857 PNG: SMAP L4 surface moisture (z<=6), VIIRS NOAA20 8-day NDVI
  (z<=8), IMERG precipitation rate (z<=6, mm/hour). Parse capabilities Time; resolve
  actual latest/historical dates, respecting gaps. Tiles are not numeric ML features.
- MapLibre v6 workers/shared files copied by `scripts/prepare-maplibre.mjs` into
  ignored public/vendor assets before dev/build. Without this, vector layers fail.
- SPA-84 adds exact Field-mode point selection and Terra Draw creation/editing.
  `lib/fields/geometry.ts` calculates geodesic hectares, centroid and an interior
  sample. Single-ring fields cap at 5,000 ha; oversized drafts remain editable.
  `FieldDetails.tsx` manages saved fields, crop acceptance and delete confirmation.
  `FieldGuards.tsx` protects unsaved changes. Boundary area controls Planner and
  Economics; points retain manual area. `lib/fields/storage.ts` validates restores.
- Shared SavedField and LandCoverResult contracts have TS/Pydantic mirrors and
  fixtures. `/api/v1/land-cover` queries real USDA CDL through the backend with
  EPSG:5070 conversion, timeout, bounded cache and explicit unavailable responses.
  Default latest CDL year is 2025, configurable with `CDL_LATEST_YEAR`. Crop
  suggestions require acceptance. This is point sampling, not whole-field analysis.
- ML/Intel analysis remains disconnected; existing mock analysis is not shown as real.

## Latest verification and commands

The client completion pass recorded 58 checks passing across the complete regression
run and focused reruns, plus TypeScript and production build. Coverage includes
backup download/parse, invalid import, conflict preservation, migration aliases, quota
rollback, phone access, comparison/export and evidence formatting alongside existing
field/map/planning/economics checks. This is combined coverage, not a claim that one
final 58-test invocation ran. Earlier backend/fixture verification recorded 20 tests
and 13 fixtures passing. No tests were rerun solely for this documentation update.

Check existing server state before starting a preview; server availability below
is historical, not a promise that a process is currently running.

```sh
pnpm --filter @spaceapps/web dev
pnpm --filter @spaceapps/web exec tsc --noEmit
pnpm --filter @spaceapps/web build
pnpm --filter @spaceapps/web exec playwright test
node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs
```

Preview URL: `http://localhost:3000/`; API: `http://localhost:8000`. Browser/server
commands may require sandbox escalation. Run backend tests from `apps/api` using
`.venv/bin/python -m unittest discover -s tests -v` when backend changes warrant it.
Do not rerun all tests solely for prose edits; check documentation links and diff.

## Historical delivery checkpoints

The sections below describe earlier implementation passes. Use the latest summary
above for current verification; smaller counts below are retained as history.

## Termination-first usability pass

- User prioritizes an existing cover crop: when to terminate before the next cash
  crop. Four destinations remain. Shared FieldContext consolidates saved fields
  and Kansas references and is visible in every workspace header.
- Planner leads with planting date and shows a termination calendar. Working drafts
  use `meridian.plan-drafts.v1` by field/crop and survive navigation/reload, separately
  from confirmed plans. Preserve this distinction when wiring analysis.
- `lib/units.ts` and `hooks/use-unit-system.ts` provide U.S./metric display with
  metric storage. Preference key `meridian.unit-system.v1`; metric remains the
  initial default. Grain bushel weights vary by crop; cotton uses lint pounds.
  Calculations use canonical values, never rounded display strings.
- Economics groups revenue/cost/area assumptions. Per-area results require all
  financial inputs; parcel totals additionally require valid area. Blanks are missing.
- Atlas details offer Inspect field here at the centroid. It starts a point draft,
  preserves crop/date, and does not substitute the regional cell as a parcel.
- `docs/PRODUCT-NEXT.md` records the next contract handoff and the blocked/unblocked
  portions of SPA-85/86/88. Original issue drought replay language conflicts with
  latest/past-only product direction; seven curve samples differ from thirteen
  five-day slider settings. Resolve both before simulation integration.

## Source-backed field conditions

- Shared contracts: `shared/src/types/field-conditions.ts` and mirrored Pydantic
  `FieldConditionMeasure` / `FieldConditionsResult`; three new fixtures cover
  available, partial and unavailable data. Numeric fixtures are never served as
  current observations on failure.
- GET `/api/v1/field-conditions` accepts finite CONUS-bounds latitude/longitude and
  optional `as_of` date (1981-01-01 through today UTC). Real independent NASA POWER
  and USDA SDA retrieval is in `apps/api/app/services/field_conditions.py`.
- NASA PRECTOTCORR is summed only over complete contiguous 30-day UTC windows.
  GWETROOT is 0–1 relative saturation in 0–100 cm, not VWC. SDA aws0100wta is mapped
  capacity in source cm, converted to mm; no current-water estimate is derived.
  Historical weather dates resolve to actual available data; soil mapping remains
  the current survey, with no weather observation date.
- Provider metadata uses POWER root-level `parameters`; time series use
  `properties.parameter`. Unit `1` is valid for GWETROOT; missing sentinels are
  withheld. Live provider checks succeeded, including actual two-day lag in the
  queried latest NASA period. No cadence or nationwide applicability is promised.
- Each provider has a seven-second total deadline, bounded bodies and independent
  missing states. Bounded cache keys use coordinates/as-of date; good results cache
  30 minutes, partial/missing results 30 seconds. No cloud/database dependency.
- Hook `lib/fields/use-field-conditions.ts` aborts at ten seconds, rejects mismatched
  samples/dates/units and protects against stale responses. Reusable panel
  `components/fields/FieldConditions.tsx` is mounted in FieldDetails and Planner.
- During that pass, the local API was restarted with these routes loaded. Configured
  ports are web 3000 and API 8000. Simulation/ML/Intel analysis remain disconnected.
- Drawing now exposes explicit ready feedback; Finish waits for Terra Draw rather
  than racing the asynchronous adapter import. The regression waits for the actual
  ready state before adding vertices.
- Final verification: production build, all 39 frontend checks, all 20 backend
  tests, all 13 shared JSON fixtures and shared/web TypeScript checks pass. Live
  data rendering checked at desktop and 390px phone widths without overflow.

## Saved plans, toolbar and regional overview

- `/planner/saved` lists confirmed plans, linked under Field Planner and from its
  header. Reopening restores current field geometry/name and the plan's crop,
  including across reload. Different working drafts have explicit open/restore
  choices. Deletion preserves fields/economics and removes matching legacy aliases.
- Explore controls use consistent labels and bottom alignment: actual input/button
  centres match in Latest/Past. Mobile controls wrap without horizontal overflow.
- Atlas uses a docked right overview beside the desktop map; phones use a Sheet.
  Shows full H3 cell area, centroid, resolution, crop/date and centre-point conditions.
  These are not regional averages. Return/yield/acreage remain unavailable.
- Atlas reference-region clicks use actual hex centroids. Selection stays outlined
  across zoom levels. Resolution-5 GeoJSON now uses closed longitude/latitude rings.
- Latest regression suite: all 46 frontend checks pass. No commit/deployment made.

## Client completion pass (Luna execution)

- Browser-local JSON backup/export and explicit merge import are available from Workspace backup in the sidebar. Validated files include fields, confirmed plans, drafts, economics, settings and units. Existing local records win collisions; storage failure rolls back preceding writes. Migrated plan aliases export under canonical context keys.
- Saved plans compares two manual calendar plans and downloads a text summary; different field/crop contexts are disclosed. Ask Meridian prepares and exports numeric source context with sample coordinates, units, dates, sources and missing states; analysis remains disconnected.
- Planner input readiness and Economics assumption provenance are explicit. No backend, model, training or inference changes were made in this pass.
- Verification: 46 original checks passed in the full run; expanded evidence/comparison and backup checks passed in focused reruns (58 checks across the combined suite). TypeScript and production build pass. See [CLIENT-DELIVERY.md](CLIENT-DELIVERY.md) for scope and process. No commit or deployment performed.

## Backend integration update — 15 November 2026

The backend worktree has pulled Meridian through commit `7ca3efd` and retained the client and environmental routes. `POST /api/v1/analyze` now returns explicit provisional cover planting advice (`plant`, `do_not_plant`, `review`, `insufficient_evidence`), scenario moisture, illustrative finances, and quality flags. Canonical Pydantic/TypeScript schemas and four advice-state fixtures live in `shared/`; see [API_HANDOFF.md](API_HANDOFF.md). Existing `/api/v1/field-shift/analyze` remains its separate fixed legacy demo route. Planner and Economics have not been silently connected to either service. Scientific validation remains pending; this user-authorized prototype policy does not establish agronomic correctness. Compatible model bundles can be replaced at API startup without changing frontend payloads.
