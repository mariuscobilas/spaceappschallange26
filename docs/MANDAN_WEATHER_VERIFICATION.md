# Mandan weather, timing and location verification

Verified 15 November 2026. **Regional NASA wheat-season weather is complete. Exact initial-to-spring soil-water weather windows remain unresolved.** No weather model was fitted.

The [USDA soil catalog](https://catalog.data.gov/dataset/data-from-short-term-soil-responses-to-late-seeded-cover-crops-in-a-semi-arid-environment) and [response-crop catalog](https://catalog.data.gov/dataset/data-from-late-seeded-cover-crops-in-a-semiarid-environment-overyielding-dominance-and-sub) list three longitude/latitude points: (-100.9352, 46.7801), (-100.9453, 46.7762), (-100.9256, 46.7576). No annual assignment is established. The verification policy selects the **first point for every year as a study-area proxy**, without assuming list order maps to years. POWER data are gridded estimates, not plot measurements. [NASA daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)

The management workbook was independently re-read. Planting-through-harvest windows are inclusive:

| Wheat year | Planting | Harvest | Days | Regional POWER precipitation, mm |
| --- | --- | --- | ---: | ---: |
| 2009 | 2009-05-20 | 2009-09-04 | 108 | 235.64 |
| 2010 | 2010-05-21 | 2010-09-14 | 117 | 347.94 |
| 2011 | 2011-05-17 | 2011-08-26 | 102 | 367.39 |

Soil-water metadata identifies `PREPLANT`, `LATEFALL`, `SPRING` phases without exact row-level dates. PREPLANT is before cover seeding. The catalog endpoint, 2011-05-18, is one day after verified wheat planting; it does not prove every spring row was sampled that day or establish row-level ordering. Wheat planting cannot substitute for the soil sampling day.

The primary [soil paper repository](https://digitalcommons.unl.edu/usdaarsfacpub/1563/) and [yield paper repository](https://digitalcommons.unl.edu/usdaarsfacpub/2522/) were rechecked. PDF endpoints returned HTTP 403. No new full-paper table verification or author confirmation is claimed; existing linkage evidence is unchanged.

NASA POWER was downloaded directly for **2008-01-01 through 2011-12-31: 1,461 daily dates, six variables, no missing/fill values**, explicitly in LST. Checks cover location, date sets, names, units, finite values, nonnegative rainfall/wind/solar, humidity range and temperature ordering. Variables are precipitation (mm/day), maximum/minimum temperature (C), humidity (%), wind (m/s), solar (**already MJ/m²/day**). Rainfall is summed; others are averaged over the crop season. No ET/PAW conversion or plot-specific weather claim is made.

- [Policy](../data/raw/mandan_weather_v1/verification_policy.json), [NASA snapshot](../data/raw/mandan_weather_v1/mandan_area_20080101_20111231.json), [request/provenance](../data/raw/mandan_weather_v1/mandan_area_20080101_20111231.source.json)
- [Verification and hashes](../data/analysis/mandan_weather_v1/verification.json), [season aggregates](../data/analysis/mandan_weather_v1/season_weather.csv), [script](../scripts/verify_mandan_weather.py)

Six new tests cover complete dates/aggregates, changed units, wrong location/time, invalid values/ranges, calendar corruption and the unsupported soil horizon. Offline replay is immutable and hash checked.

Next, a separately frozen Mandan-only retrospective yield ablation can test whether regional realized weather explains omitted year effects, using the existing three whole-year folds and common cohorts. Its labels are already exposed. **Adding weather has not yet been tested.** An exact phase-to-phase model needs sampling dates, or an explicitly approximate-horizon protocol and sensitivity analysis. Future realized weather is unavailable at cover planting and remains retrospective/scenario input.

```powershell
# --fetch only when the NASA snapshot is absent; otherwise fully offline:
apps/api/.venv/Scripts/python.exe scripts/verify_mandan_weather.py --fetch
apps/api/.venv/Scripts/python.exe scripts/verify_mandan_weather.py
```
