# Water Debt data audit (14 November 2026)

## What is in this repository

Before this audit, the repository contained planning documents and the web/API scaffold, but no crop, weather, soil-moisture, or model dataset. This audit downloaded two small public field-study datasets into [`data/`](data/) and inspected their actual files.

| Source | Local files | Verified contents | Best use | Main limit |
| --- | --- | --- | --- | --- |
| [Eash et al. 2025, Dryad](https://datadryad.org/dataset/doi:10.5061/dryad.6t1g1jxb0) | [`Cover_Crop_Trials_Data.xlsx`](data/dryad_eash_2025/Cover_Crop_Trials_Data.xlsx), [`README.md`](data/dryad_eash_2025/README.md) | Five sheets; 66 plot rows: 39 fall, 18 spring, 9 fallow. Mix species, tillage, block, cover biomass, 0–90 cm water at wheat planting, wheat yield, and economics across three cycles. | Validate fall/spring/fallow ranking at wheat planting and economic trade-offs. | Only one water result per cycle; 35, 41, and 39 of 66 plots have water values in cycles 1–3. No exact planting/termination dates or termination-water readings in the released workbook. |
| [Yin et al. 2026, Figshare](https://doi.org/10.6084/m9.figshare.30263209) | [`daily.csv`](data/figshare_yin_daily.csv), [`field activity`](data/figshare_yin_activity.xlsx) | 709 daily rows from 16 July 2022 to 23 June 2024. Treatment-labelled moisture columns (fallow, pea, oat, six-species mix), rainfall, irrigation, temperature, humidity, wind, solar radiation; a dated activity log. | Prototype crop/treatment-aware daily soil-moisture forecasting and demonstrate treatment timing. | One New Mexico site, some irrigation, chiefly surface (5 cm) moisture per the paper, one cover-crop season, and no released wheat-yield target in `daily.csv`. The 30-labelled columns need independent sensor-depth verification before using them as deep-root-zone data. |

The Eash workbook `Metadata` tab defines `C1/C2/C3.SoilMoisture` as **millimetres of water across 0–90 cm at wheat planting**, even though the website calls it volumetric moisture. Its `C3.SoilMoisture` description says “Cycle 2 wheat planting,” which appears to be a metadata typo; check with the authors before assigning an exact date. The three cycles span 2015–2021 across two staggered trials. The study methods say soil was also sampled at cover termination, but those readings are not separate columns in the released field-data sheet.

The Yin activity log records cover planting/irrigation, cover termination, wheat planting, and irrigation events. The corresponding [paper](https://acsess.onlinelibrary.wiley.com/doi/10.1002/vzj2.70077) says sensors were removed during field operations and gaps were interpolated. Do not treat these imputed periods as independent observed ground truth. The article explicitly limits its analysis to surface moisture at one site.

## External inputs checked

| Resource | Confirmed role | What it cannot tell us |
| --- | --- | --- |
| [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Daily weather history for dry/typical/wet scenarios. A live query at the Colorado trial coordinates returned `PRECTOTCORR`, `T2M_MAX`, `T2M_MIN`, `ALLSKY_SFC_SW_DWN`, `WS2M`, and `RH2M`. | Which cover crop a specific field grew. |
| [NASA SMAP L4](https://nsidc.org/data/spl4smgp/versions/8) | Regional surface/root-zone moisture context; 3-hour, 9-km product. | Plot-level water at wheat planting or treatment-specific cover-crop effects. |
| [USDA NRCS SSURGO](https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo) | Soil properties including available water capacity. | A field's live moisture or management history. |
| [USDA NASS Cropland Data Layer](https://data.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_CDL25_FGDC-STD-001-1998.htm) | Annual crop-specific land-cover context. | Reliable cover-crop species and exact planting/termination dates. |
| [Kansas Mesonet](https://mesonet.k-state.edu/about/soilmoist/data/) | Kansas station moisture at 5, 10, 20, and 50 cm; useful regional check. | Direct treatment labels: station sensors are generally under sod. |

## Implications for the model

1. **Crop identity must come from field management records or farmer input.** Satellite and station data do not supply reliable plot-level cover species, planting date, termination date, or grazing/forage removal.
2. **Use the Colorado trial for outcome validation**, especially fallow vs spring vs fall water at wheat planting and wheat yield. Its 115 observed plot-cycle water values are too few, too temporally coarse, and too concentrated in one soil/climate for a confident general Kansas moisture predictor.
3. **Use the New Mexico daily series to prototype a weather-and-treatment ML component**, with explicit irrigation and crop phase. A model trained on this series predicts short-term surface moisture at that site; it does not establish how much 0–90 cm water a Kansas field will have at wheat planting.
4. For the hackathon, frame the product as **scenario comparison with uncertainty**. Pair NASA weather histories and local soil capacity with a transparent water-budget baseline, and compare its ranking with the field-trial outcomes. Any ML forecast should be labelled as a prototype until it is validated against independent rainfed, deep-profile field data.

The [`inspect_workbook.ps1`](inspect_workbook.ps1) script prints workbook sheet names, sample rows, and the Eash field-data completeness counts. The original Dryad archive is preserved at [`data/dryad_eash_2025.zip`](data/dryad_eash_2025.zip).

## Additional explicit datasets checked (14 November 2026)

### USDA Beltsville cover-crop systems, Maryland

[USDA Ag Data Commons record](https://agdatacommons.nal.usda.gov/articles/dataset/Data_from_Interseeded_cover_crop_mixtures_influence_soil_water_storage_during_the_corn_phase_of_corn-soybean-wheat_no-till_cropping_systems/24856689) provides plot/replication-labelled daily soil-water data with crop-management and yield files. Four source workbooks were downloaded into [`data/usda_beltsville_2023/`](data/usda_beltsville_2023/):

| Local file | Inspected content |
| --- | --- |
| `soil_water.xlsx` | `SWS_2017`–`SWS_2020`: **4,348 plot-day rows**, with date, replication, system 3–6, rainfall, four water-storage layers (`SWS_D1`–`SWS_D4`), profile sum (`SumSWS`), and four soil-temperature layers. Observed periods are May/June–September, not the preceding winter cover-growth period. |
| `setup.xlsx` | Crop-rotation schematic, no-cover systems 3–4 versus cover systems 5–6, rye/vetch/clover species, seeding rates, kill dates, corn dates, and sensor-depth definitions. Sensor horizons span **0–862 mm**. Some cover *planting* entries say only “Fall” or “March,” so exact sowing dates are incomplete. |
| `yield_biomass.xlsx` | Plot/replication, year, system, cover biomass, and subsequent **corn** yield. |
| `metadata.docx` | Methods and sensor-error handling (downloaded; detailed text not yet extracted). |

This is the strongest verified **daily, multi-depth, treatment-labelled U.S. dataset** found so far. It can train or check how a *previous* cover/residue changes daily soil-water storage during the next cash crop. It cannot directly label water remaining at **winter-wheat planting** in Kansas: the site is humid Maryland, the measured cash-crop phase is corn, and most measurements occur after the cover has been terminated. The `setup.xlsx` Table 2 date cells should be checked before use: several cells display Excel serial numbers corresponding to 2023 while their row labels say 2017–2020; the dates in the `SWS_` sheets parse correctly to their stated years.

### U.S. cereal rye growth database

[Dryad release](https://datadryad.org/dataset/doi:10.5061/dryad.tx95x6b3h) was downloaded into [`data/dryad_rye_2024/`](data/dryad_rye_2024/). Its `3_rye_data.csv` has **5,695 rye biomass observations** with sowing and sampling dates, and linked tables describe previous/next crop, management, site, and soil. The metadata table has **no Kansas site rows**. This is useful for a **separate rye-biomass or phenology model**, but it has no measured soil-water target and should not be added to the water-debt regression as if each row were a moisture observation.

### Australian dryland fallow replacement: detailed phase-level water data

[Garba & Williams' data article](https://doi.org/10.1016/j.dib.2022.108841) links to the publisher's supplementary [`garba_2022_mmc1.xlsx`](data/garba_2022_mmc1.xlsx), which was downloaded and inspected. Its `Dataset2_Soil_water` sheet has **2,159 rows**, one site (Mendel), two crop years (2020/21 and 2021/22), 48 plot IDs, 12 treatment codes, five layers to **120 cm**, and both volumetric water (`vwc`) and **plant-available water (`paw`, mm)**. Four labelled phases are `Start Fallow`, `Cover crop sowing`, `Cover crop termination`, and `Cash crop sowing`. The dictionary maps code 1 to fallow, code 2 to stubble, and codes 3–12 to oat, legume, rape, or mixtures. The cover-crop sheet has biomass and cover water-use variables.

This is a better process dataset than the Colorado workbook because it follows **the same plots through several management phases**, including cash-crop sowing. However, the 2,159 rows are repeated *plot × phase × depth* measurements, **not 2,159 independent seasons**; there are only two crop years. The water sheet has phase labels rather than exact sample dates. Climate, soils, crop calendar, and subsequent cash crop differ from Kansas wheat-fallow. Use it to evaluate a phase-to-phase water-change model with plot/year grouping, not as directly interchangeable Kansas training rows. The publisher's [research article](https://www.sciencedirect.com/science/article/abs/pii/S0167880922002018) describes the dryland trial.

**Model consequence:** These new datasets improve the *process* evidence substantially, but none directly fixes the shortage of independent, rainfed wheat-fallow seasons with exact cover dates, starting profile water, water at wheat planting, and wheat yield. Keep the five-model Colorado benchmark separate. Use Beltsville for a daily-water experiment with whole plot-years held out; use Garba for a phase-to-phase water-change experiment with whole years held out; use rye data for biomass only. Do not concatenate their observations into one target without aligning crop phase, depth, climate, and units.
