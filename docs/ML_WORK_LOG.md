# ML research work log

## 15 November 2026 — weather verification and GitHub research package

- Clean staged checkout verification exposed six older Clovis tests requiring local experiment pointers. Included the original baseline/regression reports/provenance and unchanged selected forest, with `prepare_legacy_test_pointers.py` to verify hashes and recreate missing pointers without overwriting existing state. No model retraining or serving-selection change.
- The documented setup restored two missing pointers in the clean staged archive, then all 176 tests passed. Forty frozen research protocol references were checked there. Source bytes matched staged blobs, and publication scanning found no credential-shaped content, local tracking databases or files over 10 MB.

- Verified Mandan planting/harvest dates independently from the management workbook. Downloaded 1,461 NASA POWER daily dates for 2008–2011, six variables, no missing values; retained hashes/units/LST and immutable offline verification. Annual field assignment and exact soil sampling dates remain unresolved. Only regional wheat-season windows are supported; no new weather model fitted.
- Added a separate research export policy and fixed all-88-row Colorado water+weather Ridge refit. Numeric JSON weights reproduce scikit-learn predictions; original held-out scores remain separate. No API payload, Clovis serving selection or farmer-readiness claim changed.
- Packaged five exact completed run directories, source/provenance snapshots, cohorts/folds, code, reports and tests for GitHub. Local MLflow databases, caches, absolute-path latest pointers and credentials remain excluded. See `ML_PUBLICATION.md` and `MANDAN_WEATHER_VERIFICATION.md`.
- Verification: 176 backend tests (12 new), 18/18 payload fixtures, production build passed. Publication includes actual small model weights, not only training code. Next scientific task is a separately frozen Mandan retrospective weather ablation, with the unresolved early soil horizon retained.

This log records work performed, evidence, verification and the next task. The current plan is [ML_RESEARCH_PLAN.md](ML_RESEARCH_PLAN.md); source eligibility is in [WATER_YIELD_DATA_FEASIBILITY.md](WATER_YIELD_DATA_FEASIBILITY.md).

## 15 November 2026 — Phase 0 and continuation plan

- Completed the source-eligibility audit and downloaded Colorado NASA POWER weather for 2016–2021.
- Verified 88 Colorado records with both profile water and wheat yield; 68 matched cover/fallow comparisons reuse 20 controls. Retained missing labels and excluded the unverified Mandan plot join.
- Confirmed that the Beltsville provider yield workbook has no numeric corn-yield cells.
- Replayed the audit with all five output files byte-identical. Recorded the current problem, experiment rationale, boundaries and continuation instructions in the research plan and linked it from `AGENTS.md` and READMEs.
- No new yield model was trained; API payloads and serving models stayed unchanged.

## 15 November 2026 — Phase 1 started

User authorized starting the first planned work and requested ongoing notes.

- Read the current plan, source audit, ML preparation conventions, model-evaluation, feature-engineering and reproducibility guidance.
- Checked the published 2021 trial article, 2025 follow-up methods and the author's 2023 dissertation.
- Found exact management dates in dissertation Appendix Table S4.1 (printed page 196, PDF page 206), including October wheat sowing in T2/C2, August harvest in T1/C2, and no T2/C3 harvest before project end.
- Next: visually verify the source table, record the calendar with provenance, freeze the research protocol, and prepare versioned feature/fold tables without fitting models.

### Completion: Phases 1–2

User asked to prioritize ML over extended continuation notes; kept this entry brief.

- Visually checked Table S4.1, saved calendar evidence and wrote `WATER_YIELD_CALENDAR.md`.
- Froze `water_yield_protocol_v1.json` before fitting. Prepared 88 records, 86 nitrate-complete records, 68 pairs and whole-season folds with nine source checksums; no target imputation.
- Implemented and ran the fixed Ridge/mean ablation. Water + weather average season MAE: 0.545 t/ha versus mean baseline 0.929; water alone 1.052. Nitrate worsened common-cohort performance. Five negative combined-model predictions retained; no tuning/promotion.
- Saved predictions, fold scaling/coefficients, provenance and nine local MLflow runs under `data/experiments/water_yield_v1/runs/20261115T103053452786Z/`. One initial launch failed before fitting on a distribution-name lookup, corrected for existing mlflow-skinny.
- Verification: byte-identical preparation replay; deterministic prediction checks; 129 backend tests passed (12 new). Full results/limits: `WATER_YIELD_EVALUATION.md`.
- Next: Phase 3 matched yield-difference evaluation. Existing payloads, sources, Clovis artifacts and serving selections retained.

## 15 November 2026 — requested model-family comparison complete

- Froze `water_yield_model_comparison_v1.json`; tested fixed Random Forest and Gradient Boosting settings against the same Ridge feature groups, cohorts and whole-season folds. Original 782 reference predictions reproduced before tree fitting.
- Water + weather average season MAE: Ridge 0.545, Random Forest 0.725, Gradient Boosting 0.734 t/ha. Trees improve some seasons; Random Forest improves pooled MAE on the 86-row sensitivity but loses on the predeclared equal-season metric.
- Saved 1,998 predictions, 115 fold fits and 23 local MLflow runs under `data/experiments/water_yield_model_comparison_v1/runs/20261115T104457678358Z/`. Full findings: `WATER_YIELD_MODEL_COMPARISON.md`.
- Verification: 134 backend tests passed (five new comparison integrity tests). Original inputs/code/run hashes checked before and after; no tuning, source/payload/serving changes or promotion. Phase 3 remains next.

## 15 November 2026 — matched cover/fallow evaluation complete

- Froze `cover_fallow_protocol_v1.json`; implemented `evaluate_cover_fallow.py`. Tested zero/training-mean baselines, six direct contrast models and three subtracted absolute-model predictions on the same 68 pairs/20 controls and five season folds.
- Lowest average season MAE: subtracted Ridge 0.311 t/ha versus training mean 0.476. However, it finds only 1/10 benefits and falsely favors cover in two harms. The primary direct water + weather Ridge fails against training mean in every season. No direct model finds benefits. Decision performance remains unresolved.
- Saved 748 predictions, paired features, metadata and 11 MLflow runs under `data/experiments/cover_fallow_v1/runs/20261115T105621737490Z/`. Full findings: `COVER_FALLOW_EVALUATION.md`.
- Verification: 142 backend tests passed, including eight new contrast integrity tests. Source/prepared/reference hashes checked before and after; no original artifacts, payloads or serving selections changed. Next strengthen compatible paired evidence/context and resolve initial-water gaps before Phase 4; no promotion or automatic tuning.

## 15 November 2026 — ML diagnosis and next experiment recommendation

- Applied debugging, evaluation, EDA, feature-engineering and imbalance guidance. Read the study's biomass/rainfall results; inspected the source workbook read-only and saved prediction rankings without fitting or threshold tuning.
- New eligibility facts: 123 yield-only pairs/21 controls/12 benefits versus 68 water/yield pairs/20 controls/10 benefits; the expansion adds no seasons. All 68 have cover biomass; 66 have both-arm nitrate. Benefits reuse six controls, occur in two seasons and range from 0.123 to 0.326 t/ha. Nine occur with less stored water after cover.
- Saved reproducible `scripts/diagnose_cover_fallow.py` and `data/analysis/cover_fallow_diagnosis_v1/diagnosis.json`. Recommendation in `COVER_FALLOW_NEXT_EXPERIMENT.md`: freeze a compact water/management-context comparison, then add measured biomass and its rain interaction on the same 68 rows. Treat this as retrospective; seek independent paired/initial-water evidence before early forecasting.
- Source hashes and joint pair identities verified; replay byte-identical. No new models, threshold changes or API/serving changes; no new full test run claimed.

## 15 November 2026 — context/biomass experiment complete

- Froze `cover_fallow_context_protocol_v1.json`; implemented `evaluate_cover_fallow_context.py` with fold-fitted numeric scaling, category encoding and fixed Ridge alpha 1. Reused all 68 pairs and exact frozen reference summaries.
- Context average season MAE 0.551 t/ha; adding measured biomass and biomass × rain increases it to 0.598. Both find 0/10 benefits and falsely favor cover in 5/58 harms. No tuning or promotion follows this failure.
- Latest run: `data/experiments/cover_fallow_context_v1/runs/20261115T112038793966Z/`; 408 predictions, ten new fold fits, six MLflow runs. First run retained; tracking-only reference-label correction replayed with byte-identical results/predictions/metadata/features.
- Verification: 148 backend tests passed; six new context tests also passed after the logging correction. Frozen source/protocol/reference hashes verified before/after. Details: `COVER_FALLOW_CONTEXT_EVALUATION.md`. Next prioritize independent compatible pairs and initial-water/management evidence. No payload or serving changes.

## 15 November 2026 — Mandan linkage and new field-data preparation

- Acquired six small USDA provider files with provenance. Both biomass plot tables match all 236 spring-wheat response plots after cover-year alignment and match none of the other response crops. Indexed primary-paper methods locate water access tubes in the wheat strip. University PDF downloads returned 403; no full-PDF visual check or author confirmation is claimed.
- Corrected the earlier use of soil-nitrogen plot identity as a gate for water linkage. New `linkage_evidence.json` documents the design-supported water bridge; nitrogen remains excluded. Original audits, sources and Colorado artifacts are unchanged.
- Added `prepare_mandan.py` and `data/processed/mandan_linkage_v1/`: 176 spring deep-water/yield observations, 164 initial/spring/yield observations, 142 water/yield pairs and 110 initial/spring pairs. Converted cm water to mm and grain kg/ha to t/ha; retained missing layers and exact phase/depth definitions. Added whole-year memberships.
- Verification: 156 backend tests passed (eight new), and offline snapshot replay was byte-identical. No model fitting or serving/payload changes. `MANDAN_LINKAGE.md` records evidence and limits. Next freeze a separate Mandan component experiment; do not pool spring/winter wheat or claim exact sowing-day samples.

## 15 November 2026 — Mandan component experiments complete

- Froze `mandan_protocol_v1.json`; added `evaluate_mandan.py`. Ran 19 fixed configurations across observed-water yield, matched yield difference, initial-to-spring water and matched water difference, holding out complete years 2009/2010/2011.
- Absolute yield water Ridge improves average year MAE 2.052 → 1.636 t/ha. Yield-difference water Ridge loses to training mean, 0.430 versus 0.309; detects 84/96 positive contrasts but also chooses cover in all 46 harms. Initial + treatment water Ridge loses to mean-change baseline, 144.086 versus 114.107 mm. Its water-difference error is 116.590 versus 64.823 mm for retained initial difference.
- Saved 2,750 OOF predictions, 57 fold metadata entries and 19 MLflow runs under `data/experiments/mandan_components_v1/runs/20261115T115010739438Z/`. Full interpretation: `MANDAN_EVALUATION.md`. No search, future-weather inputs, all-data refit or promotion.
- Verification: 164 backend tests passed (eight new), source/prepared/protocol hashes checked before/after. Original data, Colorado results and payload/serving behavior retained. Next investigate weather and phase/location definitions before a separate new protocol; current decision validity remains unsupported.
