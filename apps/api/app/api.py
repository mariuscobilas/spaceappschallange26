"""Frontend routes, startup loading, and stable error envelopes."""

import json
import logging
import time
from contextlib import asynccontextmanager
from threading import BoundedSemaphore
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from .contracts import (AnalysisExample, AnalysisRequest, AnalysisResponse, ErrorBody, ErrorResponse,
                        FieldError, OptionsResponse, ReadinessResponse)
from . import service

logger = logging.getLogger("field_shift.api")
ERRORS = {422: {"model": ErrorResponse}, 429: {"model": ErrorResponse},
          500: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}
router = APIRouter(responses=ERRORS)


def lifecycle(engine_factory=None):
    factory = engine_factory or service.load_engine

    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = None
        app.state.analysis_slots = BoundedSemaphore(1)
        try:
            app.state.engine = await run_in_threadpool(factory)
        except Exception:
            logger.exception("Model/weather initialization failed; metadata and example routes remain available")
        yield
    return lifespan


def error_response(request, status, code, message, details=None, headers=None):
    body = ErrorResponse(request_id=getattr(request.state, "request_id", str(uuid4())),
                         error=ErrorBody(code=code, message=message, details=details or []))
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"), headers=headers)


def configure_errors(app):
    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        details = [FieldError(location=list(item["loc"]), message=item["msg"], type=item["type"]) for item in error.errors()]
        return error_response(request, 422, "validation_error", "Some request fields are invalid.", details)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, error):
        detail = error.detail if isinstance(error.detail, dict) else {"code": "http_error", "message": str(error.detail)}
        return error_response(request, error.status_code, detail["code"], detail["message"], headers=error.headers)

    @app.exception_handler(Exception)
    async def unexpected_error(request, error):
        logger.error("Unexpected API error for request %s", getattr(request.state, "request_id", "unknown"), exc_info=error)
        return error_response(request, 500, "internal_error", "The analysis could not be completed.")

    @app.middleware("http")
    async def request_metadata(request, call_next):
        request.state.request_id = str(uuid4())
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("Request %s failed", request.state.request_id)
            response = error_response(request, 500, "internal_error", "The analysis could not be completed.")
        duration = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Process-Time-Ms"] = f"{duration:.1f}"
        logger.info("%s %s status=%s duration_ms=%.1f request_id=%s", request.method, request.url.path, response.status_code, duration, request.state.request_id)
        return response


@router.get("/ready", response_model=ReadinessResponse, responses={503: {"model": ReadinessResponse}}, tags=["Service"])
def readiness(request: Request):
    engine = request.app.state.engine
    info = engine.model_info if engine else {}
    body = ReadinessResponse(status="ready" if engine else "unavailable", inference_available=engine is not None,
        model_name=info.get("name"), model_status=info.get("status"), reason=None if engine else "model_or_weather_unavailable")
    return JSONResponse(status_code=200 if engine else 503, content=body.model_dump(mode="json"))


@router.get("/api/v1/options", response_model=OptionsResponse, tags=["Frontend"])
def options():
    return service.options()


@router.post("/api/v1/analyze", response_model=AnalysisResponse, tags=["Analysis"],
             summary="Compare a cover crop with fallow under three historical weather cases",
             openapi_extra={"requestBody": {"content": {"application/json": {"example": service.default_request().model_dump(mode="json")}}}})
def analyze(payload: AnalysisRequest, request: Request):
    engine = request.app.state.engine
    if engine is None:
        raise HTTPException(503, detail={"code": "service_unavailable", "message": "Model or weather artifacts are unavailable. Metadata and the explicit example route can still be used."})
    slots = request.app.state.analysis_slots
    if not slots.acquire(blocking=False):
        raise HTTPException(429, detail={"code": "analysis_busy", "message": "Another analysis is running. Retry shortly."}, headers={"Retry-After": "1"})
    try:
        return service.analyze(engine, payload, request.state.request_id)
    except ValueError as error:
        if "at least three complete" in str(error):
            raise HTTPException(422, detail={"code": "invalid_scenario", "message": "The supplied calendar cannot be simulated with the available complete historical seasons."})
        raise
    finally:
        slots.release()


@router.get("/api/v1/examples/analysis", response_model=AnalysisExample, tags=["Frontend"],
            summary="Explicit saved example; does not run the model")
def analysis_example():
    path = service.legacy.prep.ROOT / "examples/api/analysis.example.json"
    if not path.is_file():
        raise HTTPException(503, detail={"code": "example_unavailable", "message": "Run export_api_handoff.py to generate the saved example."})
    return AnalysisExample.model_validate(json.loads(path.read_text(encoding="utf-8")))
