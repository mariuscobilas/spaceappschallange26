# Meridian — future delivery plan

Updated 14 November 2026 after the client completion pass. This is a dependency-based plan; dates and team assignments have not been confirmed. No Linear issues were modified. AI model, training and inference work remain deferred under the current user instruction.

## Current position

The local client supports Explore, Field Planner, Economics and Ask Meridian; exact points and drawn fields; NASA imagery; source-backed point conditions; saved plans and drafts; manual economics; U.S./metric units; JSON backup/import; two-plan calendar comparison; and prepared evidence export.

The core agronomic question remains: **I already have a cover crop. When should I terminate it before my next cash crop?** Today users choose timing and receive a calculated calendar date. No validated service chooses a date, predicts yield/water effects, generates answers or colors Atlas cells by return/risk.

Latest client verification: 58 checks passed across the complete regression run and focused reruns, plus TypeScript and production build. Earlier environmental delivery recorded 20 backend tests and 13 shared fixtures passing. Those were not rerun in the client pass or this documentation update.

## Completed preparation

| Area | Delivered | Boundary |
| --- | --- | --- |
| Shared field context | Field/location and next cash crop across workspaces | CDL historical crop requires acceptance; it is not the intended next crop |
| Manual planning | Calendar, persistent drafts, confirmed plans, reopen/restore/delete | One confirmed record per field/crop; no scenario version history |
| Economics | Explicit inputs, per-area/parcel results, break-even and units | Assumed yield changes and prices; no forecasts or fetched market defaults |
| Environmental evidence | NASA POWER rain/wetness and USDA mapped soil capacity | Point/grid context; no field-average balance or water-remaining estimate |
| Saved-plan comparison | Two records, calendar details, context disclosure, text export | Manual records; no predicted outcome comparison |
| Recovery | Versioned JSON export, validated preview/merge, conflict preservation and rollback | User-managed files; no cloud sync |
| Ask Meridian | Inspect/copy/export evidence with samples, sources, units, dates and missing states | Real answers and analysis service remain disconnected |
| Atlas | Geographic cells, desktop overview, mobile Sheet and point drilldown | Centre-point conditions, not regional aggregates |

## Phase A — stabilize and prepare evidence (available now)

| Work package | Proposed lead | Deliverable and acceptance |
| --- | --- | --- |
| Review/checkpoint local work | Marius with Ion for existing API changes | Review the current diff against `d4cadaa`; agree coherent commits and preserve prior work. Run appropriate checks against the reviewed state. A checkpoint is separate from pushing/deploying. |
| Agree first decision scope | Alexa coordinating Ion, Sergiu and Andrei | Written proposal naming one cover crop, following cash crop, geography, management regime, baseline comparison and intended output. Each choice must be supportable by evidence. |
| Evidence inventory | Sergiu; Andrei for QA | Record source URLs/identifiers, study treatments, crop, region, dates, units, usable records, access/license conditions and gaps. Original PRD numerical trial claims remain unverified until checked against original evidence. |
| Validation proposal | Ion and Andrei | Define benchmark records, independent validation approach, relevant error measures, applicability limits and unavailable/unsupported outcomes. Do not invent success thresholds before inspecting records. |
| Manual demo outline | Alexa and Liza with Marius | A repeatable field → source context → manual plan → economics → comparison/backup/evidence workflow, clearly identifying analysis as disconnected. Confirm official submission requirements before committing asset formats or deadlines. |

Exit gate: a reviewed baseline and a written evidence/scope/validation proposal. This phase does not require training a model or connecting the fixed mock analysis endpoint.

## Phase B — agree the simulation contract (after authorization)

Proposed leads: Ion and Marius, with Alexa confirming product scope. Update shared TypeScript, Pydantic and fixtures together before changing endpoint payloads or adding the client.

Resolve:

1. **Request context:** exact sample or aggregation geometry, intended cash crop, cover crop, planting date, lead time, managed area where required, as-of date and management assumptions. The UI's single wheat category must be reconciled with any winter/spring wheat distinction required by evidence.
2. **Comparison baseline:** specify the management change being estimated. A result must say what it is compared with, not just report a percentage or net return.
3. **Response evidence:** units, observation periods, acquisition/retrieval times, spatial meaning, missing inputs, applicability, model/method version and uncertainty. Yield and water outputs appear only where validated.
4. **Economics ownership:** retain explicit user assumptions and overrides. Echo assumptions used by server calculations. Agree the incremental-return formula and show support payments separately when model results are added; eligibility is not inferred.
5. **Timing sensitivity:** the slider offers thirteen 0–60-day values in five-day steps; an older issue asks for seven curve points. Choose evaluated values and label any interpolation before implementation.
6. **Historical semantics:** define the actual climate period used by analysis. A historical NASA image date does not establish the simulation period. Latest/past remains the product direction; no forced severe-drought scenario.
7. **Failure behavior:** fixtures for supported results, partial data, unsupported crop/region, insufficient evidence and service failure. Missing results never become zero or a fabricated recommendation.

Exit gate: a reviewed contract and fixtures plus an agreed method/evidence plan. The old `/api/v1/field-shift/analyze` route returns fixed demo content and is not the termination service. Its development status must be explicit before any integration.

## Phase C — one validated decision cycle (model work requires authorization)

Proposed lead: Ion; evidence QA by Andrei and Sergiu.

- Implement only the accepted method and supported scope. Method/model family is open; do not select one solely because an older PRD names it.
- Reuse existing numeric context when suitable. Add temperature, evapotranspiration or other features only when required by the accepted method, with documented source suitability and missing-data behavior.
- Validate against independent reference records using the agreed criteria. Keep the first supported geography/crop narrow until evidence warrants expansion.
- Make runs reproducible: input/source periods, method version, benchmark procedure, output limitations and artifact acquisition. Keep large binaries out of Git.

Exit gate: reproducible benchmark evidence and a service that returns validated results or explicit unavailable/unsupported states. Frontend fixture tests do not establish scientific validity.

## Phase D — connect Planner, Economics and grounded explanations

Depends on Phase C and the accepted contracts. Proposed leads: Marius and Ion.

- Connect one field/plan through observations, analysis and saved result context. Preserve confirmed plans separately from drafts; protect against stale results after field/crop/date changes.
- Add supported timing/yield/water outputs with evidence, applicability and uncertainty. Preserve manual economics and editable assumptions.
- Add sensitivity only on the agreed evaluation grid. Same-field scenario versioning requires an explicit client storage design; current two-record calendar comparison does not implement it.
- Define and connect the real Ask Meridian analysis/explanation service. Explanations must cite the evidence/results they use and identify gaps. Do not substitute generic generated advice for missing quantitative results.
- Verify supported scenarios, unsupported scope, unavailable providers, historical periods, phone/desktop navigation and persisted state.

Exit gate: one attributable, reproducible end-to-end decision workflow. Show only results supported by the accepted service.

## Phase E — quantitative Atlas and expanded coverage

Depends on an accepted regional dataset/service, not just a working field model. Proposed leads: Ion for aggregates; Marius for map integration; Sergiu/Andrei for coverage QA.

Document crop, period, management/economic baseline, aggregation method, active acreage where relevant, geographic coverage and uncertainty. Distinguish missing observations, no active acreage and near-zero return. A hex-centre sample is not a regional mean. Accept the dataset and shared contracts before adding quantitative colors, diagnostics or legends.

Exit gate: every assessment color and numeric regional diagnostic traces to real aggregates or a validated method. Expand crops/regions only after separate applicability checks.

## Phase F — demonstration and final deployment

Proposed leads: Alexa for acceptance/submission, Liza for assets, Marius/Ion for runtime verification.

1. Repeat the agreed workflow at all six Kansas locality references, on phone/desktop, for latest/past dates and provider failures. Locality shortcuts are not six validated farms.
2. Finalize attributions, limitations, source disclosure and submission assets against verified official requirements.
3. Select Azure services for the actual frontend/backend runtime. Confirm the GoDaddy-managed domain, credentials, environment variables, HTTPS and deployed-origin CORS.
4. Run deployed smoke checks for deep links, map assets/workers, NASA imagery, API requests, historical dates and local backup/import.

Exit gate: the verified application and backend work over HTTPS at the chosen domain. Domain purchase, provisioning and publishing remain separate future actions.

## Issue alignment and deferred options

| Issue reference | Current position | Remaining dependency |
| --- | --- | --- |
| SPA-84 | Saved fields/drawing/CDL point lookup implemented | New scope only if agreed |
| SPA-86 | Manual Planner/Economics/client preparation implemented | SPA-85 validated outputs, sensitivity and recommendation integration |
| SPA-85 | Contract handoff planned; numeric context first slice implemented | Agreed evidence, contract, method and validation; SPA-80/81/82 details must be checked before claiming their completion |
| SPA-88 | Atlas geography, overview and drilldown implemented | SPA-87 regional dataset/service must be inspected and accepted |

These references summarize previously supplied issue descriptions; they do not verify live tracker status. Optional later features include verified market/payment context, whole-field classification, surveyed parcel data and same-field scenario history. Cloud accounts, irrigation advice and multi-year rotations are outside the current next delivery.

The immediate next deliverable is Phase A's reviewed baseline and evidence/scope proposal. Model implementation remains deferred until authorized.
