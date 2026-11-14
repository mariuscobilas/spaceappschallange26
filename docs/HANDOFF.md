# Meridian — continuation handoff

## Current state

- Repository: `/Users/mariuscobilas/Developer/projects/spaceappschallange26`.
- Branch: `feat/meridian-sidebar`. Committed baseline remains `3984822`, locally
  merged into main earlier. Current shadcn rebuild and documentation are uncommitted.
- No push, deployment, domain purchase or Azure provisioning has occurred.
- Latest user-approved structure supersedes the previous control-panel design:
  **Explore, Field Planner, Economics, Ask Meridian** are separate workspaces in
  a full-height app navigation sidebar. There is no Compare navigation item.
- Official shadcn skill installed with the requested pnpm command in
  `.agents/skills/shadcn/`; `skills-lock.json` records it. Read its rules/docs.
- Production build now uses `next build --webpack`: Turbopack's PostCSS workers
  failed to bind local ports in this environment. Development still uses Turbopack.
  Actual updated pnpm production build passes all four page routes.

## User decisions

- Meridian is the working name (earlier PRD: FieldShift). One modern restrained UI;
  no A/B design, fake risk scores, severe drought demo or invented model outputs.
- Full-height left sidebar is navigation only; Explore has a single map toolbar.
  Location/crop/mode/layers/date in toolbar; details open on demand in a Sheet.
- Roads and place labels beneath translucent hexagons are explicitly wanted.
- Four progressive H3 resolutions, both modes, Kansas benchmarks, no login.
- Planner saves working management inputs. Economics is a manual calculator with
  explicit user assumptions; no live prices or predicted yields are implied.
- Ask Meridian prepares/copies selected map and saved-plan context. Analysis is
  explicitly disconnected. Do not fabricate generated answers.
- Deployment last: Azure with GoDaddy domain. Meteomatics remains an optional future
  backend integration. User leads the project and prefers hackathon speed.
- Any workers must be `gpt-6-luna` with a fresh, non-inherited context.

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

## Verification and next work

```sh
pnpm --filter @spaceapps/web dev
pnpm --filter @spaceapps/web exec tsc --noEmit
pnpm --filter @spaceapps/web build
pnpm --filter @spaceapps/web exec playwright test
node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs
```

Preview `http://localhost:3000/`; check before starting duplicate servers. Browser/
server/build commands have needed sandbox escalation. Latest manual checks cover
all four pages, 375/390px phones and landscape, no toolbar overflow, and slider ARIA.
Final SPA-84 verification: production build and TypeScript pass, all 26
browser/data/calculator/geometry tests pass, all six backend CDL/parser/coordinate
tests pass, and all ten shared JSON fixtures validate. Run backend tests from
`apps/api` with `.venv/bin/python -m unittest discover -s tests -v`.
Manual Chromium checks
confirmed vertex edit → Finish → Cancel restores the original boundary; Save
retains its ID and persists the changed geometry and area.

Next functional milestone: additional real environment context and backend/model
integration. Do not auto-implement the entire roadmap without a user instruction.
