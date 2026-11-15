# What to do after the first contrast experiment

**Execution update:** the user authorized this experiment and it is complete. [Results](COVER_FALLOW_CONTEXT_EVALUATION.md): context average season MAE 0.551 t/ha; adding biomass raises it to 0.598. Both miss all ten benefits and falsely favor cover in five harms. The proposal below is retained as the pre-experiment rationale, not a pending task or successful model claim.

15 November 2026. **Recommended next task: freeze and run one compact, context-aware feature ablation on the existing paired data.** Keep the same season folds and reference predictions. Diagnose missing representation before another algorithm search, then strengthen independent data. This document proposes the next experiment; no new model was fitted for this diagnosis.

The review used the ML debugging, model-evaluation, exploratory-data-analysis, feature-engineering and imbalanced-data skills. Evidence is reproducible with `scripts/diagnose_cover_fallow.py`; the read-only workbook inspection and saved-prediction analysis are recorded in [diagnosis.json](../data/analysis/cover_fallow_diagnosis_v1/diagnosis.json). Existing protocols, models and source data remain unchanged.

## What we learned by checking the actual data

| Finding | Consequence |
| --- | --- |
| Ten observed benefits reuse just six controls and occur in only two seasons. When holding out 2019, training contains three benefits from 2018 only; holding out 2018 leaves seven benefits from 2019 only. | The positive class has very little independent seasonal support. Duplicating rows or generating synthetic positives cannot add those missing regimes. |
| All ten benefits are 0.123–0.326 t/ha, median 0.201. The lowest observed contrast MAE averages 0.311 t/ha across seasons. | Magnitude error and benefit sizes are comparable. A good overall error score can still give unreliable signs. MAE is not a calibrated prediction interval. |
| Nine of ten benefits have less profile water after cover than after fallow; all ten also have lower recorded nitrate. | Water or nitrate loss alone cannot identify every beneficial case. These associations do not show that water/nitrogen are irrelevant or establish another causal mechanism. |
| Cover biomass is recorded for all 68 water/yield pairs, and all 123 yield-only pairs. Planting window, tillage and mixture identity are also available. | Relevant context was omitted from the initial contrast inputs; we can test a specific hypothesis without obtaining a new dataset first. Measured biomass is a later intermediate, not an input known before cover planting. |
| Both-arm nitrate is available for 66 of the 68 pairs, including all ten benefits. | A separate common-66 sensitivity is possible. The earlier 86-row absolute-yield nitrate experiment does not settle the matched-contrast question. Source depth/timing uncertainty remains. |
| Requiring water measurements reduced 123 yield-matched comparisons to 68. The larger cohort has 21 controls, 12 benefits and 111 harms. It adds 55 pairs but only two benefits and no new seasons. | We can investigate missingness and a separate water-free management/biomass model. We cannot treat these rows as measured-water labels or compare different cohorts as if a feature caused a score change. |

The study authors report a cover-biomass × subsequent-rainfall interaction in this same trial. That provides a concrete agronomic motivation for the next feature test, rather than selecting interactions through a broad score search. It is **not independent validation** of our proposed model. [Eash et al., 2025, Results: Productivity and Discussion](https://esajournals.onlinelibrary.wiley.com/doi/full/10.1002/ecs2.70397)

## Check ranking before treating this as only a threshold problem

The diagnosis also scores existing predictions with average precision and ROC AUC, without fitting or selecting a threshold. Average precision evaluates ranking from raw prediction scores; those scores are not calibrated probabilities. [Scikit-learn definition](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.average_precision_score.html)

For subtracted Ridge, pooled average precision is 0.552 versus benefit prevalence 0.147. However, scores come from different fold fits, so pooled ranking can conceal poor within-season discrimination. In 2018 its within-season AP is 0.467 versus prevalence 0.143 and AUC 0.870. In 2019 AP is 0.874 versus prevalence 0.875 and AUC 0.286, with only one harmful case among eight pairs. These are descriptive, unstable diagnostics, not an independent discovery or significance test.

There is some ranking information, but it is not consistent evidence that merely lowering the zero threshold will solve the decision. Never choose a threshold using these exposed outer-fold outcomes and then report the same outcomes as validation. With only one benefit season remaining in training when either positive season is held out, nested seasonal calibration is poorly supported. Inner training folds can contain no benefits. Do not manufacture confidence through random row splits or SMOTE.

## The next experiment to implement

**Question:** does information about baseline water, management and cover growth improve cross-season prediction of cover-minus-fallow wheat yield beyond measured water loss alone?

Use the existing 68 pairs as the primary common cohort. Predeclare one Ridge configuration, alpha 1, with all numeric scaling and categorical encoding fitted within each training season fold. Keep the earlier water-only direct Ridge, subtracted absolute Ridge, zero and training-mean predictions as references. Avoid an algorithm/hyperparameter search while testing the representation.

Compare two small new feature families:

1. **Water and management context:** water difference, fallow profile-water storage at wheat sowing, subsequent season rain, cover planting window and tillage. Keeping the absolute fallow water level distinguishes similar water losses starting from different storage states. These are mechanistic candidate features, not verified PAW or a causal identification adjustment.
2. **The same context plus cover growth:** add measured cover biomass and one predeclared biomass × season-rain interaction. Test whether this adds information beyond the first family. Use the existing exact wheat-season NASA rain window; do not transplant the paper's fitted rainfall threshold or coefficients, which used different weather/window definitions.

This deliberately reduces weather dimensionality from six correlated seasonal aggregates to rain for the new mechanistic comparison. All new-family comparisons must use the same rows, management covariates, fold membership and estimator. Differences from the original frozen model involve several representation changes and must not be attributed to a single variable. Within the two new families, the added biomass family is the explicit incremental comparison.

Primary report: equal-season MAE for the biomass-augmented family against water-only direct Ridge and the new context family. Also report benefit/harm recall with counts, balanced accuracy, season-level average precision where both classes exist, false cover choices, matched yield opportunity loss and control-balanced errors. Preserve all five season results and the original failures. Do not call a lower MAE successful if benefit detection still fails or harmful cover choices worsen.

Only after that primary comparison, consider two separately labeled sensitivities: add recorded nitrate on identical 66-row cohorts, and test management/biomass/weather without water on the broader 123 yield pairs. Neither is a new independent test, and neither should be silently substituted for a disappointing primary outcome.

**Interpretation boundary:** measured wheat-sowing water, nitrate and final cover biomass are unavailable at the earlier cover-planting decision. This is a retrospective component/upper-bound experiment. If those inputs help, they would themselves need predictions or explicit scenarios before farmer use. Existing HTTP payloads need no changes for this research.

## Independent evidence remains necessary

Run the focused feature experiment first because the current source supplies its inputs. In parallel with later work, prioritize more compatible paired seasons/sites with initial profile water, cover management, measured sowing water and following-crop yield. Verify the Mandan plot/strip crosswalk before linking its soil and yield releases. Preserve variation in both benefit and harm conditions rather than collecting only favorable cases.

Adding the 55 yield-only pairs supplies more treatment rows but no new climates. More NASA weather supplies covariates, not treatment-specific field labels. If the focused experiment still cannot distinguish benefits, report the current evidence as insufficient and invest in compatible measurements or a separately validated crop/water-response approach. Do not connect the current models into a claimed live planting recommendation.

## Verification

The diagnosis script verifies frozen source hashes, reconstructs all 68 original joint pair identities from the broader yield cohort, and checks 123/21/12/111 counts against an independent CSV calculation. All diagnostic input hashes are checked before and after inspection; replay is byte-identical. The source workbook is opened read-only. No model fitting, threshold search, imputation, new yield labels, deployment or serving changes occurred. The earlier 142-test result remains the last model-pipeline verification; no new full test run is claimed for this diagnostic-only task.
