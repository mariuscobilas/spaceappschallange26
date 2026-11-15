# First water/weather-to-wheat-yield experiment

Run 15 November 2026. **Measured starting water plus subsequent weather warrants further investigation. Water alone does not predict yield well across these seasons. The farmer's cover-versus-fallow decision remains unvalidated.**

The data join uses 88 Colorado plot-cycle records across five wheat harvest seasons, with exact sowing/harvest dates verified in [the crop calendar](WATER_YIELD_CALENDAR.md). Weather comes directly from the cached NASA POWER downloads; water and yield labels come from the Eash field workbook. The 2,192 weather dates are inputs, not 2,192 independent yield observations.

## Fixed experiment

The [protocol](../apps/api/app/ml/water_yield_protocol_v1.json) was written before fitting, SHA-256 `de6db5488acc6d6697a1b362bac2e9d471f6edd3c49805614deadc038bb7d78a`. [Preparation](../apps/api/app/ml/prepare_water_yield.py) pins nine source hashes and exports observations, exclusions, weather, pairs, feature allowlists and explicit folds to [water_yield_v1](../data/processed/water_yield_v1/manifest.json).

Each fold holds out an entire harvest season. Predictors are measured 0–90 cm profile water near sowing and/or six season-weather aggregates. All learned models use [Ridge regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html), alpha=1, SVD solver, with [standard scaling](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html) fitted only on training rows. The baseline predicts training-fold mean yield. There is no tuning, target imputation, management adjustment, prediction clipping or serving refit.

This is historical cross-season validation: later seasons can train a model evaluated on an earlier season. Plots recur across seasons; the split does not establish transfer to new plots or sites. Previously inspected data are not an untouched final test.

## Results

Primary metric is average held-out-season MAE, giving each season equal weight. All errors are in t/ha; smaller is better.

| Inputs/model, main 88 rows | Average season MAE | Pooled MAE | Pooled RMSE |
| --- | ---: | ---: | ---: |
| Training mean | 0.929 | 0.702 | 0.951 |
| Water only | 1.052 | 0.863 | 1.120 |
| Weather only | 1.056 | 1.031 | 1.150 |
| Water + weather | **0.545** | **0.487** | **0.585** |

The combined model reduces the primary error by about **41% versus the mean baseline**. Adding water to weather reduces average season MAE by 0.510 t/ha and improves all five seasons. Water alone is worse than the mean baseline overall. These comparisons support a conditional predictive signal; they do not establish that water alone explains yield or causes the entire treatment effect.

| Held-out harvest | Rows | Mean baseline MAE | Weather MAE | Water + weather MAE |
| --- | ---: | ---: | ---: | ---: |
| 2017 | 8 | 2.437 | 1.461 | 0.837 |
| 2018 | 27 | 0.487 | 0.911 | 0.450 |
| 2019 | 11 | 0.490 | 1.411 | 0.870 |
| 2020 | 30 | 0.497 | 1.166 | 0.422 |
| 2021 | 12 | 0.732 | 0.331 | 0.148 |

The combined model is worse than the simple baseline in 2019. Its pooled signed bias is +0.048 t/ha, but season biases range from -0.837 to +0.870 t/ha. Pooled R² is 0.530, while within-season R² is negative in four of five seasons. It produces **five negative yield predictions**, all in 2018; weather-only produces 27. These raw predictions are retained rather than silently corrected after evaluation.

## Nitrate sensitivity on identical rows

All feature families were rerun on the same 86 nitrate-complete records. Compare these rows with each other, not with the full-cohort scores.

| Inputs/model, common 86 rows | Average season MAE | Pooled MAE |
| --- | ---: | ---: |
| Training mean | 0.944 | 0.647 |
| Water only | 1.051 | 0.800 |
| Weather only | 1.095 | 1.040 |
| Water + weather | 0.583 | 0.504 |
| Water + weather + nitrate | 0.638 | 0.538 |

Adding nitrate worsens average season MAE by 0.055 t/ha and improves only two seasons. This fixed additive model did not benefit from the recorded nitrate variable. It does not show that nitrogen is agronomically irrelevant or remove confounding. Measurement timing/depth, limited sample size and missing covariates still matter.

## Interpretation and next experiment

Evidence classification: **useful for follow-up**, with farmer-use accuracy and treatment ranking unresolved. Only five seasonal weather profiles are available; a training fold contains just four distinct weather profiles for six weather variables. Regularization makes fitting possible but does not create independent climate information. All five folds overlap in training data; the recorded standard deviation of the water-addition MAE changes (0.211 t/ha) is descriptive, not a confidence interval. No significance or calibrated forecast-uncertainty claim follows.

The next experiment must evaluate **cover-minus-fallow yield differences**, using the 68 matched comparisons and their 20 reused controls. Compare against zero difference and training-only mean difference, preserve whole-season folds, and assess both difference error and benefit/harm agreement. Absolute-yield improvement does not establish correct treatment ranking. Do not tune this experiment against the reported seasons or interpret measured-water/realized-weather performance as a live planting forecast.

## Artifacts and verification

Run: `data/experiments/water_yield_v1/runs/20261115T103053452786Z/`. Outputs: `results.json`, `oof_predictions.csv` (782 rows), `fold_models.json` (45 fold fits), `protocol.json`, `provenance.json` and nine local MLflow run IDs in `tracking_runs.json`. Tracking database: `data/experiments/water_yield_v1/tracking/mlflow.db`. Experiment directories are ignored by Git; this report and the prepared dataset preserve the reviewable result. No model weights were published.

Runtime: Python 3.14.4; scikit-learn 1.9.1; NumPy 2.5.4; SciPy 1.18.1; mlflow-skinny 3.18.0. The existing environment supplies all dependencies. An initial launch stopped before fitting because the tracking-version lookup expected the full `mlflow` distribution; it was corrected to record the installed module/distribution without installing anything or changing the protocol.

**129 backend tests passed**, including 12 new research integrity tests: exact calendar and exclusions, weather coverage/units, repeated-control matching, whole-season membership, train-only scaling, evaluation-target isolation, immutable snapshot replay, tampering rejection, deterministic predictions and metric arithmetic. Data/protocol/preparation hashes are checked before fitting, and source/prepared hashes after evaluation. Passing tests verifies implementation, not farmer readiness.

From the repository root:

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/prepare_water_yield.py
apps/api/.venv/Scripts/python.exe apps/api/app/ml/evaluate_water_yield.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests
```

Preparation refuses conflicting existing snapshots. A new evaluation creates a separate local run; it does not overwrite the prior experiment or promote a model. Existing payloads, Clovis artifacts and selection pointers remain unchanged.
