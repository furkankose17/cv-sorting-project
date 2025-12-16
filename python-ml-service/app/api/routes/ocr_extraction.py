"""
Structured data extraction from OCR text.
"""
import logging
import re
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/ocr", tags=["OCR Extraction"])
logger = logging.getLogger(__name__)


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

    # Extract phone with word boundaries to prevent false positives
    phone_pattern = r'\b[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]\b'
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
