# Cover-crop and yield data sources

Research catalog checked 15 November 2026. These are candidate evidence sources,
not plug-in regional Atlas layers. Preserve the study's scale, observed versus
modelled status, units, and limitations when reusing them. None of the sources below
supports fabricating field-level net returns.

## Candidate datasets

| Source | Coverage and period | Available measures and access | Reuse / fit |
| --- | --- | --- | --- |
| [USDA-ARS Mandan response-crop yields](https://doi.org/10.15482/USDA.ADC/26836453.v1) | Three research fields near Mandan, North Dakota; response years 2009–2011. | Downloaded 944 plot records: spring wheat, corn, soybeans, dry pea; treatment/control identifiers, grain yield in kg/ha and grain moisture. CSV and repository metadata/checksums available; CC0. | Prepared in the v1 research bundle. Descriptive trial contrasts only; no economic values or regionally validated predictions. Distinct from the companion soil dataset below. |
| [USDA-ARS, late-seeded cover crops near Mandan, North Dakota](https://catalog.data.gov/dataset/data-from-short-term-soil-responses-to-late-seeded-cover-crops-in-a-semi-arid-environment), DOI [10.15482/USDA.ADC/25805209.v1](https://doi.org/10.15482/USDA.ADC/25805209.v1) | Three-year study at the Area IV Soil Conservation Districts Cooperative Research Farm near Mandan; metadata period 2008-08-21 to 2011-05-18. Rainfed, no-till, late-August sowing into dry pea residue. | Direct CSV and XLSX downloads include aboveground biomass, profile soil water, soil nitrate-N, near-surface soil properties, and residue cover, plus metadata/data dictionary. Data.gov reports CC0 1.0 and public access. | Strong, machine-readable regional comparison for late-seeded cover crop biomass and soil response. It is one research farm and an old three-year window; the dataset does not report following cash-crop yield or economics. Use it as measured context, not current statewide prediction. |
| [Sone et al., cover-crop composition and winter wheat yield](https://datadryad.org/dataset/doi:10.5061/dryad.pvmcvdp2f), DOI [10.5061/dryad.pvmcvdp2f](https://doi.org/10.5061/dryad.pvmcvdp2f) | Experimental plots at the NRCS Plant Materials Research Center in Pullman, Washington (46.71746, -117.14637), established May 2019 and maintained through July 2022. | Dryad provides full and outlier-removed CSVs (~42 KB each) and README. Includes cover-crop treatments, winter wheat yield (kg m⁻²; July 2022), vegetation biomass, soil water, pH, soil carbon/nitrogen, and microbial measures. Dryad releases are CC0. | Direct observed yield response following cover-crop composition treatments; especially useful for treatment contrasts and unit-handling tests. It is a small plot experiment at one site, not geographically generalizable by itself; no enterprise budget/net-return variables. |
| [Pacheco et al., Nebraska cover-crop performance database](https://datadryad.org/dataset/doi:10.5061/dryad.x0k6djhwn), DOI [10.5061/dryad.x0k6djhwn](https://doi.org/10.5061/dryad.x0k6djhwn) | Multiple Nebraska ecoregions, UNL research stations and private farms; trials from 2022–2024. | Nine structured CSVs (~758 KB total) and data dictionary. Measures include spring/summer/fall biomass, height, nutrient content, NDVI/NDRE, fall soil and root measurements, and agronomic/site metadata. Dryad releases are CC0. | Useful for regional cover-crop growth, species, management, and vegetation-index evidence. The repository describes cover-crop performance, not subsequent cash-crop yield or farm economics. Location and trial metadata must be used to avoid implying statewide uniformity. |
| [Eash et al., modeled U.S. cover-crop climate-mitigation scenarios](https://datadryad.org/dataset/doi:10.5061/dryad.fbg79cp3v), DOI [10.5061/dryad.fbg79cp3v](https://doi.org/10.5061/dryad.fbg79cp3v) | County-level coverage of contiguous U.S. cropland; DayCent simulations over 20 years, comparing baseline cover-crop adoption with an 80% adoption scenario. | Shapefile and metadata/maps (~136 MB total; main polygon file ~127 MB). Fields include mean and standard deviation of annual soil-organic-carbon stock change and N₂O flux for baseline and high-adoption scenarios, county cropland area, and adoption area. Dryad releases are CC0. | Useful for county-scale climate-mitigation context and uncertainty, not crop yield or farm profitability. These are modeled outcomes, not field observations; do not reinterpret the 80% scenario as a yield/net-return forecast or assign it to finer cells. |

## Existing comparison sources

- [Eash et al., Dryad: ecosystem services and economics in dryland cover-crop systems](https://datadryad.org/dataset/doi:10.5061/dryad.6t1g1jxb0) is a small workbook from two adjacent trials at Yellow Jacket, Colorado (2015–2021), with wheat yield, soil/water and economic analyses. Forage-sale revenue is a hypothetical scenario, and reported economic comparisons follow two-year rotations. This is the closest direct economic evidence found, but remains research-site evidence.
- [Deines et al., Zenodo 7199708](https://zenodo.org/records/7199708) accompanies a study of cover-crop adoption and maize/soybean outcomes across six Corn Belt states in 2019–2020. It has yield, soil, and weather covariates, but privacy limits its location to county scale; it is not point or H3-level economics.

## Integration guidance

The Mandan, Pullman, and Nebraska repositories are the best small, directly downloadable
empirical candidates for agronomic/yield evidence. Eash supplies the most directly
relevant economic workbook, but only for its own study assumptions and site. The
county-scale DayCent shapefile can supplement a climate-mitigation view if its modeled
scenario and resolution remain explicit. Before any import, inspect source columns,
units, treatment controls, missingness, coordinate disclosure, and redistribution terms
against the downloaded files. Preserve nulls and observed/modelled provenance; do not
use cross-site measurements to populate unsupported H3 cells.

## Prepared delivery

The response-crop data and published Colorado no-forage budget tables are now prepared in [the research evidence bundle](../data/research/cover-crops/v1/README.md). See [the independent review](ATLAS-DATA-REVIEW.md) for validation scope and limits. Other candidates remain catalog entries; their records have not been pooled or promoted to regional predictions.
