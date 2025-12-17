# python-ml-service/tests/test_extraction.py
import pytest
from app.api.routes.ocr_extraction import find_section_headers, parse_work_history, parse_education

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

def test_parse_work_history_single_job():
    text = """Senior Software Engineer
Tech Solutions Inc. | 2020 - Present
- Led development of cloud-native applications
- Managed team of 5 developers
"""
    jobs = parse_work_history(text)
    assert len(jobs) == 1
    assert jobs[0]["jobTitle"]["value"] == "Senior Software Engineer"
    assert jobs[0]["company"]["value"] == "Tech Solutions Inc."
    assert jobs[0]["startDate"]["value"] == "2020"
    assert jobs[0]["endDate"]["value"] == "Present"
    assert "Led development" in jobs[0]["responsibilities"]["value"]

def test_parse_work_history_multiple_jobs():
    text = """Senior Developer
Company A | 2020 - Present
- Built APIs

Junior Developer
Company B | 2018 - 2020
- Wrote tests
"""
    jobs = parse_work_history(text)
    assert len(jobs) == 2
    assert jobs[0]["jobTitle"]["value"] == "Senior Developer"
    assert jobs[1]["jobTitle"]["value"] == "Junior Developer"

def test_parse_education_single_degree():
    text = """Master of Science in Computer Science
Stanford University | 2017
"""
    education = parse_education(text)
    assert len(education) == 1
    assert education[0]["degree"]["value"] == "Master of Science"
    assert education[0]["fieldOfStudy"]["value"] == "Computer Science"
    assert education[0]["institution"]["value"] == "Stanford University"
    assert education[0]["graduationYear"]["value"] == "2017"

def test_parse_education_multiple_degrees():
    text = """Master of Science in Computer Science
Stanford University | 2017

Bachelor of Science in Software Engineering
MIT | 2015
"""
    education = parse_education(text)
    assert len(education) == 2
    assert education[0]["degree"]["value"] == "Master of Science"
    assert education[1]["degree"]["value"] == "Bachelor of Science"
