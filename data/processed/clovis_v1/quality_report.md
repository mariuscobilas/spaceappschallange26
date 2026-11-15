# Clovis data-preparation quality report

Protocol: `clovis-data-v1`. No weather download or model fitting performed.

Source: 709 dates; 2836 treatment-day rows; 2648 eligible one-day pairs.

| Partition | Dates | Rows | Eligible readings | Eligible pairs |
| --- | ---: | ---: | ---: | ---: |
| train | 282 | 1128 | 1060 | 1048 |
| validation | 14 | 56 | 56 | 52 |
| test | 411 | 1644 | 1560 | 1548 |
| gap | 2 | 8 | 8 | 0 |

## Flags (can overlap)

- `missing_moisture`: 136
- `outside_documented_sensor_window`: 140

## Verification

All source/calendar/split checks passed.
Irrigation agrees with the activity workbook: 11 events, 363.22 mm over the source period.

## Limits and next step

- Only one site and one cover-crop season; plot-days are correlated observations.
- 5 cm volumetric moisture is not rooting-profile plant-available water.
- Known operation gaps are excluded; the release has no per-value original/interpolated provenance.
- Final test includes management phases absent from the initial training window; report phase metrics separately.
- No target-distribution summaries or fitted statistics are calculated from held-out partitions.
- Time-zone alignment and NASA weather availability remain to be checked in the next task.

Next task: fetch and validate NASA daily weather. These pairs are labels, not a trained model.
