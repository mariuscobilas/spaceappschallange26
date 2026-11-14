---
name: api-designer
description: >-
  Enforces consistent REST conventions, URI naming, pagination schemas, versioning strategy,
  and OpenAPI 3.1 contract specifications for cross-team alignment.
---

# API Designer Skill

Standards and design patterns for building intuitive, predictable RESTful APIs consumed by Next.js.

## RESTful URI Design Standards

1. **Nouns, Not Verbs**:
   - ✅ `POST /api/v1/fields` (Create field)
   - ✅ `GET /api/v1/fields/{id}` (Get field)
   - ✅ `POST /api/v1/fields/{id}/analyze` (Action on sub-resource)
   - ❌ `GET /api/v1/getFields` or `POST /api/v1/doFieldAnalysis`
2. **Plural Resource Nouns**:
   - Use `/api/v1/fields`, `/api/v1/predictions`, `/api/v1/observations`.
3. **HTTP Methods**:
   - `GET`: Safe & idempotent. Never mutates server state.
   - `POST`: Create a resource or trigger non-idempotent computational action.
   - `PUT`: Complete idempotent replacement of a resource.
   - `PATCH`: Partial update of specific fields.
   - `DELETE`: Idempotent removal.

## Pagination Standards

For endpoints returning collections:

```typescript
// Envelope:
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

Query parameters:
- `page`: default `1` (1-indexed)
- `limit`: default `20`, maximum `100`

## Error Response Standard

Always return RFC 7807 Problem Details or consistent envelope:

```json
{
  "code": "FIELD_NOT_FOUND",
  "message": "Field with ID field-001 does not exist.",
  "details": {
    "fieldId": "field-001"
  }
}
```

## Alignment Rule

Before implementing an endpoint in FastAPI or consuming it in Next.js, add the payload to `shared/payloads/` and TypeScript interface to `shared/src/types/api.ts`.

