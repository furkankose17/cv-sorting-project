"""
CV Sorting ML Service - FastAPI Application
Main entry point for the ML microservice.
"""

import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.routes import (
    health_router,
    embeddings_router,
    ocr_router,
    matching_router,
    scoring_router
)
from app.models.embeddings import EmbeddingModel
from app.models.ocr import OCRProcessor
from app.db.postgres import PostgresPool
from app.services.embedding_service import EmbeddingService
from app.services.scoring_service import ScoringService
from app.services.matching_service import SemanticMatchingService

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global instances (initialized on startup)
embedding_model: Optional[EmbeddingModel] = None
ocr_processor: Optional[OCRProcessor] = None
db_pool: Optional[PostgresPool] = None
embedding_service: Optional[EmbeddingService] = None
scoring_service: Optional[ScoringService] = None
matching_service: Optional[SemanticMatchingService] = None


# Getter functions for dependency injection
def get_embedding_model() -> Optional[EmbeddingModel]:
    """Get the global embedding model instance."""
    return embedding_model


def get_ocr_processor() -> Optional[OCRProcessor]:
    """Get the global OCR processor instance."""
    return ocr_processor


def get_db_pool() -> Optional[PostgresPool]:
    """Get the global database pool instance."""
    return db_pool


def get_embedding_service() -> Optional[EmbeddingService]:
    """Get the global embedding service instance."""
    return embedding_service


def get_scoring_service() -> Optional[ScoringService]:
    """Get the global scoring service instance."""
    return scoring_service


def get_matching_service() -> Optional[SemanticMatchingService]:
    """Get the global matching service instance."""
    return matching_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    global embedding_model, ocr_processor, db_pool
    global embedding_service, scoring_service, matching_service

    # Startup
    logger.info("Starting CV Sorting ML Service...")

    # Load embedding model
    logger.info(f"Loading embedding model: {settings.embedding_model}")
    try:
        embedding_model = EmbeddingModel(
            model_name=settings.embedding_model,
            normalize=settings.embedding_normalize
        )
        logger.info(f"Embedding model loaded. Dimension: {embedding_model.dimension}")
    except Exception as e:
        logger.error(f"Failed to load embedding model: {e}")
        raise

    # Initialize OCR processor
    logger.info(f"Initializing OCR processor (engine: {settings.ocr_engine})...")
    try:
        ocr_processor = OCRProcessor(
            engine=settings.ocr_engine,
            tesseract_cmd=settings.tesseract_cmd if settings.tesseract_cmd else None,
            poppler_path=settings.poppler_path if settings.poppler_path else None,
            default_language=settings.ocr_default_language,
            use_angle_cls=settings.ocr_use_angle_cls,
            table_detection=settings.ocr_table_detection,
            layout_analysis=settings.ocr_layout_analysis
        )
        logger.info(f"OCR processor initialized: {ocr_processor.get_engine_info()}")
    except Exception as e:
        logger.warning(f"OCR processor initialization issue: {e}")
        ocr_processor = OCRProcessor(engine="tesseract")

    # Initialize database pool
    logger.info("Connecting to PostgreSQL...")
    try:
        db_pool = PostgresPool(
            dsn=settings.postgres_async_url,
            min_size=settings.postgres_pool_min,
            max_size=settings.postgres_pool_max
        )
        await db_pool.connect()
        logger.info("PostgreSQL connection pool established")
    except Exception as e:
        logger.warning(f"Failed to connect to PostgreSQL: {e}")
        # Continue without database (for development)
        db_pool = None

    # Initialize services
    logger.info("Initializing services...")

    embedding_service = EmbeddingService(
        db_pool=db_pool,
        embedding_model=embedding_model
    )

    scoring_service = ScoringService(db_pool=db_pool)

    matching_service = SemanticMatchingService(
        db_pool=db_pool,
        embedding_model=embedding_model,
        scoring_service=scoring_service
    )

    # Store in app state for access in routes
    app.state.embedding_model = embedding_model
    app.state.ocr_processor = ocr_processor
    app.state.db_pool = db_pool
    app.state.embedding_service = embedding_service
    app.state.scoring_service = scoring_service
    app.state.matching_service = matching_service

    logger.info("CV Sorting ML Service started successfully")

    yield

    # Shutdown
    logger.info("Shutting down CV Sorting ML Service...")

    if db_pool:
        await db_pool.close()
        logger.info("PostgreSQL connection pool closed")

    logger.info("CV Sorting ML Service stopped")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
    CV Sorting ML Service provides AI/ML capabilities for the CV Sorting application:

    - **Embeddings**: Generate vector embeddings using Sentence Transformers
    - **OCR**: Extract text from PDF and image documents using Tesseract
    - **Matching**: Semantic similarity search using pgvector
    - **Scoring**: Criteria-based candidate scoring
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.exception(f"Unexpected error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "status_code": 500
        }
    )


# Include routers (routers already have their own prefixes)
app.include_router(health_router)
app.include_router(embeddings_router)
app.include_router(ocr_router)
app.include_router(matching_router)
app.include_router(scoring_router)


# Root endpoint
@app.get("/", include_in_schema=False)
async def root() -> Dict[str, Any]:
    """Root endpoint with service information."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        workers=1 if settings.debug else 2
    )
