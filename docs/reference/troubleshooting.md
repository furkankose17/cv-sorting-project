# Troubleshooting Guide

Common issues and solutions for the CV Sorting application.

---

## CAP Service Issues

### Service Won't Start

**Symptom:** `npm run watch` fails or service doesn't respond.

**Solutions:**

1. **Clear dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check port availability:**
   ```bash
   lsof -i :4004
   # Kill if occupied
   kill -9 <PID>
   ```

3. **Verify CDS version:**
   ```bash
   npx cds --version
   # Should be 7.x
   ```

4. **Check for CDS errors:**
   ```bash
   npx cds compile srv/services.cds
   ```

### Database Connection Failed

**Symptom:** "Database not available" or HANA connection errors.

**Solutions:**

1. **Development (SQLite):** Ensure `[development]` profile is active:
   ```bash
   npm run watch
   # NOT: npm start
   ```

2. **Production (HANA):** Check binding:
   ```bash
   cf service-key cv-sorting-db cv-sorting-db-key
   ```

3. **Hybrid mode:** Deploy schema first:
   ```bash
   cds deploy --to hana --profile hybrid
   ```

### Authentication Errors

**Symptom:** 401/403 errors on API calls.

**Solutions:**

1. **Development mode:** Use mocked users
   - Username: `admin`
   - Password: `admin`

2. **Check auth configuration:**
   ```json
   // package.json
   "cds": {
     "requires": {
       "[development]": {
         "auth": { "kind": "mocked" }
       }
     }
   }
   ```

3. **Production:** Verify XSUAA binding:
   ```bash
   cf services | grep xsuaa
   cf service-key cv-sorting-auth cv-sorting-auth-key
   ```

### Draft Errors

**Symptom:** "Draft not found" or "Cannot edit active entity."

**Solutions:**

1. **Cancel stale draft:**
   ```
   DELETE /api/candidates/Candidates(ID='...',IsActiveEntity=false)
   ```

2. **Check draft status:**
   ```
   GET /api/candidates/Candidates?$filter=IsActiveEntity eq false
   ```

3. **Ensure draft-enabled:**
   ```cds
   @odata.draft.enabled
   entity Candidates as projection on db.Candidates
   ```

---

## Python ML Service Issues

### Service Won't Start

**Symptom:** `uvicorn` fails or import errors.

**Solutions:**

1. **Verify Python version:**
   ```bash
   python --version
   # Requires 3.10+
   ```

2. **Recreate virtual environment:**
   ```bash
   rm -rf venv
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Check for missing dependencies:**
   ```bash
   pip check
   ```

4. **Start with verbose logging:**
   ```bash
   LOG_LEVEL=DEBUG python -m uvicorn app.main:app --reload
   ```

### Embedding Model Loading Fails

**Symptom:** "Failed to load embedding model" on startup.

**Solutions:**

1. **Check model name:**
   ```bash
   # In .env
   EMBEDDING_MODEL=intfloat/multilingual-e5-small
   ```

2. **Download model manually:**
   ```python
   from sentence_transformers import SentenceTransformer
   model = SentenceTransformer("intfloat/multilingual-e5-small")
   ```

3. **Check disk space:** Model requires ~500MB.

4. **Use offline mode if model cached:**
   ```bash
   export TRANSFORMERS_OFFLINE=1
   ```

### OCR Not Working

**Symptom:** "OCR processor not available" or empty text extraction.

**Solutions:**

1. **Tesseract issues:**
   ```bash
   # Verify installation
   which tesseract
   tesseract --version

   # Test directly
   tesseract test.png stdout

   # Set path if needed
   export TESSERACT_CMD=/usr/local/bin/tesseract
   ```

2. **PaddleOCR issues:**
   ```bash
   # Check installation
   python -c "from paddleocr import PaddleOCR; print('OK')"

   # Reinstall if needed
   pip uninstall paddleocr paddlepaddle
   pip install paddlepaddle paddleocr
   ```

3. **PDF issues (poppler):**
   ```bash
   # macOS
   brew install poppler

   # Linux
   apt-get install poppler-utils

   # Set path
   export POPPLER_PATH=/usr/local/bin
   ```

4. **Fall back to Tesseract:**
   ```bash
   export OCR_ENGINE=tesseract
   ```

### PostgreSQL Connection Failed

**Symptom:** "Failed to connect to PostgreSQL" or pgvector errors.

**Solutions:**

1. **Check PostgreSQL running:**
   ```bash
   docker ps | grep postgres
   # or
   pg_isready -h localhost -p 5432
   ```

2. **Verify credentials:**
   ```bash
   psql -h localhost -U postgres -d cv_sorting
   ```

3. **Check pgvector extension:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'vector';
   -- If missing:
   CREATE EXTENSION vector;
   ```

4. **Initialize schema:**
   ```bash
   psql -U postgres -d cv_sorting -f infrastructure/postgresql/schema-vectors.sql
   ```

5. **Check environment variables:**
   ```bash
   echo $POSTGRES_HOST $POSTGRES_PORT $POSTGRES_USER
   ```

---

## Integration Issues

### CAP Cannot Reach ML Service

**Symptom:** "ML service unavailable" or connection timeout.

**Solutions:**

1. **Verify ML service running:**
   ```bash
   curl http://localhost:8000/health
   ```

2. **Check destination configuration:**
   - Development: Set `ML_SERVICE_URL` in environment
   - Production: Verify BTP destination

3. **Test direct connection:**
   ```javascript
   // In CAP handler
   const response = await fetch('http://localhost:8000/health');
   console.log(await response.json());
   ```

4. **Check CORS configuration:**
   ```python
   # In Python config
   ALLOWED_ORIGINS="*"  # For development
   ```

### Embedding Generation Fails

**Symptom:** Embeddings not stored or match scores are zero.

**Solutions:**

1. **Check embedding exists:**
   ```sql
   SELECT candidate_id, content_hash, created_at
   FROM candidate_embeddings
   WHERE candidate_id = 'uuid-here';
   ```

2. **Verify text content not empty:**
   ```sql
   SELECT ID, extractedText
   FROM CVDocuments
   WHERE ID = 'document-uuid';
   ```

3. **Regenerate embedding:**
   ```bash
   curl -X POST http://localhost:8000/api/embeddings/generate \
     -H "Content-Type: application/json" \
     -d '{"entity_type": "candidate", "entity_id": "uuid", "text_content": "..."}'
   ```

4. **Check ML service logs for errors.

### Match Scores Always Zero

**Symptom:** All candidates have 0 match score.

**Solutions:**

1. **Verify job embedding exists:**
   ```sql
   SELECT * FROM job_embeddings WHERE job_posting_id = 'uuid';
   ```

2. **Verify candidate embeddings exist:**
   ```sql
   SELECT COUNT(*) FROM candidate_embeddings;
   ```

3. **Check scoring criteria defined:**
   ```sql
   SELECT * FROM scoring_criteria WHERE job_posting_id = 'uuid';
   ```

4. **Test semantic similarity directly:**
   ```sql
   SELECT
     ce.candidate_id,
     1 - (ce.combined_embedding <=> je.combined_embedding) as similarity
   FROM candidate_embeddings ce, job_embeddings je
   WHERE je.job_posting_id = 'job-uuid'
   ORDER BY similarity DESC
   LIMIT 10;
   ```

---

## Fiori App Issues

### App Doesn't Load

**Symptom:** Blank page or 404 errors.

**Solutions:**

1. **Check CAP service running:**
   ```bash
   curl http://localhost:4004/index.html
   ```

2. **Verify fiori configuration:**
   ```json
   // package.json
   "cds": {
     "[development]": {
       "server": {
         "app": true
       }
     }
   }
   ```

3. **Check browser console for errors.**

4. **Clear browser cache and reload.**

### OData Errors in App

**Symptom:** "Cannot read data" or binding errors.

**Solutions:**

1. **Verify service metadata:**
   ```
   GET http://localhost:4004/api/candidates/$metadata
   ```

2. **Check entity set name matches:**
   ```xml
   <!-- In view -->
   items="{/Candidates}"  <!-- Must match service -->
   ```

3. **Verify model name:**
   ```xml
   <!-- In manifest.json -->
   "dataSource": "mainService"
   <!-- In view -->
   items="{mainService>/Candidates}"
   ```

### Actions Not Working

**Symptom:** Action buttons do nothing or return errors.

**Solutions:**

1. **Check action binding:**
   ```javascript
   // Verify context is bound
   const oContext = this.getView().getBindingContext();
   console.log(oContext?.getPath());
   ```

2. **Verify action exists in service:**
   ```
   GET http://localhost:4004/api/candidates/$metadata
   <!-- Look for Action element -->
   ```

3. **Check action parameters:**
   ```javascript
   oOperation.setParameter("newStatus", "interviewing");
   // Parameter names must match CDS definition
   ```

---

## Deployment Issues

### MTA Build Fails

**Symptom:** `mbt build` errors.

**Solutions:**

1. **Install MTA build tool:**
   ```bash
   npm install -g mbt
   ```

2. **Clean before build:**
   ```bash
   npm run clean
   mbt build
   ```

3. **Check mta.yaml syntax:**
   ```bash
   mbt validate
   ```

### CF Deploy Fails

**Symptom:** `cf deploy` errors.

**Solutions:**

1. **Login to CF:**
   ```bash
   cf login -a <api-endpoint>
   cf target -o <org> -s <space>
   ```

2. **Check service availability:**
   ```bash
   cf marketplace
   cf services
   ```

3. **View deploy logs:**
   ```bash
   cf deploy --verbose
   cf logs cv-sorting-srv --recent
   ```

4. **Check memory quota:**
   ```bash
   cf org-quota
   cf space-quota
   ```

---

## Performance Issues

### Slow Match Calculation

**Symptom:** Matching takes too long.

**Solutions:**

1. **Check index exists:**
   ```sql
   SELECT * FROM pg_indexes WHERE tablename = 'candidate_embeddings';
   ```

2. **Create IVFFlat index:**
   ```sql
   CREATE INDEX idx_candidate_combined
   ON candidate_embeddings
   USING ivfflat (combined_embedding vector_cosine_ops)
   WITH (lists = 100);
   ```

3. **Limit search scope:**
   ```javascript
   // Use filters to reduce candidates
   findSemanticMatches({
     jobPostingId,
     minScore: 50,  // Filter low scores
     limit: 50      // Limit results
   });
   ```

### Slow OCR Processing

**Symptom:** Document processing takes minutes.

**Solutions:**

1. **Use PaddleOCR instead of Tesseract:**
   ```bash
   export OCR_ENGINE=paddleocr
   ```

2. **Reduce image resolution before OCR.**

3. **Skip structured extraction for large documents:**
   ```json
   {"extract_structured": false}
   ```

4. **Process documents asynchronously.

### Memory Issues

**Symptom:** Service crashes with OOM errors.

**Solutions:**

1. **Increase memory allocation:**
   ```yaml
   # mta.yaml
   parameters:
     memory: 2048M
   ```

2. **Limit batch sizes:**
   ```bash
   export EMBEDDING_BATCH_SIZE=16
   ```

3. **Monitor memory:**
   ```bash
   cf app cv-sorting-srv
   docker stats cv-sorting-postgres
   ```

---

## Logging and Debugging

### Enable Debug Logging

**CAP:**
```json
// package.json
"cds": {
  "log": {
    "levels": {
      "[development]": {
        "cds": "debug",
        "db": "info"
      }
    }
  }
}
```

**Python:**
```bash
export LOG_LEVEL=DEBUG
```

### View Logs

**Local:**
```bash
# CAP - terminal output
npm run watch

# Python - terminal output
uvicorn app.main:app --log-level debug
```

**BTP:**
```bash
cf logs cv-sorting-srv --recent
cf logs cv-sorting-ml-service --recent
```

### Health Check Endpoints

| Service | Endpoint |
|---------|----------|
| CAP | `GET /api/jobs/healthCheck()` |
| Python ML | `GET /health` |
| PostgreSQL | `pg_isready -h host -p 5432` |
