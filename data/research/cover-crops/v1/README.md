# Prepared cover-crop research evidence v1

Prepared and reviewed 15 November 2026. **Valid for historical research-site
comparisons; regional predictive validity is not established.** This is a real
source-backed dataset, separate from the app's illustrative fixtures and AI model.

## Contents

- `prepared.json`: normalized, machine-readable observations and descriptive comparisons (about 562 KB).
- `validation.json`: output SHA-256, counts, exposed budget rounding residuals and limitations.
- `source/`: original USDA CSV downloads and repository metadata; numeric transcriptions of the publisher's Colorado tables.
- [Independent source review](../../../../docs/ATLAS-DATA-REVIEW.md).
- [Additional source catalog](../../../../docs/ATLAS-SOURCE-CATALOG.md).

The primary sources are the [USDA Mandan response-crop dataset](https://doi.org/10.15482/USDA.ADC/26836453.v1)
and [Eash et al. (2025), Tables 2 and 4](https://doi.org/10.1002/ecs2.70397).
USDA CSVs are CC0; their bytes match repository-supplied MD5s and are additionally
pinned with SHA-256. Colorado files contain cited numeric facts transcribed from
the published tables, independently checked by a separate AI-assisted reviewer.
The publisher's article text is not redistributed. The Dryad workbook could not
be retrieved (HTTP 403/401), so no raw-workbook validation is claimed.

## Data dictionary and coverage

| Collection | Records | Meaning |
| --- | ---: | --- |
| `plotObservations` | 944 | USDA response-crop plot yields in 2009–2011. Crops remain spring wheat, corn, soybeans and dry pea. Includes both control types. |
| `publishedSiteMeans` | 24 | Colorado trial/tillage/cycle treatment means. Six wheat yields are explicitly not evaluated and stay null. |
| `publishedBudgets` | 8 | Historical, no-forage partial enterprise budgets; includes fallow controls. |
| `yieldComparisons` | 231 | 216 USDA contrasts and 15 Colorado contrasts; four Colorado contrasts have missing yields. |
| `economicComparisons` | 16 | 11 cycle-specific and 5 published-mean Colorado budget differences from matching fallow controls. |

USDA yields are kg/ha as reported, with no invented grain-moisture normalization.
`grainMoisturePct` measures harvested grain moisture, **not soil moisture**.
Colorado wheat yields are converted from Mg/ha by multiplying by 1000;
`soilWaterStorageMm` stays in mm. No relative root-zone wetness is inferred.
Economic amounts are nominal historical **USD/ha per two-year crop cycle**; they
are partial budgets, not annual whole-farm profit. Hypothetical forage sales are
excluded. Economic observations are never joined onto USDA plots.

For USDA, contrasts match crop and response year, pair the four replicate identifiers,
and use untreated control TRT 1. TRT 20 is a distinct disturbed control: its 32 raw
observations remain available but are excluded from cover-crop contrasts. Percent
penalty is `100 × (control mean − treatment mean) / control mean`; negative values
mean higher treatment yields. Paired yield differences are reported separately.
These are descriptive calculations; no significance tests or new predictive model
are created. Colorado controls additionally match trial, tillage and cycle. Exact
harvest dates and plot boundaries remain unknown. Source field coordinates are
study locations, without invented plot assignments or regional coverage polygons.

Source row references use physical CSV line numbers, including the header. IDs are
unique within each collection; `observationIds`/`controlObservationIds` reference
`plotObservations` for Mandan and `publishedSiteMeans` for Colorado. Budget references
resolve within `publishedBudgets`.

## Reproduce and validate

From the repository root, Python standard library only:

```sh
python3 scripts/prepare-cover-crop-evidence.py
python3 scripts/prepare-cover-crop-evidence.py --check
python3 -m unittest discover -s scripts/tests -p 'test_cover_crop_evidence.py' -v
```

The build refuses changed source bytes, invalid fields, duplicate/unbalanced plots,
missing controls, zero control denominators, non-finite numbers and budget arithmetic
outside the documented USD 0.10/ha/cycle rounding tolerance. Published budget means
are retained, not silently recalculated; the largest residual is USD 0.06. Repeated
runs produce identical bytes. A new source revision requires a new reviewed snapshot
and deliberate hash changes, not bypassing checksum checks.

The six regression tests independently reconcile all USDA contrasts to original CSV
rows, check economic baselines and units, verify known conversions/gains and missing
outcomes, reproduce saved artifacts, and reject tampered data and zero controls.
The separate worker reviewed every transcribed Colorado table row against the
publisher and checked provenance and geographic limits. This is technical and
AI-assisted source review, not external scientific certification.

## Application boundary

This bundle intentionally uses a **research-evidence contract**, not `AtlasDataset`.
Do **not** set `ATLAS_DATASET_PATH` to `prepared.json` or label it a regionally validated
prediction layer. It can support a future study-site evidence view, with its source
labels and controls intact. A regional layer still needs representative spatial
coverage, reviewed aggregation and independent assessment of predictive applicability.
No regional H3 values, active-area estimates or current farm returns were invented.
