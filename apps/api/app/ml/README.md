# ML work area

**Research transfer:** [publication and model selection](../../../../docs/ML_PUBLICATION.md). `research_yield_model.py` loads numeric Colorado water+weather Ridge weights from `data/model-bundles/colorado-water-weather-ridge-v1`. This research refit is separate from original cross-season scores and Clovis serving. [Mandan weather verification](../../../../docs/MANDAN_WEATHER_VERIFICATION.md) confirms NASA coverage and exact wheat seasons; soil sampling days remain unresolved.

**Current research entry point:** [ML research plan](../../../../docs/ML_RESEARCH_PLAN.md) and [matched cover/fallow evaluation](../../../../docs/COVER_FALLOW_EVALUATION.md). The objective is cover planting versus fallow while protecting following-crop water/yield, with current HTTP payloads retained. `prepare_water_yield.py` prepares the Colorado/NASA cohort; `evaluate_water_yield.py` evaluates absolute yield; `evaluate_cover_fallow.py` evaluates matched differences. Phases 1–3 experiments are complete, with decision validity unresolved. Address paired-data/context and initial-water gaps before Phase 4. No model was promoted. Earlier Clovis notes below do not supersede this plan.

`compare_water_yield_models.py` adds the fixed [Random Forest/Gradient Boosting comparison](../../../../docs/WATER_YIELD_MODEL_COMPARISON.md) without modifying the original experiment. Ridge leads the absolute-yield primary comparison; the subsequent matched evaluation shows that this does not establish correct planting choices.

`evaluate_cover_fallow_context.py` runs the completed [context/biomass follow-up](../../../../docs/COVER_FALLOW_CONTEXT_EVALUATION.md). Added context and biomass did not improve the decision result; preserve the failure and prioritize compatible independent field evidence before Phase 4.

`prepare_mandan.py` prepares the separate, [design-supported Mandan spring-wheat cohort](../../../../docs/MANDAN_LINKAGE.md). `evaluate_mandan.py` runs the completed [19 fixed component configurations](../../../../docs/MANDAN_EVALUATION.md): absolute yield improves over a weak mean baseline, but matched decisions and initial-to-spring Ridge fail stronger references. Investigate weather/timing/location definitions next; sampling phases, crops and depths differ from Colorado, nitrate linkage remains unverified and no model is promoted.

Put the Python model and inference code used by the FastAPI backend here. Keep HTTP request handling in `app/main.py`; API endpoints can import functions from this package when the model interface is defined.

Task 6 and serving are now implemented in `app/decision.py`, `app/service.py`, `app/api.py`, and `app/contracts.py`; see [the frontend handoff](../../../../docs/API_HANDOFF.md). `runtime.py` bridges the frozen standalone model modules into the package without changing their source hashes. Serving uses the existing Task 5 model and preserves its experimental status; later split-evaluation artifacts are not promoted. The historical task notes below describe their original stages.

The Clovis MVP data-preparation task is implemented in `prepare_clovis.py`, with its frozen policy in `clovis_protocol.json`. See [the data-preparation guide](../../../../docs/CLOVIS_DATA_PREPARATION.md) for commands, output schemas, split boundaries, and verification.

Task 2 is implemented in `prepare_clovis_weather.py`: cache NASA POWER 2001–2025 history and join target-day weather to the frozen labels. See [the weather-preparation guide](../../../../docs/CLOVIS_WEATHER_PREPARATION.md) for units, calendar assumptions, offline reruns, and the feature contract.

Task 3 is implemented in `clovis_baselines.py`: training-only persistence/empirical baselines, validation metrics and rollouts, and local MLflow experiment tracking. See [the baseline evaluation](../../../../docs/CLOVIS_BASELINE_EVALUATION.md) for results and commands.

Task 4 uses `clovis_regression.py` and `evaluate_clovis_regression.py` with a predeclared regression protocol. [The regression evaluation](../../../../docs/CLOVIS_REGRESSION_EVALUATION.md) records four weather-aware candidates, shared preprocessing, artifact loading, and validation rollouts. None passed adoption; persistence remains the reference. This stage kept final-test targets closed.

Task 5 uses `clovis_scenarios.py` and `clovis_scenario_protocol.json` to select complete historical weather cases and recursively compare cover/fallow through wheat planting. [The scenario guide](../../../../docs/CLOVIS_SCENARIO_SIMULATION.md) documents the typed request, outputs, leap-calendar policy, provenance checks, and tests. The saved experimental model drifts and clips on seasonal paths; readiness remains false. No financial calculator or scenario API endpoint has been added yet.

The user subsequently authorized a held-out evaluation in `evaluate_clovis_final_test.py`, with its own `clovis_final_test_protocol.json`. [Final-test findings](../../../../docs/CLOVIS_FINAL_TEST_EVALUATION.md) record worse next-day and recursive scores than persistence. The test set is now exposed. The original model and selection remain unchanged; the final-test script does not train or promote candidates.

`diagnose_clovis.py` applies training-only EDA, tree inspection, a training-only memorization check, source aggregation verification, and postmortem analysis of the already exposed results. [The diagnosis](../../../../docs/CLOVIS_MODEL_DIAGNOSIS.md) records the evidence and repair sequence. In particular, the source target is a daily mean; the earlier end-of-day assumption needs a versioned contract correction before further recommendation work.

`audit_clovis_splits.py` audits category coverage and exports separate date memberships for global chronological and phase-balanced 70/15/15 allocations. [The split audit](../../../../docs/CLOVIS_SPLIT_AUDIT.md) explains their different evaluation meanings, buffer/history rules, and verified counts. Memberships are not replacement feature tables; v1 and the saved models remain unchanged.

`evaluate_clovis_split_variants.py` materializes those memberships into `clovis_split_features_v2` and fits the same fixed forest separately on each training cohort, using shared preprocessing. [The new evaluation](../../../../docs/CLOVIS_SPLIT_MODEL_EVALUATION.md) records baseline comparisons, phase/event errors, data distributions, uncertainty, and 3/7/30-day recursive results. Artifacts and tracking are separate from v1; neither model is promoted or served.

Before adding a pipeline, decide what the model predicts, which NASA and farm data it uses, and what inputs and outputs the API needs. Training scripts, data preparation, and model artifacts can be organized here once those choices are made. Do not commit large datasets or trained model files without agreeing on how the team will store and reproduce them.
