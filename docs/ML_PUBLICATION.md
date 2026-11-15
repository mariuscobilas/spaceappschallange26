# Research publication and model transfer

15 November 2026. The user requested verification and GitHub upload of the best model. The packaged model is **Colorado water-plus-weather Ridge for absolute yield**, with research status. No cover/fallow decision model passed its decision checks. API payloads and Clovis serving selection are unchanged.

The directly comparable Colorado main cohort has 88 observations, five winter-wheat seasons, identical water/weather features and whole-season holdouts:

| Fixed method | Average held-out-season MAE, t/ha |
| --- | ---: |
| Ridge | **0.545** |
| Random Forest | 0.725 |
| Gradient Boosting | 0.734 |
| Training-mean reference | 0.929 |

This ranking applies to that task/cohort. It does not compare Mandan spring wheat, treatment differences or water errors in mm with Colorado yield. The folds are exposed historical development evidence, not an untouched final test.

The separate [export policy](../apps/api/app/ml/research_export_policy_v1.json) authorizes a new fixed all-88-row research refit for transfer. Earlier protocols and no-refit experiment records remain intact. Quoted scores belong to original fold fits, **not the all-data refit**. No parameter search, new features or promotion was introduced; StandardScaler and Ridge alpha 1/SVD retain their definitions.

The [bundle manifest](../data/model-bundles/colorado-water-weather-ridge-v1/bundle.json) and [weights](../data/model-bundles/colorado-water-weather-ridge-v1/model.json) contain coefficients, intercept, scaling, exact feature names/units, hashes, runtime and validation evidence. Numeric JSON weights are 2.2 KB and need no pickle deserialization. The [standard-library loader](../apps/api/app/ml/research_yield_model.py) checks the artifact hash and requires exact named inputs/units; it is separate from the production bundle loader.

Inputs are observed **0–90 cm stored water, not verified PAW**, and realized wheat-season weather, unavailable at the earlier cover-planting decision. Predictions are unbounded and can be negative; no clipping or planting advice is added. Site/crop transfer is unvalidated. Portable predictions match scikit-learn on all 88 records; tests also check new inputs, feature order, units, invalid values and artifact tampering. Rebuilding reproduces the bundle bytes in the recorded environment.

Source snapshots, provenance, prepared cohorts/folds, protocols, code, tests and reports are included, together with these exact immutable runs, deliberately tracked despite local experiment storage generally being ignored:

| Experiment | Run under `data/experiments/<experiment>/runs/` |
| --- | --- |
| `water_yield_v1` | `20261115T103053452786Z` |
| `water_yield_model_comparison_v1` | `20261115T104457678358Z` |
| `cover_fallow_v1` | `20261115T105621737490Z` |
| `cover_fallow_context_v1` | `20261115T112038793966Z` |
| `mandan_components_v1` | `20261115T115010739438Z` |

A clean-package check also found six pre-existing Clovis tests depended on ignored local pointers. The original baseline/regression reports and provenance plus the unchanged 218 KB `forest_depth_4.joblib` are therefore included under their original run paths (`20261114T192248000084Z-95c5a282` and `20261114T193321417362Z-e60c4eb5`). The explicit setup script below checks pinned hashes and restores only missing local pointers; conflicting existing pointers are never overwritten. It neither retrains nor changes model selection. The regular API bundle setting documented in `API_HANDOFF.md` remains available.

Failed results are preserved. MLflow databases, duplicate caches, temporary files, credentials and absolute-path `latest.json` pointers stay local. Tracking IDs and historical provenance are retained; absolute paths in provenance are records rather than portable inputs. Required relative protocol references are included.

[Mandan weather verification](MANDAN_WEATHER_VERIFICATION.md) confirms complete regional NASA coverage and exact crop-season dates. Soil sampling days and annual field assignments remain unresolved; a new weather model requires a separate protocol.

For exact export reproduction, use the recorded Python 3.14.4, NumPy 2.5.4, SciPy 1.18.1, scikit-learn 1.9.1 and existing preparation dependencies. JSON inference uses the standard library. `.gitattributes` preserves pinned ML/data/script bytes across checkouts.

```powershell
# Once on a fresh checkout, for the legacy artifact-dependent tests:
apps/api/.venv/Scripts/python.exe scripts/prepare_legacy_test_pointers.py
apps/api/.venv/Scripts/python.exe scripts/verify_mandan_weather.py
apps/api/.venv/Scripts/python.exe scripts/export_research_yield_model.py
apps/api/.venv/Scripts/python.exe -m unittest discover -s apps/api/tests
node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs
pnpm run build
```

Checks: **176 backend tests**, including 12 new weather/export checks; **18/18 payload fixtures**; **production build passed**. No dependency installation, contract change or production promotion was required.

The clean staged repository archive also passed all 176 tests after the documented legacy setup. Forty frozen research protocol references were independently hash-checked in that archive. Prepublication staged-blob review found no credential-shaped content, oversized files or unintended local artifacts; pinned ML/data/script bytes matched their working copies.
