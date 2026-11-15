# Australian phase-level water benchmark

This experiment uses [Garba and Williams' supplementary workbook](data/garba_2022_mmc1.xlsx) from their [dryland cover-crop dataset](https://doi.org/10.1016/j.dib.2022.108841). The reproducible script is [`apps/api/app/ml/australia_benchmark.py`](apps/api/app/ml/australia_benchmark.py); run it from the repository root with `apps/api/.venv/Scripts/python.exe apps/api/app/ml/australia_benchmark.py`. Full metrics are saved to [`data/australia_benchmark_results.json`](data/australia_benchmark_results.json).

## Experiment

- **Target:** plant-available water (PAW, mm) across 0–120 cm at cash-crop sowing, minus PAW in the fallow treatment in the same year and replication. Negative means less water than fallow.
- **Decision-time inputs:** treatment code and PAW in each of five soil layers at cover-crop sowing. Termination and cash-crop-sowing measurements are excluded from predictors.
- **Unit of analysis:** one year × replication × treatment. The source's 2,159 soil-water rows include repeated depths, phases, and some duplicate first-year plot-depth entries. Those were averaged within year/replication/treatment/phase/depth, then summed across five complete depths. This produced **87 usable cover/stubble units**, not 2,159 independent samples.
- **Validation:** train on 2020/21 and test on 2021/22, then reverse. The two years are the only independent time groups. Hyperparameters were fixed because one training year cannot support year-grouped tuning.

| Model | Held-out R² | MAE (mm) | RMSE (mm) | Mean error (mm) |
| --- | ---: | ---: | ---: | ---: |
| Treatment mean | -0.664 | 22.85 | 27.55 | -0.11 |
| Starting-water difference | -2.433 | 33.31 | 39.56 | +27.63 |
| Ridge | -1.075 | 25.24 | 30.76 | -22.86 |
| Random Forest | -0.335 | 20.28 | 24.67 | -5.89 |
| LightGBM | -0.334 | 20.24 | 24.66 | -6.78 |
| **CatBoost** | **-0.270** | **19.97** | **24.06** | -5.38 |
| SVR | -0.795 | 25.21 | 28.61 | -1.40 |

CatBoost improved MAE by **2.88 mm** relative to the treatment-mean reference, but all models had **negative held-out R²**. The improvement is too small and the two-year test too narrow to support a general crop recommendation. For CatBoost's water-loss classification, the confusion matrix is `[[0, 13], [0, 74]]` (rows: actual no-loss/loss; columns: predicted no-loss/loss): it predicted **water loss for every case** and missed all 13 no-loss cases. The regression error table is more useful than the classification view.

The Australian data provide valuable measured water at cover sowing, termination, and cash-crop sowing, but no exact sample dates in the water sheet and only one site. This experiment used no NASA weather input. Its result should stay separate from the Colorado wheat-planting benchmark; it does not validate a Kansas model.
