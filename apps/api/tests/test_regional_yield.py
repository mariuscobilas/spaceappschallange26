import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

REPO_ROOT = Path(__file__).resolve().parents[3]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services import regional_yield


def valid_dataset():
    ring = [[-84.0, 40.0], [-83.9, 40.0], [-83.9, 40.1], [-84.0, 40.1], [-84.0, 40.0]]
    return {
        "status": "available",
        "message": "Historical county study summary.",
        "datasetId": "test-regional-yield",
        "generatedAt": "2026-11-15T12:00:00Z",
        "source": {
            "title": "Test source",
            "url": "https://example.org/data",
            "doi": "10.0000/example",
            "archiveSha256": "a" * 64,
            "license": "CC0-1.0",
        },
        "method": {
            "summary": "County-level published sample summaries.",
            "units": "percent",
            "sampleUnit": "model sample record",
            "minimumSampleRecords": 10,
            "interpretation": "Historical study outcome, not a farm forecast.",
            "limitations": ["County scale", "Historical period"],
        },
        "regions": [{
            "fips": "39049",
            "name": "Franklin County",
            "state": "OH",
            "centroid": [-83.0, 39.9],
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "estimates": [{"crop": "corn", "period": "2019-2020", "sampleRecords": 25, "sampleRecordsByYear": {"2019":12,"2020":13}, "meanYieldEffectPct": 1.25}],
        }],
    }


class RegionalYieldServiceTests(unittest.TestCase):
    def setUp(self):
        regional_yield._load_cached.cache_clear()

    def test_missing_file_returns_empty_unavailable_dto(self):
        result = regional_yield.load_regional_yield("/missing/regional-yield.json")
        self.assertEqual((result.status, result.regions), ("unavailable", []))
        self.assertIsNone(result.source)

    def test_corrupt_duplicate_key_and_invalid_fips_files_are_withheld(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "regional-yield.json"
            for raw in (b"not-json", b'{"status":"unavailable","status":"available"}'):
                path.write_bytes(raw)
                self.assertEqual(regional_yield.load_regional_yield(str(path)).status, "unavailable")
            payload = valid_dataset()
            payload["regions"][0]["fips"] = "12345"
            path.write_text(json.dumps(payload))
            self.assertEqual(regional_yield.load_regional_yield(str(path)).status, "unavailable")
            payload = valid_dataset()
            payload["regions"][0]["centroid"] = [False, 39.9]
            path.write_text(json.dumps(payload))
            self.assertEqual(regional_yield.load_regional_yield(str(path)).status, "unavailable")

    def test_oversized_file_is_withheld(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "large.json"
            path.write_bytes(b" " * (regional_yield.MAX_DATASET_BYTES + 1))
            self.assertEqual(regional_yield.load_regional_yield(str(path)).status, "unavailable")

    def test_valid_data_is_parsed_and_reloaded_when_file_changes(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "regional-yield.json"
            path.write_text(json.dumps(valid_dataset()))
            first = regional_yield.load_regional_yield(str(path))
            self.assertEqual(first.status, "available")
            self.assertEqual(first.regions[0].fips, "39049")
            self.assertEqual(first.regions[0].estimates[0].sampleRecords, 25)
            changed = valid_dataset()
            changed["regions"][0]["name"] = "Updated Franklin County"
            path.write_text(json.dumps(changed))
            path.touch()
            self.assertEqual(regional_yield.load_regional_yield(str(path)).regions[0].name, "Updated Franklin County")

    def test_bundled_dataset_is_available_when_present(self):
        path = regional_yield.DEFAULT_DATASET_PATH
        self.assertTrue(path.is_file(), "default sourced dataset must be bundled")
        result = regional_yield.load_regional_yield(str(path))
        self.assertEqual(result.status, "available", result.message)
        self.assertTrue(result.regions)


class RegionalYieldRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_route_returns_typed_unavailable_result(self):
        from app.main import app
        from unittest.mock import patch

        with patch("app.routers.regional_yield.load_regional_yield", return_value=regional_yield.unavailable()):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/v1/atlas/regional-yield")
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["status"], response.json()["regions"]), ("unavailable", []))

    async def test_route_returns_validated_available_result(self):
        from app.main import app
        from unittest.mock import patch
        from shared.python.schemas import RegionalYieldDataset

        result = RegionalYieldDataset.model_validate(valid_dataset())
        with patch("app.routers.regional_yield.load_regional_yield", return_value=result):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/v1/atlas/regional-yield")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["regions"][0]["estimates"][0]["meanYieldEffectPct"], 1.25)
