# Mandan-only yield and initial-to-spring water experiments

**Follow-up:** [weather/timing/location verification](MANDAN_WEATHER_VERIFICATION.md) supports regional crop-season weather; exact phase-to-phase windows remain unsupported. No Mandan weather model was fitted. [Research publication](ML_PUBLICATION.md) packages the separate Colorado yield Ridge without promoting a decision model.

15 November 2026. **Observed spring water improves a weak absolute-yield baseline, but the tested models do not improve cover-versus-fallow decisions. For initial-to-spring water, simple baselines outperform Ridge. No model is promoted.**

## Fixed setup and scope

The [protocol](../apps/api/app/ml/mandan_protocol_v1.json) was frozen before fitting, SHA-256 `055913c53cc08ca0529bb0306a043bda5fd111c7cad459190d54db42b5dd13dd`. The [implementation](../apps/api/app/ml/evaluate_mandan.py) uses the separate [design-supported Mandan dataset](MANDAN_LINKAGE.md) and its existing leave-one-harvest-year-out folds: 2009, 2010 and 2011. Each evaluation trains on the other two years. Every shared control stays within its year, and arm predictions used in subtraction must come from the same held-out year.

Eligibility and outcome signs were already inspected during the linkage audit. These are historical development comparisons, not a new untouched final test. No Colorado records were used. No weather was joined to guessed field coordinates or phase dates.

All fitted models are fixed Ridge regressions, alpha 1, intercept, SVD solver. Numeric scaling and, where declared, full one-hot encoding of treatment description are fitted in the training fold only. Treatment description represents the known management strategy. Plot ID, year, replication, measured biomass, late-fall water, unverified nitrogen, harvest-quality measurements and observed arm yields are excluded from predictors. There is no tuning, imputation, clipping or all-data refit.

All water targets and inputs below are **0–210 cm stored water in mm**, not verified PAW. Spring is a measurement phase near wheat establishment, not a verified sowing-day reading. The exact initial-to-spring forecast horizon is unavailable per record.

## 1. Observed spring water to absolute wheat yield

Common cohort: **176 observations**. Errors are t/ha; primary metric gives each held-out year equal weight.

| Method | Average year MAE | Pooled MAE |
| --- | ---: | ---: |
| Training-mean yield | 2.052 | 2.167 |
| Spring-water Ridge | **1.636** | **1.760** |
| Spring water + treatment Ridge | 1.674 | 1.794 |

Spring-water Ridge reduces average year MAE by about **20%** against training mean and improves all three held-out years. Adding treatment does not improve this score. Absolute errors remain large; within-year R² is negative in every year.

| Held-out year | Rows | Mean MAE | Water Ridge MAE |
| --- | ---: | ---: | ---: |
| 2009 | 55 | 2.296 | 1.694 |
| 2010 | 49 | 0.993 | 0.645 |
| 2011 | 72 | 2.866 | 2.568 |

The model's 2011 average signed bias is +2.568 t/ha. Improvement over the mean is evidence of some predictive association, not an adequate forecast or proof of a causal water effect. Growing-season weather and other conditions are omitted.

## 2. Matched cover-minus-fallow yield

Common cohort: **142 pairs using 10 controls**. Compare direct difference models with subtraction of the absolute models' held-out arm predictions. Target is cover yield minus untreated-fallow yield; errors are t/ha.

| Method | Average year MAE | Pooled MAE | Positive comparisons detected / 96 | Harmful cover choices / 46 | Balanced accuracy |
| --- | ---: | ---: | ---: | ---: | ---: |
| Zero difference | 0.327 | 0.281 | 0 | 0 | 50.0% |
| Training-mean difference | **0.309** | **0.260** | 96 | 46 | 50.0% |
| Direct water-difference Ridge | 0.430 | 0.434 | 84 | 46 | 43.8% |
| Direct water difference + treatment | 0.438 | 0.440 | 74 | 43 | 41.8% |
| Subtract absolute water Ridge | 0.473 | 0.440 | 46 | 28 | 43.5% |
| Subtract absolute water + treatment | 0.551 | 0.515 | 57 | 33 | 43.8% |

The predeclared primary direct water model is worse than the training-mean difference overall. It is almost tied in 2009 (0.4696 versus 0.4698), slightly worse in 2010 (0.341 versus 0.338), and substantially worse in 2011 (0.479 versus 0.119). All four learned contrast methods lose on average year MAE and have balanced accuracy below the constant-choice references in this sample.

The training-mean difference is positive in every fold, so its diagnostic policy always chooses cover and obtains 67.6% raw accuracy simply because 96/142 observed differences are positive. It misses every harmful case. The zero baseline chooses fallow on ties and has only 32.4% raw accuracy, but the same 50% balanced accuracy. Neither is a validated recommendation. The direct water model detects 84 positives but also recommends cover in all 46 harms; high benefit recall does not establish useful discrimination.

Mean observed matched-pair yield opportunity loss is 0.0912 t/ha for training mean, 0.1041 for direct water Ridge, 0.1727 for subtracted water Ridge and 0.1899 for always-fallow. These are sample comparisons against the higher observed arm, excluding costs and other services. They do not identify individual causal counterfactuals or statistically established treatment benefits.

Control-balanced average year MAE is 0.315 for training mean and 0.438 for direct water Ridge. Reweighting controls does not reverse the conclusion. Shared controls and three overlapping folds still prevent independent-row confidence intervals.

## 3. Initial-to-spring water prediction

Common cohort: **164 observations** containing both pre-cover and spring deep-profile water. Inputs for Ridge are initial water, optionally with the proposed treatment. No future observed biomass, late-fall water or spring water enters the predictors. Future weather is omitted. Errors are mm across the whole 2.1 m profile, not rainfall depth or plant-available water.

| Method | Average year MAE | Pooled MAE |
| --- | ---: | ---: |
| Keep initial water unchanged | 158.174 | 165.543 |
| Training-mean spring water | 136.236 | 141.102 |
| Initial water + training-average water change | **114.107** | **116.819** |
| Initial-water Ridge | 142.021 | 143.582 |
| Initial water + treatment Ridge (primary) | 144.086 | 145.483 |

The mean-change baseline learns only the average spring-minus-initial change from training years and adds it to each evaluation plot's initial value. It reduces average year MAE by about 28% versus unchanged initial water. This is a simple learned baseline, not a validated seasonal forecast.

The primary Ridge model beats persistence in only one year and loses to mean-change in **all three years**. It therefore fails the stronger baseline test, even though its pooled error is lower than persistence.

| Held-out year | Keep initial water | Mean-change baseline | Initial + treatment Ridge |
| --- | ---: | ---: | ---: |
| 2009 | 116.969 | 72.291 | 123.318 |
| 2010 | 95.396 | 106.228 | 139.585 |
| 2011 | 262.158 | 163.801 | 169.354 |

The baseline itself is worse than persistence in 2010. Three years do not establish reliable coverage or calibrated uncertainty. No exact planting-date/daily-horizon claim follows.

## 4. Initial-to-spring water difference between strategies

Common cohort: **110 pairs using eight controls**, complete at both times. This additional diagnostic tests whether absolute water-model performance translates to the cover/fallow difference. Ridge predictions are subtracted only after both arms receive same-year out-of-fold predictions from the 164-row water task. Negative water differences are valid; no yield-benefit label is assigned to extra stored water.

| Method | Average year MAE, mm | Pooled MAE, mm |
| --- | ---: | ---: |
| Zero spring-water difference | 81.440 | 86.815 |
| Retain observed initial water difference | **64.823** | **71.806** |
| Initial difference + training-average difference change | 96.232 | 98.978 |
| Subtract initial-water Ridge predictions | 76.894 | 83.162 |
| Subtract initial + treatment Ridge (primary) | 116.590 | 117.468 |

The primary model loses to retained initial difference in all three years. Initial-water Ridge also fails to beat that baseline overall. Absolute state prediction therefore has not validated the water contrast needed for the farmer's two options. Initial differences between experimental plots are also part of these empirical contrasts; they are not pure cover-management effects at identical initial conditions.

## Interpretation and next work

- **Observed water/yield association:** worth investigating, with large absolute-year errors.
- **Cover/fallow yield decision:** unsupported by the tested configurations on these held-out years.
- **Early phase-water Ridge:** no advantage over the stronger mean-change baseline.
- **Water contrast:** no advantage over retaining the initial measured difference.

Additional data made the problem testable, but did not validate the pipeline. Do not join these components into a claimed live planting recommendation or promote the lowest-error absolute model. Treatment-specific differences remain unresolved, and matched positive contrasts do not override the source study's absence of a significant overall subsequent-yield effect.

The next targeted investigation should address omitted seasonal weather and the timing/location definitions before another model search. Wheat sowing/harvest dates are available for crop-season weather; soil phases need additional evidence or a clearly declared approximation for pre-cover-to-spring weather. Regional NASA weather could be documented as a study-area estimate rather than a surveyed annual plot measurement; no year-to-coordinate assignment or exact soil-sampling day should be invented. Any future-weather features would support a retrospective/scenario experiment, not become observed inputs at cover planting. Adding weather may help, but that hypothesis is untested here.

## Artifacts and checks

Run: `data/experiments/mandan_components_v1/runs/20261115T115010739438Z/`. Contains frozen protocol, provenance, results, **2,750 out-of-fold predictions**, 57 fold metadata entries and **19 local MLflow run IDs**. The 57 entries comprise 18 Ridge fits, 27 baseline evaluations and 12 subtractions of existing out-of-fold arm predictions. Tracking: `data/experiments/mandan_components_v1/tracking/mlflow.db`. Local experiment directories are ignored by Git; this report preserves the reviewable findings.

Every task uses its own common cohort and unit. Scores in t/ha and mm are never combined into a single ranking. All actual evaluation treatment categories were present in training. Rebuilding the prepared snapshot verifies source/evidence hashes before and after fitting, and the fixed protocol and prepared-file hashes are rechecked afterward. No source data, earlier experiments, payloads or serving selections changed.

**164 backend tests passed**, including eight new checks for training-only means/changes/scalers/category discovery, evaluation-target isolation, same-year out-of-fold subtraction, shared-control/year leakage, completeness/determinism across all four tasks, exclusion of future water from early predictors, unit/control-balanced arithmetic and benefit/harm decision metrics.

Runtime: Python 3.14.4, scikit-learn 1.9.1, NumPy 2.5.4, SciPy 1.18.1 and mlflow-skinny 3.18.0. Existing dependencies were reused. No model was refitted for serving or promoted.

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/evaluate_mandan.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests
```
