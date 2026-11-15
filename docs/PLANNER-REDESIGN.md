# Field Planner redesign

15 November 2026. Client-side scope; AI models and backend contracts unchanged.

## Goal and flow

Field Planner is the field library. A user selects a saved field, resumes a working
plan, or adds a field through the existing map tools. There is no editable default
Kansas reference plan. Editing follows Calendar → optional Budget → Review & save.
Saved plans and alternatives remain accessible from the library. Explore keeps its
read-only H3 selection and conditions; field creation belongs to My fields.

## Parallel implementation plan

1. Luna: field library, compact shell navigation, editor routes and step resume.
2. Luna: compact calendar, numeric interval, calculated timeline, mobile actions,
   collapsed notes and source details, no direct calendar confirmation.
3. Luna: optional budget/review, named save and alternative actions, saved-plan UI.
4. Coordinator: combined immutable calendar/budget snapshots, alternatives, legacy
   compatibility, backup validation, integration and regression verification.

## Storage semantics

Draft calendar/budget inputs are retained on the device as working data. Save plan
confirms the calendar and optionally the complete budget together. Save as alternative
creates another stable record without replacing the original. Editing does not mutate
confirmed data until Save. Explicit Restore saved version restores both calendar and
budget; opening a record offers to keep a newer working draft. Calendar-only save
excludes budget from the snapshot while leaving working assumptions available.
Existing field/crop keyed records remain readable; new optional snapshot metadata
and stable alternative IDs are preserved in backup export/import. A saved snapshot
uses its saved area even if the field boundary later changes. Working plans use the
current managed field area, with no substituted hexagon acreage.

## Acceptance checks

- Empty library has one useful add-field action and no reference location form.
- First calendar input is visible on a phone without a stack of introductory blocks.
- Drafts survive route changes/reload; resume uses the last editor step.
- The calendar clearly derives termination from the user's interval, not the model.
- Incomplete budget can be skipped; missing values never become financial zeroes.
- One confirmed save includes its entered canonical budget and area.
- An alternative can be reopened/deleted without removing its original.
- Restoring a saved version does not silently overwrite newer working data.
- Backups retain legacy plans and new budget/alternative metadata.
- U.S./metric switching preserves canonical totals; source gaps stay explicit.
- Explore hexagon inspection and explicit field point/boundary creation still work.
- Keyboard/mobile navigation, production build and meaningful regression tests pass.

## Delivery status

Implementation and verification complete. Three Luna workers
handled the entry/navigation, calendar, and review/budget interfaces in parallel.
The coordinator integrated snapshot storage, area synchronization, alternatives,
legacy backup support and regression checks.

Focused checks passed for empty-state/mobile input placement, calendar-only saves,
combined budget/calendar save, alternative isolation/deletion, export round-trip,
draft resume, and explicit calendar+budget restore. Previous unit, saved-plan and
navigation cases were adapted to the new editor routes. Final full frontend suite: **111/111 passed** (two workers). Production build,
TypeScript, 23/23 JSON fixtures and diff checks pass. Desktop/phone layouts were
inspected, including 375px, landscape, dark mode and larger text without horizontal
overflow. Software WebGL timing is not hardware performance certification.
No commit or push requested in this turn.

The Explore inspection sheet now links to My fields in the selected area without
creating a draft or substituting hexagon acreage. A first-click picking fallback
resolves only cells already in the displayed geographic grid while the renderer
finishes loading.

Remaining product ideas: explicit season organization and automatic revision
history, undo/recently deleted, and production-hardware performance certification.
Save updates the opened record; Save as alternative is the explicit way to retain
an independent scenario. These remaining ideas are not implied to be implemented.

## Budget display refinement

Editor headers now show read-only field/crop context. Field changes go through the
library; next cash crop is edited in the Calendar form. Budget's footer contains
only Review plan and the optional-budget path. Evidence/map destinations remain in
the app navigation rather than competing with plan completion.

The visible result now shows only estimated return per area and for the whole
field: assumed crop revenue minus entered seed/termination costs plus subsidy.
Other crop production expenses are excluded. Calculation details start collapsed.
The baseline-change block and its explanation were removed at Marius's request;
review, saved cards, comparisons and exported summaries use the same return metric.
The internal baseline comparison arithmetic remains available and tested.

A −10% yield assumption does not itself imply a negative remaining return. Example:
150 bu/ac × $4/bu × 90% − $25/ac costs = $515/ac, or $51,500 on 100 acres.
The former −$85/ac value measured the change relative to baseline, not that return.
Inputs and stored budgets remain canonical; switching units preserves field totals.
Sergiu's unspecified original report is still not independently reproducible.

Method references: [Iowa State partial budgeting](https://www.extension.iastate.edu/AGDm/wholefarm/html/c1-50.html)
distinguishes incremental business changes; [UMN crop budgets](https://extension.umn.edu/agriculture/farm-operations-and-systems/agricultural-business-management/farm-finance/crop-budgets)
distinguishes production revenue and cost accounting. The application subtotal is
limited to the expenses actually entered, rather than full farm net profit.
