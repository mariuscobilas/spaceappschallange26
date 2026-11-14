PRODUCT REQUIREMENTS DOCUMENT: MERIDIAN
NASA Earth Observation Farm Planning Workspace

Version: 2.0 — revised scope and delivery baseline
Updated: 14 November 2026
Status: Working product specification; frontend baseline implemented, real data and analysis integration pending
Project context: NASA Space Apps Challenge 2026 — Field Shift
Working product name: Meridian
Original project name: Meridian

Team: Marius — Frontend & Map UX; Ion — Backend, Data & ML; Alexa — PM & Demo; Liza — Presentation & Visuals; Sergiu — Data Ops & Location Research; Andrei — Dataset Preparation & QA.
Team responsibilities are retained from the original PRD and should be reconfirmed before assigning the remaining milestones.

1. PRODUCT OVERVIEW

Meridian helps farmers and conservation planners explore agricultural geography and NASA observations, record cover-crop management plans, and understand the financial consequences of their own assumptions. The product brings these activities into four connected workspaces: Explore, Field Planner, Economics, and Ask Meridian.

The longer-term goal is to support a single cover-crop-to-cash-crop decision cycle using source-backed environmental context and validated analysis. The current application provides observation imagery and manual planning tools. It does not yet provide numeric satellite feature extraction, calibrated yield forecasts, live commodity prices, optimized termination dates, or agronomic recommendations.

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
- Ask Meridian (/intel): an editable question prepared with selected map and saved-plan context.

On phones, navigation uses a drawer. Explore has one map toolbar; the navigation sidebar must not become a second map-control panel. Location details open on demand in an accessible Sheet. There is no Compare navigation destination.

The visual direction is one restrained, cohesive interface using shadcn/ui Base UI components, Tailwind CSS v4, clear typography, semantic colors, and responsive layouts. Roads and place names remain legible beneath translucent geographic cells.

4. DELIVERY STATUS

Implemented local baseline

- Four workspaces and shared selection context.
- MapLibre map with an OpenFreeMap Positron basemap and local geographic fallback.
- Selectable H3 cells with progressive resolutions 2, 3, 4, and 5.
- Field/Atlas exploration modes preserving context.
- Six Kansas locality shortcuts.
- Optional NASA SMAP, VIIRS NDVI, and GPM IMERG visual layers.
- Latest/past observation selection with actual advertised acquisition dates.
- Layer units, legends, opacity controls, and retry behavior.
- Saved manual field plans, including termination lead time and entered area.
- Manual economics with explicit inputs, validation, and local persistence.
- Ask Meridian question preparation and copy action, with analysis visibly disconnected.
- No-login access and browser-local storage.

Pending integration or validation

- Real numeric environmental, soil, and crop context for selected locations.
- Verified farm or parcel data and any required drawing workflow.
- Backend-connected Ask Meridian analysis.
- Defined, trained, and validated agronomic prediction service.
- Quantitative National Atlas aggregates and meaningful assessment colors.
- Live market prices or verified conservation payment lookup.
- Deployed end-to-end workflow and custom domain.

The backend contains a mock analysis endpoint. Its fixed example values, confidence scores, model labels, and recommendations are development fixtures, not evidence of an operational model or live NASA retrieval. The frontend must not present them as real analysis.

5. USER STORIES AND FLOWS

US-01 — Explore observations
As a grower, I can select a locality or H3 cell, choose my cash crop and observation period, and inspect available NASA imagery with its actual date and legend.

US-02 — Record a management plan
As a grower, I can save cover-crop type, termination lead time, optional planting date, area, and notes for my selected location and crop without creating an account.

US-03 — Test financial assumptions
As a grower, I can enter price, baseline yield, assumed yield change, costs, payment, and area to see net change and break-even yield change with transparent units.

US-04 — Prepare an analysis request
As a user, I can write a question and copy it together with selected map context and a saved plan. Until analysis is connected, the app explicitly identifies that limitation.

US-05 — Move between scales
As a planner, I can switch Field/Atlas modes and inspect regional geography without losing crop, location, or date context. Quantitative risk interpretation becomes available only when backed by agreed data and validated methods.

Flow A — Explore to plan

1. Open Explore without login; the default wheat/Kansas reference context is available immediately.
2. Select a locality or geographic cell and choose a cash crop.
3. Optionally enable a NASA layer and choose Latest or Past conditions.
4. Inspect actual observation date, legend, units, and location details.
5. Open Field Planner, enter management assumptions, and save them for that location/crop.
6. Return to Explore with selection and map view retained.

Flow B — Plan to economics

1. Open Economics in the selected location/crop context.
2. Enter the required financial assumptions; blank inputs remain missing.
3. Review the net change per hectare, total impact for entered area, and break-even yield change.
4. Change assumptions and compare the resulting arithmetic.
5. Treat these outputs as assumption-based calculations, not predicted returns.

Flow C — Prepare a question

1. Open Ask Meridian.
2. Review attached map context and any saved plan.
3. Write or edit a question, optionally starting from a suggested question.
4. Copy the prepared request.
5. Display a clear “analysis not connected” state until the real service is integrated.

6. FUNCTIONAL REQUIREMENTS

FR-01 — Workspace navigation and persistence
Provide the four routes above. Preserve shared context across navigation and reloads. Keep the map mounted across workspace changes so users retain their view. Plans and economics drafts must be stored by selected location and cash crop.

FR-02 — Map and selection
Render roads, place labels, rivers, and boundaries beneath selectable geographic cells. Field and Atlas are exploration modes; neither currently implies a working prediction engine. Retain an interactive geographic fallback when the external basemap is unavailable.

FR-03 — Progressive H3 geography
Use resolution 2 below zoom 4, resolution 3 from zoom 4 to below 6, resolution 4 from zoom 6 to below 9, and viewport-scoped resolution 5 from zoom 9 upward. Cells represent regional geography, not cadastral boundaries. Neutral cell styling must not be described as risk, profit, or crop suitability.

FR-04 — NASA visual layers
Offer opt-in SMAP L4 surface soil moisture, VIIRS NOAA-20 8-day NDVI, and GPM IMERG precipitation imagery through NASA GIBS. Default imagery is off. Expose opacity, native legends, appropriate units, loading state, failure state, and retry. IMERG depicts precipitation rate, not a derived cumulative rainfall total.

FR-05 — Observation dates
Latest means the latest observation advertised by the selected layer. Past means the last advertised observation on or before the requested date. Respect gaps in availability and display the actual resolved date. Do not imply that different layers share an acquisition date or that observations are instantaneous live measurements.

FR-06 — Field Planner
Support Cereal rye, Winter pea, Forage radish, and Multi-species mix. Support termination lead time from 0 to 60 days in 5-day increments, optional planting date, entered area, and notes. Use a positive area up to 5,000 hectares when provided. A calculated termination date is planting date minus entered lead time; it is calendar arithmetic, not an optimized recommendation.

FR-07 — Manual Economics
Use USD/tonne for commodity price, tonnes/hectare for baseline yield, percent for assumed yield change, USD/hectare for costs and support payment, and hectares for area. Require explicit inputs for calculations. A blank field must not silently become zero. Validate finite values, nonnegative price/yield/cost/payment/area inputs, and yield change no lower than -100%; guard against numeric overflow.

Financial definitions:
Baseline revenue per hectare = baseline yield × commodity price.
Assumed revenue per hectare = baseline revenue × (1 + assumed yield change / 100).
Cover-crop cost per hectare = seed cost + termination cost.
Net change per hectare = baseline revenue × assumed yield change / 100 - seed cost - termination cost + support payment.
Total net change = net change per hectare × entered area.
Break-even yield change (%) = 100 × (seed cost + termination cost - support payment) / baseline revenue.

When baseline revenue is zero, break-even yield change is undefined and must not display as an invented percentage. The net-change calculation can still be valid. Positive net change describes the entered scenario; it does not establish an agronomic recommendation. Entered support payments do not verify program eligibility.

FR-08 — Ask Meridian
Attach selected location, crop, requested observation period, and saved management context to an editable question. Allow copying the prepared request. Do not generate placeholder answers. A future integration must support attributable responses, loading, errors, and unavailable-data states through agreed shared contracts.

FR-09 — Real environmental context, next milestone
Connect location selection to source-backed numeric observations and soil/crop information. Each returned measure must identify units, observation period, source, spatial meaning, and availability. GIBS imagery is a visual layer, not numeric model input. Do not infer field-average values from a single image pixel or centroid without explaining the aggregation method.

FR-10 — Validated decision analysis, future milestone
Agree the decision target, calibration data, supported crops, applicable geography, uncertainty, and input/output contracts with the backend/ML team before implementing prediction cards. Evaluate one cover-crop-to-cash-crop cycle. Any yield effect, water balance, sensitivity curve, or termination recommendation must come from the agreed validated service. Model family and architecture remain open; XGBoost is not a committed implementation.

FR-11 — Quantitative Atlas, future milestone
Add regional aggregates only after their source, coverage, aggregation, and meaning are agreed. Provide meaningful legends, dates, uncertainty where applicable, and missing-data states. Retain region-to-field context transfer. Do not assign profit or risk colors to unsourced values.

FR-12 — Contracts and service integration
Define or revise TypeScript types, Pydantic schemas, and sample fixtures in shared/ before changing endpoint payloads. Existing mock endpoints must remain clearly identified as development-only behavior. Final environmental, analysis, and atlas routes are subject to contract agreement; the original PRD's /simulate and /atlas routes are not implemented APIs.

7. DATA AND PROVENANCE

Current visual/geographic sources

- Natural Earth: geographic reference data; public domain.
- H3: hierarchical geographic indexing; not an observation source.
- OpenFreeMap: external basemap.
- NASA GIBS: SMAP, VIIRS NDVI, and IMERG visualization imagery and legends.

Candidate future numeric/context sources

- NASA SMAP, GPM, POWER, and potentially ECOSTRESS, subject to suitability and access validation.
- USDA CDL for crop classification and SSURGO for soil information, subject to coverage and spatial validation.
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

Backend: FastAPI and Python 3.11+. The repository currently exposes health, generic mock, and mock field-analysis endpoints. Real data retrieval and ML integration remain pending. Health or mock responses do not prove upstream data availability or model readiness.

Shared contracts: shared/src/types/, shared/python/schemas.py, and shared/payloads/.

Persistence: browser localStorage for the current frontend baseline. Supabase/PostGIS, database-backed spatial caching, deck.gl, Terra Draw, and charting infrastructure from the original PRD are not required components of this baseline; introduce them only when an agreed milestone needs them.

Development: pnpm only; frontend at localhost:3000 and API at localhost:8000. Large model binaries above 10 MB must not be committed; any future model must have a reproducible acquisition or training process.

Deployment: Azure with a GoDaddy-managed domain, after functional integration and acceptance. Service selection, provisioning, domain setup, HTTPS, and deployed smoke checks remain pending.

10. NON-GOALS AND DEFERRED SCOPE

- No fabricated drought replay, synthetic risk score, or predetermined east/west profitability story.
- No mandatory login or cloud account flow.
- No Compare workspace or parallel visual design variants.
- No automated recommendations from the current manual calculator.
- No assumed live commodity prices, verified EQIP payments, or automatic crop detection.
- No claimed surveyed parcel selection or computed polygon area in the current baseline.
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

Gate 4 — Real location/environment context
Selecting a location returns attributable data or an explicit unavailable state. Source dates, spatial meaning, and units are reviewable. Status: next milestone.

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

1. Preserve the completed frontend baseline and its regression coverage.
2. Agree shared contracts for real location/environment context and integrate sources.
3. Connect grounded Ask Meridian analysis and define the prediction scope with the ML team.
4. Add validated decision outputs and quantitative Atlas data where supported.
5. Complete the demonstration, attributions, submission assets, and final deployment.

Proposed responsibility continuity

- Marius: workspace/map UX, frontend integration, responsive and accessibility checks.
- Ion: backend contracts, numeric data access, analysis/model integration and validation.
- Sergiu: source inventory, locality/parcel verification, provenance and economic source research.
- Andrei: usable study records, fixture/data QA, benchmark and edge-case validation.
- Alexa: scope, acceptance coordination, demonstration and submission requirements.
- Liza: visual consistency, pitch and demo assets after the workflow is stable.

Open decisions and risks

- What exact decision will the first model support, and for which crops and regions? Resolve before promising nationwide forecasts.
- Which numeric data sources can reliably support the selected spatial and temporal scale? Validate coverage, latency, and availability before integration.
- Are usable Kansas trial records available, and what can they actually validate? Confirm original evidence before adopting any calibration threshold.
- Does the demonstration require real parcel boundaries or drawing? Keep locality/H3 context labeled until verified parcel support exists.
- What analysis service and response contract will power Ask Meridian? Agree grounding, sources, and error behavior before connecting it.
- When should user-entered economics adopt fetched values? Preserve their source, date, units, and editability; avoid silently overwriting assumptions.
- What are the official event deadlines, asset limits, and disclosure rules? Alexa must verify the applicable official requirements; the original seven-slide/30-second and Sunday deadline statements are not confirmed here.
- Which Azure services and domain will be used? Decide against the integrated runtime requirements at the deployment gate.

13. REVISION SUMMARY

This version changes the working name to Meridian, replaces the single simulator/drawer concept with four workspaces, and records the current progressive H3 map and NASA imagery behavior. It documents manual planning and USD/tonne economics, explicitly separates the mock backend from real analysis, removes the severe-drought demo and fabricated outputs, and makes real data, validated modeling, quantitative Atlas information, and final deployment separate delivery gates.

Revision basis: the supplied FieldShift PRD, current README, docs/HANDOFF.md, docs/MILESTONES.md, and the inspected frontend/backend implementation as of 14 November 2026. External scientific figures and event rules were not independently verified for this revision and are treated as open items rather than established requirements.
