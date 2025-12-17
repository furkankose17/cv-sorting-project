# Structured CV Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul Tier 2 extraction to provide fully structured, editable fields for Work History, Education, and Skills - matching Tier 1 quality.

**Architecture:** Python ML service parses OCR text into structured JSON with confidence scores. UI5 frontend renders card-based editors with add/remove/edit capabilities. Each field is individually editable with confidence indicators.

**Tech Stack:** Python (FastAPI, difflib for fuzzy matching), SAP UI5 (SimpleForm, VBox, HBox, Panel), CAP (Node.js handlers)

---

## Task 1: Add Fuzzy Section Header Detection

**Files:**
- Modify: `python-ml-service/app/api/routes/ocr_extraction.py`
- Test: `python-ml-service/tests/test_extraction.py`

**Step 1: Write the failing test**

Create test file if not exists and add:

```python
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
```

**Step 2: Run test to verify it fails**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py -v
```
Expected: FAIL with "cannot import name 'find_section_headers'"

**Step 3: Write minimal implementation**

Add to `python-ml-service/app/api/routes/ocr_extraction.py`:

```python
from difflib import SequenceMatcher
from typing import Dict, Tuple

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
```

**Step 4: Run test to verify it passes**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_find_section_headers_normal tests/test_extraction.py::test_find_section_headers_merged_ocr tests/test_extraction.py::test_find_section_headers_lowercase -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add python-ml-service/app/api/routes/ocr_extraction.py python-ml-service/tests/test_extraction.py
git commit -m "feat(extraction): add fuzzy section header detection"
```

---

## Task 2: Parse Work History into Structured Fields

**Files:**
- Modify: `python-ml-service/app/api/routes/ocr_extraction.py`
- Test: `python-ml-service/tests/test_extraction.py`

**Step 1: Write the failing test**

Add to `python-ml-service/tests/test_extraction.py`:

```python
from app.api.routes.ocr_extraction import parse_work_history

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
```

**Step 2: Run test to verify it fails**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_parse_work_history_single_job tests/test_extraction.py::test_parse_work_history_multiple_jobs -v
```
Expected: FAIL with "cannot import name 'parse_work_history'"

**Step 3: Write minimal implementation**

Add to `python-ml-service/app/api/routes/ocr_extraction.py`:

```python
import re

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
```

**Step 4: Run test to verify it passes**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_parse_work_history_single_job tests/test_extraction.py::test_parse_work_history_multiple_jobs -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add python-ml-service/app/api/routes/ocr_extraction.py python-ml-service/tests/test_extraction.py
git commit -m "feat(extraction): add structured work history parsing"
```

---

## Task 3: Parse Education into Structured Fields

**Files:**
- Modify: `python-ml-service/app/api/routes/ocr_extraction.py`
- Test: `python-ml-service/tests/test_extraction.py`

**Step 1: Write the failing test**

Add to `python-ml-service/tests/test_extraction.py`:

```python
from app.api.routes.ocr_extraction import parse_education

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
```

**Step 2: Run test to verify it fails**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_parse_education_single_degree tests/test_extraction.py::test_parse_education_multiple_degrees -v
```
Expected: FAIL with "cannot import name 'parse_education'"

**Step 3: Write minimal implementation**

Add to `python-ml-service/app/api/routes/ocr_extraction.py`:

```python
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
```

**Step 4: Run test to verify it passes**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_parse_education_single_degree tests/test_extraction.py::test_parse_education_multiple_degrees -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add python-ml-service/app/api/routes/ocr_extraction.py python-ml-service/tests/test_extraction.py
git commit -m "feat(extraction): add structured education parsing"
```

---

## Task 4: Parse Skills into Individual Tags

**Files:**
- Modify: `python-ml-service/app/api/routes/ocr_extraction.py`
- Test: `python-ml-service/tests/test_extraction.py`

**Step 1: Write the failing test**

Add to `python-ml-service/tests/test_extraction.py`:

```python
from app.api.routes.ocr_extraction import parse_skills

def test_parse_skills_comma_separated():
    text = "Python, JavaScript, TypeScript, Java, Go"
    skills = parse_skills(text)
    assert len(skills) == 5
    assert skills[0]["name"]["value"] == "Python"
    assert skills[1]["name"]["value"] == "JavaScript"

def test_parse_skills_multiline():
    text = """Python, JavaScript, TypeScript
React, Node.js, Docker
AWS, PostgreSQL
"""
    skills = parse_skills(text)
    assert len(skills) >= 8
    assert any(s["name"]["value"] == "Docker" for s in skills)

def test_parse_skills_bullet_points():
    text = """• Python
• JavaScript
• React
"""
    skills = parse_skills(text)
    assert len(skills) == 3
```

**Step 2: Run test to verify it fails**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_parse_skills_comma_separated tests/test_extraction.py::test_parse_skills_multiline tests/test_extraction.py::test_parse_skills_bullet_points -v
```
Expected: FAIL with "cannot import name 'parse_skills'"

**Step 3: Write minimal implementation**

Add to `python-ml-service/app/api/routes/ocr_extraction.py`:

```python
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
```

**Step 4: Run test to verify it passes**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_parse_skills_comma_separated tests/test_extraction.py::test_parse_skills_multiline tests/test_extraction.py::test_parse_skills_bullet_points -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add python-ml-service/app/api/routes/ocr_extraction.py python-ml-service/tests/test_extraction.py
git commit -m "feat(extraction): add skills tag parsing"
```

---

## Task 5: Update extract_tier2_professional to Use New Parsers

**Files:**
- Modify: `python-ml-service/app/api/routes/ocr_extraction.py`
- Test: `python-ml-service/tests/test_extraction.py`

**Step 1: Write the failing test**

Add to `python-ml-service/tests/test_extraction.py`:

```python
def test_extract_tier2_professional_structured():
    text = """John Smith
Email: john@email.com

WORK EXPERIENCE

Senior Software Engineer
Tech Solutions Inc. | 2020 - Present
- Led development of cloud-native applications

EDUCATION

Master of Science in Computer Science
Stanford University | 2017

SKILLS

Python, JavaScript, React, Docker
"""
    tier2 = extract_tier2_professional(text)

    # Work history should be structured
    assert len(tier2["workHistory"]) >= 1
    assert "jobTitle" in tier2["workHistory"][0]
    assert tier2["workHistory"][0]["jobTitle"]["value"] == "Senior Software Engineer"

    # Education should be structured
    assert len(tier2["education"]) >= 1
    assert "degree" in tier2["education"][0]

    # Skills should be individual tags
    assert len(tier2["skills"]) >= 4
    assert "name" in tier2["skills"][0]
```

**Step 2: Run test to verify it fails**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_extract_tier2_professional_structured -v
```
Expected: FAIL (current implementation doesn't return structured data)

**Step 3: Update implementation**

Replace `extract_tier2_professional` in `python-ml-service/app/api/routes/ocr_extraction.py`:

```python
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
```

**Step 4: Run test to verify it passes**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py::test_extract_tier2_professional_structured -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add python-ml-service/app/api/routes/ocr_extraction.py python-ml-service/tests/test_extraction.py
git commit -m "feat(extraction): integrate structured parsers into tier2 extraction"
```

---

## Task 6: Update UI - Add Work History Card Fragment

**Files:**
- Create: `app/cv-management/webapp/fragment/WorkHistoryCard.fragment.xml`
- Modify: `app/cv-management/webapp/i18n/i18n.properties`

**Step 1: Create the fragment**

```xml
<!-- app/cv-management/webapp/fragment/WorkHistoryCard.fragment.xml -->
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:f="sap.ui.layout.form">

    <VBox class="sapUiSmallMargin workHistoryCard">
        <HBox justifyContent="SpaceBetween" alignItems="Center" class="sapUiTinyMarginBottom">
            <Title text="{i18n>job} {= ${path: 'index'} + 1}" level="H5" />
            <Button
                icon="sap-icon://delete"
                type="Transparent"
                press=".onDeleteJob"
                tooltip="{i18n>deleteJob}" />
        </HBox>

        <f:SimpleForm
            editable="true"
            layout="ResponsiveGridLayout"
            labelSpanXL="4" labelSpanL="4" labelSpanM="4"
            emptySpanXL="0" emptySpanL="0" emptySpanM="0">
            <f:content>
                <Label text="{i18n>jobTitle}" required="true" />
                <HBox alignItems="Center">
                    <Input
                        value="{jobTitle/value}"
                        width="75%"
                        placeholder="{i18n>jobTitlePlaceholder}" />
                    <ObjectStatus
                        text="{jobTitle/confidence}%"
                        state="{= ${jobTitle/confidence} >= 85 ? 'Success' : 'Warning'}"
                        class="sapUiTinyMarginBegin" />
                </HBox>

                <Label text="{i18n>company}" required="true" />
                <HBox alignItems="Center">
                    <Input
                        value="{company/value}"
                        width="75%"
                        placeholder="{i18n>companyPlaceholder}" />
                    <ObjectStatus
                        text="{company/confidence}%"
                        state="{= ${company/confidence} >= 85 ? 'Success' : 'Warning'}"
                        class="sapUiTinyMarginBegin" />
                </HBox>

                <Label text="{i18n>dateRange}" />
                <HBox alignItems="Center">
                    <Input
                        value="{startDate/value}"
                        width="30%"
                        placeholder="{i18n>startDate}" />
                    <Text text=" - " class="sapUiTinyMarginBeginEnd" />
                    <Input
                        value="{endDate/value}"
                        width="30%"
                        placeholder="{i18n>endDate}" />
                    <ObjectStatus
                        text="{startDate/confidence}%"
                        state="Success"
                        class="sapUiTinyMarginBegin" />
                </HBox>

                <Label text="{i18n>responsibilities}" />
                <HBox alignItems="Center">
                    <TextArea
                        value="{responsibilities/value}"
                        width="75%"
                        rows="3"
                        growing="true"
                        growingMaxLines="6"
                        placeholder="{i18n>responsibilitiesPlaceholder}" />
                    <ObjectStatus
                        text="{responsibilities/confidence}%"
                        state="{= ${responsibilities/confidence} >= 80 ? 'Success' : 'Warning'}"
                        class="sapUiTinyMarginBegin" />
                </HBox>
            </f:content>
        </f:SimpleForm>
    </VBox>
</core:FragmentDefinition>
```

**Step 2: Add i18n entries**

Add to `app/cv-management/webapp/i18n/i18n.properties`:

```properties
# Work History
job=Job
jobTitle=Job Title
jobTitlePlaceholder=e.g., Senior Software Engineer
company=Company
companyPlaceholder=e.g., Tech Solutions Inc.
dateRange=Date Range
startDate=Start
endDate=End
responsibilities=Responsibilities
responsibilitiesPlaceholder=Key responsibilities and achievements
addJob=Add Job
deleteJob=Delete Job
```

**Step 3: Commit**

```bash
git add app/cv-management/webapp/fragment/WorkHistoryCard.fragment.xml app/cv-management/webapp/i18n/i18n.properties
git commit -m "feat(ui): add work history card fragment"
```

---

## Task 7: Update UI - Add Education Card Fragment

**Files:**
- Create: `app/cv-management/webapp/fragment/EducationCard.fragment.xml`
- Modify: `app/cv-management/webapp/i18n/i18n.properties`

**Step 1: Create the fragment**

```xml
<!-- app/cv-management/webapp/fragment/EducationCard.fragment.xml -->
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:f="sap.ui.layout.form">

    <VBox class="sapUiSmallMargin educationCard">
        <HBox justifyContent="SpaceBetween" alignItems="Center" class="sapUiTinyMarginBottom">
            <Title text="{i18n>education} {= ${path: 'index'} + 1}" level="H5" />
            <Button
                icon="sap-icon://delete"
                type="Transparent"
                press=".onDeleteEducation"
                tooltip="{i18n>deleteEducation}" />
        </HBox>

        <f:SimpleForm
            editable="true"
            layout="ResponsiveGridLayout"
            labelSpanXL="4" labelSpanL="4" labelSpanM="4"
            emptySpanXL="0" emptySpanL="0" emptySpanM="0">
            <f:content>
                <Label text="{i18n>degree}" required="true" />
                <HBox alignItems="Center">
                    <Input
                        value="{degree/value}"
                        width="75%"
                        placeholder="{i18n>degreePlaceholder}" />
                    <ObjectStatus
                        text="{degree/confidence}%"
                        state="{= ${degree/confidence} >= 85 ? 'Success' : 'Warning'}"
                        class="sapUiTinyMarginBegin" />
                </HBox>

                <Label text="{i18n>fieldOfStudy}" />
                <HBox alignItems="Center">
                    <Input
                        value="{fieldOfStudy/value}"
                        width="75%"
                        placeholder="{i18n>fieldOfStudyPlaceholder}" />
                    <ObjectStatus
                        text="{fieldOfStudy/confidence}%"
                        state="{= ${fieldOfStudy/confidence} >= 80 ? 'Success' : 'Warning'}"
                        class="sapUiTinyMarginBegin" />
                </HBox>

                <Label text="{i18n>institution}" required="true" />
                <HBox alignItems="Center">
                    <Input
                        value="{institution/value}"
                        width="75%"
                        placeholder="{i18n>institutionPlaceholder}" />
                    <ObjectStatus
                        text="{institution/confidence}%"
                        state="{= ${institution/confidence} >= 85 ? 'Success' : 'Warning'}"
                        class="sapUiTinyMarginBegin" />
                </HBox>

                <Label text="{i18n>graduationYear}" />
                <HBox alignItems="Center">
                    <Input
                        value="{graduationYear/value}"
                        width="30%"
                        placeholder="YYYY" />
                    <ObjectStatus
                        text="{graduationYear/confidence}%"
                        state="Success"
                        class="sapUiTinyMarginBegin" />
                </HBox>
            </f:content>
        </f:SimpleForm>
    </VBox>
</core:FragmentDefinition>
```

**Step 2: Add i18n entries**

Add to `app/cv-management/webapp/i18n/i18n.properties`:

```properties
# Education
degree=Degree
degreePlaceholder=e.g., Master of Science
fieldOfStudy=Field of Study
fieldOfStudyPlaceholder=e.g., Computer Science
institution=Institution
institutionPlaceholder=e.g., Stanford University
graduationYear=Graduation Year
addEducation=Add Education
deleteEducation=Delete Education
```

**Step 3: Commit**

```bash
git add app/cv-management/webapp/fragment/EducationCard.fragment.xml app/cv-management/webapp/i18n/i18n.properties
git commit -m "feat(ui): add education card fragment"
```

---

## Task 8: Update CVReview.view.xml with Card-Based Tier 2

**Files:**
- Modify: `app/cv-management/webapp/view/CVReview.view.xml`

**Step 1: Replace Tier 2 section**

Find the Professional Background Panel (around line 182-214) and replace with:

```xml
<!-- Tier 2: Professional Background -->
<Panel
    headerText="{i18n>professionalBackground}"
    expanded="true"
    expandable="true"
    class="sapUiSmallMarginTop">

    <!-- Work History Section -->
    <VBox class="sapUiSmallMargin">
        <HBox justifyContent="SpaceBetween" alignItems="Center">
            <Title text="{i18n>workHistory}" level="H4" />
            <Button
                text="{i18n>addJob}"
                icon="sap-icon://add"
                type="Transparent"
                press=".onAddJob" />
        </HBox>

        <VBox
            items="{review>/tier2/workHistory}"
            visible="{= ${review>/tier2/workHistory}.length > 0}">
            <core:Fragment fragmentName="cvmanagement.fragment.WorkHistoryCard" type="XML" />
        </VBox>

        <MessageStrip
            text="{i18n>noWorkHistoryExtracted}"
            type="Information"
            showIcon="true"
            visible="{= !${review>/tier2/workHistory} || ${review>/tier2/workHistory}.length === 0}"
            class="sapUiSmallMarginTop" />
    </VBox>

    <!-- Education Section -->
    <VBox class="sapUiSmallMargin sapUiMediumMarginTop">
        <HBox justifyContent="SpaceBetween" alignItems="Center">
            <Title text="{i18n>education}" level="H4" />
            <Button
                text="{i18n>addEducation}"
                icon="sap-icon://add"
                type="Transparent"
                press=".onAddEducation" />
        </HBox>

        <VBox
            items="{review>/tier2/education}"
            visible="{= ${review>/tier2/education}.length > 0}">
            <core:Fragment fragmentName="cvmanagement.fragment.EducationCard" type="XML" />
        </VBox>

        <MessageStrip
            text="{i18n>noEducationExtracted}"
            type="Information"
            showIcon="true"
            visible="{= !${review>/tier2/education} || ${review>/tier2/education}.length === 0}"
            class="sapUiSmallMarginTop" />
    </VBox>

    <!-- Skills Section -->
    <VBox class="sapUiSmallMargin sapUiMediumMarginTop">
        <HBox justifyContent="SpaceBetween" alignItems="Center">
            <Title text="{i18n>skills}" level="H4" />
            <Button
                text="{i18n>addSkill}"
                icon="sap-icon://add"
                type="Transparent"
                press=".onAddSkill" />
        </HBox>

        <HBox wrap="Wrap" class="sapUiTinyMarginTop">
            <items>
                <ObjectStatus
                    text="{name/value}"
                    state="{= ${name/confidence} >= 85 ? 'Success' : 'Information'}"
                    icon="{= ${matchedSkillId} ? 'sap-icon://accept' : ''}"
                    inverted="true"
                    active="true"
                    press=".onSkillPress"
                    class="sapUiTinyMarginEnd sapUiTinyMarginBottom skillTag" />
            </items>
        </HBox>

        <MessageStrip
            text="{i18n>noSkillsExtracted}"
            type="Information"
            showIcon="true"
            visible="{= !${review>/tier2/skills} || ${review>/tier2/skills}.length === 0}"
            class="sapUiSmallMarginTop" />
    </VBox>
</Panel>
```

**Step 2: Add i18n entries**

Add to `app/cv-management/webapp/i18n/i18n.properties`:

```properties
# Empty state messages
noWorkHistoryExtracted=No work history detected. Click 'Add Job' to enter manually.
noEducationExtracted=No education detected. Click 'Add Education' to enter manually.
noSkillsExtracted=No skills detected. Click 'Add Skill' to enter manually.
addSkill=Add Skill
```

**Step 3: Commit**

```bash
git add app/cv-management/webapp/view/CVReview.view.xml app/cv-management/webapp/i18n/i18n.properties
git commit -m "feat(ui): replace tier2 textareas with card-based layout"
```

---

## Task 9: Add Controller Handlers for Add/Delete

**Files:**
- Modify: `app/cv-management/webapp/controller/CVReview.controller.js`

**Step 1: Add handler methods**

Add these methods to the controller:

```javascript
/**
 * Add a new empty job entry
 */
onAddJob: function () {
    const oModel = this.getView().getModel("review");
    const aWorkHistory = oModel.getProperty("/tier2/workHistory") || [];

    aWorkHistory.push({
        jobTitle: { value: "", confidence: 100 },
        company: { value: "", confidence: 100 },
        startDate: { value: "", confidence: 100 },
        endDate: { value: "", confidence: 100 },
        responsibilities: { value: "", confidence: 100 }
    });

    oModel.setProperty("/tier2/workHistory", aWorkHistory);
},

/**
 * Delete a job entry
 */
onDeleteJob: function (oEvent) {
    const oSource = oEvent.getSource();
    const oContext = oSource.getBindingContext("review");
    const sPath = oContext.getPath();
    const iIndex = parseInt(sPath.split("/").pop(), 10);

    const oModel = this.getView().getModel("review");
    const aWorkHistory = oModel.getProperty("/tier2/workHistory");
    aWorkHistory.splice(iIndex, 1);
    oModel.setProperty("/tier2/workHistory", aWorkHistory);
},

/**
 * Add a new empty education entry
 */
onAddEducation: function () {
    const oModel = this.getView().getModel("review");
    const aEducation = oModel.getProperty("/tier2/education") || [];

    aEducation.push({
        degree: { value: "", confidence: 100 },
        fieldOfStudy: { value: "", confidence: 100 },
        institution: { value: "", confidence: 100 },
        graduationYear: { value: "", confidence: 100 }
    });

    oModel.setProperty("/tier2/education", aEducation);
},

/**
 * Delete an education entry
 */
onDeleteEducation: function (oEvent) {
    const oSource = oEvent.getSource();
    const oContext = oSource.getBindingContext("review");
    const sPath = oContext.getPath();
    const iIndex = parseInt(sPath.split("/").pop(), 10);

    const oModel = this.getView().getModel("review");
    const aEducation = oModel.getProperty("/tier2/education");
    aEducation.splice(iIndex, 1);
    oModel.setProperty("/tier2/education", aEducation);
},

/**
 * Add a new skill
 */
onAddSkill: function () {
    const that = this;

    // Simple input dialog for skill name
    if (!this._oAddSkillDialog) {
        this._oAddSkillDialog = new sap.m.Dialog({
            title: this._getI18nText("addSkill"),
            content: [
                new sap.m.Input({
                    id: "newSkillInput",
                    placeholder: "Enter skill name",
                    width: "100%"
                })
            ],
            beginButton: new sap.m.Button({
                text: this._getI18nText("add"),
                type: "Emphasized",
                press: function () {
                    const sSkillName = sap.ui.getCore().byId("newSkillInput").getValue().trim();
                    if (sSkillName) {
                        const oModel = that.getView().getModel("review");
                        const aSkills = oModel.getProperty("/tier2/skills") || [];
                        aSkills.push({
                            name: { value: sSkillName, confidence: 100 },
                            matchedSkillId: null
                        });
                        oModel.setProperty("/tier2/skills", aSkills);
                    }
                    sap.ui.getCore().byId("newSkillInput").setValue("");
                    that._oAddSkillDialog.close();
                }
            }),
            endButton: new sap.m.Button({
                text: this._getI18nText("cancel"),
                press: function () {
                    sap.ui.getCore().byId("newSkillInput").setValue("");
                    that._oAddSkillDialog.close();
                }
            })
        });
        this.getView().addDependent(this._oAddSkillDialog);
    }

    this._oAddSkillDialog.open();
},

/**
 * Handle skill tag press - show delete option
 */
onSkillPress: function (oEvent) {
    const oSource = oEvent.getSource();
    const oContext = oSource.getBindingContext("review");
    const sPath = oContext.getPath();
    const iIndex = parseInt(sPath.split("/").pop(), 10);
    const sSkillName = oContext.getProperty("name/value");

    const that = this;

    sap.m.MessageBox.confirm(
        `Delete skill "${sSkillName}"?`,
        {
            title: this._getI18nText("deleteSkill") || "Delete Skill",
            onClose: function (oAction) {
                if (oAction === sap.m.MessageBox.Action.OK) {
                    const oModel = that.getView().getModel("review");
                    const aSkills = oModel.getProperty("/tier2/skills");
                    aSkills.splice(iIndex, 1);
                    oModel.setProperty("/tier2/skills", aSkills);
                }
            }
        }
    );
},

/**
 * Helper to get i18n text
 */
_getI18nText: function (sKey) {
    return this.getView().getModel("i18n").getResourceBundle().getText(sKey);
},
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/controller/CVReview.controller.js
git commit -m "feat(ui): add handlers for add/delete work history, education, skills"
```

---

## Task 10: Update Controller Data Loading for Tier 2

**Files:**
- Modify: `app/cv-management/webapp/controller/CVReview.controller.js`

**Step 1: Update _loadDocumentData to handle structured tier2**

Find the section where tier2/rawSections is set and update to:

```javascript
// Extract tier2 structured data
const oTier2 = oExtractedData.tier2 || {
    workHistory: [],
    education: [],
    skills: []
};

// Ensure tier2 has proper structure
if (!oTier2.workHistory) oTier2.workHistory = [];
if (!oTier2.education) oTier2.education = [];
if (!oTier2.skills) oTier2.skills = [];

// Set to model
oReviewModel.setProperty("/tier2", oTier2);
```

**Step 2: Update onCreateCandidate to include tier2 structured data**

Update the candidate creation to include tier2:

```javascript
// In onCreateCandidate, update the editedData to include tier2
const editedData = {
    tier1: {
        firstName: { value: oReviewModel.getProperty("/tier1/firstName/value") },
        lastName: { value: oReviewModel.getProperty("/tier1/lastName/value") },
        email: { value: oReviewModel.getProperty("/tier1/email/value") },
        phone: { value: oReviewModel.getProperty("/tier1/phone/value") },
        location: { value: oReviewModel.getProperty("/tier1/location/value") }
    },
    tier2: oReviewModel.getProperty("/tier2")
};
```

**Step 3: Commit**

```bash
git add app/cv-management/webapp/controller/CVReview.controller.js
git commit -m "feat(ui): update data loading and saving for structured tier2"
```

---

## Task 11: Run Full Integration Test

**Step 1: Start services**

```bash
# Terminal 1: Start ML service
cd python-ml-service && source venv/bin/activate && python -m uvicorn app.main:app --reload --port 8000

# Terminal 2: Start CAP service
npm start
```

**Step 2: Run Python tests**

```bash
cd python-ml-service && python -m pytest tests/test_extraction.py -v
```
Expected: All tests PASS

**Step 3: Test in browser**

1. Navigate to `http://localhost:4004/cv-management/webapp/index.html`
2. Upload a test PDF
3. Verify work history shows as editable cards with separate fields
4. Verify education shows as editable cards
5. Verify skills show as tags
6. Test add/delete functionality

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete structured CV extraction with card-based UI"
```

---

## Summary

This plan implements:
1. **Fuzzy section header detection** - handles OCR artifacts like merged words
2. **Structured work history parsing** - job title, company, dates, responsibilities
3. **Structured education parsing** - degree, field, institution, year
4. **Skills tag extraction** - individual tags with confidence
5. **Card-based UI** - editable cards with add/remove for all tier2 data
6. **Controller handlers** - full CRUD for work history, education, skills

Total: 11 tasks, ~45 minutes estimated implementation time.
