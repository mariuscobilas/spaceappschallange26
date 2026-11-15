# Product flow and UX priorities

Updated 15 November 2026. Scope: client-side usability and correctness; AI model unchanged.
Remaining session allowance reported by Marius: 17% of five hours. Prioritize confirmed
bugs and a coherent workflow over new datasets, map providers or model features.

## Intended flow

Explore conditions → choose/create a field in My fields → plan calendar → review
budget → confirm/save → return to or compare saved plans. Explore contains only the
map, map filters and source/context information. Field creation/deletion and saving
belong to My fields and the plan workflow.

Planning and economics now form a field-first workspace. /planner is the field
library; /planner/calendar, /economics and /planner/review are the editor steps.
A confirmed snapshot includes the calendar and optionally a complete canonical
budget. Working drafts remain separate; explicit alternatives preserve originals.
Legacy records remain readable and new metadata round-trips through backups.
See PLANNER-REDESIGN.md for implementation and verification details.

## Immediate issues

| Priority | Issue | Acceptance |
| --- | --- | --- |
| P0 | Sergiu reports an incorrect U.S.-units savings total; no example values supplied | Track as unverified until reproduced. Known −$85/ac × 100ac case must equal −$8,500 in either display system. Cover per-acre/total display, authoritative polygon area, saved-plan area, rounding and context changes. Never patch a correct formula speculatively. |
| P0 | Field deletion is buried and inactive deletion resets selection | Visible per-field Delete action, named confirmation, affected-record disclosure, correct active/inactive behavior and recoverable storage feedback. |
| P0 | Saving is ambiguous | Distinguish draft retention, confirmed save and session-only fallback. Clear Save/Cancel actions and persistence after reload. |
| P1 | Features feel disconnected | One plan/budget workspace, stable context and a clear first action when no field is selected. |
| P1 | Explore scope | No field editing, saving, deleting or planner actions in Explore. Keep dedicated My fields. |

## Next improvements, in order

1. **Season organization.** Make season/year explicit in the library and default
   comparisons to the same field/crop/season. Current named alternatives allow
   preserving scenarios; Save updates the opened record rather than keeping an
   automatic revision history.
2. **Recovery.** Consider bounded undo/recently deleted, with a clear local-only
   backup reminder. Combined review and calendar/budget snapshots are implemented.
3. **Map simplification retained from the earlier review.** Consider moving regional
   research into Explore as a clearly named map/filter mode, removing the separate
   Atlas sidebar destination when coverage and navigation support the change. Keep
   conditions and historical research distinguished. Preserve /atlas links during
   migration. Do not combine field-management actions into Explore.
4. **Evidence relevant to the chosen field.** Show whether crop/location/year are
   covered. The current regional study covers historical Corn Belt corn/soybeans,
   not Kansas wheat. An unsupported crop/location must not look like zero acreage
   or a field prediction. More relevant coverage is more useful than more basemaps.
5. **Recovery and confidence.** Consider a bounded undo/recently-deleted flow after
   reliable delete semantics; make local-only persistence and backup discoverable.
6. **Reduce friction.** Default to last selected field, preserve units across steps,
   make empty states offer one next action, and keep primary actions reachable on
   phones and by keyboard. Keep source methods secondary to readable results.

## Earlier requirements retained

- Regional county research stays at its supported geographic scale, with sample
  support, study dates and sources; no fabricated H3 precision or financial returns.
- Validated regional economic data remains a separate requirement. Hide or clearly
  label unavailable capabilities instead of sending users into dead ends.
- Retain source-backed soil/moisture diagnostics and honest missing-data states.
- Hardware 60fps/cold-update acceptance remains open; passing functional tests is not
  performance certification. Optimize only against measured bottlenecks.
- AI/model integration is outside this client-side pass.

## Implemented in this client-side pass

- Each My fields card exposes Delete with the field name and affected saved-record
  counts in confirmation. Deleting an inactive field preserves the active selection
  and unrelated unsaved edits. Dirty edits must be saved or cancelled first.
- Field save/delete feedback distinguishes successful browser persistence from
  session-only retention when storage fails. Point and boundary edit/save/reload
  flows are covered by browser regressions.
- Field Planner opens the field library. Editing uses compact Calendar / Budget /
  Review navigation, Back to fields, and shared field/crop context.
- Explore remains map/filter-only, covered by a dedicated regression.
- Saved-plan area labels respect U.S. units. Authoritative boundary area overrides
  stale manual display buffers, and totals disclose unrounded calculation basis.
  The controlled −$85/ac × 100ac case passes; Sergiu's unspecified report remains open.

No model, API payload, dataset, or saved-storage schema changes were made.

## Map and navigation refinement

Explore now floats navigation at the top left and only Map options at the top
right, over a transparent strip. Crop/location filter context is inside Map options;
the panel close button remains in its upper-right corner. Kansas preset choices
were removed from the selector; historical stored contexts remain compatible.
My fields is a Field Planner tab rather than a separate main-sidebar destination.
The existing /fields URL, saved data, and persistent map are retained.

## Explore hexagon inspection correction

Explore clicks select the rendered H3 cell and show a read-only information sheet:
cell ID, centre, area, source-backed conditions and on-demand soil horizons. No
point marker or field draft is created. Point placement remains in My fields.
This clarifies map/filter-only scope: read-only map inspection is part of Explore.
Regional financial assessment cards remain separate from geographic inspection.
