# API Endpoints

Local base URL: `http://localhost:8000`. Interactive OpenAPI docs: `http://localhost:8000/docs`.

All schemas and contracts are defined in `@spaceapps/shared` (`shared/src/types` and `shared/python/schemas.py`).

---

## 1. `GET /health`

Checks the API server status.

### Response (`200 OK`)
```json
{
  "status": "ok",
  "service": "field-shift-api",
  "version": "0.1.0",
  "timestamp": "2026-11-14T10:00:00.000Z",
  "uptimeSeconds": 0.0,
  "checks": {
    "api": true,
    "mlModelLoaded": false,
    "nasaDataService": true
  }
}
```

---

## 2. `POST /api/v1/mock`

Generic sanity check endpoint.

### Request Body (`Content-Type: application/json`)
```json
{
  "message": "hello"
}
```

### Response (`200 OK`)
```json
{
  "message": "hello",
  "mock": true,
  "timestamp": "2026-11-14T10:00:00.000Z"
}
```

---

## 3. `POST /api/v1/field-shift/analyze`

Calculates farm climate vulnerability using NASA satellite environmental indicators (SMAP, MODIS, Landsat, GPM) and generates adaptation recommendations (crop diversification, planting shifts, irrigation advice).

### Request Body (`Content-Type: application/json`)
See fixture: `shared/payloads/field-analysis-request.json`

```json
{
  "field": {
    "id": "field-us-mw-001",
    "name": "Oak Creek Sector A",
    "location": {
      "latitude": 41.8781,
      "longitude": -87.6298,
      "altitudeMeters": 181
    },
    "areaHectares": 45.5,
    "currentCrop": "corn",
    "plantingDate": "2026-04-20",
    "soilType": "silt_loam",
    "irrigation": "rainfed",
    "notes": "Experiencing recurring late-summer heatwaves."
  },
  "planningHorizonYears": 5
}
```

### Response (`200 OK`)
See fixture: `shared/payloads/field-analysis-response.json`

Returns:
- `fieldId`, `fieldName`
- `environmentSnapshot` (NDVI anomaly, soil moisture deficit, temperature anomaly, drought index)
- `prediction` (vulnerability score, risk factors, recommended crops with suitability ratings, planting window shift, adaptation action plan)

---

## 4. `GET /api/v1/land-cover`

Looks up the USDA NASS Cropland Data Layer (CDL) class at a CONUS point. Coordinates are transformed from EPSG:4326 to the service's EPSG:5070 coordinates. Requested years later than the configured `CDL_LATEST_YEAR` (default `2025`) use the latest available year; `requestedYear` retains the original request and `year` reports the dataset year used.

### Query parameters

`latitude` (-90..90), `longitude` (-180..180), and `year` (1997..2100) are required. This endpoint currently supports approximate CONUS bounds: latitude 24..50 and longitude -125..-66. Invalid coordinates and years return `422`.

### Request

```sh
curl 'http://localhost:8000/api/v1/land-cover?latitude=41.8781&longitude=-87.6298&year=2026'
```

### Response (`200 OK`)

The response is a `LandCoverResult` DTO (not an API envelope). See `shared/payloads/land-cover-cropland.json`, `land-cover-non-cropland.json`, and `land-cover-unavailable.json` for all statuses.

```json
{
  "status": "cropland",
  "code": 1,
  "category": "Corn",
  "suggestedCrop": "corn",
  "year": 2025,
  "requestedYear": 2026,
  "sample": { "latitude": 41.8781, "longitude": -87.6298 },
  "source": "USDA NASS Cropland Data Layer (CDL)",
  "message": "CDL classified this point as Corn."
}
```

An upstream timeout, invalid response, or unavailable year returns `200` with `status: "unavailable"` and null class fields, so clients can fall back to manual crop selection. Only CDL classes mapped to the app's crop list populate `suggestedCrop`; other crop classes are still reported as cropland with a null suggestion.

---

## 5. `GET /api/v1/field-conditions`

Source-backed numeric context for one sample point. Returns the shared
`FieldConditionsResult` DTO; it does not run a simulation or return a recommendation.

Required query parameters: `latitude` (24..50), `longitude` (-125..-66), finite
coordinates in the approximate CONUS bounds. Optional `as_of` is an ISO date from
1981-01-01 through today UTC; omitted means today UTC. Invalid queries return `422`.

```sh
curl 'http://localhost:8000/api/v1/field-conditions?latitude=38.4697&longitude=-101.7521&as_of=2026-11-14'
```

The response includes the requested sample/date, retrieval timestamp, optional soil
map-unit name, and three independent measures. Each measure includes availability,
value or null, units, actual period, source link, spatial resolution and interpretation.

| Measure | Meaning |
| --- | --- |
| `precipitation30d` | NASA POWER `PRECTOTCORR`: sum of exactly 30 contiguous valid UTC daily values, in mm, ending on the latest complete available interval on/before the request. |
| `rootZoneWetness` | NASA POWER `GWETROOT`: 0–1 relative saturation of the modeled 0–100 cm root zone on its actual available day. This is not volumetric water content. |
| `availableWaterStorage` | USDA NRCS SSURGO `muaggatt.aws0100wta`: map-unit weighted capacity for 0–100 cm, converted from source cm to mm. It is not current water remaining. |

POWER uses a meteorology grid, approximately 0.5° latitude × 0.625° longitude, with
MERRA-2/GEOS-IT sources. These are regional modeled estimates, not field sensors or
numeric extractions from GIBS imagery. Polygon clients use an interior sample point;
the API does not compute polygon averages. Do not multiply relative wetness by soil
capacity to infer plant-available water.

Dates can lag the request and differ between measures. Missing daily values are
never zero-filled; an incomplete 30-day window is withheld. Current mapped soil
data have null observation dates even for historical requests: this endpoint does
not reconstruct historical soil surveys. No soil texture is inferred from a name.

NASA and USDA requests run concurrently with independent seven-second deadlines,
bounded response bodies and unit/missing-value validation. Upstream failures return
`200` with the affected measure unavailable/null, preserving available values from
the other provider. A bounded memory cache uses coordinates/date, 30-minute TTL for
fully available results and 30 seconds for partial/unavailable results.

Fixtures: `shared/payloads/field-conditions-available.json`,
`field-conditions-partial.json`, `field-conditions-unavailable.json`. Fixtures are
development examples and are never served as current observations on failure.

Source documentation: [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/),
[NASA MERRA-2 moisture definitions](https://gmao.gsfc.nasa.gov/gmao-products/merra-2/faq_merra-2/),
[USDA SDA column descriptions](https://sdmdataaccess.sc.egov.usda.gov/documents/TableColumnDescriptionsReport.pdf).

## Testing Endpoints with curl

```sh
# Health check
curl -X GET http://localhost:8000/health

# Field shift analysis
curl -X POST http://localhost:8000/api/v1/field-shift/analyze \
  -H "Content-Type: application/json" \
  -d @shared/payloads/field-analysis-request.json
```
