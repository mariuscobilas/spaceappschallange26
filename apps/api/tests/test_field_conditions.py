import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

REPO_ROOT = Path(__file__).resolve().parents[3]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services import field_conditions as service


def power_payload(start: date, count: int = 35) -> dict:
    rain = {}
    wetness = {}
    for offset in range(count):
        day = start + timedelta(days=offset)
        key = day.strftime("%Y%m%d")
        rain[key] = 1.0
        wetness[key] = 0.35
    return {
        "header": {
            "sources": ["MERRA2", "GEOSIT"],
            "fill_value": -999.0,
            "time_standard": "UTC",
        },
        "parameters": {
            "PRECTOTCORR": {"units": "mm/day", "longname": "Precipitation Corrected"},
            "GWETROOT": {"units": "1", "longname": "Root Zone Soil Wetness"},
        },
        "properties": {"parameter": {"PRECTOTCORR": rain, "GWETROOT": wetness}},
    }


class FieldConditionsTests(unittest.IsolatedAsyncioTestCase):
    def test_precipitation_requires_exact_contiguous_30_day_window(self):
        start = date(2026, 10, 1)
        payload = power_payload(start, 35)
        result = service._precipitation_30d(payload, start + timedelta(days=34))
        self.assertEqual(result.status, "available")
        self.assertEqual(result.value, 30.0)
        self.assertEqual(result.periodStart, date(2026, 10, 6))
        self.assertEqual(result.periodEnd, date(2026, 11, 4))

        del payload["properties"]["parameter"]["PRECTOTCORR"]["20261010"]
        missing_day_result = service._precipitation_30d(payload, start + timedelta(days=34))
        self.assertEqual((missing_day_result.status, missing_day_result.value), ("unavailable", None))

    def test_sentinel_and_future_values_are_not_treated_as_observations(self):
        requested = date(2026, 11, 3)
        payload = power_payload(requested - timedelta(days=2), 5)
        rain = payload["properties"]["parameter"]["PRECTOTCORR"]
        rain["20261102"] = -999
        result = service._precipitation_30d(payload, requested)
        self.assertEqual(result.status, "unavailable")

        wetness = service._latest_daily_measure(
            payload, "GWETROOT", requested, unit="fraction",
            accepted_metadata_units={"fraction", "1"}, description="root-zone wetness", maximum=1.0,
        )
        self.assertEqual(wetness.periodEnd, requested)
        payload["properties"]["parameter"]["GWETROOT"]["20261104"] = 0.95
        wetness = service._latest_daily_measure(
            payload, "GWETROOT", requested, unit="fraction",
            accepted_metadata_units={"fraction", "1"}, description="root-zone wetness", maximum=1.0,
        )
        self.assertEqual(wetness.periodEnd, requested)

    def test_wrong_metadata_withholds_measure(self):
        requested = date(2026, 11, 3)
        payload = power_payload(requested - timedelta(days=34), 35)
        payload["parameters"]["GWETROOT"]["units"] = "m^3/m^3"
        result = service._latest_daily_measure(
            payload, "GWETROOT", requested, unit="fraction",
            accepted_metadata_units={"fraction"}, description="root-zone wetness", maximum=1.0,
        )
        self.assertEqual((result.status, result.value), ("unavailable", None))

    def test_real_power_metadata_layout_accepts_fraction_unit_1(self):
        requested = date(2026, 11, 12)
        payload = power_payload(requested - timedelta(days=34), 35)
        self.assertEqual(service._metadata_unit(payload, "PRECTOTCORR"), "mm/day")
        self.assertEqual(service._metadata_unit(payload, "GWETROOT"), "1")
        result = service._latest_daily_measure(
            payload, "GWETROOT", requested, unit="fraction",
            accepted_metadata_units={"fraction", "1"}, description="root-zone wetness", maximum=1.0,
        )
        self.assertEqual((result.status, result.value, result.periodEnd), ("available", 0.35, requested))

    async def test_usda_capacity_cm_converts_to_mm_and_has_no_observation_period(self):
        response = {"Table": [
            ["mukey", "muname", "aws0100wta"],
            ["123", "Loam, 0 to 2 percent slopes", 12.5],
        ]}
        with patch.object(service, "_request_json", new=AsyncMock(return_value=response)) as request:
            measure, mapunit = await service._lookup_soil(None, 38.5, -96.25)
        self.assertEqual(measure.value, 125.0)
        self.assertEqual(measure.unit, "mm")
        self.assertIsNone(measure.periodStart)
        self.assertIsNone(measure.periodEnd)
        self.assertIn("not a historical soil survey", measure.message)
        self.assertEqual(mapunit, "Loam, 0 to 2 percent slopes")
        self.assertIn("point(-96.250000 38.500000)", request.call_args.kwargs["data"]["query"])

    async def test_sda_missing_or_ambiguous_mapunit_is_unavailable(self):
        with patch.object(service, "_request_json", new=AsyncMock(return_value={"Table": []})):
            measure, mapunit = await service._lookup_soil(None, 38.5, -96.25)
        self.assertEqual((measure.status, measure.value, mapunit), ("unavailable", None, None))

    async def test_nasa_timeout_returns_unavailable_measures(self):
        with patch.object(service, "_request_json", new=AsyncMock(side_effect=TimeoutError)):
            precipitation, wetness = await service._fetch_nasa(
                None, 38.5, -96.25, date(2026, 11, 14)
            )
        self.assertEqual((precipitation.status, precipitation.value), ("unavailable", None))
        self.assertEqual((wetness.status, wetness.value), ("unavailable", None))

    async def test_lookup_preserves_available_sources_when_nasa_provider_fails(self):
        requested = date(2026, 11, 14)
        unavailable_rain = service._unavailable(
            unit="mm", source=service.NASA_SOURCE, source_url=service.NASA_SOURCE_URL,
            spatial_resolution=service.NASA_SPATIAL_RESOLUTION, message="NASA timeout",
        )
        available_wetness = service._measure(
            value=0.4, unit="fraction", period_start=requested - timedelta(days=1),
            period_end=requested - timedelta(days=1), source=service.NASA_SOURCE,
            source_url=service.NASA_SOURCE_URL,
            spatial_resolution=service.NASA_SPATIAL_RESOLUTION, message="Observed day",
        )
        available_soil = service._measure(
            value=120, unit="mm", period_start=None, period_end=None,
            source=service.USDA_SOURCE, source_url=service.USDA_SOURCE_URL,
            spatial_resolution=service.USDA_SPATIAL_RESOLUTION, message="Mapped capacity",
        )

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return False

        service._CACHE.clear()
        with (
            patch.object(service.httpx, "AsyncClient", return_value=FakeClient()),
            patch.object(service, "_fetch_nasa", new=AsyncMock(return_value=(unavailable_rain, available_wetness))),
            patch.object(service, "_lookup_soil", new=AsyncMock(return_value=(available_soil, "Loam map unit"))),
        ):
            result = await service.lookup(38.5, -96.25, requested)

        self.assertEqual(result.precipitation30d.status, "unavailable")
        self.assertEqual(result.rootZoneWetness.status, "available")
        self.assertEqual(result.availableWaterStorage.status, "available")
        self.assertEqual(result.soilMapUnit, "Loam map unit")

    async def test_cache_key_includes_requested_date(self):
        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return False

        def result_for(day: date) -> service.FieldConditionsResult:
            start = day - timedelta(days=29)
            rain = service._measure(
                value=30, unit="mm", period_start=start, period_end=day,
                source=service.NASA_SOURCE, source_url=service.NASA_SOURCE_URL,
                spatial_resolution=service.NASA_SPATIAL_RESOLUTION, message="30-day total",
            )
            wetness = service._measure(
                value=0.5, unit="fraction", period_start=day, period_end=day,
                source=service.NASA_SOURCE, source_url=service.NASA_SOURCE_URL,
                spatial_resolution=service.NASA_SPATIAL_RESOLUTION, message="Daily value",
            )
            soil = service._measure(
                value=100, unit="mm", period_start=None, period_end=None,
                source=service.USDA_SOURCE, source_url=service.USDA_SOURCE_URL,
                spatial_resolution=service.USDA_SPATIAL_RESOLUTION, message="Mapped capacity",
            )
            return service.FieldConditionsResult(
                sample=service.GeoCoordinate(latitude=38.5, longitude=-96.25),
                requestedDate=day,
                retrievedAt=datetime.now(timezone.utc),
                precipitation30d=rain,
                rootZoneWetness=wetness,
                availableWaterStorage=soil,
                soilMapUnit="Loam map unit",
            )

        service._CACHE.clear()
        with (
            patch.object(service.httpx, "AsyncClient", return_value=FakeClient()),
            patch.object(service, "_fetch_nasa", new=AsyncMock(side_effect=lambda _c, _lat, _lon, day: (
                result_for(day).precipitation30d, result_for(day).rootZoneWetness
            ))) as nasa,
            patch.object(service, "_lookup_soil", new=AsyncMock(side_effect=lambda _c, _lat, _lon: (
                result_for(date(2026, 11, 1)).availableWaterStorage, "Loam map unit"
            ))) as soil_lookup,
        ):
            first = await service.lookup(38.5, -96.25, date(2026, 11, 10))
            same_date = await service.lookup(38.5, -96.25, date(2026, 11, 10))
            other_date = await service.lookup(38.5, -96.25, date(2026, 11, 11))

        self.assertEqual(first.requestedDate, date(2026, 11, 10))
        self.assertEqual(same_date.requestedDate, date(2026, 11, 10))
        self.assertEqual(other_date.requestedDate, date(2026, 11, 11))
        self.assertEqual(nasa.await_count, 2)
        self.assertEqual(soil_lookup.await_count, 2)

        response = {"Table": [["mukey", "muname", "aws0100wta"], ["1", "A", 8], ["2", "B", 9]]}
        with patch.object(service, "_request_json", new=AsyncMock(return_value=response)):
            measure, mapunit = await service._lookup_soil(None, 38.5, -96.25)
        self.assertEqual((measure.status, measure.value, mapunit), ("unavailable", None, None))


if __name__ == "__main__":
    unittest.main()
