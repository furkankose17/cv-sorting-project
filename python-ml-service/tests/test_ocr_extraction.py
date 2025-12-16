"""
Tests for OCR structured data extraction.
"""
import pytest
from fastapi.testclient import TestClient


def test_extract_structured_endpoint_exists(client: TestClient):
    """Test that extract-structured endpoint exists."""
    response = client.post(
        "/api/ocr/extract-structured",
        json={
            "text": "John Doe\nSoftware Engineer\njohn@example.com\n+1234567890",
            "language": "en"
        }
    )
    assert response.status_code in [200, 422], "Endpoint should exist"


def test_extract_personal_info_tier1(client: TestClient):
    """Test extraction of tier 1 personal information."""
    sample_text = """
    John Michael Doe
    New York, NY, USA
    Email: john.doe@example.com
    Phone: +1 (555) 123-4567
    """

    response = client.post(
        "/api/ocr/extract-structured",
        json={"text": sample_text, "language": "en"}
    )

    assert response.status_code == 200
    data = response.json()

    assert "tier1" in data
    assert "firstName" in data["tier1"]
    assert data["tier1"]["firstName"]["value"] == "John"
    assert data["tier1"]["firstName"]["confidence"] > 80

    assert "email" in data["tier1"]
    assert "john.doe@example.com" in data["tier1"]["email"]["value"]

    assert "overall_confidence" in data
    assert data["overall_confidence"] > 0


def test_extract_work_history_tier2(client: TestClient):
    """Test extraction of tier 2 work history."""
    sample_text = """
    WORK EXPERIENCE

    Senior Software Engineer
    TechCorp Inc.
    January 2020 - Present

    Software Developer
    StartupXYZ
    June 2018 - December 2019
    """

    response = client.post(
        "/api/ocr/extract-structured",
        json={"text": sample_text, "language": "en"}
    )

    assert response.status_code == 200
    data = response.json()

    assert "tier2" in data
    assert "workHistory" in data["tier2"]
    assert len(data["tier2"]["workHistory"]) >= 1
