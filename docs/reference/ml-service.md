# Python ML Service Deep Dive

The Python ML Service is a FastAPI microservice providing AI/ML capabilities for the CV Sorting application.

---

## Architecture

```
python-ml-service/
├── app/
│   ├── main.py                 # FastAPI application bootstrap
│   ├── config.py               # Settings (pydantic-settings)
│   ├── api/
│   │   └── routes/
│   │       ├── health.py       # Health check endpoints
│   │       ├── embeddings.py   # Embedding generation
│   │       ├── ocr.py          # Document OCR
│   │       ├── matching.py     # Semantic matching
│   │       └── scoring.py      # Criteria-based scoring
│   ├── models/
│   │   ├── embeddings.py       # Sentence Transformer model
│   │   └── ocr.py              # PaddleOCR/Tesseract processor
│   ├── services/
│   │   ├── embedding_service.py   # Embedding generation logic
│   │   ├── matching_service.py    # Semantic similarity matching
│   │   └── scoring_service.py     # Criteria-based scoring
│   └── db/
│       └── postgres.py         # asyncpg connection pool
└── requirements.txt            # Python dependencies
```

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Web Framework | FastAPI | REST API |
| Embeddings | Sentence Transformers | Vector generation |
| Embedding Model | `intfloat/multilingual-e5-small` | 384-dim multilingual embeddings |
| OCR (Primary) | PaddleOCR | Fast, accurate OCR with table detection |
| OCR (Fallback) | Tesseract | Reliable fallback OCR |
| Database | PostgreSQL + pgvector | Vector storage and similarity search |
| Async DB | asyncpg | Async PostgreSQL driver |
| Settings | pydantic-settings | Environment configuration |

---

## Configuration

Configuration is managed via environment variables with sensible defaults.

### Environment Variables

```bash
# Application
APP_NAME="CV Sorting ML Service"
APP_VERSION="1.0.0"
ENVIRONMENT="development"  # development|staging|production
DEBUG=false
LOG_LEVEL="INFO"

# Embedding Model
EMBEDDING_MODEL="intfloat/multilingual-e5-small"
EMBEDDING_DIMENSION=384
EMBEDDING_BATCH_SIZE=32
EMBEDDING_NORMALIZE=true
EMBEDDING_MAX_LENGTH=512

# PostgreSQL
POSTGRES_HOST="localhost"
POSTGRES_PORT=5432
POSTGRES_DB="cv_sorting"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD=""
POSTGRES_SSL=false
POSTGRES_POOL_MIN=2
POSTGRES_POOL_MAX=10

# OCR
OCR_ENGINE="paddleocr"  # paddleocr|tesseract
TESSERACT_CMD="tesseract"
POPPLER_PATH=""
OCR_DEFAULT_LANGUAGE="en"
OCR_TABLE_DETECTION=true
OCR_LAYOUT_ANALYSIS=true
OCR_USE_ANGLE_CLS=true  # Detect rotated text

# Matching
SEMANTIC_WEIGHT=0.4
CRITERIA_WEIGHT=0.6
DEFAULT_MIN_SCORE=50.0
DEFAULT_MATCH_LIMIT=50

# CORS
ALLOWED_ORIGINS="*"
```

---

## API Endpoints

### Health (`/health`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/ready` | Readiness check (all components) |
| GET | `/health/live` | Liveness check |

**Response:**
```json
{
  "status": "healthy",
  "service": "CV Sorting ML Service",
  "version": "1.0.0",
  "embedding_model": {
    "name": "intfloat/multilingual-e5-small",
    "dimension": 384,
    "loaded": true
  },
  "database": true,
  "ocr": true
}
```

---

### Embeddings (`/api/embeddings`)

#### Generate Embedding

**POST** `/api/embeddings/generate`

Generate embedding for a candidate or job.

**Request:**
```json
{
  "entity_type": "candidate",
  "entity_id": "uuid-string",
  "text_content": "Main CV text or job description...",
  "skills_text": "JavaScript, Python, React...",
  "experience_text": "5 years at Company X...",
  "requirements_text": null,
  "store": true
}
```

**Response:**
```json
{
  "entity_id": "uuid-string",
  "entity_type": "candidate",
  "embedding_dimension": 384,
  "stored": true,
  "content_hash": "abc123..."
}
```

#### Bulk Generate

**POST** `/api/embeddings/bulk-generate`

Generate embeddings for multiple entities.

**Request:**
```json
{
  "entity_type": "candidate",
  "entities": [
    {
      "entity_id": "uuid-1",
      "text_content": "CV text 1..."
    },
    {
      "entity_id": "uuid-2",
      "text_content": "CV text 2..."
    }
  ]
}
```

**Response:**
```json
{
  "processed": 2,
  "failed": 0,
  "errors": []
}
```

#### Get Embedding Info

**GET** `/api/embeddings/candidate/{candidate_id}`

Get metadata for a candidate's embedding.

**Response:**
```json
{
  "entity_id": "uuid-string",
  "entity_type": "candidate",
  "model": "intfloat/multilingual-e5-small",
  "content_hash": "abc123...",
  "created_at": "2024-12-01T10:00:00Z",
  "updated_at": "2024-12-01T10:00:00Z"
}
```

#### Delete Embedding

**DELETE** `/api/embeddings/candidate/{candidate_id}`

---

### OCR (`/api/ocr`)

#### Process Document (Base64)

**POST** `/api/ocr/process`

Process a base64-encoded document.

**Request:**
```json
{
  "file_content": "base64-encoded-content...",
  "file_type": "pdf",
  "language": "eng",
  "extract_structured": true
}
```

**Response:**
```json
{
  "text": "Extracted text from document...",
  "pages": 2,
  "confidence": 0.95,
  "method": "paddleocr",
  "language": "eng",
  "text_length": 5432,
  "content_hash": "abc123...",
  "structured_data": {
    "personal_info": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "work_experience": [...],
    "education": [...],
    "skills": [...]
  }
}
```

#### Process Upload

**POST** `/api/ocr/process-upload`

Process an uploaded file (multipart/form-data).

| Parameter | Type | Description |
|-----------|------|-------------|
| file | File | Uploaded file |
| language | String | OCR language (default: "eng") |
| extract_structured | Boolean | Extract structured data (default: true) |

#### Get Supported Formats

**GET** `/api/ocr/formats`

```json
{
  "formats": ["pdf", "png", "jpg", "jpeg", "tiff", "bmp", "gif", "webp"],
  "mime_types": {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg"
  }
}
```

#### Get Supported Languages

**GET** `/api/ocr/languages`

```json
{
  "languages": [
    {"code": "eng", "name": "English"},
    {"code": "deu", "name": "German"},
    {"code": "tur", "name": "Turkish"}
  ],
  "note": "Multiple languages can be combined: eng+deu"
}
```

---

### Matching (`/api/matching`)

#### Semantic Match

**POST** `/api/matching/semantic`

Find matching candidates for a job using semantic similarity + criteria scoring.

**Request:**
```json
{
  "job_posting_id": "uuid-string",
  "min_score": 50.0,
  "limit": 20,
  "include_breakdown": true,
  "exclude_disqualified": false
}
```

**Response:**
```json
{
  "job_posting_id": "uuid-string",
  "total_matches": 15,
  "matches": [
    {
      "candidate_id": "uuid-1",
      "job_posting_id": "uuid-string",
      "cosine_similarity": 0.85,
      "criteria_score": 75,
      "criteria_max_score": 100,
      "combined_score": 82.0,
      "rank": 1,
      "score_breakdown": {
        "semantic": 34.0,
        "criteria": 48.0
      },
      "matched_criteria": [
        {"type": "skill", "value": "JavaScript", "points": 20},
        {"type": "experience", "value": "5 years", "points": 15}
      ],
      "missing_criteria": [
        {"type": "certification", "value": "AWS", "points": 10}
      ],
      "disqualified": false
    }
  ]
}
```

#### Single Match

**POST** `/api/matching/single`

Calculate match for a single candidate-job pair.

**Request:**
```json
{
  "candidate_id": "uuid-string",
  "job_posting_id": "uuid-string"
}
```

#### Semantic Search

**POST** `/api/matching/search`

Search candidates using natural language.

**Request:**
```json
{
  "query": "senior Java developer with AWS experience",
  "limit": 20,
  "min_similarity": 0.3
}
```

**Response:**
```json
{
  "query": "senior Java developer with AWS experience",
  "total_results": 12,
  "results": [
    {"candidate_id": "uuid-1", "similarity": 0.92},
    {"candidate_id": "uuid-2", "similarity": 0.87}
  ]
}
```

#### Get Stored Results

**GET** `/api/matching/results/{job_posting_id}?limit=50&min_score=0`

Get cached match results.

---

### Scoring (`/api/scoring`)

#### Get Criteria

**GET** `/api/scoring/criteria/{job_posting_id}`

Get scoring criteria for a job.

**Response:**
```json
{
  "job_posting_id": "uuid-string",
  "criteria_count": 5,
  "total_max_points": 100,
  "criteria": [
    {
      "id": "uuid-1",
      "criteria_type": "skill",
      "criteria_value": "JavaScript",
      "points": 20,
      "is_required": true,
      "weight": 1.0
    },
    {
      "id": "uuid-2",
      "criteria_type": "experience",
      "criteria_value": null,
      "points": 0,
      "is_required": false,
      "min_value": 3,
      "per_unit_points": 5,
      "max_points": 25
    }
  ]
}
```

#### Set Criteria

**POST** `/api/scoring/criteria`

Define scoring criteria for a job.

**Request:**
```json
{
  "job_posting_id": "uuid-string",
  "criteria": [
    {
      "criteria_type": "skill",
      "criteria_value": "JavaScript",
      "points": 20,
      "is_required": true,
      "weight": 1.0
    },
    {
      "criteria_type": "experience",
      "min_value": 3,
      "per_unit_points": 5,
      "max_points": 25
    }
  ],
  "replace_existing": true
}
```

#### Calculate Score

**POST** `/api/scoring/calculate`

Calculate criteria score for a candidate.

**Request:**
```json
{
  "job_posting_id": "uuid-string",
  "candidate_data": {
    "skills": ["JavaScript", "Python", "React"],
    "experience_years": 5,
    "certifications": ["AWS Certified"],
    "languages": ["en", "de"]
  }
}
```

**Response:**
```json
{
  "total_points": 75,
  "max_points": 100,
  "percentage": 75.0,
  "matched_criteria": [
    {"type": "skill", "value": "JavaScript", "points": 20}
  ],
  "missing_criteria": [
    {"type": "certification", "value": "PMP", "points": 10}
  ],
  "disqualified": false,
  "disqualification_reason": null
}
```

---

## Models

### Embedding Model

Located at: `app/models/embeddings.py`

```python
class EmbeddingModel:
    def __init__(
        self,
        model_name: str = "intfloat/multilingual-e5-small",
        normalize: bool = True
    ):
        self.model = SentenceTransformer(model_name)
        self.dimension = 384  # Model output dimension

    def encode(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings for texts."""
        return self.model.encode(texts, normalize_embeddings=self.normalize)

    def encode_single(self, text: str) -> np.ndarray:
        """Generate embedding for single text."""
        return self.encode([text])[0]
```

**Key Features:**
- Model: `intfloat/multilingual-e5-small` (100+ languages)
- Dimension: 384
- Normalization: Enabled for cosine similarity
- Batch processing: Supported for efficiency

### OCR Processor

Located at: `app/models/ocr.py`

```python
class OCRProcessor:
    def __init__(
        self,
        engine: str = "paddleocr",
        default_language: str = "en",
        table_detection: bool = True,
        layout_analysis: bool = True,
        use_angle_cls: bool = True
    ):
        # Initialize PaddleOCR or Tesseract based on engine

    def extract_text(
        self,
        file_content: bytes,
        file_type: str,
        language: str = None
    ) -> Dict[str, Any]:
        """Extract text from document."""

    def extract_structured_data(self, text: str) -> Dict[str, Any]:
        """Extract structured CV data from text."""
```

**OCR Engine Comparison:**

| Feature | PaddleOCR | Tesseract |
|---------|-----------|-----------|
| Speed | Fast | Moderate |
| Accuracy | High | High |
| Table Detection | Yes | Limited |
| Angle Detection | Yes | No |
| Layout Analysis | Yes | Limited |
| Languages | 80+ | 100+ |
| Memory Usage | Higher | Lower |

---

## Services

### Embedding Service

Located at: `app/services/embedding_service.py`

**Key Methods:**

| Method | Description |
|--------|-------------|
| `generate_candidate_embedding` | Generate and store candidate embedding |
| `generate_job_embedding` | Generate and store job embedding |
| `bulk_generate_candidate_embeddings` | Batch process candidates |
| `get_candidate_embedding` | Retrieve embedding metadata |
| `delete_candidate_embedding` | Remove embedding |

**Embedding Strategy:**
- **Candidates:** 4 embeddings stored
  - `cv_text_embedding` - Full CV text
  - `skills_embedding` - Skills section
  - `experience_embedding` - Work experience
  - `combined_embedding` - Weighted combination
- **Jobs:** 3 embeddings stored
  - `description_embedding` - Job description
  - `requirements_embedding` - Requirements
  - `combined_embedding` - Weighted combination

### Matching Service

Located at: `app/services/matching_service.py`

**Key Methods:**

| Method | Description |
|--------|-------------|
| `find_matches` | Find candidates for a job |
| `calculate_single_match` | Match one candidate-job pair |
| `semantic_search_query` | Natural language search |
| `store_match_result` | Cache match result |

**Scoring Formula:**
```
combined_score = (semantic_weight * cosine_similarity * 100) +
                 (criteria_weight * criteria_percentage)

Default weights:
- semantic_weight = 0.4
- criteria_weight = 0.6
```

### Scoring Service

Located at: `app/services/scoring_service.py`

**Key Methods:**

| Method | Description |
|--------|-------------|
| `get_criteria` | Get job scoring criteria |
| `set_criteria` | Define scoring criteria |
| `calculate_score` | Calculate candidate score |
| `add_criterion` | Add single criterion |
| `delete_criterion` | Remove criterion |

**Criteria Types:**
| Type | Fields | Description |
|------|--------|-------------|
| `skill` | value, points, is_required | Points for having skill |
| `language` | value, points | Points for language proficiency |
| `certification` | value, points, is_required | Points for certification |
| `experience` | min_value, per_unit_points, max_points | Points per year |
| `education` | value, points | Points for degree level |
| `custom` | value, points | Custom criteria |

---

## Database Schema (PostgreSQL)

### candidate_embeddings

```sql
CREATE TABLE candidate_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL UNIQUE,
    cv_text_embedding vector(384),
    skills_embedding vector(384),
    experience_embedding vector(384),
    combined_embedding vector(384),
    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidate_combined_embedding
ON candidate_embeddings USING ivfflat (combined_embedding vector_cosine_ops);
```

### job_embeddings

```sql
CREATE TABLE job_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL UNIQUE,
    description_embedding vector(384),
    requirements_embedding vector(384),
    combined_embedding vector(384),
    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### scoring_criteria

```sql
CREATE TABLE scoring_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL,
    criteria_type VARCHAR(50) NOT NULL,
    criteria_value VARCHAR(255),
    points INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT FALSE,
    weight DECIMAL(3,2) DEFAULT 1.0,
    min_value INTEGER,
    per_unit_points DECIMAL(5,2),
    max_points INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### semantic_match_results

```sql
CREATE TABLE semantic_match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL,
    job_posting_id UUID NOT NULL,
    cosine_similarity DECIMAL(5,4),
    criteria_score INTEGER,
    criteria_max_score INTEGER,
    combined_score DECIMAL(5,2),
    rank INTEGER,
    score_breakdown JSONB,
    matched_criteria JSONB,
    missing_criteria JSONB,
    disqualified BOOLEAN DEFAULT FALSE,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(candidate_id, job_posting_id)
);
```

---

## Running Locally

### Prerequisites

- Python 3.10+
- PostgreSQL 14+ with pgvector extension
- Tesseract OCR (for fallback)
- poppler-utils (for PDF processing)

### Setup

```bash
cd python-ml-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Set environment variables (or create .env file)
export POSTGRES_HOST=localhost
export POSTGRES_PASSWORD=your_password

# Initialize database schema
psql -U postgres -d cv_sorting -f ../infrastructure/postgresql/schema-vectors.sql

# Run service
python -m uvicorn app.main:app --reload --port 8000
```

### API Documentation

Once running, access:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI spec: http://localhost:8000/openapi.json
