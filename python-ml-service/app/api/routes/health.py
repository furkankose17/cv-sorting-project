"""
Health check endpoints for CV Sorting ML Service.
"""

import logging
from typing import Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends

from app.config import settings

router = APIRouter(prefix="/health", tags=["Health"])
logger = logging.getLogger(__name__)


@router.get("")
async def health_check() -> Dict[str, Any]:
    """
    Basic health check endpoint.

    Returns:
        Health status and service info
    """
    return {
        "status": "healthy",
        "service": settings.service_name,
        "version": settings.version,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/ready")
async def readiness_check() -> Dict[str, Any]:
    """
    Readiness check - verifies all dependencies are available.

    Returns:
        Readiness status with component details
    """
    from app.main import get_embedding_model, get_db_pool

    components = {
        "embedding_model": False,
        "database": False,
        "ocr": False
    }

    # Check embedding model
    try:
        model = get_embedding_model()
        if model is not None:
            components["embedding_model"] = True
    except Exception as e:
        logger.error(f"Embedding model check failed: {e}")

    # Check database
    try:
        db = get_db_pool()
        if db is not None and db.pool is not None:
            await db.fetchval("SELECT 1")
            components["database"] = True
    except Exception as e:
        logger.error(f"Database check failed: {e}")

    # Check OCR (RapidOCR or Tesseract fallback)
    try:
        from app.main import get_ocr_processor
        ocr = get_ocr_processor()
        if ocr is not None and ocr._ocr_available:
            components["ocr"] = True
    except Exception as e:
        logger.warning(f"OCR check failed: {e}")

    all_ready = all(components.values())

    return {
        "status": "ready" if all_ready else "degraded",
        "components": components,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/live")
async def liveness_check() -> Dict[str, str]:
    """
    Liveness check - simple check that service is running.

    Returns:
        Alive status
    """
    return {"status": "alive"}


@router.get("/info")
async def service_info() -> Dict[str, Any]:
    """
    Get service information and configuration.

    Returns:
        Service configuration details
    """
    from app.main import get_embedding_model

    model = get_embedding_model()
    model_info = {}

    if model:
        model_info = {
            "name": model.model_name,
            "dimension": model.dimension,
            "loaded": model.is_loaded
        }

    return {
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "embedding_model": model_info,
        "scoring_weights": {
            "semantic": settings.semantic_weight,
            "criteria": settings.criteria_weight
        },
        "default_limits": {
            "min_score": settings.default_min_score,
            "match_limit": settings.default_match_limit
        }
    }
