# Fiori Apps Overview

The CV Sorting application includes four SAP Fiori UI5 applications for different user workflows.

---

## Applications Summary

| App | Type | Path | Purpose |
|-----|------|------|---------|
| CV Upload | Custom UI5 | `app/cv-upload/` | Upload and process CV documents |
| Candidate Management | Fiori Elements | `app/candidate-management/` | Manage candidate profiles |
| Jobs | Fiori Elements | `app/jobs/` | Job postings and matching |
| Analytics Dashboard | Custom UI5 | `app/analytics-dashboard/` | Metrics and insights |

---

## App Router Configuration

Located at: `app/router/xs-app.json`

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/api/(.*)$",
      "target": "/api/$1",
      "destination": "srv-api",
      "authenticationType": "xsuaa"
    },
    {
      "source": "^/cv-upload/(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    },
    {
      "source": "^/candidate-management/(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    }
  ]
}
```

---

## CV Upload App

**Type:** Custom SAP UI5 Application
**Path:** `app/cv-upload/`

### Purpose
Upload CV/resume documents, view processing status, and create candidates from extracted data.

### Features
- Drag-and-drop file upload
- Multi-format support (PDF, DOCX, PNG, JPG)
- Real-time OCR processing status
- Extracted data preview
- Create candidate from document
- Document version history

### Key Files

```
app/cv-upload/
├── webapp/
│   ├── Component.js
│   ├── manifest.json
│   ├── controller/
│   │   ├── App.controller.js
│   │   ├── Upload.controller.js
│   │   ├── Documents.controller.js
│   │   └── DocumentDetail.controller.js
│   ├── view/
│   │   ├── App.view.xml
│   │   ├── Upload.view.xml
│   │   ├── Documents.view.xml
│   │   └── DocumentDetail.view.xml
│   └── fragment/
│       ├── DocumentInfoCard.fragment.xml
│       ├── ExtractedDataPanel.fragment.xml
│       └── LinkedCandidateCard.fragment.xml
└── package.json
```

### Routes

| Route | View | Description |
|-------|------|-------------|
| `upload` | Upload | File upload interface |
| `documents` | Documents | Document list with filters |
| `documentDetail` | DocumentDetail | Single document details |

### Backend Calls

| Action | Endpoint | Purpose |
|--------|----------|---------|
| Upload | `POST /api/candidates/uploadDocument` | Upload new CV |
| Process | `POST /api/candidates/processDocument` | Trigger OCR |
| Reprocess | `POST /api/candidates/reprocessDocument` | Re-run OCR |
| Create Candidate | `POST /api/candidates/createCandidateFromDocument` | Create from CV |
| Get Status | `GET /api/candidates/getProcessingStatus` | Poll status |

---

## Candidate Management App

**Type:** SAP Fiori Elements (List Report + Object Page)
**Path:** `app/candidate-management/`

### Purpose
Full CRUD operations for candidates with advanced features like status management, skill linking, and interview scheduling.

### Features
- List view with search, filter, sort
- Detailed object page
- Draft editing support
- Status change workflow
- Skill management
- Interview scheduling
- Candidate merging
- Bulk operations

### Key Files

```
app/candidate-management/
├── webapp/
│   ├── Component.js
│   ├── manifest.json
│   ├── annotations.cds
│   ├── ext/
│   │   └── controller/
│   │       └── ListReportExt.controller.js
│   └── fragment/
│       ├── StatusChangeDialog.fragment.xml
│       ├── AddSkillDialog.fragment.xml
│       ├── BulkStatusDialog.fragment.xml
│       ├── SimilarCandidatesDialog.fragment.xml
│       ├── AdvancedSearchDialog.fragment.xml
│       ├── DeleteConfirmDialog.fragment.xml
│       ├── ScheduleInterviewDialog.fragment.xml
│       ├── InterviewFeedbackDialog.fragment.xml
│       └── CandidateTimeline.fragment.xml
└── package.json
```

### Fiori Elements Configuration

**manifest.json (key parts):**
```json
{
  "sap.ui.generic.app": {
    "pages": {
      "ListReport|Candidates": {
        "entitySet": "Candidates",
        "component": {
          "name": "sap.fe.templates.ListReport"
        }
      },
      "ObjectPage|Candidates": {
        "entitySet": "Candidates",
        "component": {
          "name": "sap.fe.templates.ObjectPage"
        }
      }
    }
  }
}
```

### Custom Actions (ListReportExt.controller.js)

| Action | Function | Description |
|--------|----------|-------------|
| Status Change | `onStatusChange` | Open status dialog |
| Add Skill | `onAddSkill` | Link skill to candidate |
| Bulk Update | `onBulkStatusUpdate` | Update multiple candidates |
| Find Similar | `onFindSimilar` | Find duplicate candidates |
| Merge | `onMergeCandidates` | Merge duplicates |
| Schedule Interview | `onScheduleInterview` | Create interview |
| Submit Feedback | `onSubmitFeedback` | Add interview feedback |
| View Timeline | `onViewTimeline` | Show activity history |

### Object Page Sections

1. **Personal Information** - Name, email, phone, location
2. **Professional Summary** - Headline, summary, experience years
3. **Work Experience** - Employment history (facet table)
4. **Education** - Education records (facet table)
5. **Skills** - Linked skills with proficiency (facet table)
6. **Languages** - Language proficiency (facet table)
7. **Certifications** - Professional certifications (facet table)
8. **Documents** - CV documents (facet table)
9. **Interviews** - Scheduled/completed interviews (facet table)
10. **Notes** - Recruiter comments (facet table)
11. **Match Results** - Job match scores (facet table)

---

## Jobs App

**Type:** SAP Fiori Elements (List Report + Object Page)
**Path:** `app/jobs/`

### Purpose
Create and manage job postings, define required skills, and find matching candidates.

### Features
- Job posting CRUD
- Required skills matrix
- Publish/close workflow
- Candidate matching
- Match results with scores
- Candidate comparison

### Key Files

```
app/jobs/
├── webapp/
│   ├── Component.js
│   ├── manifest.json
│   └── annotations.cds
└── package.json
```

### Fiori Elements Actions

| Action | Bound To | Description |
|--------|----------|-------------|
| `publish` | JobPostings | Publish draft job |
| `close` | JobPostings | Close active job |
| `reopen` | JobPostings | Reopen closed job |
| `findMatchingCandidates` | JobPostings | Trigger matching |
| `review` | MatchResults | Review candidate match |

### Object Page Sections

1. **Basic Information** - Title, code, department, hiring manager
2. **Location** - Location, country, location type (onsite/remote/hybrid)
3. **Employment Details** - Type, number of positions
4. **Description** - Responsibilities, qualifications, benefits (rich text)
5. **Required Skills** - Skills with importance weight (facet table)
6. **Compensation** - Salary range (optional display)
7. **Timeline** - Status, publish date, closing date
8. **Matching Configuration** - Weights for scoring algorithm
9. **Candidate Matches** - Match results sorted by score (facet table)

---

## Analytics Dashboard App

**Type:** Custom SAP UI5 Application
**Path:** `app/analytics-dashboard/`

### Purpose
Visual analytics for recruitment pipeline, skills trends, interview performance, and AI insights.

### Features
- Pipeline overview (status distribution)
- Skills analytics (gaps, trends)
- Interview analytics (ratings, completion)
- Time-based trends
- Recruiter performance metrics
- Joule AI insights

### Key Files

```
app/analytics-dashboard/
├── webapp/
│   ├── Component.js
│   ├── manifest.json
│   ├── controller/
│   │   ├── App.controller.js
│   │   ├── Dashboard.controller.js
│   │   ├── SkillsAnalytics.controller.js
│   │   ├── PipelineOverview.controller.js
│   │   ├── Trends.controller.js
│   │   └── InterviewAnalytics.controller.js
│   └── view/
│       ├── App.view.xml
│       ├── Dashboard.view.xml
│       ├── SkillsAnalytics.view.xml
│       ├── PipelineOverview.view.xml
│       ├── Trends.view.xml
│       └── InterviewAnalytics.view.xml
└── package.json
```

### Routes

| Route | View | Description |
|-------|------|-------------|
| `dashboard` | Dashboard | Main dashboard overview |
| `skills` | SkillsAnalytics | Skills supply/demand |
| `pipeline` | PipelineOverview | Candidate funnel |
| `trends` | Trends | Time-series metrics |
| `interviews` | InterviewAnalytics | Interview performance |

### Backend Calls

| Function | Endpoint | Returns |
|----------|----------|---------|
| Pipeline | `GET /api/jobs/getPipelineOverview` | Status counts, sources |
| Skills | `GET /api/jobs/getSkillAnalytics` | Top skills, gaps |
| Interviews | `GET /api/jobs/getInterviewAnalytics` | Ratings, completion |
| Upcoming | `GET /api/jobs/getUpcomingInterviews` | Next N interviews |
| Trends | `GET /api/jobs/getTrends` | Time-series data |
| Recruiter | `GET /api/jobs/getRecruiterMetrics` | Performance KPIs |

### Dashboard Widgets

1. **Pipeline Funnel** - Candidates by status
2. **Source Distribution** - Candidates by source
3. **Top Skills** - Most common skills
4. **Skill Gaps** - Demanded but missing skills
5. **Interview Calendar** - Upcoming interviews
6. **Average Ratings** - Interview rating averages
7. **Time to Hire** - Average hiring duration
8. **Active Jobs** - Open positions count

---

## Common UI Patterns

### OData Model Binding

```javascript
// In controller
const oModel = this.getView().getModel();
const oContext = oModel.bindContext("/Candidates('" + sId + "')");
oContext.requestObject().then(oData => {
  // Use data
});
```

### Action Calls

```javascript
// Bound action
const oContext = this.getView().getBindingContext();
const oOperation = oContext.getModel().bindContext(
  "CandidateService.updateStatus(...)",
  oContext
);
oOperation.setParameter("newStatus", "interviewing");
oOperation.execute().then(() => {
  MessageToast.show("Status updated");
});
```

### Fragment Loading

```javascript
// Load dialog fragment
if (!this._oStatusDialog) {
  this._oStatusDialog = await Fragment.load({
    id: this.getView().getId(),
    name: "cv.sorting.candidatemanagement.fragment.StatusChangeDialog",
    controller: this
  });
  this.getView().addDependent(this._oStatusDialog);
}
this._oStatusDialog.open();
```

---

## Build and Deployment

### Build Commands

```bash
# Build single app
cd app/cv-upload
npm run build

# Build all apps (via MTA)
mbt build
```

### MTA Configuration

```yaml
modules:
  - name: cv-sorting-cv-upload
    type: html5
    path: app/cv-upload
    build-parameters:
      build-result: dist
      builder: custom
      commands:
        - npm ci
        - npm run build
      supported-platforms: []
```

### HTML5 Repository Deployment

Apps are deployed to HTML5 Application Repository and served via App Router.

```yaml
modules:
  - name: cv-sorting-html5-app-deployer
    type: com.sap.application.content
    requires:
      - name: cv-sorting-html5-repo-host
        parameters:
          content-target: true
    build-parameters:
      requires:
        - name: cv-sorting-cv-upload
          artifacts:
            - dist/*
          target-path: resources/cv-upload
```
