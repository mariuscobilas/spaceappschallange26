---
name: fastapi-reviewer
description: >-
  Audits FastAPI endpoints and services for blocking synchronous calls, flawed dependency
  injection scopes, missing error handlers, security oversights, and OpenAPI documentation quality.
---

# FastAPI Reviewer Skill

Review checklist and diagnostic guidelines for reviewing FastAPI backend pull requests.

## Critical Review Checklist

### 1. Blocking Synchronous Calls in `async def`
- ❌ **Anti-Pattern**: Using `time.sleep()`, synchronous `requests.get()`, or blocking file/database I/O inside `async def` handlers. This blocks the entire Python asyncio event loop for all concurrent requests!
- ✅ **Fix**: Use `asyncio.sleep()`, `httpx.AsyncClient()`, or wrap blocking operations with `asyncio.to_thread(blocking_fn, *args)`. Alternatively, declare the handler as normal `def` so FastAPI runs it automatically in an external threadpool.

### 2. Dependency Injection Scoping & Leaks
- ❌ **Anti-Pattern**: Reusing mutable session instances across requests or creating global database sessions.
- ✅ **Fix**: Always use `Depends(get_session)` with generator/context manager yielding and closing properly in a `finally:` block.

### 3. Error Handling & Status Codes
- ❌ **Anti-Pattern**: Catching broad `Exception` and returning generic 500 without details or swallowing errors silently.
- ❌ **Anti-Pattern**: Returning 200 OK with `{"error": "something failed"}` payload.
- ✅ **Fix**: Raise `fastapi.HTTPException(status_code=..., detail=...)`. Provide structured error models in `responses={404: {"model": ApiError}}`.

### 4. Response Models & Serialization Overhead
- ❌ **Anti-Pattern**: Omitting `response_model`, exposing internal database fields (like password hashes or internal IDs).
- ✅ **Fix**: Always specify `response_model=SomeSchema`. Use `response_model_exclude_unset=True` if omitting non-supplied fields.

### 5. CORS & Origin Restraints
- ❌ **Anti-Pattern**: `allow_origins=["*"]` combined with `allow_credentials=True` (disallowed by browser security standards).
- ✅ **Fix**: Specify explicit allowed origins:
  ```python
  allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"]
  ```

### 6. OpenAPI Documentation Quality
- Ensure each endpoint has a `summary`, `description`, `tags`, and explicit status codes.
- Check interactive docs at `http://localhost:8000/docs`.

