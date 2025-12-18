"""
Tests for OCR processing endpoints.
"""
import pytest
import base64
from PIL import Image
import io
from PIL import ImageDraw
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def test_process_with_structured_extraction():
    """Test OCR process endpoint with extract_structured=true."""
    from app.main import app

    # Create simple test image
    img = Image.new('RGB', (400, 100), color='white')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_b64 = base64.b64encode(img_bytes.getvalue()).decode()

    # Mock OCR processor
    mock_processor = MagicMock()
    mock_processor.is_supported.return_value = True
    mock_processor.extract_text.return_value = {
        'text': 'John Doe\njohn@example.com\n+1234567890',
        'pages': 1,
        'confidence': 85.0,
        'method': 'rapidocr',
        'language': 'en',
        'text_length': 35,
        'content_hash': 'abc123'
    }
    # This is the OLD format that processor.extract_structured_data returns
    # We want to CHANGE to the NEW format from ocr_extraction.py
    mock_processor.extract_structured_data.return_value = {
        'personal_info': {'email': 'john@example.com'},
        'skills': [],
        'experience': [],
        'education': [],
        'languages': [],
        'certifications': []
    }

    # Patch the OCR processor getter in app.main
    with patch('app.main.get_ocr_processor', return_value=mock_processor):
        client = TestClient(app)
        response = client.post(
            "/api/ocr/process",
            json={
                "file_content": img_b64,
                "file_type": "png",
                "language": "en",
                "extract_structured": True
            }
        )

    assert response.status_code == 200
    data = response.json()
    assert "structured_data" in data
    assert data["structured_data"] is not None
    # Should have tier1, tier2, tier3, raw_sections from ocr_extraction.py
    assert "tier1" in data["structured_data"], f"structured_data: {data['structured_data']}"
    assert "tier2" in data["structured_data"]
    assert "tier3" in data["structured_data"]
    assert "overall_confidence" in data["structured_data"]
