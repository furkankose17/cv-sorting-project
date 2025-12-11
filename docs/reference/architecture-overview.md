# Architecture Overview

The CV Sorting project is a multi-tier enterprise application deployed on SAP BTP (Business Technology Platform).

---

## System Architecture

```
                                    ┌─────────────────────────────────────┐
                                    │           User Browsers             │
                                    └─────────────────────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SAP BTP Subaccount                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         Application Router (Approuter)                     │  │
│  │                    - OAuth 2.0 via XSUAA                                  │  │
│  │                    - Route mapping to services                            │  │
│  │                    - CSRF protection                                       │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                     │                    │                    │                  │
│         ┌──────────┘                    │                    └──────────┐       │
│         ▼                               ▼                               ▼       │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐   │
│  │  HTML5 Repo     │         │  CAP Services   │         │  Destinations   │   │
│  │  Runtime        │         │  (Node.js)      │         │  Service        │   │
│  │                 │         │                 │         │                 │   │
│  │  - CV Upload    │         │  CandidateServ  │         │  - ML Service   │   │
│  │  - Candidates   │◄───────►│  JobService     │◄───────►│  - Document AI  │   │
│  │  - Jobs         │         │  AIService      │         │  - Joule AI     │   │
│  │  - Analytics    │         │                 │         │  - n8n          │   │
│  └─────────────────┘         └─────────────────┘         └─────────────────┘   │
│                                      │ │                                        │
│                     ┌────────────────┘ └────────────────┐                       │
│                     ▼                                    ▼                       │
│          ┌─────────────────┐                  ┌─────────────────┐               │
│          │   HANA Cloud    │                  │  Python ML Svc  │               │
│          │   (HDI-shared)  │                  │  (FastAPI)      │               │
│          │                 │                  │                 │               │
│          │  - Candidates   │                  │  - Embeddings   │               │
│          │  - Jobs         │                  │  - OCR          │               │
│          │  - Matches      │                  │  - Scoring      │               │
│          │  - Audit logs   │                  │  - Matching     │               │
│          └─────────────────┘                  └─────────────────┘               │
│                                                       │                          │
│                                                       ▼                          │
│                                            ┌─────────────────┐                  │
│                                            │   PostgreSQL    │                  │
│                                            │   (pgvector)    │                  │
│                                            │                 │                  │
│                                            │  - Embeddings   │                  │
│                                            │  - Criteria     │                  │
│                                            │  - Match cache  │                  │
│                                            └─────────────────┘                  │
│                                                                                 │
│         ┌─────────────────┐                                                     │
│         │       n8n       │ (Optional - self-hosted automation)                 │
│         │                 │                                                     │
│         │  - Email capture│                                                     │
│         │  - Notifications│                                                     │
│         └─────────────────┘                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Frontend Layer

| Component | Technology | Purpose |
|-----------|------------|---------|
| CV Upload | Fiori/UI5 | Upload CVs, view processing status, create candidates |
| Candidate Management | Fiori Elements | CRUD operations, interviews, skills management |
| Jobs | Fiori Elements | Job postings, matching, candidate ranking |
| Analytics Dashboard | Fiori/UI5 | Pipeline metrics, trends, insights |
| App Router | @sap/approuter | Authentication, routing, CORS |

### Service Layer

| Service | Path | Responsibilities |
|---------|------|------------------|
| CandidateService | `/api/candidates` | Candidate CRUD, CV processing, interviews, skills |
| JobService | `/api/jobs` | Job CRUD, matching algorithms, analytics, notifications |
| AIService | `/api/ai` | Joule AI chat, embeddings, OCR, semantic search |

### Data Layer

| Database | Purpose | Key Tables |
|----------|---------|------------|
| HANA Cloud | Business data | Candidates, Jobs, MatchResults, AuditLogs |
| PostgreSQL | ML data | candidate_embeddings, job_embeddings, scoring_criteria |

### ML/AI Layer

| Component | Purpose | Technology |
|-----------|---------|------------|
| Embedding Model | Vector representations | Sentence Transformers (multilingual-e5-small) |
| OCR Engine | Text extraction | PaddleOCR (primary), Tesseract (fallback) |
| pgvector | Similarity search | PostgreSQL extension for vector operations |

### Automation Layer

| Component | Purpose |
|-----------|---------|
| n8n | Email capture, match notifications, workflow automation |
| SAP Build Process Automation | Approval workflows (optional) |

---

## Data Flow Patterns

### CV Upload Flow

```
User uploads CV
       │
       ▼
┌─────────────────┐
│  CV Upload App  │ (Fiori)
└─────────────────┘
       │
       ▼ POST /api/candidates/uploadDocument
┌─────────────────┐
│ CandidateService│ (CAP)
└─────────────────┘
       │
       ▼ Store file metadata
┌─────────────────┐
│   HANA Cloud    │
└─────────────────┘
       │
       ▼ POST /ocr/extract
┌─────────────────┐
│ Python ML Svc   │ (FastAPI)
└─────────────────┘
       │
       ▼ Extract text
┌─────────────────┐
│  PaddleOCR /    │
│  Tesseract      │
└─────────────────┘
       │
       ▼ Return extracted data
┌─────────────────┐
│ CandidateService│
└─────────────────┘
       │
       ▼ Create/link candidate
┌─────────────────┐
│   HANA Cloud    │
└─────────────────┘
```

### Matching Flow

```
Recruiter triggers match
       │
       ▼
┌─────────────────┐
│   Jobs App      │ (Fiori)
└─────────────────┘
       │
       ▼ POST /api/ai/findSemanticMatches
┌─────────────────┐
│    AIService    │ (CAP)
└─────────────────┘
       │
       ▼ POST /matching/semantic
┌─────────────────────────────────────────┐
│            Python ML Service            │
│  ┌────────────────────────────────────┐ │
│  │ 1. Get job embedding               │ │
│  │ 2. Query pgvector for similar      │ │
│  │ 3. Apply scoring criteria          │ │
│  │ 4. Rank and return                 │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
       │
       ▼ Store results
┌─────────────────┐     ┌─────────────────┐
│   HANA Cloud    │     │   PostgreSQL    │
│  (MatchResults) │     │  (cache)        │
└─────────────────┘     └─────────────────┘
```

---

## Security Architecture

### Authentication Flow

```
User Request
     │
     ▼
┌───────────────┐
│  App Router   │
└───────────────┘
     │
     ▼ Redirect if unauthenticated
┌───────────────┐
│    XSUAA      │ (OAuth 2.0)
└───────────────┘
     │
     ▼ JWT token issued
┌───────────────┐
│  App Router   │ (Token forwarded)
└───────────────┘
     │
     ▼ Authorization checked
┌───────────────┐
│  CAP Service  │ (@requires annotations)
└───────────────┘
```

### Role Hierarchy

| Role | Capabilities |
|------|--------------|
| CVAdmin | Full system access |
| HRManager | Manage candidates, jobs, approve workflows |
| Recruiter | Create/edit candidates, schedule interviews |
| JobManager | Manage job postings, view matches |
| HRReviewer | Review matches, add notes |
| Viewer | Read-only access |

---

## Deployment Architecture

### MTA Modules

| Module | Type | Memory | Purpose |
|--------|------|--------|---------|
| cv-sorting-srv | nodejs | 512MB | CAP services |
| cv-sorting-db-deployer | hdb | 256MB | HANA schema deployment |
| cv-sorting-app | approuter | 256MB | Frontend routing |
| cv-sorting-ml-service | python | 2048MB | ML/AI operations |
| cv-sorting-n8n | docker | 1024MB | Automation (optional) |
| html5-app-deployer | content | - | UI deployment |

### BTP Services Used

| Service | Plan | Purpose |
|---------|------|---------|
| HANA Cloud | hdi-shared | Business database |
| PostgreSQL | standard | Vector embeddings |
| XSUAA | application | Authentication |
| Destination | lite | External connectivity |
| HTML5 Repo | app-host + app-runtime | UI hosting |
| Application Logs | lite | Logging (optional) |

---

## Key Design Decisions

1. **Dual Database Strategy**
   - HANA: Transactional business data (candidates, jobs, matches)
   - PostgreSQL: ML-specific data (embeddings, scoring criteria, caches)
   - Rationale: Leverage HANA for business logic + pgvector for efficient similarity search

2. **Separated ML Service**
   - Python microservice decoupled from CAP
   - Rationale: Python ecosystem for ML (PyTorch, Sentence Transformers) + independent scaling

3. **Consolidated CAP Services**
   - 3 services instead of 6+ smaller ones
   - Rationale: Reduced complexity, better cohesion, fewer cross-service calls

4. **Multilingual Support**
   - multilingual-e5-small model for embeddings (100+ languages)
   - Rationale: Support English, German, Turkish CVs natively

5. **Dual OCR Engines**
   - PaddleOCR primary (fast, table detection)
   - Tesseract fallback (reliability)
   - Rationale: Best-of-breed with automatic failover

6. **Soft Delete Pattern**
   - `isDeleted` flag instead of hard deletes
   - Rationale: Audit compliance, data recovery capability
