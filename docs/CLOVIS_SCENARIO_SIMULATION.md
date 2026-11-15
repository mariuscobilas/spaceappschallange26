# Clovis Task 5: historical weather scenarios

After Task 5, the user authorized a separate [held-out model evaluation](CLOVIS_FINAL_TEST_EVALUATION.md). It confirmed worse performance than persistence. The test set is now exposed; Task 5's inference and tests still do not open held-out labels.

Subsequent [source aggregation diagnosis](CLOVIS_MODEL_DIAGNOSIS.md) confirmed that the moisture targets are daily averages, not end-of-day readings. Task 5's end-of-day wording below records its original assumption and requires a versioned correction. Its outputs should not be interpreted as validated instantaneous soil states.

## Result and readiness

The scenario engine runs three complete historical weather sequences through the following wheat planting date. Each case compares the requested cover with fallow, using the same starting moisture, weather, and irrigation. It loads the saved model without training or fetching weather.

**The simulation infrastructure works; the current model is unsuitable for seasonal planting advice.** The saved `forest_depth_4` remains `experimental_not_selected`. It previously failed the validation adoption checks, and the seasonal rollouts have no ground-truth evaluation. The response always has `recommendation_ready: false`.

The [example request](../examples/clovis_scenario_request.json) starts with 0.25 m3/m3 on 23 February 2027, plants pea on 24 February, terminates on 22 May, and plants winter wheat on 9 October. It uses no irrigation. Each trajectory has 228 simulated days.

| Case | Historical weather interval | Rain, mm | Actual rainfall percentile | Cover/fallow moisture at wheat planting | Clipped days, each option |
| --- | --- | ---: | ---: | ---: | ---: |
| Dry | 24 February–9 October 2013 | 285.80 | 11.11 | 0.8596 / 0.8596 | 18 |
| Typical | 24 February–9 October 2018 | 350.76 | 50.00 | 1.0000 / 1.0000 | 16 |
| Very rainy | 24 February–9 October 2025 | 460.58 | 88.89 | 0.9785 / 0.9785 | 39 |

These moisture values demonstrate the rollout failure, not believable field water estimates. All cases drift toward the broad mathematical upper bound. The model has small earlier cover/fallow differences (maximum absolute differences approximately 0.00360, 0.00545, and 0.00128 m3/m3 respectively), but the final-week differences are zero after the paths converge. This does not establish that cover crops have no effect.

Each option also passes through 140 days in a management phase absent from training. Counts of unseen phases, clipped predictions, and features beyond training ranges remain in the output. The bounds [0,1] are not soil-specific porosity, field capacity, or saturation estimates.

## Run

Prerequisites are the Task 2 cached NASA POWER history and the Task 4 saved regression run. See [weather preparation](CLOVIS_WEATHER_PREPARATION.md) and [regression evaluation](CLOVIS_REGRESSION_EVALUATION.md). No additional dependencies are required beyond `apps/api/requirements.txt`.

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/clovis_scenarios.py
apps/api/.venv/Scripts/python.exe apps/api/app/ml/clovis_scenarios.py --request examples/clovis_scenario_request.json --output data/scenarios/clovis_v1
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests -p "test*.py" -v
```

`--regression-run <directory>` can pin an existing trusted local experiment. Otherwise `data/experiments/clovis_regression/latest.json` supplies its directory. Model artifacts are ignored by Git and must be reproduced or transferred separately with their provenance; the script does not download missing artifacts. Treat joblib files as trusted code.

The example took about 2.24 seconds for selection and simulation on the development machine after artifacts were loaded. This is a single local measurement, not an API latency or throughput guarantee. Artifacts should be loaded once when serving is added; concurrent throughput and startup time still need measurement.

## Request contract

`ScenarioRequest` and `IrrigationEvent` are Pydantic models in [clovis_scenarios.py](../apps/api/app/ml/clovis_scenarios.py). This is the local inference contract; no new HTTP endpoint is added in Task 5.

| Field | Requirement and meaning |
| --- | --- |
| `site_id` | Only `clovis_nm`; defaults to it. Coordinates come from the frozen Clovis protocol. |
| `decision_date` | Required `YYYY-MM-DD`. Initial moisture represents the end of this day. |
| `initial_soil_moisture_m3_m3` | Optional finite numeric fraction in [0,1], e.g. `0.25`, not `25`. Null/omitted uses the documented training default. Numeric strings and booleans are rejected. |
| `cover_crop` | Required: `pea`, `oat`, or `six_species_mix`. |
| `cover_planting_date` | Required February, March, or April date. |
| `cover_termination_date` | Required May or June date. Cover is inactive beginning this day. |
| `next_crop` | Only `winter_wheat`; defaults to it. |
| `next_crop_planting_date` | Required September, October, or November date. The simulation ends at the end of this day. |
| `irrigation_schedule` | Defaults to `[]`. Each event has a unique `date` and finite numeric `amount_mm >= 0`. The same irrigation is applied to both options. |

Require `decision_date <= cover_planting_date < cover_termination_date < next_crop_planting_date`. The three crop operation dates must be in the same year. Decision-to-next-planting horizon must be 7–365 days; a decision in the previous year is supported. Irrigation dates must be after the decision and no later than next planting. Extra fields, unsupported crops/sites, invalid calendar dates, and nonfinite numbers are rejected.

These supported months constrain this trial demonstration; they are not learned planting-window recommendations.

When no initial moisture is supplied, use the median of seven training-only fallow readings from 16–22 February 2023. Its dates and training-file hash are recorded. This historical demonstration default is not a current field observation. The example explicitly supplies 0.25 so the choice is visible.

## Historical selection

The frozen [scenario protocol](../apps/api/app/ml/clovis_scenario_protocol.json) defines the selection:

1. Use cached Clovis NASA POWER daily weather for 2001–2025 in Local Solar Time. Validate cache hashes, provider metadata, normalized CSV contents, site, date coverage, and units against Task 2.
2. Map every simulated date, from decision + 1 through next planting inclusive, to the same month/day in each candidate historical interval. Preserve all six daily weather variables together.
3. Require a complete, valid, contiguous sequence with the same leap-day structure. Reject incomplete or incompatible seasons. Do not interpolate a leap day or drop a rain event. The example has 19 eligible non-leap seasons; an interval crossing 29 February in a leap target year has six eligible leap seasons.
4. Sum interval rainfall and calculate linear 10th, 50th, and 90th percentiles across eligible seasons. Choose the nearest unused complete season for dry, typical, and very rainy, in that order. Resolve equal distances with the earlier start year.
5. Report requested percentile, rainfall target, actual selected percentile, eligible season count, and an audit entry for every candidate year. Require at least three eligible seasons. If selected rainfall totals coincide, retain the cases and flag that their totals are not distinct.

The percentile describes historical interval rainfall. It is not a probability that the coming season will resemble that case, a forecast, a confidence interval, or a crop-risk probability. A dry case can still have individual wet days. Equal total rainfall would not imply equal weather sequences.

Station observation-day alignment with NASA LST is the documented Task 2 assumption; the source station timezone was not established. Input freshness is explicitly historical through 31 December 2025. This task does not fetch current moisture or a weather forecast.

## Recursive comparison

The engine loads the adopted regression if present; otherwise it loads the saved best experimental candidate and preserves its failed adoption status and validation metrics. It verifies artifact, training-data, model-code, protocol, and weather-manifest hashes against the saved run. No candidate is refitted, promoted, or adjusted based on these scenario outputs.

For each date, predict all six paths together: three weather cases times cover/fallow. Each prediction uses that day's full historical weather, planned irrigation and management, and the preceding predicted moisture. It never substitutes future observed soil moisture. The shared Task 4 feature function and fitted preprocessing remain unchanged.

Both options use fallow features before cover planting. Beginning planting, the cover option uses the requested treatment; fallow stays fallow. Null crop ages follow the fixed -1 encoding from training. Termination-day phase remains `cover_period`, matching the source preparation; the following day becomes `fallow_after_cover`. The cover-active flag is already zero on termination day. Treatment identity and crop ages continue after termination; explicit residue processes are absent. Following wheat growth is not modeled, including on the final planting day.

Each case includes a persistence reference equal to the initial moisture throughout the interval. Persistence remains the measured validation benchmark, although a constant trajectory does not resolve seasonal crop effects.

## Output contract

Default output directory: `data/scenarios/clovis_v1`. Rerunning overwrites these scenario artifacts, not source weather or saved models.

| Artifact | Contents |
| --- | --- |
| `request.json` | Validated request with resolved schema defaults. |
| `results.json` | Request, model status/validation/provenance, historical weather metadata, initial-moisture provenance, selection audit, assumptions, and all three scenario results. |
| `trajectories.csv` | One row per scenario/day: simulated date, source weather date, six weather variables, irrigation, phase, cover-active flag, both moisture paths, and daily clipping/unseen-phase flags. The example has 684 rows. |
| `selection_audit.csv` | Historical candidate intervals, eligibility, rainfall, and exclusion reasons. |
| `verification.json` | Scenario code/protocol hashes, model hash, elapsed simulation time, and explicit no-final-test/no-refit flags. |
| `summary.md` | Human-readable interval/result table and observed limitations. |

Each scenario includes planting-date moisture, final-seven-day average moisture for each option, their signed difference (`cover - fallow`), minimum simulated moisture, rainfall/irrigation totals, daily trajectories, and diagnostics. All moisture values and differences use m3/m3 at the trial's 5 cm sensor depth. They are surface moisture, not root-zone water storage in millimeters.

Diagnostics count clipped days and unseen phases separately for each option. Out-of-range dictionaries count each numeric feature's violations of training minima/maxima. Maximum absolute cover/fallow differences are reported over the whole trajectory and the final week. Flags expose failed model validation, unvalidated seasonal rollout, clipping, unseen phases, extrapolation, identical whole-path/final-week predictions, and coincident selected rainfall totals where applicable. A missing flag does not establish agronomic validity.

No yield, profit, risk category, or plant/do-not-plant recommendation is produced. Scenario probabilities are not assigned.

## Verification and next task

All **58 tests** passed, including **15 scenario tests**. They cover payload boundaries, complete-season quantiles, missing/invalid historical days, leap and cross-year calendars, tie behavior, operation-day conventions, recursive state updates, equal weather/irrigation, seven-day summaries, default water, clipping and response flags, invalid model outputs, and tampered artifact rejection before deserialization.

The real-artifact integration check blocks network access, model fitting, and final-test/validation label-file reads during scenario inference. Repeated output is identical apart from the separate timing record, and source training data remains unchanged. Existing training/evaluation tests run their experiments in temporary directories; they do not replace the saved model used here.

The next planned task is the transparent risk/financial calculator. Before using simulated moisture to drive it, the current seasonal model failure must be addressed, for example with a separately documented water-balance heuristic for the MVP. A zero final-week model difference must not be converted into a claim that the cover has no yield effect. Any financial conversion remains an editable assumption, separate from learned and validated outcomes.
