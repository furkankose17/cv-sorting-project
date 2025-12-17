# Test Helpers

This directory contains utility classes and functions to simplify test writing.

## Available Helpers

### 1. DatabaseHelper

Provides utilities for database operations in tests.

**Usage:**

```javascript
const DatabaseHelper = require('./helpers/database-helper');
const cds = require('@sap/cds');

// Start CAP test server at module level
cds.test(__dirname + '/..');

describe('My Test Suite', () => {
    let dbHelper;

    beforeAll(async () => {
        dbHelper = new DatabaseHelper();
        await dbHelper.init();
    });

    beforeEach(async () => {
        // Clean database before each test
        await dbHelper.cleanup();
    });

    it('should create a candidate', async () => {
        const candidate = await dbHelper.createCandidate({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com'
        });

        expect(candidate.ID).toBeDefined();
        expect(candidate.firstName).toBe('John');
    });

    it('should link skill to candidate', async () => {
        const candidate = await dbHelper.createCandidate();
        const skill = await dbHelper.createSkill({ name: 'JavaScript' });

        const link = await dbHelper.linkSkillToCandidate(
            candidate.ID,
            skill.ID,
            { proficiencyLevel: 'advanced' }
        );

        expect(link.candidate_ID).toBe(candidate.ID);
        expect(link.skill_ID).toBe(skill.ID);
    });

    it('should seed minimal data', async () => {
        const { skills, categories } = await dbHelper.seedMinimalData();

        expect(skills.length).toBe(4);
        expect(categories.length).toBe(2);

        const skillCount = await dbHelper.count('Skills');
        expect(skillCount).toBe(4);
    });
});
```

**Key Methods:**

- `init()` - Initialize database connection
- `cleanup()` - Delete all data (call in beforeEach)
- `createCandidate(data)` - Create a test candidate
- `createJobPosting(data)` - Create a test job posting
- `createSkill(data)` - Create a test skill
- `linkSkillToCandidate(candidateId, skillId, data)` - Link skill to candidate
- `linkSkillToJob(jobId, skillId, data)` - Link skill to job
- `createMatchResult(candidateId, jobId, data)` - Create match result
- `count(entityName)` - Count records in a table
- `seedMinimalData()` - Seed database with basic test data

### 2. TestDataFactory

Factory methods for creating realistic test data objects (without database insertion).

**Usage:**

```javascript
const TestDataFactory = require('./helpers/test-data-factory');

describe('My Test Suite', () => {
    let factory;

    beforeEach(() => {
        factory = new TestDataFactory();
    });

    it('should create candidate data', () => {
        const candidate = factory.createCandidate({
            firstName: 'Jane',
            lastName: 'Smith'
        });

        expect(candidate.ID).toBeDefined();
        expect(candidate.firstName).toBe('Jane');
        expect(candidate.email).toContain('@example.com');
    });

    it('should create complete candidate profile', () => {
        const profile = factory.createCompleteCandidate({
            skillCount: 5,
            workExperienceCount: 3,
            educationCount: 2
        });

        expect(profile.candidate).toBeDefined();
        expect(profile.skills.length).toBe(5);
        expect(profile.workExperiences.length).toBe(3);
        expect(profile.educations.length).toBe(2);
    });

    it('should create bulk test data', () => {
        const candidates = factory.createBulkCandidates(100);

        expect(candidates.length).toBe(100);
        // All emails should be unique
        const emails = candidates.map(c => c.email);
        expect(new Set(emails).size).toBe(100);
    });
});
```

**Key Methods:**

- `createCandidate(overrides)` - Create candidate data
- `createJobPosting(overrides)` - Create job posting data
- `createSkill(overrides)` - Create skill data
- `createWorkExperience(candidateId, overrides)` - Create work experience data
- `createEducation(candidateId, overrides)` - Create education data
- `createCertification(candidateId, overrides)` - Create certification data
- `createMatchResult(candidateId, jobId, overrides)` - Create match result data
- `createCompleteCandidate(options)` - Create full candidate profile
- `createCompleteJobPosting(options)` - Create full job posting
- `createBulkCandidates(count, overrides)` - Create multiple candidates
- `createBulkJobPostings(count, overrides)` - Create multiple job postings

### 3. MockMLClient

Mock implementation of ML service for testing without actual ML backend.

**Usage:**

```javascript
const MockMLClient = require('./helpers/mock-ml-client');

describe('My Test Suite', () => {
    let mockML;

    beforeEach(() => {
        mockML = new MockMLClient({
            simulateDelay: false,  // No delay for faster tests
            failureRate: 0  // Never fail
        });
    });

    it('should extract text from CV', async () => {
        const result = await mockML.extractText('dummy content');

        expect(result.text).toContain('JOHN DOE');
        expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should extract skills', async () => {
        const skills = await mockML.extractSkills('some cv text');

        expect(skills.length).toBeGreaterThan(0);
        expect(skills[0]).toHaveProperty('name');
        expect(skills[0]).toHaveProperty('confidence');
    });

    it('should generate embeddings', async () => {
        const result = await mockML.generateEmbedding('test text');

        expect(result.embedding.length).toBe(384);
        expect(result.model).toBe('mock-multilingual-e5-small');
    });

    it('should match candidate to job', async () => {
        const candidate = { /* candidate data */ };
        const job = { /* job data */ };

        const match = await mockML.matchCandidateToJob(candidate, job);

        expect(match.overallScore).toBeGreaterThan(0);
        expect(match.explanation).toBeDefined();
    });

    it('should track method calls', async () => {
        await mockML.extractSkills('test');
        await mockML.generateEmbedding('test');

        expect(mockML.getCallCount('extractSkills')).toBe(1);
        expect(mockML.getCallCount('generateEmbedding')).toBe(1);

        const history = mockML.getCallHistory();
        expect(history.length).toBe(2);
    });

    it('should simulate errors', async () => {
        mockML.setFailureRate(1);  // Always fail

        await expect(mockML.extractText('test'))
            .rejects
            .toThrow('Mock ML service error');
    });
});
```

**Key Methods:**

- `extractText(documentContent, options)` - Extract text from document
- `extractSkills(text)` - Extract skills from text
- `extractEntities(text)` - Extract name, email, phone, etc.
- `generateEmbedding(text)` - Generate embedding vector
- `calculateSimilarity(emb1, emb2)` - Calculate cosine similarity
- `matchCandidateToJob(candidate, job)` - Match candidate to job
- `analyzeSkillGaps(candidate, job)` - Analyze skill gaps
- `assessCVQuality(cvText)` - Assess CV quality
- `getCallHistory()` - Get all method calls
- `getCallCount(methodName)` - Get count of specific method calls
- `wasCalledWith(methodName, args)` - Verify method was called with args
- `setFailureRate(rate)` - Set failure rate for error testing
- `setDelay(enabled, ms)` - Configure delay simulation
- `reset()` - Reset mock to initial state

## Complete Example

Here's a complete example combining all three helpers:

```javascript
const cds = require('@sap/cds');
const DatabaseHelper = require('./helpers/database-helper');
const TestDataFactory = require('./helpers/test-data-factory');
const MockMLClient = require('./helpers/mock-ml-client');

// Start CAP test server
cds.test(__dirname + '/..');

describe('Candidate Matching Workflow', () => {
    let dbHelper, factory, mockML;

    beforeAll(async () => {
        dbHelper = new DatabaseHelper();
        await dbHelper.init();
    });

    beforeEach(async () => {
        await dbHelper.cleanup();
        factory = new TestDataFactory();
        mockML = new MockMLClient();
    });

    it('should match candidate to job with ML integration', async () => {
        // 1. Create test data using factory
        const candidateData = factory.createCandidate({
            firstName: 'John',
            lastName: 'Doe'
        });

        const jobData = factory.createJobPosting({
            title: 'Senior Developer'
        });

        // 2. Insert into database using dbHelper
        const candidate = await dbHelper.createCandidate(candidateData);
        const job = await dbHelper.createJobPosting(jobData);

        // 3. Create skills and link them
        const jsSkill = await dbHelper.createSkill({ name: 'JavaScript' });
        await dbHelper.linkSkillToCandidate(candidate.ID, jsSkill.ID);
        await dbHelper.linkSkillToJob(job.ID, jsSkill.ID);

        // 4. Use mock ML service to generate match
        const mlMatch = await mockML.matchCandidateToJob(candidate, job);

        // 5. Store match result in database
        const matchResult = await dbHelper.createMatchResult(
            candidate.ID,
            job.ID,
            { overallScore: mlMatch.overallScore }
        );

        // 6. Verify
        expect(matchResult.overallScore).toBeGreaterThan(70);
        expect(mockML.getCallCount('matchCandidateToJob')).toBe(1);

        const matches = await cds.run(
            SELECT.from('cv.sorting.MatchResults')
                .where({ candidate_ID: candidate.ID })
        );
        expect(matches.length).toBe(1);
    });
});
```

## Best Practices

1. **Always clean up between tests**: Use `dbHelper.cleanup()` in `beforeEach` to ensure test isolation.

2. **Reset factories**: Call `factory.reset()` in `beforeEach` if you need predictable counter values.

3. **Mock ML by default**: Use `MockMLClient` in tests. Only use real ML service in integration tests explicitly marked as such.

4. **Use factories for data objects**: Use `TestDataFactory` to create data objects, then insert with `DatabaseHelper`.

5. **Seed minimal data**: Use `dbHelper.seedMinimalData()` when tests need some baseline data but don't care about specifics.

6. **Verify mock calls**: Use `mockML.getCallHistory()` to verify your code called ML service correctly.

7. **Test error handling**: Use `mockML.setFailureRate(1)` to test how your code handles ML service failures.

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/candidate-service.test.js

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

## Troubleshooting

**Error: "Database not initialized"**
- Make sure you call `dbHelper.init()` in `beforeAll`
- Ensure `cds.test(__dirname + '/..')` is at module level

**Error: "Foreign key constraint violation"**
- Use `dbHelper.cleanup()` instead of manual DELETE statements
- The cleanup method deletes in correct order

**Tests are slow**
- Disable delay simulation in MockMLClient: `new MockMLClient({ simulateDelay: false })`
- Use `jest --maxWorkers=4` to run tests in parallel

**Unique constraint violations**
- Ensure `factory.reset()` is called in `beforeEach`
- Use `dbHelper.cleanup()` to clear data between tests
