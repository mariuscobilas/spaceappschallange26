# ML research plan and continuation handoff

**Net-return follow-up (15 November 2026):** [decision-readiness checkpoint](DECISION_READINESS.md) implements the user's loss-protected net-return objective. The separate [Mandan weather ablation](MANDAN_WEATHER_ABLATION.md) is complete: added weather loses to simpler baselines, with only two independent training-season weather vectors per fold. [Net-return evaluation](NET_RETURN_EVALUATION.md) abstains without explicit monetary assumptions and validated downside bounds. Next prioritize independent paired evidence, exact sampling dates and initial-water definitions; do not promote these models. Earlier checkpoint statements below describe the state before this follow-up.

**Latest checkpoint:** [Mandan weather verification](MANDAN_WEATHER_VERIFICATION.md) is complete, with 1,461 NASA dates, no missing values and three verified wheat-season windows. Exact soil sampling days and annual point assignments remain unresolved. [Publication/model transfer](ML_PUBLICATION.md) packages the leading Colorado absolute-yield Ridge as a separate research-only refit. Next work is a new frozen Mandan retrospective weather ablation; adding weather has not yet been tested.

Updated 15 November 2026. **Start here for current ML work.** Phases 1–3 are complete as experiments. [The matched contrast evaluation](COVER_FALLOW_EVALUATION.md) finds some magnitude predictability but inadequate benefit/harm discrimination; the lowest-error method detects only 1/10 observed benefits. **Strengthen compatible paired evidence and investigate context before proceeding to an early planting model.** No farmer recommendation or model promotion is validated.

The earlier absolute-yield comparison remains in [the first evaluation](WATER_YIELD_EVALUATION.md) and [Random Forest/Gradient Boosting comparison](WATER_YIELD_MODEL_COMPARISON.md). Water + weather average season MAEs are Ridge 0.545, Random Forest 0.725 and Gradient Boosting 0.734 t/ha under fixed settings. Those absolute-yield results did not establish correct treatment ranking.

**Context/biomass follow-up is complete:** [results](COVER_FALLOW_CONTEXT_EVALUATION.md). Fixed context Ridge average season MAE is 0.551 t/ha; adding biomass/its rain interaction raises it to 0.598. Both detect zero benefits and falsely favor cover in five harms. Earlier references remain unchanged. Next prioritize independent compatible paired evidence and initial-water/management gaps, including the unresolved Mandan crosswalk. The optional 66-row nitrate and 123-row water-free sensitivities remain separate, unrun investigations; no live forecast is validated.

**Mandan linkage and first component evaluation are complete:** [linkage](MANDAN_LINKAGE.md), [results](MANDAN_EVALUATION.md). Spring-water Ridge reduces absolute yield MAE from 2.052 to 1.636 t/ha, but yield-contrast Ridge loses to training mean (0.430 versus 0.309 t/ha). Initial-to-spring Ridge also loses to the stronger mean-change baseline (primary 144.086 versus 114.107 mm); its water contrast loses to retaining the initial difference (116.590 versus 64.823 mm). Keep this spring-wheat/site/depth/phase evidence separate from Colorado. Next investigate weather/timing/location definitions before any new protocol; no model is promoted.

## 1. The problem we are solving

> Should a farmer plant a proposed cover crop on a specified date, terminate it on a specified date, and then plant a following cash crop, or leave the interval fallow to protect the following crop's water supply and yield?

The decision is **plant cover versus fallow**. It is not primarily an optimizer for terminating an already established cover crop. Planting and termination dates are inputs to the proposed strategy. Compare both strategies under the same starting conditions, irrigation and weather scenario.

For the first research stage, "result" means the **following cash crop's grain yield**. Profitability is a separate calculation and is not inferred from yield or water alone. Winter wheat is the first candidate cash crop because it has the strongest currently verified joint water/yield records; this does not establish transfer to other crops or locations.

The decision outcome of interest is `yield_after_cover - yield_after_fallow`, initially in t/ha. The water mechanism of interest is how cover management changes water accessible to the following crop and its subsequent water stress. Water at cash-crop sowing is an intermediate outcome, not a complete explanation of final yield.

### Decisions and boundaries to preserve

- **Keep the existing API payloads during this research.** Changing the ML approach does not itself require a new frontend contract. Do not silently change a 5 cm moisture field into profile water, PAW, or yield. Internal research tables are not HTTP payloads.
- Surface moisture, total profile water storage, plant-available water (PAW), relative saturation, and soil storage capacity are different variables. Keep depth, units, date and measurement definition explicit.
- Actual sowing water and realized cash-crop weather can be used to study the water–yield relationship retrospectively. They are not observations available at the earlier cover-planting decision. A deployable system would need validated intermediate predictions and weather scenarios.
- Do not claim a water-only causal effect from a water–yield correlation. Nitrogen, tillage, crop establishment, weather and other treatment effects can influence yield.
- Keep the original Clovis datasets, frozen scripts/artifacts, serving bundle, selection pointers and frontend implementation intact. Research outputs go in separate versioned locations. No promotion or deployment is part of the current work.

## 2. Current checkpoint: completed work

Read [WATER_YIELD_DATA_FEASIBILITY.md](WATER_YIELD_DATA_FEASIBILITY.md) for source links, units, limitations, acquisition details and the full proposed analysis. The machine-readable evidence is [inventory.json](../data/analysis/water_yield_research_v1/inventory.json).

| Item | Status and verified result |
| --- | --- |
| Initial project/ML review | Complete. The bundled Clovis forest has approximately 44% higher exposed-test next-day MAE than persistence. Seasonal simulations drift and clip. New split experiments did not establish a clear next-day advantage; no artifact was promoted. See [diagnosis](CLOVIS_MODEL_DIAGNOSIS.md) and [split evaluation](CLOVIS_SPLIT_MODEL_EVALUATION.md). |
| Colorado source audit | Complete. Eash workbook: 66 plots, 198 possible plot-cycles, 115 water values, 144 wheat-yield values, **88 jointly observed water/yield records**. Of those, 86 also have nitrate. |
| Matched Colorado comparisons | Complete. **68 cover records matched to 20 fallow controls**, on trial/block/tillage/cycle, with both water and yield observed. These reuse controls and are not 68 independent experiments. |
| NASA acquisition for Colorado | Complete. **2,192 daily dates for 2016–2021**, downloaded directly from NASA POWER for published Yellow Jacket coordinates. Rain, maximum/minimum temperature, humidity, wind and solar radiation; LST; no fill/nonfinite values. Units and calendar checked. |
| Colorado calendar/weather join | Complete. Exact dates verified in the author's dissertation Table S4.1; five completed wheat seasons joined to NASA weather. T2/C3 ended before harvest. See [calendar](WATER_YIELD_CALENDAR.md). |
| USDA Mandan acquisition/linkage | Follow-up complete. Both biomass releases match all 236 spring-wheat plot IDs; published water sampling is in the wheat strip. New design-supported cohort has **176 spring deep-water/yield observations, 142 matched pairs and 110 initial + spring pairs**. Nitrogen mismatch remains excluded. Read [linkage](MANDAN_LINKAGE.md); original zero-row audit remains historical. |
| USDA Beltsville check | Complete. 4,348 daily water rows in 44 system/rep/year series. Weather and potential-ET workbooks downloaded. **All 64 corn-yield cells are blank**; a fresh provider download is byte-identical. It cannot currently supply yield labels. |
| Australian Garba data | Existing process evidence: two years, profile PAW at several phases, no following-cash-crop-yield sheet in the checked workbook. Keep separate from Colorado. |
| New yield-model training | First fixed comparison complete. Water + weather improves average season MAE over weather alone in all five folds; water alone is worse than the mean baseline. Nitrate does not improve the fixed model. Five negative predictions and substantial season errors prevent farmer-use claims. See [evaluation](WATER_YIELD_EVALUATION.md). |

The Colorado joint records occupy five trial/cycle groups: T1/C1=8, T1/C2=11, T1/C3=12, T2/C1=27, T2/C2=30. T2/C3 has **zero** joint water/yield observations. Source water is **0–90 cm storage in mm**, not verified PAW. The older Colorado **water-only** benchmark's 89 pairs must not be confused with the new **water-plus-yield** cohort's 68 pairs.

### Files that already exist

| Path from repository root | Purpose |
| --- | --- |
| `scripts/audit_water_yield_data.py` | Reproducible source acquisition, integrity checks, missingness counts and join eligibility. It does not train a model. |
| `data/analysis/water_yield_research_v1/inventory.json` | Source hashes, usable counts, dates, failed linkage checks and NASA metadata. |
| `data/analysis/water_yield_research_v1/eash_plot_cycles.csv` | All 198 plot-cycles, preserving missing outcomes and unresolved calendar flags. |
| `data/analysis/water_yield_research_v1/eash_matched_water_yield_pairs.csv` | 68 matched cover/fallow comparisons. Research eligibility table, not a frozen evaluation split. |
| `data/analysis/water_yield_research_v1/beltsville_water_yield_series.csv` | Daily-series inventory; yields remain missing. |
| `data/analysis/water_yield_research_v1/mandan_spring_wheat_eligibility.csv` | Candidate linkage audit, with `candidate_*` water fields and failed plot verification. **Not approved training data.** |
| `data/raw/nasa_power_water_yield_v1/` | Two raw Colorado POWER snapshots and adjacent `.source.json` provenance records. Solar radiation is already `MJ/m^2/day`; do not blindly apply a kWh conversion. |
| `data/raw/usda_mandan_cover_2009_2012/` | Yield/treatment/management sources. Folder name reflects the initial search; **actual yield years are 2009–2011**, as verified from rows. |
| `data/raw/usda_mandan_soil_2008_2011/` | Soil-water/nitrogen sources and dictionaries; experimental year mapping is in the metadata. |
| `data/raw/usda_beltsville_weather_2023/` | Station weather, potential-ET workbooks, and fresh provider copy of the blank yield workbook. |

Snapshots and raw downloads may still be untracked. At this checkpoint, the branch was `feat/clovis-planting-advice`, HEAD `25c5952`, with local research files not committed. **Inspect the current working tree; do not assume that branch/HEAD is still current, overwrite local work, or recreate assets merely because they are untracked.** No commit/push was requested for this plan.

Verification already performed: the audit reran against its cached sources, all five exported audit files were byte-identical, and Python compilation passed. The initial project review recorded 117 backend tests passing; those tests establish software behavior, not model validity, and are not a new check performed for this documentation task.

## 3. Why these experiments are necessary

| Experiment | Question it answers | Why the answer matters |
| --- | --- | --- |
| Water-only versus simple baseline | Does measured sowing water carry useful yield information in this cohort? | Stops us building an elaborate water predictor around a variable whose usefulness we have not measured. |
| Weather-only versus water+weather | Does starting water add information beyond the cash crop's subsequent weather? | A wet or dry season can affect both water and yield; a pooled correlation can overstate water's independent predictive contribution. |
| Add nitrate on a common cohort | Does the apparent water signal remain useful when recorded nitrogen information is included? | Cover crops can affect more than water. This is a sensitivity check for an incomplete explanation, not proof of causality. |
| Matched cover-minus-fallow outcome | Can we predict the difference between the farmer's two options? | A model can predict absolute yields reasonably while still ranking cover versus fallow incorrectly. |
| Whole-season evaluation | Do the patterns transfer to seasons absent from training? | Many plot rows share weather and controls. Random row splitting would mostly test interpolation within known seasons. |
| Predicted-water/scenario-weather evaluation later | Does the complete early decision still work after intermediate prediction errors are included? | Performance using measured future intermediates is not the performance the farmer will receive. |

Failure or inconclusive results are useful: they identify whether the next investment should be better data, a different water measure, a process model, or model improvements. None of these experiments guarantees that water will predict yield well.

## 4. Work sequence, outputs, and exit conditions

### Phase 0 — source feasibility: COMPLETE

Use the audited evidence above. Do not repeat the broad dataset search or retrain the failed Clovis forest as the default next action. Resolve specific evidence gaps when needed. Mandan remains a separate linkage investigation; Beltsville remains water-process evidence without yield labels.

### Phase 1 — calendar and frozen research protocol: COMPLETE

Completed with exact sowing/harvest dates, hash-pinned offline preparation, 88 observations, 86 nitrate-complete observations, 68 matched pairs and explicit leave-season-out memberships. No month-based approximation was needed. The initial audit files remain immutable and retain their historical unresolved-calendar flags; the prepared dataset supersedes those flags with verified dates.

Created outputs:

- `docs/WATER_YIELD_CALENDAR.md`: verified dates, source evidence, retained uncertainties and chosen weather windows.
- `apps/api/app/ml/water_yield_protocol_v1.json`: targets/units, cohort, source hashes, feature allowlists, folds, fixed estimator settings, metrics and limitations.
- `data/processed/water_yield_v1/`: prepared cohort, fixed fold memberships, feature schema and manifest, produced by `apps/api/app/ml/prepare_water_yield.py`.

Protocol requirements:

1. Primary retrospective target is wheat yield in t/ha. Secondary target is matched cover-minus-fallow yield in t/ha. Do not fabricate missing yields or infer them from economic revenue.
2. Use source-supported **cash-crop seasons**, not the old benchmark's January–August pre-sowing weather. If exact dates cannot be verified, declare a source-supported month-based approximation and its limitations in advance. Do not search date windows against yield scores. T2/C3 must not acquire invented labels or an assumed crop calendar to increase sample size.
3. Predeclare a small weather feature set from the six downloaded parameters. Document each aggregation, unit, and period. Do not start with satellite feature expansion, a large hyperparameter search, or automated feature selection on the whole cohort.
4. Define mean-yield baseline, water-only, weather-only, water+weather, and water+weather+nitrate comparisons. Use a simple fixed regularized model initially. If management adjustments are included, keep them consistent across the incremental comparisons and record them explicitly.
5. Use the same rows for direct incremental comparisons. Nitrate is present in 86 of the 88 joint observations; report any restricted-cohort comparison separately instead of attributing a cohort change to a new feature.
6. Predeclare leave-one-cash-crop-season-out folds. All plots and shared controls within a season stay together; trials sharing a season stay together. This is cross-season historical validation and may train on later years to predict an earlier held-out year. A future-only chronological check is separate and must be labeled accordingly. Neither is a fresh independent final test after prior data exposure.
7. Fit scaling, imputation or other learned preprocessing only on each training fold. Exclude plot IDs, harvest grain measurements, `Yield.Stability`, revenue and other future/outcome-derived columns from predictors. Do not impute targets.

**Exit condition:** a readable calendar/protocol plus verified row memberships, source/feature definitions, and a reproducible prepared dataset. Any unresolved calendar assumption must be explicit and compatible with the claimed historical analysis. Do not silently join unverified Mandan records or reclassify stored water as PAW.

### Phase 2 — measured-water-to-yield feasibility: COMPLETE

Fixed comparisons run and tracked locally in MLflow; [results and limitations](WATER_YIELD_EVALUATION.md). Main water + weather average season MAE is 0.545 t/ha, pooled MAE 0.487; water-only average season MAE is 1.052. Nitrate sensitivity compares all methods on the same 86 rows. Evidence is useful for follow-up, with treatment ranking and farmer-use accuracy unresolved. No tuning, serving refit or promotion occurred.

Fit the fixed baseline and feature-family comparisons using the frozen folds. This is a component experiment with observed sowing water and historical weather, not an early cover-planting forecast.

Created outputs: `apps/api/app/ml/evaluate_water_yield.py`, `docs/WATER_YIELD_EVALUATION.md`, and `data/experiments/water_yield_v1/runs/20261115T103053452786Z/`. Prepared snapshot replay and 129 backend tests passed; 12 tests cover the new research pipeline.

Report out-of-fold predictions, MAE/RMSE in t/ha, signed bias, baseline improvement, and errors for every held-out season and treatment group. Keep pooled R2 secondary; a good pooled score can hide bad within-season comparisons. Record missingness and fitted preprocessing for each fold.

Use local MLflow as in the existing project, with separate runs for fixed configurations. Record data/protocol/code hashes, git state, exact runtime package versions, seeds, fold memberships and predictions. No model promotion or all-data serving refit follows automatically.

**Exit condition:** a reproducible report answering whether water adds predictive value beyond weather, how consistent that result is across seasons, and how the nitrate sensitivity changes it. Classify the evidence as useful for follow-up, inconclusive, or unsupported. Do not declare success solely from training accuracy, one favorable season, or a small pooled gain. With this few seasons, uncertainty may remain too large for a firm conclusion.

### Phase 3 — cover-versus-fallow comparison: COMPLETE; DECISION VALIDITY UNRESOLVED

See [COVER_FALLOW_EVALUATION.md](COVER_FALLOW_EVALUATION.md). `cover_fallow_protocol_v1.json` and `evaluate_cover_fallow.py` evaluate 11 fixed methods on 68 pairs/20 controls with whole-season folds. Run: `data/experiments/cover_fallow_v1/runs/20261115T105621737490Z/`. Subtracting held-out absolute Ridge predictions gives average season MAE 0.311 t/ha versus training mean 0.476, but identifies only 1/10 benefits and falsely favors cover in two harmful cases. The predeclared direct water + weather Ridge model fails against training mean in every season. No direct model detects benefits. Verification: 142 backend tests passed; original data/code/results hashes retained.

The experiment is completed, with a negative/inconclusive decision result. This is not authorization to skip its limitations or treat Phase 4 as ready. Prioritize compatible paired seasons/sites and a separately frozen investigation of management/nitrogen/context; initial-water data gaps remain. No hyperparameter retuning against exposed scores follows automatically.

Evaluate measured `delta_yield_t_ha` alongside `delta_profile_water_mm`, using the existing matched controls. Compare against zero-difference and training-only mean-difference baselines. Preserve the same whole-season folds and report whether predicted benefit/harm agrees with measured differences, alongside errors in t/ha. Avoid percentage targets when control yields are very small.

This is a separate evaluation of the decision contrast. Do not assume Phase 2's absolute-yield accuracy establishes it. Reused controls and repeated plots must be respected in uncertainty calculations; never bootstrap the 68 pairs as independent seasons. A fitted contrast is not evidence that the entire effect operates through water.

**Exit condition:** a report on whether the model distinguishes the two options with errors small enough to justify further investigation. If most measured differences are smaller than predictive uncertainty, report that comparison as unresolved rather than force a plant/do-not-plant label.

### Phase 4 — predict intermediate water before cover planting: PENDING EVIDENCE

Only after understanding the measured water/yield relationship, build or evaluate the component that predicts cash-crop-sowing profile water for the cover and fallow strategies. Required evidence includes initial profile water, cover management, weather, soil properties and later measured profile water on compatible depths.

**Known gap:** Colorado still lacks complete initial-water/time-series labels. Mandan partially supplies initial/spring measurements, but the [first phase-water experiment](MANDAN_EVALUATION.md) did not establish a Ridge advantage over simple baselines. It targets a spring phase in spring wheat, not a precise Colorado sowing day. Next investigate weather inputs and horizon definitions in a separately frozen experiment. Clovis 5 cm moisture and Garba's two Australian years do not establish transfer; exact sampling dates and annual plot coordinates remain unresolved, and simulated labels are not independent field validation.

NASA weather and mapped soil information can supply inputs, but satellite/grid estimates are not measured treatment-specific plot targets. Any modeled initial root-zone estimate must retain its provenance and uncertainty; do not invent it from the payload's single 5 cm measurement.

**Exit condition:** held-out intermediate-water performance against simple baselines, physical/range checks, and an honest statement of crop/site/depth applicability. If data remain insufficient, document that gap rather than advance an unvalidated seasonal model.

### Phase 5 — complete decision under weather uncertainty: PENDING PHASES 3–4

Compare cover and fallow from the same starting conditions through the following cash crop's growing season. Use common historical weather scenarios; distinguish scenario cases from calibrated forecast probabilities. Propagate water-model errors into yield comparisons and evaluate the combined system on independent compatible seasons/sites when available.

The existing simulator ends at next-crop planting; a seasonal yield-risk component would also need weather during the following crop. This is an internal modeling requirement, not authorization to change API payloads. Report current limitations instead of presenting historical observed future inputs as a live forecast.

**Exit condition:** evidence that the complete early decision comparison works, not just its individual components with observed future inputs. Farmer-use thresholds, agronomic tolerances and any production promotion need their own evidence and scope. Existing experimental advice remains unvalidated until then.

## 5. How another AI should resume

1. Read root `AGENTS.md`, this plan, and [WATER_YIELD_DATA_FEASIBILITY.md](WATER_YIELD_DATA_FEASIBILITY.md). Inspect `git status` and preserve local work.
2. Read the relevant repository ML skill and model-evaluation/reproducibility guidance. Experiment-tracking guidance applies when running the comparisons. Do not spawn workers merely because an older handoff discusses them; follow the current delegation instructions.
3. Inspect `inventory.json`, the Eash source metadata and the paired table. Reuse the existing NASA snapshots and adjacent provenance instead of downloading them again.
4. Read [the completed Mandan evaluation](MANDAN_EVALUATION.md). Do not repeat its 19 fixed configurations as pending work or promote its absolute-yield improvement as decision validity. Next investigate seasonal weather, source-area representation and soil-phase horizon definitions, then freeze a new weather/scenario protocol if supported. Preserve crops/depths, failed results, shared-control folds and unverified nitrogen exclusions; do not tune against exposed scores.
5. When a phase completes, update its status here, record the protocol/run/output paths and verification, and identify the next concrete task. Keep evidence, hypotheses and proposed work separate.

From repository root on this Windows environment:

```powershell
git status --short
Get-Content docs/ML_RESEARCH_PLAN.md
Get-Content data/analysis/water_yield_research_v1/inventory.json

# Optional source-integrity replay; does not fit a model or fetch data.
apps/api/.venv/Scripts/python.exe scripts/audit_water_yield_data.py
```

Use `--fetch` only when acquiring missing source snapshots; existing checked files are reused. Changed audit results require a new `--output` directory. The API virtualenv may require sandbox escalation to access its underlying Python interpreter; do not replace the environment or weaken certificate verification to work around access failures. New Python work should use the existing dependencies; any package-manager work must use pnpm per repository rules.

## 6. Superseded directions and current completion boundary

- The 14 November frontend handoff's **termination-first** product description and instruction to defer ML describe that earlier delivery pass. The user subsequently reopened ML research and clarified the **cover-planting versus fallow** decision. Preserve frontend behavior; use this document for current ML scope.
- The earlier Clovis diagnosis proposed a moisture/history contract and lag-feature experiment. Those remain useful diagnostics, but **they are not the next task in this research track**, and they do not require changing current payloads before the water/yield feasibility study.
- Existing model-serving and provisional-advice endpoints are implementation artifacts, not evidence of scientific readiness. Passing software tests does not turn their assumptions into validated yield predictions.
- Current completion includes source auditing, NASA acquisition, calendars, prepared cohorts/folds, fixed absolute-yield/model-family comparisons, matched decisions, Mandan initial-to-spring water experiments and regional weather verification. Early water Ridge failed stronger baselines; the complete decision system remains unsupported. A research transfer refit does not validate farmer recommendations.
