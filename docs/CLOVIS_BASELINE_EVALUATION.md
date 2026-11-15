# Clovis task 3: baseline feasibility, validation only

## Outcome

Persistence is the reference to beat. It predicts tomorrow's moisture as today's moisture. A treatment/phase average-change rule performed worse on this validation interval.

| Method | Validation moisture MAE | RMSE | Moisture R² | Daily-change R² | Seven-day endpoint MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Persistence | 0.001924 | 0.002355 | 0.9900 | -0.3574 | 0.007195 |
| Empirical daily change | 0.002596 | 0.003099 | 0.9826 | -1.3493 | 0.017593 |

MAE/RMSE units are volumetric fraction, m³/m³. Persistence's next-day MAE is approximately **0.1924 volumetric percentage points**, not a 0.1924% relative error. Its seven-day endpoint MAE is approximately 0.7195 percentage points.

These are **validation**, not final-test, scores. The validation set has 52 treatment-day observations but only 13 dates (26 April–8 May 2023), shared across four treatments in a single active-cover period. A high pooled moisture R² partly reflects persistent differences between treatment series; the negative daily-change R² shows that these baselines do not explain the changes well.

Persistence's validation MAE is approximately 0.001560 on no-water-event rows and 0.002507 on rain-event rows. No validation irrigation events are present. Per-treatment, phase, and water-event metrics and the ten largest validation errors are saved in each run's JSON. These are diagnostics, not proof of a causal rain effect.

## What was evaluated

- Read only the frozen training and validation feature files. The experiment explicitly rejects requests to read a `test` partition.
- Fit persistence (zero daily change) and empirical average change by `(treatment, management_phase)` using **training rows only**. An unseen combination uses the training-wide pooled mean change.
- Predict next-day moisture using observed previous-day moisture. Both methods use a common physical [0,1] bound and report clipping/fallback counts.
- Select the reference by lowest validation next-day moisture MAE. Exact ties prefer persistence.
- Evaluate all contiguous seven-day validation windows, using an observed initial state and predicted state for subsequent days. There are 28 overlapping treatment-windows, not 28 independent experiments.
- Report thirty-day validation performance as unavailable: 13 observed validation dates cannot support it. The final test is not borrowed to fill this gap.

No NASA weather parameter enters either baseline's prediction. This makes them useful controls but insufficient for the planned dry/typical/rainy comparisons: changing weather alone does not change their simulated outcomes. Weather-aware regression still needs to demonstrate useful improvements, particularly on water events and recursive stability.

## Next regression gate

The agreed 5% improvement requirement gives a validation MAE ceiling of **0.001828065 m³/m³**. The next task will evaluate the small preplanned regression set against this reference, with segment and stability checks. If it does not improve the baseline, report that result and revisit the scenario method rather than claim ML adds predictive value.

Do not open the final test until the method/configuration is frozen. This task establishes no measured crop-recommendation, yield, financial, or seasonal forecasting accuracy.

## Run and reproduce

Install the API requirements, which now include the lightweight MLflow tracking client plus SQLAlchemy/Alembic for a local SQLite backend:

```powershell
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
apps/api/.venv/Scripts/python.exe apps/api/app/ml/clovis_baselines.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests -p "test_clovis_baselines.py" -v
```

On Unix, replace `Scripts/python.exe` with `bin/python`. No network access is needed for experiments after dependencies and prepared data are available.

`data/experiments/clovis_baselines/latest.json` points to the most recent successful run directory. Each attempt gets a new directory and MLflow parent run. Each candidate gets a child run. This folder is ignored by Git; a rerun does not overwrite an earlier experiment.

| Artifact | Contents |
| --- | --- |
| `provenance.json` | Code commit, worktree state, script/input hashes, package versions, split counts, selection policy, and seed 42. |
| `results.json` | Candidate metrics, seven/thirty-day rollout results, error examples, reference selection, and next regression gate. |
| `validation_predictions.csv` | Ground truth and predictions for validation, including water-event values and error/clip/fallback fields. |
| `persistence.json`, `empirical_change.json` | Small fitted JSON baselines; no binary model or held-out fitted statistics. |
| `reference_baseline.json` | Selected reference for the next regression comparison. |
| `findings.md` | Readable metrics and limitations. |
| `failure.json` | Failed attempt's error and MLflow ID, when a failure occurs. |

[MLflow tracking](https://mlflow.org/docs/latest/ml/tracking/) stores parameters, metrics, status, and artifacts locally using SQLite at `data/experiments/clovis_baselines/tracking/mlflow.db`. The code uses an explicit local tracking URI, without a remote account or server. Run IDs/timestamps differ on reruns; fitted baseline parameters and prediction metrics are deterministic for unchanged inputs. Inspect runs programmatically with `MlflowClient` using the URI recorded in `results.json`; the installed skinny client does not provide the full tracking UI server.

Final-test feature files are not opened or hashed by the baseline experiment. The data preparation step previously created those files, but no final-test target analysis or model evaluation is performed here. Future training must continue to use the split and feature definitions already documented.
