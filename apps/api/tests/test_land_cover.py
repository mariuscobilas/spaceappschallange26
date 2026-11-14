import unittest
import sys
from pathlib import Path
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from pyproj import Transformer
from pydantic import ValidationError

from app.services import land_cover
from shared.python.schemas import GeoCoordinate, GeoPolygon


class LandCoverTests(unittest.IsolatedAsyncioTestCase):
    def test_coordinate_conversion_uses_longitude_first_epsg5070(self):
        transformer = Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)
        x, y = land_cover.TO_ALBERS.transform(-87.6298, 41.8781)
        expected = transformer.transform(-87.6298, 41.8781)
        self.assertAlmostEqual(x, expected[0], places=5)
        self.assertAlmostEqual(y, expected[1], places=5)

    def test_parse_xml_fields_and_reject_entities(self):
        self.assertEqual(land_cover.parse_upstream(b"<Result><value>1</value><category>Corn</category></Result>"), (1, "Corn"))
        with self.assertRaises(ValueError):
            land_cover.parse_upstream(b'<!DOCTYPE x [<!ENTITY e "bad">]><x/>')

    def test_supported_and_non_crop_classification(self):
        point = GeoCoordinate(latitude=41.8, longitude=-87.6)
        crop = land_cover.classify(23, "Spring Wheat", 2025, 2026, point)
        self.assertEqual((crop.status, crop.suggestedCrop, crop.year), ("cropland", "wheat", 2025))
        unsupported = land_cover.classify(121, "Developed/Open Space", 2025, 2025, point)
        self.assertEqual((unsupported.status, unsupported.suggestedCrop), ("non_cropland", None))
        fallow = land_cover.classify(61, "Fallow/Idle Cropland", 2025, 2025, point)
        self.assertEqual((fallow.status, fallow.suggestedCrop), ("cropland", None))

    def test_background_cloud_and_unknown_codes_are_unavailable(self):
        point = GeoCoordinate(latitude=41.8, longitude=-87.6)
        for code, label in ((0, "Background"), (81, "Clouds/No Data"), (251, "Unknown")):
            result = land_cover.classify(code, label, 2025, 2025, point)
            self.assertEqual((result.status, result.code, result.year), ("unavailable", None, None))

    def test_coordinate_and_polygon_finite_guards(self):
        with self.assertRaises(ValidationError):
            GeoCoordinate(latitude=float("nan"), longitude=-87.6)
        with self.assertRaises(ValidationError):
            GeoPolygon.model_validate({"coordinates": [[[0, 0], [1, 0], [1, float("inf")], [0, 0]]]})

    async def test_failure_returns_typed_unavailable(self):
        point = GeoCoordinate(latitude=41.8, longitude=-87.6)
        result = land_cover.unavailable(2025, point, "offline")
        self.assertEqual((result.status, result.year, result.requestedYear), ("unavailable", None, 2025))


if __name__ == "__main__":
    unittest.main()
