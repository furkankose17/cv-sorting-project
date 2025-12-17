"""
Integration tests for API endpoints.

These tests require the FastAPI app to be running.
Mark with @pytest.mark.integration to skip in unit test runs.
"""

import pytest

pytestmark = pytest.mark.integration


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    async def test_liveness(self, async_client):
        """Test /health/live returns alive status."""
        response = await async_client.get("/health/live")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"

    async def test_readiness(self, async_client):
        """Test /health/ready returns component status."""
        response = await async_client.get("/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "components" in data

    async def test_health_info(self, async_client):
        """Test /health/info returns service info."""
        response = await async_client.get("/health/info")

        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert "version" in data


class TestEmbeddingEndpoints:
    """Tests for embedding generation endpoints."""

    async def test_generate_embedding_candidate(self, async_client):
        """Test embedding generation for candidate."""
        payload = {
            "entity_type": "candidate",
            "entity_id": "test-candidate-123",
            "text_content": "Experienced software developer with 5 years of Python and JavaScript experience.",
            "skills_text": "Python, JavaScript, React, Docker",
            "store": False
        }

        response = await async_client.post("/api/embeddings/generate", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert data["entity_id"] == "test-candidate-123"
        assert data["entity_type"] == "candidate"
        assert data["embedding_dimension"] == 384

    async def test_generate_embedding_job(self, async_client):
        """Test embedding generation for job posting."""
        payload = {
            "entity_type": "job",
            "entity_id": "test-job-123",
            "text_content": "We are looking for a Senior Full-Stack Developer with React experience.",
            "requirements_text": "5+ years experience, Bachelor's degree",
            "store": False
        }

        response = await async_client.post("/api/embeddings/generate", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert data["entity_id"] == "test-job-123"
        assert data["entity_type"] == "job"

    async def test_generate_embedding_missing_content(self, async_client):
        """Test error handling for missing content."""
        payload = {
            "entity_type": "candidate",
            "entity_id": "test-123"
            # Missing text_content
        }

        response = await async_client.post("/api/embeddings/generate", json=payload)

        assert response.status_code == 422  # Validation error


class TestOCREndpoints:
    """Tests for OCR endpoints."""

    async def test_get_supported_formats(self, async_client):
        """Test OCR supported formats endpoint."""
        response = await async_client.get("/api/ocr/formats")

        assert response.status_code == 200
        data = response.json()
        assert "formats" in data
        assert "pdf" in data["formats"]

    async def test_get_supported_languages(self, async_client):
        """Test OCR supported languages endpoint."""
        response = await async_client.get("/api/ocr/languages")

        assert response.status_code == 200
        data = response.json()
        assert "languages" in data
        assert len(data["languages"]) > 0


class TestScoringEndpoints:
    """Tests for scoring criteria endpoints."""

    async def test_get_scoring_templates(self, async_client):
        """Test getting scoring criteria templates."""
        response = await async_client.get("/api/scoring/templates")

        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        assert len(data["templates"]) > 0
