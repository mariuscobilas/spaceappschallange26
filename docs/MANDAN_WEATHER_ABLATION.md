# Mandan retrospective weather ablation

Run on 15 November 2026 using the [protocol](../apps/api/app/ml/mandan_weather_protocol_v1.json), [preparation](../apps/api/app/ml/prepare_mandan_weather.py) and [evaluator](../apps/api/app/ml/evaluate_mandan_weather.py). Run directory: `data/experiments/mandan_weather_ablation_v1/runs/20261115T143248469336Z/`. The separate prepared snapshot is `data/processed/mandan_weather_ablation_v1/`.

**Run chronology:** the specification and first implementation were evaluated once at `20261115T143206535197Z`. After that exploratory fit, the protocol was amended to pin the hashes of the two new scripts, and a second evaluation was run at `20261115T143248469336Z`. The OOF prediction, results and fold-metadata files are byte-identical between the two runs (SHA-256 respectively `4fe5aff6ff1c8df39ea5a32b4eb5c13c5085fcf3e4b77ad6afe6fda446830e72`, `3ddb8dacda7676ddd68d444a8f1210cb1c431926474a6037e6ed9d6dfc963ecd`, and `4f835f04142dd1e3170c58f96421dcd0a4dd7cd9a2d0a923542bef3cd80e592c`). The final run has complete source and code hashes, but those self-code pins were added after the first scores were exposed; this is not a fresh untouched evaluation.

## Result

Adding realized regional wheat-season weather did not improve the observed spring-water/yield or cover-minus-fallow comparisons.

| Absolute wheat yield, t/ha | Macro year MAE | Pooled MAE |
| --- | ---: | ---: |
| Training-mean yield | 2.052 | 2.167 |
| Spring-water Ridge | **1.636** | **1.760** |
| Weather-only Ridge | 4.841 | 5.435 |
| Spring water + weather Ridge | 5.524 | 6.271 |

| Matched yield difference, t/ha | Macro year MAE | Pooled MAE | Missed benefits / 96 | Harmful cover choices / 46 | Control-balanced MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Zero difference | 0.327 | 0.281 | 96 | 0 | 0.326 |
| Training-mean difference | **0.309** | **0.260** | 0 | 46 | **0.315** |
| Direct spring-water Ridge | 0.430 | 0.434 | 12 | 46 | 0.438 |
| Direct spring-water + weather Ridge | 0.928 | 1.148 | 0 | 46 | 0.941 |
| Subtract water-only absolute Ridge | 0.473 | 0.440 | 50 | 28 | 0.479 |
| Subtract weather-only absolute Ridge | 0.327 | 0.281 | 96 | 0 | 0.326 |
| Subtract water + weather absolute Ridge | 0.441 | 0.444 | 60 | 28 | 0.440 |

The 142 observed contrasts contain 96 positive benefits and 46 negative harms, with no exact-zero outcomes. The zero and training-mean rows differ in decisions even though their overall average-year error is close: the mean difference is positive in every training fold and therefore always selects cover, missing no benefits while recommending cover for all 46 harmful observed comparisons. The direct water model also recommends cover for all 46 harms. Weather-only arm subtraction returns exactly zero because both arms receive the identical weather vector and same fitted model; its results therefore match the zero contrast. None of these retrospective predictions validates a farmer choice.

## Limits and reproducibility

The absolute cohort has 176 observations and the paired cohort has 142 contrasts. They use the existing whole-year folds 2009, 2010 and 2011. Weather is one verified study-area vector per season: six inclusive planting-to-harvest aggregates from the frozen NASA POWER snapshot. The first catalog point is a regional proxy; annual field coordinates remain unassigned. Each training fold therefore contains just two independent seasonal weather vectors, despite having many plot rows. Six correlated weather features cannot identify independent weather effects from two vectors. The fold metadata and results flag this limitation; no row-level uncertainty intervals are reported.

The feature window is realized wheat-season weather, unavailable at the earlier cover-planting decision. Spring water is measured 0–210 cm stored water, not verified PAW, and its row-level sample dates are unresolved. No exact soil dates, annual field coordinates, Colorado data, endpoint changes or serving artifacts were introduced. No model was promoted.

The final run records fold membership, training-only scaler/model parameters, OOF predictions, package versions, Python 3.14.6, source/prepared hashes and local MLflow run IDs; its inputs and protocol were rechecked after fitting. Focused tests now verify the saved arm subtractions, complete OOF coverage, shared-control fold isolation, training-only baseline/scaling, held-out-target isolation, and tampered-source rejection. Verification: `apps/api/.venv/bin/python -m unittest discover -s apps/api/tests -p 'test_mandan_weather_ablation.py'` (8 passed); offline preparation replay and evaluation completed.
