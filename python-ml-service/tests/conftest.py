"""
Pytest fixtures for CV Sorting ML Service tests.

Provides mock objects, sample data, and test clients.
"""

import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock
from typing import Dict, Any, List
import numpy as np

# Conditionally import httpx for async client
try:
    from httpx import AsyncClient
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False


# ============================================
# EVENT LOOP FIXTURE
# ============================================

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ============================================
# MOCK EMBEDDING MODEL
# ============================================

@pytest.fixture
def mock_embedding_model():
    """
    Mock embedding model for unit tests.

    Returns consistent embeddings without loading actual model.
    """
    model = MagicMock()
    model.dimension = 384
    model.model_name = "test-model"

    def mock_encode_single(text: str) -> np.ndarray:
        # Generate deterministic embedding based on text hash
        np.random.seed(hash(text) % 2**32)
        return np.random.randn(384).astype(np.float32)

    def mock_encode_query(text: str) -> np.ndarray:
        # Query embeddings have slightly different distribution
        np.random.seed((hash(text) + 1) % 2**32)
        return np.random.randn(384).astype(np.float32)

    def mock_combine_embeddings(embeddings: List[np.ndarray], weights: List[float] = None) -> np.ndarray:
        if not embeddings:
            return np.zeros(384, dtype=np.float32)
        weights = weights or [1.0] * len(embeddings)
        combined = sum(e * w for e, w in zip(embeddings, weights))
        return (combined / sum(weights)).astype(np.float32)

    def mock_compute_similarity(a: np.ndarray, b: np.ndarray) -> float:
        # Cosine similarity
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))

    model.encode_single = mock_encode_single
    model.encode_query = mock_encode_query
    model.combine_embeddings = mock_combine_embeddings
    model.compute_similarity = mock_compute_similarity

    return model


# ============================================
# MOCK DATABASE POOL
# ============================================

@pytest.fixture
def mock_db_pool():
    """
    Mock database pool for unit tests.

    Simulates asyncpg pool without actual database connection.
    """
    pool = AsyncMock()

    # Storage for mock data
    pool._storage = {
        "candidate_embeddings": {},
        "job_embeddings": {},
        "scoring_criteria": {},
        "semantic_match_results": {}
    }

    async def mock_fetch(query: str, *args):
        return []

    async def mock_fetchrow(query: str, *args):
        return None

    async def mock_fetchval(query: str, *args):
        return None

    async def mock_execute(query: str, *args):
        return "OK"

    pool.fetch = mock_fetch
    pool.fetchrow = mock_fetchrow
    pool.fetchval = mock_fetchval
    pool.execute = mock_execute

    return pool


# ============================================
# SAMPLE DATA FIXTURES
# ============================================

@pytest.fixture
def sample_candidate_data() -> Dict[str, Any]:
    """Sample candidate data for scoring tests."""
    return {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567801",
        "name": "John Developer",
        "skills": ["Python", "JavaScript", "React", "Docker", "AWS"],
        "languages": {
            "English": "fluent",
            "German": "intermediate",
            "Turkish": "native"
        },
        "certifications": ["AWS Solutions Architect", "Kubernetes Administrator"],
        "totalExperienceYears": 5,
        "educationLevel": "bachelor"
    }


@pytest.fixture
def sample_job_data() -> Dict[str, Any]:
    """Sample job posting data for matching tests."""
    return {
        "id": "f1b2c3d4-e5f6-7890-abcd-ef1234567801",
        "title": "Senior Full-Stack Developer",
        "description": "We are looking for an experienced full-stack developer...",
        "qualifications": "Bachelor's degree in CS or equivalent experience",
        "requiredSkills": [
            {"name": "Python", "required": True, "minimumProficiency": "advanced", "weight": 1.0},
            {"name": "JavaScript", "required": True, "minimumProficiency": "intermediate", "weight": 0.8},
            {"name": "React", "required": False, "minimumProficiency": "intermediate", "weight": 0.6},
        ],
        "minimumExperience": 3,
        "preferredExperience": 5
    }


@pytest.fixture
def sample_scoring_criteria() -> List[Dict[str, Any]]:
    """Sample scoring criteria for tests."""
    return [
        {
            "id": "crit-001",
            "criteria_type": "skill",
            "criteria_value": "Python",
            "points": 10,
            "is_required": True,
            "weight": 1.0
        },
        {
            "id": "crit-002",
            "criteria_type": "skill",
            "criteria_value": "JavaScript",
            "points": 8,
            "is_required": True,
            "weight": 1.0
        },
        {
            "id": "crit-003",
            "criteria_type": "skill",
            "criteria_value": "React",
            "points": 5,
            "is_required": False,
            "weight": 1.0
        },
        {
            "id": "crit-004",
            "criteria_type": "experience",
            "criteria_value": "3",
            "points": 15,
            "is_required": True,
            "weight": 1.0,
            "min_value": 3,
            "per_unit_points": 2.0,
            "max_points": 25
        },
        {
            "id": "crit-005",
            "criteria_type": "certification",
            "criteria_value": "AWS",
            "points": 10,
            "is_required": False,
            "weight": 1.0
        },
        {
            "id": "crit-006",
            "criteria_type": "language",
            "criteria_value": "English",
            "points": 5,
            "is_required": False,
            "weight": 1.0
        }
    ]


@pytest.fixture
def sample_embedding() -> np.ndarray:
    """Sample 384-dimensional embedding vector."""
    np.random.seed(42)
    return np.random.randn(384).astype(np.float32)


# ============================================
# HTTP CLIENT FIXTURES
# ============================================

@pytest.fixture
def client():
    """
    Synchronous HTTP client for API tests.

    Uses TestClient from FastAPI for testing endpoints.
    """
    try:
        from fastapi.testclient import TestClient
        from app.main import app
        return TestClient(app)
    except ImportError:
        pytest.skip("FastAPI app not available")


@pytest.fixture
async def async_client():
    """
    Async HTTP client for API integration tests.

    Requires the FastAPI app to be importable.
    """
    if not HTTPX_AVAILABLE:
        pytest.skip("httpx not installed")

    try:
        from app.main import app
        async with AsyncClient(app=app, base_url="http://test") as client:
            yield client
    except ImportError:
        pytest.skip("FastAPI app not available")


# ============================================
# ENVIRONMENT FIXTURES
# ============================================

@pytest.fixture
def mock_vcap_services(monkeypatch):
    """Mock VCAP_SERVICES environment variable."""
    vcap = {
        "postgresql-db": [{
            "credentials": {
                "hostname": "test-db.example.com",
                "port": 5432,
                "dbname": "test_cv_sorting",
                "username": "test_user",
                "password": "test_pass",
                "sslmode": "require"
            }
        }]
    }
    import json
    monkeypatch.setenv("VCAP_SERVICES", json.dumps(vcap))
    return vcap


@pytest.fixture
def clean_environment(monkeypatch):
    """Clear VCAP environment variables."""
    monkeypatch.delenv("VCAP_SERVICES", raising=False)
    monkeypatch.delenv("VCAP_APPLICATION", raising=False)
