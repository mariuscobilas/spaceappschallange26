PRODUCT REQUIREMENTS DOCUMENT: MERIDIAN
NASA Earth Observation Farm Planning Workspace

Version: 2.3 — client completion and future delivery gates
Updated: 14 November 2026
Status: Local client baseline and first numeric context implemented; validated analysis, quantitative Atlas and deployment pending
Project context: NASA Space Apps Challenge 2026 — Field Shift
Working product name: Meridian
Original project name: FieldShift

Team: Marius — Frontend & Map UX; Ion — Backend, Data & ML; Alexa — PM & Demo; Liza — Presentation & Visuals; Sergiu — Data Ops & Location Research; Andrei — Dataset Preparation & QA.
Team responsibilities are retained from the original PRD and should be reconfirmed before assigning the remaining milestones.

1. PRODUCT OVERVIEW

Meridian helps farmers and conservation planners explore agricultural geography and NASA observations, record cover-crop management plans, and understand the financial consequences of their own assumptions. The product brings these activities into four connected workspaces: Explore, Field Planner, Economics, and Ask Meridian.

The primary job is an existing-cover-crop decision: “When should I terminate it before planting my next cash crop?” The longer-term goal is to support a single cover-crop-to-cash-crop decision cycle using source-backed environmental context and validated analysis. The current application provides observation imagery and manual planning tools. It now includes numeric NASA POWER meteorology and mapped USDA soil capacity context. It does not yet provide field-average satellite feature extraction, calibrated yield forecasts, live commodity prices, optimized termination dates or agronomic recommendations.

This revision supersedes the original “Final v1.0” specification. It aligns requirements with the latest product decisions and distinguishes implemented tools from future capabilities. Completion statements describe the local repository baseline, not a deployed production service.

Problem

Cover crops can improve soil protection and other agronomic outcomes, while also consuming water needed by the following cash crop. The balance depends on location, weather, soil, crop, management, and economics. Growers need a clear way to inspect available observations, record their intended management, and examine explicit financial assumptions before relying on a recommendation.

The product must keep observations, user assumptions, calculated results, and future model outputs distinguishable. A regional satellite image or H3 cell must not imply verified parcel-level conditions or a measured yield response.

Objectives

- Deliver a usable, no-login workspace on desktop and phone.
- Preserve selected location, cash crop, map mode, and observation period across workspaces.
- Make NASA imagery understandable through actual observation dates, units, legends, and availability states.
- Support saved cover-crop plans and transparent manual economic calculations today.
- Integrate real environmental context before adding quantitative regional assessments.
- Connect analysis only after shared contracts, data provenance, and validation criteria are agreed.
- Deploy the verified application on Azure with a GoDaddy-managed domain as the final delivery stage.

2. USERS AND GEOGRAPHIC SCOPE

Primary users

- Dryland growers in the Great Plains: inspect moisture-related observations and record cover-crop timing and costs.
- Growers in transitional or humid regions: compare management assumptions in their location and crop context.
- Conservation planners and extension agents: explore regional observations and discuss management assumptions with growers.
- Demonstrators and judges: follow a repeatable workflow with clear sources and honest integration status.

Scope

The initial exploration and demonstration scope is the contiguous United States, with Kansas locality shortcuts: Tribune, Colby, Hays, Salina, Manhattan, and Ottawa. These are navigation references, not six verified farms or surveyed parcels.

The current cash-crop selector offers Wheat, Corn, Soybeans, Cotton, and Sorghum. Wheat is a single frontend category. Distinct winter/spring wheat support requires an agreed future contract and suitable data.

3. EXPERIENCE AND INFORMATION ARCHITECTURE

The application has a full-height navigation sidebar with four destinations:

- Explore (/): map, location selection, Field/Atlas mode, cash crop, NASA layers, and observation period.
- Field Planner (/planner): management assumptions saved for the selected location and crop.
- Economics (/economics): financial calculations using explicitly entered assumptions.
- Ask Meridian (/intel): an editable question prepared with selected map, plan and numeric environmental evidence.
- Saved plans (/planner/saved): a Field Planner subpage for confirmed plans, comparison and summary export.

On phones, navigation uses a drawer. Explore has one map toolbar; the navigation sidebar must not become a second map-control panel. One field/location selector and the intended cash crop stay visible and switchable across all four workspaces. Location details open on demand in an accessible Sheet. There is no Compare navigation destination.

The visual direction is one restrained, cohesive interface using shadcn/ui Base UI components, Tailwind CSS v4, clear typography, semantic colors, and responsive layouts. Roads and place names remain legible beneath translucent geographic cells.

4. DELIVERY STATUS

Implemented local baseline

- Four workspaces and shared selection context.
- MapLibre map with an OpenFreeMap Positron basemap and local geographic fallback.
- Regional H3 selection with progressive resolutions 2, 3, 4, and 5; exact point selection in Field mode.
- Named saved fields, Terra Draw boundary creation/editing, geodesic hectares/centroid and a 5,000 ha cap.
- Real USDA CDL point lookup with source year, explicit crop acceptance and manual fallback.
- Source-backed field conditions in details and Planner: complete 30-day NASA POWER precipitation, root-zone relative wetness and USDA mapped water-storage capacity, with actual periods and partial/unavailable states.
- Field/Atlas exploration modes preserving context.
- Six Kansas locality shortcuts.
- Optional NASA SMAP, VIIRS NDVI, and GPM IMERG visual layers.
- Latest/past observation selection with actual advertised acquisition dates.
- Layer units, legends, opacity controls, and retry behavior.
- Saved manual field plans, a visible termination calendar, and working drafts retained per field/crop across navigation and reload.
- Shared U.S./metric display preference with canonical metric storage.
- Manual economics with explicit inputs, validation, and local persistence.
- Saved-plan listing, reopen/restore/delete, two-plan manual calendar comparison and text summary export.
- Versioned JSON workspace backup and explicit merge import, validation, conflict preservation and storage-failure rollback.
- Ask Meridian evidence preparation, copy and text export with actual samples, numeric conditions, units, dates, sources and missing states; analysis visibly disconnected.
- Planner input readiness and Economics assumption provenance copy.
- No-login access and browser-local storage.

Pending integration or validation

- Additional numeric context needed by the agreed model, including suitable evapotranspiration/temperature inputs and validated field aggregation; whole-field crop classification where supported.
- Verified surveyed parcel datasets; user drawing is implemented and is not a survey.
- Backend-connected Ask Meridian analysis.
- Defined, trained, and validated agronomic prediction service.
- Quantitative National Atlas aggregates and meaningful assessment colors.
- Live market prices or verified conservation payment lookup.
- Deployed end-to-end workflow and custom domain.

The backend contains a mock analysis endpoint. Its fixed example values, confidence scores, model labels, and recommendations are development fixtures, not evidence of an operational model or live NASA retrieval. The frontend must not present them as real analysis.

5. USER STORIES AND FLOWS

US-01 — Explore observations
As a grower, I can select an exact point or draw a field in Field mode, inspect a regional H3 cell in Atlas, choose my intended next cash crop and observation period, and inspect available NASA imagery with its actual date and legend.

US-02 — Record a management plan
As a grower, I can save cover-crop type, termination lead time, optional planting date, area, and notes for my selected location and crop without creating an account.

US-03 — Test financial assumptions
As a grower, I can enter price, baseline yield, assumed yield change, costs, payment, and area to see net change and break-even yield change with transparent units.

US-04 — Prepare an analysis request
As a user, I can inspect, copy or export a question with selected map context, the saved plan or distinct working draft, and numeric environmental evidence with sample coordinates, sources, periods, units and missing states. Until analysis is connected, the app explicitly identifies that limitation.

US-05 — Move between scales
As a planner, I can switch Field/Atlas modes and inspect regional geography without losing crop, location, or date context. Quantitative risk interpretation becomes available only when backed by agreed data and validated methods.

US-06 — Recover local work
As a user, I can export a versioned JSON backup and review a validated import before explicitly merging it, keeping existing records on conflicts.

US-07 — Compare confirmed plans
As a user, I can select two confirmed records, compare manual calendar details and download a summary, with different field/crop contexts disclosed. This does not imply multiple saved scenarios for one field/crop.

Flow A — Explore to plan

1. Open Explore without login; the default wheat/Kansas reference context is available immediately.
2. Select a saved field, choose a reference locality, or draw/select a field, then confirm the intended next cash crop.
3. Optionally enable a NASA layer and choose Latest or Past conditions.
4. Inspect actual observation date, legend, units, and location details.
5. Open Field Planner, enter the cash crop planting date and existing cover crop, choose a termination lead time, review the calendar date, and confirm the plan. Working drafts are retained before confirmation.
6. Return to Explore with selection and map view retained.

Flow B — Plan to economics

1. Open Economics in the selected location/crop context.
2. Enter the required financial assumptions; blank inputs remain missing.
3. Review net change per hectare/acre and break-even yield change; add a valid managed area for parcel total impact.
4. Change assumptions and compare the resulting arithmetic.
5. Treat these outputs as assumption-based calculations, not predicted returns.

Flow C — Prepare a question

1. Open Ask Meridian.
2. Review attached map context, saved plan or working draft, and numeric source evidence.
3. Write or edit a question, optionally starting from a suggested question.
4. Copy or download the prepared request as text.
5. Display a clear “analysis not connected” state until the real service is integrated.

6. FUNCTIONAL REQUIREMENTS

FR-01 — Workspace navigation and persistence
Provide the four routes above. Preserve shared context across navigation and reloads. Keep the map mounted across workspace changes so users retain their view. Plans, working management drafts and economics must be stored by stable saved-field ID and cash crop, or by reference location/crop before a field is saved.

FR-02 — Map and selection
Render roads, place labels, rivers, and boundaries beneath selectable geographic cells. Field mode selects exact points and user-drawn boundaries. Atlas selects regional hexagons and offers a centroid drilldown to Field mode; a hexagon is never substituted for a parcel. Neither mode currently implies a working prediction engine. Retain an interactive geographic fallback when the external basemap is unavailable.

FR-03 — Progressive H3 geography
Use resolution 2 below zoom 4, resolution 3 from zoom 4 to below 6, resolution 4 from zoom 6 to below 9, and viewport-scoped resolution 5 from zoom 9 upward. Cells represent regional geography, not cadastral boundaries. Neutral cell styling must not be described as risk, profit, or crop suitability.

FR-04 — NASA visual layers
Offer opt-in SMAP L4 surface soil moisture, VIIRS NOAA-20 8-day NDVI, and GPM IMERG precipitation imagery through NASA GIBS. Default imagery is off. Expose opacity, native legends, appropriate units, loading state, failure state, and retry. IMERG depicts precipitation rate, not a derived cumulative rainfall total.

FR-05 — Observation dates
Latest means the latest observation advertised by the selected layer. Past means the last advertised observation on or before the requested date. Respect gaps in availability and display the actual resolved date. Do not imply that different layers share an acquisition date or that observations are instantaneous live measurements.

FR-06 — Field Planner
Support Cereal rye, Winter pea, Forage radish, and Multi-species mix. Support termination lead time from 0 to 60 days in 5-day increments, optional planting date, area and notes. Lead with the next cash crop planting date and show the calculated termination date beside the inputs. Persist unfinished working drafts independently from confirmed plans. Use a positive area up to 5,000 hectares when provided. A calculated termination date is planting date minus entered lead time; it is calendar arithmetic, not an optimized recommendation.

FR-07 — Manual Economics
Store USD/tonne for commodity price, tonnes/hectare for baseline yield, percent for assumed yield change, USD/hectare for costs/support and hectares for area. Offer U.S. display/input units: crop-specific USD/bushel and bushels/acre for supported grains, cotton lint USD/lb and lb/acre, USD/acre and acres. Unit switches must not modify canonical values or calculation results. Require explicit financial assumptions for per-area calculations; valid area is additionally required for parcel totals. A blank field must not silently become zero. Validate finite values, nonnegative price/yield/cost/payment/area inputs, and yield change no lower than -100%; guard against numeric overflow.

Financial definitions:
Baseline revenue per hectare = baseline yield × commodity price.
Assumed revenue per hectare = baseline revenue × (1 + assumed yield change / 100).
Cover-crop cost per hectare = seed cost + termination cost.
Net change per hectare = baseline revenue × assumed yield change / 100 - seed cost - termination cost + support payment.
Total net change = net change per hectare × entered area.
Break-even yield change (%) = 100 × (seed cost + termination cost - support payment) / baseline revenue.

When baseline revenue is zero, break-even yield change is undefined and must not display as an invented percentage. The net-change calculation can still be valid. Positive net change describes the entered scenario; it does not establish an agronomic recommendation. Entered support payments do not verify program eligibility.

FR-08 — Ask Meridian
Attach selected location, crop, requested observation period, and saved management context or distinct working draft to an editable question. Include numeric environmental measures, actual sample coordinates, source periods, retrieval time, units, provenance and explicit unavailable values. Explain that mapped soil capacity has no weather observation period. Allow inspecting, copying and downloading the prepared request as text. Do not generate placeholder answers. A future integration must support attributable responses, loading, errors, and unavailable-data states through agreed shared contracts.

FR-09 — Real environmental context, first slice implemented
Connect location selection to source-backed numeric observations and soil/crop information. Each returned measure must identify units, observation period, source, spatial meaning, and availability. The implemented field-conditions endpoint independently retrieves NASA POWER corrected precipitation and relative root-zone wetness, plus USDA SDA mapped water-storage capacity. Require complete 30-day rain windows; preserve actual source periods and missing values. Soil mapping remains current-survey context even for historical weather. Do not equate relative saturation with volumetric moisture or multiply it by mapped capacity to infer current plant-available water. GIBS imagery is a visual layer, not numeric model input. Do not infer field-average values from a single image pixel or centroid without explaining the aggregation method.

FR-10 — Validated decision analysis, future milestone
Agree the decision target, calibration data, supported crops, applicable geography, uncertainty, and input/output contracts with the backend/ML team before implementing prediction cards. Evaluate one cover-crop-to-cash-crop cycle. Any yield effect, water balance, sensitivity curve, or termination recommendation must come from the agreed validated service. Model family and architecture remain open; XGBoost is not a committed implementation.

FR-11 — Quantitative Atlas, future milestone
Add regional aggregates only after their source, coverage, aggregation, and meaning are agreed. Provide meaningful legends, dates, uncertainty where applicable, and missing-data states. Retain region-to-field context transfer. Do not assign profit or risk colors to unsourced values.

FR-12 — Contracts and service integration
Define or revise TypeScript types, Pydantic schemas, and sample fixtures in shared/ before changing endpoint payloads. Existing mock endpoints must remain clearly identified as development-only behavior. Final environmental, analysis, and atlas routes are subject to contract agreement; the original PRD's /simulate and /atlas routes are not implemented APIs.

FR-13 — Workspace backup and import
Export versioned JSON containing fields, confirmed plans, working drafts, economics, map settings and display units. Export current session data even if persistent storage is unavailable. Canonicalize migrated plan aliases. Validate version, file size (5 MB maximum), record limits, supported values and field references before previewing an import. Require explicit merge; existing local records win key collisions while map settings/units come from the backup. Block imports during unsaved field edits. Apply state without requiring reload; on storage failure, attempt rollback and keep the current workspace open. Downloaded backups are user-managed files, not cloud synchronization.

FR-14 — Saved plans and manual comparison
Provide /planner/saved under Field Planner. Reopen restores field/crop; restoring a saved version over a distinct working draft requires an explicit choice. Deletion preserves the field and economics. Compare two confirmed records by field/crop, cover crop, planting and calculated termination dates, lead time, area and notes; disclose different contexts. Export a text summary with saved time and coordinates. Keep one confirmed record per field/crop. Version history, simultaneous same-field alternatives, prediction sensitivity and comparison of validated results remain future scope.

7. DATA AND PROVENANCE

Current visual/geographic sources

- Natural Earth: geographic reference data; public domain.
- H3: hierarchical geographic indexing; not an observation source.
- OpenFreeMap: external basemap.
- NASA GIBS: SMAP, VIIRS NDVI, and IMERG visualization imagery and legends.

Candidate future numeric/context sources

- NASA POWER daily meteorology is implemented for PRECTOTCORR and GWETROOT with declared-unit validation. Additional SMAP, GPM and potentially ECOSTRESS numeric integrations remain subject to suitability/access validation.
- USDA CDL point sampling and SDA SSURGO map-unit available water storage (0–100 cm) are implemented. Whole-field crop classification and additional soil attributes remain pending.
- USDA AMS and NASS for appropriately dated economic context, if integrated.
- Verified conservation-program sources for payment context, if integrated.
- Meteomatics as an optional backend weather source; it is not required for the current map or demo baseline.

Every future integration must document access method, units, temporal/spatial resolution, coverage, missingness, attribution, and licensing or usage conditions. Credentials remain server-side.

The original PRD's Kansas trial figures (48% yield loss and -$176/ha) are unverified research references in this project. They must not be presented as current calibration evidence or universal outcomes. Obtain the original study, treatment definitions, crop, time period, units, and usable records before setting numerical validation targets. Multi-crop nationwide validity cannot be inferred from a single regional trial.

8. OPERATIONAL, ACCESSIBILITY, AND RESILIENCE REQUIREMENTS

- No mandatory authentication or external weather credentials for baseline use.
- Loading or failed imagery must leave navigation, map interaction, and manual tools usable.
- Distinguish unavailable data from zero and from a valid observation.
- Do not replace missing real results with synthetic risk scores, prices, or recommendations. Bundled fixtures may support development and explicitly labeled demonstrations; they must not appear as current field observations.
- Support keyboard navigation, visible focus, labeled controls, accessible dialogs/sheets, and phone portrait/landscape use.
- Keep layer/date/selection controls reachable without toolbar overflow.
- Preserve local plans and assumptions across reloads; identify that browser storage is local, not a cloud backup.
- Keep database strings and API keys out of frontend code and committed files.
- Use CORS for localhost:3000 during development and the chosen frontend origin when deployed.
- Cache future numeric data only with source, acquisition time, freshness, and invalidation rules. No database platform or cache latency is committed yet.

9. TECHNICAL BASELINE

Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui with Base UI, MapLibre GL JS, and h3-js. Production builds currently use Webpack; development uses Turbopack. MapLibre worker/shared assets must be prepared for both development and production.

Backend: FastAPI and Python 3.11+. The repository exposes health, generic mock, mock field-analysis, and real USDA CDL /api/v1/land-cover endpoints. The real /api/v1/field-conditions endpoint adds numeric meteorology and mapped soil context. Simulation/ML integration remains pending. Health or mock responses do not prove upstream data availability or model readiness.

Shared contracts: shared/src/types/, shared/python/schemas.py, and shared/payloads/.

Persistence: browser localStorage for the current frontend baseline. Terra Draw is implemented. Supabase/PostGIS, database-backed spatial caching, deck.gl and charting infrastructure are not required components of this baseline; introduce them when an agreed milestone needs them.

Development: pnpm only; frontend at localhost:3000 and API at localhost:8000. Large model binaries above 10 MB must not be committed; any future model must have a reproducible acquisition or training process.

Deployment: Azure with a GoDaddy-managed domain, after functional integration and acceptance. Service selection, provisioning, domain setup, HTTPS, and deployed smoke checks remain pending.

10. NON-GOALS AND DEFERRED SCOPE

- No fabricated drought replay, synthetic risk score, or predetermined east/west profitability story.
- No mandatory login or cloud account flow.
- No Compare workspace or parallel visual design variants.
- No automated recommendations from the current manual calculator.
- No assumed live commodity prices, verified EQIP payments, or automatic overwrite of intended crop from an annual CDL sample.
- No claimed surveyed parcel selection; computed user-drawn boundary area is implemented.
- No multi-year rotation optimization, irrigation scheduling, or machinery prescription export.
- No custom raster tile server or runtime processing of large satellite granules.
- No non-CONUS decision-support coverage in the initial scope.
- No database, model architecture, or cloud infrastructure selected solely to satisfy the superseded PRD.

11. ACCEPTANCE AND DELIVERY GATES

Gate 1 — Workspace and map baseline
All four routes work on desktop, phone, and landscape. Crop, location, mode, observation period, and map view survive workspace changes. Keyboard and selection controls work without overflow. Status: implemented local baseline.

Gate 2 — NASA visual observations
All three layers expose actual dates, units, legends, opacity, retry, and meaningful availability states. Basemap/layer failures preserve useful interaction. Historical selection respects advertised observations. Status: implemented local baseline; imagery depends on upstream availability.

Gate 3 — Manual planning and economics
Plans and financial drafts persist by location/crop. Date arithmetic is correct. Financial outputs match hand calculations; blanks, invalid inputs, zero revenue, and overflow are handled. Status: implemented local baseline.

Gate 3a — Client recovery and evidence handoff
Validated JSON import/export, local conflict preservation, quota rollback, migration-alias export, two-plan comparison and text downloads work. Prepared requests disclose evidence and missing data. Status: implemented local baseline; 58 checks passed across full and focused runs in the latest client delivery.

Gate 4 — Real location/environment context
Selecting a location returns attributable data or an explicit unavailable state. Source dates, spatial meaning, and units are reviewable. Status: first numeric context slice implemented (NASA POWER and USDA SDA); model-specific feature completeness and field-aggregation validation remain pending.

Gate 5 — Analysis and prediction
Ask Meridian connects to a real agreed service. Any agronomic prediction has documented data, validation, supported scope, and uncertainty. Fixed mock outputs cannot satisfy this gate. Status: pending.

Gate 6 — Quantitative Atlas
Each assessment color and diagnostic is traceable to real aggregates or a validated model. Missing data are distinct from neutral or low-risk conditions. Status: pending.

Gate 7 — Demo and deployment
Repeat the agreed end-to-end workflow across the six Kansas locality references, latest/past observations, desktop/phone, and service failures. Finish attributions and submission materials. Deploy and verify the Azure-hosted app and backend over HTTPS at the chosen domain. Status: full workflow and deployment pending.

Validation commands for relevant implementation changes:
- pnpm --filter @spaceapps/web exec tsc --noEmit
- pnpm --filter @spaceapps/web build
- pnpm --filter @spaceapps/web exec playwright test
- node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs

These commands are verification steps, not a claim that they were rerun for this document revision. Quantified production latency and rendering targets will be set against an agreed device, network, payload, and measurement method. The original sub-150 ms, 2.5 s, and 60 fps promises are not verified acceptance results.

12. PRIORITIES, OWNERSHIP, AND OPEN QUESTIONS

Delivery order

1. Review and checkpoint the current local changes; preserve the 58-check client baseline and backup compatibility.
2. Prepare the evidence inventory and a proposed single crop/geography decision scope, with explicit comparison baseline and validation criteria. Model implementation remains deferred by the current user instruction.
3. When authorized, agree simulation TS/Pydantic contracts and fixtures before building the backend/model or analysis client; then validate one supported decision cycle.
4. Integrate validated Planner outputs, editable economic assumptions and grounded explanations; add quantitative Atlas only after its aggregate dataset/service is accepted.
5. Complete reproducible demo acceptance, attributions and submission materials, then deploy on Azure and verify HTTPS at the chosen GoDaddy-managed domain.

Detailed work packages, proposed owners, dependencies and acceptance criteria are in docs/PRODUCT-NEXT.md. They are a plan, not authorization to start model work or provision infrastructure.

Proposed responsibility continuity

- Marius: workspace/map UX, frontend integration, responsive and accessibility checks.
- Ion: backend contracts, numeric data access, analysis/model integration and validation.
- Sergiu: source inventory, locality/parcel verification, provenance and economic source research.
- Andrei: usable study records, fixture/data QA, benchmark and edge-case validation.
- Alexa: scope, acceptance coordination, demonstration and submission requirements.
- Liza: visual consistency, pitch and demo assets after the workflow is stable.

Open decisions and risks

- The first decision is termination of an existing cover crop before the next cash crop. Which crops/regions can be validated first? Resolve before promising nationwide forecasts.
- Which numeric data sources can reliably support the selected spatial and temporal scale? Validate coverage, latency, and availability before integration.
- Are usable Kansas trial records available, and what can they actually validate? Confirm original evidence before adopting any calibration threshold.
- User-drawn fields are available. Keep locality/H3 references and drawn boundaries distinguished from verified surveyed parcels.
- What analysis service and response contract will power Ask Meridian? Agree grounding, sources, and error behavior before connecting it.
- When should user-entered economics adopt fetched values? Preserve their source, date, units, and editability; avoid silently overwriting assumptions.
- What are the official event deadlines, asset limits, and disclosure rules? Alexa must verify the applicable official requirements; the original seven-slide/30-second and Sunday deadline statements are not confirmed here.
- Which Azure services and domain will be used? Decide against the integrated runtime requirements at the deployment gate.

13. REVISION SUMMARY

This version changes the working name to Meridian, replaces the single simulator/drawer concept with four workspaces, and records the current progressive H3 map and NASA imagery behavior. It documents manual planning and USD/tonne economics, explicitly separates the mock backend from real analysis, removes the severe-drought demo and fabricated outputs, and makes real data, validated modeling, quantitative Atlas information, and final deployment separate delivery gates.

Revision basis: the supplied FieldShift PRD, current README, docs/HANDOFF.md, docs/MILESTONES.md, and the inspected frontend/backend implementation as of 14 November 2026. External scientific figures and event rules were not independently verified for this revision and are treated as open items rather than established requirements.

Usability and integration follow-up: see docs/PRODUCT-NEXT.md for the agreed termination-first workflow, the SPA-85/86/88 dependency split and the next contract handoff.

Version 2.3 records completed workspace backup/import, saved-plan comparison and text export, evidence-rich Ask Meridian preparation, and manual input readiness. Latest client verification covers 58 checks across full and focused runs, TypeScript and production build. Earlier backend/fixture results are recorded separately; no checks were rerun solely for this documentation revision.
