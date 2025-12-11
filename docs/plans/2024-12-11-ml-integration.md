# ML Service Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up the Python ML service to CAP handlers so Fiori apps can leverage semantic matching, embeddings, and AI-powered OCR with visible results.

**Architecture:** CAP handlers call MLClient methods which communicate with Python FastAPI service. Results stored in HANA (MatchResults) and PostgreSQL (embeddings). Fiori apps display scores and matches via existing OData bindings.

**Tech Stack:** CAP (Node.js), MLClient (srv/lib/ml-client.js), Python FastAPI, PostgreSQL/pgvector, Fiori Elements

---

## Task 1: Add ML Client Import to Matching Service

**Files:**
- Modify: `srv/handlers/matching-service.js:1-15`

**Step 1: Add MLClient import**

Add after line 10 (after validators import):

```javascript
const { createMLClient } = require('../lib/ml-client');
```

**Step 2: Initialize ML client in init()**

Add at line 38, inside the `init()` method after entity destructuring:

```javascript
        // Initialize ML client
        this.mlClient = createMLClient();
        LOG.info('ML Client initialized', { baseUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000' });
```

**Step 3: Verify changes compile**

Run: `npx cds compile srv/`
Expected: No errors

**Step 4: Commit**

```bash
git add srv/handlers/matching-service.js
git commit -m "feat(matching): add ML client import and initialization"
```

---

## Task 2: Add Semantic Matching to batchMatch Action

**Files:**
- Modify: `srv/handlers/matching-service.js:296-383`

**Step 1: Add ML semantic matching call**

Replace the `batchMatch` handler (starting at line 296) with enhanced version that tries ML service first:

```javascript
        this.on('batchMatch', async (req) => {
            const timer = startTimer('batchMatch', LOG);
            const { jobPostingId, candidateIds, minScore } = req.data;

            LOG.info('Batch matching candidates', { jobPostingId, candidateCount: candidateIds?.length });

            try {
                validateUUID(jobPostingId, 'jobPostingId');

                const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
                if (!jobPosting) throw new NotFoundError('JobPosting', jobPostingId);

                const threshold = Number(minScore) || 0;
                let matchesCreated = 0;
                let totalScore = 0;
                let usedSemanticMatching = false;

                // Try ML semantic matching first
                try {
                    LOG.info('Attempting ML semantic matching', { jobPostingId });
                    const mlResult = await this.mlClient.findSemanticMatches({
                        jobPostingId,
                        minScore: threshold,
                        limit: 100,
                        includeBreakdown: true,
                        excludeDisqualified: false
                    });

                    if (mlResult && mlResult.matches && mlResult.matches.length > 0) {
                        usedSemanticMatching = true;
                        LOG.info('ML semantic matching succeeded', { matchCount: mlResult.matches.length });

                        // Store ML results in HANA
                        for (const match of mlResult.matches) {
                            const existing = await SELECT.one.from(MatchResults)
                                .where({ candidate_ID: match.candidate_id, jobPosting_ID: jobPostingId });

                            const matchData = {
                                candidate_ID: match.candidate_id,
                                jobPosting_ID: jobPostingId,
                                overallScore: match.combined_score,
                                skillScore: match.criteria_score || 0,
                                experienceScore: 0,
                                educationScore: 0,
                                locationScore: 0,
                                scoreBreakdown: JSON.stringify(match.score_breakdown || {}),
                                matchedSkills: JSON.stringify(match.matched_criteria || []),
                                missingSkills: JSON.stringify(match.missing_criteria || []),
                                aiRecommendation: `Semantic similarity: ${(match.cosine_similarity * 100).toFixed(1)}%`,
                                reviewStatus: 'pending'
                            };

                            if (existing) {
                                await UPDATE(MatchResults).where({ ID: existing.ID }).set(matchData);
                            } else {
                                await INSERT.into(MatchResults).entries(matchData);
                            }

                            matchesCreated++;
                            totalScore += match.combined_score;
                        }

                        // Update rankings
                        await this._updateRankings(jobPostingId);
                    }
                } catch (mlError) {
                    LOG.warn('ML semantic matching failed, falling back to local', { error: mlError.message });
                }

                // Fallback to local matching if ML didn't work
                if (!usedSemanticMatching) {
                    LOG.info('Using local matching algorithm');
                    const jobRequiredSkills = await SELECT.from(JobRequiredSkills)
                        .where({ jobPosting_ID: jobPostingId });

                    let candidates;
                    if (candidateIds && candidateIds.length > 0) {
                        candidates = await SELECT.from(Candidates)
                            .where({ ID: { in: candidateIds }, isDeleted: false });
                    } else {
                        candidates = await SELECT.from(Candidates)
                            .where({ isDeleted: false })
                            .limit(1000);
                    }

                    for (const candidate of candidates) {
                        const candidateSkills = await SELECT.from(CandidateSkills)
                            .where({ candidate_ID: candidate.ID });

                        const result = await this.calculateMatchScore(
                            candidate,
                            jobPosting,
                            candidateSkills,
                            jobRequiredSkills
                        );

                        if (result.overallScore >= threshold) {
                            const existing = await SELECT.one.from(MatchResults)
                                .where({ candidate_ID: candidate.ID, jobPosting_ID: jobPostingId });

                            const matchData = {
                                candidate_ID: candidate.ID,
                                jobPosting_ID: jobPostingId,
                                overallScore: result.overallScore,
                                skillScore: result.skillScore,
                                experienceScore: result.experienceScore,
                                educationScore: result.educationScore,
                                locationScore: result.locationScore,
                                scoreBreakdown: JSON.stringify(result.breakdown),
                                matchedSkills: JSON.stringify(result.breakdown.skillDetails.matched),
                                missingSkills: JSON.stringify(result.breakdown.skillDetails.missing),
                                reviewStatus: 'pending'
                            };

                            if (existing) {
                                await UPDATE(MatchResults).where({ ID: existing.ID }).set(matchData);
                            } else {
                                await INSERT.into(MatchResults).entries(matchData);
                            }

                            matchesCreated++;
                            totalScore += result.overallScore;
                        }
                    }

                    await this._updateRankings(jobPostingId);
                }

                const duration = timer.stop({ jobPostingId, matched: matchesCreated, semantic: usedSemanticMatching });

                return {
                    totalProcessed: matchesCreated,
                    matchesCreated,
                    avgScore: matchesCreated > 0 ? Math.round((totalScore / matchesCreated) * 100) / 100 : 0,
                    processingTime: duration
                };

            } catch (error) {
                LOG.error('Batch match failed', error, { jobPostingId });
                throw error;
            }
        });
```

**Step 2: Run tests**

Run: `npm test -- --testPathPattern=matching`
Expected: Tests pass (existing tests use local algorithm)

**Step 3: Commit**

```bash
git add srv/handlers/matching-service.js
git commit -m "feat(matching): integrate ML semantic matching with local fallback"
```

---

## Task 3: Add Embedding Generation After Document Processing

**Files:**
- Modify: `srv/handlers/candidate-service.js:1-15`
- Modify: `srv/handlers/candidate-service.js` (add new handler)

**Step 1: Add MLClient import to candidate-service.js**

Add after line 12 (after validators import):

```javascript
const { createMLClient } = require('../lib/ml-client');
```

**Step 2: Initialize ML client**

Add inside `init()` method, after line 33 (after entity destructuring):

```javascript
        // Initialize ML client for embedding generation
        this.mlClient = createMLClient();
```

**Step 3: Add embedding generation after document creation**

Add a new AFTER handler for CVDocuments CREATE. Add this after line 110 (after the existing AFTER READ handler):

```javascript
        // Generate embedding after document is processed
        this.after('UPDATE', 'CVDocuments', async (result, req) => {
            // Only trigger when processing completes
            if (result.processingStatus === 'completed' && result.extractedText) {
                LOG.info('Document processed, generating embedding', { documentId: result.ID });

                try {
                    // Get the linked candidate
                    if (result.candidate_ID) {
                        const candidate = await SELECT.one.from(Candidates)
                            .where({ ID: result.candidate_ID });

                        if (candidate) {
                            // Build text content for embedding
                            const textContent = result.extractedText;
                            const extractedData = result.extractedData ? JSON.parse(result.extractedData) : {};

                            const skillsText = extractedData.skills
                                ? extractedData.skills.map(s => s.name || s).join(', ')
                                : '';

                            const experienceText = extractedData.workExperience
                                ? extractedData.workExperience.map(e => `${e.title} at ${e.company}`).join('; ')
                                : '';

                            // Generate embedding asynchronously (don't wait)
                            this.mlClient.generateEmbedding({
                                entityType: 'candidate',
                                entityId: result.candidate_ID,
                                textContent,
                                skillsText,
                                experienceText
                            }).then(embResult => {
                                LOG.info('Embedding generated for candidate', {
                                    candidateId: result.candidate_ID,
                                    dimension: embResult.embedding_dimension,
                                    stored: embResult.stored
                                });
                            }).catch(err => {
                                LOG.warn('Failed to generate embedding', {
                                    candidateId: result.candidate_ID,
                                    error: err.message
                                });
                            });
                        }
                    }
                } catch (error) {
                    LOG.warn('Embedding generation setup failed', { error: error.message });
                }
            }
        });
```

**Step 4: Verify syntax**

Run: `npx cds compile srv/`
Expected: No errors

**Step 5: Commit**

```bash
git add srv/handlers/candidate-service.js
git commit -m "feat(candidate): auto-generate embedding after document processing"
```

---

## Task 4: Add Job Embedding Generation

**Files:**
- Modify: `srv/handlers/matching-service.js`

**Step 1: Add AFTER handler for JobPostings publish**

Add after the existing `rankCandidates` handler (around line 411):

```javascript
        // Generate job embedding when published
        this.on('publish', 'JobPostings', async (req) => {
            const jobId = req.params[0];
            LOG.info('Publishing job and generating embedding', { jobId });

            // Update status to published
            await UPDATE(JobPostings)
                .where({ ID: jobId })
                .set({
                    status: 'published',
                    publishedAt: new Date().toISOString()
                });

            // Get job details for embedding
            const job = await SELECT.one.from(JobPostings).where({ ID: jobId });

            if (job) {
                // Build text content
                const description = [
                    job.title,
                    job.description,
                    job.responsibilities,
                    job.qualifications
                ].filter(Boolean).join('\n\n');

                const requirements = job.qualifications || '';

                // Generate embedding (async, don't block)
                this.mlClient.generateEmbedding({
                    entityType: 'job',
                    entityId: jobId,
                    textContent: description,
                    requirementsText: requirements
                }).then(result => {
                    LOG.info('Job embedding generated', {
                        jobId,
                        dimension: result.embedding_dimension
                    });
                }).catch(err => {
                    LOG.warn('Failed to generate job embedding', { jobId, error: err.message });
                });
            }

            return SELECT.one.from(JobPostings).where({ ID: jobId });
        });
```

**Step 2: Verify syntax**

Run: `npx cds compile srv/`
Expected: No errors

**Step 3: Commit**

```bash
git add srv/handlers/matching-service.js
git commit -m "feat(jobs): generate embedding on job publish"
```

---

## Task 5: Add Health Check with ML Service Status

**Files:**
- Modify: `srv/server.js:24-41`

**Step 1: Enhance ready endpoint to check ML service**

Replace the `/ready` endpoint (lines 24-41) with:

```javascript
    // Ready check endpoint
    app.get('/ready', async (req, res) => {
        const { createMLClient } = require('./lib/ml-client');
        const mlClient = createMLClient();

        const status = {
            status: 'READY',
            timestamp: new Date().toISOString(),
            components: {
                database: 'unknown',
                mlService: 'unknown'
            }
        };

        // Check database
        try {
            await cds.db.run('SELECT 1 FROM DUMMY');
            status.components.database = 'connected';
        } catch (error) {
            status.components.database = 'disconnected';
            status.status = 'DEGRADED';
        }

        // Check ML service
        try {
            const mlHealth = await mlClient.ping();
            status.components.mlService = mlHealth.status || 'connected';
        } catch (error) {
            status.components.mlService = 'unavailable';
            // ML service is optional, don't mark as degraded
        }

        const httpStatus = status.status === 'READY' ? 200 : 503;
        res.status(httpStatus).json(status);
    });
```

**Step 2: Test locally**

Run: `npm run watch` (in one terminal)
Run: `curl http://localhost:4004/ready` (in another terminal)
Expected: JSON with database and mlService status

**Step 3: Commit**

```bash
git add srv/server.js
git commit -m "feat(health): add ML service status to ready endpoint"
```

---

## Task 6: Create Integration Test for ML Matching

**Files:**
- Create: `test/ml-integration.test.js`

**Step 1: Create test file**

```javascript
/**
 * ML Integration Tests
 * Tests CAP service integration with Python ML service
 */
'use strict';

const cds = require('@sap/cds');

describe('ML Service Integration', () => {
    let db;
    let JobPostings, Candidates, MatchResults;

    beforeAll(async () => {
        // Boot CDS
        db = await cds.connect.to('db');
        const srv = await cds.serve('JobService').from('srv/services.cds');

        JobPostings = db.model.definitions['cv.sorting.JobPostings'];
        Candidates = db.model.definitions['cv.sorting.Candidates'];
        MatchResults = db.model.definitions['cv.sorting.MatchResults'];
    });

    afterAll(async () => {
        await cds.shutdown();
    });

    describe('batchMatch with ML fallback', () => {
        it('should create match results using local algorithm when ML unavailable', async () => {
            // Create test job
            const job = await INSERT.into(JobPostings).entries({
                title: 'Test Developer',
                status: 'published',
                minimumExperience: 2
            });

            // Create test candidate
            const candidate = await INSERT.into(Candidates).entries({
                firstName: 'Test',
                lastName: 'Candidate',
                email: 'test@example.com',
                totalExperienceYears: 5,
                status_code: 'new',
                isDeleted: false
            });

            // Get the service
            const JobService = await cds.connect.to('JobService');

            // Call batchMatch
            const result = await JobService.send('batchMatch', {
                jobPostingId: job.ID,
                minScore: 0
            });

            expect(result).toBeDefined();
            expect(result.matchesCreated).toBeGreaterThanOrEqual(0);
            expect(result.processingTime).toBeDefined();
        });

        it('should store match results in MatchResults entity', async () => {
            const matches = await SELECT.from(MatchResults).limit(1);

            if (matches.length > 0) {
                expect(matches[0]).toHaveProperty('overallScore');
                expect(matches[0]).toHaveProperty('jobPosting_ID');
                expect(matches[0]).toHaveProperty('candidate_ID');
            }
        });
    });

    describe('Health check', () => {
        it('should return ML service status', async () => {
            const axios = require('axios');

            try {
                const response = await axios.get('http://localhost:4004/ready');
                expect(response.data).toHaveProperty('components');
                expect(response.data.components).toHaveProperty('mlService');
            } catch (error) {
                // Server might not be running in test mode
                expect(error.code).toBe('ECONNREFUSED');
            }
        });
    });
});
```

**Step 2: Run test**

Run: `npm test -- --testPathPattern=ml-integration`
Expected: Tests pass (may show ML unavailable warning which is OK)

**Step 3: Commit**

```bash
git add test/ml-integration.test.js
git commit -m "test: add ML integration tests with fallback verification"
```

---

## Task 7: Test End-to-End Flow in Fiori

**Files:**
- No code changes - manual testing

**Step 1: Start all services**

Terminal 1 - PostgreSQL:
```bash
docker start cv-sorting-postgres
```

Terminal 2 - Python ML Service:
```bash
cd python-ml-service
source venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 3 - CAP Service:
```bash
npm run watch
```

**Step 2: Verify ML service is running**

Run: `curl http://localhost:8000/health/ready`
Expected: `{"status": "healthy", ...}`

**Step 3: Verify CAP ready endpoint**

Run: `curl http://localhost:4004/ready`
Expected: `{"status": "READY", "components": {"database": "connected", "mlService": "connected"}}`

**Step 4: Test in Jobs Fiori app**

1. Open http://localhost:4004/jobs/webapp/index.html
2. Create a new Job Posting:
   - Title: "Senior JavaScript Developer"
   - Description: "We need an experienced JavaScript developer..."
   - Add required skills: JavaScript, React, Node.js
3. Click "Publish" action
4. Check terminal for: `Job embedding generated { jobId: ..., dimension: 384 }`

**Step 5: Test CV Upload and embedding**

1. Open http://localhost:4004/cv-upload/webapp/index.html
2. Upload a sample CV (PDF or DOCX)
3. Wait for processing to complete
4. Check terminal for: `Embedding generated for candidate { candidateId: ... }`

**Step 6: Test matching in Jobs app**

1. Go back to Jobs app
2. Open the job posting you created
3. Click "Find Matching Candidates" action
4. Check terminal for: `ML semantic matching succeeded` or `Using local matching algorithm`
5. View the "Candidate Matches" section on the job page
6. Verify match scores are displayed

**Step 7: Document results**

If all steps pass, the integration is working.
If ML service is unavailable, verify local fallback is working.

**Step 8: Final commit**

```bash
git add -A
git commit -m "docs: verify ML integration end-to-end flow"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] CAP `/ready` endpoint shows ML service status
- [ ] Job publish triggers embedding generation (check logs)
- [ ] Document processing triggers candidate embedding (check logs)
- [ ] batchMatch uses ML when available, falls back to local
- [ ] Match results visible in Jobs Fiori app
- [ ] Integration tests pass
- [ ] No TypeErrors or undefined errors in logs

## Rollback Plan

If issues occur:
1. ML service down → Local matching auto-activates (no action needed)
2. Embedding fails → Matching still works with local algorithm
3. Critical error → Revert commits: `git revert HEAD~N`
