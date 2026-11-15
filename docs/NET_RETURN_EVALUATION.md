# Cover-versus-fallow net-return evaluation

This standalone research evaluator translates matched **cover-minus-fallow** following-crop yield differences from t/ha into incremental USD/ha when the caller supplies every monetary assumption. It is not connected to the serving API, does not use the Clovis moisture-to-yield factor, and makes no price, subsidy, or cost assumptions. See [the Mandan component evaluation](MANDAN_EVALUATION.md) for the scope and present limitations of the available paired yield evidence.

## Calculation and inputs

For yield contrast `dY` and price `P`, the per-hectare arithmetic is:

`net return = P × dY + cover income + incentive − seed − establishment − termination − other additional costs`

All monetary fields are required in each scenario, including values that are zero. Missing is never interpreted as zero. Crop price, income, incentives, and additional costs must be nonnegative finite values. Optional field area must be positive and only scales per-hectare results to whole-field totals. The break-even yield is calculated only when price is positive; at zero price it is undefined.

The assumptions JSON contains caller-named bounded sensitivity cases. These are scenario calculations, not probability-weighted forecasts. Example values below are **arithmetic fixtures only**, not observed or recommended farm prices, costs, incentives, or market estimates:

```json
{
  "scenarios": [
    {
      "name": "illustrative_fixture_only",
      "assumptions": {
        "crop_price_usd_per_t": 200,
        "cover_income_usd_per_ha": 0,
        "incentive_usd_per_ha": 0,
        "seed_cost_usd_per_ha": 0,
        "establishment_cost_usd_per_ha": 0,
        "termination_cost_usd_per_ha": 0,
        "other_additional_cost_usd_per_ha": 0
      }
    }
  ]
}
```

Run from the repository root with the project's Python environment:

```sh
apps/api/.venv/bin/python scripts/evaluate_net_return.py path/to/paired_oof.csv \
  --method direct_water_weather --assumptions path/to/assumptions.json --area-ha 40 --output report.json
```

Without `--assumptions`, the report marks financial configuration as `configuration_missing` and emits no dollar outcomes. The yield diagnostics still run. OOF input follows the Mandan export columns `task,method,item_id,year,rep,treatment,control_id,unit,observed,predicted`; only `yield_difference` rows in `t/ha` are accepted. Select a method with `--method` when the CSV has multiple methods. `observed` and `predicted` are paired cover-minus-fallow contrasts generated out of fold. Duplicate item predictions and controls spanning years are rejected. The training-mean comparator for a held-out year is calculated only from other years; always-fallow predicts zero contrast.

## Decision gate and uncertainty

Default maximum tolerable yield loss is **0 t/ha** (no supported yield reduction). It can be explicitly changed with `--max-tolerable-yield-loss-t-ha`; the evaluator does not estimate an agronomic tolerance. A cover recommendation requires all of: independently validated uncertainty, conservative net-return lower bound above zero, and conservative yield lower bound no worse than the declared loss limit. The current CLI has no validated bounds, so it always abstains, including when caller-supplied monetary scenarios produce positive mean returns. It makes no calibrated forecast probability claim.

Pair-level MAE and decision counts are descriptive. Pairs reuse controls and cluster within a small number of years; the evaluator therefore does not bootstrap pairs or report pair-independent confidence intervals. The scenario engine applies assumptions to observed and predicted contrasts for arithmetic sensitivity, not causal or prospective profit estimates. Market assumptions must come from the user or a cited, separately verified source before interpreting a scenario as farm-relevant.

## Software checks

## Current Mandan weather OOF diagnostic

The evaluator was run on `data/experiments/mandan_weather_ablation_v1/runs/20261115T143248469336Z/oof_predictions.csv`, selecting frozen primary `direct_water` and added-weather `direct_water_weather`. Both include 142 matched pairs, 10 shared controls, and three harvest years. Direct water has 0.430 t/ha macro-year MAE versus 0.309 for the fold training-mean baseline and 0.327 for always-fallow. Added weather has 0.928 t/ha macro-year MAE and predicts cover for all 142 pairs; 46 observed contrasts are harmful. Its pooled MAE is 1.148 t/ha. These descriptive historical OOF figures do not show that weather improves the decision.

The CLI was run without assumptions and returned `configuration_missing`, no dollar results, and `abstain` because uncertainty bounds are not independently validated. No price or cost scenario is reported as current economics.

The machine-readable selected-method report is [net_return.json](../data/analysis/decision_readiness_v1/net_return.json). It records OOF input SHA-256 `4fe5aff6ff1c8df39ea5a32b4eb5c13c5085fcf3e4b77ad6afe6fda446830e72`, selected method, pair/control/year counts, baseline metrics, and the abstention state.

`apps/api/tests/test_net_return.py` covers arithmetic/signs, missing versus explicit zero, zero-price break-even, the abstention gate, OOF baselines, cross-year control checks, and named sensitivity scenarios. Run it with:

```sh
apps/api/.venv/bin/python -m unittest apps.api.tests.test_net_return
```
