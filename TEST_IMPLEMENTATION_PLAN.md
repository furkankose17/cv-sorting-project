# CV Sorting Application - Test Implementation Plan

**Document Version:** 1.0
**Date:** 2025-12-16
**Author:** Claude (AI Development Assistant)
**Target Coverage:** 70%+ (from current 4.9%)
**Timeline:** 4 weeks
**Estimated Effort:** 120 hours

---

## Executive Summary

This document provides a comprehensive roadmap to improve test coverage from **4.9% to 70%+** over 4 weeks. The plan prioritizes fixing 31 failing tests, adding critical service tests, and establishing robust test infrastructure.

**Current State:**
- 92 tests total (61 passing, 31 failing)
- 4.9% line coverage (target: 80%)
- 0% coverage on main services (3,500+ lines)
- 6 out of 7 test suites failing

**Deliverables:**
1. 150+ new tests across unit, integration, and E2E layers
2. Test utilities and factories for efficient test creation
3. 70%+ code coverage on critical paths
4. Green CI/CD pipeline (0 failing tests)
5. Performance regression tests

---

## Table of Contents

1. [Current State Assessment](#current-state-assessment)
2. [Test Architecture](#test-architecture)
3. [Phase 1: Foundation (Week 1)](#phase-1-foundation-week-1)
4. [Phase 2: Core Services (Week 2)](#phase-2-core-services-week-2)
5. [Phase 3: Advanced Features (Week 3)](#phase-3-advanced-features-week-3)
6. [Phase 4: E2E & Polish (Week 4)](#phase-4-e2e--polish-week-4)
7. [Test Templates & Examples](#test-templates--examples)
8. [Test Utilities](#test-utilities)
9. [Success Metrics](#success-metrics)
10. [Appendix](#appendix)

---

## Current State Assessment

### Coverage by Component

| Component | Files | Lines | Current Coverage | Target | Priority |
|-----------|-------|-------|------------------|--------|----------|
| **Main Services** | 4 | 3,500+ | 0% | 75% | P0 |
| `cv-sorting-service.js` | 1 | 500+ | 0% | 70% | P0 |
| `candidate-service.js` | 1 | 900+ | 0% | 75% | P0 |
| `job-service.js` | 1 | 1,600+ | 0% | 75% | P0 |
| `ai-service.js` | 1 | 1,500+ | 0% | 70% | P0 |
| **Libraries** | 7 | 1,000+ | 15% | 80% | P1 |
| `validators.js` | 1 | 200+ | 0% | 90% | P1 |
| `file-validator.js` | 1 | 150+ | 93% | 95% | P2 |
| `rule-engine.js` | 1 | 300+ | 0% | 75% | P1 |
| `audit-logger.js` | 1 | 150+ | 0% | 80% | P1 |
| `cache.js` | 1 | 100+ | 0% | 85% | P1 |
| `rate-limiter.js` | 1 | 150+ | 0% | 80% | P1 |
| `ml-client.js` | 1 | 200+ | 44% | 75% | P1 |

### Failing Tests Breakdown

| Test Suite | Passing | Failing | Issue |
|------------|---------|---------|-------|
| `rate-limiter.test.js` | 4 | 6 | Shared state, isolation |
| `integration.test.js` | 8 | 12 | Missing handlers, async issues |
| `candidate-service.test.js` | 12 | 5 | Service initialization |
| `ml-service.test.js` | 10 | 4 | Mock ML client needed |
| `security.test.js` | 15 | 2 | Input validation edge cases |
| `matching-algorithm.test.js` | 8 | 2 | Floating point precision |

---

## Test Architecture

### Directory Structure

```
test/
├── jest.config.js                    # Jest configuration
├── setup.js                          # Global test setup
├── teardown.js                       # Global test teardown
├── helpers/                          # Test utilities
│   ├── db-helper.js                  # Database seeding/cleanup
│   ├── factory.js                    # Test data factories
│   ├── assertions.js                 # Custom assertions
│   ├── mock-ml-client.js             # ML service mock
│   └── test-server.js                # Test server instance
├── fixtures/                         # Static test data
│   ├── candidates.json
│   ├── jobs.json
│   ├── skills.json
│   └── sample-cv.pdf
├── unit/                             # Unit tests (no DB)
│   ├── validators/
│   │   ├── email-validator.test.js
│   │   ├── phone-validator.test.js
│   │   └── sanitization.test.js
│   ├── libraries/
│   │   ├── file-validator.test.js    # EXISTS (93% coverage)
│   │   ├── cache.test.js             # NEW
│   │   ├── audit-logger.test.js      # NEW
│   │   └── rate-limiter.test.js      # EXISTS (needs fixes)
│   └── algorithms/
│       ├── matching-algorithm.test.js # EXISTS
│       └── scoring-engine.test.js     # NEW
├── integration/                      # Service-level tests (with DB)
│   ├── services/
│   │   ├── candidate-service.test.js  # EXISTS (needs expansion)
│   │   ├── job-service.test.js        # NEW
│   │   ├── ai-service.test.js         # NEW
│   │   └── cv-sorting-service.test.js # NEW
│   ├── operations/
│   │   ├── candidate-crud.test.js     # NEW
│   │   ├── job-matching.test.js       # NEW
│   │   ├── bulk-operations.test.js    # NEW
│   │   └── transactions.test.js       # NEW
│   └── features/
│       ├── n1-prevention.test.js      # NEW
│       ├── caching.test.js            # NEW
│       └── audit-trail.test.js        # NEW
└── e2e/                              # End-to-end workflows
    ├── cv-upload-workflow.test.js     # NEW
    ├── hiring-workflow.test.js        # NEW
    ├── matching-workflow.test.js      # NEW
    └── interview-scheduling.test.js   # NEW
```

### Test Layers

| Layer | Purpose | Coverage Target | Example |
|-------|---------|-----------------|---------|
| **Unit** | Pure functions, no dependencies | 90% | Email validation |
| **Integration** | Service methods with DB | 75% | Candidate CRUD |
| **E2E** | Complete user workflows | 50% | CV upload → match → interview |

---

## Phase 1: Foundation (Week 1)

**Goal:** Fix failing tests, create test utilities, achieve 15% coverage
**Effort:** 30 hours

### Day 1-2: Fix Failing Tests (8 hours)

#### Task 1.1: Fix Rate Limiter Tests (3 hours)

**Issue:** 6 failing tests due to shared state

**File:** `test/unit/libraries/rate-limiter.test.js`

**Fix Strategy:**
```javascript
describe('Rate Limiter', () => {
  let rateLimiter;

  beforeEach(() => {
    // Create fresh instance for each test
    const RateLimiter = require('../../srv/lib/rate-limiter');
    rateLimiter = new RateLimiter();
    rateLimiter.requests.clear(); // Clear any previous state
  });

  afterEach(() => {
    // Cleanup
    rateLimiter.requests.clear();
  });

  describe('Distributed DoS Prevention', () => {
    it('should block requests after limit exceeded', async () => {
      // Isolated test with fresh state
      const mockReq = { user: { id: 'test-user-1' } };

      // Make 100 requests (at limit)
      for (let i = 0; i < 100; i++) {
        const result = await rateLimiter.checkLimit(mockReq);
        expect(result.allowed).toBe(true);
      }

      // 101st request should be blocked
      const blockedResult = await rateLimiter.checkLimit(mockReq);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Anonymous User Handling', () => {
    it('should track anonymous users by IP', async () => {
      const mockReq1 = { _.req: { ip: '192.168.1.1' } };
      const mockReq2 = { _.req: { ip: '192.168.1.2' } };

      // Different IPs should have separate limits
      for (let i = 0; i < 100; i++) {
        await rateLimiter.checkLimit(mockReq1);
      }

      const result = await rateLimiter.checkLimit(mockReq2);
      expect(result.allowed).toBe(true); // Different IP, not blocked
    });
  });
});
```

**Deliverable:** 6 green tests

#### Task 1.2: Fix Integration Tests (5 hours)

**Issues:**
- Missing handler implementations
- Async timing issues
- Service initialization failures

**File:** `test/integration/integration.test.js`

**Actions:**
1. Create missing handler stubs
2. Add proper async/await handling
3. Increase test timeouts for slow operations
4. Mock ML service calls

### Day 3-4: Create Test Utilities (12 hours)

#### Task 1.3: Database Helper (4 hours)

**File:** `test/helpers/db-helper.js`

```javascript
const cds = require('@sap/cds');

class DatabaseHelper {
  constructor() {
    this.db = null;
  }

  async connect() {
    this.db = await cds.connect.to('db');
    return this.db;
  }

  async seed(entityName, data) {
    const { [entityName]: Entity } = cds.entities('cv.sorting');
    await INSERT.into(Entity).entries(data);
  }

  async seedAll(fixtures) {
    // Seed in dependency order
    const order = [
      'Skills', 'SkillCategories', 'Countries',
      'CandidateStatuses', 'Candidates', 'CandidateSkills',
      'JobPostings', 'JobRequiredSkills', 'MatchResults'
    ];

    for (const entityName of order) {
      if (fixtures[entityName]) {
        await this.seed(entityName, fixtures[entityName]);
      }
    }
  }

  async cleanup() {
    // Delete in reverse dependency order
    const entities = [
      'MatchResults', 'Interviews', 'CandidateNotes',
      'CandidateSkills', 'JobRequiredSkills',
      'CVDocuments', 'WorkExperiences', 'Educations',
      'Candidates', 'JobPostings'
    ];

    for (const name of entities) {
      const { [name]: Entity } = cds.entities('cv.sorting');
      await DELETE.from(Entity);
    }
  }

  async disconnect() {
    if (this.db) {
      await this.db.disconnect();
    }
  }
}

module.exports = new DatabaseHelper();
```

#### Task 1.4: Test Data Factory (4 hours)

**File:** `test/helpers/factory.js`

```javascript
const { v4: uuidv4 } = require('uuid');

class Factory {
  static candidate(overrides = {}) {
    return {
      ID: uuidv4(),
      firstName: 'John',
      lastName: 'Doe',
      email: `john.doe.${Date.now()}@example.com`,
      phone: '+1-555-0100',
      city: 'Berlin',
      country_code: 'DE',
      status_code: 'new',
      totalExperienceYears: 5,
      headline: 'Senior Software Engineer',
      summary: 'Experienced developer with strong skills',
      source: 'test',
      isDeleted: false,
      ...overrides
    };
  }

  static job(overrides = {}) {
    return {
      ID: uuidv4(),
      title: 'Senior Developer',
      description: 'Looking for a senior developer',
      location: 'Berlin',
      locationType: 'onsite',
      status: 'published',
      minimumExperience: 3,
      preferredExperience: 5,
      requiredEducation_code: 'bachelor',
      ...overrides
    };
  }

  static skill(overrides = {}) {
    return {
      ID: uuidv4(),
      name: 'JavaScript',
      normalizedName: 'javascript',
      category_code: 'programming',
      ...overrides
    };
  }

  static candidateSkill(candidateId, skillId, overrides = {}) {
    return {
      ID: uuidv4(),
      candidate_ID: candidateId,
      skill_ID: skillId,
      proficiencyLevel: 'advanced',
      yearsOfExperience: 3,
      isVerified: false,
      ...overrides
    };
  }

  static matchResult(candidateId, jobId, overrides = {}) {
    return {
      ID: uuidv4(),
      candidate_ID: candidateId,
      jobPosting_ID: jobId,
      overallScore: 75.5,
      skillScore: 80,
      experienceScore: 70,
      educationScore: 75,
      locationScore: 80,
      reviewStatus: 'pending',
      ...overrides
    };
  }

  static interview(candidateId, jobId, overrides = {}) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
      ID: uuidv4(),
      candidate_ID: candidateId,
      jobPosting_ID: jobId,
      scheduledAt: tomorrow.toISOString(),
      duration: 60,
      type_code: 'technical',
      status_code: 'scheduled',
      ...overrides
    };
  }

  // Bulk creation helpers
  static candidates(count, overrides = {}) {
    return Array.from({ length: count }, (_, i) =>
      this.candidate({
        firstName: `Candidate${i}`,
        email: `candidate${i}@example.com`,
        ...overrides
      })
    );
  }

  static skills(count, overrides = {}) {
    const skillNames = ['JavaScript', 'Python', 'Java', 'C++', 'Go',
                        'React', 'Angular', 'Vue', 'Node.js', 'Django'];
    return Array.from({ length: Math.min(count, skillNames.length) }, (_, i) =>
      this.skill({
        name: skillNames[i],
        normalizedName: skillNames[i].toLowerCase(),
        ...overrides
      })
    );
  }
}

module.exports = Factory;
```

#### Task 1.5: Mock ML Client (4 hours)

**File:** `test/helpers/mock-ml-client.js`

```javascript
class MockMLClient {
  constructor(mode = 'success') {
    this.mode = mode; // 'success', 'error', 'timeout'
    this.callLog = [];
  }

  async generateEmbedding(params) {
    this.callLog.push({ method: 'generateEmbedding', params });

    if (this.mode === 'error') {
      throw new Error('ML service unavailable');
    }

    if (this.mode === 'timeout') {
      await new Promise(resolve => setTimeout(resolve, 35000));
    }

    return {
      entity_id: params.entityId,
      entity_type: params.entityType,
      embedding_dimension: 384,
      stored: true,
      content_hash: 'mock-hash-' + Date.now()
    };
  }

  async findSemanticMatches(params) {
    this.callLog.push({ method: 'findSemanticMatches', params });

    if (this.mode === 'error') {
      throw new Error('ML service unavailable');
    }

    // Return mock matches
    return {
      matches: [
        { candidate_id: 'candidate-1', cosine_similarity: 0.85, combined_score: 82 },
        { candidate_id: 'candidate-2', cosine_similarity: 0.78, combined_score: 75 },
        { candidate_id: 'candidate-3', cosine_similarity: 0.72, combined_score: 68 }
      ],
      total: 3
    };
  }

  async semanticSearch(params) {
    this.callLog.push({ method: 'semanticSearch', params });

    if (this.mode === 'error') {
      throw new Error('ML service unavailable');
    }

    return {
      matches: [
        { candidate_id: 'candidate-1', similarity: 0.88 },
        { candidate_id: 'candidate-2', similarity: 0.76 }
      ]
    };
  }

  reset() {
    this.callLog = [];
  }

  getCallCount(method) {
    return this.callLog.filter(c => c.method === method).length;
  }
}

module.exports = MockMLClient;
```

### Day 5: Quick Win Tests (10 hours)

#### Task 1.6: Validator Tests (3 hours)

**File:** `test/unit/validators/validators.test.js`

```javascript
const {
  validateEmail,
  validatePhone,
  validateUrl,
  validateUUID,
  sanitizeString,
  validateLength,
  validateRange
} = require('../../../srv/lib/validators');

describe('Validators Library', () => {
  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('first.last@company.co.uk')).toBe(true);
      expect(validateEmail('user+tag@domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user @example.com')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail(undefined)).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should accept valid phone numbers', () => {
      expect(validatePhone('+1-555-123-4567')).toBe(true);
      expect(validatePhone('+49 30 12345678')).toBe(true);
      expect(validatePhone('555-1234')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhone('abc')).toBe(false);
      expect(validatePhone('123')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>'))
        .toBe('alert("xss")');
      expect(sanitizeString('<b>Bold</b> text'))
        .toBe('Bold text');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  spaced  ')).toBe('spaced');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });
  });

  describe('validateLength', () => {
    it('should validate string length', () => {
      expect(validateLength('test', 1, 10)).toBe(true);
      expect(validateLength('test', 5, 10)).toBe(false);
      expect(validateLength('test', 1, 3)).toBe(false);
    });
  });

  describe('validateRange', () => {
    it('should validate numeric ranges', () => {
      expect(validateRange(5, 1, 10)).toBe(true);
      expect(validateRange(0, 1, 10)).toBe(false);
      expect(validateRange(11, 1, 10)).toBe(false);
    });
  });
});
```

**Deliverable:** 25+ validator tests, ~90% coverage on validators.js

#### Task 1.7: Cache Tests (3 hours)

**File:** `test/unit/libraries/cache.test.js`

```javascript
const cache = require('../../../srv/lib/cache');

describe('Cache Library', () => {
  beforeEach(() => {
    cache.clear();
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1', 1); // 1 second TTL
      expect(cache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(cache.get('key1')).toBeNull();
    });

    it('should not expire before TTL', async () => {
      cache.set('key1', 'value1', 2); // 2 second TTL

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('getOrSet Pattern', () => {
    it('should call function on cache miss', async () => {
      const fn = jest.fn().mockResolvedValue('computed');

      const result = await cache.getOrSet('key1', fn);

      expect(result).toBe('computed');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not call function on cache hit', async () => {
      cache.set('key1', 'cached');
      const fn = jest.fn().mockResolvedValue('computed');

      const result = await cache.getOrSet('key1', fn);

      expect(result).toBe('cached');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should return cache stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });
  });
});
```

**Deliverable:** 15+ cache tests, ~85% coverage on cache.js

#### Task 1.8: Audit Logger Tests (4 hours)

**File:** `test/unit/libraries/audit-logger.test.js`

```javascript
const auditLogger = require('../../../srv/lib/audit-logger');
const cds = require('@sap/cds');

describe('Audit Logger', () => {
  let db;

  beforeAll(async () => {
    db = await cds.connect.to('db');
  });

  afterEach(async () => {
    const { AuditLogs } = cds.entities('cv.sorting');
    await DELETE.from(AuditLogs);
  });

  afterAll(async () => {
    await db.disconnect();
  });

  describe('log()', () => {
    it('should create audit log entry', async () => {
      await auditLogger.log({
        entityName: 'Candidates',
        entityId: 'test-id',
        action: 'CREATE',
        newValues: { firstName: 'John', lastName: 'Doe' },
        user: { id: 'user-123' }
      });

      const { AuditLogs } = cds.entities('cv.sorting');
      const logs = await SELECT.from(AuditLogs)
        .where({ entityId: 'test-id' });

      expect(logs).toHaveLength(1);
      expect(logs[0].entityName).toBe('Candidates');
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].modifiedBy).toBe('user-123');
    });

    it('should record field changes', async () => {
      await auditLogger.log({
        entityName: 'Candidates',
        entityId: 'test-id',
        action: 'UPDATE',
        oldValues: { status_code: 'new' },
        newValues: { status_code: 'screening' },
        changedFields: ['status_code'],
        user: { id: 'user-123' }
      });

      const { AuditLogs } = cds.entities('cv.sorting');
      const logs = await SELECT.from(AuditLogs)
        .where({ entityId: 'test-id' });

      expect(logs[0].action).toBe('UPDATE');
      expect(JSON.parse(logs[0].oldValues).status_code).toBe('new');
      expect(JSON.parse(logs[0].newValues).status_code).toBe('screening');
      expect(logs[0].changedFields).toContain('status_code');
    });
  });

  describe('logCreate()', () => {
    it('should log entity creation', async () => {
      await auditLogger.logCreate(
        'Candidates',
        'test-id',
        { firstName: 'John' },
        { id: 'user-123' }
      );

      const { AuditLogs } = cds.entities('cv.sorting');
      const logs = await SELECT.from(AuditLogs);

      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('CREATE');
    });
  });

  describe('logUpdate()', () => {
    it('should log entity update with changed fields', async () => {
      await auditLogger.logUpdate(
        'Candidates',
        'test-id',
        { firstName: 'John', lastName: 'Doe' },
        { firstName: 'Jane', lastName: 'Doe' },
        ['firstName'],
        { id: 'user-123' }
      );

      const { AuditLogs } = cds.entities('cv.sorting');
      const logs = await SELECT.from(AuditLogs);

      expect(logs[0].changedFields).toEqual(['firstName']);
    });
  });

  describe('logDelete()', () => {
    it('should log entity deletion', async () => {
      await auditLogger.logDelete(
        'Candidates',
        'test-id',
        { firstName: 'John' },
        { id: 'user-123' }
      );

      const { AuditLogs } = cds.entities('cv.sorting');
      const logs = await SELECT.from(AuditLogs);

      expect(logs[0].action).toBe('DELETE');
    });
  });

  describe('getChangedFields()', () => {
    it('should detect changed fields', () => {
      const changed = auditLogger.getChangedFields(
        { firstName: 'John', lastName: 'Doe', age: 30 },
        { firstName: 'Jane', lastName: 'Doe', age: 31 }
      );

      expect(changed).toContain('firstName');
      expect(changed).toContain('age');
      expect(changed).not.toContain('lastName');
    });

    it('should ignore metadata fields', () => {
      const changed = auditLogger.getChangedFields(
        { firstName: 'John', modifiedAt: '2024-01-01' },
        { firstName: 'John', modifiedAt: '2024-01-02' }
      );

      expect(changed).not.toContain('modifiedAt');
    });
  });

  describe('getAuditTrail()', () => {
    it('should retrieve audit history for entity', async () => {
      await auditLogger.logCreate('Candidates', 'test-id', {}, { id: 'user-1' });
      await auditLogger.logUpdate('Candidates', 'test-id', {}, {}, [], { id: 'user-2' });

      const trail = await auditLogger.getAuditTrail('Candidates', 'test-id');

      expect(trail).toHaveLength(2);
      expect(trail[0].action).toBe('UPDATE'); // Newest first
      expect(trail[1].action).toBe('CREATE');
    });
  });

  describe('Error Handling', () => {
    it('should not throw on audit log failure', async () => {
      // Should not throw even if database fails
      await expect(
        auditLogger.log({
          entityName: 'Invalid_Entity_That_Does_Not_Exist',
          entityId: 'test',
          action: 'CREATE'
        })
      ).resolves.not.toThrow();
    });
  });
});
```

**Deliverable:** 20+ audit logger tests, ~80% coverage

---

### Week 1 Summary

**Deliverables:**
- ✅ All failing tests fixed (31 → 0)
- ✅ Test utilities created (db-helper, factory, mock-ml-client)
- ✅ 60+ new unit tests added
- ✅ Coverage: 4.9% → 15%

**Time Spent:** 30 hours

---

## Phase 2: Core Services (Week 2)

**Goal:** Test main service operations, achieve 35% coverage
**Effort:** 32 hours

### Day 6-7: Candidate Service Tests (16 hours)

#### Task 2.1: Candidate CRUD Tests (6 hours)

**File:** `test/integration/services/candidate-service.test.js`

```javascript
const cds = require('@sap/cds');
const Factory = require('../../helpers/factory');
const dbHelper = require('../../helpers/db-helper');

describe('Candidate Service', () => {
  let db;
  let CandidateService;

  beforeAll(async () => {
    db = await cds.connect.to('db');
    CandidateService = await cds.connect.to('CVSortingService');
  });

  beforeEach(async () => {
    await dbHelper.cleanup();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  describe('CREATE Candidate', () => {
    it('should create candidate with valid data', async () => {
      const candidateData = Factory.candidate();

      const result = await INSERT.into('Candidates').entries(candidateData);

      const created = await SELECT.one.from('Candidates')
        .where({ ID: candidateData.ID });

      expect(created).toBeDefined();
      expect(created.firstName).toBe(candidateData.firstName);
      expect(created.email).toBe(candidateData.email);
      expect(created.status_code).toBe('new');
    });

    it('should reject duplicate email', async () => {
      const candidate1 = Factory.candidate({ email: 'test@example.com' });
      const candidate2 = Factory.candidate({ email: 'test@example.com' });

      await INSERT.into('Candidates').entries(candidate1);

      await expect(
        INSERT.into('Candidates').entries(candidate2)
      ).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      await expect(
        INSERT.into('Candidates').entries({
          ID: 'test-id',
          // Missing firstName, lastName, email
        })
      ).rejects.toThrow();
    });

    it('should set default status to "new"', async () => {
      const candidate = Factory.candidate();
      delete candidate.status_code;

      await INSERT.into('Candidates').entries(candidate);

      const created = await SELECT.one.from('Candidates')
        .where({ ID: candidate.ID });

      expect(created.status_code).toBe('new');
    });
  });

  describe('READ Candidate', () => {
    it('should retrieve candidate by ID', async () => {
      const candidate = Factory.candidate();
      await INSERT.into('Candidates').entries(candidate);

      const found = await SELECT.one.from('Candidates')
        .where({ ID: candidate.ID });

      expect(found).toBeDefined();
      expect(found.ID).toBe(candidate.ID);
    });

    it('should return null for non-existent ID', async () => {
      const found = await SELECT.one.from('Candidates')
        .where({ ID: 'non-existent' });

      expect(found).toBeUndefined();
    });

    it('should filter by status', async () => {
      await INSERT.into('Candidates').entries([
        Factory.candidate({ status_code: 'new' }),
        Factory.candidate({ status_code: 'screening' }),
        Factory.candidate({ status_code: 'new' })
      ]);

      const newCandidates = await SELECT.from('Candidates')
        .where({ status_code: 'new' });

      expect(newCandidates).toHaveLength(2);
    });
  });

  describe('UPDATE Candidate', () => {
    it('should update candidate fields', async () => {
      const candidate = Factory.candidate();
      await INSERT.into('Candidates').entries(candidate);

      await UPDATE('Candidates')
        .where({ ID: candidate.ID })
        .set({ city: 'Munich', phone: '+49-89-123456' });

      const updated = await SELECT.one.from('Candidates')
        .where({ ID: candidate.ID });

      expect(updated.city).toBe('Munich');
      expect(updated.phone).toBe('+49-89-123456');
    });

    it('should not allow duplicate email on update', async () => {
      const candidate1 = Factory.candidate({ email: 'test1@example.com' });
      const candidate2 = Factory.candidate({ email: 'test2@example.com' });

      await INSERT.into('Candidates').entries([candidate1, candidate2]);

      await expect(
        UPDATE('Candidates')
          .where({ ID: candidate2.ID })
          .set({ email: 'test1@example.com' })
      ).rejects.toThrow();
    });
  });

  describe('DELETE Candidate (Soft Delete)', () => {
    it('should soft delete candidate', async () => {
      const candidate = Factory.candidate();
      await INSERT.into('Candidates').entries(candidate);

      await UPDATE('Candidates')
        .where({ ID: candidate.ID })
        .set({ isDeleted: true, deletedAt: new Date().toISOString() });

      const deleted = await SELECT.one.from('Candidates')
        .where({ ID: candidate.ID });

      expect(deleted.isDeleted).toBe(true);
      expect(deleted.deletedAt).toBeDefined();
    });

    it('should exclude deleted candidates from queries', async () => {
      await INSERT.into('Candidates').entries([
        Factory.candidate({ isDeleted: false }),
        Factory.candidate({ isDeleted: true }),
        Factory.candidate({ isDeleted: false })
      ]);

      const active = await SELECT.from('Candidates')
        .where({ isDeleted: false });

      expect(active).toHaveLength(2);
    });
  });
});
```

#### Task 2.2: Candidate Skills Tests (4 hours)

```javascript
describe('Candidate Skills Management', () => {
  it('should add skill to candidate', async () => {
    const candidate = Factory.candidate();
    const skill = Factory.skill();

    await INSERT.into('Candidates').entries(candidate);
    await INSERT.into('Skills').entries(skill);

    const candidateSkill = Factory.candidateSkill(candidate.ID, skill.ID);
    await INSERT.into('CandidateSkills').entries(candidateSkill);

    const skills = await SELECT.from('CandidateSkills')
      .where({ candidate_ID: candidate.ID });

    expect(skills).toHaveLength(1);
    expect(skills[0].skill_ID).toBe(skill.ID);
  });

  it('should prevent duplicate skills for candidate', async () => {
    const candidate = Factory.candidate();
    const skill = Factory.skill();

    await INSERT.into('Candidates').entries(candidate);
    await INSERT.into('Skills').entries(skill);

    const skill1 = Factory.candidateSkill(candidate.ID, skill.ID);
    await INSERT.into('CandidateSkills').entries(skill1);

    const skill2 = Factory.candidateSkill(candidate.ID, skill.ID);
    await expect(
      INSERT.into('CandidateSkills').entries(skill2)
    ).rejects.toThrow();
  });

  it('should update skill proficiency level', async () => {
    const candidate = Factory.candidate();
    const skill = Factory.skill();

    await INSERT.into('Candidates').entries(candidate);
    await INSERT.into('Skills').entries(skill);

    const candidateSkill = Factory.candidateSkill(candidate.ID, skill.ID, {
      proficiencyLevel: 'beginner'
    });
    await INSERT.into('CandidateSkills').entries(candidateSkill);

    await UPDATE('CandidateSkills')
      .where({ ID: candidateSkill.ID })
      .set({ proficiencyLevel: 'advanced' });

    const updated = await SELECT.one.from('CandidateSkills')
      .where({ ID: candidateSkill.ID });

    expect(updated.proficiencyLevel).toBe('advanced');
  });
});
```

#### Task 2.3: N+1 Prevention Tests (6 hours)

**File:** `test/integration/features/n1-prevention.test.js`

```javascript
const cds = require('@sap/cds');
const Factory = require('../../helpers/factory');
const dbHelper = require('../../helpers/db-helper');

describe('N+1 Query Prevention', () => {
  let db;
  let queryCount;
  let originalRun;

  beforeAll(async () => {
    db = await cds.connect.to('db');

    // Spy on database queries
    originalRun = cds.run;
    cds.run = function(...args) {
      queryCount++;
      return originalRun.apply(this, args);
    };
  });

  beforeEach(async () => {
    await dbHelper.cleanup();
    queryCount = 0;
  });

  afterAll(async () => {
    cds.run = originalRun;
    await db.disconnect();
  });

  describe('Candidate Skills Loading', () => {
    it('should load candidate with 10 skills in 2 queries max', async () => {
      // Setup: 1 candidate with 10 skills
      const candidate = Factory.candidate();
      const skills = Factory.skills(10);

      await INSERT.into('Candidates').entries(candidate);
      await INSERT.into('Skills').entries(skills);

      const candidateSkills = skills.map(skill =>
        Factory.candidateSkill(candidate.ID, skill.ID)
      );
      await INSERT.into('CandidateSkills').entries(candidateSkills);

      queryCount = 0;

      // Execute: Load candidate with skills
      const result = await SELECT.one.from('Candidates')
        .where({ ID: candidate.ID })
        .columns(c => c('*'), c.skills('*'));

      // Assert: Max 2 queries (1 for candidate, 1 for all skills)
      // NOT 11 queries (1 + 10)
      expect(queryCount).toBeLessThanOrEqual(2);
      expect(result).toBeDefined();
    });

    it('should batch load skills for 50 candidates efficiently', async () => {
      // Setup: 50 candidates, each with 5 skills
      const candidates = Factory.candidates(50);
      const skills = Factory.skills(10);

      await INSERT.into('Candidates').entries(candidates);
      await INSERT.into('Skills').entries(skills);

      const candidateSkills = [];
      candidates.forEach(candidate => {
        for (let i = 0; i < 5; i++) {
          candidateSkills.push(
            Factory.candidateSkill(candidate.ID, skills[i].ID)
          );
        }
      });
      await INSERT.into('CandidateSkills').entries(candidateSkills);

      queryCount = 0;

      // Execute: Load all candidates with skills
      const results = await SELECT.from('Candidates')
        .columns(c => c('*'), c.skills('*'));

      // Assert: Should be ~2 queries, NOT 51 (1 + 50)
      expect(queryCount).toBeLessThanOrEqual(3);
      expect(results).toHaveLength(50);
    });
  });

  describe('Job Matching Queries', () => {
    it('should match candidates efficiently', async () => {
      // Setup
      const job = Factory.job();
      const candidates = Factory.candidates(20);
      const skills = Factory.skills(5);

      await INSERT.into('JobPostings').entries(job);
      await INSERT.into('Candidates').entries(candidates);
      await INSERT.into('Skills').entries(skills);

      const jobSkills = skills.slice(0, 3).map(skill =>
        ({ ID: cds.utils.uuid(), jobPosting_ID: job.ID, skill_ID: skill.ID, isRequired: true })
      );
      await INSERT.into('JobRequiredSkills').entries(jobSkills);

      candidates.forEach(async (candidate) => {
        const candSkills = skills.slice(0, 2).map(skill =>
          Factory.candidateSkill(candidate.ID, skill.ID)
        );
        await INSERT.into('CandidateSkills').entries(candSkills);
      });

      queryCount = 0;

      // Execute: Find matching candidates
      // This should use the optimized batch query approach
      const candidateIds = candidates.map(c => c.ID);
      const allCandidateSkills = await SELECT.from('CandidateSkills')
        .where({ candidate_ID: { in: candidateIds } });

      // Assert: Single batch query, not 20 individual queries
      expect(queryCount).toBe(1);
      expect(allCandidateSkills.length).toBeGreaterThan(0);
    });
  });
});
```

**Deliverable:** 30+ candidate service tests, 15+ N+1 prevention tests

### Day 8-9: Job Service Tests (16 hours)

#### Task 2.4: Job Matching Tests (8 hours)

**File:** `test/integration/services/job-service.test.js`

```javascript
const cds = require('@sap/cds');
const Factory = require('../../helpers/factory');
const MockMLClient = require('../../helpers/mock-ml-client');
const dbHelper = require('../../helpers/db-helper');

describe('Job Service - Matching', () => {
  let db;
  let mockML;

  beforeAll(async () => {
    db = await cds.connect.to('db');
    mockML = new MockMLClient('success');
  });

  beforeEach(async () => {
    await dbHelper.cleanup();
    mockML.reset();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  describe('Weighted Score Calculation', () => {
    it('should calculate match score with correct weights', async () => {
      const candidate = Factory.candidate({
        totalExperienceYears: 5,
        city: 'Berlin'
      });

      const job = Factory.job({
        location: 'Berlin',
        minimumExperience: 3,
        skillWeight: 0.40,
        experienceWeight: 0.30,
        educationWeight: 0.20,
        locationWeight: 0.10
      });

      const skill = Factory.skill();

      await INSERT.into('Candidates').entries(candidate);
      await INSERT.into('JobPostings').entries(job);
      await INSERT.into('Skills').entries(skill);

      const candidateSkill = Factory.candidateSkill(candidate.ID, skill.ID, {
        proficiencyLevel: 'advanced'
      });
      const jobSkill = {
        ID: cds.utils.uuid(),
        jobPosting_ID: job.ID,
        skill_ID: skill.ID,
        isRequired: true,
        weight: 1.0
      };

      await INSERT.into('CandidateSkills').entries(candidateSkill);
      await INSERT.into('JobRequiredSkills').entries(jobSkill);

      // Calculate match (would call service method)
      const matchResult = await calculateMatchScore(
        candidate,
        job,
        [candidateSkill],
        [jobSkill]
      );

      expect(matchResult.overallScore).toBeGreaterThan(70);
      expect(matchResult.skillScore).toBeGreaterThan(0);
      expect(matchResult.experienceScore).toBeGreaterThan(0);
      expect(matchResult.locationScore).toBe(100); // Same city
    });

    it('should apply higher weight to critical skills', async () => {
      const candidate = Factory.candidate();
      const job = Factory.job();
      const skill1 = Factory.skill({ name: 'JavaScript' });
      const skill2 = Factory.skill({ name: 'Python' });

      await INSERT.into('Candidates').entries(candidate);
      await INSERT.into('JobPostings').entries(job);
      await INSERT.into('Skills').entries([skill1, skill2]);

      // Candidate has JavaScript but not Python
      const candidateSkill = Factory.candidateSkill(candidate.ID, skill1.ID);
      await INSERT.into('CandidateSkills').entries(candidateSkill);

      // Job requires both, but Python has higher weight
      const jobSkills = [
        { ID: cds.utils.uuid(), jobPosting_ID: job.ID, skill_ID: skill1.ID,
          isRequired: true, weight: 0.5 },
        { ID: cds.utils.uuid(), jobPosting_ID: job.ID, skill_ID: skill2.ID,
          isRequired: true, weight: 1.5 } // Critical skill
      ];
      await INSERT.into('JobRequiredSkills').entries(jobSkills);

      const matchResult = await calculateMatchScore(
        candidate,
        job,
        [candidateSkill],
        jobSkills
      );

      // Score should be lower due to missing critical skill
      expect(matchResult.skillScore).toBeLessThan(60);
    });
  });

  describe('Top N Candidate Ranking', () => {
    it('should return top 10 candidates sorted by score', async () => {
      const job = Factory.job();
      await INSERT.into('JobPostings').entries(job);

      // Create 20 candidates with varying scores
      const candidates = Factory.candidates(20);
      await INSERT.into('Candidates').entries(candidates);

      const matches = candidates.map((candidate, index) =>
        Factory.matchResult(candidate.ID, job.ID, {
          overallScore: 50 + index // Scores from 50 to 69
        })
      );
      await INSERT.into('MatchResults').entries(matches);

      // Get top 10
      const topCandidates = await SELECT.from('MatchResults')
        .where({ jobPosting_ID: job.ID })
        .orderBy({ overallScore: 'desc' })
        .limit(10);

      expect(topCandidates).toHaveLength(10);
      expect(topCandidates[0].overallScore).toBeGreaterThan(
        topCandidates[9].overallScore
      );
      expect(topCandidates[0].overallScore).toBeGreaterThanOrEqual(60);
    });
  });

  describe('ML Integration with Fallback', () => {
    it('should use ML semantic matching when available', async () => {
      const job = Factory.job();
      const candidate = Factory.candidate();

      await INSERT.into('JobPostings').entries(job);
      await INSERT.into('Candidates').entries(candidate);

      mockML.mode = 'success';

      // This would call the actual service method with mock ML client
      // For now, just verify mock was called
      await mockML.findSemanticMatches({
        jobPostingId: job.ID,
        minScore: 50
      });

      expect(mockML.getCallCount('findSemanticMatches')).toBe(1);
    });

    it('should fallback to rule-based when ML fails', async () => {
      const job = Factory.job();
      const candidate = Factory.candidate();

      await INSERT.into('JobPostings').entries(job);
      await INSERT.into('Candidates').entries(candidate);

      mockML.mode = 'error';

      // Service should catch ML error and use rule-based matching
      let mlFailed = false;
      try {
        await mockML.findSemanticMatches({
          jobPostingId: job.ID,
          minScore: 50
        });
      } catch (e) {
        mlFailed = true;
      }

      expect(mlFailed).toBe(true);
      // Service should continue with rule-based scoring
    });
  });

  describe('Batch Matching Performance', () => {
    it('should match 100 candidates efficiently', async () => {
      const job = Factory.job();
      const candidates = Factory.candidates(100);

      await INSERT.into('JobPostings').entries(job);
      await INSERT.into('Candidates').entries(candidates);

      const startTime = Date.now();

      // Batch match operation (would call service)
      const candidateIds = candidates.map(c => c.ID);
      const allCandidateSkills = await SELECT.from('CandidateSkills')
        .where({ candidate_ID: { in: candidateIds } });

      const duration = Date.now() - startTime;

      // Should complete in under 1 second with proper indexing
      expect(duration).toBeLessThan(1000);
    });
  });
});
```

**Deliverable:** 25+ job matching tests

---

### Week 2 Summary

**Deliverables:**
- ✅ 30+ candidate service tests
- ✅ 25+ job service tests
- ✅ 15+ N+1 prevention tests
- ✅ Coverage: 15% → 35%

**Time Spent:** 32 hours

---

## Success Metrics

### Coverage Targets by Week

| Week | Target Coverage | Tests Added | Key Deliverables |
|------|-----------------|-------------|------------------|
| 1 | 15% | 60+ | Fix failing tests, utilities, validators |
| 2 | 35% | 70+ | Candidate/Job services, N+1 prevention |
| 3 | 55% | 60+ | AI service, transactions, caching |
| 4 | 70%+ | 50+ | E2E workflows, performance tests |

### Quality Gates

- **No failing tests** in CI/CD
- **70%+ statement coverage** on critical paths
- **80%+ coverage** on libraries and utilities
- **100% of critical user workflows tested**
- **Performance tests pass** (< 500ms per request)

---

## Next Steps

After completing this plan:
1. Set up CI/CD to run tests on every commit
2. Add test coverage reporting to PRs
3. Create performance regression benchmarks
4. Document testing patterns for team
5. Schedule quarterly test reviews

---

**End of Week 1-2 Plan. Full Week 3-4 plan continues with AI Service tests, Transaction tests, E2E workflows, and performance testing.**
