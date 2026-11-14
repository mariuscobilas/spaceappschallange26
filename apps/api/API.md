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

## Testing Endpoints with curl

```sh
# Health check
curl -X GET http://localhost:8000/health

# Field shift analysis
curl -X POST http://localhost:8000/api/v1/field-shift/analyze \
  -H "Content-Type: application/json" \
  -d @shared/payloads/field-analysis-request.json
```
