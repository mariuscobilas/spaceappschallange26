# Ridge, Random Forest and Gradient Boosting comparison

15 November 2026. **Ridge remains the strongest tested model on the predeclared primary metric for water + weather.** Greater model complexity did not improve average held-out-season yield error under these fixed settings. This does not rule out other settings or establish any model as ready for farmers.

## Fair comparison

The user requested testing alternative models. The [comparison protocol](../apps/api/app/ml/water_yield_model_comparison_v1.json) was fixed before fitting trees on the real cohort: SHA-256 `a7901ef8725cdb3b71a58cb60877484653076e1533f558d2b5c0f34cc9f013e3`. The [comparison script](../apps/api/app/ml/compare_water_yield_models.py) reuses the original 88 records, 86 nitrate-complete records, feature definitions, whole-season folds and metrics. It verifies the prepared snapshot and reproduces all **782 original Ridge/baseline predictions** to absolute tolerance 1e-12 before any real-data tree fitting. The original protocol, scripts, prepared data and run artifacts are unchanged.

One fixed configuration was tested for each tree family:

- [Random Forest](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html): 300 trees, maximum depth 3, minimum leaf size 5, all features available per split, bootstrap enabled, seed 42, one worker.
- [Gradient Boosting](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.GradientBoostingRegressor.html): 100 trees, learning rate 0.03, maximum depth 2, minimum leaf size 5, squared-error loss, no subsampling or early stopping, seed 42.
- Ridge retains alpha 1, SVD solver and scaling fitted within each training fold. Trees receive the same raw numeric features without scaling or imputation. No clipping or post-result parameter changes were applied.

These are conservative starting configurations, not tuned optima. There is no hyperparameter search. Because the Ridge scores were already inspected, this extension is exploratory development evidence, not an untouched final test. All 23 declared cohort/feature/model configurations are reported in the saved results.

## Primary result: water + weather, 88 rows

Errors are t/ha. Average season MAE gives each of the five seasons equal weight; lower is better.

| Model | Average season MAE | Pooled MAE | Pooled RMSE | Negative predictions |
| --- | ---: | ---: | ---: | ---: |
| Mean baseline | 0.929 | 0.702 | 0.951 | 0 |
| Ridge | **0.545** | **0.487** | **0.585** | 5 |
| Random Forest | 0.725 | 0.504 | 0.736 | 0 |
| Gradient Boosting | 0.734 | 0.509 | 0.721 | 0 |

Random Forest increases the primary error by 0.180 t/ha versus Ridge, despite improving three of five individual seasons. Gradient Boosting increases it by 0.189 t/ha and improves two seasons. Both avoid negative predictions in this run, but that advantage alone does not outweigh the measured errors or validate a planting recommendation.

| Held-out harvest | Ridge MAE | Random Forest MAE | Gradient Boosting MAE |
| --- | ---: | ---: | ---: |
| 2017 | 0.837 | 1.917 | 1.768 |
| 2018 | 0.450 | 0.395 | 0.352 |
| 2019 | 0.870 | 0.707 | 0.948 |
| 2020 | 0.422 | 0.180 | 0.195 |
| 2021 | 0.148 | 0.429 | 0.409 |

The 2017 errors matter: every held-out yield in that season (2.825–4.122 t/ha) exceeds the maximum training yield (2.030 t/ha). A standard squared-error Random Forest predicts averages of training outcomes, limiting its ability to represent that higher-yield regime. This is a diagnostic interpretation, not a reason to discard the season. Ridge also underpredicts 2017. Five weather profiles at one site remain the central data limitation.

## All feature groups

Average season MAE in t/ha; comparisons within each row use identical observations.

| Cohort | Inputs | Ridge | Random Forest | Gradient Boosting |
| --- | --- | ---: | ---: | ---: |
| Main, 88 | Water | 1.052 | 1.089 | 1.073 |
| Main, 88 | Weather | 1.056 | 0.834 | 0.874 |
| Main, 88 | Water + weather | **0.545** | 0.725 | 0.734 |
| Nitrate complete, 86 | Water | 1.051 | 1.084 | 1.079 |
| Nitrate complete, 86 | Weather | 1.095 | 0.730 | 0.869 |
| Nitrate complete, 86 | Water + weather | **0.583** | 0.670 | 0.795 |
| Nitrate complete, 86 | Water + weather + nitrate | 0.638 | 0.825 | 0.867 |

Trees improve substantially on weather-only Ridge, but neither wins the combined-input primary comparison. Adding nitrate worsens average season error for all three models on the common 86 rows. Water alone remains weak under all three algorithms; that finding is not specific to the original linear model.

There is a useful tradeoff in the 86-row sensitivity: Random Forest with water + weather has **better pooled MAE** than Ridge, 0.427 versus 0.504 t/ha, despite worse average season MAE, 0.670 versus 0.583. Larger seasons dominate pooled metrics. We retain the predeclared equal-season primary metric and disclose both results; we do not change the metric to favor a candidate.

## Consequence for the project

Keep Ridge as the reference candidate for the next experiment. We do not know which algorithm will ultimately be best, and this result does not justify endless tuning on the same five exposed seasons. No confidence interval or significance claim is supported by treating correlated folds or repeated plot rows as independent experiments.

The next research question remains whether the models predict **cover-minus-fallow yield differences** accurately enough to distinguish the farmer's two options. This comparison concerns absolute wheat yield using measured sowing water and realized weather; it does not establish treatment ranking or an early forecast. No model was promoted and no serving/API behavior changed.

## Reproduction and verification

Run: `data/experiments/water_yield_model_comparison_v1/runs/20261115T104457678358Z/`. Contains `results.json`, `oof_predictions.csv` (**1,998 predictions**), `fold_metadata.json` (**115 fold fits**, including mean fits), frozen `protocol.json`, `provenance.json` and **23 local MLflow run IDs**. Tracking database: `data/experiments/water_yield_model_comparison_v1/tracking/mlflow.db`. Experiment artifacts are local and ignored by Git; the report preserves the reviewable findings.

Runtime: Python 3.14.4, scikit-learn 1.9.1, NumPy 2.5.4, SciPy 1.18.1, mlflow-skinny 3.18.0. No dependencies were installed. Source and prepared-data hashes are checked before and after fitting; the comparison also pins the original code, protocol, prepared manifest and reference results/predictions. All runs use fixed settings and retain raw predictions. The original experiment's `latest.json` pointer remains unchanged.

**134 backend tests passed**, including five new tests for tree determinism and evaluation-target isolation, reference replay before tree fitting, identical cohort/season memberships, rejection of reference tampering and rejection of leaked folds or changed feature groups. Synthetic tests use tiny tree counts; the real experiment uses exactly the declared 300/100 settings.

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/compare_water_yield_models.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests
```

The command requires the existing frozen Phase 2 run for reference replay. It creates a separate comparison run and leaves original artifacts intact.
