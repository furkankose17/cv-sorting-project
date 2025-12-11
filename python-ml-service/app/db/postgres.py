"""
PostgreSQL connection pool with pgvector support.
"""

import logging
from typing import Optional, List, Any
from contextlib import asynccontextmanager

import asyncpg
from asyncpg import Pool, Connection

from app.config import settings

logger = logging.getLogger(__name__)


class PostgresPool:
    """
    Async PostgreSQL connection pool manager.
    Supports pgvector extension for vector operations.
    """

    def __init__(self, dsn: str = None, min_size: int = 2, max_size: int = 10):
        """
        Initialize PostgreSQL pool configuration.

        Args:
            dsn: Database connection string
            min_size: Minimum pool connections
            max_size: Maximum pool connections
        """
        self.dsn = dsn or settings.postgres_url
        self.min_size = min_size
        self.max_size = max_size
        self._pool: Optional[Pool] = None

    async def connect(self) -> Pool:
        """
        Create and return connection pool.

        Returns:
            asyncpg connection pool
        """
        if self._pool is not None:
            return self._pool

        try:
            self._pool = await asyncpg.create_pool(
                dsn=self.dsn,
                min_size=self.min_size,
                max_size=self.max_size,
                command_timeout=60,
                init=self._init_connection
            )
            logger.info(f"PostgreSQL pool created (min={self.min_size}, max={self.max_size})")

            # Verify pgvector extension
            async with self._pool.acquire() as conn:
                result = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
                )
                if result:
                    logger.info("pgvector extension is available")
                else:
                    logger.warning("pgvector extension NOT found - vector operations will fail")

            return self._pool
        except Exception as e:
            logger.error(f"Failed to create PostgreSQL pool: {e}")
            raise

    async def _init_connection(self, conn: Connection) -> None:
        """
        Initialize each connection with vector type codec.

        Args:
            conn: asyncpg connection
        """
        # Register vector type if pgvector is available
        try:
            await conn.set_type_codec(
                'vector',
                encoder=self._encode_vector,
                decoder=self._decode_vector,
                schema='public',
                format='text'
            )
        except Exception as e:
            logger.debug(f"Could not register vector codec: {e}")

    def _encode_vector(self, vector: List[float]) -> str:
        """Encode Python list to pgvector format."""
        return '[' + ','.join(str(v) for v in vector) + ']'

    def _decode_vector(self, data: str) -> List[float]:
        """Decode pgvector format to Python list."""
        # Remove brackets and split
        return [float(v) for v in data[1:-1].split(',')]

    async def close(self) -> None:
        """Close the connection pool."""
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            logger.info("PostgreSQL pool closed")

    @asynccontextmanager
    async def acquire(self):
        """
        Acquire a connection from the pool.

        Usage:
            async with pool.acquire() as conn:
                await conn.execute(...)
        """
        if self._pool is None:
            await self.connect()

        async with self._pool.acquire() as conn:
            yield conn

    async def execute(self, query: str, *args) -> str:
        """Execute a query that doesn't return rows."""
        async with self.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetch(self, query: str, *args) -> List[asyncpg.Record]:
        """Execute a query and return all rows."""
        async with self.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args) -> Optional[asyncpg.Record]:
        """Execute a query and return a single row."""
        async with self.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args) -> Any:
        """Execute a query and return a single value."""
        async with self.acquire() as conn:
            return await conn.fetchval(query, *args)

    @property
    def pool(self) -> Optional[Pool]:
        """Get the underlying pool."""
        return self._pool


async def get_pool() -> PostgresPool:
    """
    Get the global PostgreSQL pool instance.
    Used for FastAPI dependency injection.
    """
    from app.main import get_db_pool
    return get_db_pool()


async def init_database(pool: PostgresPool) -> None:
    """
    Initialize database schema if not exists.
    Creates pgvector extension and tables.

    Args:
        pool: PostgreSQL pool instance
    """
    async with pool.acquire() as conn:
        # Enable pgvector extension
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")

        # Create candidate embeddings table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS candidate_embeddings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                candidate_id UUID NOT NULL UNIQUE,
                cv_text_embedding vector(384),
                skills_embedding vector(384),
                experience_embedding vector(384),
                combined_embedding vector(384) NOT NULL,
                embedding_model VARCHAR(100) NOT NULL,
                cv_text_hash VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create job embeddings table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS job_embeddings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                job_posting_id UUID NOT NULL UNIQUE,
                description_embedding vector(384),
                requirements_embedding vector(384),
                combined_embedding vector(384) NOT NULL,
                embedding_model VARCHAR(100) NOT NULL,
                description_hash VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create scoring criteria table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS scoring_criteria (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                job_posting_id UUID NOT NULL,
                criteria_type VARCHAR(50) NOT NULL,
                criteria_value VARCHAR(255) NOT NULL,
                points INTEGER NOT NULL DEFAULT 1,
                is_required BOOLEAN DEFAULT FALSE,
                weight DECIMAL(3,2) DEFAULT 1.0,
                min_value INTEGER,
                per_unit_points DECIMAL(5,2),
                max_points INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(job_posting_id, criteria_type, criteria_value)
            )
        """)

        # Create semantic match results table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS semantic_match_results (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                candidate_id UUID NOT NULL,
                job_posting_id UUID NOT NULL,
                cosine_similarity DECIMAL(7,5) NOT NULL,
                criteria_score DECIMAL(7,2),
                criteria_max_score DECIMAL(7,2),
                criteria_percentage DECIMAL(5,2),
                combined_score DECIMAL(5,2) NOT NULL,
                rank INTEGER,
                score_breakdown JSONB,
                matched_criteria JSONB,
                missing_criteria JSONB,
                calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(candidate_id, job_posting_id)
            )
        """)

        # Create notification thresholds table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS notification_thresholds (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                job_posting_id UUID NOT NULL UNIQUE,
                min_score_threshold DECIMAL(5,2) NOT NULL DEFAULT 70.0,
                min_candidates_count INTEGER NOT NULL DEFAULT 5,
                notify_email VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                last_notified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes for vector similarity search
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_combined
            ON candidate_embeddings
            USING ivfflat (combined_embedding vector_cosine_ops)
            WITH (lists = 100)
        """)

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_job_embeddings_combined
            ON job_embeddings
            USING ivfflat (combined_embedding vector_cosine_ops)
            WITH (lists = 50)
        """)

        # Create other indexes
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_scoring_criteria_job
            ON scoring_criteria(job_posting_id)
        """)

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_match_results_job
            ON semantic_match_results(job_posting_id, combined_score DESC)
        """)

        logger.info("Database schema initialized successfully")
