# CV Sorting Application

[![SAP BTP](https://img.shields.io/badge/SAP-BTP-0FAAFF?style=flat&logo=sap&logoColor=white)](https://www.sap.com/products/technology-platform.html)
[![SAP CAP](https://img.shields.io/badge/SAP-CAP-0FAAFF?style=flat)](https://cap.cloud.sap/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat)](LICENSE)

> AI-powered CV/Resume processing and candidate matching platform built on SAP Business Technology Platform

---

## Features

| Feature | Description |
|---------|-------------|
| **Document Processing** | Multi-format CV upload (PDF, DOCX, images) with Tesseract/PaddleOCR |
| **AI Matching** | Semantic search with vector embeddings for intelligent candidate-job matching |
| **Fiori Applications** | 4 modern SAP UI5 apps for complete recruitment workflow |
| **Process Automation** | n8n workflows for CV processing and notifications |
| **Enterprise Security** | OAuth 2.0 via XSUAA, RBAC with 6 roles, OWASP compliance |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SAP BTP Subaccount                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │  Fiori Apps  │   │  Work Zone   │   │   n8n Workflows      │ │
│  │  (4 apps)    │──▶│  Launchpad   │   │   (Automation)       │ │
│  └──────┬───────┘   └──────────────┘   └──────────────────────┘ │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              SAP CAP Services (Node.js)                   │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐            │   │
│  │  │ Candidate  │ │    Job     │ │     AI     │            │   │
│  │  │  Service   │ │  Service   │ │  Service   │            │   │
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘            │   │
│  └────────┼──────────────┼──────────────┼───────────────────┘   │
│           │              │              │                        │
│           ▼              ▼              ▼                        │
│  ┌────────────────┐  ┌─────────────────────────────────────┐    │
│  │  HANA Cloud    │  │  Python ML Service (FastAPI)        │    │
│  │  (SQLite dev)  │  │  - Sentence Transformers            │    │
│  └────────────────┘  │  - OCR (Tesseract/PaddleOCR)        │    │
│                      │  - PostgreSQL + pgvector            │    │
│                      └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Python 3.10+
- Docker (for PostgreSQL with pgvector)

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd cv-sorting-project

# Install dependencies
npm install

# Start CAP service (Terminal 1)
npm run watch
# Available at http://localhost:4004

# Start Python ML service (Terminal 2)
cd python-ml-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
# Available at http://localhost:8000/docs

# Start PostgreSQL (Terminal 3)
docker run -d --name cv-postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16
```

### Access Applications

| Application | URL |
|-------------|-----|
| CAP Service Index | http://localhost:4004 |
| API Documentation | http://localhost:8000/docs |
| Fiori Launchpad | http://localhost:4004/index.html |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | SAP CAP (Node.js), Express |
| **Database** | SAP HANA Cloud, SQLite (dev), PostgreSQL + pgvector |
| **ML Service** | Python FastAPI, Sentence Transformers, Tesseract OCR |
| **Frontend** | SAP UI5/Fiori Elements |
| **Auth** | SAP XSUAA (OAuth 2.0) |
| **Workflows** | n8n, SAP Build Process Automation |

---

## Project Structure

```
cv-sorting-project/
├── srv/                    # CAP backend services
│   ├── services.cds        # Service definitions
│   ├── handlers/           # Request handlers
│   └── lib/                # Utilities (ML client, validators)
├── db/                     # Data model & seed data
│   ├── schema.cds          # Entity definitions
│   └── data/               # CSV seed data
├── app/                    # Fiori UI applications
│   ├── cv-upload/          # CV upload app
│   ├── candidate-management/
│   └── analytics-dashboard/
├── python-ml-service/      # Python ML microservice
│   └── app/                # FastAPI application
├── docs/                   # Documentation
├── test/                   # Jest test suite
└── infrastructure/         # n8n workflows
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Overview](docs/reference/architecture-overview.md) | System design and components |
| [API Reference](docs/reference/api-reference.md) | Complete endpoint documentation |
| [Local Development](docs/reference/local-development.md) | Setup guide for developers |
| [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) | SAP BTP deployment instructions |
| [Security](docs/SECURITY.md) | Security implementation details |
| [Testing](docs/TESTING.md) | Test suite documentation |

---

## API Overview

### CAP Services

| Service | Base Path | Description |
|---------|-----------|-------------|
| CandidateService | `/api/candidates` | Candidate CRUD, document upload |
| JobService | `/api/jobs` | Job postings, matching, analytics |
| AIService | `/api/ai` | Joule AI chat, embeddings, scoring |

### Python ML Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/embeddings/generate` | POST | Generate vector embeddings |
| `/api/matching/semantic` | POST | Find semantic matches |
| `/api/ocr/process` | POST | Extract text from documents |
| `/health/ready` | GET | Service health check |

---

## Security

- **Authentication**: OAuth 2.0 via SAP XSUAA
- **Authorization**: Role-based access control (RBAC)
- **Roles**: CVAdmin, Recruiter, HRManager, JobManager, Viewer, WorkflowParticipant
- **Compliance**: OWASP Top 10 security hardening

---

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=ml-service

# Run with coverage
npm test -- --coverage
```

---

## Deployment

```bash
# Build MTA archive
npm run build:cf

# Deploy to Cloud Foundry
cf login -a <api-endpoint>
cf deploy mta_archives/cv-sorting-project_1.0.0.mtar
```

See [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

---

## License

Proprietary - All rights reserved.

---

## Support

For questions and support, please contact the development team or open an issue in this repository.
