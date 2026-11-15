# Regional Atlas — published county yield effects

Updated 15 November 2026. The historical county study is now an optional Explore
view under Map options → Historical research. `/atlas` redirects to this view and
preserves valid research filters. The standalone Atlas sidebar/toolbar are removed.
Planning field/crop context remains independent from geographic inspection.

The API serves the reviewed bundle by default; no local dataset environment variable
is required. The financial H3 renderer/API remain available in code, but net-return
controls are not exposed without usable validated regional economic coverage.

## Source, meaning and coverage

[Deines et al. (2022/2023)](https://doi.org/10.1111/gcb.16489) published an observational
cover-crop yield analysis and [archived data/code](https://doi.org/10.5281/zenodo.7199708).
The archive contains the authors' precomputed causal-forest log-yield effect estimates
and public county geography. The importer transforms each published estimate using
`100 × (exp(prediction) − 1)` and calculates the arithmetic mean within county, crop
and selected period. It does not train, refit, or run a model.

The result is a **post-publication county mean of published sample-level estimates**,
not an original published county estimate or newly validated county causal effect.
It is a useful historical regional research layer, not a county-wide measurement,
a current field forecast, an agronomic recommendation or a financial return.

| Crop | 2019 counties | 2020 counties | Combined 2019–2020 counties |
| --- | ---: | ---: | ---: |
| Corn | 445 | 448 | 466 |
| Soybeans | 460 | 470 | 480 |

The bundled geometry covers **486 counties** across Illinois, Indiana, Iowa, Michigan,
Missouri and Ohio. There are **2,769 crop/period estimates**, derived from **45,499 corn**
and **44,110 soybean model sample records**. Groups below 10 records are withheld.
Gray/no data means no qualifying estimate for that filter, not zero yield effect or
zero active acreage. Sample counts are not independent farms or population acreage.
Pooled means weight records equally, not years or land area. Annual counts remain
visible because some counties have support in only one year.

The county-labelled exports are a complete-case subset of the state-only files:
96 corn and 125 soybean records are not in that subset. The importer checks every
included prediction against the state-only reference multiset and reproduces the
authors' percent conversion to floating-point precision. No unsupported sample
locations are recovered. Only allowlisted CATE fields enter county aggregates; raw
point-sample files are never extracted or republished.

## Display and interaction

The Atlas uses county polygons at the disclosed data scale, not finer H3 copies.
A fixed crimson-to-emerald scale shows negative/positive mean yield effects in
percent, clipped visually at ±10%; full values remain inspectable. Crop and period
filters, sample counts, no-data coverage, source details and fit-to-study controls
are available. NASA imagery dates remain independent of the study period.

The original H3/deck.gl economics renderer is retained for future configured
financial coverage, without an ordinary UI entry. Neither the historical trial bundle nor these regional yield effects
are used to fabricate USD/ha returns, crop area, soil texture or root-zone wetness.
Those require appropriate independent sources.

The API endpoint is `GET /api/v1/atlas/regional-yield`. The default file is
`shared/data/regional-yield.json`; `ATLAS_REGIONAL_YIELD_PATH` optionally overrides it.
Explicitly missing/malformed data returns a typed empty unavailable envelope.
The client can use the identical bundled web copy if the API network request fails;
it does not replace an explicit API unavailable/invalid response with fallback data.
Source availability and the bundled-copy state remain visible.

## Preparation and checks

The 84 MB source archive stays outside Git. Download it from the official versioned
record and verify its MD5 `8bf24757d697d57f3e0087e8dd8e34bb` and SHA-256
`619c191fe4231f1aa8d15075879484155d587413c010dac5492b00c50bf88ff0`.

```sh
curl -L --fail 'https://zenodo.org/api/records/7199708/files/Deines_etal_2022_GCB_coverCropsAndYields-v1.0.0.zip/content' -o /tmp/deines-cover-crops-v1.zip
python3 -m venv /tmp/fieldshift-geodata
/tmp/fieldshift-geodata/bin/pip install shapely==2.1.2 pyshp==2.3.1 pyproj==3.7.2
/tmp/fieldshift-geodata/bin/python scripts/prepare-regional-yield.py --archive /tmp/deines-cover-crops-v1.zip
/tmp/fieldshift-geodata/bin/python scripts/prepare-regional-yield.py --archive /tmp/deines-cover-crops-v1.zip --check
python3 -m unittest discover -s scripts/tests -v
```

Importer dependencies are isolated and unnecessary at API runtime. Preparation writes
identical API/web JSON files (~643 KB) and a machine-readable audit at
`data/research/regional-yield-v1/validation.json`. It verifies archive/source hashes,
subset membership, transformations, unique records, county/state joins, geometry and
thresholds. County polygons are reprojected from the source Albers CRS to EPSG:4326
and simplified at 0.003 degrees for display. They are not parcel boundaries or area
weights. The source projection has an unknown datum label; display simplification
and the recorded geometry error bound preclude survey-level interpretation.

The [independent AI-assisted review](REGIONAL-ATLAS-REVIEW.md) reproduced every emitted
mean and count without mismatches. Data tests independently re-aggregate the archive,
check weighted-year consistency, privacy fields, geography and API/web file identity.
Shared TypeScript/Pydantic contracts and fixtures cover the new endpoint. Technical
checks do not establish new independent regional predictive validity.

## Remaining acceptance

This delivers a usable regional research layer. Current field forecasts, nationwide
coverage, regional financial-return scenarios and hardware 60 fps acceptance remain
separate requirements. The source's archived model outputs are consumed as data;
the application's AI model remains untouched.

## Delivery verification

- Full frontend regression: **99/99 passed**. The final header/title clarification
  was followed by another **7/7 county workflow checks**.
- Backend: **38/38 passed**; data preparation/regression checks: **10/10 passed**,
  including independent full re-aggregation from the original archive.
- Shared JSON fixtures: **18/18 passed**; TypeScript and production build passed.
- Live API returned `available` with all **486 counties**. Desktop and 390×844 mobile
  views were inspected, including scroll-bounded source disclosure with no horizontal
  overflow. Mobile crop/year controls retain 44px touch targets.
- Layer switches preserve separate county/economics cameras; reset fits county
  coverage. Browser coverage includes malformed/oversized input, transport timeout,
  explicit API unavailable, actual bundled fallback, filter/picking, phone details,
  original H3 hover and source soil diagnostics, field drawing and backup flows.

The software-WebGL economics benchmark continues to record performance below the
60fps target; passing regression tests does not close hardware performance acceptance.
All work is local and uncommitted; no model code or deployment was changed.
