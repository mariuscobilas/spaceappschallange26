# Water Debt: Kansas-first research and build brief

## The decision

Start with a **non-irrigated winter wheat field near Garden City, western Kansas**. After wheat harvest, the farmer has a long fallow period before the next wheat planting. We compare (1) leaving the field fallow, (2) planting a spring cover crop, and (3) planting a fall/winter cover crop. For a cover crop, management matters: leaving its residue on the field and removing it as hay are different decisions.

For each choice, show:

1. **Plant-available water at the next wheat planting**, including the shallow seed zone and a deeper soil profile where data allow it.
2. **Risk to the next wheat crop** under several plausible rain sequences, not a claim to know next year's weather.
3. **Possible economic trade-off**, with wheat yield, cover-crop seed and termination costs, and optional forage revenue shown separately. Farmer-entered prices are preferable to hard-coded prices.
4. **Soil protection and uncertainty** as separate context. Do not compress every outcome into one opaque score.

The central question is: *Will the cover crop use more water than can be replenished before wheat needs it, and is its forage or soil benefit worth that risk?*

This fits the [2026 NASA Space Apps challenge](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/), which asks for a rotation decision tool combining NASA observations, local soil data, crop traits, and farmer priorities. The challenge page's individual Resources tab has not yet been independently inspected; the sources below are verified directly with their data providers.

## Why Garden City first

The [Kansas State 2007–2012 wheat–fallow field study](https://acsess.onlinelibrary.wiley.com/doi/full/10.2135/cropsci2017.05.0324) directly compares fallow with several winter and spring cover/forage crops. Across years, fallow averaged about **201 mm** plant-available water in the 0–1.8 m soil profile at wheat planting, compared with **157 mm after spring pea** and **109 mm after winter triticale**. These are experimental treatment means, not values to assign to any Kansas farm. The study found that wet wheat seasons could limit yield penalties, while dry seasons could make them severe (up to 70% in the study). It also measured wheat yield and economic outcomes.

A [2008–2011 Garden City experiment](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20365) tested 12 short-season cover crops and found **4–27% more water at wheat planting when the cover was left standing than when it was hayed**. This is why residue removal belongs in the decision.

A [2013–2018 Garden City study](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20543) gives a useful caution: it used a **wheat–sorghum–fallow** rotation, not the same wheat–fallow rotation. In that experiment, water at wheat planting after a standing cover crop was not statistically different from fallow, while hayed and grain alternatives had less water. Its numbers must not be pooled with the wheat–fallow trial as if the systems were identical. It also tested a flexible planting rule, but that treatment was actually planted in only one study year, so it is weak evidence for a general decision threshold.

The first product should therefore be described as **western Kansas dryland wheat support**, centered on Garden City, not a validated statewide predictor. Later expansion would require different rotations, soils, and outcome data.

## Data resources and what each can actually tell us

| Source | Data we need | Use | Limit |
| --- | --- | --- | --- |
| [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Daily precipitation, temperature, humidity, wind, solar radiation for the field coordinates | Historical dry/typical/wet weather sequences; evaporative demand | Gridded regional weather, not rain measured on a particular field. |
| [NASA GPM IMERG](https://gpm.nasa.gov/data/imerg) | Daily or finer rainfall estimates | Check the timing and intensity of precipitation; optional improvement over POWER rain | Satellite estimate, still not field truth; more processing. |
| [NASA SMAP L4 root-zone soil moisture](https://nsidc.org/data/spl4smgp/versions/8) | Regional surface/root-zone moisture and anomalies | Starting-condition context or external sanity check | 9 km model-assimilated product; cannot serve as measured 0–1.8 m water for a specific wheat plot. Requires Earthdata login. |
| [USDA NRCS SSURGO](https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo) via [Soil Data Access](https://sdmdataaccess.nrcs.usda.gov/webservicehelp.aspx) | Soil layers, texture, available water capacity, depth | Approximate local soil water storage capacity | Mapped soil units can contain multiple components; farmer measurement is better. |
| [Kansas Mesonet weather API](https://mesonet.k-state.edu/rest/) | Station rainfall and weather | Compare NASA weather against the nearest station | Point station can differ from the farm. |
| [Kansas Mesonet soil moisture](https://mesonet.k-state.edu/about/soilmoist/data/) | Volumetric water at 5, 10, 20, 50 cm | Regional trend/sanity check | Sensors are generally under sod, not crop plots; online soil-moisture history is limited to 365 days. They are **not cover-crop training labels**. |
| [Holman et al. 2018 wheat–fallow trial](https://acsess.onlinelibrary.wiley.com/doi/full/10.2135/cropsci2017.05.0324) | Published treatment/year wheat yield and treatment water means | Primary Kansas baseline and validation targets | Published tables do not establish that plot-level raw data are available. Must check before ML training. |
| [Holman et al. 2021 cover water study](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20365) | Species, planting season, standing/hayed management, water at wheat planting | Check crop and residue effects | Raw observations not yet confirmed accessible. |
| [Holman et al. 2021 wheat–sorghum–fallow study](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20543) | Spring-cover timing, water before/after cover and before wheat | Stress-test logic in a related system | Different rotation; keep separate from the primary calibration. |

Other useful inputs: farmer's planting/termination dates, last crop, tillage/residue treatment, field soil-water measurement if available, chosen cover species, intended hay harvest, wheat/forage prices, and seed/termination/haying costs. Without those, the tool can only run a clearly labeled demonstration farm.

## Model structure

Use a **daily water balance** to track stored plant-available water from the decision date to wheat planting. Inputs are starting soil water, rainfall, weather-driven evaporative demand, soil capacity, crop growth stage, planting and termination dates, and whether residue remains. The model should conserve water and make each gain or loss visible in a chart.

For uncertain weather, replay complete historical daily seasons selected around low, median, and high rainfall. Keep rain-event timing intact. The comparison must run all choices under the **same** weather sequence. Show the distribution of water at wheat planting and the number/fraction of scenarios below a locally calibrated threshold; do not advertise this as an exact next-year forecast.

**ML is conditional on real labels.** The useful first target is measured plant-available water at wheat planting, or the *difference from a simultaneous fallow control*, given initial water, management, soil, and weather. A small regularized model or gradient-boosted trees could correct the water-balance residual. If plot-level observations cannot be obtained, do not train on published treatment averages or simulator-generated rows and call the result field-validated ML. Instead, ship the transparent water-balance prototype, report validation against published tables, and seek field data. Wheat yield-risk ML needs additional paired wheat yield, sowing-water, and growing-season-weather observations; treat it as a later layer, not a guaranteed MVP result.

Validate by leaving entire **years or sites** out, never randomly splitting daily records from the same field-season. Compare against simple baselines such as fallow and historical mean water. Report errors separately for dry and wet seasons and for spring versus fall covers. If the model cannot distinguish options reliably, present a scenario comparison without a ranked recommendation.

## First deliverable and acceptance check

Build one Garden City demonstration field with fallow, spring pea cover, and winter triticale cover; make planting/termination dates and residue treatment explicit. Start with NASA POWER daily weather plus a documented soil profile. The result page should show three aligned water curves under historical dry/typical/wet sequences, water at wheat planting, qualitative wheat risk, and an itemized return calculation only when prices are supplied. Label every number by source and whether it is measured, modeled, or an assumption.

Before claiming farmer-ready accuracy, obtain and inspect plot-level Kansas trial records or a partner farm dataset, calibrate against held-out seasons, and verify soil and weather inputs. The immediate next research task is to check raw-data access for the Garden City studies; published tables support a prototype and sanity checks but not a strong species-specific ML claim.
