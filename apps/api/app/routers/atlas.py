from fastapi import APIRouter

from app.services.atlas import load_dataset
from shared.python.schemas import AtlasDataset

router = APIRouter()


@router.get("/api/v1/atlas", response_model=AtlasDataset)
def get_atlas() -> AtlasDataset:
    return load_dataset()
