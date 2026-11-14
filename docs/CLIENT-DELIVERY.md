# Client delivery — 14 November 2026

Status: completed locally. This record covers the browser-side delivery; it does
not claim that a simulation client, validated analysis or deployed workflow exists.
See [milestones](MILESTONES.md) for overall progress and
[future delivery plan](PRODUCT-NEXT.md) for subsequent phases.

## Scope and execution plan

Complete useful browser-side functionality while model and inference integration remain deferred. Three Luna agents own independent workstreams, followed by integration review and regression checks.

1. Workspace backup: versioned JSON export; validated import with preview, merge and conflict preservation; fields, confirmed plans, working drafts, economics, settings and display preference.
2. Saved plan comparison: select two confirmed plans, compare calendar dates, lead times, crop, area and notes; disclose different contexts; download a readable summary.
3. Evidence handoff: prepare and export Ask Meridian requests with actual numeric field context, source periods, units, provenance and explicit missing states. Explain manual planning and economics inputs.
4. Verify browser workflows, invalid imports, persistence, phone layouts, TypeScript and production build. Preserve the prior implementation and existing local work.

## Integration boundary

No new model, training, inference, prediction endpoint or backend contract is part of this delivery. Existing numeric field-condition retrieval is reused. Calendar dates and manual financial scenarios remain arithmetic. Quantitative Atlas colors, optimized termination timing, predicted yield effects and generated answers require a later validated service.

The simulation contract and evidence-backed backend remain the next dependency. Frontend completion does not establish crop/geography applicability or model validity.

## Delivered and verified

- Sidebar Workspace backup opens a scrollable Sheet. Export uses current session data. Import validates size/version/records/references, previews counts, preserves existing records on collisions, applies settings/units immediately and rolls back preceding storage writes on failure. Unsaved field edits block import. Export canonicalizes migrated plan aliases.
- Saved plans supports two-plan selection, context warnings, calendar comparison, deletion recovery, clear selection and text download with notes, dates and coordinates.
- Ask Meridian displays and exports prepared evidence with actual sample coordinates, numeric units, observation periods, provenance and missing values. Matching saved/draft records are identified as saved; distinct working drafts are labeled. Planner and Economics explain manual input readiness and assumption provenance.
- Validation: all 46 original regression checks passed in the complete browser run. Expanded cases passed in subsequent focused runs: seven evidence/saved-plan checks and nine backup checks, including quota rollback, migration aliases, download parsing and 390px access. Combined coverage is 58 checks. Production build and TypeScript pass. No backend or model implementation was changed in this delivery.


## Review and regression fixes

Integration review corrected a conditional React hook in comparison, selection
recovery after deletion, saved-versus-draft labeling, storage-denied handling,
intended-crop preservation on import and legacy alias export. Backup checks cover
both normal downloads and failure partway through a multi-key storage write.
Combined coverage is 58 checks across the full and focused runs; no single final
58-test invocation is claimed. Checks were not rerun for the documentation update.

## Remaining boundaries

- One confirmed plan remains stored per field/crop. Comparison selects two existing
  records; same-field alternative scenarios and version history are not implemented.
- Import keeps local records on key conflicts and restores backed-up settings/units.
  It is not cross-device synchronization or a cloud recovery service.
- Ask Meridian exports a prepared request; it does not generate a decision summary
  from a validated result. Model outputs and explanation integration remain future work.
- No backend/model changes, commit, push or deployment were performed in the client pass.
