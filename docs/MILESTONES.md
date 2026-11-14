# Meridian — hackathon milestones

Updated: 14 November 2026 after the client completion pass. Working name: Meridian; original project/PRD name: FieldShift. Completion below means local implementation, not deployment or scientific validation.

## 1. Application and map workspace — complete

- Official shadcn/ui Base UI components, Tailwind v4 and a full-height navigation
  sidebar: Explore, Field Planner, Economics and Ask Meridian, with separate URLs.
- Explore has one toolbar: location, crop, Field / Atlas, layers, Latest / Past date.
- Roads, place names, rivers and boundaries under selectable H3 cells. Four levels:
  resolutions 2/3/4/5 at zoom 4/6/9. On-demand details use an accessible Sheet.
- Tribune, Colby, Hays, Salina, Manhattan and Ottawa navigation targets.
- Phone navigation drawer; keyboard controls; crop hit area covers the entire select.
- No login. Crop/location/date persist, and the map stays mounted across workspaces.

Done when: navigation, details and map controls work on desktop, phone and landscape;
selection and map view survive workspace changes. Covered by browser checks.

## 2. NASA visual observations — complete

- On-demand SMAP soil moisture, VIIRS NDVI and GPM IMERG overlays.
- Latest advertised observation or last available observation on/before a past date.
- Actual observation dates, units, native legends, opacity and Retry.
- External basemap failure preserves the interactive hex grid. Tile loading and
  failure leave navigation usable. Compare is no longer a navigation destination.

Done when: users can inspect all three layers without blocking map navigation.
Live imagery depends on NASA; visualization tiles are not numeric model features.

## 3. Field selection and local persistence (SPA-84) — complete

- Exact point selection in Field mode; regional hex selection in Atlas.
- Multiple named fields, Terra Draw polygon creation/editing, geodesic hectares
  and centroid, and a 5,000 ha cap with an Atlas action for oversized drafts.
- Save/Cancel boundary edits and Save/Discard/Stay navigation protection.
- Fields, crop choices, management inputs and economics persist locally by stable
  field ID and crop. Polygon area controls Planner and Economics hectares.
- Real USDA CDL point lookup, explicit crop acceptance, source-year disclosure,
  and manual fallback for missing or unsupported classifications.

- Versioned JSON backup/export and reviewed merge import preserve fields, plans,
  drafts, economics, settings and units. Existing records win conflicts; invalid
  files are rejected and failed storage writes trigger rollback. Migrated plan
  aliases export under canonical keys. This remains browser-local storage.

Done when: a boundary can be drawn, saved, reopened and edited without losing its
field-specific inputs. CDL is a point sample, not a whole-field classification.

## 4. Real environmental context — first numeric slice complete

- `/api/v1/field-conditions` retrieves NASA POWER 30-day corrected precipitation
  and root-zone relative wetness, plus USDA SDA mapped available water storage.
- Details and Planner expose actual periods, source links, grid/map-unit meaning,
  and independent unavailable states. Soil capacity is not current moisture;
  historical weather does not imply historical soil mapping.
- Complete 30-day rain windows only; bounded concurrent provider requests and
  date-aware caching. Live NASA/USDA point lookups verified.
- Remaining: model-specific temperature/evapotranspiration features, appropriate
  aggregation and applicability validation, and simulation integration.

- Finalize shared TypeScript/Pydantic contracts and sample payloads before endpoints.
- Extend the initial point context as needed by the agreed model, with units,
  dates, provenance, spatial meaning and explicit unavailable states.
- Replace locality reference points with verified farm/parcel data where available.
- Evaluate Meteomatics for selected-field weather context through the backend;
  credentials stay server-side. It is optional, not a dependency of the map preview.

Done when: selecting a location returns source-backed context without fabricated
values; timeouts leave useful navigation and clearly identify missing data.

## 5. Meridian Intel — request UI complete; analysis integration pending

- Dedicated Ask Meridian workspace attaches selected map and saved-plan context to
  an editable question, offers starting questions, and copies/exports the prepared request.
- Numeric context includes actual sample coordinates, source periods, units, links
  and missing values. Saved records are distinguished from changed working drafts.
  No generated answer or future analysis client is implemented.
- Next: connect the agreed backend analysis service using shared contracts.
- Show meaningful loading/error states and grounded responses with source dates.

Done when: a real request produces an attributable response, or an honest unavailable
state. The current UI explicitly says analysis is not connected; it does not answer.

## 6. Field planning and economics — manual tools complete; predictions pending

- Termination-first usability pass: shared field/next-crop selector across all
  workspaces, calendar-led Planner, working drafts preserved independently from
  confirmed plans, and U.S./metric inputs with canonical metric storage.
- Economics shows per-area results before acreage is supplied; parcel totals
  require valid managed area. Atlas offers a point drilldown at its hex centroid.
- Field Planner saves cover-crop type, termination lead time, optional planting date,
  entered field area and notes per selected location/crop. Calendar dates are arithmetic.
- Economics calculates net change and break-even from entered assumptions (USD/tonne,
  tonnes/ha, yield change %, costs/payment USD/ha, hectares). No live/default prices,
  predicted yields or generated recommendations. Inputs persist per location/crop.
- Saved plans at `/planner/saved` can reopen, restore or delete confirmed records
  and compare two records with a downloadable calendar summary. Context differences
  are disclosed. One confirmed record per field/crop remains the storage model;
  same-field scenario history and prediction sensitivity remain pending.
- Planner explains missing inputs; Economics identifies manually entered assumptions.
- Agree model inputs, calibration dataset, target outputs, and validation with the
  backend/ML team before adding result cards or controls that imply predictions.
- Implement a single cover-crop-to-cash-crop decision cycle and validated model output.
- Connect existing management/economic inputs and add sensitivity results after API agreement.
- User-drawn boundaries are available; verified parcel datasets remain optional.

Done when: field outputs come from a validated service with appropriate uncertainty
and reproducible benchmark checks. No drought demo or invented risk scores in the UI.

## 7. Data-backed National Atlas — pending model/data

- Replace neutral geographic cells with real regional aggregates once their meaning
  and source are agreed. Keep the existing zoom and selection behavior.
- Provide intelligible legends, coverage, observation dates, and missing-data states.
- Connect region-to-field inspection with the same location and crop/date context.

Done when: every quantitative cell color and diagnostic has a documented source or
validated model. Current neutral variations are visual styling, not assessments.

## 8. Demo readiness — baseline checks complete; full workflow pending

- Latest client baseline: production build (Webpack), TypeScript and 58 checks
  passed across the complete regression run and focused reruns. Coverage includes
  geometry, persistence, units, financial arithmetic, source periods, offline/stale
  conditions, saved-plan comparison/export, JSON import/export, quota rollback,
  legacy aliases and 390px backup access.
- Earlier environment delivery recorded 20 backend tests and 13 shared fixtures
  passing. These were not rerun during the client completion pass.
- Repeat acceptance checks after real data/Intel/model integration across all six
  benchmarks, phone/desktop, historical dates, and unavailable services.
- Prepare the final demonstration, attributions, screenshots/video, and submission.

Done when: the agreed end-to-end workflow is repeatable without login or blank panels.

Source-backed simulation, generated explanations and quantitative Atlas acceptance
remain pending. See [future delivery plan](PRODUCT-NEXT.md) for dependencies and
[client delivery](CLIENT-DELIVERY.md) for the completed browser-side work.

## 9. Deployment — final stage, pending

- Deploy the finished application/backend on Azure; choose services for the final
  runtime requirements rather than provisioning speculative infrastructure now.
- Connect the chosen GoDaddy-managed domain, HTTPS, environment variables, and CORS.
- Run deployed smoke checks for map assets/workers, NASA access, and backend requests.

Done when: the custom domain serves the verified app over HTTPS and the real backend
works from that origin. Domain purchase, Azure provisioning, and deployment are not done.
