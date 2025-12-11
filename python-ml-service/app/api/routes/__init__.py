# Routes package
from app.api.routes.health import router as health_router
from app.api.routes.embeddings import router as embeddings_router
from app.api.routes.ocr import router as ocr_router
from app.api.routes.matching import router as matching_router
from app.api.routes.scoring import router as scoring_router

__all__ = [
    "health_router",
    "embeddings_router",
    "ocr_router",
    "matching_router",
    "scoring_router"
]
