# Clovis task 2: NASA weather join

Weather: 9131 daily records, 2001-01-01 through 2025-12-31, local solar time (LST).

| Partition | Joined pairs | Dropped |
| --- | ---: | ---: |
| train | 1048 | 0 |
| validation | 52 | 0 |
| test | 1548 | 0 |

Eligible historical weather days: 9131/9131.

All six parameters have validated units. Frozen label sources and partition boundaries are unchanged.

## Limits

- Weather is gridded, not the study's on-site sensor readings.
- Station civil-day versus NASA local-solar-day alignment remains an explicit assumption.
- Current-day observed weather is a hindcast input; future runs must use scenario weather.
- No model fitting, statistical feature selection, or held-out target analysis was performed.
