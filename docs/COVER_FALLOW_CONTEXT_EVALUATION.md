# Water/management context and cover-growth experiment

15 November 2026. **The proposed feature experiment did not improve held-out-season performance. Adding measured biomass and its rainfall interaction made average season error worse, and neither new model identified any of the ten observed cover benefits.** Preserve the earlier models as references; no new candidate is promoted.

## Fixed comparison

The [protocol](../apps/api/app/ml/cover_fallow_context_protocol_v1.json), SHA-256 `12d1523e0e7955163745db93d6e697d0189f53eb03ab63e80f5e90aa9ebb0212`, was written before fitting either new model on the real cohort. The design follows [the diagnosed proposal](COVER_FALLOW_NEXT_EXPERIMENT.md). Earlier outcomes and this trial's published analysis were already exposed, so this is exploratory development evidence, not an independent final test.

The [implementation](../apps/api/app/ml/evaluate_cover_fallow_context.py) retains exactly **68 pairs, 20 shared controls and five whole-season folds**. It reconstructs the original pair table byte-for-byte before adding source-workbook cover biomass. All 68 cover measurements are present; there is no imputation or cohort change.

Both new models use Ridge with alpha 1, intercept and SVD solver:

- **Context:** measured water difference, fallow profile-water storage near wheat sowing, exact sowing-through-harvest NASA precipitation, cover planting window and tillage.
- **Context + biomass:** the same inputs plus measured cover biomass (kg/ha) and its raw product with season rain (kg·mm/ha).

Numeric scaling and categorical encoding are fitted inside each training fold. [OneHotEncoder](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OneHotEncoder.html) uses full coding (`drop=None`) with unknown categories ignored; Ridge regularizes the category coefficients. All actual evaluation categories were present in training. Training weights remain equal per eligible pair. There is no feature, estimator, seed or threshold search, prediction clipping or target transformation.

Four frozen reference methods are reused without refitting. Their 272 predictions reproduce all earlier error/decision summaries exactly before new models are fitted. Cover plots and their shared fallow controls retain the same role in each fold.

## Results

Target: following-wheat yield after cover minus yield after matched fallow, in t/ha. Average season MAE gives each season equal weight; lower is better. Benefit and harm counts use the same numerical-zero decision rule as the first contrast experiment.

| Method | Average season MAE | Pooled MAE | Benefits detected / 10 | Harmful cover choices / 58 |
| --- | ---: | ---: | ---: | ---: |
| Zero difference | 0.705 | 0.669 | 0 | 0 |
| Training-mean difference | 0.476 | 0.380 | 0 | 0 |
| Earlier direct water-only Ridge | 0.325 | 0.313 | 0 | 1 |
| Earlier subtracted absolute Ridge | **0.311** | **0.297** | 1 | 2 |
| New context Ridge | 0.551 | 0.518 | **0** | **5** |
| New context + biomass Ridge | 0.598 | 0.523 | **0** | **5** |

Adding the biomass family increases average season MAE by **0.0467 t/ha**, about 8.5%, relative to the context model. It improves only two seasons. The biomass model is worse than the training-mean, earlier direct water-only and earlier subtracted Ridge references in every season. The context model also loses to the earlier direct water-only model in every season.

| Held-out harvest | Pairs | Context MAE | Context + biomass MAE | Earlier subtracted Ridge MAE |
| --- | ---: | ---: | ---: | ---: |
| 2017 | 6 | 0.651 | 0.705 | 0.309 |
| 2018 | 21 | 0.590 | 0.544 | 0.331 |
| 2019 | 8 | 0.962 | 0.969 | 0.294 |
| 2020 | 24 | 0.417 | 0.348 | 0.232 |
| 2021 | 9 | 0.134 | 0.421 | 0.390 |

The biomass increment improves 2018 and 2020 but particularly worsens 2021. No favorable season or secondary metric replaces the predeclared comparison.

## Decision diagnostics and control dependence

Both new models predict cover in five cases, all in 2020, where every observed paired contrast is harmful. They miss all ten benefits and have **45.7% balanced decision accuracy**, versus 50% for always-fallow and 53.3% for the earlier subtracted Ridge. These percentages are descriptive results on exposed historical folds, not estimated deployment accuracy.

Mean observed matched-pair yield opportunity loss is 0.0570 t/ha for either new model, versus 0.0295 for always-fallow and 0.0416 for earlier subtracted Ridge. This diagnostic ignores costs and other cover services; it is not a profit calculation or a validated individual counterfactual effect.

Equalizing the contribution of each control within each season gives MAE 0.553 for context and 0.600 for context + biomass, versus 0.309 for earlier subtracted Ridge. The result is not reversed by this control-balanced check. Shared controls, repeated plots and overlapping folds still prohibit treating 68 pairs or five folds as independent replicates for a confidence interval.

Average precision is also reported for the two seasons containing both outcome signs. In 2018, adding biomass reduces AP from 0.425 to 0.378, versus prevalence 0.143; in 2019 it raises AP from 0.874 to 0.909, versus prevalence 0.875 and just one harmful example. That ranking movement does not recover any benefit at the unchanged zero threshold and is not evidence for a threshold selected on these same scores. Other seasons have no beneficial cases, so their two-class AP is left unavailable.

## Interpretation and next step

This rejects the improvement hypothesis **for these fixed representations and settings on the available historical seasons**. It does not show that biomass or rainfall interactions are agronomically irrelevant. The previously reported same-trial association did not establish transfer to an unseen season. Only two seasons contain benefits, and holding out either leaves training benefits from a single season.

Changes from the old water-only model to the context model involve several inputs and encoding choices. They cannot identify which added variable caused the deterioration. Within the two new models, biomass and its interaction are a two-feature family increment; we do not attribute the score change to either term separately.

Keep the best earlier model only as an experimental reference. It still detects one of ten benefits and remains inadequate for recommendations. Prioritize compatible independent paired seasons/sites and the initial-profile-water/management gap; verifying the Mandan plot/strip linkage is one concrete data investigation, with spring wheat kept distinct from this winter-wheat trial. The proposed 66-row nitrate and 123-row water-free sensitivities remain unrun and should not substitute for the failed primary result.

Measured sowing water, final cover biomass and realized subsequent weather are future intermediates at the earlier planting decision. Even success here would not validate a live planting forecast. No API payloads, serving artifacts, selection pointers or source snapshots changed.

## Artifacts and verification

Latest run: `data/experiments/cover_fallow_context_v1/runs/20261115T112038793966Z/`. It contains the protocol, source/code/environment provenance, paired features, **408 predictions** (136 new and 272 reference), ten new fold-model metadata entries, results and six local MLflow run IDs. Tracking: `data/experiments/cover_fallow_context_v1/tracking/mlflow.db`. These local experiment folders are ignored by Git.

The first run, `20261115T111903999446Z`, is retained. A tracking-label correction distinguished frozen references from newly fitted models; no model setting or feature changed. The replay's results, predictions, fold metadata and paired features are **byte-identical** to the first run. Latest predictions SHA-256: `69c244db7b0922ce43cb2aab9ba271715802e216409a6dc5102a582fa5af310a`.

**148 backend tests passed**, including six new context checks for unchanged pair/biomass coverage, exact interaction arithmetic, train-only scaling and category discovery, unseen-category handling, evaluation-target isolation, reference rejection before fitting, OOF completeness/determinism and fold-leakage rejection. After the tracking-only correction, all six context tests passed again. Source, protocol, prepared-data and earlier-reference hashes are checked before and after evaluation. Software checks do not validate the agronomic decision.

Runtime: Python 3.14.4, scikit-learn 1.9.1, NumPy 2.5.4, SciPy 1.18.1, openpyxl 3.1.5, mlflow-skinny 3.18.0. The workbook is read-only; existing dependencies were reused.

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/evaluate_cover_fallow_context.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests
```
