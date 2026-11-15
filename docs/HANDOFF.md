# Meridian — continuation handoff

Updated 14 November 2026 after the client completion and documentation passes.
Start with Current state and Next authorized work below. Later delivery sections
retain implementation history; earlier test counts are historical checkpoints.

## Current state

- Repository: `/Users/mariuscobilas/Developer/projects/spaceappschallange26`.
- Branch: `feat/meridian-sidebar`. Current HEAD is `d4cadaa` (`feat: milestone 5 done.`);
  `3984822` is an older map baseline. Substantial API, shared-contract, frontend and
  documentation work remains modified/untracked. Review the full working tree before
  checkpointing; no commit was made during the client or documentation passes.
- No push, deployment, domain purchase or Azure provisioning was performed in these
  delivery passes. Deployed acceptance remains pending.
- Latest user-approved structure supersedes the previous control-panel design:
  **Explore, My fields, Regional Atlas, Field Planner, Economics, Ask Meridian**
  are native routes in a full-height app navigation sidebar. There is no Compare item.
- Official shadcn skill installed with the requested pnpm command in
  `.agents/skills/shadcn/`; `skills-lock.json` records it. Read its rules/docs.
- Production build now uses `next build --webpack`: Turbopack's PostCSS workers
  failed to bind local ports in this environment. Development still uses Turbopack.
  The latest production build passed the four workspace routes and `/planner/saved`.

## User decisions

- Meridian is the working name (earlier PRD: FieldShift). One modern restrained UI;
  no A/B design, fake risk scores, severe drought demo or invented model outputs.
- Full-height left sidebar provides navigation and Workspace backup. Explore is
  map browsing; My fields owns field editing; Regional Atlas owns region browsing.
- Roads and place labels beneath translucent hexagons are explicitly wanted.
- Four progressive H3 resolutions, both modes, Kansas benchmarks, no login.
- Planner saves working management inputs. Economics is a manual calculator with
  explicit user assumptions; no live prices or predicted yields are implied.
- Ask Meridian prepares/copies/exports selected map and plan/draft context plus numeric
  evidence with source dates, units and missing states. Analysis remains disconnected.
- Current scope instruction: complete client work and documentation; leave the AI model,
  training and inference untouched. Planning future work does not authorize it.
- Deployment last: Azure with GoDaddy domain. Meteomatics remains an optional future
  backend integration. User leads the project and prefers hackathon speed.
- Any workers must be `gpt-6-luna` with a fresh, non-inherited context.

## Next authorized work

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
  `/fields`, `/atlas`, `/planner`, `/economics`, `/intel`. The map stays mounted
  across Explore, My fields and Regional Atlas, and is hidden/inert elsewhere.
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

## Usability and performance refinement

Saved plans now uses local Planner page navigation; its nested global sidebar link
was removed. Comparison is opt-in with selection on plan cards, responsive results
and a selection count. MapPreview is lazy-loaded on first Explore visit and remains
mounted afterward. Planner conditions are on demand. Field-condition reads share
in-flight work and a bounded 32-entry cache (5 minutes complete, 30 seconds partial
or unavailable); Refresh invalidates the current point/date across subscribers.
Validation, missing states and stale-response guards remain intact.

Planner distinguishes unchanged saved inputs from working drafts, explains invalid
inputs and save failure, and keeps area optional for calendar arithmetic. Economics
names missing assumptions and provides next actions. Ask Meridian invalidates copied
feedback when the request changes. Collapsed backup access and a keyboard skip link
are covered. The model/backend remains unchanged.

Verification for the refinement: 61/62 checks passed in the complete two-worker
regression run; the remaining evidence-copy assertion was updated for the revised
availability message and its three-test workflow file then passed. Combined current
coverage is 62 passing checks. The request-count test confirms one read across
Planner → Ask Meridian and one additional read on explicit Refresh. No latency
percentage or general bug-free claim is made. TypeScript and production build pass.


## Earlier compact toolbar checkpoint

This section records the prior toolbar pass before the route split below. Its
single Atlas sidebar switch and Field-mode tools have since moved to the dedicated
Regional Atlas `/atlas` and My fields `/fields` routes.

Explore now keeps only navigation, field/crop context, Map options and details in
the map bar. Regional Atlas is an adjacent sidebar entry, sharing the existing
persistent map and state rather than a second engine or a new URL. Selecting Explore
returns to Field mode; mode changes retain unsaved-edit protection.

Map options is a scrollable right Sheet with layers, opacity, source legend and
Latest/Past dates. Field tools appear only in Field mode; starting drawing closes
the Sheet and Finish/Cancel remain visible above the map. Phone layout uses compact
field/crop controls and the existing navigation drawer. No model/backend changed.

Lighter Explore verification: 63 checks passed across the complete regression run
and focused reruns after the compact-selector overlap fix. Tests cover options
visibility, keyboard dismissal, phone sidebar mode switching, source dates, imagery,
drawing and saved state. TypeScript and production build pass. The former toolbar
CSS flex rule was overridden specifically for compact context fields so the crop
selector cannot overlap Map options. No single final 63-test invocation is claimed.

## Split map workflows

Explore `/` is for map browsing and filters. My fields `/fields` owns point
selection, drawing, saved-field selection and management. Regional Atlas `/atlas`
is the direct route for regional H3 browsing and inspection. All three use the same
mounted MapPreview and share location/crop/date state. Direct URLs and browser
history restore the route's mode; Explore map clicks do not create field drafts.

My fields uses a mobile Sheet and a desktop dock for field selection and actions.
Selecting a point or starting a polygon closes the panel before map interaction;
Finish/Cancel remain visible while drawing. Atlas inspection can start a point draft
and routes into My fields. Field actions should stay out of Explore and Atlas
controls. Test and build verification for these routes is owned by the active
implementation pass; use its final report for current results.

Route-split verification: 68 checks passed across the full run and focused reruns.
The full run passed 66/68; the two saved-field selection checks were corrected to
use the named saved-field dialog and close it before navigating, then passed.
Coverage includes shared-map identity across routes, direct Atlas mode restoration,
Explore clicks without drafts, mobile field creation, Atlas-to-field transfer,
browser Back with dirty edits, legacy aliases, units and backups. TypeScript,
production build (including `/fields` and `/atlas`) and diff checks pass. No backend,
model, commit or push was performed in this refinement. The pre-existing deletion
of docs/PRD.txt was preserved.

## Field-flow bug audit

Fixed stale clean field-edit drafts leaking into Atlas, saved-field selection leaving
point-placement mode armed, and clipped long desktop field lists. Route changes now
clear transient drawing messages and clean edit drafts; Atlas visibility follows its
route. Saved-field details open only after any unsaved-edit transition is resolved.
Starting point selection also uses that transition guard. Desktop field lists have
a bounded flex scroll area so their last records remain reachable.

Four targeted browser regressions cover clean-edit navigation to Atlas, point-mode
cancellation on field selection, scrolling 30 fields, and preserving dirty edits when
starting a different tool. Existing browser-history guards and persistence tests are
included in the broader regression run. No backend or model changes were made.

Bug-audit verification: complete Playwright run passed 72/72 checks, including all
four added field-flow regressions. TypeScript and diff checks pass. FR-10/11's
quantitative deck.gl Atlas remains pending: current regional cards explicitly show
net return/yield/acreage unavailable; soil texture, regional aggregates, scenario
filters and performance targets have not been implemented or benchmarked.

## FR-10/11 Atlas engineering delivery

Atlas now consumes an explicitly configured validated dataset through `/api/v1/atlas`,
with shared TS/Pydantic contracts, strict bounded validation and honest unavailable
coverage when `ATLAS_DATASET_PATH` is unset. deck.gl H3HexagonLayer is lazily loaded
only for records, uses interleaved MapLibre WebGL with a geographic fallback, and
renders a fixed crimson-to-emerald USD/ha scale. Crop/scenario filters, source legend,
hover/picked diagnostics and no-active-area/missing coverage states are implemented.

`/api/v1/soil-profile` retrieves actual dominant-component USDA SDA horizon texture,
fractions, organic matter, density, pH, conductivity, drainage and hydrologic group.
The selected-region panel separates those point/survey values from regional dataset
outputs and NASA POWER meteorology. Finalized SQL passed a live Tribune lookup.

Verification: full frontend suite 81/81 passed; backend 31/31 tests, 16/16 shared fixtures,
TypeScript and production build passed. New tests use software-only fixtures; those
are never served as production values. Performance tests recorded warm setup 0.6–0.8ms,
cold setup 201–576ms and rAF 15–21fps on 721cells in Chromium SwiftShader/dev. The 60fps
target remains unmet here. See ATLAS-DELIVERY.md for measurements and acceptance.

No scientifically validated regional dataset is supplied/configured in this repo;
illustrative Kansas benchmarks remain excluded by user choice. Deployable regional
prediction coverage and hardware performance acceptance remain open. No model code,
commit or push was performed in this delivery.

## Map providers and sourced drought context

Map options now includes OpenFreeMap Light/Streets/Dark and USGS topographic/aerial
backgrounds. Choices persist and retain the camera, selection and completed field
boundaries. Provider failures use local geography with an explicit retry. New polygon
drawing locks the background selector until finish/cancel; provider failures defer
style replacement to preserve in-progress vertices. Map/drawing readiness resets
while a style loads, preventing actions against detached drawing tools.

Explore and My fields offer an opt-in official U.S. Drought Monitor snapshot as of
2026-11-10. The actual dated export was downloaded and validated, then reduced from
14,792,714 to 660,785 bytes using topology-preserving simplification. Metadata records
source URLs, hashes, attribution, coverage and display limitations. It loads only on
demand, has loading/error/retry states and a D0–D4 legend, and remains independent of
NASA observation dates. Atlas hides it to keep drought and economics colors distinct.
This does not supply missing crop/scenario yields or net returns.

The importer (`scripts/import-usdm.py`) reproduced the same output hash on repeated
runs with Shapely 2.1.2. Source date/export headers and public provider metadata were
checked live. Final frontend regression: **90/90 passed**; TypeScript, production
build, 16/16 shared JSON fixtures and diff whitespace checks passed. Browser coverage
includes provider requests, persistence, retry, edit-boundary preservation, failure
mid-draw, dated dataset loading and independent Atlas behavior. Mobile options were
visually checked. Public service browser requests are mocked deterministically in
tests; network/provider availability remains external.

Refresh/review future snapshots using [MAP-DATA.md](MAP-DATA.md). No model code was
changed. Scientifically validated regional economics data and hardware 60 fps
acceptance remain open; the added observational dataset does not close those gates.
Changes are local and uncommitted.

## Prepared cover-crop research evidence

The follow-up source search produced a catalog of additional USDA/Dryad datasets and a real research-site bundle in `data/research/cover-crops/v1/`. It contains 944 USDA plot observations, 24 published Colorado means, 8 no-forage budgets, 231 yield contrasts (4 missing) and 16 budget contrasts. Sources are pinned, controls/units are preserved, and no cross-study interpolation or AI inference is used.

A separate Luna worker reviewed source transcription and transformations; six regression tests and deterministic `--check` pass. See ATLAS-DATA-REVIEW.md for checks and limits. This is source-backed historical research evidence, not regional predictive validation; `atlasRegionalCompatible` remains false, and API configuration/model code are unchanged. The study-site view is a future consumer; no H3 coverage or active acreage was invented.

## Regional Atlas county layer

The default `/atlas` layer now uses actual published Deines et al. model outputs,
aggregated at the disclosed county scale. The prepared bundle contains 486 counties
and 2,769 corn/soybean crop-period summaries across six Corn Belt states for
2019/2020 and pooled records. API endpoint `/api/v1/atlas/regional-yield` serves it
without external path configuration. The identical real web bundle supports network
fallback; explicit API unavailable/invalid responses remain unavailable.

A separate Luna worker independently reproduced every emitted county mean/count.
The source archive MD5/SHA, published log-to-percent transformation, complete-case
subset matching, county joins and geometry were checked. County summaries remain
post-publication arithmetic aggregates of published historical model estimates,
not newly validated county causal effects or current field forecasts. The app's AI
model is unchanged, and net returns are not inferred. `Net return scenarios` keeps
the original H3 renderer and its independent economic-dataset requirement.

See REGIONAL-ATLAS.md for source, coverage, reproduction and acceptance details, and
REGIONAL-ATLAS-REVIEW.md for review findings. All 38 backend and 10 data-pipeline tests
pass, including direct re-aggregation from the original temporary archive. Final
browser/build verification is recorded in REGIONAL-ATLAS.md at delivery.

Final regional-layer verification completed: 99/99 frontend regressions and a
subsequent 7/7 county workflow run passed; TypeScript/production build passed.
38/38 backend, 10/10 data tests and 18/18 JSON fixtures passed. The live regional API
returned available/486 counties. Desktop/mobile views were inspected. Separate
county/economic camera state, correct study-area headers, bounded source disclosure,
timeout/error handling and default real-data coverage are in place. Work is local,
uncommitted, with no model or deployment changes.

## Main-branch integration — 15 November 2026

Integrated upstream `3561765` before publishing the regional Atlas work. Preserved
the incoming backend's app factory, lifecycle, Clovis routes, dependencies and model
code, and registered Atlas/soil routes alongside them. Refreshed the OpenAPI export.
Exact source-data bytes are protected by Git attributes so checksums survive checkout.

Post-integration checks: 54 API/service/contract tests, 10 data tests, 23 JSON fixtures,
TypeScript and production build passed. The incoming real-inference test requires
`data/experiments/clovis_regression/latest.json` and associated model artifacts, which
are not present locally; its missing-artifact failure was not concealed or repaired
by training/modifying a model. Atlas data serving remains independent of that model.
