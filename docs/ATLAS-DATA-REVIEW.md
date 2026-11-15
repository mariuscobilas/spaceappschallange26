# Cover-crop evidence bundle review

Review date: 2026-11-15  
Reviewer: separate Luna worker; AI-assisted source and transformation review, not external scientific certification  
Scope: `data/research/cover-crops/v1/` and `scripts/prepare-cover-crop-evidence.py`. No application, API, Atlas configuration, or model files were changed.

## Decision

**Pass for bounded research-site evidence; fail for regional prediction or Atlas H3 promotion.** The prepared data preserves two distinct studies, their units, source identifiers, controls, missing values, and economic-period definitions. It does not claim to validate Kansas or any region-wide cell-level prediction. Keep `atlasRegionalCompatible: false` and `regionalPredictiveValidity: not_established`.

No material numeric discrepancy was found in the included published-table transcriptions or derived comparison counts. This review did not download or verify the Eash Dryad workbook: the recorded repository access attempt returned HTTP 403/401. The checks below compare only the manually transcribed table CSVs with the publisher’s open article, and the USDA CSVs with their repository checksums and metadata.

## Source and numeric checks

### USDA Mandan response-crop records

- The 944-row response-crop CSV digest matches its Ag Data Commons/figshare supplied MD5 (`91dbf1814e42f70ca346b9dea3867068`). The accompanying response metadata and treatment dictionary also match the MD5s recorded in `mandan-source-metadata.json` (`679ca746a8a5582cea95ff72968b8472` and `20b4f4b4ad0eaadd3d3ad59a595becb8`). The preparation script additionally pins all three with SHA-256.
- Independently counted 944 observations: 864 seeded cover-crop treatment observations (TRT 2–19), 48 non-seeded control observations (TRT 1), and 32 disturbed non-seeded control observations (TRT 20). Every year × response-crop × treatment group has four distinct replicates. There are no duplicate year/crop/treatment/replicate keys, and each cover-crop replicate has a same-year, same-crop TRT 1 control replicate.
- The derived 216 Mandan comparisons are descriptive, matched by the same response year, crop, and replicate identifier. The reported percent penalty uses the treatment-group mean and control-group mean; paired yield differences are separately recorded. This is a transparent descriptive calculation, not a significance test.
- Source metadata identifies `YIELD` as kg ha⁻¹ and `MOISTURE` as grain moisture percent. The latter is not soil moisture. `TESTWT` is appropriately excluded pending unit-description review.
- TRT 20 appears only in 2010–2011 in this CSV and is retained as raw observations while excluded from the cover-crop contrasts. This control distinction is material and correctly handled.

### Eash et al. 2025, Table 2

- Compared all 24 transcribed rows, including both trials, NT/CT contexts, all cycle/treatment combinations, wheat yields, and soil water values, against Table 2 in the published article. Values match the article. The six T2 Cycle 3 wheat-yield records (four cover-crop and two fallow means) are marked NE in the source table and remain null with `yieldMissingReason: not_evaluated`; they are not converted to zero.
- The resulting 15 non-fallow treatment contrasts are distinct from the 216 Mandan comparisons. Eash contrasts are based on published site means, with `pairedReplicates: null` and no plot-level IDs or fabricated replicate precision.
- The paper reports winter-wheat yield in Mg ha⁻¹; conversion to kg ha⁻¹ is ×1000. Its soil-water storage values remain in mm and are not recast as a root-zone saturation/wetness fraction.
- The paper’s cycles are two-year crop cycles, not harvest-year labels. The prepared records leave harvest year null. Trial 1 and Trial 2 were established in 2015 and 2016, respectively, but exact harvest dates are not assigned from cycle labels.

### Eash et al. 2025, Table 4 economics

- Compared all eight transcribed no-forage rows against the published Table 4: both Trial 1 NT rows and all Trial 2 NT/CT fall-cover, spring-cover, and fallow rows. Transcribed average cost, wheat revenue, each available cycle net return, and published mean net return match the table.
- All eight source budgets are labeled USD/ha/2-year-cycle. The derived 16 cover-crop-vs-fallow economic contrasts consist of 11 available cycle-specific comparisons and five published-mean comparisons. Cycle 3 is unavailable for Trial 2; no value is inferred.
- Each published mean is preserved. The script checks its difference from the arithmetic of the displayed cycle values and from wheat revenue minus average cost. The maximum absolute residual is USD 0.06/ha/cycle, below the stated USD 0.10 tolerance, consistent with the article’s rounded inputs. These rounding residuals are exposed in `validation.json`, not silently corrected.
- The table’s forage columns describe the hypothetical 50% biomass-removal forage-sale case. Those values are excluded from this no-forage dataset. The paper states that its field trials did not actually harvest forage biomass, so these modeled scenarios must not be presented as observed revenue.

## Material caveats and follow-up

1. **High — geographic scope.** The two studies are research-site evidence from Mandan, North Dakota, and Yellow Jacket, Colorado. Their observations do not establish coverage, active acreage, or predictive validity for Kansas or other regional H3 cells. The three Mandan catalog coordinates denote research fields but are not assigned to individual plot observations. The Yellow Jacket coordinate is approximate to one arcminute, not a plot boundary. The dataset must remain separate from regional Atlas prediction outputs.
2. **High — not a pooled study.** Mandan spring wheat/corn/soybean/dry pea response-crop observations and Colorado winter wheat outcomes differ in region, study design, treatment definitions, year/cycle structure, and measurement. Keep the sources, controls, and economic records separate; do not pool them into one generalized yield penalty or map the Colorado budget onto Mandan plots.
3. **Medium — dates and budgets.** Mandan catalog temporal metadata and observed response years do not line up exactly; the raw `YEAR` values should be retained, with no invented planting/harvest dates. Colorado budgets use historical prices and costs, discounted two-year crop cycles, and are not current annual farm profit. These caveats are retained in the prepared data.
4. **Medium — raw Eash workbook unavailable.** The published numeric table values were checked against the article, but the supplementary Dryad workbook itself was not downloaded. Do not describe this review as an independent raw-workbook or plot-level validation.
5. **Low — descriptive only.** The prepared yield and economic deltas do not import the article’s significance letters or p-values and must not be presented as inferential evidence. The scripts’ source checks validate shape, units, matching, arithmetic, and missingness; they do not validate external predictive performance.

## Reproduction

`python3 scripts/prepare-cover-crop-evidence.py --check` passes against the saved `prepared.json` and `validation.json`. The reported output contains 944 raw observations, 24 published Table 2 means, 8 Table 4 no-forage budgets, 231 yield comparisons (4 missing outcomes retained), and 16 economic comparisons. This check verifies the pinned snapshots and deterministic output; it does not download the Eash workbook or establish regional validity.

## Sources

- [Ag Data Commons Mandan dataset, DOI 10.15482/USDA.ADC/26836453.v1](https://doi.org/10.15482/USDA.ADC/26836453.v1)
- [Ag Data Commons article metadata and file manifest](https://api.figshare.com/v2/articles/26836453/versions/1)
- [Eash et al. (2025), “Synergies and trade-offs between ecosystem services and economics in dryland cover crop systems,” DOI 10.1002/ecs2.70397](https://doi.org/10.1002/ecs2.70397)
- [Eash et al. Dryad data DOI 10.5061/dryad.6t1g1jxb0](https://doi.org/10.5061/dryad.6t1g1jxb0) (workbook not retrieved in this review)
