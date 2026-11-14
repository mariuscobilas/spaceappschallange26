import copy
from datetime import date
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from shared.python.schemas import FieldConditionsResult


def fixture(kind="available"):
    return json.loads((REPO_ROOT / "shared" / "payloads" / f"field-conditions-{kind}.json").read_text())


class ConditionsContractTests(unittest.TestCase):
    def test_available_partial_and_unavailable_fixtures(self):
        for kind in ("available", "partial", "unavailable"):
            result = FieldConditionsResult.model_validate(fixture(kind))
            self.assertEqual(result.requestedDate, date(2026, 11, 14))
        self.assertIsNone(FieldConditionsResult.model_validate(fixture("unavailable")).precipitation30d.value)

    def test_rejects_incomplete_rainfall_and_future_observations(self):
        payload = fixture()
        payload["precipitation30d"]["periodStart"] = "2026-10-15"
        with self.assertRaises(ValidationError):
            FieldConditionsResult.model_validate(payload)
        payload = fixture()
        payload["rootZoneWetness"]["periodStart"] = payload["rootZoneWetness"]["periodEnd"] = "2026-11-15"
        with self.assertRaises(ValidationError):
            FieldConditionsResult.model_validate(payload)

    def test_rejects_wrong_units_missing_values_and_nonfinite_measures(self):
        for name, key, value in (("rootZoneWetness", "unit", "mm"), ("rootZoneWetness", "value", 1.1), ("rootZoneWetness", "value", float("nan")), ("precipitation30d", "value", None), ("precipitation30d", "value", -1)):
            payload = copy.deepcopy(fixture())
            payload[name][key] = value
            with self.assertRaises(ValidationError):
                FieldConditionsResult.model_validate(payload)


class ConditionsRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_route_forwards_sample_and_requested_date(self):
        from app.main import app
        result = FieldConditionsResult.model_validate(fixture())
        with patch("app.routers.field_conditions.lookup", new=AsyncMock(return_value=result)) as lookup:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/v1/field-conditions", params={"latitude": 38.4697, "longitude": -101.7527, "as_of": "2026-11-14"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["rootZoneWetness"]["unit"], "fraction")
            lookup.assert_awaited_once_with(38.4697, -101.7527, date(2026, 11, 14))

    async def test_invalid_coordinates_and_dates_do_not_call_upstream(self):
        from app.main import app
        with patch("app.routers.field_conditions.lookup", new=AsyncMock()) as lookup:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                for overrides in ({"latitude": "nan"}, {"longitude": -180}, {"as_of": "2100-01-01"}, {"as_of": "1980-12-31"}, {"as_of": "bad-date"}):
                    response = await client.get("/api/v1/field-conditions", params={"latitude": 39, "longitude": -99, "as_of": "2020-01-01", **overrides})
                    self.assertEqual(response.status_code, 422)
            lookup.assert_not_awaited()
