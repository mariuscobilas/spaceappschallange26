# Atlas dataset search — 15 November 2026

The message `No validated regional dataset is configured on this service.` is defined
in `apps/api/app/services/atlas.py`. `/api/v1/atlas` returns it when
`ATLAS_DATASET_PATH` is empty. The existing illustrative benchmarks and contract
fixtures are intentionally excluded from automatic production configuration.

## Closest economic and agronomic source found

[Eash et al., Dryad: Synergies and trade-offs between ecosystem services and economics
in dryland cover crop systems](https://doi.org/10.5061/dryad.6t1g1jxb0)
contains `Cover_Crop_Trials_Data.xlsx` and a README. Its two adjacent field experiments
at Yellow Jacket, Colorado are described by the repository as spanning 2015–2021; the final paper includes later study-window details. The workbook is described as including
wheat yields, soil moisture/properties and economic inputs, with fallow and cover-crop
comparisons. Economic analysis uses two-year cropping cycles; forage-sale revenue is
an explicitly hypothetical scenario.

Assessment: a strong candidate for a clearly bounded research-site evidence layer.
Published experiments do not establish validated coverage across Kansas or arbitrary
H3 cells. Import must inspect actual worksheet units, treatment controls, sampling
periods, uncertainty and economic assumptions before computing or displaying any
comparison. Do not treat cycle returns as annual returns or soil volumetric water
content as root-zone relative saturation. No numeric workbook values have been
imported or marked regionally validated. The new preparation instead uses source-checked numeric Tables 2 and 4 from the published paper, with exact harvest dates withheld.

## Broader yield-impact source

[Deines et al., study and data availability statement](https://pmc.ncbi.nlm.nih.gov/articles/PMC10099706/)
links its data and R analysis to [Zenodo DOI 10.5281/zenodo.7199708](https://doi.org/10.5281/zenodo.7199708).
The study covers maize and soybean in six Corn Belt states using 2019–2020 outcomes.
Public sample data includes yield, soil and weather attributes, but point coordinates
were removed for privacy and location is available only at county level.

Assessment: investigate county-level evidence at its published geographic scale.
It does not directly supply the app's H3-level crop/scenario economic outputs. Do
not invent sample coordinates or use study-wide effects as per-cell predictions.

## Configuration decision

No drop-in dataset meeting the current full regional Atlas contract was established
from these sources. Keep the quantitative unavailable state until a dataset is
prepared and its intended spatial applicability reviewed. Research-site/county
observations can be integrated separately without changing the AI model. Existing
real USDM drought data supplies regional drought context, not economic returns.

## Prepared and reviewed follow-up

A [real research-site evidence bundle](../data/research/cover-crops/v1/README.md) now combines the downloadable USDA response-crop plots and independently checked Colorado numeric tables. It preserves study boundaries, controls, units and missing values. See the [source catalog](ATLAS-SOURCE-CATALOG.md) and [review](ATLAS-DATA-REVIEW.md). Technical validation passes; external regional predictive validity remains unestablished, so this artifact is intentionally not configured as an Atlas regional prediction dataset.
