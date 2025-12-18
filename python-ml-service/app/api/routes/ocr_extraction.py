"""
Structured data extraction from OCR text.
Handles multi-column CV layouts by separating columns based on x-coordinates.
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


def separate_columns(lines: List[Dict], column_threshold: float = 500) -> Tuple[str, str]:
    """
    Separate OCR lines into left and right columns based on x-coordinate.

    Args:
        lines: List of OCR line dicts with 'text' and 'bbox' keys
        column_threshold: X-coordinate threshold to separate columns

    Returns:
        Tuple of (left_column_text, right_column_text)
    """
    if not lines:
        return "", ""

    left_lines = []
    right_lines = []

    for line in lines:
        text = line.get('text', '')
        bbox = line.get('bbox', [])

        if not bbox or not text:
            continue

        # Get x-coordinate (first point's x value)
        try:
            if isinstance(bbox[0], list):
                x_coord = bbox[0][0]  # [[x1,y1], [x2,y2], ...]
            else:
                x_coord = bbox[0]  # [x1, y1, x2, y2]
        except (IndexError, TypeError):
            x_coord = 0

        # Get y-coordinate for sorting
        try:
            if isinstance(bbox[0], list):
                y_coord = bbox[0][1]
            else:
                y_coord = bbox[1]
        except (IndexError, TypeError):
            y_coord = 0

        if x_coord < column_threshold:
            left_lines.append((y_coord, text))
        else:
            right_lines.append((y_coord, text))

    # Sort by y-coordinate and join
    left_lines.sort(key=lambda x: x[0])
    right_lines.sort(key=lambda x: x[0])

    left_text = '\n'.join(line[1] for line in left_lines)
    right_text = '\n'.join(line[1] for line in right_lines)

    return left_text, right_text


def extract_from_columns(left_text: str, right_text: str) -> Dict[str, Any]:
    """
    Extract tier2 data from column-separated text.

    Left column typically contains: Education, Skills (soft), Languages
    Right column typically contains: Experience, Technical Skills
    """
    tier2 = {
        "workHistory": [],
        "education": [],
        "skills": []
    }

    # Extract education from left column
    edu_sections = find_section_headers(left_text)
    if "education" in edu_sections:
        start, end = edu_sections["education"]
        edu_text = left_text[start:end]
        tier2["education"] = parse_education(edu_text)

    # If no education in left, try right column
    if not tier2["education"]:
        edu_sections = find_section_headers(right_text)
        if "education" in edu_sections:
            start, end = edu_sections["education"]
            edu_text = right_text[start:end]
            tier2["education"] = parse_education(edu_text)

    # Extract work experience from right column (usually main content)
    exp_sections = find_section_headers(right_text)
    if "work_experience" in exp_sections:
        start, end = exp_sections["work_experience"]
        exp_text = right_text[start:end]
        tier2["workHistory"] = parse_work_history(exp_text)

    # Extract skills - check both columns
    # Left column often has soft skills, right column has technical skills
    all_skills = []

    # Check left column for skills
    if "skills" in find_section_headers(left_text):
        start, end = find_section_headers(left_text)["skills"]
        skills_text = left_text[start:end]
        all_skills.extend(parse_skills(skills_text))

    # Check right column for technical skills
    right_sections = find_section_headers(right_text)
    if "skills" in right_sections:
        start, end = right_sections["skills"]
        skills_text = right_text[start:end]
        all_skills.extend(parse_skills(skills_text))

    # Deduplicate skills
    seen = set()
    unique_skills = []
    for skill in all_skills:
        skill_name = skill['name']['value'].lower()
        if skill_name not in seen:
            seen.add(skill_name)
            unique_skills.append(skill)

    tier2["skills"] = unique_skills

    return tier2


def normalize_text(text: str) -> str:
    """Normalize text for fuzzy matching - lowercase, remove extra spaces."""
    return ' '.join(text.lower().split())


def fuzzy_match(text: str, pattern: str, threshold: float = 0.8, is_section_header: bool = False) -> bool:
    """Check if text fuzzy-matches pattern using sequence matcher."""
    text_norm = normalize_text(text)
    pattern_norm = normalize_text(pattern)

    # For section headers, require the text to be mostly the header (not embedded in longer text)
    if is_section_header:
        # Skip if text is much longer than pattern (likely a sentence containing the word)
        if len(text_norm) > len(pattern_norm) * 3:
            return False
        # Skip if text starts with common degree prefixes
        degree_prefixes = ['bachelor', 'master', 'doctor', 'associate', 'diploma', 'certificate', 'b.s.', 'm.s.', 'ph.d.']
        if any(text_norm.startswith(prefix) for prefix in degree_prefixes):
            return False
        # Skip if pattern appears at end of longer phrase (e.g., "Language Education" is not "EDUCATION")
        # Section headers should start with or be exactly the pattern
        if pattern_norm in text_norm and not text_norm.startswith(pattern_norm[:4]):
            # Pattern is in text but text doesn't start with it - likely not a section header
            return False

    # Direct contains check first
    if pattern_norm in text_norm:
        # For section headers, the pattern should be a significant portion of the text (>60%)
        if is_section_header and len(pattern_norm) <= len(text_norm) * 0.6:
            return False
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
                if fuzzy_match(line_stripped, pattern, threshold=0.75, is_section_header=True):
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

    Handles multiple CV formats:
    - Single line: "Company | 2020 - Present"
    - Multi-line: "Title\\nCompany\\n2020 - Present"
    """
    jobs = []
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

    if not lines:
        return jobs

    # More flexible date pattern - handles various separators and formats
    date_pattern = r'(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*)?(\d{4})\s*[-–—to]+\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*)?(Present|Current|Now|\d{4})'

    # Month names for detection
    month_names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
                   'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

    # Company name indicators to help identify company lines
    company_indicators = ['inc', 'ltd', 'llc', 'corp', 'gmbh', 'ag', 'co.', 'company', 'solutions', 'technologies', 'services', 'consulting', 'software', '.com']

    i = 0
    while i < len(lines):
        line = lines[i]
        date_match = re.search(date_pattern, line, re.IGNORECASE)

        if date_match:
            job_title = ""
            company_part = ""

            # Check if dates are on same line as company (format: "Company | 2020 - Present")
            if '|' in line:
                # Split on pipe to get company
                company_part = re.split(r'\|', line)[0].strip()
                # Previous line is likely job title
                job_title = lines[i-1] if i > 0 else ""
            else:
                # Check if there's text before the date on same line
                pre_date_text = re.split(r'\d{4}', line)[0].strip()
                pre_date_text = re.sub(r'[-–—]+$', '', pre_date_text).strip()

                # Check if pre_date_text is just a month name (not company)
                is_just_month = pre_date_text.lower().strip() in month_names

                if pre_date_text and not is_just_month:
                    # Something meaningful before the date - could be company
                    company_part = pre_date_text
                    job_title = lines[i-1] if i > 0 else ""
                else:
                    # Date is on its own line (or just month + date) - look back for title and company
                    if i >= 2:
                        # Format: Title / Company / Date on separate lines
                        # Check which line looks more like a company
                        prev1 = lines[i-1]
                        prev2 = lines[i-2]

                        prev1_is_company = any(ind in prev1.lower() for ind in company_indicators)
                        prev2_is_company = any(ind in prev2.lower() for ind in company_indicators)

                        # Also check: job titles often contain "/" or common role words
                        job_title_indicators = ['/', 'engineer', 'developer', 'manager', 'specialist', 'analyst', 'consultant', 'lead', 'senior', 'junior', 'intern']
                        prev1_is_title = any(ind in prev1.lower() for ind in job_title_indicators)
                        prev2_is_title = any(ind in prev2.lower() for ind in job_title_indicators)

                        if prev1_is_company and not prev2_is_company:
                            company_part = prev1
                            job_title = prev2
                        elif prev2_is_company and not prev1_is_company:
                            company_part = prev2
                            job_title = prev1
                        elif prev2_is_title and not prev1_is_title:
                            # prev2 looks like a title, prev1 is company
                            job_title = prev2
                            company_part = prev1
                        elif prev1_is_title and not prev2_is_title:
                            # prev1 looks like a title - unusual but handle it
                            job_title = prev1
                            company_part = prev2
                        else:
                            # Default: title is 2 lines before date, company is 1 line before
                            job_title = prev2
                            company_part = prev1
                    elif i >= 1:
                        # Only one line before date
                        job_title = lines[i-1]
                        company_part = ""

            # Clean up company name
            company_part = re.sub(r'[-–—]+\s*$', '', company_part).strip()

            # Collect responsibilities (bullet points after date)
            responsibilities = []
            j = i + 1
            while j < len(lines):
                next_line = lines[j]
                # Stop at next job (another date pattern)
                if re.search(date_pattern, next_line, re.IGNORECASE):
                    break
                # Collect bullet points or continuation lines
                if next_line.startswith(('-', '•', '*')) or responsibilities:
                    responsibilities.append(next_line)
                j += 1

            current_job = {
                "jobTitle": {"value": job_title, "confidence": 90 if job_title else 50},
                "company": {"value": company_part, "confidence": 85 if company_part else 50},
                "startDate": {"value": date_match.group(1), "confidence": 95},
                "endDate": {"value": date_match.group(2), "confidence": 95},
                "responsibilities": {"value": '\n'.join(responsibilities), "confidence": 80}
            }
            jobs.append(current_job)

            i = j  # Skip to end of this job's responsibilities
        else:
            i += 1

    return jobs


def parse_education(text: str) -> List[Dict[str, Any]]:
    """
    Parse education section into structured entries.

    Each entry has: degree, fieldOfStudy, institution, graduationYear

    Handles various formats:
    - "Bachelor of Science in Computer Science"
    - "B.S. Computer Science | University | 2018"
    - Multi-line: "Bachelor of Foreign\\nLanguage Education\\n●University\\n2016-2023"
    """
    education = []
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

    if not lines:
        return education

    # Year pattern - matches 4-digit years
    year_pattern = r'\b(?:19|20)\d{2}\b'

    # Institution indicators
    institution_indicators = ['university', 'college', 'institute', 'school', 'academy', 'üniversitesi', 'universität']

    # Degree start patterns
    degree_starters = ['bachelor', 'master', 'doctor', 'ph.d', 'phd', 'associate', 'diploma', 'certificate', 'b.s.', 'b.a.', 'm.s.', 'm.a.', 'mba']

    # Process lines to build education entries
    i = 0
    while i < len(lines):
        line = lines[i]
        line_lower = line.lower()

        # Check if this line starts a degree
        is_degree_start = any(line_lower.startswith(starter) for starter in degree_starters)

        if is_degree_start:
            # Start building education entry
            degree_parts = [line]

            # Look ahead for continuation lines (part of degree name)
            j = i + 1
            while j < len(lines):
                next_line = lines[j]
                next_lower = next_line.lower()

                # Stop if we hit institution, year, or another section
                is_next_institution = any(ind in next_lower for ind in institution_indicators)
                has_year = re.search(year_pattern, next_line)
                is_bullet = next_line.startswith(('●', '•', '·', '-'))

                if is_next_institution or has_year or is_bullet:
                    break

                # This line is a continuation of the degree name
                degree_parts.append(next_line)
                j += 1

            # Combine degree parts
            full_degree = ' '.join(degree_parts)

            # Now look for institution and year
            institution = ""
            graduation_year = ""

            # Continue scanning for institution and year
            while j < len(lines):
                check_line = lines[j]
                check_lower = check_line.lower()

                # Check for institution
                if any(ind in check_lower for ind in institution_indicators):
                    # Clean up institution (remove bullet prefix)
                    institution = re.sub(r'^[●•·\-\s]+', '', check_line).strip()
                    # Remove year from institution if present
                    institution = re.sub(r'\s*\d{4}.*$', '', institution).strip()

                # Check for year
                all_years = re.findall(year_pattern, check_line)
                if all_years:
                    graduation_year = all_years[-1]  # Use last year (graduation)

                # Stop if we hit another degree or have both institution and year
                if (institution and graduation_year) or any(check_lower.startswith(s) for s in degree_starters):
                    break

                j += 1

            # Create education entry
            education.append({
                "degree": {"value": full_degree, "confidence": 92},
                "fieldOfStudy": {"value": "", "confidence": 50},
                "institution": {"value": institution, "confidence": 88 if institution else 50},
                "graduationYear": {"value": graduation_year, "confidence": 95 if graduation_year else 50},
            })

            i = j  # Skip processed lines
        else:
            # Check if this is an institution line without explicit degree
            is_institution = any(ind in line_lower for ind in institution_indicators)
            if is_institution:
                # Look for degree in previous non-empty lines
                prev_degree = ""
                for k in range(i - 1, max(i - 3, -1), -1):
                    prev_line = lines[k] if k >= 0 else ""
                    if prev_line and not any(ind in prev_line.lower() for ind in institution_indicators):
                        prev_degree = prev_line
                        break

                # Clean institution name
                institution = re.sub(r'^[●•·\-\s]+', '', line).strip()
                institution = re.sub(r'\s*\d{4}.*$', '', institution).strip()

                # Look for year in current or next line
                graduation_year = ""
                all_years = re.findall(year_pattern, line)
                if all_years:
                    graduation_year = all_years[-1]
                elif i + 1 < len(lines):
                    next_years = re.findall(year_pattern, lines[i + 1])
                    if next_years:
                        graduation_year = next_years[-1]

                education.append({
                    "degree": {"value": prev_degree, "confidence": 70 if prev_degree else 50},
                    "fieldOfStudy": {"value": "", "confidence": 50},
                    "institution": {"value": institution, "confidence": 88},
                    "graduationYear": {"value": graduation_year, "confidence": 95 if graduation_year else 50},
                })

            i += 1

    return education


def parse_skills(text: str) -> List[Dict[str, Any]]:
    """
    Parse skills section into individual skill tags.

    Each skill has: name, confidence, matchedSkillId (null for now)

    Preserves dashes in skill names (REST-API, CI-CD, etc.)
    Stops at section boundaries like LANGUAGES, REFERENCE, etc.
    """
    skills = []
    seen = set()  # Avoid duplicates

    # Section boundary markers - stop parsing when we hit these
    section_boundaries = ['languages', 'language', 'reference', 'references', 'certifications',
                          'projects', 'hobbies', 'interests', 'awards', 'publications']

    # First, truncate text at section boundaries
    lines = text.split('\n')
    truncated_lines = []
    for line in lines:
        line_lower = line.lower().strip()
        # Check if this line is a section header (all caps or matches boundary)
        if line_lower in section_boundaries or (line.isupper() and line_lower in section_boundaries):
            break
        truncated_lines.append(line)

    truncated_text = '\n'.join(truncated_lines)

    # Replace bullets with commas (but NOT dashes - they're often part of skill names)
    normalized = truncated_text.replace('•', ',').replace('·', ',')

    # Replace newlines with commas
    normalized = re.sub(r'\n+', ',', normalized)

    # Only replace dashes that are list bullets (standalone dash or dash at start followed by space)
    # This preserves dashes in skill names like REST-API, CI-CD, Node.js
    normalized = re.sub(r'(^|,)\s*-\s+', r'\1', normalized)

    # Split by comma
    raw_skills = [s.strip() for s in normalized.split(',')]

    # Non-skill patterns to filter out
    phone_pattern = re.compile(r'^\+?[\d\s\-\(\)]{7,}$')
    email_pattern = re.compile(r'@')
    date_pattern = re.compile(r'^\(?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{4}', re.IGNORECASE)
    date_range_pattern = re.compile(r'\d{4}\s*[-–—]\s*(?:\d{4}|present|current)', re.IGNORECASE)
    course_code_pattern = re.compile(r'^[A-Z]{2,4}[-\s]?\d{3,4}', re.IGNORECASE)  # e.g., CSD-101, CS101

    # Skip phrases and section headers
    skip_phrases = {'skills', 'technical skills', 'competencies', 'technologies', 'expertise',
                    'proficient in', 'soft skills', 'hard skills', 'core competencies',
                    'course', 'courses', 'training', 'certifications', 'certificate',
                    'education', 'experience', 'work history', 'contact', 'profile'}

    for skill in raw_skills:
        # Clean up the skill name
        skill = skill.strip()
        # Remove leading bullets only
        skill = re.sub(r'^[●•·]\s*', '', skill)
        # Remove leading standalone dash with space (bullet)
        skill = re.sub(r'^-\s+', '', skill)
        # Remove parentheses around the whole skill
        skill = re.sub(r'^\(([^)]+)\)$', r'\1', skill)
        skill = skill.strip()

        # Skip empty or too short
        if not skill or len(skill) < 2:
            continue

        # Skip if it looks like a header or sentence (more than 5 words)
        if len(skill.split()) > 5:
            continue

        # Skip section headers
        skill_lower = skill.lower()
        if skill_lower in skip_phrases:
            continue

        # Skip section boundary words
        if skill_lower in section_boundaries:
            continue

        # Skip phone numbers
        if phone_pattern.match(skill):
            continue

        # Skip emails
        if email_pattern.search(skill):
            continue

        # Skip date patterns (e.g., "May 2022- Oct 2022")
        if date_pattern.match(skill) or date_range_pattern.search(skill):
            continue

        # Skip course codes (e.g., "CSD-IntroductiontoJava", "CS101")
        if course_code_pattern.match(skill):
            continue

        # Skip if contains "Introduction" or looks like a course name
        if 'introduction' in skill_lower or skill_lower.startswith('intro'):
            continue

        # Skip if all uppercase and looks like a header (single word)
        if skill.isupper() and len(skill.split()) == 1 and len(skill) > 3:
            continue

        # Skip if it's just numbers or mostly numbers
        if re.match(r'^[\d\s\-\(\)]+$', skill):
            continue

        # Normalize for dedup
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
    lines: Optional[List[Dict[str, Any]]] = Field(None, description="OCR lines with bounding boxes for column-aware extraction")
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

    If 'lines' with bounding boxes are provided, uses column-aware extraction
    to handle multi-column CV layouts.
    """
    try:
        # Extract tier 1 data (always from full text)
        tier1 = extract_tier1_personal_info(request.text)

        # Extract tier 2 data - use column-aware extraction if lines are provided
        if request.lines:
            # Separate columns based on x-coordinates
            left_text, right_text = separate_columns(request.lines)
            logger.info(f"Column separation: left={len(left_text)} chars, right={len(right_text)} chars")

            # Extract from columns
            tier2 = extract_from_columns(left_text, right_text)

            # Fall back to full text if column extraction yields nothing
            if not tier2["workHistory"] and not tier2["education"] and not tier2["skills"]:
                logger.info("Column extraction yielded no results, falling back to full text")
                tier2 = extract_tier2_professional(request.text)
        else:
            # No lines provided, use traditional extraction
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

    # Extract location - only search in header area (first 15 lines)
    # and use smarter patterns to avoid matching skills/tools
    header_lines = '\n'.join(lines[:15])

    # Known technology/tool names to exclude from location matching
    tech_words = {
        'selenium', 'gauge', 'cypress', 'python', 'javascript', 'react', 'angular',
        'java', 'nodejs', 'docker', 'kubernetes', 'jenkins', 'git', 'jira', 'postman',
        'appium', 'playwright', 'testng', 'junit', 'maven', 'gradle', 'spring'
    }

    # Pattern 1: Look for explicit location labels
    labeled_location = re.search(
        r'(?:Location|Address|City|Based in)[:\s]+([A-Za-z\s,]+?)(?:\n|$)',
        header_lines,
        re.IGNORECASE
    )

    # Pattern 2: City, Country/State format (but not near skills)
    city_pattern = re.search(
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*(Turkey|Germany|USA|UK|France|Spain|Italy|Netherlands|Belgium|Switzerland|Austria|Canada|Australia|India|China|Japan|[A-Z]{2})\b',
        header_lines
    )

    location_value = None
    location_confidence = 0

    if labeled_location:
        location_value = labeled_location.group(1).strip()
        location_confidence = 90
    elif city_pattern:
        potential_location = city_pattern.group()
        # Check if it contains tech words (likely skills, not location)
        words_in_match = set(w.lower() for w in potential_location.replace(',', ' ').split())
        if not words_in_match.intersection(tech_words):
            location_value = potential_location
            location_confidence = 85

    if location_value:
        tier1["location"] = FieldExtraction(
            value=location_value,
            confidence=location_confidence,
            source="regex_match"
        )

    return tier1


def extract_tier2_professional(text: str) -> Dict[str, Any]:
    """
    Extract tier 2 professional background with fully structured fields.

    Returns:
        workHistory: List of structured job entries
        education: List of structured education entries
        skills: List of individual skill tags
    """
    tier2 = {
        "workHistory": [],
        "education": [],
        "skills": []
    }

    # Find section boundaries using fuzzy matching
    sections = find_section_headers(text)

    # Extract work history
    if "work_experience" in sections:
        start, end = sections["work_experience"]
        work_text = text[start:end]
        tier2["workHistory"] = parse_work_history(work_text)

    # Extract education
    if "education" in sections:
        start, end = sections["education"]
        edu_text = text[start:end]
        tier2["education"] = parse_education(edu_text)

    # Extract skills
    if "skills" in sections:
        start, end = sections["skills"]
        skills_text = text[start:end]
        tier2["skills"] = parse_skills(skills_text)

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
