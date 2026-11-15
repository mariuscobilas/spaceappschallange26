# Clovis task 4: weather-aware regression validation

This document records the validation-only Task 4 experiment. A later user-authorized [held-out test on 15 November 2026](CLOVIS_FINAL_TEST_EVALUATION.md) evaluated the frozen model without retraining. The test set is now exposed; references below to keeping it closed describe the earlier experiment.

## Result

All four fixed candidates trained successfully. None passed the adoption checks, so **no regression is selected**. Persistence remains the performance reference. The shallow Random Forest is preserved as the best experimental regression, without claiming it improved the prediction.

| Method | Next-day moisture MAE | RMSE | Daily-change R² | Seven-day endpoint MAE |
| --- | ---: | ---: | ---: | ---: |
| Persistence | **0.001924** | **0.002355** | **-0.3574** | **0.007195** |
| Ridge, alpha 1 | 0.005528 | 0.006700 | -9.9809 | 0.021798 |
| Ridge, alpha 10 | 0.005028 | 0.006130 | -8.1928 | 0.017477 |
| Random Forest, depth 4 | 0.002559 | 0.003064 | -1.2962 | 0.008637 |
| Random Forest, depth 8 | 0.004397 | 0.005067 | -5.2823 | 0.022277 |

Errors are in m³/m³; multiply by 100 for volumetric percentage points. The shallow forest's next-day MAE is approximately **33% higher** than persistence, not an improvement. All regressions also exceeded the allowed per-treatment degradation and had worse seven-day endpoint MAE. None clipped on the evaluated one-day/seven-day paths.

The set still contains only 52 validation rows across 13 dates. No final-test feature/pair file was opened or evaluated by this experiment, and there was no all-data refit. We did not add more candidates after observing these scores or alter the split to improve them.

## Fixed protocol and gates

`apps/api/app/ml/clovis_regression_protocol.json` declares the four candidates and rules. It was created before the experiment:

- Ridge alpha 1 and 10.
- Random Forest: 150 trees, depth 4 or 8, minimum leaf size 10, all features available per split, one CPU worker, seed 42.
- At least 5% lower validation MAE than the reference.
- Each treatment's MAE at most 1.25 times its reference MAE.
- Seven-day endpoint MAE no worse than reference.
- No clipping during one-day or seven-day validation.

Among candidates passing every check, select the lowest validation MAE, with fixed candidate order resolving exact ties. If none pass, `selected_regression` and `selected_artifact` are null. An experimental artifact may exist without being adopted.

## Shared features and inference

`clovis_regression.py` builds features for both training and inference, wraps the fitted pipeline, supports trusted local artifact loading, and evaluates recursive forecasts.

Features:

- Previous-day moisture, treatment, and management phase.
- Irrigation and active-cover flag.
- Days since cover planting and termination.
- NASA precipitation, minimum/maximum temperature, humidity, wind, and radiation.
- Sine/cosine seasonal features calculated using the actual year length, including leap years.

Current-day observed moisture and moisture change are excluded from the feature allowlist. Metadata and partition names are also excluded. Future soil temperature is not required.

Age values that are not yet applicable become **-1**, a fixed domain marker. Numeric scaling and categorical encoding are fitted only on training data in a scikit-learn `Pipeline`/`ColumnTransformer`. Unknown but supported management phases use the encoder's ignore behavior and receive an explicit unseen-phase flag. Training-only ranges, scaler means/scales, phases, versions, and feature order are stored with each model.

The initial training interval contains no following-wheat or post-cover phase. The fitted models therefore cannot claim validation for those phases. An eventual all-data refit would need separate provenance and would not retroactively improve the measured validation scores.

Predict a daily change, add it to previous moisture, enforce common [0,1] bounds, and record clipping. In recursive evaluation, replace previous moisture with the preceding prediction at every step while forwarding that day's weather and management features. Thirty-day validation is explicitly unavailable because the validation sequence is too short.

## Reproduce

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/evaluate_clovis_regression.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests -p "test_clovis_regression.py" -v
```

Use `--baseline-run <directory>` to compare against an explicit baseline run; otherwise the current successful baseline pointer is used. The training/validation/weather input hashes must match that baseline run, and its reference MAE is recomputed before comparison.

Results are stored under `data/experiments/clovis_regression/`, which is ignored by Git. `latest.json` points to the latest successful run. Every attempt gets a new MLflow parent run and every candidate gets a child run; failures are recorded. Readiness for recommendations remains false even when an experiment finishes successfully.

Artifacts include:

- `provenance.json` and `model_protocol.json`: source/code hashes, versions, seeds, data scope, and fixed policy.
- Candidate `.joblib` pipelines, readable training metadata, and per-candidate metric/error JSON.
- `validation_predictions.csv`, `results.json`, and `findings.md`.
- `selection.json`: adopted regression or null, best experimental candidate, and artifact hash when selected.

The joblib file contains library-owned pipeline objects, avoiding script `__main__` class references. Loading checks feature order and the scikit-learn runtime version. Load only trusted artifacts because joblib deserialization can execute code. Model files have not been committed or deployed.

## What this means for the MVP

The weather-aware code works and the candidates respond to weather, but this experiment does not demonstrate predictive improvement. A simple rain-input probe is recorded as a model-sensitivity diagnostic, not evidence of a causal crop response.

The next design decision is how to produce honest weather-scenario comparisons for the hackathon: use an explicitly experimental regression or a transparent weather-driven water-balance heuristic, while retaining persistence as the measured benchmark. Financial assumptions and scenario outputs should remain labeled accordingly. The final test should stay reserved until that method is fixed.
