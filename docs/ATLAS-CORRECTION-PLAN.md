# Atlas correction plan

15 November 2026. **Proposed; not implemented.** Prepared with UI/UX Pro Max and
review of the current desktop/phone Atlas, source methods, PRD and React/Next.js
implementation. This is an implementation plan, not new scientific validation.

## Product decision

Remove Regional Atlas from primary navigation. Keep its useful historical research
as an optional data view inside Explore. Primary navigation becomes Explore,
Field Planner and the existing Ask Meridian destination. This work does not expand
or imply availability of Ask's analysis capabilities.

The main journey remains geographic context → choose/create a field → calendar →
optional budget → review/save. Research supports understanding historical evidence;
it does not provide field forecasts, termination recommendations or a profit map.
The existing bundle covers historical corn/soybean samples in six Corn Belt states,
not Kansas wheat. Finding more datasets is outside this correction.

## Intended interaction

1. Explore initially shows its normal geographic H3 view and current map controls.
2. Map options contains a **Data view** choice: Conditions or Historical research.
3. Historical research reveals one study, its short coverage explanation, crop and
   period filters. Initial period is 2019–2020; the supported crops are corn/soybeans.
4. The map fits the study extent on first activation without an explicit county or
   saved research camera. Subsequent filter changes preserve the user's camera.
5. Clicking a county opens its research information. Closing returns focus to the
   triggering control where practical; the selected county remains identified.
6. Returning to Conditions restores its camera, imagery settings and selected H3
   cell. Browser Back/Forward restores the view rather than losing the user's place.

### Default map surface

- Navigation toggle at the upper left; Map options at the upper right.
- No separate study toolbar, header selectors, refresh button or source paragraph.
- Research identity and the visible legend share the existing normal-flow data
  footer: **Historical cover-crop research · Corn · 2019–2020**.
- County totals, technical methods and source hashes move into source details.
- Crop and period remain inside Map options. Reset study view is a secondary action
  there. Retry appears when data retrieval fails, rather than as a permanent CTA.
- Conditions imagery/drought settings are retained while research is viewed, but
  their colored overlays are not composited with county research by default. Each
  data view has a coherent date/legend; switching back restores the observations.
- Remove crop controls from Conditions if the displayed observations are crop
  independent. Research retains its supported-crop filter in Map options.

### Research information

Desktop: one docked, scrollable panel beside the map. Phone: one closable Sheet;
Map options and research details must not open competing sheets simultaneously.

Information order:

1. County and state.
2. One primary metric: **Estimated yield difference**, signed percent.
3. Crop and historical study period beside the value.
4. A short explanation of the comparison and geographic meaning.
5. Study-record support, including annual support when pooled years differ.
6. Expandable source/method/limitations; technical hashes stay here.

Use wording that identifies a county aggregate of published sample-level model
estimates. Do not present it as a county-wide measurement or a field prediction.
Sample counts are study records, not independent farms or a confidence score.
No automated transfer into a field's budget or termination interval.

### Coverage and missing states

- With a planning field selected, show whether its representative sample point and
  crop have a qualifying estimate. A sample point match does not prove coverage of
  the entire field, applicability to its management, or current predictive validity.
- Unsupported location/crop: “This study does not cover this location/crop.” Offer
  Return to conditions; retain an optional View study area action in Map options.
- County geometry with no qualifying estimate: show No estimate for this crop/period.
- Distinguish loading, no matching estimate, request failure, bundled-copy fallback,
  and explicit service unavailability. Missing estimates never become zero.
- Preserve the existing rule: an explicit unavailable/invalid API response is not
  silently replaced with the bundled copy. Disclose a network fallback copy.

## Map communication and accessibility

Retain county polygons for county research; do not copy county values onto fine H3
cells. Conditions keeps the user's existing selectable H3 grid and its information.

Replace the “good/bad land” impression with a restrained diverging research scale.
Prototype muted purple/teal around a light midpoint, with explicit Lower / Zero /
Higher labels and a distinct No estimate swatch. Keep the zero midpoint and fixed
±10% display limits across filters; show full unclipped values on inspection.
Validate contrast and color-vision simulations before finalizing exact colors.
Numbers, labels and selection outlines supplement color. Gray is never zero.

Reuse the existing forest/neutral design tokens and typography. Avoid a new visual
system. Controls have 44px hit areas, visible keyboard focus and clear labels.
Offer a keyboard-accessible county list inside the research panel as an alternative
to small polygon targets. It uses the same selection and filters as the map.
Respect reduced motion and ensure fixed controls never obscure focused elements.

## State, routing and compatibility

Separate **planning context**, **H3 inspection**, and **research inspection**.
Changing a county, crop filter or study period must not change the active saved
field, its planning crop, drafts, budget or confirmed snapshots. Refactor detail
components to receive their inspection context instead of reading it implicitly
from the global planning selection. Field creation still requires an explicit action
in My fields; browsing research does not create a draft or field point.

Use validated URL state, for example:
`/?view=research&crop=corn&period=2019-2020&county=19153`.
Allowlist views, crop/period values and dataset county IDs; invalid values fall back
to valid defaults without fabricating coverage. Default `/` opens Conditions.
Preserve per-view cameras and selections during client navigation. Fetch research
lazily when enabled; switching filters reuses the loaded dataset.

Keep `/atlas` as a compatibility redirect into Explore's research view. Preserve
valid incoming research filters and selected county when present. Old links must
not end at a missing route. Back navigation must not loop through the redirect.
Older stored `mode: atlas` remains readable, but does not override an explicit URL
or silently open research on a normal Explore visit. Test existing backups/fields.

Remove Net return scenarios from ordinary controls while no usable validated
regional economic dataset exists. Preserve its renderer, API and validation code
for future work; do not create financial geography from this historical yield study
or manual Planner budgets. Update the requirement status honestly rather than
marking unavailable financial coverage complete.

## Implementation sequence and ownership

| Order | Work | Boundary / completion evidence |
| --- | --- | --- |
| 1 | Isolate map inspection state; define URL parsing and restoration | Coordinator; pure parser/state regression checks before UI integration |
| 2A | Explore navigation, Map options research controls, compatibility route | UI worker; remove old main destination/toolbar; preserve mounted map |
| 2B | Research details, coverage messages, keyboard county list and legend | Evidence UI worker; supported scale and missing-value semantics retained |
| 3 | Integrate renderer activation, footer and per-view cameras | Coordinator; H3/field context and source-date regression checks |
| 4 | Responsive/accessibility and end-to-end review | QA worker plus coordinator; screenshots and behavior checks |
| 5 | Update current documentation and acceptance status | Coordinator; PRD, design-system MASTER, handoff and Atlas docs reflect final UI |

Parallel UI work starts after the coordinator defines the state interfaces. Workers
own separate files; MapPreview integration stays with one owner. Use Luna workers
if delegated for implementation. No API payload or model changes are expected.
If a shared endpoint contract actually must change, follow contracts-first rules.

## Acceptance and release checks

- Main navigation has no Regional Atlas destination; `/atlas` links still work.
- Conditions preserves H3 selection, diagnostics and explicit field creation flow.
- Enabling/inspecting research never switches the Planner's field or crop.
- Map options is the only location for research selectors; no stacked toolbar.
- At 375×667 and 390×844, the closed-panel map retains at least 65% of the viewport;
  the combined identity/legend footer is bounded to 80px at default text size.
  At enlarged text sizes, prioritize wrapping/scrollability over this height target.
- Desktop/phone information panels, source disclosure and long county names fit.
- Legend, footer, native attribution and zoom/navigation controls do not overlap.
- Keyboard users can choose a county, read its value and close details; labels and
  missing states are understandable without color. Check light/dark and reduced motion.
- Switching crop/period clears incompatible detail values without replacing them
  with stale values; camera movement is deliberate, not repeated on every update.
- Explicit no coverage, missing estimate, offline fallback and API unavailable states
  are independently exercised. Research years and observation dates stay separate.
- Existing fields, budget units/totals, saved alternatives, backups and dirty-edit
  protection retain their behavior. No study values silently populate budgets.
- Run relevant Playwright, TypeScript and production build checks, then the full
  frontend regression suite once integration is stable. No new tests that only
  mirror CSS implementation; assert state preservation and interaction geometry.
- Measure loaded-dataset filter updates against the existing <300ms target. A
  software-WebGL run does not establish 60fps on production hardware.

## Skill basis and design-document reconciliation

UI/UX Pro Max search verified guidance for predictable Back behavior, active state
and deep links. The progressive-disclosure search returned an unrelated result and
its narrower retry returned none; use the skill's explicit quick-reference rules
`progressive-disclosure`, `nav-hierarchy`, `legend-visible`, `color-guidance` and
`focus-not-obscured`, rather than attributing that advice to a database match.

Read `design-system/meridian/MASTER.md` before implementation: its navigation and
shared-context descriptions are stale relative to the recent Planner work. Update
those sections during implementation; do not regenerate/overwrite the entire
system or treat old six-destination navigation as a reason to retain Atlas.

Planning only in this change: application code, datasets and models are unchanged.
