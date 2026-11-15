# Product requirements: Meridian

**Updated:** 15 November 2026
**Status:** Current local implementation and proposed next steps
**Project:** NASA Space Apps Challenge 2026 — Field Shift
**Product name:** Meridian

## 1. Product overview

Meridian is a browser-based workspace for exploring agricultural conditions, recording cover-crop plans, and testing the economics of a grower's own assumptions. It brings NASA Earth observation imagery, USDA data, published research, field management, and manual calculations into one workflow.

The immediate decision is how to manage an existing cover crop ahead of planting a cash crop, including the intended termination date and financial trade-offs. Today Meridian supports exploration and manual planning; it does **not** provide validated field-level forecasts, optimized termination dates, or agronomic recommendations. Its analysis research and API are not connected to the user-facing Ask Meridian workflow.

This document describes the local repository, including current uncommitted changes. It is not a statement that the product is deployed or scientifically validated.

## Team and roles

| Team member | Role |
| --- | --- |
| Marius | Fullstack + Lead   |
| Ion | Backend, data, and machine learning |
| Alexa | Product management and demo |
| Liza | Presentation and visuals |
| Sergiu | Data operations and location research, QA  |
| Andrei | Dataset preparation and QA |

## 2. Problem and goals

Cover crops can protect soil but may also use water needed by the following cash crop. The trade-off varies with location, weather, soils, crop, management, and costs. Relevant information is spread across maps, research, and local records, and regional data can easily be mistaken for a field measurement or prediction.

Meridian should help users:

- Explore geographic and environmental context with clear sources, dates, units, and limitations.
- Select or create a field and retain its context through planning and budgeting.
- Record a cover-crop calendar and understand the consequences of explicitly entered financial assumptions.
- Review historical regional research at its supported geographic scale.
- Keep their work locally and recover it using an exportable backup.
- Prepare a well-sourced question for future analysis without implying an answer exists today.

## 3. Users and scope

**Primary users:** growers, particularly dryland growers considering cover-crop water trade-offs; conservation planners and extension advisors working with them; and challenge demonstrators and judges.

**Geography:** exploration and supported point data focus on the contiguous United States. Dataset coverage varies. The default regional research layer covers portions of six Corn Belt states and does not represent Kansas wheat. The Clovis model research uses observations from New Mexico and must not be generalized to arbitrary fields.

**Crops:** the current cash-crop selector includes wheat, corn, soybeans, cotton, and sorghum. Coverage in source datasets varies by crop. Current planning options include cereal rye, winter pea, forage radish, and a multi-species mix.

## 4. Product experience

The intended journey is **Explore → choose or create a field → plan the calendar → review economics → save and revisit or compare plans**. Users can also inspect regional research or prepare a question at any point.

| Area | Route | Purpose |
| --- | --- | --- |
| Explore | `/` | Browse a map, observation layers, and geographic context; field management is kept in My fields. |
| My fields | `/fields` | Select a point or draw, edit, save, and delete named fields. Accessed through Field Planner navigation. |
| Historical research | `/?view=research` | Optional county research in Explore; `/atlas` remains a compatibility redirect. |
| Field Planner | `/planner` | Field library leading to Calendar, optional Budget and Review; retain working drafts and confirmed snapshots separately. |
| Economics | `/economics` | Calculate financial outcomes from user-entered assumptions; accessed through Field Planner navigation. |
| Saved plans | `/planner/saved` | Reopen, delete, compare, and export confirmed calendar/budget snapshots and alternatives. |
| Ask Meridian | `/intel` | Prepare, copy, or export a question with field, plan, and source evidence; analysis is not connected. |

The interface supports desktop and mobile, with shared field and crop context, responsive navigation, and an interactive map whose context is retained between map workspaces. Users need no account. Data is stored in the browser, not synchronized to the cloud.

## 5. Current functional requirements

### 5.1 Explore and map context

- Provide a browsable map with legible roads and place names, map provider options, attribution, and a usable fallback when an external provider fails. The available basemaps include OpenFreeMap light, streets and dark, and USGS topographic and aerial imagery; aerial vintage varies.
- Offer optional NASA GIBS SMAP surface soil moisture, VIIRS NDVI, and GPM IMERG precipitation imagery. Show relevant legends, units, opacity, loading and failure states, and actual available observation dates. IMERG represents precipitation rate, not cumulative rainfall.
- Support latest and historical observation selection, resolving a historical request to the last advertised observation on or before the selected date. Different layers can have different actual dates.
- Offer the dated U.S. Drought Monitor overlay with its category legend and provenance. Its date is independent of NASA imagery dates.
- Display H3 cells as regional geography, not verified parcels. Their resolution changes with zoom; neutral cells do not imply risk, profit, or suitability. Explore does not create, edit, save, or delete fields.

### 5.2 Fields and environmental context

- Let users select an exact point or draw a named polygon, finish or edit the geometry, and save or cancel. Calculate polygon area and centroid locally. Fields above 5,000 hectares remain editable and are directed to regional exploration.
- Protect unsaved field edits and make field deletion explicit, naming the field and disclosing affected saved records. Deleting an inactive field must preserve the active selection and unrelated edits. Distinguish browser persistence from session-only retention when storage fails.
- Request USDA Cropland Data Layer classification at a sample point, show the source year, and require explicit acceptance of any suggested crop. Keep manual selection available. A point classification is not a whole-field assessment.
- Show available NASA POWER 30-day precipitation and modeled root-zone relative wetness, plus USDA mapped 0–100 cm water-storage capacity. Display actual periods, sample coordinates, units, source links, spatial meaning, and missing states. Require a complete 30-day precipitation window.
- Treat relative wetness as modeled relative saturation and soil capacity as a mapped property, not current plant-available water. Weather is a regional grid estimate, soil is current survey context, and a polygon sample is not a field average. Provider failures must leave unaffected information usable.

### 5.3 Field Planner and saved plans

- Keep field and intended cash crop visible and switchable across the planning workflow. Require an explicit field-selection starting action where needed.
- Allow users to enter a cash-crop planting date, cover-crop type, termination lead time, area, and notes. The lead time is user-selected from 0 to 60 days in five-day increments. Show the resulting termination date as calendar arithmetic, not a recommendation.
- Retain unfinished working drafts independently from confirmed plans, across navigation and reload. Store plans by field and crop; currently there is one confirmed calendar plan per field/crop.
- Use calculated polygon area as authoritative; point-field area is manually entered. Support metric and U.S. display units while retaining canonical metric values.
- List, reopen, and delete confirmed plans. When a saved plan differs from a working draft, require an explicit restore choice. Deleting a plan preserves the field and economic inputs.
- Compare two confirmed plans by their manual calendar and field details and export a text summary. Disclose differences in field or crop context. This does not create scenario versions for one field/crop.

### 5.4 Economics

- Collect explicit commodity price, baseline yield, assumed yield change, cover-crop seed and termination costs, support payment, and managed area. Do not interpret blank values as zero or present entered assumptions as market data, forecasts, or verified eligibility.
- Show net change per unit area when financial inputs are complete; require valid area for a field total. Show break-even yield change only when baseline revenue is nonzero. Validate finite values and sensible bounds, including a yield change no lower than −100%.
- Calculate from canonical values:

  - Baseline revenue per hectare = baseline yield × commodity price.
  - Net change per hectare = baseline revenue × assumed yield change / 100 − seed cost − termination cost + support payment.
  - Total net change = net change per hectare × managed hectares.
  - Break-even yield change (%) = 100 × (seed cost + termination cost − support payment) / baseline revenue.

- Support crop-appropriate U.S. units and metric units without changing the underlying result. Communicate rounding and the calculation basis. Economics assumptions autosave separately from confirmed calendar plans; a combined versioned snapshot is not yet implemented.

### 5.5 Regional Atlas

- Default to **Published yield effects**, using county-scale summaries derived from the authors' archived 2019–2020 cover-crop research estimates. Support corn/soybean and period filters, source details, sample counts, and explicit no-data states.
- The bundled data covers 486 counties across Illinois, Indiana, Iowa, Michigan, Missouri, and Ohio. Each displayed value is a post-publication county mean of available published sample-level model estimates, not a field forecast, county-wide measurement, new validation, or financial return. Missing coverage is not zero effect or zero acreage.
- Keep **Net return scenarios** separate. Its H3 economic layer requires an explicitly configured, reviewed regional dataset with provenance; without one, show unavailable coverage rather than invented values. Soil diagnostics may use independently sourced USDA soil-profile data.
- The regional yield API serves a validated bundled dataset by default. On a network failure, the client can use its identical bundled copy; an explicit unavailable or invalid API response remains unavailable.

### 5.6 Ask Meridian and backup

- Prepare an editable question with selected field and crop, observation context, saved plan or distinct working draft, and available numeric evidence. Include sample coordinates, source periods, units, retrieval time, provenance, and unavailable values. Allow copy and text export.
- Clearly state that analysis is not connected. Do not display fabricated model answers, risk scores, or drought simulations.
- Export a versioned JSON backup of fields, confirmed plans, drafts, economics, map preferences, and units. Validate and preview imports before explicit merge; existing local records win collisions, while settings and units are restored from the backup. Block import during unsaved field edits and attempt rollback if storage fails. A backup is a user-managed file, not cloud synchronization.

## 6. Data, evidence, and trust

| Source | Current use | Interpretation limit |
| --- | --- | --- |
| NASA GIBS | Optional SMAP, VIIRS and IMERG imagery | Visual observations at source resolution; not extracted field-average model features. |
| NASA POWER | Daily precipitation and modeled root-zone wetness | Grid-based context, with potentially delayed and differing source dates. |
| USDA NASS CDL | Crop classification at a sample point | Classification is not a whole-field assessment; crop acceptance is manual. |
| USDA NRCS SSURGO / Soil Data Access | Mapped soil capacity and soil profile | Mapped soil context, not measured current field moisture. |
| U.S. Drought Monitor | Dated regional drought overlay | Regional context, independent of NASA observation dates. |
| Deines et al. archived research | Historical county summaries of published corn/soybean yield-effect estimates | Limited geography and period; not current predictions or profitability. |
| Natural Earth, H3, map providers | Geography, regional indexing, and basemaps | H3 cells and map boundaries are not surveyed farm parcels. |

Each source-backed value should retain its provenance, actual period, units, spatial meaning, and availability. Never substitute illustrative fixtures for current observations or infer unsupported precision. See [regional research details](REGIONAL-ATLAS.md), [map sources](MAP-DATA.md), and [API documentation](../apps/api/API.md).

## 7. Analysis and model status

The backend includes a Clovis analysis API, example responses, and provisional decision rules with shared contracts. Its planting-advice outputs are explicitly unvalidated. Research found that the held-out shallow random forest performed worse than persistence for next-day and recursive moisture predictions; no model was promoted. The older generic field-analysis endpoint also contains mock outputs. Neither is an operational field recommendation, and neither is connected to Ask Meridian.

Before user-facing predictive analysis, the team must agree on the decision and target population, inputs and shared contracts, source provenance, supported geography and crops, validation against appropriate independent data and baselines, uncertainty, failure states, and clear communication of limitations. The model architecture remains open. See [API handoff](API_HANDOFF.md), [model diagnosis](CLOVIS_MODEL_DIAGNOSIS.md), and [final test evaluation](CLOVIS_FINAL_TEST_EVALUATION.md).

## 8. Non-functional requirements

- **Usability and accessibility:** support phone and desktop layouts, keyboard operation, clear focus and accessible controls, readable legends and source disclosures, and actionable empty, loading, and error states.
- **Resilience:** map browsing and manual work remain usable when external data is unavailable. Missing measurements remain missing; never zero-fill them or silently replace live results with fixtures.
- **Privacy and persistence:** no account is required. Fields and assumptions are browser-local; users must be able to export and restore their own backup. Browser storage can be cleared or unavailable.
- **Consistency:** preserve field, crop, map context and display units across the relevant workflows. Metric values remain canonical underneath unit conversions.
- **Contracts:** changes to API payloads require coordinated TypeScript types, Pydantic schemas, and shared fixtures before client or server integration.
- **Performance:** regional mapping should remain responsive; the hardware 60 fps acceptance target remains open and functional test passes do not establish it.

## 9. Priorities and open decisions

1. **Combined confirmed plan:** save field, crop, calendar, and economic assumptions in one versioned snapshot, with migration and backup coverage. Disclose newer drafts and require an explicit restore choice.
2. **Review before confirmation:** summarize field, area, dates, units, economics, totals, missing inputs, and changes from the confirmed version.
3. **Relevant evidence:** clearly disclose whether a field's location, crop, and year are covered by research. Expand coverage only when suitable evidence is available.
4. **Usability and recovery:** improve local-storage and backup discoverability, consider bounded undo, and retain clear field and draft lifecycle feedback. An independently reported U.S.-units savings mismatch remains unverified because no reproduction values were provided; a known −$85/acre × 100-acre case passes.
5. **Validated analysis:** agree and validate the environmental and model contracts before connecting recommendations or forecasts. Quantitative regional economics requires a separate reviewed dataset.
6. **Deployment:** complete end-to-end deployment and domain configuration after acceptance. Azure and a GoDaddy-managed domain are proposed, not delivered.

A possible future navigation simplification would put regional research into Explore while preserving `/atlas` links and keeping field management separate. This is a proposal, not current behavior. See [UX priorities](UX-PRIORITIES.md) and [next product delivery](PRODUCT-NEXT.md).

## 10. Acceptance and current evidence

The present local baseline is acceptable for a planning demonstration when users can explore sources, create or select a field, record a calendar, calculate a manual budget, recover their work, inspect available regional research, and prepare a question without mistaking any of these for validated advice. Loading, missing-data, storage-failure, and unsupported-coverage states must remain understandable.

The latest handoff records a production build and TypeScript pass, focused field lifecycle, navigation and map checks, and 23 shared fixture checks for the 15 November usability changes. An earlier post-integration run recorded 54 API/service/contract tests and 10 data tests. The full browser run for the usability pass recorded 102/104, with the two outdated assertions passing after correction in focused reruns; it was not reported as a new clean full-suite rerun. A real-inference test requires local model artifacts that were absent. These are recorded local results, not checks rerun for this documentation update or deployed acceptance. See [handoff](HANDOFF.md) for details.
