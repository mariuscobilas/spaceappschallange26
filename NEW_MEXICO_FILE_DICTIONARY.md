# Clovis, New Mexico cover-crop files: column dictionary

The five files added at the repository root are the data release for [Yin et al. (2026)](https://acsess.onlinelibrary.wiley.com/doi/10.1002/vzj2.70077), a New Mexico State University field study near Clovis (34°35′ N, 103°12′ W). The root `daily.csv` and `W14_Irrigation+fied activity7312025 (1).xlsx` are byte-for-byte copies of `data/figshare_yin_daily.csv` and `data/figshare_yin_activity.xlsx`, respectively. The new `5min*.csv` files add the higher-frequency readings. They are **field-station observations**, not NASA data; NASA weather can be joined by site and date as a separate input.

## File roles

| File | Inspected rows | Meaning |
| --- | ---: | --- |
| `daily.csv` | 709 daily rows, 16 Jul 2022–23 Jun 2024 | Daily treatment soil moisture, soil temperature, and weather; easiest starting point. |
| `5min.csv` | 197,827 five-minute rows | Treatment-labelled volumetric soil moisture readings. |
| `5minSoilT.csv` | 71,729 rows | Treatment-labelled soil temperature readings. It does **not** have the same number of timestamps as `5min.csv`; join by `Time`, not by row position. |
| `5minWeather.csv` | 202,685 five-minute rows | On-site air weather, rainfall, irrigation, and combined water input. Join by `Time`. |
| `W14_Irrigation+fied activity7312025 (1).xlsx` | 40 rows in `Sheet1` | Dated operations, including planting, irrigation, sensor removal/installation, cover termination, and wheat planting. Section headings and blank rows are mixed with dated events. |

## Header decoding

For a soil measurement, the name is **`variable` + `treatment` + `nominal sensor depth in cm`**. For example, `Tsoil_Pea5` is soil temperature in the pea treatment at a nominal 5 cm sensor depth. The [article's methods](https://acsess.onlinelibrary.wiley.com/doi/10.1002/vzj2.70077) explicitly analyze 5 cm volumetric moisture; the meaning and reliability of every `30`-suffixed raw channel needs confirmation from sensor metadata before using it as validated deeper-profile water.

| Raw code | Plain meaning | Applies to |
| --- | --- | --- |
| `F` | Fallow / no cover crop | `F5`, `F30`, `Tsoil_F5`, `Tsoil_F30` |
| `Pea` | Pea cover crop | `Pea5`, `Pea30`, corresponding `Tsoil_` columns |
| `Oat` | Oat cover crop | `Oat5`, `Oat30`, corresponding `Tsoil_` columns |
| `PO` | Pea–oat mixture | `PO5`, `PO30`, corresponding `Tsoil_` columns |
| `SSM` | Six-species mixture: pea, oat, canola, barley, hairy vetch, forage radish | `SSM5`, `SSM30`, corresponding `Tsoil_` columns |
| `5`, `30` suffix | Nominal sensor depth in centimeters | Soil moisture and soil temperature columns |
| `Tsoil_` prefix | Soil temperature | `5minSoilT.csv` and `daily.csv`; values appear to be °C, but a file-level unit dictionary was not supplied |
| No prefix, e.g. `Pea5` | Volumetric soil moisture | `5min.csv` and `daily.csv`; article reports m³/m³ |

| Weather header | Plain meaning | Unit status |
| --- | --- | --- |
| `Time`, `Date` | Five-minute timestamp or daily date | Local time zone is not stated in these files; confirm before joining NASA daily UTC dates. |
| `Tmean` | Mean air temperature | Appears to be °C. |
| `RHmean` | Mean relative humidity | Appears to be %. |
| `Wmean` | Mean wind speed | Unit not explicit in supplied files; verify before ET calculation. |
| `Rain` | Rainfall over the record interval | The article describes five-minute water input in cm; verify conversion and anomalous records before use. |
| `Irr` | Irrigation over the record interval | Activity workbook gives irrigation in cm. |
| `WaT` | **Total water input = `Rain + Irr`** | Equality holds in all inspected daily and five-minute weather rows; same unit as components. |
| `SR` | Solar radiation | Unit not explicit in supplied files. Do not mix raw five-minute values with daily values without confirming aggregation/unit. |

## Treatment calendar from the activity workbook

| Date/interval | Event |
| --- | --- |
| 16 Jul–3 Nov 2022 | Sorghum observation phase. |
| 6 Nov 2022–22 Feb 2023 | First fallow phase. |
| 24 Feb 2023 | Cover crop planting and 2.54 cm irrigation; sensors had been removed the day before. |
| 10 Mar–22 May 2023 | Recorded cover-crop sensor phase; sensors reinstalled on 9 Mar. |
| 22 May 2023 | Cover crop termination. |
| 23 May–8 Oct 2023 | Second fallow phase. |
| 9 Oct 2023 | Winter wheat planting and irrigation; sensors removed for field operations. |
| 27 Oct 2023–23 Jun 2024 | Recorded wheat sensor phase; sensors reinstalled on 26 Oct. |

The crop **operation date** and the start of a **sensor phase** differ. Use the former for management timing and the latter to flag observed versus unobserved moisture. The paper says gaps during field operations were filled by linear interpolation; those rows must not be counted as independent measured validation observations.

## Quality checks before modeling

- The paper says pea–oat (`PO`) data were discarded from its analysis because the sensor malfunctioned. `PO5` is present in the raw five-minute file but has **35,409 blank cells** and **1,588 `-888.88` values**; it is absent from `daily.csv`. Exclude it until independently repaired and validated.
- `5min.csv` contains `-888.88` placeholders in `F30` (6,822) and `SSM30` (17,915), plus a few physically impossible negative moisture values. Treat placeholders and moisture outside physical bounds as missing, not as actual measurements.
- `daily.csv` has 34 missing days per listed moisture series and 83 missing days per listed soil-temperature series. Do not silently fill these for validation.
- `5minWeather.csv` has 61 literal `None` strings in `SR` and one negative `RHmean` record. `daily.csv` has one negative `SR` value. Review these before weather aggregation.
- The source study includes irrigation and only one cover-crop season at one site. It is suitable for testing short-term surface-moisture dynamics, but it does not alone validate a Kansas rainfed recommendation or predict plant-available water through a full wheat rooting profile.

**Practical first pass:** use `daily.csv` with `F5`, `Pea5`, `Oat5`, and `SSM5` as the response series; `Tmean`, `RHmean`, `Wmean`, `Rain`, `Irr`, and `SR` as candidate drivers after unit checks; and the activity workbook to mark crop phases. Keep `Rain` and `Irr` separate so a rainfed scenario can set irrigation to zero. `WaT` is a derived convenience column, not an independent observation.
