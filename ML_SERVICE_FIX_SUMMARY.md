# ML Service 404 Error Fixes

**Date:** 2025-12-16
**Issue:** ML service was returning 404 errors when called from UI5 frontend (ml-showcase app)

---

## Problems Identified

### 1. Incorrect API Endpoint Paths in ml-showcase App

The ML showcase UI5 app (`app/ml-showcase/webapp/controller/Main.controller.js`) was calling endpoints with incorrect paths:

| Endpoint Type | ❌ Incorrect Path | ✅ Correct Path |
|--------------|-------------------|-----------------|
| Health Check | `/health` | `/health/ready` |
| Semantic Search | `/matching/search` | `/api/matching/search` |
| Similar Candidates | `/matching/similar-candidates` | `/api/matching/similar-candidates` |
| Job Matching | `/matching/semantic` | `/api/matching/semantic` |

**Root Cause:** The `/api` prefix was missing from matching endpoints, causing 404 errors.

### 2. Incorrect Request Parameter Names

- Search endpoint was sending `min_score` instead of `min_similarity`
- Similar candidates endpoint was missing the `min_similarity` parameter

### 3. Incorrect Response Data Structure Handling

- Similar candidates response was looking for `similar_candidates` array instead of `matches`
- Response structure didn't match the actual API response from `/api/matching/similar-candidates`

---

## Fixes Applied

### File: `app/ml-showcase/webapp/controller/Main.controller.js`

#### 1. Health Check Endpoint (Line 81)
```javascript
// Before
const oResult = await this._callMLService("GET", "/health", null);

// After
const oResult = await this._callMLService("GET", "/health/ready", null);
```

#### 2. Semantic Search Endpoint (Line 149-152)
```javascript
// Before
const oResult = await this._callMLService("POST", "/matching/search", {
    query: sQuery,
    min_score: fMinScore,  // ❌ Wrong parameter name
    limit: iLimit
});

// After
const oResult = await this._callMLService("POST", "/api/matching/search", {
    query: sQuery,
    min_similarity: fMinScore,  // ✅ Correct parameter name
    limit: iLimit
});
```

#### 3. Similar Candidates Endpoint (Line 187-190)
```javascript
// Before
const oResult = await this._callMLService("POST", "/matching/similar-candidates", {
    candidate_id: sCandidateId,
    limit: iLimit
});

// After
const oResult = await this._callMLService("POST", "/api/matching/similar-candidates", {
    candidate_id: sCandidateId,
    limit: iLimit,
    min_similarity: 0.3  // ✅ Added missing parameter
});
```

#### 4. Job Matching Endpoint (Line 225)
```javascript
// Before
const oResult = await this._callMLService("POST", "/matching/semantic", {

// After
const oResult = await this._callMLService("POST", "/api/matching/semantic", {
```

#### 5. Similar Candidates Response Handling (Lines 194-204)
```javascript
// Before
const aSimilar = oResult.data.similar_candidates || oResult.data.results || [];

// After
const aSimilar = oResult.data.matches || oResult.data.results || [];  // ✅ Correct field name
const iTotalResults = oResult.data.total_results || aSimilar.length;
```

---

## New Test Tool Created

### Standalone ML Service Test Console

**File:** `python-ml-service/test-ml-service.html`

A beautiful, interactive HTML test console for the ML service with:

#### Features:
- ✅ **Real-time Health Monitoring** - Live status indicator with auto-check on page load
- ✅ **5 Test Sections:**
  1. Health Check (`/health/ready`)
  2. Generate Embeddings (`/api/embeddings/generate`)
  3. Semantic Search (`/api/matching/search`)
  4. Job-Candidate Matching (`/api/matching/semantic`)
  5. Find Similar Candidates (`/api/matching/similar-candidates`)

- ✅ **Pre-filled Test Data** - Ready to use with realistic examples
- ✅ **Live Response Display** - JSON responses with syntax highlighting
- ✅ **Success/Error Indicators** - Color-coded response boxes
- ✅ **Quick Navigation** - Jump to any test section
- ✅ **Modern UI** - Gradient design with smooth animations

#### How to Use:

1. **Ensure ML Service is Running:**
   ```bash
   cd python-ml-service
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Open Test Console:**
   ```bash
   open python-ml-service/test-ml-service.html
   ```
   Or navigate to: `file:///path/to/python-ml-service/test-ml-service.html`

3. **Click Any Test Button:**
   - Health Check - Verify service is running
   - Generate Embedding - Test text vectorization
   - Search Candidates - Test semantic search
   - Job Matching - Test candidate-job matching
   - Similar Candidates - Test similarity search

4. **View Results:**
   - Green box = Success ✅
   - Red box = Error ❌
   - JSON response displayed with formatting

---

## ML Service API Endpoints Reference

All endpoints are documented at: `http://localhost:8000/docs` (FastAPI Swagger UI)

### Health Endpoints
- `GET /health/live` - Basic liveness check
- `GET /health/ready` - Readiness check (includes components)

### Embedding Endpoints
- `POST /api/embeddings/generate` - Generate single embedding
- `POST /api/embeddings/bulk-generate` - Generate multiple embeddings
- `GET /api/embeddings/candidate/{id}` - Get candidate embedding

### Matching Endpoints
- `POST /api/matching/semantic` - Find matching candidates for a job
- `POST /api/matching/single` - Calculate single match score
- `POST /api/matching/search` - Semantic search by query text
- `POST /api/matching/similar-candidates` - Find similar candidates
- `POST /api/matching/store-result` - Store match result
- `GET /api/matching/results/{job_id}` - Get stored results

### OCR Endpoints
- `POST /api/ocr/process` - Process document with OCR

### Scoring Endpoints
- `GET /api/scoring/criteria/{job_id}` - Get scoring criteria
- `POST /api/scoring/criteria` - Set scoring criteria
- `POST /api/scoring/criteria/{job_id}/add` - Add single criterion
- `DELETE /api/scoring/criteria/{job_id}/{criterion_id}` - Delete criterion
- `POST /api/scoring/calculate` - Calculate criteria score
- `GET /api/scoring/templates` - Get criteria templates

---

## Testing Checklist

### ✅ Verified Working

- [x] Health check endpoint (`/health/ready`)
- [x] Generate embeddings endpoint (`/api/embeddings/generate`)
- [x] Semantic search endpoint (`/api/matching/search`)
- [x] ML service is running on port 8000
- [x] ML service has database connection
- [x] ML service has embedding model loaded
- [x] Test HTML console opens and displays correctly

### 🔄 To Test (Manual)

- [ ] Open ml-showcase app in UI5: `http://localhost:4004/ml-showcase`
- [ ] Click "Check Health" button
- [ ] Test embedding generation with sample text
- [ ] Test semantic search with query
- [ ] Test job matching with a valid job ID
- [ ] Test similar candidates with a valid candidate ID

---

## Configuration

The ML service URL is configured in `app/ml-showcase/webapp/Component.js`:

```javascript
mlServiceUrl: window.location.hostname === "localhost"
    ? "http://localhost:8000"      // Development
    : "/ml-api",                    // Production (proxied)
```

- **Development:** Direct connection to `http://localhost:8000`
- **Production:** Proxied through `/ml-api` endpoint (requires proxy configuration)

---

## Troubleshooting

### ML Service Not Responding

**Check if ML service is running:**
```bash
curl http://localhost:8000/health/live
```

**Expected Response:**
```json
{"status":"alive"}
```

**If not running, start it:**
```bash
cd python-ml-service
source venv/bin/activate  # or activate on Windows
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### CORS Errors in Browser

The ML service has CORS middleware configured to allow all origins in development. Check `python-ml-service/app/main.py` lines 189-195.

### Database Connection Issues

Check PostgreSQL connection in ML service logs. The service can run without database for embedding generation, but matching endpoints require database.

### 404 Errors Persist

1. Verify you're using the correct endpoint paths (with `/api` prefix)
2. Check ML service logs for actual routes registered
3. Visit `http://localhost:8000/docs` to see all available endpoints

---

## Files Modified

1. `app/ml-showcase/webapp/controller/Main.controller.js` - Fixed all endpoint paths and parameters
2. `python-ml-service/test-ml-service.html` - Created standalone test console

---

## Next Steps

1. ✅ **Test ml-showcase app** - Open `http://localhost:4004/ml-showcase` and verify all buttons work
2. ✅ **Use test console** - Bookmark `test-ml-service.html` for quick ML service testing
3. ✅ **Check documentation** - Visit `http://localhost:8000/docs` for full API documentation
4. 🔄 **Add more test cases** - Extend test console with additional endpoints if needed

---

## Summary

All 404 errors were caused by missing `/api` prefix in the ml-showcase app's API calls. The fixes ensure:

- ✅ Correct endpoint paths matching FastAPI routes
- ✅ Correct request parameter names
- ✅ Correct response data structure handling
- ✅ Comprehensive test tooling for future development

The ML service backend was working correctly - only the frontend needed fixing!
