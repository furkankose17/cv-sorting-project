# Structured CV Extraction Design

## Overview

Overhaul the Tier 2 extraction system to provide fully structured fields for Work History, Education, and Skills - matching the quality and editability of Tier 1 personal information fields.

## Data Model

### Work History Entry
```javascript
{
  jobTitle: { value: string, confidence: number },
  company: { value: string, confidence: number },
  startDate: { value: string, confidence: number },  // "2020" or "Jan 2020"
  endDate: { value: string, confidence: number },    // "Present" or "2023"
  responsibilities: { value: string, confidence: number }  // Free text, bullets preserved
}
```

### Education Entry
```javascript
{
  degree: { value: string, confidence: number },       // "Master of Science"
  fieldOfStudy: { value: string, confidence: number }, // "Computer Science"
  institution: { value: string, confidence: number },  // "Stanford University"
  graduationYear: { value: string, confidence: number } // "2017"
}
```

### Skill Entry
```javascript
{
  name: { value: string, confidence: number },  // "Python"
  matchedSkillId: string | null  // Link to Skills master data if matched
}
```

## Extraction Logic

### Section Detection (Fuzzy Matching)
- Normalize text: lowercase, remove extra spaces, handle merged words
- Match patterns: `work`, `experience`, `employment`, `education`, `skills`, `qualification`
- Score matches using similarity threshold (Levenshtein distance ≤ 2)
- Headers detected by: ALL CAPS pattern, standalone line, or followed by structured content

### Work History Parsing
1. Split section into "job blocks" - separated by date patterns or blank lines
2. For each block:
   - **Job Title**: First line without dates, capitalized words pattern
   - **Company**: Line containing company indicators (Inc., Ltd., GmbH) or follows title
   - **Dates**: Extract year patterns `\d{4}` and keywords like "Present", "Current"
   - **Responsibilities**: Remaining lines, especially starting with `-` or `•`

### Education Parsing
1. Split into "education blocks" similarly
2. For each block:
   - **Degree**: Match patterns like "Bachelor", "Master", "PhD", "B.S.", "M.S."
   - **Field**: Text following degree, before institution
   - **Institution**: Match university keywords or known institution names
   - **Year**: Extract 4-digit year (graduation year)

### Skills Parsing
- Look for comma/bullet-separated lists after skills header
- Split into individual items, trim whitespace
- Attempt fuzzy match against Skills master data for `matchedSkillId`

### Confidence Scoring
- Pattern match quality: exact=95%, fuzzy=80%, heuristic=70%
- Position in document: expected location boosts confidence
- Field completeness: all parts found vs. partial

## UI Design

### Work History Cards
```
┌─────────────────────────────────────────────────────────┐
│ Work Experience                              [+ Add Job] │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Job 1                                    [🗑 Delete] │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Job Title:    [Senior Software Engineer    ] 95%    │ │
│ │ Company:      [Tech Solutions Inc.         ] 90%    │ │
│ │ Start Date:   [2020        ]  End: [Present] 88%    │ │
│ │ Responsibilities:                                   │ │
│ │ [- Led development of cloud-native apps    ] 85%    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Education Cards
Same pattern with: Degree, Field of Study, Institution, Graduation Year

### Skills as Tags
```
┌─────────────────────────────────────────────────────────┐
│ Skills                                     [+ Add Skill] │
├─────────────────────────────────────────────────────────┤
│ [Python ✓ 95%] [JavaScript 90%] [TypeScript 90%]        │
│ [React 85%] [Docker 88%] [AWS 85%]                      │
│                                                         │
│ ✓ = Matched to Skills database                          │
└─────────────────────────────────────────────────────────┘
```

## File Changes

### Python ML Service
- `app/api/routes/ocr_extraction.py`:
  - Rewrite `extract_tier2_professional()` with structured parsing
  - Add `parse_work_history()` - extract job title, company, dates, responsibilities
  - Add `parse_education()` - extract degree, field, institution, year
  - Add `parse_skills()` - extract individual skill tags
  - Add fuzzy header matching using `difflib.SequenceMatcher`

### CAP Service
- `srv/handlers/ocr-handler.js`:
  - Pass structured tier2 data to frontend (already stores in extractedData)

### UI5 Frontend
- `app/cv-management/webapp/view/CVReview.view.xml`:
  - Replace Tier 2 TextAreas with card-based layout
  - Add WorkHistoryCard, EducationCard components
  - Add SkillTag component with master data matching indicator

- `app/cv-management/webapp/controller/CVReview.controller.js`:
  - Add handlers: `onAddJob`, `onDeleteJob`, `onAddEducation`, `onDeleteEducation`, `onAddSkill`, `onDeleteSkill`
  - Update `onCreateCandidate` to save structured tier2 data

- `app/cv-management/webapp/i18n/i18n.properties`:
  - Add labels for new fields

## Data Flow

```
PDF → OCR Text → Structured Extraction → JSON {tier1, tier2} →
UI Cards (editable) → User Corrections → Create Candidate API → Database
```

## Error Handling

- If extraction fails for a section, show empty card with "Add manually" prompt
- Low confidence fields (<70%) highlighted in yellow/warning state
- Validation on required fields before candidate creation
- Graceful degradation: partial extraction still shown, user completes rest

## Success Criteria

1. Work History entries parsed into separate editable fields
2. Education entries parsed into separate editable fields
3. Skills extracted as individual tags with master data matching
4. Section headers detected despite OCR artifacts (merged words, typos)
5. Users can add/remove/edit all entries before creating candidate
6. Confidence scores shown for each extracted field
