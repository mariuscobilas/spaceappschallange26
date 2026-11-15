# Water, weather, and following-crop yield: data feasibility

**Follow-up:** exact operation dates have now been verified in [the calendar](WATER_YIELD_CALENDAR.md), and the first fixed experiment is complete in [the evaluation](WATER_YIELD_EVALUATION.md). Calendar gaps and proposed first experiments below describe the initial audit checkpoint; the original audit snapshots remain unchanged.

**Mandan follow-up:** [the plot-linkage investigation](MANDAN_LINKAGE.md) now supports water-to-spring-wheat linkage through published sampling design and both biomass plot tables. A new separate snapshot has 176 deep-water/yield observations and 142 matched pairs; nitrogen plot identity remains unverified. The zero-accepted-row conclusion below records the original nitrogen-proxy gate and is superseded for water by the new evidence. Original audit artifacts remain unchanged.

Audited 15 November 2026. This research follows the decision: **Should a farmer plant a proposed cover crop before a following cash crop, compared with leaving the interval fallow?** No model, API payload, serving selection, or existing source dataset was changed.

**The Colorado Eash trial is the best currently verified starting point for studying the water–wheat-yield relationship.** It provides 88 plot-cycle observations with both profile water at wheat planting and wheat yield, including 68 cover-versus-fallow pairs. NASA POWER weather for this location has now been acquired for all of 2016–2021. The observations support a small exploratory study, not a general farmer-ready model.

## Acquired and inspected

| Source | Verified local evidence | Suitable use | Important boundary |
| --- | --- | --- | --- |
| [Eash Colorado trials, Dryad](https://datadryad.org/dataset/doi:10.5061/dryad.6t1g1jxb0) | 66 plots; 198 possible plot-cycles; 115 water values; 144 wheat-yield values; **88 jointly observed water/yield records**, of which 86 also have nitrate. | First exploratory water/weather-to-wheat-yield study and matched cover/fallow outcome comparison. | Two adjacent trials at one location; repeated plots and only five trial-cycle groups contain joint water/yield values. Exact field-operation dates are absent. |
| [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | **2,192 daily dates, 2016-01-01 to 2021-12-31**, at published Yellow Jacket coordinates; six parameters; no provider fill/nonfinite values. | Growing-season weather and historical weather scenarios for the Colorado trial. | Gridded weather, not plot observations; historical weather known after the decision is a hindcast/scenario input, not an available future observation. |
| [USDA Mandan response-crop trial](https://catalog.data.gov/dataset/data-from-late-seeded-cover-crops-in-a-semiarid-environment-overyielding-dominance-and-sub) | Newly downloaded 944 yield rows: 236 each for spring wheat, corn, soybean, and dry pea, in 2009–2011. Treatment and management files include cash-crop planting/harvest dates. | Separate research on following-crop yield effects and a potential expansion after source linkage is clarified. | Three seasons, spring wheat rather than winter wheat. Harvest grain moisture, kernel weight, and test weight must not be used as decision-time predictors. |
| [USDA Mandan companion soil study](https://catalog.data.gov/dataset/data-from-short-term-soil-responses-to-late-seeded-cover-crops-in-a-semi-arid-environment) | Newly downloaded 684 water rows: three phases, seven layers to 210 cm, three experimental years; 166 rows lack at least one layer or total. Soil nitrate includes plot IDs. | Cover-period water dynamics; potential linkage to the response-crop study only with an established plot/strip crosswalk. | **236/236 candidate spring-wheat plot IDs disagree with soil-nitrogen plot IDs.** A year/rep/treatment join alone is not accepted as a measured plot-level water/yield pairing. |
| [USDA Beltsville corn systems](https://agdatacommons.nal.usda.gov/articles/dataset/Data_from_Interseeded_cover_crop_mixtures_influence_soil_water_storage_during_the_corn_phase_of_corn-soybean-wheat_no-till_cropping_systems/24856689) | 4,348 daily water records in 44 system/rep/year series. Newly acquired station-weather and potential-ET workbooks. **All 64 corn-yield cells are blank** in the supplied yield workbook; a fresh provider download is byte-identical. | Daily profile-water/weather research, kept separate from dryland wheat. | Descriptive repository text promises yield, but the checked file supplies zero numeric yield labels. Water monitoring starts after planting. Table 2 has 2023 date cells beneath 2017–2020 labels. |
| [Garba Australian trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC9803925/) | Existing workbook: 2,159 depth/phase records, two years, one site in the downloaded water sheet. PAW by depth at cover sowing, termination, and cash-crop sowing. | Water-process checks and cover/fallow storage comparisons. | No following-cash-crop-yield sheet in this workbook; repeated depths/phases are not independent seasons. |

### Colorado joint sample and pairing

| Trial | Cycle | Joint water/yield records |
| --- | --- | ---: |
| T1 | 1 | 8 |
| T1 | 2 | 11 |
| T1 | 3 | 12 |
| T2 | 1 | 27 |
| T2 | 2 | 30 |
| T2 | 3 | 0 |

The 88 complete observations comprise **68 cover records and 20 fallow controls**. Each cover record is matched to a control using trial, block, tillage, and cycle. These 68 differences reuse the 20 controls; they are not 68 independent experiments.

The older water-only benchmark had 89 cover/fallow pairs. The yield question has a different complete-case cohort: **68 pairs**. Do not reuse the older sample count for water-plus-yield modeling.

Source water is **0–90 cm profile water storage in mm**, not verified plant-available water. Plant-available water additionally requires suitable soil/crop extraction limits. A water measurement at wheat sowing is an intermediate outcome when the decision is made before cover planting; it cannot become an observed decision-time input.

### Mandan linkage gate

The soil metadata explicitly maps experimental years 1/2/3 to spring 2009/2010/2011. Treatment codes also agree across the releases. A naive join finds 176 spring-wheat records with numeric candidate spring-water and yield values.

However, the soil-nitrogen file provides a plot-identity check that fails for every spring-wheat record. Example: year 2009, replication 1, control treatment 1 is yield plot **123**, while the soil-nitrogen release identifies plot **180**. Different strips or measurement layouts could explain this, but that explanation has not been established. The water file itself omits plot IDs.

Therefore **zero Mandan water/yield pairs are currently accepted**. The exported eligibility file labels its water fields `candidate_*` and retains `parent_plot_identity_verified=false`. Obtain an existing published crosswalk/design explanation or author clarification before using these as measured paired labels. No author was contacted.

Water units in this release are **cm of stored water per 30 cm layer**, not volumetric fractions. The audit converts to mm by multiplying by 10, checks seven-layer sums against the total, and excludes the documented `-9999` missing marker. It does not treat missing readings as zero.

## How the challenge resources fit

The supplied [official resource URL](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources) could not be retrieved by the web reader. Direct access also failed certificate verification, and no connected browser was available. Discovery used the [local Space Apps event's reproduced list](https://hackathlone.com/challenges/adapting-farms-with-nasa-data); the list's official completeness remains unverified. Dataset contents and capabilities were checked against their providers and downloaded files.

| Resource | Role in this research | What it does not establish |
| --- | --- | --- |
| [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | First weather source; downloaded directly for the Colorado study, with request provenance and hashes. | Future weather or treatment-specific field outcomes. |
| [SMAP L4 surface/root-zone moisture](https://nsidc.org/data/spl4smgp/versions/8) | Optional regional initial-condition context; 3-hourly, 9 km modeled/assimilated product. | Measured water in individual cover/fallow plots; soil PAW limits; causal cover effects. |
| [ECOSTRESS](https://ecostress.jpl.nasa.gov/data) | Optional thermal/ET consistency check when coverage and pixel footprint are appropriate. | An independent measured yield label or a complete daily series for every small trial plot. |
| [SSURGO / Web Soil Survey](https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo) | Soil layers, available capacity, and mapping context. | Current soil-water state or verified extraction limits for each experimental plot. |
| USDA Ag Data Commons | Field measurements, management, replication and observed yield targets. The source family is explicitly included in the reproduced challenge list. | Every advertised field being populated; source files must be inspected. |
| GPM, Landsat/MODIS/VIIRS, OpenET | Later rain/vegetation/ET checks after the core cohort is established. | Additional independent paired cover/fallow yield observations merely by adding pixels or dates. |
| NASS QuickStats / GAEZ | Regional yield context or modeled suitability/attainability comparisons. | A plot-matched observed cover-versus-fallow yield contrast. |

No new SMAP, ECOSTRESS, GPM, or imagery arrays were downloaded in this task. NASA weather was actually downloaded; the other products are candidates, not already integrated features.

### NASA download details

Two immutable raw snapshots under `data/raw/nasa_power_water_yield_v1/` cover 2016–2020 and 2021. The requested coordinates are 37.533333, -108.733333, from the published study's arcminute coordinates. Provider geometry rounds them to 37.533, -108.733; these are not surveyed plot centroids. Time standard is LST.

Provider units were inspected: rain `mm/day`, max/min temperature `C`, humidity `%`, wind `m/s`, and solar radiation **`MJ/m^2/day`**. In particular, do not apply the old Colorado benchmark's `solar_kwh_m2` naming/conversion to these raw values without checking units. These files are not yet joined to crop outcomes.

The audit verifies file hashes, requested parameters, exact calendar coverage for each parameter, returned location, time standard, and fill/nonfinite counts. Provider URLs, retrieval timestamps, and source hashes are in adjacent `.source.json` files.

## Proposed next experiment

The immediate research question is **whether starting profile water adds out-of-season predictive information about wheat yield beyond growing-season weather**. A second question is whether water differences help explain measured cover-minus-fallow yield differences. Prediction is not proof that water alone caused the treatment effect; nitrate, tillage, establishment and other mechanisms remain relevant.

1. **Finalize the Colorado calendar and an analysis protocol before fitting.** Confirm sowing and harvest years for the five usable trial/cycle groups from source methods. Exact September sowing and July harvest days are absent: if using fixed month-based weather windows, label them approximations and declare them before evaluation. T2/C3 has no joint water/yield rows and must not gain fabricated labels to enlarge the sample.
2. **Compare a few interpretable, fixed models.** Training-mean baseline, water-only, weather-only, water+weather, and water+weather+nitrate on a common cohort for the incremental comparisons. Fit imputation/scaling on each training fold only. Do not compare models on differently missing cohorts without reporting the difference. A small regularized model is sufficient for the first feasibility question; another large algorithm search is unnecessary.
3. **Hold out whole cash-crop seasons.** Keep both trials' records together if they share a season. No random row split, and no reuse of shared controls across training and evaluation within the same season. Report each held-out season separately alongside pooled MAE/RMSE and baseline improvement. The five usable trial-cycle groups do not create evidence of transfer to a new geography. Prior research has already exposed these data; this is exploratory evaluation, not a fresh final test.
4. **Evaluate the paired target separately.** `cover_minus_fallow_wheat_yield`, with the matching described above. Preserve the dependence caused by reused controls and repeated plots when estimating uncertainty. Favor differences in t/ha initially; small control yields can destabilize relative-percentage targets.
5. **Check inference availability.** Observed sowing water and realized cash-crop weather can test the biological/outcome relationship. For a decision made before cover sowing, those quantities must eventually come from separately validated water predictions and weather scenarios. Hindcast performance with observed intermediates is an upper-bound component check, not the accuracy of the complete decision service.
6. **Choose the next investment from results.** If measured water adds little over weather or the relationship changes across seasons, investigate label quality, nitrogen/management and missing evidence before increasing model complexity. If it adds reproducible value, build the cover-to-sowing-water component and propagate its errors into yield comparisons. A documented water balance/crop-response model is another candidate benchmark, not replacement field truth.

The API contract can remain unchanged during this research. New root-zone or yield semantics must not be silently substituted into existing 5 cm moisture fields.

## Reproduce and inspect

```powershell
# First acquisition, or reuse the checked public-source cache.
apps/api/.venv/Scripts/python.exe scripts/audit_water_yield_data.py --fetch

# Repeat the source/eligibility audit offline, without fitting anything.
apps/api/.venv/Scripts/python.exe scripts/audit_water_yield_data.py
```

Current outputs are under `data/analysis/water_yield_research_v1/`:

- `inventory.json`: source hashes, complete-case counts, matched-control counts, calendars, source limitations and NASA checks.
- `eash_plot_cycles.csv`: all 198 plot/cycle records, preserving missing outcomes.
- `eash_matched_water_yield_pairs.csv`: 68 verified cover/fallow comparisons with both water and yield.
- `beltsville_water_yield_series.csv`: 44 water-series summaries, with missing yields retained.
- `mandan_spring_wheat_eligibility.csv`: 236 candidate records flagged for failed plot-identity verification; **not an approved training set**.

The audit refuses changed files in an existing output snapshot; use `--output` with a new directory when source contents or audit results change. It performs no correlation-based feature selection, model fitting, promotion, or endpoint changes.
