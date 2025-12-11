# Local Development Guide

Step-by-step guide to run the CV Sorting application locally for development.

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.x or 20.x | CAP services, Fiori apps |
| npm | 9.x+ | Package management |
| Python | 3.10+ | ML service |
| PostgreSQL | 14+ | Vector database |
| Docker | 20+ | Optional: n8n, PostgreSQL |

### Optional Software

| Software | Purpose |
|----------|---------|
| SAP Business Application Studio | Cloud IDE alternative |
| CF CLI | BTP deployment |
| mbt | MTA build tool |
| Tesseract | OCR fallback engine |
| poppler-utils | PDF processing |

---

## Quick Start

### 1. Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd cv-sorting-project

# Install Node.js dependencies
npm ci

# Install Python dependencies
cd python-ml-service
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cd ..
```

### 2. Start PostgreSQL (Docker)

```bash
# Start PostgreSQL with pgvector
docker run -d \
  --name cv-sorting-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=cv_sorting \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Initialize schema
docker exec -i cv-sorting-postgres psql -U postgres -d cv_sorting < infrastructure/postgresql/schema-vectors.sql
```

### 3. Configure Environment

Create `.env` file in project root:

```bash
# Python ML Service
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=cv_sorting
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
EMBEDDING_MODEL=intfloat/multilingual-e5-small
OCR_ENGINE=tesseract
LOG_LEVEL=DEBUG
```

### 4. Start Services

**Terminal 1 - CAP Service:**
```bash
npm run watch
# Runs on http://localhost:4004
```

**Terminal 2 - Python ML Service:**
```bash
cd python-ml-service
source venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
# Runs on http://localhost:8000
```

### 5. Access Applications

| Application | URL |
|-------------|-----|
| CAP Service | http://localhost:4004 |
| CandidateService | http://localhost:4004/api/candidates |
| JobService | http://localhost:4004/api/jobs |
| AIService | http://localhost:4004/api/ai |
| Python ML API Docs | http://localhost:8000/docs |
| Fiori Launchpad | http://localhost:4004/index.html |

---

## Detailed Setup

### CAP Service Configuration

**package.json cds configuration:**

```json
{
  "cds": {
    "requires": {
      "[development]": {
        "db": {
          "kind": "sqlite",
          "credentials": {
            "database": ":memory:"
          }
        },
        "auth": {
          "kind": "mocked",
          "users": {
            "admin": {
              "password": "admin",
              "roles": ["CVAdmin", "Recruiter", "HRManager", "JobManager", "Viewer"]
            },
            "recruiter": {
              "password": "recruiter",
              "roles": ["Recruiter", "Viewer"]
            }
          }
        }
      }
    }
  }
}
```

### Mocked Authentication

In development mode, use mocked users:

| User | Password | Roles |
|------|----------|-------|
| admin | admin | CVAdmin, Recruiter, HRManager, JobManager, Viewer |
| recruiter | recruiter | Recruiter, Viewer |
| manager | manager | HRManager, Viewer |
| viewer | viewer | Viewer |

**Login via basic auth or UI:**
```
Username: admin
Password: admin
```

### SQLite vs HANA

Development uses SQLite in-memory database:

```javascript
// Seed data automatically loaded from db/data/*.csv
// No HANA connection required locally
```

To test with HANA locally:
```bash
# Requires HANA Cloud instance
cds deploy --to hana --profile hybrid
cds watch --profile hybrid
```

---

### Python ML Service Configuration

**Environment Variables:**

```bash
# app/config.py defaults (override via environment)

# Application
APP_NAME="CV Sorting ML Service"
ENVIRONMENT="development"
DEBUG=true
LOG_LEVEL="DEBUG"

# Embedding Model
EMBEDDING_MODEL="intfloat/multilingual-e5-small"
EMBEDDING_DIMENSION=384

# PostgreSQL
POSTGRES_HOST="localhost"
POSTGRES_PORT=5432
POSTGRES_DB="cv_sorting"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD=""

# OCR
OCR_ENGINE="tesseract"  # or "paddleocr"
TESSERACT_CMD="tesseract"

# Matching
SEMANTIC_WEIGHT=0.4
CRITERIA_WEIGHT=0.6
```

### Installing OCR Engines

**Tesseract (recommended for local dev):**

```bash
# macOS
brew install tesseract

# Ubuntu/Debian
sudo apt-get install tesseract-ocr

# Windows
# Download installer from: https://github.com/UB-Mannheim/tesseract/wiki
```

**PaddleOCR (production):**

```bash
# Requires additional dependencies
pip install paddlepaddle paddleocr
```

---

### PostgreSQL Setup

**Option 1: Docker (recommended)**

```bash
# Start PostgreSQL with pgvector
docker run -d \
  --name cv-sorting-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=cv_sorting \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Connect and verify
docker exec -it cv-sorting-postgres psql -U postgres -d cv_sorting

# Initialize schema
\i /path/to/infrastructure/postgresql/schema-vectors.sql
```

**Option 2: Local Installation**

```bash
# Install PostgreSQL 14+
# Install pgvector extension
# Create database

psql -U postgres
CREATE DATABASE cv_sorting;
\c cv_sorting
CREATE EXTENSION vector;
\i infrastructure/postgresql/schema-vectors.sql
```

---

### n8n Setup (Optional)

**Docker:**

```bash
docker run -d \
  --name cv-sorting-n8n \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=admin \
  n8nio/n8n

# Access: http://localhost:5678
# Login: admin / admin
```

**Import Workflows:**

1. Open n8n UI
2. Go to Workflows → Import
3. Import `infrastructure/n8n/cv-email-capture.json`
4. Import `infrastructure/n8n/match-notification.json`
5. Configure credentials

---

## Development Workflows

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- test/candidate-service.test.js

# Watch mode
npm run test:watch
```

### Linting

```bash
# CDS lint
npm run lint

# Fix issues
npx cds lint --fix
```

### Building

```bash
# Build CDS for production
npm run build

# Build MTA archive
npm run build:cf

# Clean build artifacts
npm run clean
```

---

## Debugging

### CAP Service Debugging

**VS Code launch.json:**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug CAP",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["cds", "watch"],
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Python ML Service Debugging

**VS Code launch.json:**

```json
{
  "name": "Debug Python ML",
  "type": "python",
  "request": "launch",
  "module": "uvicorn",
  "args": ["app.main:app", "--reload", "--port", "8000"],
  "cwd": "${workspaceFolder}/python-ml-service",
  "envFile": "${workspaceFolder}/.env"
}
```

### Logging

**CAP Logging:**
```javascript
// Set in package.json or environment
// LOG_LEVEL: debug, info, warn, error

// In handlers
const cds = require('@sap/cds');
const LOG = cds.log('my-handler');
LOG.debug('Debug message', { context: data });
LOG.info('Info message');
LOG.error('Error', error);
```

**Python Logging:**
```python
import logging
logger = logging.getLogger(__name__)
logger.debug('Debug message')
logger.info('Info message')
logger.error('Error', exc_info=True)
```

---

## Common Tasks

### Adding a New Entity

1. Define in `db/schema.cds`
2. Add to service in `srv/services.cds`
3. Implement handler in `srv/handlers/`
4. Add seed data in `db/data/`
5. Update annotations for UI

### Adding a New API Endpoint

**CAP (CDS):**
```cds
// In services.cds
action myNewAction(param: String) returns String;
function myNewFunction(param: String) returns String;
```

**Python:**
```python
# In api/routes/
@router.post("/my-endpoint")
async def my_endpoint(request: MyRequest):
    return {"result": "data"}
```

### Testing API Endpoints

**CAP with curl:**
```bash
# GET request
curl http://localhost:4004/api/candidates/Candidates

# POST action
curl -X POST http://localhost:4004/api/candidates/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{"fileName": "test.pdf", "mediaType": "application/pdf", "fileContent": "base64..."}'
```

**Python with curl:**
```bash
curl -X POST http://localhost:8000/api/ocr/process \
  -H "Content-Type: application/json" \
  -d '{"file_content": "base64...", "file_type": "pdf"}'
```

---

## Troubleshooting Development Issues

### CAP Won't Start

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm ci

# Check CDS version
npx cds --version

# Verify ports not in use
lsof -i :4004
```

### Python ML Service Won't Start

```bash
# Verify Python version
python --version  # Should be 3.10+

# Recreate virtual environment
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Check PostgreSQL connection
psql -h localhost -U postgres -d cv_sorting
```

### PostgreSQL Connection Failed

```bash
# Check Docker container running
docker ps | grep postgres

# Check connection
psql -h localhost -p 5432 -U postgres -d cv_sorting

# Reset Docker container
docker stop cv-sorting-postgres
docker rm cv-sorting-postgres
# Restart with docker run command
```

### OCR Not Working

```bash
# Verify Tesseract installed
which tesseract
tesseract --version

# Test OCR directly
tesseract test.png output

# Check Python can import
python -c "import pytesseract; print(pytesseract.get_tesseract_version())"
```
