# Water Debt: what researchers measured and what affects the outcome

This is a **location-independent scientific reading guide**. Western Kansas remains the first demonstration area, but the factor design should come from the full dryland literature. Compare like with like: cover-crop and fallow treatments in the same site and season whenever possible.

## The causal chain to study

**Starting soil water + rain + atmospheric demand + soil capacity**
→ cover-crop growth and water use
→ soil water at cover termination
→ rainfall captured between termination and next-crop sowing
→ water and mineral nitrogen at sowing
→ next-crop establishment and yield under its own weather.

The cover species, planting and termination dates, and residue/forage management alter several links in this chain. Cover biomass is an *observed result or model-predicted intermediate*, not a value the farmer knows when deciding to plant. Wheat-season rain is not known at decision time either; it belongs in a scenario.

## Read these studies for method, not geography

1. [Garba, Bell & Williams (2022), dryland meta-analysis](https://link.springer.com/article/10.1007/s13593-022-00760-0). Best first read for the **complete factor inventory**. Researchers retained field studies with fallow controls, measured soil-water depth, replication and variability, then compared effects across climate, annual rainfall, soil, cash crop, cover type, biomass, termination time, tillage and nitrogen fertilization. Across the included literature they found average reductions in soil water at next-crop sowing and yield, but strong heterogeneity. Their approximate 700-mm rainfall break-even estimate is a *cross-study association*, not a universal planting rule or a causal threshold.
2. [Courtland Kelly (2021), PhD, Chapter 3](https://api.mountainscholar.org/server/api/core/bitstreams/72e3bebe-88a0-40f0-8481-b86a83b856d0/content). Best example of **on-farm measurement design**. Ten fields over two years compared fallow, spring cover, and grazed spring cover. Soil water was sampled at baseline, after cover termination and at wheat sowing, generally to 180 cm; management dates, rain, temperature, residue and subsequent wheat yield were recorded. In that study, wheat growing degree days, water at termination and rainfall after termination explained much of the yield variation. Two years and several locations limit broad generalization.
3. [Lisa Eash (2023), PhD, Chapters 3–4](https://api.mountainscholar.org/server/api/core/bitstreams/42a6dd40-29c2-40c5-83ba-707bc8f75239/content). Best example of the **water–biomass–wheat-yield–economic trade-off**. Adjacent randomized trials compared fallow, spring-planted and fall-planted covers over multiple cycles, measured water by depth, cover biomass, soil nitrate and wheat yield, and calculated costs and possible forage revenue. Biomass related to wheat yield differently in dry and wetter wheat seasons. The associated [Dryad workbook](https://datadryad.org/dataset/doi:10.5061/dryad.6t1g1jxb0) lists field and economic data. Its Colorado-specific regression coefficients must not be treated as general laws.
4. [Zhang et al. (2023), Australia field experiment](https://era.dpi.qld.gov.au/id/eprint/9392/). Best direct test of **termination timing**: early and late terminated sorghum covers versus fallow before wheat. Researchers measured soil water, soil carbon, wheat biomass, yield and quality. Early termination retained more water at wheat sowing in the upper 45 cm and improved yield in that trial; late termination depleted water and sharply reduced yield while improving some soil-carbon measures. This shows why termination date cannot be replaced by a simple crop name.
5. [Nielsen et al. (2016), Colorado/Nebraska multi-condition experiment](https://www.ars.usda.gov/ARSUserFiles/30100500/Publications%202010-2019/620%202016%20Nielsen%20-%20Cover%20crops%20can%20affect%20subsequent%20wheat%20yield%20in%20the%20Central%20Great%20Plains.pdf). Useful test of **dry versus wet year and crop mixture claims**. The same comparisons were run under different water availability. Wheat yield following cover crops dropped significantly in the dry-year datasets but not the wetter-year datasets. Mixtures did not show a dependable water-use or wheat-yield advantage over individual species in that experiment.
6. [Qinsi He (2024), PhD](https://opus.lib.uts.edu.au/handle/10453/186552). Read later for **scenario modeling**, including APSIM, climate scenarios, profitability and environmental trade-offs. It is modeled Australian evidence, not independent validation for a particular field.

## Factor priority for our first model

| Priority | Factor | Why it matters | Measured or predicted? |
| --- | --- | --- | --- |
| Essential | Starting plant-available water **by depth**, with date | Sets the initial reserve; soil water near the seed matters for establishment and deeper water for later growth | Prefer field measurement; otherwise label as an estimate |
| Essential | Rain timing and amount during cover growth, after termination, and during the following crop | Rain can grow the cover, refill the profile later, or rescue the cash crop; annual total alone loses this timing | Historical NASA daily weather; future as scenarios |
| Essential | Cover planting and termination dates | Determine length of active water use and length of recharge period | Farmer decision |
| Essential | Soil water-holding capacity and depth | Same rain produces different available reserves in different soils | Soil survey or field measurement |
| Essential | Cover type/growth and actual residue retained | Changes transpiration, evaporation, infiltration and potential forage value | Management input plus predicted biomass |
| Important for yield | Mineral nitrogen, fertilizer and next-crop type | Water is not the only cause of yield change; cover crops can alter N supply | Field input/measurement, or an explicit limitation |
| Important for money | Seed, termination, hay/grazing costs, wheat and forage prices | A crop option with acceptable water risk can still lose money | Farmer-entered/local budget |
| Later | Detailed soil carbon, erosion, microbiome, individual species mixtures | Relevant long-term benefits but hard to estimate reliably for a single upcoming season | Separate evidence-backed indicators |

Temperature, humidity, wind and sunlight matter through **evaporative demand** and crop growth. They are useful weather inputs, but the decision does not need a separate headline prediction for each. Likewise, observed cover biomass, water at termination, and water at wheat sowing are different points on the causal chain; do not feed a future observed value into an earlier decision model.

## Minimum research data row

`site_id, year, plot/block_id, fallow_or_cover, cover_type, planting_date, termination_date, residue_management, soil_depth_layers, initial_water_by_layer, rain_by_day, weather_by_day, water_at_termination_by_layer, water_at_next_sowing_by_layer, mineral_N_at_sowing, cover_biomass, next_crop_type, next_crop_yield`

For a water-only first prototype, `mineral_N_at_sowing` and yield may be missing, but then yield-risk claims must remain limited. The most useful response for fitting cover effects is **water at next-crop sowing minus water in a fallow control from the same site-year**. Hold out whole sites or years during validation; randomly splitting daily records would exaggerate performance.
