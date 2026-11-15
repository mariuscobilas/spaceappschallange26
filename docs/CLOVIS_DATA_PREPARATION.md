# Clovis task 1: source audit, frozen splits, and moisture labels

This task prepares the measured labels for the one-day cover-crop MVP. It does not download NASA weather, fit a model, or calculate recommendations. The first demo uses Clovis, New Mexico. The earlier Kansas/Colorado/Australia work remains separate research.

## Run

From the repository root, using the installed API dependencies:

```powershell
apps/api/.venv/Scripts/python.exe apps/api/app/ml/prepare_clovis.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests -p test_prepare_clovis.py -v
```

On Unix, replace `Scripts/python.exe` with `bin/python`.

Inputs are resolved relative to the repository, not the current directory. To prepare a deliberately changed dataset/protocol, use a new directory with `--output data/processed/clovis_v2`. Reusing an output directory with changed source hashes or split policy fails rather than silently changing the frozen evaluation set.

## Authoritative sources

- `data/figshare_yin_daily.csv`: 709 dates, 16 July 2022 through 23 June 2024; moisture and irrigation.
- `data/figshare_yin_activity.xlsx`: `Sheet1` operation dates, irrigation in centimeters, and sensor-phase headings.
- [Original data release](https://doi.org/10.6084/m9.figshare.30263209) and [study methods](https://doi.org/10.1002/vzj2.70077).

The root daily/activity copies are checked for byte equality. The source manifest inventories the optional five-minute files and the separate Colorado workbook without incorporating them into this dataset. Raw files are never edited. Attribution is recorded; redistribution rights still need verification before publishing raw files.

## Frozen protocol

`apps/api/app/ml/clovis_protocol.json` fixes the site, treatment mapping, dates, physical-value rules, and split policy before preprocessing. The generated split manifest binds this protocol to SHA-256 hashes of both authoritative input files. Changing any of those inputs requires a new output version. It is frozen local provenance, not tamper-proof storage; version the protocol and manifests with the project.

| Partition | Inclusive dates |
| --- | --- |
| Train | 2022-07-16 through 2023-04-23 |
| Purge gap | 2023-04-24 |
| Validation | 2023-04-25 through 2023-05-08 |
| Purge gap | 2023-05-09 |
| Test | 2023-05-10 through 2024-06-23 |

Every treatment on a date has the same partition. A daily-change pair requires consecutive dates, eligible readings at both ends, and the same non-gap partition at both ends. This excludes pairs entering validation or test from a preceding gap.

The preparation step uses only deterministic cleaning, with no fitted transforms. The quality report exposes coverage and exclusion counts, not held-out moisture distributions or extrema. Fit scalers, imputers, thresholds, and other learned transforms on training data in the later model task. Do not tune against the final test. Later lag windows longer than one day require a new purge/boundary policy before modeling.

## Outputs

Default directory: `data/processed/clovis_v1/`.

| File | Meaning |
| --- | --- |
| `source_manifest.json` | Input hashes, roles, sizes, duplicate checks, source links, and pending NASA status. |
| `split_manifest.json` | Frozen date policy and authoritative input/protocol hashes. |
| `daily_observations.csv` | All four treatments on all dates, including missing/flagged rows. |
| `train_pairs.csv` | Eligible one-day labels for training only. |
| `validation_pairs.csv` | Eligible labels for method selection only. |
| `test_pairs.csv` | Eligible labels reserved for final evaluation. |
| `activity_events.csv` | Dated workbook events, original row references, and irrigation in mm. |
| `quality_report.json` | Machine-readable structural checks, phase/partition counts, and exclusions. |
| `quality_report.md` | Human-readable result and remaining limits. |

Rerunning with identical inputs and code produces byte-identical files; timestamps are deliberately omitted from artifact content. The report records the preparation script hash. No model files or large raw copies are created.

## Column contract

| Column | Definition |
| --- | --- |
| `site_id` | `clovis_nm`; published coordinates are approximately 34.583333, -103.2. |
| `date` | ISO calendar date from the source. Time-zone alignment with NASA remains a separate task. |
| `partition` | `train`, `validation`, `test`, or `gap`. |
| `treatment` | `fallow`, `pea`, `oat`, or `six_species_mix`. |
| `sensor_depth_cm` | 5; a measurement location, not an integrated soil-layer thickness. |
| `soil_moisture_m3_m3` | Source volumetric fraction (0.25 means 25%); blank when missing/invalid. |
| `target_eligible` | CSV 1/0. Valid number and within a documented sensor window; independent of split. Gap-partition readings are never used in pairs. |
| `irrigation_mm` | Recorded daily irrigation, converted from cm by multiplying by 10; never inferred from moisture. |
| `management_phase` | `sorghum`, `fallow_before_cover`, `cover_period`, `fallow_after_cover`, or `winter_wheat`. |
| `cover_active` | 1 for non-fallow treatments on/after cover planting and before termination; otherwise 0. |
| `days_since_cover_planting` | Calendar days since actual planting; blank before planting and for fallow. |
| `days_since_cover_termination` | Calendar days since actual termination; blank before termination and for fallow. |
| `quality_flags` | Pipe-separated reasons; may overlap. A reported number outside a sensor window is retained but ineligible. |
| `source_id`, `source_column`, `source_row` | Provenance back to the raw release and header/row. |
| `previous_date`, `previous_moisture_m3_m3` | Immediately preceding eligible date and moisture, same treatment and split. |
| `moisture_change_m3_m3` | Current minus previous moisture, rounded to 12 decimals for serialization. This is the target; current moisture must not become an input to its own prediction. |

All CSV files use UTF-8, ISO dates, decimal points, blank nulls, and 1/0 booleans. In later training, load only `train_pairs.csv` for fitting. Pair rows still require the separate NASA weather join before becoming the agreed model feature table.

## Measurement and operation rules

- Use `F5`, `Pea5`, `Oat5`, and `SSM5`. Exclude malfunctioning pea-oat channels and unverified 30-cm channels.
- Missing markers and nonfinite/out-of-[0,1] moisture become null with a reason. No missing targets are filled, and no empirical clipping threshold is learned here.
- All dates remain in the observation audit table; both pair endpoints must be usable. No difference is calculated across a missing calendar day or observation gap.
- Sensor windows come from workbook phase headings. The windows are checked against the actual workbook. This conservatively excludes 4-5 November 2022, 23 February-9 March 2023, and 9-26 October 2023, including any numeric interpolation supplied for those dates.
- Cover planting is 24 February 2023, termination is 22 May 2023, and wheat planting is 9 October 2023. The calendar follows operations, while label eligibility follows sensor windows. These dates are checked against event descriptions in the workbook.
- Treat the termination date as no longer actively growing; the source supplies no time-of-day operation information.
- Every daily irrigation amount must match the dated workbook total within 0.000001 mm. Workbook irrigation events before the daily series starts are reported, not added to later dates.

## Limits

This is one site and one cover-crop season, with correlated treatment-day readings. Known sensor gaps are excluded, but the source does not provide a per-cell observed/interpolated provenance mask. The initial training period has no post-cover or following-wheat phase, so the long test must be reported by phase later; a large test set does not create independent seasons. Five-centimeter moisture cannot directly establish whole-root-profile water, wheat yield, or profit.

Task 1 is complete when preparation and tests pass, reruns are reproducible, source hashes remain unchanged, and each partition has usable pairs. Task 2 will fetch and validate NASA daily weather and join it without changing this split.
