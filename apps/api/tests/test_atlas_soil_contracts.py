import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, patch

import httpx

REPO_ROOT = Path(__file__).resolve().parents[3]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services import atlas, soil_profile
from shared.python.schemas import AtlasDataset, GeoCoordinate, SoilProfileResult


class AtlasContractTests(unittest.TestCase):
    def test_available_fixture_obeys_shared_contract_and_keeps_zero_area_outputs_null(self):
        payload = json.loads((REPO_ROOT / "shared/payloads/atlas-available.json").read_text())
        dataset = AtlasDataset.model_validate(payload)
        self.assertEqual(dataset.cells[0].activeAreaHa, 0)
        self.assertIsNone(dataset.cells[0].netReturnUsdHa)

    def test_unavailable_when_dataset_not_configured(self):
        result = atlas.load_dataset("")
        self.assertEqual((result.status, result.cells), ("unavailable", []))

    def test_rejects_invalid_and_oversized_configured_dataset(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "atlas.json"
            path.write_text('{"status":"available","status":"available"}')
            self.assertEqual(atlas.load_dataset(str(path)).status, "unavailable")
            path.write_bytes(b" " * (atlas.MAX_DATASET_BYTES + 1))
            self.assertEqual(atlas.load_dataset(str(path)).status, "unavailable")

    def test_configured_dataset_must_have_real_h3_cell(self):
        payload = json.loads((REPO_ROOT / "shared/payloads/atlas-available.json").read_text())
        payload["cells"][0]["h3Index"] = "not-an-h3-index"
        with TemporaryDirectory() as directory:
            path = Path(directory) / "atlas.json"
            path.write_text(json.dumps(payload))
            result = atlas.load_dataset(str(path))
        self.assertEqual(result.status, "unavailable")

    def test_configured_valid_dataset_passes_h3_and_contract_validation(self):
        path = REPO_ROOT / "shared/payloads/atlas-available.json"
        result = atlas.load_dataset(str(path))
        self.assertEqual(result.status, "available")
        self.assertEqual(result.cells[0].h3Index, "8928308280fffff")


class SoilContractTests(unittest.TestCase):
    def test_unavailable_fixture_obeys_shared_contract(self):
        payload = json.loads((REPO_ROOT / "shared/payloads/soil-profile-unavailable.json").read_text())
        result = SoilProfileResult.model_validate(payload)
        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.components, [])

    def test_dominant_component_horizons_are_clipped_at_30cm_and_missing_values_stay_missing(self):
        sample = GeoCoordinate(latitude=39, longitude=-99)
        rows = [
            {"mukey": "1", "musym": "MU1", "muname": "Test map unit", "cokey": "10", "compname": "Dominant", "comppct_r": 70, "drainagecl": "Well drained", "hydgrp": "B", "intersected_mapunit_count": 1,
             "hzdept_r": 0, "hzdepb_r": 20, "texdesc": "loam", "sandtotal_r": 40, "silttotal_r": 40, "claytotal_r": 20, "om_r": 3, "dbthirdbar_r": 1.2, "ph1to1h2o_r": 6.5, "ksat_r": 10},
            {"mukey": "1", "musym": "MU1", "muname": "Test map unit", "cokey": "10", "compname": "Dominant", "comppct_r": 70, "drainagecl": "Well drained", "hydgrp": "B", "intersected_mapunit_count": 1,
             "hzdept_r": 20, "hzdepb_r": 50, "texdesc": "clay loam", "sandtotal_r": None, "silttotal_r": None, "claytotal_r": None, "om_r": None, "dbthirdbar_r": None, "ph1to1h2o_r": None, "ksat_r": None},
            {"mukey": "1", "musym": "MU1", "muname": "Test map unit", "cokey": "11", "compname": "Minor", "comppct_r": 20, "drainagecl": "Poorly drained", "hydgrp": "D", "intersected_mapunit_count": 1,
             "hzdept_r": 0, "hzdepb_r": 30, "texdesc": "clay", "sandtotal_r": 20, "silttotal_r": 20, "claytotal_r": 60, "om_r": 4, "dbthirdbar_r": 1.3, "ph1to1h2o_r": 5.5, "ksat_r": 2},
        ]
        result = soil_profile._dominant_component(rows, sample)
        component = result.components[0]
        self.assertEqual(result.status, "available")
        self.assertEqual(component.componentName, "Dominant")
        self.assertEqual([(h.topCm, h.bottomCm) for h in component.horizons], [(0, 20), (20, 30)])
        self.assertEqual(component.horizons[0].sandPct.value, 40)
        self.assertEqual(component.horizons[1].sandPct.status, "unavailable")

    def test_ambiguous_map_units_return_unavailable(self):
        result = soil_profile._dominant_component([{"mukey": "1", "intersected_mapunit_count": 2}], GeoCoordinate(latitude=39, longitude=-99))
        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.components, [])


class AtlasSoilRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_atlas_returns_explicit_unavailable_contract_without_dataset(self):
        from app.main import app
        with patch("app.routers.atlas.load_dataset", return_value=atlas.unavailable()):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/v1/atlas")
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["status"], response.json()["cells"]), ("unavailable", []))

    async def test_soil_profile_route_validates_bounds_and_forwards_coordinate(self):
        from app.main import app
        payload = json.loads((REPO_ROOT / "shared/payloads/soil-profile-unavailable.json").read_text())
        result = SoilProfileResult.model_validate(payload)
        with patch("app.routers.soil_profile.lookup", new=AsyncMock(return_value=result)) as lookup:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/v1/soil-profile", params={"latitude": 39, "longitude": -99})
                invalid = await client.get("/api/v1/soil-profile", params={"latitude": 90, "longitude": -99})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "unavailable")
        self.assertEqual(invalid.status_code, 422)
        lookup.assert_awaited_once()

class AtlasValueSafetyTests(unittest.TestCase):
    def test_cell_allows_validated_yield_gain_and_withholds_unknown_coverage_returns(self):
        from shared.python.schemas import AtlasCell
        from pydantic import ValidationError
        cell = {"h3Index": "8928308280fffff", "crop": "corn", "scenarioId": "test", "activeAreaHa": 100, "netReturnUsdHa": 50, "yieldPenaltyPct": -5, "rootZoneWetness": .4, "soilTexture": "loam"}
        self.assertEqual(AtlasCell.model_validate(cell).yieldPenaltyPct, -5)
        for patch in [{"activeAreaHa": None}, {"netReturnUsdHa": True}, {"crop": "invented"}]:
            with self.assertRaises(ValidationError):
                AtlasCell.model_validate({**cell, **patch})
