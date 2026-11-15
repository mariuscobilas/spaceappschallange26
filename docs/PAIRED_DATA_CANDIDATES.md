# Independent paired cover-versus-fallow yield candidates

**Audit date:** 15 November 2026  
**Scope:** read-only source discovery for the farmer's cover-crop-versus-fallow decision. No training, label import, experiment, model change, serving change, or author contact occurred. Existing Clovis and research snapshots were not modified.  
**Machine-readable inventory:** [`data/analysis/decision_candidates_v1/eligibility.json`](../data/analysis/decision_candidates_v1/eligibility.json)  
**Row summary:** [`data/analysis/decision_candidates_v1/eligibility.csv`](../data/analysis/decision_candidates_v1/eligibility.csv)

## Eligibility result

**Zero training labels and zero paired contrasts accepted from either candidate.** Dryad exposes a promising randomized-block trial, but its CSV is blocked by provider download authorization, so the sample-to-plot, yield-to-sample, block, missingness, and control links cannot be verified. The USDA-ARS paper provides eight useful aggregate location-year-water-regime comparisons, but not plot-level yield rows. These sources are new and independent of the project's existing Clovis/Colorado/Mandan observations; they remain outside all canonical cohorts and training pools.

| Candidate | Yield evidence reported | Candidate comparison structure | Accepted labels / pairs | Current role |
|---|---|---|---:|---|
| Sone et al. 2026, Dryad | One winter-wheat yield season (July 2022); paper describes 55 randomized treatment plots, 11 treatments, five blocks. The Dryad README describes July 2019/2020/2022 sample times and `Yield` in kg m⁻². | By design, 50 cover-treatment plots and five fallow controls. Up to 50 within-block treatment-control comparisons are conceivable if raw block and yield keys verify; each fallow control would be reused across ten cover treatments. They are not 50 independent experiments. | **0 / 0** | Strongest new raw-data candidate, pending permitted original-file retrieval and key audit. One site and one yield season only. |
| Nielsen et al. 2016, USDA-ARS | Published means/contrasts for wheat yield in two seasons at two sites under dryland and irrigated management. | 2 sites × 2 seasons × 2 regimes = **8 published aggregates**. The PDF has table summaries, not raw replicated yield rows or plot IDs. | **0 / 0** | Aggregate context only; not ingestible training labels. |

## 1. Dryad: Sone et al. (2026)

The Dryad record is [Data from: *Cover crop composition, not diversity, drives agroecosystem multifunctionality and wheat yield*](https://datadryad.org/dataset/doi:10.5061/dryad.pvmcvdp2f), published 3 September 2026. The related open-access paper is [Sone et al., *Journal of Applied Ecology* (2026)](https://besjournals.onlinelibrary.wiley.com/doi/full/10.1111/1365-2664.70576), DOI `10.1111/1365-2664.70576`.

### What the published design establishes

- One site: NRCS Plant Materials Research Center, Pullman, Washington (46.71746, −117.14637); plots established May 2019 and maintained to July 2022.
- 55 experimental plots in a complete randomized-block design: 11 treatments × 5 replicates, including five fallow controls. The ten cover treatments comprise six single species, three four-species mixtures, and one six-species mixture.
- Cover crops were sown each May in 2019–2021. The 2021 cover crop failed during exceptional drought. Winter wheat was seeded in September 2021 and harvested in July 2022.
- The paper reports 165 bulk-soil samples over July 2019, July 2020, and 2022. Three random cores per plot/time were homogenized into the collected sample. These are repeated soil-sampling records from the same experimental plots, not 165 independent crop-yield seasons.
- Thus the paper documents **55 design-level plot units and one following-wheat yield season**. It does not establish from accessible source rows how many nonmissing plot-yield observations are in the actual CSV.

### What the data dictionary says, and what it does not establish

The Dryad page lists the full file `DRYAD_JAE_data_20260815.csv` (41,519 bytes), the outlier-removed derivative (40,459 bytes), and `README.md` (7,207 bytes). It defines `SimpleID` as a numerical ID assigned to each **sample**, `Time` as July 2019, July 2020, or July 2022, `Yield` as winter-wheat yield harvested in July 2022 in kg m⁻², and VWC as field volumetric water content averaged over three measurements per plot.

The dictionary does **not** define `SimpleID` as a plot ID or block ID. Do not join, group, or bootstrap samples using `SimpleID` as though it were a stable plot key. The accessible dictionary also gives no VWC depth or exact observation date. A 2022 VWC measurement taken during wheat growth is not initial water at the earlier cover-planting decision. Do not use such a value as a decision-time feature.

### Download and hash record

The public metadata API was reachable and its responses are preserved in [`data/raw/decision_candidates_v1/`](../data/raw/decision_candidates_v1/README.md). The current provider inventory is Dryad version 461584. It reports SHA-256 `3414ec73f6004a6369b7d508153b907d75c5c046aa4726f94e9a4d6beab7cc6b` for the 41,519-byte full CSV and `0229ae469599ad7614ff18bd0ac290125031d1d1f77f9f32af4451ed17fa3723` for README.

The file-stream request returned HTTP 403, and the provider's official per-file API request returned HTTP 401 without a bearer token. Browser retrieval was also refused. **Neither original file was downloaded; those provider hashes are advertised hashes, not hashes of local content.** Accordingly, no CSV row count, unique plot-yield count, missing-yield count, repeated outcome count, block/control join, or plot-level weather join is asserted here. The paper's five-block design makes within-block matching a plausible audit target, not an approved row join.

### Minimum gates before this source can contribute labels

1. Retrieve the original CSV and README through an authorized Dryad download path and verify both provider SHA-256 digests.
2. Inventory all columns, rows, `Time` values, missing yields, distinct sample IDs, and yields by sample time. Determine whether the 2022 outcome is present once per plot or repeated on each sample-time row.
3. Obtain explicit plot and block keys from data documentation or file columns. Establish the exact mapping of every row to one of the 55 experimental plots and one of the five randomized blocks; never infer that `SimpleID` is plot identity.
4. Verify one unique winter-wheat 2022 yield outcome per plot, including treatment, five fallow controls, and treatment/control matching within block. Preserve each control's reuse and keep inference at block/site-year level.
5. Resolve exact water-measurement depth/date and cover operation timing. Exclude water values observed after the earlier planting decision from decision-time inputs. Determine whether the supporting-information plot-layout diagram or a compatible local weather series yields defensible features.
6. Freeze a separate eligibility table and cohort protocol. Even if all 55 plot labels verify, this remains one-site, one-yield-season evidence and cannot support independent season-generalization claims by itself.

## 2. USDA-ARS: Nielsen et al. (2016)

The supplied [USDA-ARS-hosted paper PDF](https://www.ars.usda.gov/ARSUserFiles/30100500/Publications%202010-2019/615%202015%20Nielsen%20-%20Cover%20Crop%20Effect.pdf) is Nielsen et al., “Cover Crop Effect on Subsequent Wheat Yield in the Central Great Plains,” *Agronomy Journal* 108:243–256 (2016), DOI `10.2134/agronj2015.0372`.

The study compares winter wheat following cover crops or fallow at Akron, Colorado, and Sidney, Nebraska, in the 2012–2013 and 2013–2014 seasons, under dryland and irrigated water regimes. That yields **eight location × season × regime sets**. The article reports aggregate table values, including grain yield adjusted to 125 g kg⁻¹ moisture, plus contrasts and p-values. It does not provide raw plot-level yield records, replicated values, row-level plot IDs, or a machine-readable source table in the linked PDF.

The eight sets are valuable as published external context and demonstrate that both cover/fallow response and water context vary. They cannot be expanded into fabricated replicate rows, matched labels, or a plot-level learning cohort. A raw plot dataset or a published data supplement with verified replication-level outcomes would be required before using these as training labels.

## Audit boundary and next action

This is an eligibility audit, not a result from running the cover-versus-fallow protocol. Do not combine either source with Colorado Eash, Mandan, or Clovis data; do not backfill missing water depth, sample dates, block IDs, or individual yields; and do not infer profitability from the yield data. The actionable next step is to obtain the Dryad original files through a provider-approved route, then complete the plot/time/block/yield count audit. If Dryad authorization is unavailable, retain it as a documented discovery lead and keep the present accepted count at zero.
