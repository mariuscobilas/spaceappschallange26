# Matched cover-versus-fallow yield experiment

15 November 2026. **Some models estimate the size of the yield difference better than simple baselines, but none reliably identifies the observed cover-crop benefits. The farmer's planting decision remains unresolved.**

The target is following-wheat yield after cover minus following-wheat yield after matched fallow, in t/ha. Positive means higher observed yield after cover; negative means lower yield. These are matched experimental plots, not both outcomes measured on the same physical plot. They do not establish an individual farmer's causal treatment effect or profitability.

## Data and fixed experiment

The [protocol](../apps/api/app/ml/cover_fallow_protocol_v1.json) was frozen before contrast fitting/scoring, SHA-256 `73ab64bc76b9c4fe6043791bf614935c1b97d54e4df1ab1df8f9281f292015dc`. [The script](../apps/api/app/ml/evaluate_cover_fallow.py) uses the existing **68 pairs and 20 reused fallow controls**, matched on trial/block/tillage/cycle, across five seasons. It recomputes arm differences from the original observations and verifies source, calendar, weather and fold identities.

Every season is held out once. The cover plot and shared control have the same role in each fold. Repeated plots may recur across seasons; this is historical cross-season development evidence, with earlier outcome exposure, not a new-site or future-only final test. Source water is observed 0–90 cm storage near wheat sowing, not verified plant-available water.

Two approaches were declared:

- **Direct contrast:** predict yield difference using measured profile-water difference, with and without the six subsequent NASA weather aggregates. Test Ridge, Random Forest and Gradient Boosting using exactly the earlier fixed parameters. Scaling for Ridge is fitted on training pairs only; trees are unscaled. Training weights are equal per pair.
- **Subtract absolute yields:** subtract the earlier main-cohort water + weather model's held-out fallow prediction from its held-out cover prediction. This reuses the frozen out-of-fold predictions for all three algorithms, never all-data fitted predictions.

Baselines predict zero difference or training-fold mean difference. Predictors exclude arm yields, IDs, revenue and target-derived fields. No tuning, clipping, target imputation or new labels were introduced. Raw source and earlier experiment artifacts are unchanged.

## Yield-difference errors

Primary metric is mean of the five season MAEs, with equal season weight. All errors are t/ha. The predeclared primary learned configuration is direct Ridge with water difference + weather; other models are secondary comparisons.

| Method | Average season MAE | Pooled MAE | Balanced decision accuracy |
| --- | ---: | ---: | ---: |
| Zero difference | 0.705 | 0.669 | 50.0% |
| Training-mean difference | 0.476 | 0.380 | 50.0% |
| Direct water difference, Ridge | 0.325 | 0.313 | 49.1% |
| Direct water difference, Random Forest | 0.341 | 0.339 | 50.0% |
| Direct water difference, Gradient Boosting | 0.356 | 0.348 | 48.3% |
| **Direct water difference + weather, Ridge (primary)** | **0.715** | **0.557** | **48.3%** |
| Direct water difference + weather, Random Forest | 0.457 | 0.405 | 50.0% |
| Direct water difference + weather, Gradient Boosting | 0.450 | 0.401 | 50.0% |
| Subtract absolute yields, Ridge | **0.311** | **0.297** | 53.3% |
| Subtract absolute yields, Random Forest | 0.544 | 0.497 | 53.3% |
| Subtract absolute yields, Gradient Boosting | 0.521 | 0.452 | 55.0% |

The primary configuration fails: its average season MAE is 0.239 t/ha worse than the training-mean baseline, and it is worse in every season. We retain that result instead of changing the primary model after scoring.

Subtracting the absolute Ridge predictions has the lowest observed error among declared methods: about **35% lower average season MAE than the training-mean baseline**. It improves three seasons against that baseline and four against zero difference. Direct water-only Ridge also improves magnitude error. This supports limited predictability of the measured yield difference, especially common penalties, but does not establish a useful planting policy.

As a check for reused controls, averaging MAE equally across controls within each season, then equally across seasons, gives 0.309 t/ha for subtracting Ridge, versus 0.475 for training mean and 0.718 for the primary model. Control balancing does not reverse the conclusion; it does not create independent observations.

## Benefits are concentrated in two seasons

| Held-out harvest | Pairs | Cover benefits / harms | Training-mean MAE | Primary direct Ridge MAE | Subtracted Ridge MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2017 | 6 | 0 / 6 | 0.579 | 1.068 | 0.309 |
| 2018 | 21 | 3 / 18 | 0.409 | 0.543 | 0.331 |
| 2019 | 8 | 7 / 1 | 0.887 | 1.042 | 0.294 |
| 2020 | 24 | 0 / 24 | 0.140 | 0.230 | 0.232 |
| 2021 | 9 | 0 / 9 | 0.367 | 0.693 | 0.390 |

Across these eligible pairs, cover yield exceeds fallow in **10 cases**, is lower in **58**, and has no numerical ties. The pair-weighted mean difference is -0.610 t/ha; median absolute difference is 0.663 t/ha. These describe this complete-case Colorado cohort, not the effect of cover crops everywhere. Seven of the ten benefits occur in 2019, so extrapolating the sign of benefit across seasons is particularly difficult.

## Why low error is insufficient for the farmer's decision

For a diagnostic policy, choose cover when predicted difference is positive; otherwise choose fallow. The 1e-12 tolerance is numerical only, not an agronomic, uncertainty or profit threshold. Balanced accuracy averages benefit recall and harm recall; it prevents the dominant harm class from hiding missed benefits.

- **Always choose fallow** already gets 58/68 = **85.3% raw accuracy**, but detects none of the benefits and has 50% balanced accuracy. The zero-difference baseline uses this tie-breaking policy, while its continuous difference error remains separate.
- **Subtracted Ridge** detects only **1/10 benefits**, misses nine and wrongly chooses cover in **2/58 harmful cases**. Its raw accuracy is 83.8%, balanced accuracy 53.3%.
- **Subtracted Gradient Boosting** detects 1/10 benefits with no false cover choices in this sample: raw accuracy 86.8%, balanced accuracy 55.0%. Its apparently better raw policy score adds only one correct choice to always-fallow across this small cohort.
- **All six direct models detect zero benefits.** Some predict fallow every time; the primary model instead wrongly chooses cover in two harmful cases. Its balanced accuracy is 48.3%.

Ignoring cover costs and other services, the mean observed matched-pair yield opportunity loss relative to choosing the higher observed arm is 0.0295 t/ha for always-fallow, 0.0416 for subtracted Ridge, 0.0263 for subtracted Gradient Boosting and 0.0652 for the primary direct model. These are descriptive pair comparisons, not validated financial regret or individual counterfactual outcomes. The small observed Gradient Boosting advantage does not establish a reliable decision rule.

For additive absolute Ridge, both arms share weather and the intercept, so subtraction cancels those terms: predicted difference becomes the fold's water coefficient multiplied by observed water difference. Its good absolute-yield score therefore does not automatically translate into a rich model of treatment benefit. Non-water treatment effects and context may matter; this experiment does not identify their causal contribution.

## Conclusion and next work

**Magnitude signal: useful for follow-up. Benefit/harm discrimination: unresolved and insufficient for farmer recommendations.** Five overlapping folds, shared controls and repeated plots do not support independent-pair confidence intervals or a significance claim. Benefit detection is supported by just ten observed positives, mostly in one season. No model is promoted.

Do not build the early planting recommendation merely by connecting these components. The next investment should strengthen compatible paired water/yield evidence across seasons/sites and investigate management/nitrogen/context in a separately frozen contrast experiment. The Mandan plot crosswalk remains one specific data opportunity; it must be verified before joining. The existing gap in initial profile-water and management-time-series measurements also remains before Phase 4. Additional NASA weather alone cannot create missing treatment-specific yield or water labels. Retain current payloads and serving behavior while resolving these gaps.

## Artifacts and checks

Run: `data/experiments/cover_fallow_v1/runs/20261115T105621737490Z/`. Saved `paired_features.csv`, **748 out-of-fold predictions** across 11 methods, `results.json`, 40 baseline/direct fold metadata entries, frozen protocol, provenance and **11 local MLflow run IDs**. Absolute-model subtraction reuses previously fitted predictions; it does not create new absolute-yield fits. Local tracking: `data/experiments/cover_fallow_v1/tracking/mlflow.db`. Experiment folders are ignored by Git; this report records the findings.

**142 backend tests passed**, including eight new contrast integrity tests: signed pair arithmetic, shared-control/season isolation, decision confusion and opportunity-loss arithmetic, class imbalance, control-balanced weighting, prediction completeness and determinism, held-out target perturbation, absolute-reference identity and predictor allowlists. Source/prepared/reference hashes were checked before and after fitting. Passing tests verifies implementation, not recommendation readiness.

Runtime is unchanged: Python 3.14.4, scikit-learn 1.9.1, NumPy 2.5.4, SciPy 1.18.1 and MLflow module 3.18.0. No dependencies were installed. Existing protocols, prepared snapshots, earlier results, API payloads and serving selections remain intact.

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/evaluate_cover_fallow.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests
```

The evaluation requires the frozen prepared data and earlier model-comparison predictions. Every rerun creates a separate local experiment directory.
