"""
Structured data extraction from OCR text.
"""
import logging
import re
from difflib import SequenceMatcher
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/ocr", tags=["OCR Extraction"])
logger = logging.getLogger(__name__)

# Section header patterns with canonical names
SECTION_PATTERNS = {
    "work_experience": ["work experience", "work history", "employment history", "experience", "employment"],
    "education": ["education", "academic background", "qualifications", "academic"],
    "skills": ["skills", "technical skills", "competencies", "technologies", "expertise"],
}


def normalize_text(text: str) -> str:
    """Normalize text for fuzzy matching - lowercase, remove extra spaces."""
    return ' '.join(text.lower().split())


def fuzzy_match(text: str, pattern: str, threshold: float = 0.8) -> bool:
    """Check if text fuzzy-matches pattern using sequence matcher."""
    text_norm = normalize_text(text)
    pattern_norm = normalize_text(pattern)

    # Direct contains check first
    if pattern_norm in text_norm:
        return True

    # Handle merged words (e.g., "workexperience")
    merged_pattern = pattern_norm.replace(' ', '')
    if merged_pattern in text_norm.replace(' ', ''):
        return True

    # Fuzzy match using SequenceMatcher
    ratio = SequenceMatcher(None, text_norm, pattern_norm).ratio()
    return ratio >= threshold


def find_section_headers(text: str) -> Dict[str, Tuple[int, int]]:
    """
    Find section headers in OCR text using fuzzy matching.

    Returns dict mapping section name to (start_pos, end_pos) of content.
    """
    lines = text.split('\n')
    sections = {}
    current_section = None
    section_start = 0

    for i, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped:
            continue

        # Check if this line is a section header
        for section_name, patterns in SECTION_PATTERNS.items():
            for pattern in patterns:
                if fuzzy_match(line_stripped, pattern, threshold=0.75):
                    # Found a new section header
                    if current_section:
                        # Calculate end position of previous section
                        end_pos = sum(len(l) + 1 for l in lines[:i])
                        sections[current_section] = (section_start, end_pos)

                    current_section = section_name
                    section_start = sum(len(l) + 1 for l in lines[:i+1])
                    break
            else:
                continue
            break

    # Close the last section
    if current_section:
        sections[current_section] = (section_start, len(text))

    return sections


def parse_work_history(text: str) -> List[Dict[str, Any]]:
    """
    Parse work history section into structured job entries.

    Each job has: jobTitle, company, startDate, endDate, responsibilities
    """
    jobs = []
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

    if not lines:
        return jobs

    # Date pattern to identify job blocks
    date_pattern = r'(\d{4})\s*[-–—]\s*(Present|Current|\d{4})'
    company_indicators = ['inc', 'ltd', 'llc', 'corp', 'gmbh', 'ag', 'co.', 'company', '|']

    current_job = None
    responsibilities = []

    for i, line in enumerate(lines):
        # Check if line contains dates (likely company/date line)
        date_match = re.search(date_pattern, line, re.IGNORECASE)

        if date_match:
            # Save previous job if exists
            if current_job:
                current_job["responsibilities"] = {
                    "value": '\n'.join(responsibilities),
                    "confidence": 80
                }
                jobs.append(current_job)
                responsibilities = []

            # Extract company name (before the date or pipe)
            company_part = re.split(r'\||\d{4}', line)[0].strip()
            company_part = re.sub(r'[-–—].*$', '', company_part).strip()

            # Previous line is likely job title
            job_title = lines[i-1] if i > 0 and not re.search(date_pattern, lines[i-1]) else ""

            # Remove job title from company if it got merged
            if job_title and job_title in company_part:
                company_part = company_part.replace(job_title, '').strip()

            current_job = {
                "jobTitle": {"value": job_title, "confidence": 90 if job_title else 50},
                "company": {"value": company_part, "confidence": 85 if company_part else 50},
                "startDate": {"value": date_match.group(1), "confidence": 95},
                "endDate": {"value": date_match.group(2), "confidence": 95},
            }

        elif current_job and (line.startswith('-') or line.startswith('•') or line.startswith('*')):
            # This is a responsibility bullet point
            responsibilities.append(line)

        elif current_job and not date_match and i > 0:
            # Could be continuation of responsibilities
            if responsibilities:
                responsibilities.append(line)

    # Don't forget the last job
    if current_job:
        current_job["responsibilities"] = {
            "value": '\n'.join(responsibilities),
            "confidence": 80
        }
        jobs.append(current_job)

    return jobs


def parse_education(text: str) -> List[Dict[str, Any]]:
    """
    Parse education section into structured entries.

    Each entry has: degree, fieldOfStudy, institution, graduationYear
    """
    education = []
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

    if not lines:
        return education

    # Degree patterns
    degree_patterns = [
        r"(Master of Science|Master of Arts|Master of Business Administration|Master's|M\.S\.|M\.A\.|MBA)",
        r"(Bachelor of Science|Bachelor of Arts|Bachelor's|B\.S\.|B\.A\.)",
        r"(Doctor of Philosophy|Ph\.D\.|PhD|Doctorate)",
        r"(Associate's|Associate of|A\.S\.|A\.A\.)",
    ]
    combined_degree_pattern = '|'.join(f'({p})' for p in degree_patterns)

    # Year pattern
    year_pattern = r'\b(19|20)\d{2}\b'

    # Institution indicators
    institution_indicators = ['university', 'college', 'institute', 'school', 'academy']

    current_edu = None

    for i, line in enumerate(lines):
        # Check if line contains a degree
        degree_match = re.search(combined_degree_pattern, line, re.IGNORECASE)

        if degree_match:
            # Save previous education if exists
            if current_edu:
                education.append(current_edu)

            degree = degree_match.group(0)

            # Extract field of study (text after degree, before institution/year)
            after_degree = line[degree_match.end():].strip()
            field_match = re.match(r'\s*(?:in|of)?\s*([^|,\d]+)', after_degree, re.IGNORECASE)
            field_of_study = field_match.group(1).strip() if field_match else ""

            current_edu = {
                "degree": {"value": degree, "confidence": 92},
                "fieldOfStudy": {"value": field_of_study, "confidence": 85 if field_of_study else 50},
                "institution": {"value": "", "confidence": 50},
                "graduationYear": {"value": "", "confidence": 50},
            }

        elif current_edu:
            # Check for institution
            is_institution = any(ind in line.lower() for ind in institution_indicators)
            year_match = re.search(year_pattern, line)

            if is_institution or year_match:
                # Extract institution (everything before year/pipe)
                institution_part = re.split(r'\||\d{4}', line)[0].strip()
                if institution_part:
                    current_edu["institution"] = {"value": institution_part, "confidence": 88}

                if year_match:
                    current_edu["graduationYear"] = {"value": year_match.group(0), "confidence": 95}

    # Don't forget the last education entry
    if current_edu:
        education.append(current_edu)

    return education


def parse_skills(text: str) -> List[Dict[str, Any]]:
    """
    Parse skills section into individual skill tags.

    Each skill has: name, confidence, matchedSkillId (null for now)
    """
    skills = []
    seen = set()  # Avoid duplicates

    # Normalize text - replace bullets and newlines with commas
    normalized = text.replace('•', ',').replace('·', ',').replace('-', ',')
    normalized = re.sub(r'\n+', ',', normalized)

    # Split by comma
    raw_skills = [s.strip() for s in normalized.split(',')]

    for skill in raw_skills:
        # Clean up the skill name
        skill = skill.strip()
        skill = re.sub(r'^[\-•·]\s*', '', skill)  # Remove leading bullets
        skill = skill.strip()

        # Skip empty or too short
        if not skill or len(skill) < 2:
            continue

        # Skip if it looks like a header or sentence
        if len(skill.split()) > 4:
            continue

        # Normalize for dedup
        skill_lower = skill.lower()
        if skill_lower in seen:
            continue
        seen.add(skill_lower)

        skills.append({
            "name": {"value": skill, "confidence": 90},
            "matchedSkillId": None  # Will be matched in a separate step
        })

    return skills


class FieldExtraction(BaseModel):
    """Single field extraction result."""
    value: Optional[str] = None
    confidence: float = Field(ge=0, le=100)
    source: Optional[str] = None


class ExtractStructuredRequest(BaseModel):
    """Request model for structured extraction."""
    text: str = Field(..., description="Raw OCR text")
    language: str = Field("en", description="Language code")
    extraction_mode: str = Field("tiered", description="Extraction mode")


class ExtractStructuredResponse(BaseModel):
    """Response model for structured extraction."""
    overall_confidence: float
    tier1: Dict[str, FieldExtraction]
    tier2: Dict[str, Any]
    tier3: Dict[str, Any]
    raw_sections: Dict[str, str]


@router.post("/extract-structured", response_model=ExtractStructuredResponse)
async def extract_structured_data(request: ExtractStructuredRequest) -> Dict[str, Any]:
    """
    Extract structured candidate data from OCR text.

    Tier 1: Essential personal info (name, email, phone, location)
    Tier 2: Professional background (work history, education, skills)
    Tier 3: Additional details (manual entry recommended)
    """
    try:
        # Extract tier 1 data
        tier1 = extract_tier1_personal_info(request.text)

        # Extract tier 2 data
        tier2 = extract_tier2_professional(request.text)

        # Tier 3 is mostly null (manual entry)
        tier3 = {
            "references": {"value": None, "confidence": 0},
            "certifications": []
        }

        # Extract raw sections
        raw_sections = extract_raw_sections(request.text)

        # Validate that at least one tier1 field was extracted
        if not tier1:
            raise HTTPException(
                status_code=422,
                detail="No personal information could be extracted from the provided text"
            )

        # Calculate overall confidence
        confidences = []
        for field_data in tier1.values():
            if isinstance(field_data, FieldExtraction):
                confidences.append(field_data.confidence)

        overall_confidence = sum(confidences) / len(confidences) if confidences else 0

        return {
            "overall_confidence": overall_confidence,
            "tier1": tier1,
            "tier2": tier2,
            "tier3": tier3,
            "raw_sections": raw_sections
        }

    except HTTPException:
        # Re-raise HTTP exceptions (validation errors, etc.)
        raise
    except Exception as e:
        logger.error(f"Structured extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def extract_tier1_personal_info(text: str) -> Dict[str, FieldExtraction]:
    """Extract tier 1 essential personal information."""
    lines = text.strip().split('\n')
    tier1 = {}

    # Extract name from first non-empty line
    for i, line in enumerate(lines[:5]):
        line = line.strip()
        if line and len(line.split()) >= 2:
            # Assume first line with 2+ words is name
            words = line.split()
            tier1["firstName"] = FieldExtraction(
                value=words[0],
                confidence=98,
                source=f"line_{i+1}"
            )
            tier1["lastName"] = FieldExtraction(
                value=words[-1],
                confidence=95,
                source=f"line_{i+1}"
            )
            break

    # Extract email
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    email_match = re.search(email_pattern, text, re.IGNORECASE)
    if email_match:
        tier1["email"] = FieldExtraction(
            value=email_match.group(),
            confidence=95,
            source="regex_match"
        )

    # Extract phone with stricter pattern to prevent false positives
    # Matches common phone formats: +1-234-567-8901, (123) 456-7890, 123.456.7890
    phone_pattern = r'(?:[\+]?[1-9]\d{0,2}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,6}'
    phone_match = re.search(phone_pattern, text)
    if phone_match:
        tier1["phone"] = FieldExtraction(
            value=phone_match.group().strip(),
            confidence=88,
            source="regex_match"
        )

    # Extract location (simple version - look for City, State/Country patterns)
    location_pattern = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2}|[A-Z][a-z]+)'
    location_match = re.search(location_pattern, text)
    if location_match:
        tier1["location"] = FieldExtraction(
            value=location_match.group(),
            confidence=85,
            source="regex_match"
        )

    return tier1


def extract_tier2_professional(text: str) -> Dict[str, Any]:
    """Extract tier 2 professional background."""
    tier2 = {
        "workHistory": [],
        "education": [],
        "skills": []
    }

    # Extract work history section
    work_pattern = r'(?:WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT\s+HISTORY)(.*?)(?=EDUCATION|SKILLS|$)'
    work_match = re.search(work_pattern, text, re.IGNORECASE | re.DOTALL)

    if work_match:
        work_text = work_match.group(1)
        # Simple extraction: look for company/role patterns
        # This is a basic implementation - real version would be more sophisticated
        lines = work_text.strip().split('\n')
        current_job = {}
        for line in lines:
            line = line.strip()
            if line and len(line) > 5:
                # Heuristic: lines with dates are likely positions
                if re.search(r'\d{4}', line):
                    if current_job:
                        tier2["workHistory"].append(current_job)
                    current_job = {"role": line, "confidence": 75}

        if current_job:
            tier2["workHistory"].append(current_job)

    return tier2


def extract_raw_sections(text: str) -> Dict[str, str]:
    """Extract raw text sections for reference."""
    sections = {}

    # Extract experience section
    exp_match = re.search(
        r'(?:WORK\s+EXPERIENCE|EXPERIENCE)(.*?)(?=EDUCATION|SKILLS|$)',
        text,
        re.IGNORECASE | re.DOTALL
    )
    if exp_match:
        sections["experience_section"] = exp_match.group(1).strip()

    # Extract education section
    edu_match = re.search(
        r'EDUCATION(.*?)(?=SKILLS|CERTIFICATIONS|$)',
        text,
        re.IGNORECASE | re.DOTALL
    )
    if edu_match:
        sections["education_section"] = edu_match.group(1).strip()

    return sections
