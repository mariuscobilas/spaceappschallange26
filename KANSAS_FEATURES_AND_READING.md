# Kansas Water Debt: features and reading order

For a location-independent review of how researchers identified the important factors, see [WATER_DEBT_FACTOR_REVIEW.md](WATER_DEBT_FACTOR_REVIEW.md). This file applies those factors to the first Kansas demonstration.

## Exact first decision

For a **rainfed, no-till winter-wheat field in western Kansas**, compare leaving the fallow period unplanted with planting a spring or fall cover crop. Calculate the range of plant-available water (PAW) at the next wheat planting under historical weather scenarios. Assess the possible wheat-yield and forage trade-off only to the level supported by observed data. Keep a wheat–fallow field distinct from wheat–sorghum–fallow: they have different timelines and preceding crops.

## Feature contract

| Group | Variables | Source and status |
| --- | --- | --- |
| Decision-time field state | Coordinates; date; last crop and harvest date; rainfed status; tillage/residue practice; measured PAW or volumetric soil water **with depth and date** | Farmer input. A demo can use explicit assumptions, but [SMAP](https://nsidc.org/data/spl4smgp/versions/8) or [Mesonet](https://mesonet.k-state.edu/about/soilmoist/data/) cannot substitute for field-profile measurements. |
| Soil | Layer depths, texture, plant-available water capacity, effective rooting depth | [USDA SSURGO](https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo); field measurements when available. |
| Choice | Fallow / spring pea / spring triticale / winter triticale; sowing and termination dates; standing residue / hayed / grazed; target wheat sowing date | Farmer input or documented study treatment. Start with a few tested options, not arbitrary crops. |
| Weather scenario | Daily rain, temperature, humidity, wind, solar radiation, and derived evaporative demand | [NASA POWER daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/); optionally compare rain with [GPM IMERG](https://gpm.nasa.gov/data/imerg) and [Kansas Mesonet](https://mesonet.k-state.edu/rest/). Future observed weather is **not** known when the decision is made; it is scenario input. |
| Intermediate modeled state | Water at cover establishment; water at termination; rain and recharge after termination; residue left; possible cover biomass | Daily water balance and, only with real observations, an ML correction. These values explain why an option won or lost water. |
| Primary output | PAW at wheat planting by soil layer and for the profile; difference from fallow in the same scenario; range across scenarios | Primary project target. Do not confuse volumetric water content with PAW in millimeters. |
| Secondary output | Wheat establishment/yield risk; itemized wheat and forage return; erosion/soil-cover context | Requires paired wheat-yield or biomass data and costs. Label rough or unvalidated estimates. |

**ML rule:** Each training row should represent a real field/plot and season, with location, management, initial soil water and weather features. The main label is measured PAW at wheat planting, ideally as a difference from a simultaneous fallow plot. Measured termination water, biomass, and wheat yield can be additional labels. Future measured biomass or rain must not enter a decision-time predictor. Split validation by whole year and site, not randomly by daily record.

## Dissertations and theses to read

1. **Courtland Kelly, Colorado State PhD (2021), [*Exploring the Role of Planned and Unplanned Biodiversity in the Soil Health of Agroecosystems*](https://api.mountainscholar.org/server/api/core/bitstreams/72e3bebe-88a0-40f0-8481-b86a83b856d0/content).** Read **Chapter 3, printed pp. 57–85**. Ten on-farm trials in eastern Colorado, western Kansas and southwestern Nebraska compare fallow, spring cover, and grazed spring cover before winter wheat. Methods give exactly the measurements we need: soil cores at baseline, after termination, and wheat planting, generally to 180 cm; rain before and after termination; management dates; residue cover; and wheat yield. It is the most useful PhD for the *feature schema*, though only two experimental years and mixed locations limit Kansas-specific ML.

2. **Lisa Eash, Colorado State PhD (2023), [*Cover Crops for Ecological Management of U.S. Agricultural Systems*](https://api.mountainscholar.org/server/api/core/bitstreams/42a6dd40-29c2-40c5-83ba-707bc8f75239/content).** Read **Chapter 3, printed pp. 56–82**, for soil water, cover biomass and subsequent wheat yield; **Chapter 4, printed pp. 90–131**, for soil protection and economics. This is a Colorado Plateau experiment, so do not transfer its yield penalties directly to Kansas. A major advantage is that its [Dryad workbook](https://datadryad.org/dataset/doi:10.5061/dryad.6t1g1jxb0) publicly lists field, economic, and moisture variables. Inspect its sheets and units before deciding whether it can supplement Kansas training.

3. **Logan Simon, Kansas State PhD (2024), *Cover Crops to Regenerate Soils and Increase Profitability in Dryland Crop Production in the Semi-arid Central Great Plains*.** [K-State confirms the dissertation and degree](https://www.k-state.edu/graduation/ceremonies/program/2024-Spring-Commencement.pdf), but a public full-text PhD PDF has **not yet been verified**. His accessible **2021 MS thesis**, [*Long- and Short-Term Cover Crop Management Effects on Soil Health in No-Till Dryland Cropping Systems*](https://krex.k-state.edu/bitstreams/8194370d-2e3b-413f-9b89-9e82a4528d3b/download), is worth reading: Chapter 1 on water use and flexible cover planting; Chapter 2 on Garden City residue and soil properties; Chapter 3 on standing, hayed, and grazed covers near Brownell. The Garden City trial changed from wheat–fallow to wheat–sorghum–fallow in 2012, so match each result to its rotation period.

4. **Hugo R. Kruger, Colorado State PhD (2001), [*Legume-Wheat Rotation in Dryland Cropping Systems in Eastern Colorado*](https://api.mountainscholar.org/server/api/core/bitstreams/0b9c0c91-d6aa-4d94-a20d-effe3aa78f4b/content).** Read its methods and water-use/soil-water-at-wheat-planting results. Pea and soybean alternatives were used as forage, grain, or green manure before wheat. It is valuable for understanding **termination timing and use of the cover**, but is old and outside Kansas.

5. **Qinsi He, University of Technology Sydney PhD (2024), [*Effects of Conservation Practices on Agricultural Sustainability*](https://opus.lib.uts.edu.au/handle/10453/186552).** Read the APSIM/cover-crop modeling and climate-scenario sections for model design, not as Kansas field evidence. The study uses Australian systems and climate-model scenarios and includes an ML analysis of global cover-crop effects.

## Kansas papers that are more direct than most dissertations

- [Holman et al. 2018, wheat–fallow trial near Garden City](https://acsess.onlinelibrary.wiley.com/doi/full/10.2135/cropsci2017.05.0324): start here for treatment-specific water at wheat planting, wheat yield, and profitability. Published tables are accessible; plot-level raw records have not been confirmed public.
- [Holman et al. 2021, 12 short-season covers in wheat–fallow](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20365): water use and standing-versus-hayed effect.
- [Holman et al. 2021, wheat–sorghum–fallow trial](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20543): useful for a later expansion, but a different rotation.

**Reading priority:** Holman 2018 → Kelly Chapter 3 → Simon MS Chapters 1–2 → Eash Chapters 3–4 and Dryad workbook → other dissertations. The first data question is whether we can obtain plot-level Kansas water, dates, treatment, and wheat-yield records. Published treatment means alone are insufficient for a reliable Kansas ML model.
