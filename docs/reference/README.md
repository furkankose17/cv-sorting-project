# CV Sorting Project Reference

Enterprise BTP application for CV processing, candidate management, and AI-powered recruitment optimization.

**Last Updated:** December 2024
**Platform:** SAP BTP (Cloud Foundry)
**Framework:** SAP CAP (Node.js) + SAP Fiori/UI5 + Python FastAPI

---

## Quick Navigation

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture-overview.md) | System components and how they connect |
| [CAP Services](./cap-services.md) | Deep dive into backend services and handlers |
| [Data Model](./data-model.md) | Database schema, entities, and relationships |
| [ML Service](./ml-service.md) | Python FastAPI service for AI/ML operations |
| [Integrations](./integrations.md) | How CAP, Python, n8n, and BTP services connect |
| [Fiori Apps](./fiori-apps.md) | UI applications overview |
| [Workflows](./workflows.md) | n8n and BPA automation workflows |
| [Local Development](./local-development.md) | Setup guide for running locally |
| [API Reference](./api-reference.md) | Endpoint quick reference tables |
| [Troubleshooting](./troubleshooting.md) | Common issues and solutions |

---

## Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        SAP BTP Platform                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Fiori Apps  │  │  App Router  │  │    HTML5 Repo        │  │
│  │  (4 apps)    │──│  (XSUAA)     │──│    Runtime           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│          │                                                      │
│          ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              CAP Services (Node.js)                       │  │
│  │  ┌────────────────┐ ┌───────────┐ ┌────────────────────┐ │  │
│  │  │ CandidateServ  │ │ JobServ   │ │     AIService      │ │  │
│  │  │ /api/candidates│ │ /api/jobs │ │     /api/ai        │ │  │
│  │  └────────────────┘ └───────────┘ └────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│          │                    │                    │            │
│          ▼                    ▼                    ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  HANA Cloud  │    │  PostgreSQL  │    │  Python ML Svc   │  │
│  │  (Core Data) │    │  (pgvector)  │    │  (FastAPI)       │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                    │            │
│                              ┌─────────────────────┘            │
│                              ▼                                  │
│                      ┌──────────────┐                          │
│                      │     n8n      │                          │
│                      │ (Automation) │                          │
│                      └──────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Directories

```
cv-sorting-project/
├── app/                    # Fiori UI applications
│   ├── cv-upload/          # CV upload and processing
│   ├── candidate-management/  # Candidate CRUD
│   ├── jobs/               # Job posting management
│   ├── analytics-dashboard/   # Analytics and insights
│   └── router/             # App router configuration
├── db/                     # Database layer
│   ├── schema.cds          # Entity definitions
│   ├── common.cds          # Shared types and aspects
│   └── data/               # Seed data (18 CSV files)
├── srv/                    # CAP services
│   ├── services.cds        # Service definitions
│   ├── handlers/           # Service implementations
│   └── lib/                # Utilities (logger, validators)
├── python-ml-service/      # Python FastAPI ML service
│   ├── app/                # Application code
│   └── requirements.txt    # Python dependencies
├── infrastructure/         # Infrastructure configs
│   ├── n8n/                # n8n workflow definitions
│   └── postgresql/         # pgvector schema
├── test/                   # Jest test suite
├── mta.yaml                # MTA deployment descriptor
├── package.json            # Node.js dependencies
└── xs-security.json        # Authorization config
```

---

## Quick Commands

```bash
# Development
npm run watch           # Start CAP with hot reload
npm test                # Run Jest tests

# Build & Deploy
npm run build           # Build for production
npm run build:cf        # Build MTA archive
npm run deploy          # Deploy to BTP

# Python ML Service
cd python-ml-service
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

---

## Services Overview

| Service | Path | Purpose |
|---------|------|---------|
| CandidateService | `/api/candidates` | Candidates, CVs, documents, interviews |
| JobService | `/api/jobs` | Jobs, matching, analytics, notifications, admin |
| AIService | `/api/ai` | Joule AI, embeddings, OCR, scoring |

---

## Getting Started

1. **New to the project?** Start with [Architecture Overview](./architecture-overview.md)
2. **Setting up locally?** See [Local Development](./local-development.md)
3. **Understanding the data?** Read [Data Model](./data-model.md)
4. **Working on integrations?** Check [Integrations](./integrations.md)
5. **Debugging issues?** Consult [Troubleshooting](./troubleshooting.md)
