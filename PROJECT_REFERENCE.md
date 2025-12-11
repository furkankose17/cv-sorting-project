# CV Sorting Project Reference

Quick reference for Claude and developers. Last updated: December 2024.

---

## Project Overview

**Name:** CV Sorting and Candidate Management System
**Platform:** SAP BTP (Cloud Foundry)
**Framework:** SAP CAP (Node.js) + SAP Fiori/UI5

**Purpose:** Upload CVs, extract data via OCR, manage candidates, match to jobs, analyze recruitment pipeline.

---

## Architecture

```
[Fiori Apps] --> [App Router] --> [CAP Services] --> [HANA DB]
                                       |
                                  [Joule AI]
```

**Key Directories:**
- `/app` - Fiori UI applications (3 apps)
- `/srv` - CAP services and handlers
- `/db` - Schema and seed data
- `/test` - Jest test suite

---

## Services

### 1. CandidateService (`/api/candidates`)
**File:** `srv/candidate-service.js` (645 lines)
**Handler:** `srv/handlers/candidate-service.js` (858 lines)

| Feature | Status | Notes |
|---------|--------|-------|
| CRUD operations | DONE | Draft-enabled |
| `updateStatus` action | DONE | With status transition rules |
| `addSkill` action | DONE | |
| `markAsDuplicate` action | **MISSING** | Use `mergeCandidates` instead |
| `bulkUpdateStatus` action | DONE | |
| `mergeCandidates` action | DONE | |
| `extractSkillsFromText` action | DONE | Auto-links skills |
| `searchCandidates` function | DONE | Advanced filters |
| `findSimilarCandidates` function | DONE | |
| `getCandidateTimeline` function | DONE | |
| **Interview bound actions:** | | |
| `confirm` | DONE | In handlers/ |
| `complete` | DONE | In handlers/ |
| `cancel` | DONE | In handlers/ |
| `reschedule` | DONE | In handlers/ |
| `recordNoShow` | DONE | In handlers/ |
| `submitFeedback` | DONE | In handlers/ |

---

### 2. JobService (`/api/jobs`)
**File:** `srv/job-service.js` (485 lines)

| Feature | Status |
|---------|--------|
| `publish` action | DONE |
| `close` action | DONE |
| `reopen` action | DONE |
| `findMatchingCandidates` action | DONE |
| `review` (MatchResults) action | DONE |
| `getJobStatistics` function | DONE |
| `compareCandidates` function | DONE |

---

### 3. CVProcessingService (`/api/cv`)
**File:** `srv/cv-service.js` (677 lines)
**OCR Handler:** `srv/handlers/ocr-service.js` (large)

| Feature | Status |
|---------|--------|
| `uploadDocument` action | DONE |
| `process` bound action | DONE |
| `reprocess` bound action | DONE |
| `createCandidateFromDocument` action | DONE |
| `previewExtraction` function | DONE |

**OCR Support:** PDF, DOCX, Images (via Tesseract.js)

---

### 4. MatchingService (`/api/matching`)
**File:** `srv/matching-service.js` (1082 lines)

| Feature | Status |
|---------|--------|
| `calculateMatch` action | DONE |
| `batchMatch` action | DONE |
| `rankCandidates` action | DONE |
| `sortCandidates` action | DONE |
| `filterCandidates` action | DONE |
| `getMatchDistribution` function | DONE |
| `analyzeSkillGaps` function | DONE |
| `explainMatch` function | DONE |

---

### 5. AdminService (`/api/admin`)
**File:** `srv/admin-service.js` (294 lines)

| Feature | Status |
|---------|--------|
| `importSkills` action | DONE |
| `recalculateAllMatches` action | DONE |
| `cleanupData` action | DONE |
| `healthCheck` function | DONE |

---

### 6. AnalyticsService (`/api/analytics`)
**File:** `srv/analytics-service.js` (509 lines)

| Feature | Status |
|---------|--------|
| `getPipelineOverview` function | DONE |
| `getInterviewAnalytics` function | DONE |
| `getUpcomingInterviews` function | DONE |
| `getSkillAnalytics` function | DONE |
| `getRecruiterMetrics` function | DONE |
| `getTrends` function | DONE |

---

### 7. JouleService (`/joule`)
**File:** `srv/joule-service.js` (large)

AI-powered insights and recommendations. Integrated with Analytics Dashboard.

---

## Fiori Apps

### 1. CV Upload (`app/cv-upload`)

**Routes:** upload, documents, documentDetail

**Features:**
- Drag-and-drop file upload
- Real-time OCR processing
- Document list with search/filter
- Extracted data preview
- Create candidate from CV

**Fragments:**
- DocumentInfoCard.fragment.xml
- ExtractedDataPanel.fragment.xml
- LinkedCandidateCard.fragment.xml

**Backend calls:**
- `uploadDocument`, `process`, `reprocess`, `createCandidateFromDocument`

---

### 2. Candidate Management (`app/candidate-management`)

**Type:** Fiori Elements (ListReport + ObjectPage)

**Features via ListReportExt.controller.js:**
- Status change dialog
- Add skill dialog
- Bulk status update
- Find similar candidates
- Merge duplicates
- Advanced search
- Schedule interview
- Submit feedback
- View timeline

**Fragments (9 total):**
- StatusChangeDialog, AddSkillDialog, BulkStatusDialog
- SimilarCandidatesDialog, AdvancedSearchDialog
- DeleteConfirmDialog, ScheduleInterviewDialog
- InterviewFeedbackDialog, CandidateTimeline

---

### 3. Analytics Dashboard (`app/analytics-dashboard`)

**Routes:** dashboard, skills, pipeline, trends, interviews

**Features:**
- Pipeline overview (status distribution)
- Skills analytics (gaps, trends)
- Interview analytics (ratings, upcoming)
- Time-based trends
- AI insights (Joule integration)

**Controllers:**
- Dashboard.controller.js (main)
- SkillsAnalytics.controller.js
- PipelineOverview.controller.js
- Trends.controller.js
- InterviewAnalytics.controller.js

---

### 4. Job Management (`app/jobs`)

**Type:** Fiori Elements (ListReport + ObjectPage)

**Routes:** JobPostingsList, JobPostingsObjectPage, RequiredSkillsObjectPage, MatchResultsObjectPage

**Features:**
- Create/edit job postings
- Define required skills per job
- Publish/close job workflow
- Find matching candidates
- View candidate match results
- Review and shortlist candidates

**Actions (via annotations):**
- `publish` - Publish job posting
- `close` - Close job posting
- `findMatchingCandidates` - Trigger matching algorithm
- `review` - Review match result

**Object Page Sections:**
- Basic Information (title, code, department, hiring manager)
- Location (location, country, location type)
- Employment Details (type, positions)
- Description (responsibilities, qualifications, benefits)
- Required Skills (skill table with proficiency requirements)
- Compensation & Requirements (salary range, experience)
- Timeline (status, dates)
- Candidate Matches (match results with scores)
- Matching Configuration (algorithm weights)

---

## Database Schema

**File:** `db/schema.cds`

### Core Entities
| Entity | Purpose |
|--------|---------|
| Candidates | Main candidate profiles |
| CVDocuments | Uploaded CV files + extracted data |
| WorkExperiences | Job history |
| Educations | Education records |
| CandidateSkills | Skill proficiency mapping |
| CandidateLanguages | Language proficiency |
| Certifications | Professional certs |
| CandidateNotes | Recruiter notes |
| Interviews | Interview scheduling/feedback |

### Job Entities
| Entity | Purpose |
|--------|---------|
| JobPostings | Job listings |
| JobRequiredSkills | Required skills per job |
| MatchResults | Candidate-job match scores |

### Reference Data
| Entity | Purpose |
|--------|---------|
| Skills | Master skills catalog |
| SkillCategories | Skill classification |
| CandidateStatuses | Status workflow |
| InterviewTypes | Interview categories |
| InterviewStatuses | Interview workflow |
| DegreeLevels | Education levels |

### Seed Data
Located in `db/data/*.csv` - 18 files with sample data.

---

## Known Issues & Gaps

### Service Issues

1. **Duplicate handler files**
   - `srv/candidate-service.js` AND `srv/handlers/candidate-service.js`
   - Both contain implementations; may cause confusion

2. **Handler name aliases needed**
   - `calculateMatch` aliased to `calculateMatchScore` (fixed)
   - `analyzeSkillGaps` aliased to `getSkillGapAnalysis` (fixed)

3. **Field references**
   - Schema uses `city` for candidates, not `location` (fixed in handlers)

### UI Issues

1. **Joule Chat Dialog**
   - `onAskJoule()` in Dashboard only shows MessageBox
   - No interactive chat dialog implemented

2. **Hardcoded URLs**
   - `_buildFallbackUrl()` in Dashboard has hardcoded paths
   - May fail in deployed environments

3. **Table ID Pattern**
   - Fiori Elements table ID pattern hardcoded
   - May break with UI5 updates

### Fixed Issues
- Jobs data loading in Analytics Dashboard (added `_loadJobsData()`)
- Invalid `markAsDuplicate` annotation removed from Candidate Management

---

## File Quick Reference

### Services
```
srv/services.cds          - All service definitions
srv/candidate-service.js  - Candidate CRUD
srv/job-service.js        - Job management
srv/cv-service.js         - CV upload/processing
srv/matching-service.js   - Matching algorithms
srv/admin-service.js      - Admin operations
srv/analytics-service.js  - Analytics/reporting
srv/joule-service.js      - AI integration
srv/handlers/ocr-service.js - OCR extraction
```

### Schema
```
db/schema.cds            - Entity definitions
db/common.cds            - Shared types/aspects
db/data/*.csv            - Seed data (18 files)
```

### Apps
```
app/cv-upload/           - CV upload app
app/candidate-management/ - Candidate management
app/jobs/                - Job management
app/analytics-dashboard/ - Analytics dashboard
app/router/              - App router config
```

### Config
```
package.json             - Dependencies & scripts
xs-security.json         - Authorization (6 roles)
mta.yaml                 - Deployment descriptor
jest.config.js           - Test config
```

### Tests
```
test/candidate-service.test.js
test/matching-algorithm.test.js
test/ocr-service.test.js
test/file-validator.test.js
test/integration.test.js
test/security.test.js
test/rate-limiter.test.js
```

---

## Implementation Status Summary

| Component | Status |
|-----------|--------|
| CandidateService | 100% |
| JobService | 100% |
| CVProcessingService | 100% |
| MatchingService | 100% |
| AdminService | 100% |
| AnalyticsService | 100% |
| CV Upload App | 100% |
| Candidate Management App | 100% |
| Job Management App | 100% |
| Analytics Dashboard | 97% (Joule chat incomplete) |
| Database Schema | 100% |
| Seed Data | 100% |
| Tests | 7 test files |

**Overall: ~99% Complete**

---

## Quick Commands

```bash
# Development
npm run watch           # Start with hot reload
npm test               # Run tests

# Build & Deploy
npm run build          # Build for production
npm run build:cf       # Build MTA archive
npm run deploy         # Deploy to BTP
```
