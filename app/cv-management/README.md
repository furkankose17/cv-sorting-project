# CV Management System

A unified SAP UI5 application for managing candidates, job postings, and AI-powered semantic matching.

## Overview

The CV Management System is a production-ready application that combines candidate management, job posting management, and AI-powered semantic matching in a single, intuitive interface. Built with SAP UI5 1.143.2 and integrated with SAP CAP backend services and Python ML services.

## Features

### Candidate Management
- **Candidate List & Search**: Browse, filter, and search candidates with advanced search capabilities
- **Candidate Details**: Comprehensive view with skills, experience, education, and interview history
- **Status Management**: Update candidate status with bulk operations support
- **Skills Management**: Add, remove, and track candidate skills with proficiency levels
- **Interview Scheduling**: Schedule and track interviews with feedback collection
- **Timeline**: Visual activity history for each candidate
- **Find Similar**: AI-powered similar candidate discovery

### Job Posting Management
- **Job Listings**: Manage all job postings with status filtering
- **Job Details**: Complete job information with required skills and requirements
- **Scoring Criteria**: Configure weighted scoring across 5 criteria types:
  - Skills Criteria
  - Experience Criteria
  - Languages Criteria
  - Education Criteria
  - Certifications Criteria
- **Template System**: Save and load scoring criteria templates
- **Job Publishing**: Publish jobs with automatic AI embedding generation

### AI-Powered Matching
- **Semantic Matching**: Find best candidate matches using AI embeddings
- **Match Scoring**: Combined scoring using criteria weights and semantic similarity
- **Match Details**: Detailed score breakdown with skill-by-skill comparison
- **Match Review**: Review and approve/reject matches with notes
- **Match Explanation**: AI-generated explanations for match reasoning
- **Progress Tracking**: Real-time progress visualization during matching

### Dashboard & Analytics
- **Quick Statistics**: Real-time KPIs (total candidates, active jobs, interviews, top match score)
- **Recent Activity**: Timeline of system activities
- **Quick Actions**: Fast access to common operations
- **Analytics Integration**: Cross-navigation to full analytics dashboard

### Advanced Features
- **Global Search**: Search across candidates and jobs with instant results
- **Keyboard Shortcuts**:
  - `Ctrl+F`: Focus search
  - `Ctrl+R`: Refresh
  - `Ctrl+N`: Add new (candidate/job based on active tab)
  - `ESC`: Close dialogs
- **Responsive Design**: Optimized for desktop, tablet, and phone
- **Internationalization**: Complete i18n support with 250+ text keys
- **Loading States**: Busy indicators and skeleton screens
- **Error Handling**: Graceful fallbacks and user-friendly error messages
- **ML Service Fallback**: Automatic fallback to OData when ML service unavailable

## Application Details

|               |
| ------------- |
|**App Generator**<br>SAP Fiori Application Generator|
|**Template Used**<br>Basic V4|
|**Service Type**<br>Local CAP|
|**Service URL**<br>http://localhost:4004/api/|
|**Module Name**<br>cv-management|
|**Application Title**<br>CV Management System|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.143.2|

## Architecture

### Technology Stack
- **Frontend**: SAP UI5 1.143.2 (Basic V4 Application Template)
- **Backend**: SAP CAP (Cloud Application Programming Model)
- **ML Service**: Python FastAPI with semantic embeddings
- **Data Protocol**: OData V4

### Application Structure

```
webapp/
├── controller/
│   ├── BaseController.js       # Reusable utilities
│   ├── Main.controller.js      # Tab navigation & dashboard
│   ├── CandidateDetail.js      # 9 candidate action handlers
│   └── JobDetail.js            # Job operations & matching
├── view/
│   ├── App.view.xml            # App shell
│   ├── Main.view.xml           # IconTabBar with 3 tabs
│   ├── CandidateDetail.view.xml # ObjectPageLayout
│   └── JobDetail.view.xml      # Job tabs
├── fragment/
│   ├── CandidatesSection.fragment.xml
│   ├── JobsSection.fragment.xml
│   ├── DashboardSection.fragment.xml
│   ├── ScoringCriteriaSection.fragment.xml
│   └── dialogs/                # 15+ dialog fragments
├── utils/
│   └── MLServiceClient.js      # ML integration with fallback
├── css/
│   └── style.css               # Custom responsive styles
└── i18n/
    └── i18n.properties         # 250+ internationalization keys
```

### Navigation Pattern

The application uses an IconTabBar navigation pattern with 3 main tabs:

1. **Candidates Tab**: Candidate list and detail views
2. **Job Postings Tab**: Job list and detail views with scoring/matching
3. **Analytics Tab**: Dashboard with statistics and quick actions

Hash-based routing enables deep linking to any view.

## Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- SAP CAP development tools (`@sap/cds-dk`)
- Python 3.11+ (for ML service - optional)
- PostgreSQL (optional, for production)

### Backend Setup

1. **Start CAP Service** (from project root):
   ```bash
   npm install
   npm start
   ```
   Service runs on `http://localhost:4004`

2. **Start ML Service** (optional):
   ```bash
   cd python-ml-service
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   python -m uvicorn app.main:app --reload --port 5001
   ```
   Service runs on `http://localhost:5001`

### Frontend Development

1. **Install dependencies**:
   ```bash
   cd app/cv-management
   npm install
   ```

2. **Run development server**:
   ```bash
   npm start
   ```
   Access at `http://localhost:4004/cv-management/webapp/index.html`

3. **Build for production**:
   ```bash
   npm run build
   ```

## Usage Guide

### Adding a Candidate

1. Navigate to **Candidates** tab
2. Click **Add Candidate** button
3. Fill in candidate information
4. Click **Save**

### Creating a Job Posting

1. Navigate to **Job Postings** tab
2. Click **Create Job Posting**
3. Enter job details and required skills
4. Configure **Scoring Criteria** (optional)
5. Click **Publish Job**

### Running Semantic Matching

1. Open a job posting
2. Navigate to **Candidate Matches** tab
3. Click **Run Matching**
4. View progress through 5 steps:
   - Loading Candidates
   - Generating Embeddings
   - Calculating Similarity
   - Applying Scoring Criteria
   - Storing Results
5. Review match results with scores
6. Click **View Details** for detailed breakdown
7. **Review Match** to approve/reject

### Configuring Scoring Criteria

1. Open a job posting
2. Navigate to **Scoring Criteria** tab
3. Add criteria across 5 types:
   - Skills: Required technical skills with weights
   - Experience: Minimum years required
   - Languages: Required language proficiency
   - Education: Degree requirements
   - Certifications: Required certifications
4. Adjust **Semantic Weight** vs **Criteria Weight**
5. Click **Save Criteria**
6. Optionally **Load Template** for quick setup

### Using Global Search

1. Click the search field in header (or press `Ctrl+F`)
2. Type at least 2 characters
3. Results appear automatically in popover
4. Click any result to navigate to detail view

## API Integration

### OData Actions

**Candidate Actions**:
- `POST /Candidates(ID)/CandidateService.updateStatus`
- `POST /Candidates(ID)/CandidateService.addSkill`
- `POST /Candidates(ID)/CandidateService.scheduleInterview`
- `POST /bulkUpdateStatus`

**Job Actions**:
- `POST /JobPostings(ID)/JobService.publish`
- `POST /JobPostings(ID)/JobService.findMatchingCandidates`

**Match Actions**:
- `POST /MatchResults(ID)/MatchService.review`
- `POST /explainMatch`

### ML Service Endpoints

- `POST /api/matching/semantic` - Semantic search
- `POST /api/matching/search` - Text search with embeddings
- `POST /api/matching/similar-candidates` - Find similar candidates
- `GET /api/scoring-criteria` - Load criteria
- `POST /api/scoring-criteria` - Save criteria

## Performance

### Optimizations Implemented

1. **Lazy Loading**: Dialogs loaded on-demand and cached
2. **Pagination**: Tables load 20 items at a time with infinite scroll
3. **Debouncing**: Search inputs debounced at 300ms
4. **Caching**: Fragments and ML responses cached
5. **Auto-expand/select**: OData queries optimized
6. **Efficient Rendering**: Virtual scrolling for large lists

### Performance Targets
- Initial load: < 3 seconds
- List rendering: < 1 second
- Search response: < 500ms
- Match operation: 5-10 seconds (with progress)

## Troubleshooting

### ML Service Unavailable

The application automatically falls back to OData functions when ML service is unreachable:
- Semantic search → Traditional OData search
- AI matching → Rules-based matching
- Similar candidates → Basic similarity algorithm

User sees: "AI service unavailable. Using fallback mode."

### Common Issues

**Issue**: "Error loading data"
**Solution**: Check CAP service is running on port 4004

**Issue**: "No candidates found"
**Solution**: Ensure database is initialized with sample data

**Issue**: "Matching fails"
**Solution**:
1. Check ML service is running (optional)
2. Verify job has embedding generated (publish first)
3. Check scoring criteria configured

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

© 2024 CV Management System. All rights reserved.

---

**Made with Claude Code** 🤖
