# Mandan water/yield linkage investigation

**Evaluation follow-up:** the separate component experiments are now complete in [MANDAN_EVALUATION.md](MANDAN_EVALUATION.md). Observed water improves absolute yield error over training mean, but yield decisions and initial-to-spring Ridge fail their stronger baselines. The preparation evidence below remains intact; its proposed first component task is now historical.

15 November 2026. **The water-to-spring-wheat linkage is now supported for exploratory research by the published sampling design and exact plot identities in both biomass releases.** The original soil-nitrogen identity gate was an unsuitable proxy for water sampling. A separate prepared dataset now contains **176 spring-water/yield observations and 142 matched water/yield comparisons**, including **110 pairs with initial water before cover planting**. No new model was fitted.

## Evidence that changed the eligibility decision

The earlier audit checked whether soil-nitrogen plot numbers equaled response-crop plot numbers. They disagree in all 236 spring-wheat candidates. That correctly identified an unresolved identity issue; it did not establish which crop strip the water measurements represented.

This investigation acquired six additional small public provider files: both releases' biomass tables/metadata, dedicated response-yield metadata and the soil data dictionary. Sources and retrieval hashes are preserved in [mandan_linkage_v1](../data/raw/mandan_linkage_v1/); acquisition is reproducible with `scripts/fetch_mandan_linkage_sources.py`. The two official catalogs list these resources. [Soil release](https://catalog.data.gov/dataset/data-from-short-term-soil-responses-to-late-seeded-cover-crops-in-a-semi-arid-environment), [response-crop release](https://catalog.data.gov/dataset/data-from-late-seeded-cover-crops-in-a-semiarid-environment-overyielding-dominance-and-sub)

The new checks show:

1. The soil study's aboveground-biomass table has year, replication, treatment **and plot ID**. With cover year + 1 aligned to response harvest year, all **236/236** plot identities match spring-wheat yield records.
2. The response-crop study's cover-biomass table independently matches those **236/236** identities. The primary match uses year/rep/treatment; plot equality is then an additional required check.
3. The same soil-biomass IDs match **zero** corn, soybean or dry-pea response plots. It would be wrong to replicate the water values across all four response crops.
4. The primary soil paper's measurement description locates the neutron-meter access tube “within the spring wheat response crop strip.” This supplies the sampling-location explanation missing from the earlier gate. [Published paper and author repository](https://digitalcommons.unl.edu/usdaarsfacpub/1563/), [indexed primary-paper methods copy inspected](https://www.academia.edu/69783298/Short_Term_Soil_Responses_to_Late_Seeded_Cover_Crops_in_a_Semi_Arid_Environment)

The water table itself still has no raw plot-ID column. This is a **sampling-design-and-biomass-bridge linkage**, not a direct water-PLOT equality check or author confirmation. The university PDF endpoint returned HTTP 403; the indexed methods text was inspected, and no full-PDF visual verification is claimed. These limitations are retained in [linkage_evidence.json](../data/raw/mandan_linkage_v1/linkage_evidence.json), SHA-256 `d61df61c569ab19b079f1d902f98e5da2d87f14f3b05ca5066ebceaa56413d44`.

Example: cover year 2008, replication 1, untreated control has plot **123** in both biomass tables and the 2009 spring-wheat yield table. Soil nitrogen uses **180**. The new crosswalk retains both IDs and marks nitrogen equality false. It does not assume a fixed numerical offset or authorize nitrate linkage; offsets differ among crops, blocks and years.

## Prepared cohorts

The [preparation script](../apps/api/app/ml/prepare_mandan.py) validates 13 pinned source hashes, unique identities, the wheat-specific bridge, water units, layer sums and missing markers. It reconstructs observations without changing the original source/audit files. New outputs are in [data/processed/mandan_linkage_v1](../data/processed/mandan_linkage_v1/inventory.json).

Primary profile completeness requires all seven 30-cm layers and the source total to be numeric. A missing total or layer remains missing; no total is fabricated. Centimetres of water are multiplied by ten to obtain millimetres, and yield kg/ha is divided by 1,000 to obtain t/ha. Full-profile layer sums must agree with source totals within the existing 0.1-cm tolerance.

| Cohort | Count | Meaning |
| --- | ---: | --- |
| Spring-wheat records | 236 | Verified biomass-to-yield plot bridge, including eight disturbed-no-seed control records |
| Yield-only cover/fallow comparisons | 216 | Treatments 2–19 versus untreated treatment 1, matched within year/replication; 12 reused controls |
| Spring 0–210 cm water + yield observations | 176 | Complete deep profile and wheat yield |
| Initial + spring deep water + yield observations | 164 | Also complete before-cover water |
| Matched spring deep-water/yield pairs | **142** | Complete cover and fallow spring profiles; 10 reused controls |
| Matched initial + spring deep-water/yield pairs | **110** | Also complete initial profiles in both arms; eight reused controls |
| Spring 0–90 cm water + yield observations | 225 | First three layers complete, reported separately; not substituted for deep profiles |

There are 684 phase-water records; 166 lack a layer or total for the full 0–210 cm definition. Treatment 20 is disturbed but unseeded and intentionally has no water rows in this release. It is retained as a labeled observation but excluded from the primary cover-versus-untreated-control pairs. Controls are not duplicated into independent experimental replicates.

| Harvest year | Deep-water/yield observations | Initial + spring observations | Deep-water/yield pairs | Initial + spring pairs |
| --- | ---: | ---: | ---: | ---: |
| 2009 | 55 | 54 | 29 | 28 |
| 2010 | 49 | 48 | 45 | 40 |
| 2011 | 72 | 62 | 68 | 42 |

Observed cover-minus-control differences are positive in 96 of the 142 water/yield pairs and negative in 46. The 110 initial/spring pairs contain 71 positive and 39 negative differences. These are descriptive contrasts against reused controls, not independent confirmations of benefit or a statistical treatment-effect conclusion. The yield study reported no significant overall effect on subsequent crop yield. [Author repository for the yield paper](https://digitalcommons.unl.edu/usdaarsfacpub/2522/)

## What this adds and what remains unresolved

This adds three Mandan spring-wheat seasons to our available field evidence. It is not 142 new independent climates and should not be pooled with Colorado simply to improve class balance. Keep spring versus winter wheat, location, winterkill management, experimental design and the 0–210 versus 0–90 cm measurement definitions explicit. A 0–90 cm sum is retained only where all three measured layers exist; it is not PAW.

`PREPLANT` means **before cover seeding**, not before wheat. `SPRING` is a sampling phase near wheat establishment, without an exact date per record. The catalog's final spring endpoint is 2011-05-18, while the verified wheat planting date is 2011-05-17. Do not silently label every spring measurement as a precise pre-sowing state or derive an exact daily forecast horizon. The other verified wheat sowing/harvest dates are retained from the earlier management-workbook audit.

Water linkage does not resolve the separate soil-nitrogen plot mismatch. Nitrogen values are excluded from the prepared observation predictors. Both biomass releases contain identifiers useful for linkage, but species-component mass conversions in the response release are not reconciled here; the explicit soil-study `AGBIOMASS` kg/ha column is retained as its own source measurement.

The source catalogs give three nearby field coordinates without a year assignment established here. No new NASA weather was downloaded or joined to guessed annual field centroids. Site-year coordinates and soil sampling dates need verification before an exact weather-window experiment. Existing Colorado NASA snapshots remain intact.

## Next concrete ML task

Freeze a **Mandan-only** water/yield feasibility protocol on these prepared cohorts. Use the existing leave-one-harvest-year-out memberships, keep every shared control within its year, and compare training-mean yield and zero/training-mean contrasts against a fixed simple water model. Report all three years and both continuous difference error and benefit/harm decisions. With only two years in each training fold, treat the result as exploratory; the labels inspected during this audit are not an untouched final test.

The 164 records with initial and spring profiles also make a phase-to-phase water experiment possible after its feature/horizon definition is frozen. Compare against retaining the initial stored water, retain the measured profile depth and explicitly target the spring phase. Do not claim this validates daily forecasts or arbitrary planting dates. This new evidence partially addresses the earlier initial-water gap; it does not yet validate the whole planting decision.

## Outputs and verification

The nine snapshot files are `observations.csv`, `plot_crosswalk.csv`, five cohort CSVs, `fold_memberships.csv` and `inventory.json`. The inventory records source, evidence, preparation-code and output hashes, per-year counts, limitations and `models_fitted=false`. Whole-year memberships are provided for each cohort; they are historical cross-year folds, not future-only validation.

**156 backend tests passed**, including eight new Mandan tests for exact crop/year/plot bridge requirements, rejection of cross-crop water transfer, cm-to-mm conversion, missing deep versus shallow profiles, untreated-control pairing, year/shared-control isolation, source tampering and immutable replay. A second offline preparation produced all files byte-identically. No model was trained, dependency installed, author contacted, endpoint changed or serving artifact promoted.

The old `water_yield_research_v1` audit remains unchanged, including its conservative zero-accepted-row result. Use this new evidence and preparation for the current Mandan decision; the old nitrogen-equality gate is historical and superseded for water linkage.

```powershell
# Only needed when the six newly acquired provider files are absent:
apps/api/.venv/Scripts/python.exe scripts/fetch_mandan_linkage_sources.py

# Offline, hash-checked preparation; refuses conflicting snapshot output:
apps/api/.venv/Scripts/python.exe apps/api/app/ml/prepare_mandan.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests
```
