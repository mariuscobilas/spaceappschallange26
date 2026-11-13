# API endpoints

Local base URL: `http://localhost:8000`. Interactive OpenAPI docs: `/docs`.

## `GET /health`

No request body. Response (`200 OK`):

```json
{"status":"ok"}
```

## `POST /api/v1/mock`

A generic setup demo. This is not an ML prediction endpoint or final farm-data contract.

Request (`Content-Type: application/json`):

```json
{"message":"hello"}
```

Response (`200 OK`):

```json
{"message":"hello","mock":true}
```

The `message` field is required and must be a string. FastAPI returns `422 Unprocessable Entity` for a missing or invalid field.

```sh
curl -X POST http://localhost:8000/api/v1/mock -H "Content-Type: application/json" -d '{"message":"hello"}'
```

In Windows PowerShell:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/v1/mock -Method Post -ContentType 'application/json' -Body '{"message":"hello"}'
```
