# Colorado wheat calendar and NASA weather join

Verified 15 November 2026. Exact dates are in Lisa Eash's 2023 dissertation, [Appendix Table S4.1, printed page 196 / PDF page 206](https://api.mountainscholar.org/server/api/core/bitstreams/42a6dd40-29c2-40c5-83ba-707bc8f75239/content). The table was checked visually against a rendered PDF page. [The 2021 article, Table 2](https://www.mdpi.com/2073-4395/11/6/1102) corroborates the first three completed groups. Machine-readable dates and source checksum are in [calendar evidence](../data/raw/water_yield_calendar_v1/eash_calendar_evidence.json).

| Trial/cycle | Wheat sowing | Wheat harvest | Inclusive weather days | Joint water/yield rows |
| --- | --- | --- | ---: | ---: |
| T1/C1 | 2016-09-19 | 2017-06-20 | 275 | 8 |
| T2/C1 | 2017-09-21 | 2018-07-25 | 308 | 27 |
| T1/C2 | 2018-09-28 | 2019-08-07 | 314 | 11 |
| T2/C2 | 2019-10-23 | 2020-07-27 | 279 | 30 |
| T1/C3 | 2020-09-18 | 2021-07-27 | 313 | 12 |
| T2/C3 | 2021-09-07 | Not observed before project end | Excluded | 0 |

Use these operation dates instead of generic September/July prose or the earlier January–August pre-wheat weather benchmark. No weather window was selected using yield scores. The final T2 cycle has no fabricated harvest or yield label; its inconsistent workbook year label is retained in the original audit, while the new dataset uses this verified calendar.

NASA POWER daily snapshots cover 2016–2021 at published Yellow Jacket coordinates, requested latitude 37.533333 / longitude -108.733333, returned 37.533 / -108.733. These are gridded estimates at site coordinates, not treatment-specific plot weather. The pipeline checks hashes, location, LST time standard, date coverage, units and fill/nonfinite values before joining.

The six predeclared features are total precipitation, mean daily maximum and minimum temperature, mean relative humidity, mean wind speed and mean solar radiation, from sowing through harvest inclusive. Solar input is already MJ/m²/day. No unit conversion, ET calculation, interpolation or window tuning is applied. See [season_weather.csv](../data/processed/water_yield_v1/season_weather.csv) for the actual aggregates.

Exact soil sampling days remain unavailable per row. Water is source-defined **0–90 cm stored water in mm**, measured near wheat sowing; it is not verified plant-available water. Nitrate retains the released 0–30 cm label, with the earlier article's different depth description unresolved. Realized growing-season weather and measured sowing water support retrospective research; they are unavailable at the earlier cover-planting decision.
