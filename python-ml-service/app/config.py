"""
Configuration management for CV Sorting ML Service.
Uses pydantic-settings for environment variable loading.
"""

from functools import lru_cache
from typing import List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "CV Sorting ML Service"
    app_version: str = "1.0.0"
    environment: str = "development"  # development, staging, production
    debug: bool = False
    log_level: str = "INFO"
    api_prefix: str = "/api"

    # Property aliases for health check compatibility
    @property
    def service_name(self) -> str:
        """Alias for app_name for health check compatibility."""
        return self.app_name

    @property
    def version(self) -> str:
        """Alias for app_version for health check compatibility."""
        return self.app_version

    # ML Model Configuration - Embedding
    # Using multilingual-e5-small for 100+ language support (EN, DE, TR, FR, ES, etc.)
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_dimension: int = 384  # Same as MiniLM, no DB migration needed
    embedding_batch_size: int = 32
    embedding_normalize: bool = True
    embedding_max_length: int = 512
    embedding_cache_enabled: bool = True

    # PostgreSQL Configuration
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "cv_sorting"
    postgres_user: str = "postgres"
    postgres_password: str = ""
    postgres_ssl: bool = False
    postgres_pool_min: int = 2
    postgres_pool_max: int = 10

    @property
    def postgres_url(self) -> str:
        """Construct PostgreSQL connection URL."""
        ssl_suffix = "?sslmode=require" if self.postgres_ssl else ""
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}{ssl_suffix}"

    @property
    def postgres_async_url(self) -> str:
        """Construct async PostgreSQL connection URL for asyncpg."""
        ssl_suffix = "?ssl=require" if self.postgres_ssl else ""
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}{ssl_suffix}"

    # CAP Service Configuration
    cap_service_url: str = "http://localhost:4004"
    cap_client_id: Optional[str] = None
    cap_client_secret: Optional[str] = None
    cap_token_url: Optional[str] = None

    # OCR Configuration
    # PaddleOCR is primary (faster, better table handling), Tesseract is fallback
    ocr_engine: str = "paddleocr"  # "paddleocr" or "tesseract"
    tesseract_cmd: str = "tesseract"
    poppler_path: Optional[str] = None
    ocr_default_language: str = "en"  # PaddleOCR uses 'en', 'german', 'turkish', etc.
    ocr_supported_languages: List[str] = ["en", "german", "turkish", "french", "spanish"]
    ocr_table_detection: bool = True
    ocr_layout_analysis: bool = True
    ocr_use_angle_cls: bool = True  # Detect rotated text

    # Matching Configuration
    semantic_weight: float = 0.4
    criteria_weight: float = 0.6
    default_min_score: float = 50.0
    default_match_limit: int = 50

    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds

    # CORS
    allowed_origins: str = "*"

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse allowed origins into a list."""
        if self.allowed_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.allowed_origins.split(",")]

    # File Processing
    max_file_size_mb: int = 20
    supported_file_types: List[str] = ["pdf", "png", "jpg", "jpeg", "tiff", "docx"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Export settings instance
settings = get_settings()
