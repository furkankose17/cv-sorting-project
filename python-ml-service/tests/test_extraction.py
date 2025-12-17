# python-ml-service/tests/test_extraction.py
import pytest
from app.api.routes.ocr_extraction import find_section_headers

def test_find_section_headers_normal():
    text = """John Smith
Email: john@email.com

WORK EXPERIENCE
Senior Developer at Company

EDUCATION
BS Computer Science
"""
    headers = find_section_headers(text)
    assert "work_experience" in headers
    assert "education" in headers

def test_find_section_headers_merged_ocr():
    """Test OCR artifacts like merged words"""
    text = """WORKEXPERIENCE
Senior Developer

EDUCATION
BS Computer Science
"""
    headers = find_section_headers(text)
    assert "work_experience" in headers

def test_find_section_headers_lowercase():
    text = """Work Experience
Developer

Education
Degree
"""
    headers = find_section_headers(text)
    assert "work_experience" in headers
    assert "education" in headers
