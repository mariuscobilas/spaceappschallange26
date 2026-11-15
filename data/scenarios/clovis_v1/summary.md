# Clovis Task 5: historical weather scenarios

Model: **forest_depth_4**; status: **experimental_not_selected**.
Seasonal predictions are unvalidated. Read model adoption checks and scenario diagnostics before interpreting them.

| Case | Historical interval | Rain mm | Cover moisture | Fallow moisture | Final-week difference | Clipped cover/fallow days |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| dry | 2013-02-24 to 2013-10-09 | 285.80 | 0.8596 | 0.8596 | 0.000000 | 18/18 |
| typical | 2018-02-24 to 2018-10-09 | 350.76 | 1.0000 | 1.0000 | 0.000000 | 16/16 |
| very_rainy | 2025-02-24 to 2025-10-09 | 460.58 | 0.9785 | 0.9785 | 0.000000 | 39/39 |

Moisture is a volumetric fraction at 5 cm. These are end-of-planting-date simulations, not measured outcomes.

## Limitations

- Historical rainfall cases are scenarios, not forecasts or confidence intervals.
- Both options receive identical initial water, weather, and irrigation.
- Cover residue effects are not explicitly modeled; post-termination differences are experimental.
- Planting-date moisture is an end-of-day estimate; following-wheat growth is not simulated.
- No yield, money, risk category, or planting advice is calculated in Task 5.
- Cover and fallow have identical final-week estimates in at least one case. This is not evidence of a zero crop effect; inspect earlier differences and clipping before using the comparison.
- At least one trajectory hits the broad [0,1] mathematical bounds. These are not soil-specific field capacity or saturation limits; clipping does not make the trajectory agronomically valid.
- Clipping, unseen phases, and out-of-training-range feature counts are retained in each scenario's diagnostics.
- Final-test labels were not used. No model was retrained or promoted.
