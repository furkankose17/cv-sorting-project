# CV Sorting ML Service

FastAPI-based ML microservice for the CV Sorting application. Provides embedding generation, semantic matching, OCR processing, and criteria-based scoring.

## Features

- **Embeddings**: Generate 384-dimensional vectors using `intfloat/multilingual-e5-small` (supports 100+ languages including English, German, Turkish, French, Spanish)
- **Semantic Matching**: pgvector-powered similarity search with cosine distance
- **OCR**: Extract text from PDFs and images using Tesseract (multilingual)
- **Scoring**: Criteria-based candidate evaluation with configurable rules

## Requirements

- Python 3.11+
- PostgreSQL 15+ with [pgvector](https://github.com/pgvector/pgvector) extension
- Tesseract OCR (for document processing)

## Quick Start

### Local Development

```bash
# Navigate to service directory
cd python-ml-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Start the service
uvicorn app.main:app --reload --port 8000
```

### Install Tesseract (macOS)

```bash
brew install tesseract tesseract-lang poppler
```

### Install Tesseract (Ubuntu)

```bash
sudo apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-tur poppler-utils
```

## API Documentation

Once running, access the interactive API docs:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Health Checks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/live` | GET | Liveness probe |
| `/health/ready` | GET | Readiness with component status |
| `/health/info` | GET | Service information |

### Embeddings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/embeddings/generate` | POST | Generate embedding for entity |
| `/api/embeddings/bulk-generate` | POST | Batch embedding generation |
| `/api/embeddings/candidate/{id}` | GET | Get candidate embedding info |
| `/api/embeddings/candidate/{id}` | DELETE | Delete candidate embedding |

### Semantic Matching

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/matching/semantic` | POST | Find matching candidates for job |
| `/api/matching/single` | POST | Calculate single candidate-job match |
| `/api/matching/search` | POST | Semantic search by query text |

### OCR Processing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ocr/process` | POST | Process document (base64) |
| `/api/ocr/process-upload` | POST | Process uploaded file |
| `/api/ocr/formats` | GET | Get supported file formats |
| `/api/ocr/languages` | GET | Get supported languages |

### Scoring Criteria

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scoring/criteria/{job_id}` | GET | Get scoring criteria |
| `/api/scoring/criteria` | POST | Set scoring criteria |
| `/api/scoring/calculate` | POST | Calculate candidate score |
| `/api/scoring/templates` | GET | Get criteria templates |

## Configuration

### Environment Variables

```bash
# Application
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=INFO

# ML Model
EMBEDDING_MODEL=intfloat/multilingual-e5-small
EMBEDDING_DIMENSION=384
EMBEDDING_CACHE_ENABLED=true

# PostgreSQL (with pgvector)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=cv_sorting
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password

# OCR
OCR_ENGINE=tesseract
TESSERACT_CMD=/usr/bin/tesseract

# CAP Service (optional)
CAP_SERVICE_URL=http://localhost:4004
```

## Database Setup

Initialize the database schema:

```bash
# Connect to PostgreSQL and run:
psql -U postgres -d cv_sorting -f db/init.sql
```

Or programmatically:

```python
from app.db.postgres import PostgresPool, init_database
import asyncio

async def setup():
    pool = PostgresPool()
    await pool.connect()
    await init_database(pool)

asyncio.run(setup())
```

## Testing

```bash
# Run all tests
pytest

# Run unit tests only
pytest tests/unit -v

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test
pytest tests/unit/test_utils.py -v
```

## BTP Deployment

### Prerequisites

1. Cloud Foundry CLI installed
2. Logged into your BTP subaccount
3. PostgreSQL service with pgvector extension

### Deploy

```bash
# Create PostgreSQL service (if not exists)
cf create-service postgresql-db standard cv-sorting-postgresql

# Deploy the service
cf push -f manifest.yaml

# Initialize database schema
cf ssh cv-sorting-ml-service -c "cd /home/vcap/app && python -c 'from app.db.postgres import PostgresPool, init_database; import asyncio; asyncio.run(init_database(PostgresPool()))'"

# View logs
cf logs cv-sorting-ml-service --recent
```

### Scaling

```bash
# Scale to 2 instances
cf scale cv-sorting-ml-service -i 2

# Increase memory if needed
cf scale cv-sorting-ml-service -m 3G
```

## Architecture

```
python-ml-service/
├── app/
│   ├── main.py              # FastAPI application entry
│   ├── config.py            # Configuration management
│   ├── api/routes/          # API endpoint handlers
│   │   ├── embeddings.py
│   │   ├── matching.py
│   │   ├── ocr.py
│   │   ├── scoring.py
│   │   └── health.py
│   ├── services/            # Business logic
│   │   ├── embedding_service.py
│   │   ├── matching_service.py
│   │   └── scoring_service.py
│   ├── models/              # ML models
│   │   ├── embeddings.py    # Sentence Transformers
│   │   └── ocr.py           # Tesseract OCR
│   ├── db/
│   │   └── postgres.py      # PostgreSQL + pgvector
│   ├── utils/               # Utilities
│   │   ├── cache.py         # Embedding cache
│   │   ├── retry.py         # Retry logic
│   │   └── vcap.py          # CF service bindings
│   ├── clients/
│   │   └── cap_client.py    # CAP service client
│   └── middleware/
│       └── timeout.py       # Request timeout
├── tests/
│   ├── conftest.py          # Test fixtures
│   ├── unit/
│   └── integration/
├── db/
│   └── init.sql             # Database schema
├── manifest.yaml            # CF deployment config
├── requirements.txt         # Python dependencies
└── Aptfile                  # System packages for CF
```

## Integration with CAP Service

The ML service integrates with the SAP CAP backend:

1. **CAP → ML**: CAP service calls ML endpoints for:
   - Embedding generation on CV upload
   - Semantic matching in batchMatch
   - OCR processing for documents

2. **ML → CAP**: ML service can fetch candidate/job data from CAP for:
   - Criteria-based scoring (needs full candidate profile)
   - Match result storage

Configure the CAP service URL:
```bash
CAP_SERVICE_URL=http://localhost:4004
```

## Troubleshooting

### Model Loading Slow

First request may be slow as the model downloads. Set cache directory:
```bash
MODEL_CACHE_DIR=/tmp/model_cache
HF_HOME=/tmp/model_cache
```

### pgvector Not Found

Ensure pgvector extension is installed:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Tesseract Not Found

Check Tesseract installation:
```bash
tesseract --version
which tesseract
```

### Memory Issues

Increase memory allocation:
- Local: Ensure sufficient RAM (2GB+ recommended)
- BTP: Update manifest.yaml `memory: 3G`

## License

Proprietary - Internal Use Only
