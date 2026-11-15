# Map data and refresh notes

## U.S. Drought Monitor overlay data

The repository bundles the dated [U.S. Drought Monitor (USDM)](https://droughtmonitor.unl.edu/) weekly regional assessment for **November 10, 2026**:

- GeoJSON: `apps/web/public/data/usdm-2026-11-10.geojson` (served as `/data/usdm-2026-11-10.geojson`)
- Metadata: `apps/web/data/usdm.json`
- Exact source export: [usdm_20261110.json](https://droughtmonitor.unl.edu/data/json/usdm_20261110.json)
- Source metadata: [USDM metadata](https://droughtmonitor.unl.edu/DmData/Metadata.aspx)
- Use and credit: [USDM permission](https://droughtmonitor.unl.edu/About/Permission.aspx)

The source export contains one MultiPolygon for each of DM0–DM4. The bundle keeps only each feature's `DM` class property. It is not a crop model, field measurement, forecast, yield estimate, or profitability layer. DM0 denotes abnormally dry conditions and DM1–DM4 denote increasing drought severity. This is a weekly regional assessment; do not use the simplified boundaries for official area statistics or field-level recommendations.

Credit the source as requested by NDMC: “The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of Nebraska–Lincoln, the U.S. Department of Agriculture, the National Oceanic and Atmospheric Administration and NASA. Map / Data courtesy of NDMC, via https://droughtmonitor.unl.edu.” The source map and associated data are authorized for third-party use, commercial and non-commercial, with proper attribution under the [USDM permission terms](https://droughtmonitor.unl.edu/About/Permission.aspx).

For display size, the importer first validates the raw source geometry, simplifies each drought class separately with topology preservation at **0.005 decimal degrees**, then snaps coordinates to **five decimal places** with valid-output precision handling. The importer validates each result and refuses to repair invalid raw source geometry. Simplifying each class independently can create narrow gaps or overlaps at class boundaries, and snapping can remove slivers; the resulting file is for map display only. The dated source URL, as-of date, raw and processed SHA-256 digests, attribution, tolerance, coverage, colors, and limitations are recorded in `apps/web/data/usdm.json`. No fetch timestamp is written, so the same source and pinned processing version produce reproducible metadata.

### Refresh the bundled USDM file

Use a temporary Python environment for processing. Shapely is an importer-only dependency; it is not needed by the web app or API at runtime.

```sh
python3 -m venv /tmp/fieldshift-geodata
/tmp/fieldshift-geodata/bin/pip install shapely==2.1.2
/tmp/fieldshift-geodata/bin/python scripts/import-usdm.py --date 2026-11-10
```

Pass a local, previously downloaded exact-date source file with `--input`. Its name must match the requested publication date (`usdm_YYYYMMDD.json`). Without `--input`, the script downloads only the exact dated URL. USDM assessments use a Tuesday as-of date and are normally released on Thursday; use the desired Tuesday assessment date, not “latest”, when refreshing. The script limits raw input to 20 MB and processed GeoJSON to 2 MB, requires exactly one valid feature for each DM0–DM4 class, refuses invalid source geometry, and writes both output files only after validation succeeds. Keep raw downloads outside the repository.

## Basemaps and orientation geometry

- **OpenFreeMap** Light, Streets, and Dark styles use OpenStreetMap data through OpenFreeMap. The map displays the provider attribution; see [OpenFreeMap](https://openfreemap.org/) and [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).
- **USGS topographic** tiles come from [The National Map](https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer). **USGS aerial** tiles use the [USGS imagery service](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer); imagery dates and coverage vary by location, and it is not live imagery. Attribution is rendered in the map.
- `apps/web/public/data/conus.geojson` is a generalized coastline derived from [Natural Earth 1:110m Admin 0 countries](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), in the public domain. It supports geographic orientation and fallback map coverage; it is not parcel, ownership, or crop geometry.

The real USDM overlay is separate from the H3 regional economics dataset. It must not be used to fill missing H3 crop or return values.

## Interface behavior

Choose a base map in **Map options → Base map** on Explore, My fields or Atlas. These keyless public services require internet access. Failed providers use local geography and offer **Retry base map**, while preserving the camera, field boundary and selection. Provider preferences persist with the workspace. While a new polygon is being drawn, finish or cancel before changing the base map. Provider failures defer the fallback style swap until drawing ends, preserving active vertices. Completed boundary drafts remain editable across map changes.

The optional **U.S. Drought Monitor** checkbox is available on Explore and My fields. It downloads the 661 KB snapshot only when enabled and shows its date, D0–D4 legend, attribution, loading state and retry action. It is independent of NASA observation dates. The layer is hidden in Regional Atlas to keep drought categories separate from financial colors; the preference is restored on return. The bundle does not refresh automatically. Run the importer, verify the source date/hash and geometry, then review and deploy the updated bundle.
