"""Task 6 arithmetic and frontend-facing HTTP contracts, including real inference."""

import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import service
from app.contracts import AnalysisResponse, EconomicAssumptions, ErrorResponse, RiskRules
from app.decision import financial_result, relative_moisture_difference, water_risk
from app.main import create_app


class FakeEngine:
    def __init__(self):
        path = service.legacy.OUTPUT / "results.json"
        self.result = json.loads(path.read_text(encoding="utf-8"))
        self.model_info = self.result["model"]
        self.calls = []

    def simulate(self, request):
        self.calls.append(request.model_dump(mode="json"))
        return copy.deepcopy(self.result)


class DecisionTests(unittest.TestCase):
    def test_provisional_plant_review_and_high_loss_override(self):
        engine = FakeEngine()
        request = service.default_request()
        request.include_daily_trajectory = False
        request.economics.net_cover_revenue_usd_ha = 100
        positive = service.analyze(engine, request, "positive")
        self.assertEqual(positive.recommendation.decision, "plant")
        self.assertFalse(positive.recommendation.validated)
        self.assertEqual(positive.recommendation.status, "provisional")
        self.assertTrue(any(case.quality.reliability == "invalid" for case in positive.scenarios))
        request.economics.net_cover_revenue_usd_ha = 85
        self.assertEqual(service.analyze(engine, request, "review").recommendation.decision, "review")
        request.economics.net_cover_revenue_usd_ha = 100
        request.economics.moisture_to_yield_sensitivity = 0
        engine.result["scenarios"][0]["cover_final_7_day_average_m3_m3"] = 0.15
        engine.result["scenarios"][0]["fallow_final_7_day_average_m3_m3"] = 0.2
        high_loss = service.analyze(engine, request, "high-loss")
        self.assertEqual(high_loss.recommendation.decision, "do_not_plant")
        self.assertIn("high_relative_water_loss_in_a_case", high_loss.recommendation.reason_codes)

    def test_missing_baseline_preserves_insufficient_evidence_and_shared_fixtures(self):
        engine = FakeEngine()
        engine.result["scenarios"][0]["fallow_final_7_day_average_m3_m3"] = 0
        response = service.analyze(engine, service.default_request(), "missing")
        self.assertEqual(response.recommendation.decision, "insufficient_evidence")
        self.assertEqual(response.recommendation.status, "unavailable")
        expected = {"plant": "plant", "do-not-plant": "do_not_plant", "review": "review", "insufficient-evidence": "insufficient_evidence"}
        for fixture, decision in expected.items():
            path = service.legacy.prep.ROOT / f"shared/payloads/clovis-analysis-{fixture}.json"
            result = AnalysisResponse.model_validate_json(path.read_text(encoding="utf-8"))
            self.assertEqual(result.recommendation.decision, decision)
            self.assertEqual(result.execution_mode, "example")
            self.assertFalse(result.recommendation.validated)

    def test_relative_moisture_and_incremental_finances_have_known_values(self):
        relative = relative_moisture_difference(0.22, 0.2)
        self.assertAlmostEqual(relative, 0.1)
        result = financial_result(relative, EconomicAssumptions(), 5)
        self.assertAlmostEqual(result.cover_wheat_yield_t_ha, 3.3)
        self.assertAlmostEqual(result.wheat_revenue_difference_usd_ha, 75)
        self.assertEqual(result.total_cover_cost_usd_ha, 85)
        self.assertAlmostEqual(result.incremental_net_benefit_usd_ha, -10)
        self.assertAlmostEqual(result.incremental_net_benefit_usd_total, -50)
        self.assertAlmostEqual(result.additional_revenue_to_break_even_usd_ha, 10)
        self.assertFalse(result.usable_for_recommendation)

    def test_yield_cap_and_revenue_incentives_are_applied_once(self):
        positive = financial_result(1.0, EconomicAssumptions(), 2)
        negative = financial_result(-1.0, EconomicAssumptions(), 2)
        self.assertEqual(positive.relative_yield_change, 0.25)
        self.assertEqual(negative.relative_yield_change, -0.25)
        self.assertTrue(positive.yield_change_was_capped)
        self.assertEqual(positive.incremental_net_benefit_usd_ha, 102.5)
        self.assertEqual(negative.incremental_net_benefit_usd_ha, -272.5)
        assumptions = EconomicAssumptions(moisture_to_yield_sensitivity=0, net_cover_revenue_usd_ha=40, incentive_usd_ha=50)
        result = financial_result(-0.5, assumptions, 1)
        self.assertEqual(result.incremental_net_benefit_usd_ha, 5)
        self.assertEqual(result.relative_yield_change, 0)

    def test_near_zero_fallow_baseline_is_unknown_instead_of_divided(self):
        for value in (0, 1e-7, 1e-6):
            relative = relative_moisture_difference(0.2, value)
            self.assertIsNone(relative)
            result = financial_result(relative, EconomicAssumptions(), 1)
            self.assertEqual(result.status, "insufficient_moisture_baseline")
            self.assertIsNone(result.incremental_net_benefit_usd_ha)
            self.assertEqual(water_risk(relative, RiskRules()).level, "unknown")

    def test_risk_boundaries_and_input_validation(self):
        for relative, expected in ((0.1, "low"), (0, "low"), (-0.049, "low"), (-0.05, "moderate"), (-0.15, "high")):
            self.assertEqual(water_risk(relative, RiskRules()).level, expected)
        for values in ({"wheat_price_usd_t": -1}, {"wheat_price_usd_t": "250"},
                       {"baseline_wheat_yield_t_ha": float("nan")}, {"max_relative_yield_change": 1.1}):
            with self.assertRaises(ValidationError):
                EconomicAssumptions(**values)
        with self.assertRaises(ValidationError):
            RiskRules(moderate_relative_moisture_loss=0.2, high_relative_moisture_loss=0.1)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = FakeEngine()
        self.app = create_app(lambda: self.engine)
        self.client = TestClient(self.app, raise_server_exceptions=False)
        self.client.__enter__()
        self.payload = service.default_request().model_dump(mode="json")
        self.payload["include_daily_trajectory"] = False

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def test_health_ready_options_and_openapi(self):
        self.assertEqual(self.client.get("/health").json()["status"], "ok")
        self.assertTrue(self.client.get("/ready").json()["inference_available"])
        options = self.client.get("/api/v1/options").json()
        self.assertEqual(len(options["cover_crops"]), 3)
        self.assertEqual(options["default_economics"]["termination_cost_usd_ha"], 25)
        schema = self.client.get("/openapi.json").json()
        response = schema["paths"]["/api/v1/analyze"]["post"]["responses"]["422"]
        self.assertIn("ErrorResponse", response["content"]["application/json"]["schema"]["$ref"])
        self.assertEqual(self.client.get("/docs").status_code, 200)

    def test_analysis_echoes_defaults_and_exposes_quality_without_recommendation(self):
        response = self.client.post("/api/v1/analyze", json={"scenario": self.payload["scenario"], "include_daily_trajectory": False})
        self.assertEqual(response.status_code, 200, response.text)
        result = AnalysisResponse.model_validate(response.json())
        self.assertEqual(result.request.area_ha, 1)
        self.assertEqual(result.recommendation.decision, "do_not_plant")
        self.assertEqual(result.recommendation.status, "provisional")
        self.assertFalse(result.recommendation.validated)
        self.assertEqual(result.moisture_temporal_resolution, "daily_average")
        self.assertEqual(result.request_id, response.headers["X-Request-ID"])
        self.assertEqual(len(self.engine.calls), 1)
        self.assertEqual(len(result.scenarios), 3)
        for case in result.scenarios:
            self.assertIsNone(case.daily_trajectory)
            self.assertEqual(case.finances.incremental_net_benefit_usd_ha, -85)
            self.assertEqual(case.quality.reliability, "invalid")
            self.assertFalse(case.quality.usable_for_recommendation)

    def test_risk_rule_changes_do_not_multiply_financial_results(self):
        for case in self.engine.result["scenarios"]:
            case["cover_final_7_day_average_m3_m3"] = 0.18
            case["fallow_final_7_day_average_m3_m3"] = 0.2
        first = self.client.post("/api/v1/analyze", json=self.payload).json()
        self.payload["risk_rules"] = {"moderate_relative_moisture_loss": 0.02, "high_relative_moisture_loss": 0.05}
        second = self.client.post("/api/v1/analyze", json=self.payload).json()
        self.assertEqual(first["scenarios"][0]["water_risk"]["level"], "moderate")
        self.assertEqual(second["scenarios"][0]["water_risk"]["level"], "high")
        self.assertEqual(first["scenarios"][0]["finances"], second["scenarios"][0]["finances"])

    def test_validation_errors_have_stable_field_paths(self):
        invalids = [{"area_ha": -1}, {"scenario": {**self.payload["scenario"], "cover_crop": "corn"}},
                    {"scenario": {**self.payload["scenario"], "initial_soil_moisture_m3_m3": 25}},
                    {"scenario": {**self.payload["scenario"], "cover_planting_date": "2027-07-01"}},
                    {"economics": {"wheat_price_usd_t": "250"}}, {"unexpected": 1}]
        for change in invalids:
            with self.subTest(change=change):
                response = self.client.post("/api/v1/analyze", json={**self.payload, **change})
                self.assertEqual(response.status_code, 422)
                error = ErrorResponse.model_validate(response.json())
                self.assertEqual(error.error.code, "validation_error")
                self.assertTrue(error.error.details)
                self.assertEqual(error.request_id, response.headers["X-Request-ID"])

    def test_busy_response_has_retry_after_and_does_not_run_model(self):
        self.app.state.analysis_slots.acquire()
        try:
            response = self.client.post("/api/v1/analyze", json=self.payload)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["Retry-After"], "1")
            self.assertEqual(response.json()["error"]["code"], "analysis_busy")
            self.assertFalse(self.engine.calls)
        finally:
            self.app.state.analysis_slots.release()

    def test_internal_errors_are_sanitized_and_release_slot(self):
        with patch.object(self.engine, "simulate", side_effect=RuntimeError("private artifact path")), self.assertLogs("field_shift.api", level="ERROR"):
            response = self.client.post("/api/v1/analyze", json=self.payload)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private artifact", response.text)
        self.assertEqual(response.json()["error"]["code"], "internal_error")
        self.assertEqual(response.headers["X-Request-ID"], response.json()["request_id"])
        self.assertEqual(self.client.post("/api/v1/analyze", json=self.payload).status_code, 200)

    def test_browser_cors_and_disallowed_origin(self):
        response = self.client.options("/api/v1/analyze", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://localhost:3000")
        response = self.client.get("/api/v1/options", headers={"Origin": "https://unconfigured.example"})
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_unavailable_model_keeps_metadata_and_liveness_available(self):
        with TestClient(create_app(lambda: None)) as client:
            self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(client.get("/api/v1/options").status_code, 200)
            self.assertEqual(client.get("/ready").status_code, 503)
            response = client.post("/api/v1/analyze", json=self.payload)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "service_unavailable")

    def test_saved_example_is_explicit_and_available_without_model(self):
        with TestClient(create_app(lambda: None)) as client:
            response = client.get("/api/v1/examples/analysis")
            self.assertEqual(response.status_code, 200)
            result = AnalysisResponse.model_validate(response.json()["response"])
            self.assertEqual(result.execution_mode, "example")
            self.assertEqual(sum(len(case.daily_trajectory) for case in result.scenarios), 684)
            self.assertEqual(result.recommendation.decision, "do_not_plant")

    def test_openapi_export_and_error_404_match_runtime(self):
        exported = service.legacy.prep.ROOT / "docs/openapi.json"
        self.assertEqual(json.loads(exported.read_text(encoding="utf-8")), self.app.openapi())
        response = self.client.get("/no-such-route")
        self.assertEqual(response.status_code, 404)
        ErrorResponse.model_validate(response.json())


class RealInferenceTests(unittest.TestCase):
    def test_real_http_analysis_loads_once_without_training_or_network(self):
        factory_calls = []
        def factory():
            factory_calls.append(True)
            return service.load_engine()
        with patch.object(service.legacy.regression.WeatherRegressor, "fit", side_effect=AssertionError("Unexpected training")), \
             patch.object(service.legacy.weather.urllib.request, "urlopen", side_effect=AssertionError("Unexpected network")):
            with TestClient(create_app(factory)) as client:
                request = service.default_request().model_dump(mode="json")
                response = client.post("/api/v1/analyze", json=request)
                self.assertEqual(response.status_code, 200, response.text)
                result = AnalysisResponse.model_validate(response.json())
                self.assertEqual(sum(len(case.daily_trajectory) for case in result.scenarios), 684)
                self.assertEqual([case.total_rain_mm for case in result.scenarios], [285.8, 350.76, 460.58])
                self.assertEqual(result.recommendation.decision, "do_not_plant")
                self.assertEqual(client.get("/ready").status_code, 200)
                self.assertEqual(len(factory_calls), 1)


if __name__ == "__main__":
    unittest.main()
