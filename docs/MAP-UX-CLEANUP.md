# Map workspace cleanup

15 November 2026. Scope: client layout and interaction, no model/data changes.

## Problems observed

The field-management map had two header rows and two copies of drawing guidance.
The field panel continued advertising creation actions and an empty state while a
boundary was already being drawn. A stale discard notice remained during a new
operation. Independently positioned vegetation/date and drought status cards
occupied the same bottom corner and could collide with native map attribution.

## Implementation plan

- Luna layout worker: one field toolbar and one drawing/point action row; preserve
  Back to Field Planner, map options, details, native attribution and map controls.
- Luna status worker: one compact, wrapping map data footer outside the map viewport
  for observation date/layer, imagery source, loading/error/retry and drought status.
- Coordinator: simplify field panel, focus creation operations, dismiss/clear stale
  notices, integrate and visually verify desktop/mobile geometry.
- Luna regression worker: assert no duplicate instructions, no overlapping status
  and attribution, usable drawing viewport, reachable actions and mobile layout.

## Acceptance

One drawing instruction and one Finish/Cancel pair; saved field data untouched
until explicit save; new operation clears prior messages; layer/date and drought
readouts share one layout area; attribution remains visible inside the viewport;
no card overlaps controls or clips at phone widths. Existing point/boundary,
basemap, imagery, drought, Atlas and Explore H3 flows continue working.

Status: implemented with three Luna workers and coordinator integration.

Verification: 23/23 existing map-flow tests plus 2/2 new desktop/mobile overlap
regressions pass. Production build and TypeScript pass. Desktop and settled phone
screenshots were inspected with active drawing and imagery/drought readouts. The
phone drawing viewport remains approximately 590px high at 390×844 before the
optional extra data row. Attribution stays inside the map; the data footer occupies
its own normal-flow space. No model/API changes and no commit/push in this turn.
