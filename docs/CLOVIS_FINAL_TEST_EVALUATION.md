# Clovis frozen model: held-out test

The user authorized evaluation of the reserved test set on 15 November 2026. The existing `forest_depth_4` model was frozen before scoring and compared with persistence. No training, feature changes, candidate search, split changes, or automatic model promotion occurred in this evaluation.

**The current model did not outperform persistence.** Its next-day mean absolute error (MAE) was 44.26% higher. It also performed worse at every tested recursive horizon and within every treatment and management phase.

## Results

Cohort: **1,548 observations across 387 dates**, 11 May 2023 through 23 June 2024, with four treatments per date. The nominal test partition starts on 10 May; the first usable pair target is 11 May because both endpoints must be inside the partition. Missing/ineligible measurements remain excluded by the original protocol.

All errors below use m3/m3 at 5 cm depth; multiply by 100 for volumetric percentage points. Thus next-day MAE is approximately 1.13 percentage points for persistence and 1.63 for the model.

| Measure | Persistence | Frozen Random Forest |
| --- | ---: | ---: |
| Next-day MAE | **0.011319** | 0.016328 |
| Next-day RMSE | **0.026745** | 0.030074 |
| Absolute-moisture R2 | **0.8881** | 0.8586 |
| Daily-change R2 | approximately 0 | -0.2645 |
| One-day clipped predictions | 0 | 0 |

The absolute-moisture R2 does not establish useful daily-change prediction: persistence scores higher, and the model's daily-change R2 is negative.

| Recursive horizon | Rolling windows | Persistence endpoint MAE | Model endpoint MAE | Model clipped steps |
| --- | ---: | ---: | ---: | ---: |
| 7 days | 1,476 | **0.040701** | 0.062391 | 11 |
| 30 days | 1,200 | **0.069073** | 0.154312 | 940 |
| 90 days | 480 | **0.063291** | 0.130216 | 1,016 |

Only the initial moisture in each window is observed; later states are predictions. Actual historical weather is supplied on every step, so these are hindcast scores rather than tests of forecast-weather accuracy. Windows overlap, and treatments share dates. Clipped steps count repeated occurrences across those windows, not unique field days. Different horizons have different eligible starting dates, so the lower 90-day error than 30-day error is not evidence that longer forecasts improve.

| Management phase | Rows | Persistence MAE | Model MAE |
| --- | ---: | ---: | ---: |
| Cover period | 48 | **0.016009** | 0.019377 |
| Fallow after cover | 556 | **0.006563** | 0.017354 |
| Winter wheat | 944 | **0.013881** | 0.015568 |

The latter two phases were absent from training: **1,500 of 1,548 test rows involve unseen phases**. This limits generalization; the test nevertheless also shows worse performance on the 48 cover-period rows. These are observations from one location and crop sequence, not multiple independent seasons of evidence.

| Treatment | Rows | Persistence MAE | Model MAE |
| --- | ---: | ---: | ---: |
| Fallow | 387 | **0.010317** | 0.015494 |
| Oat | 387 | **0.010380** | 0.015405 |
| Pea | 387 | **0.013369** | 0.017817 |
| Six-species mix | 387 | **0.011209** | 0.016596 |

The existing Task 4 comparison thresholds are reported as diagnostics. Only the one-day no-clipping check passes; overall MAE improvement, per-treatment error, seven-day endpoint error, and seven-day no-clipping checks fail. The earlier validation rejection remains in effect.

## What this establishes

This test confirms that the saved model is unsuitable as the seasonal recommendation engine in its present form. It does not establish that ML is unsuitable for this problem generally. No crop recommendation, yield, profit, or causal cover-crop effect was evaluated; the ground truth is surface soil moisture.

For the MVP, a separately documented water-balance approach remains a possible alternative, but this test does not validate that alternative. It would need explicit soil/crop assumptions and its own evaluation. Tuning any method using the now-visible test results means this dataset can no longer be claimed as its untouched final test.

## Reproduce and inspect

The [frozen final-test protocol](../apps/api/app/ml/clovis_final_test_protocol.json) was saved before opening held-out labels. The [evaluation script](../apps/api/app/ml/evaluate_clovis_final_test.py) loads only the declared saved candidate and creates a separate MLflow run. The original train/validation evaluators retain their restrictions against final-test access.

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/evaluate_clovis_final_test.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests -p "test*.py" -v
```

Optional arguments: `--regression-run <trusted-saved-run>` and `--experiment-dir <output-directory>`. Reproducing this frozen evaluation does not create a fresh independent test. Different candidates are rejected by the declared candidate check.

Run identifiers:

- Frozen regression run: `e60c4eb5b91d4a13b6bce45138efb0af`.
- Model artifact SHA-256: `0ddf72d619dbf73079ec2e19dc4bd96f5cbb2700355eede7b002b74d8dabd62d`.
- Final-test MLflow run: `f269a677cdd84009be57901848e1d7b0`.
- Output: `data/experiments/clovis_final_test/runs/20261115T055117177701Z-f269a677/`.

The directory contains `test_protocol.json`, `results.json`, `provenance.json`, `test_predictions.csv`, and `findings.md`. `data/experiments/clovis_final_test/latest.json` points to the latest completed evaluation. Experiment artifacts are ignored by Git; this guide retains the numerical findings for review.

`results.json` has top-level `final_test_evaluated: true`, `test_set_now_exposed: true`, and `recommendation_ready: false`. Its nested `frozen_model` metadata describes the original Task 4 source experiment, whose historical `final_test_evaluated: false` is preserved rather than rewriting that experiment's record.

The evaluator verifies frozen source/label hashes and reconstructs the test feature join from verified cached NASA responses. It rejects changes to labels or joined features, checks identity/date boundaries and finite values, and hashes evaluation inputs before and after scoring. Saved model, training data, and train/validation selection are unchanged. Successful and failed evaluation attempts are tracked separately from the original regression experiment.

All **63 software tests passed**, including five new tests for known one-day/recursive scores, gaps and unseen phases, held-out join integrity, tampering rejection, and the original final-test access guard. These software checks are separate from the model's unsuccessful predictive comparison.
