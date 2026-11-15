# Regional cover-crop yield layer review

Review date: 2026-11-15; separate Luna worker, AI-assisted review  
Scope: the Deines et al. Zenodo archive, `scripts/prepare-regional-yield.py`, and the generated `shared/data/regional-yield.json`. This independent review did not modify app, API, shared contract or model code; integration is handled separately.

## Recommendation

**Suitable as a clearly labeled historical county summary of published model estimates in the six covered states. It is not a newly estimated county effect, a county-wide yield measurement, a current field forecast, or evidence for H3 cells outside these counties.**

The archive contains per-sample causal-forest conditional average treatment effect (CATE) predictions with county FIPS identifiers, so this is not a raw-yield comparison. The proposed layer re-aggregates those published sample-level model outputs by county. That is a defensible first regional layer if the client consistently shows the crop, period, sample support, and limitations with the value.

## Findings by priority

### High — source archive contains sample coordinates in files marked as de-localized

The archive README and filenames say the point coordinates were removed. However, the soybean point-sample CSV includes `latitude` and `longitude` columns, and the maize placebo point-sample CSV includes a `lat_lon` field. These are potentially sensitive sample locations inconsistent with the archive’s stated de-identification and must not be read, extracted into the project, logged, or redistributed. The regional importer’s allowlist correctly reads only the two CATE-with-covariables CSVs, state-only CATE reference CSVs, and the public county geometry files. Keep that restriction. The source ZIP remains a temporary review artifact; do not add it or raw point-sample files to the repository.

### High — county values are post-publication summaries, not published county estimates

The paper reports CATE summaries on a regular 5 km grid and state/region results. The per-sample CATE exports retain `fips5`, but the paper does not publish this county aggregation. The new county values therefore need to be called **county means of published sample CATE estimates** or equivalent. Do not call them independently validated county causal effects, field predictions, or average county yield losses. Do not generate H3 copies, interpolate through counties without estimates, or assign estimates to other states.

### Medium — these are model effects on remotely sensed yield estimates

Deines et al. analyze annual maize and soybean yield outcomes for 2019–2020 from the SCYM satellite yield mapper; they are not plot-harvest observations. Their observational causal-forest analysis compares fields classified as cover-cropped for at least three years during 2015–2020 with non-adopting fields. The archive preserves the authors’ published log-yield CATE predictions, and the paper converts each prediction to a percent effect with `100 × (exp(prediction) − 1)`. The independent check reproduced the published `tauPercents` values to floating-point precision. The county aggregation follows the same per-record transformation before arithmetic averaging.

### Medium — source sample and incomplete county support

The county-labelled covariables outputs are complete-case subsets: 45,499 corn records versus 45,595 state-only CATE records, and 44,110 soybean records versus 44,235 state-only records. The omitted 96 corn and 125 soybean records have no county linkage in the state-only files. The output correctly aggregates only the county-labelled subset and records that limitation. Do not imply these county means reproduce the paper’s full-sample 5 km raster.

The subset covers 501 corn counties and 505 soybean counties before support suppression. With a 10-record minimum, the output contains 486 county features and 2,769 county × crop × period estimates:

| Crop | 2019 estimates | 2020 estimates | Pooled 2019–2020 estimates |
|---|---:|---:|---:|
| Corn | 445 | 448 | 466 |
| Soybeans | 460 | 470 | 480 |

Pooled summaries are equally weighted by sample record, not by land area or year. The source has counties with no records in one of the two years, so `sampleRecordsByYear` should remain visible in the client alongside `sampleRecords`. Fewer than 10 records are withheld. These counts are model sample records, not independent farms, population acreage, or confidence-interval sample sizes.

### Medium — no financial or soil-condition fields are supported

This archive supplies yield-effect estimates, not farm economics. It does not support a monetary return, a cover-crop termination recommendation, active acreage, soil texture, or regional root-zone saturation value. Do not join those fields from the separate research-site data or calculate them from these percent effects.

### Low — map geometry is display-only

The source county file has 1,055 public county polygons in an Albers equal-area projection. All county FIPS values used by the CATE output have a matching source `GEOID`. The prepared output reprojects and simplifies matched county polygons for web display, producing 486 valid GeoJSON county features. Keep simplification confined to display geometry; it does not define sample locations or statistical weights.

## Independent checks

- Archive size is 84,279,382 bytes and its MD5 is `8bf24757d697d57f3e0087e8dd8e34bb`, matching the Zenodo record. SHA-256 is `619c191fe4231f1aa8d15075879484155d587413c010dac5492b00c50bf88ff0`.
- The CATE-with-covariables files contain no latitude/longitude fields. Their records have valid five-digit county FIPS, match the six study-state FIPS, and all output county FIPS match county polygon `GEOID`s.
- Independent aggregation of all county-labelled source rows reproduces the emitted annual and pooled means, record counts, crop/period groups, and 10-record suppression with no mismatches.
- The article’s effect conversion formula independently matches every state-only CATE reference row to floating-point precision.
- The importer does not read raw point-sample files, does not refit or run a model, and does not emit sample IDs or private sample locations.
- The output has no financial returns, H3 assignments, or interpolated estimates. Its six-state, 2019–2020, record-weighted scope is explicit.

## Sources

- [Deines et al. (2022), “Recent cover crop adoption is associated with small maize and soybean yield losses in the United States,” full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10099706/)
- [Zenodo archive, DOI 10.5281/zenodo.7199708](https://doi.org/10.5281/zenodo.7199708)
- [Archive file manifest](https://zenodo.org/api/records/7199708)
- [U.S. Census Bureau TIGER/Line county geography](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html)
