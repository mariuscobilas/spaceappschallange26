# First water-debt benchmark

The executable benchmark is in [`apps/api/app/ml/benchmark.py`](apps/api/app/ml/benchmark.py). It joined the [Eash et al. Colorado trial](https://datadryad.org/dataset/doi:10.5061/dryad.6t1g1jxb0) with [NASA POWER daily weather](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) and obtained **89 matched cover-versus-fallow plot-cycle pairs across five wheat-planting years (2016–2020)**. The target is cover minus fallow water in the 0–90 cm profile at wheat planting, in millimetres. Negative means the cover treatment left less water.

All five ML models used the same rows and predictors: cover mixture, planting window, tillage, trial, and January–August weather in the wheat-planting year. Whole years were held out. Each model's small tuning grid was searched using training years only.

| Model | Held-out R² | MAE (mm) | RMSE (mm) | Mean error (mm) |
| --- | ---: | ---: | ---: | ---: |
| Treatment-window mean (reference) | -0.045 | **20.27** | **24.81** | -0.45 |
| Ridge | -0.911 | 28.53 | 33.55 | -1.88 |
| Random Forest | -0.366 | 23.60 | 28.37 | +1.25 |
| LightGBM | -0.507 | 24.91 | 29.80 | +3.72 |
| CatBoost | -0.308 | 23.48 | 27.76 | -2.19 |
| SVR | -0.136 | 21.71 | 25.87 | +1.53 |

**Result:** no ML model passed the predeclared gate of beating the simple reference on held-out MAE. The saved benchmark therefore has `selected_model: null`. Negative R² means the predictions were worse than predicting the pooled mean on these held-out observations. These scores do not validate forecasts for Kansas farms.

The water-loss confusion matrices are technically computed, but **84 of 89 measured cover cases had less water than fallow** and all models predicted water loss for every case. Their five no-loss cases are all missed. The classification view adds little information here; the millimetre errors are the useful comparison.

The weather features use January–August because the workbook provides crop-cycle years but not exact planting and termination dates. This is a coarse hindcast feature, not an observed crop-water-use interval. The source workbook's third-cycle date description is internally inconsistent, so exact management timing remains unverified. More independent years, sites, starting-water measurements, and exact field-operation dates are needed before selecting an ML model for a farmer-facing recommendation.
