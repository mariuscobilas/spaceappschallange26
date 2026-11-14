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

## Testing Endpoints with curl

```sh
# Health check
curl -X GET http://localhost:8000/health

# Field shift analysis
curl -X POST http://localhost:8000/api/v1/field-shift/analyze \
  -H "Content-Type: application/json" \
  -d @shared/payloads/field-analysis-request.json
```
