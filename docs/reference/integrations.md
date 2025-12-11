# Integrations Deep Dive

This document explains how the various components of the CV Sorting system connect and communicate.

---

## Integration Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CAP Services                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  CandidateService        JobService              AIService             │  │
│  │  /api/candidates         /api/jobs               /api/ai               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│            │                      │                       │                   │
│            │                      │                       │                   │
│      ┌─────┴─────┐          ┌─────┴─────┐          ┌─────┴─────┐            │
│      ▼           ▼          ▼           ▼          ▼           ▼            │
│  ┌───────┐  ┌────────┐  ┌───────┐  ┌────────┐  ┌───────┐  ┌────────┐       │
│  │ HANA  │  │  ML    │  │ HANA  │  │  ML    │  │  ML   │  │ Joule  │       │
│  │ Cloud │  │Service │  │ Cloud │  │Service │  │Service│  │  AI    │       │
│  └───────┘  └────────┘  └───────┘  └────────┘  └───────┘  └────────┘       │
│                 │                       │            │                       │
│                 └───────────┬───────────┘            │                       │
│                             ▼                        ▼                       │
│                      ┌─────────────┐          ┌─────────────┐                │
│                      │ PostgreSQL  │          │ PostgreSQL  │                │
│                      │ (pgvector)  │          │ (pgvector)  │                │
│                      └─────────────┘          └─────────────┘                │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                              ┌─────┴─────┐
                              ▼           ▼
                         ┌────────┐  ┌────────┐
                         │  n8n   │  │ Email  │
                         │        │  │ Server │
                         └────────┘  └────────┘
```

---

## CAP ↔ Python ML Service

### Connection Setup

The CAP service connects to the Python ML service via the BTP Destination Service.

**mta.yaml Configuration:**
```yaml
modules:
  - name: cv-sorting-srv
    requires:
      - name: ml-service-api
        group: destinations
        properties:
          name: ml-service
          url: ~{ml-url}
          forwardAuthToken: false

  - name: cv-sorting-ml-service
    provides:
      - name: ml-service-api
        properties:
          ml-url: ${default-url}
```

**Destination Configuration:**
```yaml
destinations:
  - Name: ml-service-destination
    URL: ~{ml-service-api/ml-url}
    Authentication: NoAuthentication
    Type: HTTP
    ProxyType: Internet
```

### ML Client (srv/lib/ml-client.js)

```javascript
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

class MLClient {
  constructor() {
    this.destinationName = 'ml-service';
  }

  async generateEmbedding(entityType, entityId, textContent, options = {}) {
    return executeHttpRequest(
      { destinationName: this.destinationName },
      {
        method: 'POST',
        path: '/api/embeddings/generate',
        data: {
          entity_type: entityType,
          entity_id: entityId,
          text_content: textContent,
          ...options
        }
      }
    );
  }

  async findSemanticMatches(jobPostingId, options = {}) {
    return executeHttpRequest(
      { destinationName: this.destinationName },
      {
        method: 'POST',
        path: '/api/matching/semantic',
        data: {
          job_posting_id: jobPostingId,
          ...options
        }
      }
    );
  }

  async processOCR(fileContent, fileType, options = {}) {
    return executeHttpRequest(
      { destinationName: this.destinationName },
      {
        method: 'POST',
        path: '/api/ocr/process',
        data: {
          file_content: fileContent,  // base64
          file_type: fileType,
          ...options
        }
      }
    );
  }
}
```

### Integration Flows

#### Embedding Generation Flow

```
1. User creates/updates Candidate
   │
   ▼
2. CandidateService (CAP) handler triggers
   │
   ▼
3. MLClient.generateEmbedding() called
   │
   ▼
4. Python ML Service receives request
   │
   ▼
5. EmbeddingModel.encode() generates 384-dim vector
   │
   ▼
6. Vector stored in PostgreSQL (pgvector)
   │
   ▼
7. Response returned to CAP
   │
   ▼
8. HANA updated with embedding status
```

#### OCR Processing Flow

```
1. User uploads CV document
   │
   ▼
2. CandidateService.uploadDocument() stores file in HANA
   │
   ▼
3. processDocument() action called
   │
   ▼
4. MLClient.processOCR() sends base64 content
   │
   ▼
5. Python ML Service OCR processor:
   - Detects file type
   - Selects engine (PaddleOCR/Tesseract)
   - Extracts text
   - Parses structured data (if enabled)
   │
   ▼
6. Response with extracted text + structured data
   │
   ▼
7. CAP stores extracted data in HANA
   │
   ▼
8. MLClient.generateEmbedding() for new content
```

#### Semantic Matching Flow

```
1. Recruiter triggers "Find Matching Candidates"
   │
   ▼
2. AIService.findSemanticMatches() called
   │
   ▼
3. MLClient.findSemanticMatches() request:
   {
     job_posting_id: "uuid",
     min_score: 50.0,
     limit: 20,
     include_breakdown: true
   }
   │
   ▼
4. Python ML Service:
   a. Fetch job embedding from PostgreSQL
   b. Query pgvector for similar candidate embeddings:
      SELECT candidate_id, combined_embedding <=> job_embedding AS distance
      FROM candidate_embeddings
      ORDER BY distance
      LIMIT 20
   c. Apply scoring criteria (points for skills, experience, etc.)
   d. Calculate combined score:
      combined = 0.4 * semantic + 0.6 * criteria
   e. Return ranked results
   │
   ▼
5. CAP stores MatchResults in HANA
   │
   ▼
6. Results displayed in Jobs app
```

---

## CAP ↔ HANA Cloud

### Connection Setup

**package.json Configuration:**
```json
{
  "cds": {
    "requires": {
      "[production]": {
        "db": {
          "kind": "hana"
        }
      },
      "[development]": {
        "db": {
          "kind": "sqlite",
          "credentials": {
            "database": ":memory:"
          }
        }
      }
    }
  }
}
```

**mta.yaml:**
```yaml
resources:
  - name: cv-sorting-db
    type: com.sap.xs.hdi-container
    parameters:
      service: hana
      service-plan: hdi-shared

modules:
  - name: cv-sorting-srv
    requires:
      - name: cv-sorting-db
```

### Database Operations

**Standard CRUD:**
```javascript
// Read
const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });

// Create
await INSERT.into(Candidates).entries(candidateData);

// Update
await UPDATE(Candidates).set({ status_code: newStatus }).where({ ID: candidateId });

// Delete (soft)
await UPDATE(Candidates).set({ isDeleted: true, deletedAt: new Date() }).where({ ID: candidateId });
```

**Draft Operations:**
```javascript
// Candidates entity is draft-enabled
// CAP handles draft automatically via fiori annotations

@odata.draft.enabled
entity Candidates as projection on db.Candidates
```

**Associations and Expands:**
```javascript
// Read with associations
const candidate = await SELECT.one.from(Candidates, candidateId)
  .columns(c => {
    c`*`,
    c.skills(s => { s`*`, s.skill(sk => sk.name) }),
    c.experiences`*`,
    c.educations`*`
  });
```

---

## CAP ↔ XSUAA (Authentication)

### Configuration

**xs-security.json:**
```json
{
  "xsappname": "cv-sorting",
  "tenant-mode": "dedicated",
  "scopes": [
    { "name": "$XSAPPNAME.CVAdmin" },
    { "name": "$XSAPPNAME.Recruiter" },
    { "name": "$XSAPPNAME.HRManager" },
    { "name": "$XSAPPNAME.HRReviewer" },
    { "name": "$XSAPPNAME.JobManager" },
    { "name": "$XSAPPNAME.Viewer" }
  ],
  "role-templates": [
    {
      "name": "CVAdmin",
      "scope-references": ["$XSAPPNAME.CVAdmin"]
    },
    {
      "name": "Recruiter",
      "scope-references": ["$XSAPPNAME.Recruiter", "$XSAPPNAME.Viewer"]
    }
  ],
  "oauth2-configuration": {
    "token-validity": 43200,
    "refresh-token-validity": 604800
  }
}
```

### Service Authorization

**services.cds:**
```cds
@path: '/api/ai'
@requires: 'authenticated-user'
service AIService {
  // All endpoints require authentication
}

// Entity-level authorization
@restrict: [
  { grant: '*', to: 'CVAdmin' },
  { grant: ['READ', 'CREATE', 'UPDATE'], to: 'Recruiter' },
  { grant: 'READ', to: 'Viewer' }
]
entity Candidates as projection on db.Candidates;
```

### Token Flow

```
1. User accesses Fiori app
   │
   ▼
2. App Router redirects to XSUAA
   │
   ▼
3. User authenticates (SAML/OAuth)
   │
   ▼
4. XSUAA issues JWT token with scopes
   │
   ▼
5. App Router forwards token to CAP
   │
   ▼
6. CAP validates token, extracts user info
   │
   ▼
7. @restrict annotations enforce authorization
```

---

## CAP ↔ n8n

### Connection Setup

n8n connects to CAP via REST API calls.

**n8n Workflow Configuration:**
```json
{
  "nodes": [
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "={{ $env.CAP_SERVICE_URL }}/api/candidates/uploadDocument",
        "authentication": "none",
        "sendBody": true,
        "bodyParameters": {
          "fileName": "={{ $json.attachment.fileName }}",
          "fileContent": "={{ $json.attachment.content }}",
          "mediaType": "={{ $json.attachment.mimeType }}"
        }
      }
    }
  ]
}
```

### Email Capture Flow

```
1. n8n polls IMAP server every 5 minutes
   │
   ▼
2. New email with CV attachment detected
   │
   ▼
3. n8n extracts:
   - Sender email
   - Attachment (PDF/DOCX)
   - Subject line
   │
   ▼
4. Attachment encoded to base64
   │
   ▼
5. POST /api/candidates/uploadDocument
   {
     "fileName": "resume.pdf",
     "fileContent": "base64...",
     "mediaType": "application/pdf"
   }
   │
   ▼
6. CAP processes document (OCR → embedding)
   │
   ▼
7. Candidate created with extracted data
```

### Match Notification Flow

```
1. CAP calculates new matches for job
   │
   ▼
2. Webhook triggered to n8n
   {
     "jobPostingId": "uuid",
     "matchCount": 5,
     "topCandidates": [...]
   }
   │
   ▼
3. n8n checks notification threshold
   │
   ▼
4. If threshold met, sends email to HR:
   - Subject: "New Candidates Match Your Job Posting"
   - Body: Top 5 candidates with scores
   │
   ▼
5. Notification logged in NotificationHistory
```

---

## Python ML ↔ PostgreSQL (pgvector)

### Connection Setup

**app/db/postgres.py:**
```python
import asyncpg

class PostgresPool:
    def __init__(self, dsn: str, min_size: int = 2, max_size: int = 10):
        self.dsn = dsn
        self.min_size = min_size
        self.max_size = max_size
        self.pool = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(
            dsn=self.dsn,
            min_size=self.min_size,
            max_size=self.max_size
        )

    async def fetch(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def execute(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def close(self):
        await self.pool.close()
```

### Vector Operations

**Store Embedding:**
```python
async def store_candidate_embedding(
    self,
    candidate_id: str,
    combined_embedding: list,
    content_hash: str
):
    query = """
        INSERT INTO candidate_embeddings
            (candidate_id, combined_embedding, content_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT (candidate_id)
        DO UPDATE SET
            combined_embedding = EXCLUDED.combined_embedding,
            content_hash = EXCLUDED.content_hash,
            updated_at = CURRENT_TIMESTAMP
    """
    await self.db.execute(query, candidate_id, combined_embedding, content_hash)
```

**Similarity Search:**
```python
async def find_similar_candidates(
    self,
    job_embedding: list,
    limit: int = 20
) -> list:
    query = """
        SELECT
            candidate_id,
            1 - (combined_embedding <=> $1) AS similarity
        FROM candidate_embeddings
        WHERE combined_embedding IS NOT NULL
        ORDER BY combined_embedding <=> $1
        LIMIT $2
    """
    return await self.db.fetch(query, job_embedding, limit)
```

**Vector Distance Operators:**
| Operator | Name | Use Case |
|----------|------|----------|
| `<=>` | Cosine distance | Normalized vectors (recommended) |
| `<->` | L2 distance | Euclidean distance |
| `<#>` | Inner product | Dot product similarity |

---

## BTP Destination Service

### Configured Destinations

| Name | URL | Authentication | Purpose |
|------|-----|----------------|---------|
| cv-sorting-srv-api | CAP service URL | NoAuth (internal) | Internal routing |
| ml-service-destination | Python ML URL | NoAuth | ML operations |
| document-ai-destination | SAP Document AI | OAuth2 | Alternative OCR |
| joule-ai-destination | SAP AI Core | OAuth2 | Joule AI chat |
| n8n-destination | n8n service URL | NoAuth | Automation webhooks |

### Usage in CAP

```javascript
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

// Using named destination
const response = await executeHttpRequest(
  { destinationName: 'ml-service-destination' },
  {
    method: 'POST',
    path: '/api/embeddings/generate',
    data: requestBody
  }
);

// Using destination with OAuth
const aiResponse = await executeHttpRequest(
  { destinationName: 'joule-ai-destination' },
  {
    method: 'POST',
    path: '/v1/chat',
    data: chatRequest
  }
);
```

---

## Error Handling

### CAP → ML Service Errors

```javascript
try {
  const result = await mlClient.generateEmbedding(entityType, entityId, text);
  return result;
} catch (error) {
  if (error.response?.status === 503) {
    // ML service unavailable
    logger.warn('ML service unavailable, skipping embedding generation');
    return { stored: false, reason: 'service_unavailable' };
  }
  if (error.response?.status === 400) {
    // Bad request (invalid input)
    throw new ValidationError(error.response.data.detail);
  }
  // Log and rethrow unexpected errors
  logger.error('ML service error', { error: error.message });
  throw new TechnicalError('ML service communication failed');
}
```

### Circuit Breaker Pattern

For production, implement circuit breaker for ML service calls:

```javascript
const CircuitBreaker = require('opossum');

const mlCircuitBreaker = new CircuitBreaker(mlClient.generateEmbedding.bind(mlClient), {
  timeout: 30000,        // 30 second timeout
  errorThresholdPercentage: 50,
  resetTimeout: 30000    // Try again after 30 seconds
});

mlCircuitBreaker.fallback(() => ({
  stored: false,
  reason: 'circuit_open'
}));
```

---

## Health Checks

### CAP Health Check

**AdminService.healthCheck:**
```javascript
function healthCheck() returns {
  status: String;
  database: String;
  ocr: String;
  jouleAI: String;
  timestamp: Timestamp;
}
```

### Python ML Health Check

**GET /health/ready:**
```json
{
  "status": "healthy",
  "components": {
    "embedding_model": {"status": "ok", "loaded": true},
    "database": {"status": "ok", "connected": true},
    "ocr": {"status": "ok", "engine": "paddleocr"}
  }
}
```

### Integration Health Monitoring

Recommended approach:
1. CAP `/api/jobs/healthCheck` calls ML service `/health`
2. Returns aggregated status
3. BTP Application Logging captures failures
4. Alert on consecutive failures
