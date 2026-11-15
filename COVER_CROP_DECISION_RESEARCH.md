# Cover crop decision support: research and first input contract

## Decision and geographic scope

The first supported question is: **For a rainfed, no-till winter-wheat field near Garden City, Kansas, should the farmer leave the interval fallow or grow a specified cover crop before the next wheat sowing?** Compare both choices under the *same* weather sequence. Report water remaining at wheat planting, the difference from fallow, and uncertainty across historical dry, typical, and wet seasons. A recommendation needs a locally justified minimum-water or risk threshold; the existing trials do not establish a universal threshold.

This is a narrower, testable instance of the [2026 Space Apps Field Shift challenge](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/), which asks for NASA observations plus local soils, crop characteristics, and farmer priorities. The challenge's Resources-tab URL supplied by the user returned an access error during this review, so the source links below were checked at the data providers. The provided `adapting-farms-with-nasa-data` URL and the indexed `field-shift-adapting-farms-with-nasa-data` URL appear to refer to the same challenge, but the Resources tab itself remains unverified.

## Water use: what can be estimated

Water use is **not a fixed number attached to a crop name**. The [FAO-56 method](https://www.fao.org/4/X0490E/x0490e0a.htm) estimates potential crop evapotranspiration as `ETc = ETo × Kc`, where local weather determines reference evapotranspiration (`ETo`) and crop/growth stage determines the coefficient (`Kc`). Actual use is limited by available soil water and changed by planting date, termination date, biomass, residue, and rain timing. For a daily field budget, separating crop transpiration from soil evaporation with the [dual-coefficient method](https://www.fao.org/4/X0490E/x0490e0c.htm) is useful because retained cover residue can reduce later evaporation. These are model estimates, not measurements of a given field.

The [Garden City 2008–2011 trial, Table 4](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20365) reported **cover-period water use** of **116–186 mm for spring pea** and **167–293 mm for winter triticale** across its measured years. These are site-year observations, not portable crop constants. The 2018 trial values below instead measure **water left in the soil at wheat planting**; they must not be interpreted as cover-period water consumption.

| Candidate | Evidence relevant to the first decision | Modeling treatment |
| --- | --- | --- |
| Spring pea | In the [Garden City wheat-fallow comparison](https://acsess.onlinelibrary.wiley.com/doi/full/10.2135/cropsci2017.05.0324), mean plant-available water at wheat planting was about **157 mm** after spring pea versus **201 mm** in fallow, measured over 0–1.8 m. These are treatment averages across study years. | A first tested cover option. Set growth-stage coefficients from a cited source and calibrate against local observations; do not subtract 44 mm from every field. |
| Winter triticale | The same trial reported about **109 mm** after winter triticale versus **201 mm** in fallow. The [2008–2011 Garden City study](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20365) found high water use and biomass for winter triticale or winter legume–triticale mixes. | A higher-water-use test option in this rotation, with explicit sowing and termination dates. Do not assume that a generic wheat coefficient is a validated triticale coefficient. |
| Cereal rye | A [long-term central Iowa field study](https://www.ars.usda.gov/research/publications/publication/?seqNo115=323968) found spring cover-crop water use but generally replenished moisture by corn/soybean planting; it did not find a yield penalty across its seven measured years. | Evidence that climate and recharge can change the outcome. Iowa rye results cannot calibrate Kansas triticale or a wheat-fallow rotation. |
| Next winter wheat | [FAO-56 Table 12](https://www.fao.org/4/X0490E/x0490e0b.htm) lists a typical *well-watered* midseason `Kc` of **1.15** for winter wheat, with values varying by stage and climate. | For the first release, evaluate **soil water at sowing** and a locally calibrated establishment-risk indicator. Wheat's later water demand and yield require future-weather scenarios and separate validation. |

The first Garden City experiment and the [second 2008–2011 study](https://acsess.onlinelibrary.wiley.com/doi/10.1002/csc2.20365) also show that management changes the answer: the latter found **4–27% more water at wheat planting when covers were left standing instead of hayed**. A cover-species-only payload is therefore insufficient.

## U.S. locations with repeated cover-crop measurements

These are **research treatments**, not territories where every farmer always plants cover crops. Their treatment labels give a known cover/no-cover comparison; NASA weather at the coordinates does not reveal what an individual field planted.

| Location | Exact local evidence available | Best role | Transfer limit |
| --- | --- | --- | --- |
| Garden City, western Kansas | [Wheat-fallow trials](https://acsess.onlinelibrary.wiley.com/doi/full/10.2135/cropsci2017.05.0324) measured cover species, water at wheat planting, and next-wheat outcomes. Published treatment/year summaries exist; plot-level raw records have not been confirmed public. | **Primary agronomic decision and sanity check** for the first demo. | Published means cannot train or validate an accurate field-level predictor. |
| Beltsville, Maryland | [USDA Ag Data Commons release](https://agdatacommons.nal.usda.gov/articles/dataset/Data_from_Interseeded_cover_crop_mixtures_influence_soil_water_storage_during_the_corn_phase_of_corn-soybean-wheat_no-till_cropping_systems/24856689), already downloaded into `data/usda_beltsville_2023/`: 2017–2020 plot-labelled daily soil-water sheets with cover and no-cover systems, multiple depths, crop management, and corn yield. The local audit found 4,348 plot-day rows. | **Best available U.S. daily treatment-labelled process dataset** for checking a soil-water model. | Measurements are mainly during the subsequent **corn** phase, in a wetter climate, after cover termination. It is not Kansas wheat-sowing ground truth. |
| Central Iowa near Ames | [Long-term winter-rye study](https://www.ars.usda.gov/research/publications/publication/?seqNo115=323968) observed soil water and corn/soybean yield from 2008–2014 in a site with 13 years of rye use. | Check whether the model can represent spring drawdown followed by rain recharge. | The publication is available, but a downloadable plot-day data release has not been verified here. Do not treat article curves as raw training records. |

## Proposed request payload

The browser should send **field and management choices** to the API. The API should fetch NASA weather by coordinates and date, cache it, and attach source/units to the response. If a farmer has a local weather series, it may be supplied as an override with its source named. Weather is not a single scalar in the request: complete daily sequences preserve rain timing. Future weather is unknown, so prospective runs use historical years as scenarios or an explicitly identified forecast horizon.

```json
{
  "field": {
    "latitude": 37.97,
    "longitude": -100.87,
    "rainfed": true,
    "last_crop": "winter_wheat",
    "last_harvest_date": "2026-07-01",
    "tillage": "no_till"
  },
  "decision_date": "2026-07-15",
  "cover": {
    "species": "spring_pea",
    "plant_date": "2027-03-15",
    "terminate_date": "2027-05-15",
    "residue_management": "left_standing"
  },
  "next_crop": {
    "species": "winter_wheat",
    "planned_sow_date": "2027-09-20"
  },
  "soil": {
    "source": "field_measurement",
    "measurement_date": "2026-07-15",
    "layers": [
      {"top_cm": 0, "bottom_cm": 30, "plant_available_water_mm": 22, "capacity_mm": 45},
      {"top_cm": 30, "bottom_cm": 90, "plant_available_water_mm": 54, "capacity_mm": 90},
      {"top_cm": 90, "bottom_cm": 180, "plant_available_water_mm": 67, "capacity_mm": 135}
    ]
  },
  "weather": {
    "source": "nasa_power_historical_scenarios",
    "historical_years": [2012, 2018, 2023]
  }
}
```

All soil numbers and dates above are **illustrative inputs**, not observations or recommended planting dates. Validate date order, layer overlap, units, `0 ≤ plant_available_water_mm ≤ capacity_mm`, and compatibility of species/rotation. Permit `soil.source = "ssurgo_estimate"` with an explicit initial-water assumption when a field measurement is unavailable. A `cover.species = "none"` option is implicit in every comparison. Prices/costs and forage intention can be optional later; they should not be inferred from a cover name. Species outside the calibrated set should return an unsupported/experimental status rather than a fabricated recommendation.

## Weather and model pipeline

1. Fetch complete daily [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) weather for the field grid cell: precipitation, minimum/maximum temperature, humidity, 2-m wind, and solar radiation. Preserve units, missing-value flags, grid resolution, time standard, dates, and fetch timestamp. The daily API returns gridded weather, not field measurements. Compare rain against a nearby [Kansas Mesonet](https://mesonet.k-state.edu/rest/) station when possible.
2. Derive daily `ETo`; apply documented stage-specific crop coefficients, water-stress adjustment, soil capacity, and runoff/drainage assumptions. Run **cover and fallow with identical weather and initial soil water**. Track planting-to-termination water use and termination-to-wheat recharge separately. Preserve standing versus removed residue in the post-termination evaporation term.
3. Replay full historical seasons selected for dry, typical, and wet rainfall **within the relevant planting-to-planting calendar**, using the same year for each choice. Do not label a historical replay as a forecast. More than three years should be retained for a distribution if the demo can support it.
4. Return for each scenario: plant-available water by depth at next-crop sowing; cover-minus-fallow difference; water at termination; rain, evapotranspiration, and drainage totals; and data-quality flags. Summarize range and uncertainty. Show a qualitative caution where starting water is estimated or a crop is outside the validation domain.
5. Add a categorical `recommendation` only after a local risk threshold and independent held-out checks exist. The current [Colorado benchmark](BENCHMARK_FINDINGS.md) failed to beat a simple treatment mean on held-out years, so it is unsuitable as the recommendation engine.

**Suggested first implementation:** support `winter_wheat` as the next crop and `none`, `spring_pea`, and `winter_triticale` as choices near Garden City. Add other next crops only with their planting calendars, crop coefficients, and paired local outcome evidence. Beltsville can test daily model mechanics, while Garden City constrains the farmer-facing claims.
