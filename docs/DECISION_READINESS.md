# Cover versus fallow: net-return implementation checkpoint

15 November 2026. The objective is **additional net return from cover instead of fallow, with protection against losses in the following crop**. The current system cannot support a validated planting recommendation. Implementation adds safeguards and research/economic evaluation; it does not promote a new farmer model.

## Implemented

- Ask Meridian withholds unvalidated planting directives, even when the backend's prototype rule says plant or do not plant. Surface-moisture values and quality flags remain inspectable. Illustrative moisture-to-yield/financial calculations cannot establish a return estimate.
- [Replay verification](../scripts/verify_research_replay.py) established identical prepared Colorado data and frozen weights. The exact-export test requires recorded Python 3.14.4; this environment runs 3.14.6. Only manifest runtime metadata differs. [Machine-readable audit](../data/analysis/decision_readiness_v1/replay_verification.json). The frozen exporter remains unchanged and still rejects non-identical manifests.
- The [Mandan weather ablation](MANDAN_WEATHER_ABLATION.md) used the existing 176 observations, 142 paired contrasts, and three whole-year holdouts. Adding weather did not improve results. Paired water-plus-weather Ridge has 0.928 t/ha average-year MAE versus 0.309 for the training-mean contrast. Its point-sign choices favor cover for all 142 comparisons, including all 46 observed harms. No new model was promoted.
- [Net-return evaluation](NET_RETURN_EVALUATION.md) supports explicit prices/costs, break-even yield, whole-field totals, named sensitivity cases, and descriptive decision payoff/regret against fallow and a training-only baseline. Shared-control/year dependence is retained; no calibrated probability or confidence interval is manufactured from plot counts. The current [report](../data/analysis/decision_readiness_v1/net_return.json) has no monetary assumptions and abstains.

The weather experiment's initial fit preceded completion of script self-hash pinning; its provenance-only rerun produced identical predictions and scores. These are exposed exploratory results, not a fresh independent test. Each training fold contains two distinct regional weather vectors, regardless of the number of plot rows.

## What remains dependent on evidence

| Gate | Current state | Evidence required before proceeding |
| --- | --- | --- |
| Exact phase-water horizon | Unresolved | Actual PREPLANT/LATEFALL/SPRING sampling days and their plot/strip identities; crop planting cannot substitute for soil sampling. |
| Annual field weather assignment | Unresolved | Source-supported year-to-field coordinates. Current NASA weather is a declared regional proxy. |
| Early-decision inputs | Incomplete | Measured initial profile water, compatible depths/units and management dates. Future observed sowing water and realized crop-season weather cannot be live planting inputs. |
| Generalizable treatment contrast | Unsupported | Independent paired cover/fallow seasons, verified controls and measured following-crop yield. More pixels or repeated lab samples do not supply independent seasons. |
| Economic configuration | Not supplied | Explicit crop price, cover income, incentive, seed, establishment, termination and other additional costs; verified definitions and sources. Explicit zero is valid; missing is not zero. |
| Downside calibration | Unvalidated | Independently checked conservative yield and net-return bounds, evaluated on the complete planting-time pipeline. Three exposed years do not establish calibrated coverage. |

New source candidates are investigated separately in [the paired-data audit](PAIRED_DATA_CANDIDATES.md). No candidate is added to training merely because its title mentions yield or water. Acquisition is not evidence of eligibility. No author messages are sent by this implementation.

## Decision policy and next action

The economic calculator computes `price × (yield_after_cover − yield_after_fallow) + cover income + incentive − additional costs`, in USD/ha. Area only scales that difference to whole-field dollars. It does not optimize gross sales or claim whole-farm profit where other differential expenses are omitted.

Default allowable following-crop yield loss is **0 t/ha**. The research policy can recommend cover only if independently validated conservative bounds support positive net return and satisfy the explicitly declared yield-loss limit. With missing or unvalidated bounds it returns **abstain**, even if a point estimate is positive. No current weather/model run satisfies the promotion gate.

The next research investment is independent paired evidence and the unresolved sampling/initial-water definitions. Keep spring wheat at Mandan, winter wheat in Colorado, surface moisture and profile storage separate. A new early-water experiment needs a separate protocol and must beat persistence and training mean-change before being composed with a yield model. Do not repeat a large algorithm/feature search on the exposed three-year data.

Existing Clovis serving weights, selection pointers, API payloads and measurement meanings remain unchanged. Any eventual profile-water or yield serving endpoint needs an explicit new contract and acceptance evidence.

## Reproduce the added checks

```sh
apps/api/.venv/bin/python scripts/verify_research_replay.py
apps/api/.venv/bin/python -m unittest apps.api.tests.test_research_replay_audit apps.api.tests.test_mandan_weather_ablation apps.api.tests.test_net_return
apps/api/.venv/bin/python scripts/evaluate_net_return.py data/experiments/mandan_weather_ablation_v1/runs/20261115T143248469336Z/oof_predictions.csv --method direct_water_weather
pnpm --filter @spaceapps/web exec playwright test tests/chat-server.spec.ts tests/intel-request.spec.ts --workers=1
pnpm run build
```

Use the existing project virtual environment; Windows uses `apps/api/.venv/Scripts/python.exe`. Exact historical export reproduction requires the original runtime versions. The read-only replay audit provides data verification without pretending that environment mismatch disappeared.
