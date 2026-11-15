# Independent paired yield data candidates: raw-source status

This directory contains only public Dryad API metadata snapshots because file downloads were not available without a Dryad bearer token. It does not contain the Dryad CSV or README; no synthetic or scraped substitute is stored here.

- `dryad_dataset_metadata.json`: public dataset metadata for DOI `10.5061/dryad.pvmcvdp2f`, API version 2 endpoint `/api/v2/datasets/doi%3A10.5061%2Fdryad.pvmcvdp2f`.
- `dryad_version_files_metadata.json`: public file inventory for version 461584, endpoint `/api/v2/versions/461584/files`.

Dryad advertised SHA-256 values for the data CSV and README are recorded in `data/analysis/decision_candidates_v1/eligibility.json`. Requests to the file stream returned HTTP 403; the official per-file API returned HTTP 401. Reacquire originals only through the provider's permitted public/authenticated download path, then verify advertised SHA-256 before inspection.
