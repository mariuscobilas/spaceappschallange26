from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Field Shift API", version="0.1.0")


class MockRequest(BaseModel):
    message: str


class MockResponse(BaseModel):
    message: str
    mock: bool


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/mock", response_model=MockResponse)
def mock(payload: MockRequest) -> MockResponse:
    return MockResponse(message=payload.message, mock=True)
