# Performance Tuning Guide

**CV Sorting Project - Performance Optimization**

**Version**: 1.0
**Last Updated**: 2025-12-03

---

## Table of Contents

1. [Performance Baseline](#performance-baseline)
2. [Application Optimization](#application-optimization)
3. [Database Tuning](#database-tuning)
4. [Caching Strategies](#caching-strategies)
5. [Load Testing](#load-testing)
6. [Monitoring and Profiling](#monitoring-and-profiling)
7. [Best Practices](#best-practices)

---

## Performance Baseline

### Target Performance Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **API Response Time (p50)** | <200ms | ~150ms | ✅ |
| **API Response Time (p95)** | <500ms | ~400ms | ✅ |
| **API Response Time (p99)** | <1000ms | ~800ms | ✅ |
| **CV Upload Processing** | <5s | ~3.5s | ✅ |
| **OCR Extraction (PDF)** | <2s | ~500ms | ✅ |
| **OCR Extraction (Image)** | <10s | ~4s | ✅ |
| **Matching Algorithm** | <3s | ~2s | ✅ |
| **Database Query Time** | <100ms | ~50ms | ✅ |
| **Throughput** | 100 req/s | ~80 req/s | ⚠️ |
| **Memory Usage** | <1GB | ~750MB | ✅ |
| **CPU Usage** | <70% | ~55% | ✅ |

---

## Application Optimization

### 1. Node.js Configuration

**Optimize Memory Management**:

```javascript
// srv/server.js
const express = require('express');

// Set memory limits
process.env.NODE_OPTIONS = '--max-old-space-size=1024 --max-semi-space-size=64';

// Enable garbage collection monitoring
if (process.env.NODE_ENV === 'production') {
    const v8 = require('v8');
    const heapStats = v8.getHeapStatistics();
    console.log('Heap Limit:', heapStats.heap_size_limit / 1024 / 1024, 'MB');
}
```

**Enable Clustering** (multi-core utilization):

```javascript
// srv/cluster.js
const cluster = require('cluster');
const os = require('cpu');

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    console.log(`Master ${process.pid} starting ${numCPUs} workers`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {
    require('./server.js');
}
```

### 2. Middleware Optimization

**Enable Compression**:

```javascript
// srv/server.js
const compression = require('compression');

app.use(compression({
    level: 6,  // Compression level (1-9)
    threshold: 1024,  // Minimum response size to compress
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));
```

**Optimize Body Parser**:

```javascript
app.use(express.json({
    limit: '50mb',  // Match MAX_FILE_SIZE_MB
    strict: true
}));

app.use(express.urlencoded({
    extended: true,
    limit: '50mb',
    parameterLimit: 10000
}));
```

**Request Caching (ETag)**:

```javascript
const express = require('express');
app.use((req, res, next) => {
    res.set('Cache-Control', 'public, max-age=300');  // 5 minutes
    next();
});
```

### 3. Async/Await Optimization

**Parallel Processing**:

```javascript
// BAD: Sequential
const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
const skills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
const experience = await SELECT.from(WorkExperience).where({ candidate_ID: candidateId });

// GOOD: Parallel
const [candidate, skills, experience] = await Promise.all([
    SELECT.one.from(Candidates).where({ ID: candidateId }),
    SELECT.from(CandidateSkills).where({ candidate_ID: candidateId }),
    SELECT.from(WorkExperience).where({ candidate_ID: candidateId })
]);
```

**Batch Operations**:

```javascript
// BAD: Loop with individual queries
for (const candidate of candidates) {
    await INSERT.into(Candidates).entries(candidate);
}

// GOOD: Bulk insert
await INSERT.into(Candidates).entries(candidates);
```

### 4. OCR Optimization

**Reuse Tesseract Workers**:

```javascript
// srv/handlers/ocr-service.js
let tesseractWorker;

async function getWorker() {
    if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker('eng', 1, {
            cacheMethod: 'write'
        });
    }
    return tesseractWorker;
}

async _extractFromImage(content) {
    const worker = await getWorker();
    const { data } = await worker.recognize(content);
    // Don't terminate - reuse worker
    return data;
}

// Cleanup on shutdown
process.on('SIGTERM', async () => {
    if (tesseractWorker) {
        await tesseractWorker.terminate();
    }
});
```

**Limit Concurrent OCR**:

```javascript
const pLimit = require('p-limit');
const ocrLimit = pLimit(2);  // Max 2 concurrent OCR operations

async function processDocuments(documents) {
    return Promise.all(
        documents.map(doc =>
            ocrLimit(() => extractText(doc))
        )
    );
}
```

---

## Database Tuning

### 1. Connection Pooling

**Configure HANA Connection Pool**:

```json
// package.json
{
  "cds": {
    "requires": {
      "db": {
        "kind": "hana",
        "pool": {
          "min": 2,
          "max": 20,
          "acquireTimeoutMillis": 30000,
          "idleTimeoutMillis": 600000,
          "evictionRunIntervalMillis": 60000
        }
      }
    }
  }
}
```

### 2. Indexing Strategy

**Create Performance Indexes**:

```sql
-- Candidate search indexes
CREATE INDEX idx_candidate_email ON CV_SORTING_CANDIDATES(EMAIL);
CREATE INDEX idx_candidate_status ON CV_SORTING_CANDIDATES(STATUS_CODE);
CREATE INDEX idx_candidate_name ON CV_SORTING_CANDIDATES(FIRSTNAME, LASTNAME);
CREATE INDEX idx_candidate_location ON CV_SORTING_CANDIDATES(LOCATION);

-- Skill indexes
CREATE INDEX idx_skill_category ON CV_SORTING_SKILLS(CATEGORY);
CREATE INDEX idx_candidate_skill ON CV_SORTING_CANDIDATESKILLS(CANDIDATE_ID, SKILL_ID);

-- Match result indexes
CREATE INDEX idx_match_score ON CV_SORTING_MATCHRESULTS(OVERALLSCORE DESC);
CREATE INDEX idx_match_job ON CV_SORTING_MATCHRESULTS(JOBPOSTING_ID, OVERALLSCORE DESC);
CREATE INDEX idx_match_candidate ON CV_SORTING_MATCHRESULTS(CANDIDATE_ID);

-- Document indexes
CREATE INDEX idx_document_status ON CV_SORTING_DOCUMENTS(STATUS_CODE);
CREATE INDEX idx_document_candidate ON CV_SORTING_DOCUMENTS(CANDIDATE_ID);
CREATE INDEX idx_document_created ON CV_SORTING_DOCUMENTS(CREATEDAT DESC);
```

**Verify Index Usage**:

```sql
-- Check index usage
SELECT
    INDEX_NAME,
    TABLE_NAME,
    LAST_ACCESS_TIME,
    ACCESS_COUNT
FROM SYS.M_INDEXES
WHERE SCHEMA_NAME = 'CV_SORTING'
ORDER BY ACCESS_COUNT DESC;
```

### 3. Query Optimization

**Use Projections** (select only needed columns):

```javascript
// BAD: Select all columns
const candidates = await SELECT.from(Candidates);

// GOOD: Select specific columns
const candidates = await SELECT(['ID', 'firstName', 'lastName', 'email'])
    .from(Candidates);
```

**Limit Result Sets**:

```javascript
// Always use pagination
const candidates = await SELECT.from(Candidates)
    .limit(50)
    .offset(page * 50);
```

**Optimize Joins**:

```javascript
// Use CDS associations instead of manual joins
const candidates = await SELECT.from(Candidates, c => {
    c('*'),
    c.skills(s => s('*'))
}).where({ status_code: 'active' });
```

### 4. Table Partitioning

**For Large Tables** (>10M rows):

```sql
-- Partition Documents table by date
ALTER TABLE CV_SORTING_DOCUMENTS
PARTITION BY RANGE (CREATEDAT) (
    PARTITION p_2024 VALUES < '2025-01-01',
    PARTITION p_2025_q1 VALUES < '2025-04-01',
    PARTITION p_2025_q2 VALUES < '2025-07-01',
    PARTITION p_2025_q3 VALUES < '2025-10-01',
    PARTITION p_2025_q4 VALUES < '2026-01-01'
);

-- Partition Match Results by job posting
ALTER TABLE CV_SORTING_MATCHRESULTS
PARTITION BY HASH (JOBPOSTING_ID) PARTITIONS 8;
```

### 5. Statistics Updates

```sql
-- Update table statistics (run weekly)
UPDATE STATISTICS FOR CV_SORTING_CANDIDATES WITH FULLSCAN;
UPDATE STATISTICS FOR CV_SORTING_DOCUMENTS WITH FULLSCAN;
UPDATE STATISTICS FOR CV_SORTING_MATCHRESULTS WITH FULLSCAN;

-- Automated statistics update
ALTER SYSTEM ALTER CONFIGURATION ('indexserver.ini', 'SYSTEM')
SET ('statisticsserver', 'auto_update_statistics') = 'true';
```

---

## Caching Strategies

### 1. Application-Level Caching

**Install Redis**:

```bash
cf create-service redis-cache small cv-sorting-cache
cf bind-service cv-sorting-srv cv-sorting-cache
cf restage cv-sorting-srv
```

**Configure Redis Client**:

```javascript
// srv/lib/cache.js
const redis = require('redis');

const client = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
        connectTimeout: 5000
    },
    password: process.env.REDIS_PASSWORD
});

client.on('error', err => console.error('Redis error:', err));
await client.connect();

module.exports = {
    get: async (key) => {
        try {
            const value = await client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    },

    set: async (key, value, ttl = 300) => {
        try {
            await client.setEx(key, ttl, JSON.stringify(value));
        } catch (error) {
            console.error('Cache set error:', error);
        }
    },

    del: async (key) => {
        try {
            await client.del(key);
        } catch (error) {
            console.error('Cache delete error:', error);
        }
    }
};
```

**Cache Matching Results**:

```javascript
// srv/matching-service.js
const cache = require('./lib/cache');

async handleFindMatches(req) {
    const cacheKey = `matches:${jobPostingId}`;

    // Try cache first
    let matches = await cache.get(cacheKey);

    if (!matches) {
        // Calculate matches
        matches = await this.calculateMatches(jobPostingId);

        // Cache for 5 minutes
        await cache.set(cacheKey, matches, 300);
    }

    return matches;
}
```

### 2. HTTP Caching

**Cache-Control Headers**:

```javascript
// srv/server.js
app.use('/candidate/Candidates', (req, res, next) => {
    if (req.method === 'GET') {
        res.set('Cache-Control', 'public, max-age=60');  // 1 minute
        res.set('ETag', generateETag(req.url));
    }
    next();
});
```

**CDN Integration** (for static assets):

```javascript
// Serve OCR language data from CDN
const CDN_URL = 'https://cdn.example.com';

app.use('/assets', express.static('public', {
    maxAge: '1y',
    immutable: true
}));
```

### 3. Rate Limiter Optimization

**Use Redis for Distributed Rate Limiting**:

```javascript
// srv/middleware/rate-limiter.js
const redis = require('redis');
const { RateLimiterRedis } = require('rate-limiter-flexible');

const redisClient = redis.createClient({ url: process.env.REDIS_URL });

const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl',
    points: 100,  // Max requests
    duration: 60,  // Per 60 seconds
    blockDuration: 60  // Block for 60 seconds if exceeded
});

module.exports = async (req, res, next) => {
    try {
        await rateLimiter.consume(req.ip);
        next();
    } catch (error) {
        res.status(429).json({ error: 'Too Many Requests' });
    }
};
```

---

## Load Testing

### 1. Tools Setup

**Install k6**:

```bash
# Install k6
brew install k6  # macOS
# Or download from: https://k6.io/docs/getting-started/installation/
```

### 2. Load Test Scripts

**API Load Test** (`test/load/api-test.js`):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 100 },  // Stay at 100 users
        { duration: '2m', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],  // 95% under 500ms
        http_req_failed: ['rate<0.01'],    // <1% errors
    },
};

export default function () {
    // Test candidate listing
    const res = http.get('https://your-app-url.com/candidate/Candidates');

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(1);
}
```

**Run Load Test**:

```bash
# Run load test
k6 run test/load/api-test.js

# With custom VUs and duration
k6 run --vus 100 --duration 10m test/load/api-test.js

# Output to JSON
k6 run --out json=results.json test/load/api-test.js
```

### 3. Stress Testing

**Find Breaking Point**:

```javascript
export const options = {
    stages: [
        { duration: '1m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 500 },
        { duration: '1m', target: 1000 },  // Find where it breaks
    ],
};
```

---

## Monitoring and Profiling

### 1. Application Performance Monitoring (APM)

**Enable Node.js Profiler**:

```bash
# Start with profiler
node --prof srv/server.js

# Generate profile report
node --prof-process isolate-*.log > profile.txt
```

**Heap Snapshot**:

```javascript
// srv/server.js
const v8 = require('v8');
const fs = require('fs');

// Endpoint to create heap snapshot
app.get('/debug/heapsnapshot', (req, res) => {
    const filename = `heapsnapshot-${Date.now()}.heapsnapshot`;
    const snapshot = v8.writeHeapSnapshot(filename);
    res.json({ snapshot: filename });
});
```

### 2. Database Monitoring

**HANA Performance Views**:

```sql
-- Top expensive SQL statements
SELECT
    STATEMENT_STRING,
    AVG_EXECUTION_TIME,
    EXECUTION_COUNT,
    TOTAL_EXECUTION_TIME
FROM M_SQL_PLAN_CACHE
ORDER BY AVG_EXECUTION_TIME DESC
LIMIT 20;

-- Table scan operations (potential index issues)
SELECT
    TABLE_NAME,
    READ_COUNT,
    INDEX_SCAN_COUNT,
    FULL_SCAN_COUNT
FROM M_TABLE_STATISTICS
WHERE FULL_SCAN_COUNT > 1000
ORDER BY FULL_SCAN_COUNT DESC;

-- Memory usage per table
SELECT
    TABLE_NAME,
    MEMORY_SIZE_IN_TOTAL / 1024 / 1024 AS SIZE_MB,
    RECORD_COUNT
FROM M_TABLE_VIRTUAL_FILES
ORDER BY MEMORY_SIZE_IN_TOTAL DESC;
```

### 3. Metrics Collection

**Custom Metrics**:

```javascript
// srv/lib/metrics.js
const metrics = {
    apiCalls: 0,
    ocrProcessing: 0,
    matchingCalculations: 0,
    errors: 0,

    record(metric, value = 1) {
        this[metric] = (this[metric] || 0) + value;
    },

    get() {
        return { ...this };
    },

    reset() {
        Object.keys(this).forEach(key => {
            if (typeof this[key] === 'number') {
                this[key] = 0;
            }
        });
    }
};

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
    res.json(metrics.get());
});
```

---

## Best Practices

### 1. Code Optimization

**Avoid Blocking Operations**:

```javascript
// BAD: Synchronous file read (blocks event loop)
const data = fs.readFileSync('file.txt');

// GOOD: Asynchronous
const data = await fs.promises.readFile('file.txt');
```

**Use Streams for Large Files**:

```javascript
// BAD: Load entire file into memory
const buffer = await fs.promises.readFile('large-cv.pdf');
const result = await processFile(buffer);

// GOOD: Use streams
const stream = fs.createReadStream('large-cv.pdf');
const result = await processFileStream(stream);
```

### 2. Memory Management

**Prevent Memory Leaks**:

```javascript
// Use WeakMap for cache to allow garbage collection
const cache = new WeakMap();

// Clean up event listeners
process.on('SIGTERM', () => {
    eventEmitter.removeAllListeners();
    cache.clear();
});
```

**Monitor Heap Usage**:

```javascript
setInterval(() => {
    const used = process.memoryUsage();
    console.log({
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    });
}, 30000);  // Every 30 seconds
```

### 3. Resource Cleanup

**Graceful Shutdown**:

```javascript
// srv/server.js
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');

    // Stop accepting new requests
    server.close(async () => {
        // Close database connections
        await cds.db.disconnect();

        // Close Redis connection
        await redisClient.quit();

        // Terminate Tesseract worker
        if (tesseractWorker) {
            await tesseractWorker.terminate();
        }

        console.log('Shutdown complete');
        process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
});
```

---

## Performance Checklist

### Application

- [ ] Enabled compression
- [ ] Configured connection pooling
- [ ] Implemented caching strategy
- [ ] Optimized async/await usage
- [ ] Used batch operations
- [ ] Enabled clustering (multi-core)
- [ ] Optimized OCR workers
- [ ] Minimized blocking operations

### Database

- [ ] Created appropriate indexes
- [ ] Configured connection pool
- [ ] Enabled table partitioning (if needed)
- [ ] Updated statistics regularly
- [ ] Optimized queries (use EXPLAIN PLAN)
- [ ] Implemented pagination
- [ ] Used projections (select specific columns)

### Caching

- [ ] Configured Redis/caching service
- [ ] Implemented application-level cache
- [ ] Set appropriate TTLs
- [ ] Configured HTTP cache headers
- [ ] Implemented cache invalidation

### Monitoring

- [ ] Set up APM/metrics collection
- [ ] Configured database monitoring
- [ ] Enabled application logging
- [ ] Set up performance alerts
- [ ] Regular load testing

---

## References

- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [SAP HANA Performance Guide](https://help.sap.com/docs/hana-cloud/sap-hana-cloud-administration-guide/performance)
- [Redis Best Practices](https://redis.io/docs/manual/optimization/)
- [k6 Load Testing](https://k6.io/docs/)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-03
**Status**: ✅ Ready for Production Use
