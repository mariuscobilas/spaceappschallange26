from fastapi import APIRouter

from app.services.regional_yield import load_regional_yield
from shared.python.schemas import RegionalYieldDataset

router = APIRouter()


@router.get("/api/v1/atlas/regional-yield", response_model=RegionalYieldDataset)
def get_regional_yield() -> RegionalYieldDataset:
    return load_regional_yield()
