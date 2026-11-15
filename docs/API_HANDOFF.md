# Field Shift: frontend API handoff and Task 6

Task 6 and provisional planting advice are implemented. The GitHub Meridian updates were pulled through `7ca3efd`, with existing land-cover, field-conditions, health, and legacy demo routes preserved. The web developer can build all advice states now: `plant`, `do_not_plant`, `review`, and `insufficient_evidence`. Responses explicitly identify the advice as provisional and unvalidated; model improvement is separate work.

## Start here

From the repository root:

```powershell
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
$env:FIELD_SHIFT_MODEL_BUNDLE = (Resolve-Path data/model-bundles/clovis-task5).Path
corepack.cmd pnpm dev
```

Web: `http://localhost:3000`. API: `http://localhost:8000`. Interactive documentation: `http://localhost:8000/docs`. Machine-readable contract: `http://localhost:8000/openapi.json`, also exported as [openapi.json](openapi.json).

The repository includes the small trusted model bundle and matching cached weather/training features used by the demo. Set `FIELD_SHIFT_MODEL_BUNDLE` as above on a fresh checkout; the original experiment-run pointer belongs to the training machine. If the serving artifacts are absent, `/health`, `/docs`, `/api/v1/options`, and the explicit saved-example endpoint still work after dependencies are installed. `/ready` reports unavailable and the computed analysis endpoint returns 503. See artifact setup below rather than treating that response as a frontend error.

Frontend files:

- [Typed client](../apps/web/lib/field-shift-api.ts): `getOptions`, `getReady`, `analyzeCoverCrop`, and `getAnalysisExample`.
- [Canonical shared TypeScript schemas](../shared/src/types/clovis.ts): generated from FastAPI OpenAPI and exported by `@spaceapps/shared`, including input versus resolved-output types. Python models are exported by [shared/python/schemas.py](../shared/python/schemas.py), with definitions in [clovis_schemas.py](../shared/python/clovis_schemas.py). `app/contracts.py` and the old web types file are compatibility exports.
- [Full request](../examples/api/analyze.request.json) and [full computed response](../examples/api/analyze.response.json).
- [Compact request](../examples/api/analyze.compact.request.json) and [compact response](../examples/api/analyze.compact.response.json).
- [Saved request/response pair](../examples/api/analysis.example.json): explicit example mode, including chart data.

Set `NEXT_PUBLIC_API_BASE_URL` when the API is on another host. The client defaults to `http://localhost:8000` and uses a 20-second timeout with optional `AbortSignal` cancellation. For a different browser origin, configure the backend's comma-separated `FIELD_SHIFT_CORS_ORIGINS` environment variable. Defaults allow `http://localhost:3000` and `http://127.0.0.1:3000`, without credentials.

## Routes

| Method / path | Purpose | Main statuses |
| --- | --- | --- |
| `GET /health` | Meridian process health with status, service, version, timestamp, and checks. | 200 |
| `GET /ready` | Whether model and weather artifacts loaded. This does not establish recommendation validity. | 200 ready; 503 unavailable |
| `GET /api/v1/options` | Site/crop choices, supported calendars, default assumptions, and a complete example request. | 200 |
| `POST /api/v1/analyze` | Compute historical moisture comparisons, relative risk labels, and illustrative finances. | 200, 422, 429, 503, 500 |
| `GET /api/v1/examples/analysis` | Saved example pair, without running a model or requiring model artifacts. | 200; 503 if fixture missing |

Legacy mock and benchmark endpoints remain available and are documented in [apps/api/API.md](../apps/api/API.md). The new frontend should use the routes above.

## Minimal request

Only `scenario` is required at the top level. Omitted settings use the defaults returned by `/api/v1/options`.

```json
{
  "scenario": {
    "decision_date": "2027-02-23",
    "initial_soil_moisture_m3_m3": 0.25,
    "cover_crop": "pea",
    "cover_planting_date": "2027-02-24",
    "cover_termination_date": "2027-05-22",
    "next_crop_planting_date": "2027-10-09"
  },
  "area_ha": 1.0,
  "include_daily_trajectory": true
}
```

The complete payload has five top-level blocks: `scenario`, `area_ha`, `economics`, `risk_rules`, and `include_daily_trajectory`. Unknown fields are rejected. Numeric inputs are JSON numbers; numeric strings, booleans in number fields, and nonfinite numbers are rejected.

| Scenario field | Meaning and constraints |
| --- | --- |
| `site_id` | Defaults to `clovis_nm`; only this demonstration location is supported. Coordinates are returned by `/options`. |
| `decision_date` | Required `YYYY-MM-DD`; initial moisture describes that date's daily average. |
| `initial_soil_moisture_m3_m3` | Optional finite fraction in [0,1]. `0.25` means 25% volumetric moisture at 5 cm. Null/omitted uses a documented historical training default, not a current field measurement. |
| `cover_crop` | Required: `pea`, `oat`, or `six_species_mix`. |
| `cover_planting_date` | Required; Februaryâ€“April. |
| `cover_termination_date` | Required; Mayâ€“June. |
| `next_crop` | Defaults to `winter_wheat`; only winter wheat is supported. |
| `next_crop_planting_date` | Required; Septemberâ€“November. |
| `irrigation_schedule` | Defaults to `[]`. Events have `date` and nonnegative numeric `amount_mm`. Dates must be unique, after the decision, and no later than next planting. Both cover/fallow receive the same irrigation. |

Require `decision <= cover planting < termination < next planting`. All crop operation dates must be in the same year, with a decision-to-next-planting horizon of 7â€“365 days. Decision year must be at least 2001; planting year at most 2100. These calendar limits describe the demonstration scope, not learned planting advice. Keep dates as calendar strings; converting them through browser UTC timestamps can shift the intended date.

`area_ha` is hectares, defaults to 1, and must be >0 and <=1,000,000. Per-hectare calculations are independent of area; only the total incremental benefit is multiplied by area.

`include_daily_trajectory` defaults to true. Set false for a smaller response: each scenario's `daily_trajectory` is then explicitly null, while all summaries are still calculated. An empty array is not the compact-mode indicator.

## Economic inputs and exact calculations

These are editable illustrative defaults, not market-price data, calibrated yield coefficients, or learned yield predictions.

| `economics` field | Default | Meaning |
| --- | ---: | --- |
| `currency` | `USD` | Only USD is supported. |
| `baseline_wheat_yield_t_ha` | 3.0 | Assumed following-wheat yield under fallow, tonnes/hectare; range 0â€“100. |
| `wheat_price_usd_t` | 250.0 | Assumed wheat price per tonne. |
| `moisture_to_yield_sensitivity` | 1.0 | Multiplier converting relative moisture difference into relative yield change; range 0â€“10. |
| `max_relative_yield_change` | 0.25 | Symmetric cap on assumed yield change; range 0â€“1. |
| `seed_cost_usd_ha` | 50.0 | Incremental cover seed cost per hectare. |
| `establishment_cost_usd_ha` | 10.0 | Incremental establishment cost per hectare. |
| `termination_cost_usd_ha` | 25.0 | Incremental termination cost per hectare. |
| `additional_cost_usd_ha` | 0.0 | Other incremental cover costs. |
| `net_cover_revenue_usd_ha` | 0.0 | Net grazing/forage/other cover revenue; may be negative. Avoid counting the explicitly entered seed/establishment/termination costs here again. |
| `incentive_usd_ha` | 0.0 | Additional incentive per hectare. |

Prices, nonnegative costs, and incentive have a maximum of 1,000,000 in their declared units. Net cover revenue is bounded from -1,000,000 to +1,000,000. All values must be finite.

For each weather case, let C and F be cover/fallow **final-seven-day average** moisture, respectively:

```text
relative_moisture_difference = (C - F) / F
raw_relative_yield_change = relative_moisture_difference * sensitivity
relative_yield_change = clamp(raw_relative_yield_change, -cap, +cap)
cover_yield = baseline_wheat_yield * (1 + relative_yield_change)
wheat_revenue_difference = (cover_yield - baseline_wheat_yield) * wheat_price
cover_cost = seed + establishment + termination + additional_cost
incremental_net_benefit_per_ha = wheat_revenue_difference + net_cover_revenue + incentive - cover_cost
incremental_net_benefit_total = incremental_net_benefit_per_ha * area_ha
additional_revenue_to_break_even_per_ha = max(0, -incremental_net_benefit_per_ha)
```

If F <= 0.000001, relative comparison is unavailable: `finances.status = "insufficient_moisture_baseline"`, relative/yield/benefit fields are null, and water risk is unknown. Fixed baseline values and costs remain visible. The server does not divide by a guessed denominator.

`incremental_net_benefit` compares cover with fallow under the assumptions. It is not whole-farm net profit; common wheat production costs are excluded. `financial_signal` is positive/negative/neutral/unknown according to that arithmetic, independently of the recommendation.

The present saved-model example has zero final-week cover/fallow difference after trajectories converge, so the default calculation is **-$85/ha** in every case. The provisional rule therefore returns `do_not_plant`; this is not independent evidence of zero crop effect or validated agronomic advice. The [revenue example](../examples/api/analyze.with-revenue.request.json) adds $100/ha net cover revenue, produces **+$15/ha**, and returns provisional `plant`. Its [computed response](../examples/api/analyze.with-revenue.response.json) is included for frontend controls.

## Water-risk inputs

| `risk_rules` field | Default |
| --- | ---: |
| `moderate_relative_moisture_loss` | 0.05 |
| `high_relative_moisture_loss` | 0.15 |

Require `0 < moderate < high <= 1`. Relative loss is `max(0, -relative_moisture_difference)`. A loss at or above the high threshold is high; otherwise a loss at or above the moderate threshold is moderate; otherwise low. Missing relative comparison gives unknown.

The label describes modeled loss **relative to fallow**. Low does not establish adequate absolute water, low drought risk, high confidence, or safety to plant. Thresholds are editable examples, not fitted agronomic limits. The response explicitly sets `water_risk.validated = false`. Risk labels do **not** multiply yield/revenue or apply another financial penalty.

## Response fields and frontend mapping

### Provisional planting rule

`recommendation.status` is `provisional` when a rule-based decision is available and `unavailable` when required comparisons are missing. `validated` is always false and `method_version` is `planting-rule-v1`.

Rules are evaluated in this order:

1. Missing a moisture/financial comparison, unknown water risk, or not exactly three cases: `insufficient_evidence`.
2. High relative moisture-loss risk in any case: `do_not_plant`.
3. Negative incremental net benefit in all cases: `do_not_plant`.
4. Positive incremental net benefit in all cases: `plant`.
5. Otherwise, including mixed returns or break-even: `review`.

Financial sign uses a tiny 1e-9 USD/ha numerical tolerance. Model clipping, poor validation, and surface-only measurement flags are retained as reason codes and quality information, but **do not suppress this explicitly authorized provisional advice**. A false `recommendation_ready` or `usable_for_recommendation` refers to scientific validation; use `recommendation.status` to determine whether provisional UI advice exists. No confidence probability or optimized planting date is invented.

Shared fixtures cover every state: [plant](../shared/payloads/clovis-analysis-plant.json), [do not plant](../shared/payloads/clovis-analysis-do-not-plant.json), [review](../shared/payloads/clovis-analysis-review.json), and [insufficient evidence](../shared/payloads/clovis-analysis-insufficient-evidence.json). The first three were computed with different explicit revenue assumptions and marked example mode. The last is a clearly marked synthetic missing-baseline UI fixture, not a model result.

| Response field | Suggested frontend use |
| --- | --- |
| `status`, `execution_mode` | Distinguish experimental computed output from an explicit saved example. `computed` means local model execution with historical weather, not live weather. |
| `request` | Resolved input/defaults, for displaying what was analyzed. |
| `model` | Traceable model name, hash, source run, validation scores, and unvalidated seasonal status. Keep detailed hashes in developer/debug views. |
| `weather` | Historical coverage, NASA source, LST convention, and no scenario probabilities. The cache ends 31 December 2025. |
| `initial_moisture` | Value and source; disclose when a historical training default was used. |
| `scenarios` | Three cards keyed by `dry`, `typical`, and `very_rainy`, each with actual selected historical dates and rainfall. |
| `scenarios[].moisture` | Planting-date daily-average estimates, final-week averages/differences, and minimum trajectory values. |
| `scenarios[].daily_trajectory` | Chart date, cover/fallow moisture, source weather date, weather inputs, irrigation, and clipping/unseen-phase flags. Null when omitted. |
| `scenarios[].water_risk` | Relative-loss indicator with its explicit unvalidated basis. |
| `scenarios[].quality` | Reliability state alongside provisional advice. `invalid` means the trajectory clipped; `limited` still means unvalidated. `usable_for_recommendation=false` refers to validated advice and does not hide prototype decisions. |
| `scenarios[].finances` | Illustrative yield/gross wheat revenue, cover costs, incremental benefit, break-even amount, and cap flag. Honor null values. |
| `financial_summary` | Unweighted min/max across calculated cases and a count of positive cases; not expected return, confidence limits, or probabilities. |
| `recommendation` | Render the server's four-state decision, `status`, `validated=false`, message, method version, and reason codes. Use a visible provisional label; do not independently reimplement the rule in the client. |
| `assumptions` | Basis of the comparison and calculations. |

Moisture fractions and relative changes become percentages by multiplying by 100. A moisture **difference** of 0.01 is one volumetric percentage point; it is not automatically a 1% relative difference. Render dollar values with two decimals; the API retains arithmetic precision. Chart dates describe daily averages at 5 cm, not root-zone water in millimeters.

Three cases are historical rainfall selections, not forecast probabilities or confidence intervals. The response does not assign a probability to a case, and summing/averaging its financial results would introduce an assumption the API has not made.

## TypeScript integration

```typescript
import {
  analyzeCoverCrop,
  getAnalysisExample,
  getOptions,
  getReady,
  FieldShiftApiError,
} from "@/lib/field-shift-api";

const options = await getOptions();
const form = options.example_request;
const ready = await getReady(); // Returns typed unavailable status on HTTP 503.

if (ready.inference_available) {
  try {
    const result = await analyzeCoverCrop(form);
    // result.scenarios -> cards/charts; result.recommendation -> explanation.
  } catch (error) {
    if (error instanceof FieldShiftApiError) {
      // error.status, error.code, error.requestId
      // error.details[].location: ["body", "economics", "wheat_price_usd_t"]
    }
  }
} else {
  const example = await getAnalysisExample();
  // Explicit demo preview, with response.execution_mode === "example".
}
```

The helper performs no automatic mock substitution. It accepts an optional `AbortSignal` for each method. A user cancellation/20-second timeout rejects with an abort error. Network failures reject separately from structured HTTP errors. `NEXT_PUBLIC_API_BASE_URL` is a Next.js public build/start setting; update/rebuild as appropriate for the environment.

## Errors, readiness, and request timing

Computed-route errors use this shape:

```json
{
  "request_id": "example-id",
  "error": {
    "code": "validation_error",
    "message": "Some request fields are invalid.",
    "details": [
      {"location": ["body", "area_ha"], "message": "Input should be greater than 0", "type": "greater_than"}
    ]
  }
}
```

| Status / code | Frontend handling |
| --- | --- |
| 422 `validation_error` | Show field errors; cross-field calendar/threshold errors may attach to the whole nested object. |
| 422 `invalid_scenario` | Calendar lacks enough complete compatible historical seasons. |
| 429 `analysis_busy` | One analysis is already running in this worker. Honor `Retry-After: 1`; keep the form and offer retry. |
| 503 `service_unavailable` | Model/weather artifacts did not load. Keep metadata/forms available; use the explicit example route for demo work. |
| 503 `example_unavailable` | Saved example file is missing; regenerate the handoff. |
| 500 `internal_error` | Show a retry message and request ID. Internal paths/tracebacks are not returned. |

`GET /ready` is the deliberate exception to the error envelope: on either 200 or 503 it returns the typed readiness object with `status`, `inference_available`, `recommendation_ready`, model information, and reason. The TypeScript helper handles this explicitly.

Responses carry `X-Request-ID` and `X-Process-Time-Ms`, exposed through CORS. The saved example's inner request ID belongs to its original computed fixture; the HTTP header belongs to the current example retrieval. Logs record route, status, elapsed time, and request ID without logging farm payloads.

One model/weather engine loads at worker startup; requests never train or download weather. A worker allows one active analysis and returns 429 rather than an unbounded queue. The full 228-day example took approximately **2.2 seconds** for the computed request in the local ASGI integration run. This is a single measurement, not a p95 latency or throughput guarantee. The client timeout is 20 seconds. No shared cloud service or public deployment was created.

## Model source and artifact setup

### Compatible model replacement

The API and advice contracts do not depend on a particular forest's weights. A portable trusted bundle contains `model.joblib` and `bundle.json` with its hash, model identity, feature contract, runtime version, and evaluation metadata.

```powershell
apps/api/.venv/Scripts/python.exe apps/api/export_model_bundle.py --output data/model-bundles/clovis-task5
$env:FIELD_SHIFT_MODEL_BUNDLE = (Resolve-Path data/model-bundles/clovis-task5).Path
corepack.cmd pnpm dev
```

When a compatible improved bundle is pulled/downloaded, point `FIELD_SHIFT_MODEL_BUNDLE` at its directory and restart the API. No frontend payload change is needed. The server checks the artifact hash and feature/scikit-learn compatibility before loading. This setting takes precedence over `FIELD_SHIFT_REGRESSION_RUN`. Use trusted bundles; a joblib file can execute code while loading. A model that requires different features needs a corresponding backend adapter, not just a renamed weight file. Keep large weights out of Git and transfer them as versioned artifacts.

The API intentionally serves the **existing Task 5 frozen model**: `forest_depth_4`, source run `e60c4eb5b91d4a13b6bce45138efb0af`. The later phase-balanced/chronological experiment artifacts were not silently promoted. The runtime adapter loads the frozen standalone scripts without modifying their source hashes or adding their directory to `sys.path`.

For computed inference, the backend needs:

- Original Task 4 regression run containing `results.json`, `provenance.json`, and the matching forest joblib.
- Verified `data/processed/clovis_weather_v1` and its training features/manifest.
- Cached NASA blocks under `data/weather/nasa_power/clovis_v1`.

Use only trusted local joblib files. `FIELD_SHIFT_REGRESSION_RUN` can point to a transferred **Task 4-format** run directory if its saved absolute latest-pointer path differs on another machine. Version/hash mismatches fail initialization and result in unavailable readiness; they do not trigger training or fallback to another model.

For a clean environment, reproduce the earlier preparation/baseline/regression steps described in the existing guides, or transfer their matching trusted artifacts. Artifact generation is a separate explicit setup command, not part of serving. Weather coverage remains historical through 2025; no current-weather freshness is claimed.

The committed bundle is approximately 213 KiB. Original experiment histories, local backups, SQLite databases, and the oversized root `5min.csv` are excluded. The latter is an optional high-frequency source available from Figshare DOI `10.6084/m9.figshare.30263209`; serving uses the committed daily features instead. Full research/evaluation reruns may require generating the ignored experiment directories separately.

A clean staged checkout, without ignored experiment histories, was verified using the bundle environment variable: readiness and real analysis both returned 200 with three scenarios and the original model hash. Scikit-learn is pinned to the bundle's required `1.9.1` runtime. Git attributes preserve the exact bytes of frozen ML sources and data across Windows/Linux checkouts so provenance hashes remain valid.

## Regenerate and verify

```powershell
apps/api/.venv/Scripts/python.exe apps/api/export_api_handoff.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests -p "test*.py" -v
node_modules/.bin/tsc.cmd --noEmit --project apps/web/tsconfig.json
corepack.cmd pnpm --filter @spaceapps/shared typecheck
node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs
corepack.cmd pnpm --filter @spaceapps/web build
```

The exporter requires the real model/weather artifacts. It calls the actual FastAPI application through its ASGI test client, exports checked computed/full/compact/revenue examples, four shared advice-state fixtures, a saved example-mode pair, options/readiness/error examples, OpenAPI, and canonical shared TypeScript types. Generated types should be regenerated when the backend contract changes; do not edit them independently.

The checked fixtures include 422 validation, 429 busy, and 503 unavailable responses. The full response has three scenarios and **684 trajectory points**. The saved example route was verified to work with no model engine. Startup loading once, no inference-time fitting/network access, arithmetic/caps/near-zero handling, risk/finance separation, CORS, structured errors, semaphore release after failure, and OpenAPI synchronization are covered by tests.

After the GitHub merge, all **117 Python tests**, both shared/web TypeScript checks, **18/18 shared JSON fixture checks**, and the web production build pass. Python tests also validate the four new response fixtures against their Pydantic schemas. The real computed example completes in approximately 2.1 seconds after startup. Original model artifacts and prior ML source hashes remain preserved.

The user-facing web page itself is left for the web developer; the client and types are ready to import. Further ML and water-balance improvements can now proceed separately from frontend integration.
