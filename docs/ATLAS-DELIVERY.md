# FR-10/11 — regional Atlas delivery

Updated 14 November 2026. Owner: Marius. Engineering implementation is available locally. Regional financial coverage and hardware performance acceptance remain open. A historical county yield layer was added on 15 November; see REGIONAL-ATLAS.md.

## Implemented

- A lazily loaded deck.gl H3HexagonLayer uses the existing MapLibre map through the official MapLibreOverlay integration. Interleaved WebGL2 rendering places assessments below map labels; device pixel ratio is bounded at 1. A MapLibre GeoJSON fallback retains source values and picking when the deck renderer fails.
- Crop and management-scenario filters select the supplied records. The fixed crimson/neutral/emerald scale represents incremental USD/ha from −200 to +200, clipping outliers. Zero return, missing return, zero active area and uncovered geography have distinct semantics. Legend, baseline, period, sources, declared validation and generated time are inspectable.
- Hover and selected-region diagnostics show net change, yield penalty (negative means gain), root-zone relative wetness, soil texture and active area when present. Mouse click and touch selection open the same evidence panel. Fixture numbers are not served as observations or predictions.
- Numeric point context remains NASA POWER precipitation/wetness and USDA mapped soil capacity. A new USDA Soil Data Access profile supplies the dominant map-unit component, drainage and hydrologic group; horizon texture, sand/silt/clay, organic matter, bulk density, pH and saturated hydraulic conductivity for source intervals within 0–30 cm. Point survey properties are explicitly separate from regional aggregates and historical weather.
- Loading, provider unavailable, malformed/unvalidated data, unsupported filter coverage, verified no-acreage, missing measurements and renderer fallback are handled. Navigation, geography and manual planning remain available.
- Shared TypeScript/Pydantic contracts and fixtures precede the endpoints. No AI model, training or inference implementation changed.

## Production dataset handoff

`GET /api/v1/atlas` reads the service's `ATLAS_DATASET_PATH`. If no usable dataset is configured it returns HTTP 200 with a typed unavailable envelope and no quantitative records. It does not load the illustrative Kansas trial file or the test fixtures automatically.

Supply a reviewed JSON dataset following `shared/src/types/atlas.ts` and the mirrored Pydantic schema. Required metadata includes dataset identity, generated time, declared validation method/reference, scenarios with a comparison baseline and analysis period, and provenance with spatial meaning. Each record identifies an H3 index, supported crop and scenario. Values are nullable; unknown/zero active area must not carry yield or return outputs. Root-zone wetness is a fraction, not volumetric water content. Cell IDs must be valid H3 with CONUS centroids, unique per crop/scenario, and uniform in resolution within each crop/scenario group.

The service enforces a 10 MB / 10,000-record limit and refuses malformed files. The browser independently validates coverage, references, numeric values, dates and HTTPS provenance. Structural validation and a `validated` metadata label cannot establish scientific validity: dataset owners must review calibration, independent evaluation, applicability and aggregation before deployment.

The repository's `backend/data/kansas_trials.json` explicitly identifies harmonized illustrative benchmark scenarios. It is excluded from the production service. The `shared/payloads/atlas-available.json` example is a contract fixture, not a deployable regional assessment. Do not point production configuration at it.

## Soil source verification

The finalized USDA SDA query was checked live at Tribune (38.4697, −101.7521). It returned the Richfield component (93% of the map unit), Silt loam at 0–16 cm and Silty clay loam at 16–30 cm, with independently sourced numeric horizon properties. These are mapped survey properties at one point. Missing values stay missing, and no weighted aggregate is invented across gaps. The query selects one dominant component first, joins representative chtexturegrp descriptions by horizon, and withholds ambiguous map-unit intersections.

## Performance measurements and remaining acceptance

A repeatable browser test exercises 721 H3 cells per layer / 1,442 records across two scenarios at 1440×960. Test fixtures are explicitly software-only and do not represent regional evidence.

Chromium with Playwright SwiftShader on the development server measured:

| Measurement | Isolated run | Parallel regression run |
| --- | --- | --- |
| Cold layer setup (includes lazy module initialization) | 200.6 ms | 576.2 ms |
| Warm scenario layer setup | 0.6 ms | 0.8 ms |
| Average requestAnimationFrame responsiveness during pan | about 20.6 fps | about 15.3 fps |
| p95 frame interval | 50.1 ms | 183.4 ms |

Warm setup meets the sub-300 ms goal in these runs. Cold startup is variable and did not meet 300 ms under parallel load. **60 fps is not achieved in this software-rendered environment.** rAF sampling is a responsiveness proxy, not proof of GPU throughput or a guarantee on user hardware. Final acceptance needs a specified hardware-accelerated device/browser, production build, representative dataset, interaction trace and network conditions. The test attaches its measurements as JSON; it does not silently lower the 60 fps target.

Official implementation references: [MapLibre integration](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre), [H3HexagonLayer](https://deck.gl/docs/api-reference/geo-layers/h3-hexagon-layer), [deck.gl performance](https://deck.gl/docs/developer-guide/performance).

## Next acceptance steps

1. Backend/data owners supply and sign off a scientifically validated regional dataset; configure the API path and verify actual crop/scenario coverage.
2. Confirm soil and moisture aggregation semantics for regional values; keep centre-point surveys separate.
3. Run production/hardware performance acceptance and optimize against measured frame bottlenecks until the agreed target is met.
4. Complete live-data regression and deployment acceptance. Quantitative national coverage and 60 fps must not be marked complete before these steps pass.

Verification at delivery: full frontend suite 81/81, backend 31/31, shared fixtures 16/16,
TypeScript and production build passed. Four UI Atlas checks cover verified-contract
filtering, withheld unvalidated data, actual deck picking/hover and soil diagnostics;
renderer and data helpers have independent safety checks. The full suite includes
all earlier field/history/persistence/backup regressions. Changes remain uncommitted.
