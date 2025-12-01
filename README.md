# CV Sorting Project - SAP BTP Blueprint

A comprehensive SAP Business Technology Platform (BTP) solution for automated CV/Resume processing, analysis, and candidate sorting using AI-powered document extraction, CAP services, and process automation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SAP BTP Subaccount                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────────┐  │
│  │   SAP Fiori/    │    │  SAP Build Work │    │    SAP Integration Suite    │  │
│  │   UI5 App       │───▶│  Zone (Launchpad)│    │    (optional S/4 connect)   │  │
│  └────────┬────────┘    └─────────────────┘    └─────────────────────────────┘  │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         SAP Cloud Application Programming (CAP)          │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐   │    │
│  │  │ CV Service  │  │ Candidate    │  │ Job Matching│  │ Analytics    │   │    │
│  │  │ (Upload/OCR)│  │ Management   │  │ Service     │  │ Service      │   │    │
│  │  └──────┬──────┘  └──────────────┘  └─────────────┘  └──────────────┘   │    │
│  └─────────┼───────────────────────────────────────────────────────────────┘    │
│            │                                                                     │
│            ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    SAP AI Services / Document AI                         │    │
│  │  ┌─────────────────────┐  ┌────────────────────────────────────────┐    │    │
│  │  │ Document Information │  │ Business Entity Recognition            │    │    │
│  │  │ Extraction (DOX)     │  │ (Skills, Experience, Education)        │    │    │
│  │  └─────────────────────┘  └────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                  SAP Build Process Automation                            │    │
│  │  ┌───────────────┐  ┌────────────────┐  ┌────────────────────────┐      │    │
│  │  │ CV Processing │  │ Approval       │  │ Candidate Notification │      │    │
│  │  │ Workflow      │  │ Workflow       │  │ Workflow               │      │    │
│  │  └───────────────┘  └────────────────┘  └────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         SAP HANA Cloud                                   │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐   │    │
│  │  │ Candidates  │  │ CVDocuments  │  │ JobPostings │  │ MatchResults │   │    │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
cv-sorting-project/
├── README.md                          # This file - Project Blueprint
├── mta.yaml                           # Multi-Target Application descriptor
├── package.json                       # Root package configuration
├── xs-security.json                   # Security configuration (XSUAA)
│
├── srv/                               # CAP Service Layer
│   ├── cv-service.cds                 # CV Processing Service definitions
│   ├── cv-service.js                  # Service implementation
│   ├── candidate-service.cds          # Candidate Management Service
│   ├── candidate-service.js           # Candidate service implementation
│   ├── matching-service.cds           # Job Matching Service
│   ├── matching-service.js            # Matching algorithms
│   └── external/                      # External service integrations
│       ├── document-ai.cds            # Document AI service definitions
│       └── document-ai.js             # Document AI integration
│
├── db/                                # Database Layer (HANA Cloud)
│   ├── schema.cds                     # Core data model
│   ├── data/                          # Initial/sample data
│   │   ├── cv.sorting-Skills.csv
│   │   └── cv.sorting-JobCategories.csv
│   └── src/                           # HANA artifacts (if needed)
│       └── .hdinamespace
│
├── app/                               # UI Layer
│   ├── cv-upload/                     # CV Upload Application
│   │   ├── webapp/
│   │   │   ├── manifest.json
│   │   │   ├── Component.js
│   │   │   └── view/
│   │   └── ui5.yaml
│   ├── candidate-management/          # Candidate Management App
│   │   ├── webapp/
│   │   └── ui5.yaml
│   └── analytics-dashboard/           # Analytics Dashboard
│       ├── webapp/
│       └── ui5.yaml
│
├── workflows/                         # SAP Build Process Automation
│   ├── cv-processing-workflow.json    # CV Processing workflow definition
│   ├── approval-workflow.json         # HR Approval workflow
│   └── notification-workflow.json     # Candidate notification workflow
│
├── integration/                       # Integration artifacts
│   ├── iflows/                        # Integration flows (if using CPI)
│   └── destinations/                  # Destination configurations
│
└── test/                              # Test files
    ├── cv-service.test.js
    └── matching-service.test.js
```

## BTP Services Required

| Service | Plan | Purpose |
|---------|------|---------|
| SAP HANA Cloud | hana | Primary database |
| SAP HANA Schemas & HDI Containers | hdi-shared | Database containers |
| SAP Authorization and Trust Management (XSUAA) | application | Authentication & Authorization |
| SAP Destination Service | lite | External service connectivity |
| SAP Document Information Extraction | default | OCR and document processing |
| SAP AI Core (optional) | standard | Advanced AI/ML capabilities |
| SAP Build Process Automation | standard | Workflow automation |
| SAP Build Work Zone, standard edition | standard | Launchpad & UX |
| SAP Cloud Logging (optional) | standard | Centralized logging |

## Features

### 1. CV Upload & Processing
- Multi-format support (PDF, DOCX, DOC, images)
- Drag-and-drop upload interface
- Batch upload capability
- Real-time processing status

### 2. Document AI / OCR Processing
- Automatic text extraction from uploaded CVs
- Structured data extraction:
  - Personal information (name, contact, location)
  - Work experience (companies, roles, durations)
  - Education (degrees, institutions, dates)
  - Skills (technical, soft skills, certifications)
  - Languages

### 3. Candidate Management
- Comprehensive candidate profiles
- Search and filter capabilities
- Status tracking (new, reviewing, shortlisted, rejected, hired)
- Notes and comments
- Document versioning

### 4. Job Matching Engine
- Define job requirements and criteria
- Automatic candidate-job matching
- Scoring algorithm based on:
  - Skills match percentage
  - Experience relevance
  - Education requirements
  - Location preferences
- Ranking and sorting

### 5. Process Automation Workflows
- **CV Processing Workflow**: Automated document extraction → data validation → profile creation
- **Approval Workflow**: Multi-level approval for candidate progression
- **Notification Workflow**: Automated emails to candidates and recruiters

### 6. Analytics & Reporting
- Candidate pipeline dashboard
- Source analysis (where candidates come from)
- Time-to-hire metrics
- Skills gap analysis
- Matching success rates

## Getting Started

### Prerequisites
- SAP BTP Global Account with necessary entitlements
- SAP Business Application Studio or local development environment
- Node.js 18+ and npm
- Cloud Foundry CLI
- SAP CAP CLI (`@sap/cds-dk`)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd cv-sorting-project

# Install dependencies
npm install

# Start local development
cds watch
```

### Configuration

1. **Set up BTP Services**: Create required service instances in your BTP subaccount
2. **Configure Destinations**: Set up destinations for Document AI and other external services
3. **Deploy**: Use MTA build and deploy

```bash
# Build MTA archive
mbt build

# Deploy to Cloud Foundry
cf deploy mta_archives/cv-sorting-project_1.0.0.mtar
```

## API Reference

### CV Service Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/cv/Documents` | Upload new CV document |
| GET | `/cv/Documents` | List all documents |
| POST | `/cv/processDocument` | Trigger OCR processing |
| GET | `/cv/extractedData(ID)` | Get extracted CV data |

### Candidate Service Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/candidate/Candidates` | List all candidates |
| POST | `/candidate/Candidates` | Create new candidate |
| PATCH | `/candidate/Candidates(ID)` | Update candidate |
| POST | `/candidate/updateStatus` | Update candidate status |

### Matching Service Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/matching/JobPostings` | List job postings |
| POST | `/matching/findMatches` | Find matching candidates |
| GET | `/matching/MatchResults` | Get match results |

## Security

- OAuth 2.0 authentication via XSUAA
- Role-based access control (RBAC)
- Data encryption at rest (HANA Cloud)
- HTTPS for all communications

### Roles
- **CVAdmin**: Full access to all features
- **Recruiter**: Upload CVs, manage candidates, view matches
- **HRManager**: Approve candidates, view analytics
- **Viewer**: Read-only access to candidate profiles

## License

This project is proprietary. All rights reserved.

## Support

For questions and support, contact the development team.
