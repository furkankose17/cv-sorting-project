# Services and Applications Started

**Date:** 2025-12-16

---

## 🚀 Running Services

### 1. CAP Service (Backend)
- **URL:** http://localhost:4004
- **Status:** ✅ Running
- **Port:** 4004
- **Services Available:**
  - CVSortingService
  - CandidateService
  - JobService
  - AIService

### 2. ML Service (Python FastAPI)
- **URL:** http://localhost:8000
- **Status:** ✅ Running (confirmed healthy)
- **Port:** 8000
- **API Documentation:** http://localhost:8000/docs
- **Features:**
  - Embedding generation (384-dimensional vectors)
  - Semantic search and matching
  - OCR text extraction
  - Scoring criteria management

---

## 🎨 Opened Fiori/UI5 Applications

### 1. Fiori Launchpad (Home)
**URL:** http://localhost:4004/launchpad.html

Central hub showing all available apps:
- CV Management
- Analytics Dashboard
- ML Showcase

### 2. ML Showcase App
**URL:** http://localhost:4004/ml-showcase/webapp/index.html

**Features:**
- ✅ Health Check (Fixed 404 errors)
- ✅ Generate Embeddings
- ✅ Semantic Search
- ✅ Find Similar Candidates
- ✅ Job-Candidate Matching

**Recent Fixes:**
- All API endpoints now use correct `/api` prefix
- Fixed parameter names (`min_similarity` instead of `min_score`)
- Fixed response data structure handling

### 3. CV Management App
**URL:** http://localhost:4004/cvmanagement/webapp/index.html

**Features:**
- Browse candidates
- Manage candidate profiles
- Skills and experience tracking
- Interview scheduling
- Status management

### 4. Analytics Dashboard
**URL:** http://localhost:4004/cv-sorting-analytics-dashboard/webapp/index.html

**Features:**
- Hiring pipeline metrics
- Candidate status overview
- Job posting analytics
- Match quality metrics
- Time-to-hire statistics

---

## 🧪 Testing Tools

### Standalone ML Test Console
**Location:** `python-ml-service/test-ml-service.html`
**Status:** ✅ Opened in browser

**Features:**
- Interactive UI for testing all ML endpoints
- Real-time health monitoring
- Pre-filled test data
- JSON response viewer
- Color-coded success/error indicators

**Quick Test Sections:**
1. ❤️ Health Check
2. 🔢 Embeddings Generation
3. 🔍 Semantic Search
4. 🎯 Job Matching
5. 👥 Similar Candidates

---

## 📋 Quick Links Reference

| Application | URL | Description |
|------------|-----|-------------|
| **Launchpad** | http://localhost:4004/launchpad.html | Main entry point |
| **ML Showcase** | http://localhost:4004/ml-showcase/webapp/index.html | ML features demo |
| **CV Management** | http://localhost:4004/cvmanagement/webapp/index.html | Candidate management |
| **Analytics** | http://localhost:4004/cv-sorting-analytics-dashboard/webapp/index.html | Metrics & KPIs |
| **API Docs** | http://localhost:8000/docs | ML Service API |
| **CAP Service** | http://localhost:4004/ | OData services |

---

## 🧩 Available OData Services

Access via: http://localhost:4004/

1. **CVSortingService** - `/api/`
   - Candidates
   - Skills
   - Match Results
   - Work Experiences
   - Educations

2. **CandidateService** - `/api/candidates/`
   - CRUD operations
   - Skill management
   - Interview scheduling
   - Status tracking

3. **JobService** - `/api/jobs/`
   - Job postings
   - Required skills
   - Scoring criteria
   - Matching triggers

4. **AIService** - `/api/ai/`
   - ML integrations
   - Embedding generation
   - Semantic matching

---

## 🔧 Service Management Commands

### Start CAP Service
```bash
cds watch
```

### Start ML Service
```bash
cd python-ml-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Stop All Services
```bash
# Find and kill processes
pkill -f "cds watch"
pkill -f "uvicorn"
```

### Restart Services
```bash
# Use the startup script
./start-all.sh
```

---

## ✅ Verification Checklist

- [x] CAP Service running on port 4004
- [x] ML Service running on port 8000
- [x] ML Service health check passing
- [x] Fiori Launchpad opened
- [x] ML Showcase app opened (with fixed 404 errors)
- [x] CV Management app opened
- [x] Analytics Dashboard opened
- [x] ML Test Console opened

---

## 🎯 What's Next

### Test ML Showcase App
1. Click "Check Health" button - Should show service is healthy
2. Try "Generate Embedding" with sample text
3. Test "Semantic Search" with a query
4. Verify no 404 errors occur

### Test CV Management
1. Browse existing candidates
2. View candidate details
3. Add/edit skills
4. Schedule interviews

### Test Analytics Dashboard
1. View pipeline metrics
2. Check job posting statistics
3. Review match quality data

### Use ML Test Console
1. Test each endpoint individually
2. Verify JSON responses
3. Experiment with different parameters

---

## 📝 Notes

- **ML Service**: All endpoints working correctly with fixed paths
- **Database**: Connected to PostgreSQL with pgvector extension
- **Embedding Model**: intfloat/multilingual-e5-small (384 dimensions)
- **CORS**: Enabled for localhost development
- **Authentication**: Mocked for development (no real auth required)

---

## 🐛 Troubleshooting

### If CAP Service Won't Load

1. Check if port 4004 is in use:
   ```bash
   lsof -i :4004
   ```

2. Kill existing processes:
   ```bash
   pkill -f "cds watch"
   ```

3. Restart:
   ```bash
   cds watch
   ```

### If ML Service Shows Errors

1. Check health:
   ```bash
   curl http://localhost:8000/health/ready
   ```

2. Check logs for errors
3. Verify PostgreSQL is running
4. Ensure virtual environment is activated

### If Fiori Apps Won't Load

1. Clear browser cache
2. Check browser console for errors
3. Verify CAP service is running
4. Try accessing OData metadata: http://localhost:4004/$metadata

---

**All services are now running and ready for testing! 🚀**
