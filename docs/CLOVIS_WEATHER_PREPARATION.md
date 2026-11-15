# Clovis task 2: NASA POWER weather and frozen-label join

## Run

From the repository root, after completing task 1:

```powershell
# Fetch only missing cache blocks and prepare all outputs.
apps/api/.venv/Scripts/python.exe apps/api/app/ml/prepare_clovis_weather.py --fetch

# Rebuild offline from the same frozen cache.
apps/api/.venv/Scripts/python.exe apps/api/app/ml/prepare_clovis_weather.py

# Test both data-preparation steps; no network calls in tests.
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests -p "test_prepare_clovis*.py" -v
```

On Unix, replace `Scripts/python.exe` with `bin/python`. Inputs resolve relative to the repository, independently of the working directory.

## Source and time coverage

Use the [NASA POWER Daily Point API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), agroclimatology community (`AG`), at latitude **34.583333**, longitude **-103.2**. Download **2001-01-01 through 2025-12-31**, covering both the observed trial and the future scenario-selection history. Fetch five nonoverlapping five-year blocks, with bounded retries and timeout. Reuse successful cached blocks instead of downloading them again.

The raw-response cache is `data/weather/nasa_power/clovis_v1/`. Each JSON envelope records the request, URL, UTC fetch time, complete parsed provider payload, and SHA-256 of its canonical JSON content. It is a preserved parsed response, not the original byte stream. Each block's file hash, original header, geometry, provider messages, and unit conversions appear in the generated manifest.

NASA returns weather for a gridded product at the requested location. These are not measurements from the experimental plots. Provider `header.sources`, when present, is retained in the manifest; meteorological and solar parameters can have different native grid resolutions. No single field-scale resolution is inferred from the coordinates.

## Units and normalization

| NASA parameter | Output column | Output unit |
| --- | --- | --- |
| `PRECTOTCORR` | `rain_mm` | mm/day |
| `T2M_MAX` | `temperature_max_c` | °C |
| `T2M_MIN` | `temperature_min_c` | °C |
| `RH2M` | `humidity_pct` | % |
| `WS2M` | `wind_speed_m_s` | m/s at 2 m |
| `ALLSKY_SFC_SW_DWN` | `solar_radiation_mj_m2_day` | MJ/m²/day |

Check returned parameter metadata before normalization. Convert solar kWh/m²/day to MJ/m²/day by multiplying by 3.6; retain MJ/m²/day unchanged. Unsupported units fail. All conversions are recorded, so provider unit changes cannot silently corrupt the features.

Retain valid zeros. Missing/fill/nonfinite values, negative rain/wind/radiation, humidity outside [0,100], temperatures outside [-100,70] °C, and inverted min/max temperature mark the weather day ineligible. These are fixed structural checks, not empirically fitted thresholds. Historical invalid days remain flagged; the scenario task must exclude incomplete seasons. An ineligible or missing weather day required by a label fails the join rather than dropping a target or imputing its weather.

## Calendar and target semantics

Request **local solar time (`LST`)** explicitly. Verify that the response reports LST. NASA's LST is not a civil time zone and is not daylight saving time.

The station release has no explicit time-zone metadata. This MVP joins the source calendar date to the same NASA LST date without shifting. This is a documented alignment assumption. Do not optimize shifts using held-out moisture or describe the assumption as independently verified. A provider/author clarification could require a new version of the weather join.

For a label on day D, inputs include **moisture from D-1 and weather on D**. The target is the measured moisture change from D-1 to D. Consequently, observed-weather evaluation is a hindcast. The later recommendation simulator must supply historical scenario weather, rather than claim tomorrow's observed weather is known in advance.

## Output contract

Directory: `data/processed/clovis_weather_v1/`.

| File | Contents |
| --- | --- |
| `weather_daily.csv` | All 9,131 historical dates, six canonical weather columns, eligibility, and quality flags. |
| `train_features.csv` | Frozen training pairs plus target-day NASA weather. |
| `validation_features.csv` | Frozen validation pairs plus weather. |
| `test_features.csv` | Frozen test pairs plus weather. |
| `weather_manifest.json` | Input hashes, requests, responses' metadata, conversions, fetch times, and alignment assumption. |
| `feature_schema.json` | Candidate inputs, target, evaluation-only fields, units, and missing-value semantics. |
| `quality_report.json` | Structural checks, historical coverage, and joined-row counts. |
| `quality_report.md` | Readable result and limitations. |

The split, target, previous moisture, irrigation, and management columns are preserved exactly from task 1. Every weather row must have a unique date. Each joined pair is rechecked for the correct site and consecutive endpoints within its original partition. The source manifest hashes and task-1 row counts must still match.

Use **only `train_features.csv` to fit**. `soil_moisture_m3_m3` is current-day ground truth for evaluation, not an input. `moisture_change_m3_m3` is the target. The model task will add seasonal features and explicit treatment/phase encoding using shared training/serving transformations. Nullable management ages must be handled deliberately, not filled using held-out observations.

Same cache and label inputs produce byte-identical outputs offline. Input/cache changes require a new output directory (`--output`) and, when refreshing the provider snapshot, a new cache directory (`--cache-dir`). Default runs never overwrite an existing cache block. Task-1 artifacts remain unchanged.

## Acceptance and next task

Task 2 passes when cached weather is complete, units and response location are verified, all original pairs survive unchanged, boundary checks pass, and an offline rerun is reproducible. No moisture statistics or model scores are calculated from held-out labels during this task.

The next task is baseline feasibility: compare persistence and a training-only empirical change rule before deciding whether regression adds useful accuracy. Scenario selection and model serving remain later tasks.
