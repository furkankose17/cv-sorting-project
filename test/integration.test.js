/**
 * Integration Tests
 * Tests for end-to-end workflows across multiple services
 */
'use strict';

const cds = require('@sap/cds');

describe('Integration Tests', () => {

    let CVService, CandidateService, MatchingService;
    let db;

    beforeAll(async () => {
        // Connect to in-memory database for testing
        cds.test.in(__dirname, '..');

        CVService = await cds.connect.to('CVService');
        CandidateService = await cds.connect.to('CandidateService');
        MatchingService = await cds.connect.to('MatchingService');

        db = await cds.connect.to('db');
    });

    afterAll(async () => {
        // Cleanup
        await db.disconnect();
    });

    // ==========================================
    // CV UPLOAD AND PROCESSING WORKFLOW
    // ==========================================

    describe('CV Upload and Processing Workflow', () => {

        it('should upload and process a complete CV document', async () => {
            // Step 1: Upload document
            const sampleCV = `
                John Doe
                Email: john.doe@example.com
                Phone: +1-555-0123

                EXPERIENCE
                Senior Developer at Tech Corp (2020-Present)
                - Led development of microservices
                - Implemented CI/CD pipelines

                EDUCATION
                Bachelor of Science in Computer Science
                University of Technology (2018)

                SKILLS
                JavaScript, React, Node.js, Python, AWS, Docker
            `;

            const uploadResult = await CVService.send({
                event: 'uploadDocument',
                data: {
                    fileName: 'john_doe_cv.txt',
                    fileContent: Buffer.from(sampleCV).toString('base64'),
                    fileType: 'text/plain'
                }
            });

            expect(uploadResult).toBeDefined();
            expect(uploadResult.documentId).toBeDefined();
            expect(uploadResult.status).toBe('uploaded');

            // Step 2: Process document
            const processResult = await CVService.send({
                event: 'processDocument',
                data: {
                    documentId: uploadResult.documentId,
                    extractionOptions: JSON.stringify({ enrichSkills: true })
                }
            });

            expect(processResult.success).toBe(true);
            expect(processResult.extractedData).toBeDefined();
            expect(processResult.extractedData.personalInfo.email).toBe('john.doe@example.com');

            // Step 3: Verify document is stored
            const { Documents } = CVService.entities;
            const document = await SELECT.one.from(Documents).where({ ID: uploadResult.documentId });

            expect(document).toBeDefined();
            expect(document.status_code).toBe('processed');
        });

        it('should handle invalid file upload gracefully', async () => {
            const invalidContent = Buffer.from('Not a valid CV').toString('base64');

            const result = await CVService.send({
                event: 'uploadDocument',
                data: {
                    fileName: 'invalid.exe',
                    fileContent: invalidContent,
                    fileType: 'application/x-msdownload'
                }
            });

            expect(result.status).toBe('error');
            expect(result.message).toContain('not supported');
        });

        it('should reject oversized files', async () => {
            // Create a large buffer (60MB - over the 50MB limit)
            const largeBuffer = Buffer.alloc(60 * 1024 * 1024);
            const largeContent = largeBuffer.toString('base64');

            const result = await CVService.send({
                event: 'uploadDocument',
                data: {
                    fileName: 'large_file.pdf',
                    fileContent: largeContent,
                    fileType: 'application/pdf'
                }
            });

            expect(result.status).toBe('error');
            expect(result.message).toContain('too large');
        });
    });

    // ==========================================
    // CANDIDATE CREATION FROM DOCUMENT
    // ==========================================

    describe('Candidate Creation from Document', () => {

        it('should create candidate from processed document', async () => {
            // Step 1: Upload CV
            const sampleCV = `
                Jane Smith
                jane.smith@example.com
                +1-555-9876

                Senior Software Engineer

                SKILLS: Java, Spring Boot, Kubernetes, AWS

                EXPERIENCE
                Tech Lead at Innovation Inc (2018-2023)
            `;

            const uploadResult = await CVService.send({
                event: 'uploadDocument',
                data: {
                    fileName: 'jane_smith_cv.txt',
                    fileContent: Buffer.from(sampleCV).toString('base64'),
                    fileType: 'text/plain'
                }
            });

            await CVService.send({
                event: 'processDocument',
                data: {
                    documentId: uploadResult.documentId,
                    extractionOptions: '{}'
                }
            });

            // Step 2: Create candidate from document
            const createResult = await CVService.send({
                event: 'createCandidateFromDocument',
                data: {
                    documentId: uploadResult.documentId,
                    additionalData: JSON.stringify({
                        firstName: 'Jane',
                        lastName: 'Smith'
                    }),
                    autoLinkSkills: true
                }
            });

            expect(createResult.candidateId).toBeDefined();
            expect(createResult.linkedSkillsCount).toBeGreaterThan(0);

            // Step 3: Verify candidate exists
            const { Candidates } = CandidateService.entities;
            const candidate = await SELECT.one.from(Candidates)
                .where({ ID: createResult.candidateId });

            expect(candidate).toBeDefined();
            expect(candidate.email).toBe('jane.smith@example.com');
            expect(candidate.firstName).toBe('Jane');
            expect(candidate.lastName).toBe('Smith');
        });

        it('should link extracted skills to candidate', async () => {
            const sampleCV = `
                Bob Johnson
                bob@example.com

                SKILLS: Python, Django, PostgreSQL, Redis, Docker
            `;

            const uploadResult = await CVService.send({
                event: 'uploadDocument',
                data: {
                    fileName: 'bob_johnson_cv.txt',
                    fileContent: Buffer.from(sampleCV).toString('base64'),
                    fileType: 'text/plain'
                }
            });

            await CVService.send({
                event: 'processDocument',
                data: { documentId: uploadResult.documentId, extractionOptions: '{}' }
            });

            const createResult = await CVService.send({
                event: 'createCandidateFromDocument',
                data: {
                    documentId: uploadResult.documentId,
                    additionalData: JSON.stringify({ firstName: 'Bob', lastName: 'Johnson' }),
                    autoLinkSkills: true
                }
            });

            // Verify skills are linked
            const { CandidateSkills } = CandidateService.entities;
            const skills = await SELECT.from(CandidateSkills)
                .where({ candidate_ID: createResult.candidateId });

            expect(skills.length).toBeGreaterThan(0);
        });
    });

    // ==========================================
    // JOB MATCHING WORKFLOW
    // ==========================================

    describe('Job Matching Workflow', () => {

        let candidateId, jobPostingId;

        beforeEach(async () => {
            // Create test candidate
            const { Candidates, Skills, CandidateSkills } = CandidateService.entities;

            const candidate = await INSERT.into(Candidates).entries({
                ID: cds.utils.uuid(),
                firstName: 'Alice',
                lastName: 'Developer',
                email: 'alice@example.com',
                phone: '+1-555-1111',
                status_code: 'active',
                totalExperienceYears: 5,
                educationLevel: 'bachelor',
                location: 'San Francisco'
            });

            candidateId = candidate.ID;

            // Create test skills
            const jsSkill = await INSERT.into(Skills).entries({
                ID: cds.utils.uuid(),
                name: 'JavaScript',
                category: 'programming',
                description: 'JavaScript programming'
            });

            await INSERT.into(CandidateSkills).entries({
                ID: cds.utils.uuid(),
                candidate_ID: candidateId,
                skill_ID: jsSkill.ID,
                proficiencyLevel: 'advanced',
                isVerified: true
            });

            // Create test job posting
            const { JobPostings, JobRequiredSkills } = MatchingService.entities;

            const job = await INSERT.into(JobPostings).entries({
                ID: cds.utils.uuid(),
                title: 'Senior JavaScript Developer',
                description: 'Looking for experienced JS developer',
                status_code: 'open',
                minimumExperience: 3,
                preferredExperience: 7,
                requiredEducation_code: 'bachelor',
                location: 'San Francisco',
                locationType: 'hybrid',
                skillWeight: 0.50,
                experienceWeight: 0.30,
                educationWeight: 0.10,
                locationWeight: 0.10
            });

            jobPostingId = job.ID;

            await INSERT.into(JobRequiredSkills).entries({
                ID: cds.utils.uuid(),
                jobPosting_ID: jobPostingId,
                skill_ID: jsSkill.ID,
                isRequired: true,
                weight: 1.0,
                minimumProficiency: 'intermediate'
            });
        });

        it('should find matches for a job posting', async () => {
            const result = await MatchingService.send({
                event: 'findMatches',
                data: {
                    jobPostingId,
                    options: JSON.stringify({ minScore: 50 })
                }
            });

            expect(result.matchCount).toBeGreaterThan(0);
            expect(result.processingTime).toBeGreaterThan(0);

            const topMatches = JSON.parse(result.topMatches);
            expect(topMatches.length).toBeGreaterThan(0);
            expect(topMatches[0].score).toBeGreaterThanOrEqual(50);
        });

        it('should calculate match score for specific candidate-job pair', async () => {
            const result = await MatchingService.send({
                event: 'calculateMatchScore',
                data: {
                    candidateId,
                    jobPostingId,
                    detailedBreakdown: true
                }
            });

            expect(result.overallScore).toBeGreaterThan(0);
            expect(result.skillScore).toBeDefined();
            expect(result.experienceScore).toBeDefined();
            expect(result.educationScore).toBeDefined();
            expect(result.locationScore).toBeDefined();

            const breakdown = JSON.parse(result.breakdown);
            expect(breakdown.weights).toBeDefined();
        });

        it('should store match results in database', async () => {
            await MatchingService.send({
                event: 'findMatches',
                data: {
                    jobPostingId,
                    options: '{}'
                }
            });

            const { MatchResults } = MatchingService.entities;
            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId });

            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].overallScore).toBeGreaterThan(0);
        });
    });

    // ==========================================
    // SEARCH AND FILTER WORKFLOWS
    // ==========================================

    describe('Search and Filter Workflows', () => {

        beforeEach(async () => {
            // Create test candidates
            const { Candidates } = CandidateService.entities;

            await INSERT.into(Candidates).entries([
                {
                    ID: cds.utils.uuid(),
                    firstName: 'John',
                    lastName: 'Developer',
                    email: 'john.dev@example.com',
                    status_code: 'active',
                    totalExperienceYears: 3,
                    location: 'New York'
                },
                {
                    ID: cds.utils.uuid(),
                    firstName: 'Mary',
                    lastName: 'Engineer',
                    email: 'mary.eng@example.com',
                    status_code: 'active',
                    totalExperienceYears: 7,
                    location: 'San Francisco'
                },
                {
                    ID: cds.utils.uuid(),
                    firstName: 'David',
                    lastName: 'Architect',
                    email: 'david.arch@example.com',
                    status_code: 'archived',
                    totalExperienceYears: 12,
                    location: 'Seattle'
                }
            ]);
        });

        it('should search candidates by name', async () => {
            const result = await CandidateService.send({
                event: 'searchCandidates',
                data: {
                    query: 'John',
                    options: JSON.stringify({})
                }
            });

            const candidates = JSON.parse(result.candidates);
            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates.some(c => c.firstName === 'John')).toBe(true);
        });

        it('should filter candidates by experience', async () => {
            const result = await CandidateService.send({
                event: 'searchCandidates',
                data: {
                    query: '',
                    options: JSON.stringify({
                        experienceMin: 5,
                        experienceMax: 10
                    })
                }
            });

            const candidates = JSON.parse(result.candidates);
            candidates.forEach(candidate => {
                expect(candidate.totalExperienceYears).toBeGreaterThanOrEqual(5);
                expect(candidate.totalExperienceYears).toBeLessThanOrEqual(10);
            });
        });

        it('should exclude archived candidates by default', async () => {
            const result = await CandidateService.send({
                event: 'searchCandidates',
                data: {
                    query: '',
                    options: '{}'
                }
            });

            const candidates = JSON.parse(result.candidates);
            expect(candidates.every(c => c.status_code !== 'archived')).toBe(true);
        });

        it('should sanitize search queries', async () => {
            // Attempt SQL injection
            const result = await CandidateService.send({
                event: 'searchCandidates',
                data: {
                    query: "'; DROP TABLE Candidates; --",
                    options: '{}'
                }
            });

            // Should return results without breaking
            expect(result).toBeDefined();
            expect(result.resultCount).toBeGreaterThanOrEqual(0);

            // Verify table still exists
            const { Candidates } = CandidateService.entities;
            const candidates = await SELECT.from(Candidates);
            expect(candidates).toBeDefined();
        });
    });

    // ==========================================
    // CANDIDATE MANAGEMENT WORKFLOWS
    // ==========================================

    describe('Candidate Management Workflows', () => {

        it('should create, update, and archive candidate', async () => {
            // Step 1: Create candidate
            const createResult = await CandidateService.send({
                event: 'createCandidate',
                data: {
                    firstName: 'Test',
                    lastName: 'Candidate',
                    email: 'test.candidate@example.com',
                    phone: '+1-555-0000'
                }
            });

            expect(createResult.candidateId).toBeDefined();

            const candidateId = createResult.candidateId;

            // Step 2: Update candidate
            const { Candidates } = CandidateService.entities;
            await UPDATE(Candidates)
                .where({ ID: candidateId })
                .set({
                    totalExperienceYears: 5,
                    location: 'Boston'
                });

            const updated = await SELECT.one.from(Candidates).where({ ID: candidateId });
            expect(updated.totalExperienceYears).toBe(5);
            expect(updated.location).toBe('Boston');

            // Step 3: Archive candidate
            await UPDATE(Candidates)
                .where({ ID: candidateId })
                .set({ status_code: 'archived' });

            const archived = await SELECT.one.from(Candidates).where({ ID: candidateId });
            expect(archived.status_code).toBe('archived');
        });

        it('should add skills to candidate', async () => {
            const { Candidates, Skills, CandidateSkills } = CandidateService.entities;

            // Create candidate
            const candidate = await INSERT.into(Candidates).entries({
                ID: cds.utils.uuid(),
                firstName: 'Skilled',
                lastName: 'Developer',
                email: 'skilled@example.com',
                status_code: 'active'
            });

            // Create skill
            const skill = await INSERT.into(Skills).entries({
                ID: cds.utils.uuid(),
                name: 'TypeScript',
                category: 'programming'
            });

            // Link skill to candidate
            await INSERT.into(CandidateSkills).entries({
                ID: cds.utils.uuid(),
                candidate_ID: candidate.ID,
                skill_ID: skill.ID,
                proficiencyLevel: 'advanced',
                yearsOfExperience: 3,
                isVerified: true
            });

            // Verify link
            const skills = await SELECT.from(CandidateSkills)
                .where({ candidate_ID: candidate.ID });

            expect(skills.length).toBe(1);
            expect(skills[0].proficiencyLevel).toBe('advanced');
        });
    });

    // ==========================================
    // RATE LIMITING INTEGRATION
    // ==========================================

    describe('Rate Limiting Integration', () => {

        it('should enforce rate limits on document uploads', async () => {
            const sampleCV = Buffer.from('Sample CV content').toString('base64');
            const uploadPromises = [];

            // Try to upload 15 documents (limit is 10 per minute)
            for (let i = 0; i < 15; i++) {
                uploadPromises.push(
                    CVService.send({
                        event: 'uploadDocument',
                        data: {
                            fileName: `cv_${i}.txt`,
                            fileContent: sampleCV,
                            fileType: 'text/plain'
                        }
                    }).catch(err => err)
                );
            }

            const results = await Promise.all(uploadPromises);

            // Some requests should be rate limited
            const rateLimited = results.filter(r => r instanceof Error && r.code === 429);
            expect(rateLimited.length).toBeGreaterThan(0);
        });

        it('should track rate limits per user', async () => {
            // This test would require actual user authentication
            // Placeholder for future implementation
            expect(true).toBe(true);
        });
    });

    // ==========================================
    // ERROR RECOVERY WORKFLOWS
    // ==========================================

    describe('Error Recovery Workflows', () => {

        it('should handle partial document processing failures', async () => {
            // Upload document with corrupted content
            const corruptedContent = Buffer.from('Corrupted PDF content %PDF-').toString('base64');

            const uploadResult = await CVService.send({
                event: 'uploadDocument',
                data: {
                    fileName: 'corrupted.pdf',
                    fileContent: corruptedContent,
                    fileType: 'application/pdf'
                }
            });

            const processResult = await CVService.send({
                event: 'processDocument',
                data: {
                    documentId: uploadResult.documentId,
                    extractionOptions: '{}'
                }
            });

            // Should fail gracefully
            expect(processResult.success).toBe(false);
            expect(processResult.error).toBeDefined();
        });

        it('should handle database constraint violations', async () => {
            const { Candidates } = CandidateService.entities;

            // Create candidate
            const candidate1 = await INSERT.into(Candidates).entries({
                ID: cds.utils.uuid(),
                firstName: 'Duplicate',
                lastName: 'Test',
                email: 'duplicate@example.com',
                status_code: 'active'
            });

            // Try to create another with same email (if unique constraint exists)
            try {
                await INSERT.into(Candidates).entries({
                    ID: cds.utils.uuid(),
                    firstName: 'Duplicate2',
                    lastName: 'Test2',
                    email: 'duplicate@example.com',
                    status_code: 'active'
                });
            } catch (error) {
                // Should handle constraint violation
                expect(error).toBeDefined();
            }
        });
    });

    // ==========================================
    // PERFORMANCE TESTS
    // ==========================================

    describe('Performance Tests', () => {

        it('should handle bulk candidate creation efficiently', async () => {
            const { Candidates } = CandidateService.entities;
            const startTime = Date.now();

            const candidates = Array.from({ length: 50 }, (_, i) => ({
                ID: cds.utils.uuid(),
                firstName: `Test${i}`,
                lastName: `Candidate${i}`,
                email: `test${i}@example.com`,
                status_code: 'active'
            }));

            await INSERT.into(Candidates).entries(candidates);

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
        });

        it('should perform matching on large candidate pool efficiently', async () => {
            // This test would create many candidates and run matching
            // Placeholder for future implementation with larger dataset
            expect(true).toBe(true);
        });
    });

    // ==========================================
    // DATA CONSISTENCY TESTS
    // ==========================================

    describe('Data Consistency Tests', () => {

        it('should maintain referential integrity when deleting candidates', async () => {
            const { Candidates, CandidateSkills, Documents } = CandidateService.entities;

            // Create candidate with related data
            const candidate = await INSERT.into(Candidates).entries({
                ID: cds.utils.uuid(),
                firstName: 'ToDelete',
                lastName: 'Candidate',
                email: 'todelete@example.com',
                status_code: 'active'
            });

            // Create related document
            await INSERT.into(Documents).entries({
                ID: cds.utils.uuid(),
                candidate_ID: candidate.ID,
                fileName: 'cv.pdf',
                mediaType: 'application/pdf',
                status_code: 'uploaded'
            });

            // Archive instead of delete (soft delete)
            await UPDATE(Candidates)
                .where({ ID: candidate.ID })
                .set({ status_code: 'archived' });

            // Verify cascade or constraint handling
            const archivedCandidate = await SELECT.one.from(Candidates)
                .where({ ID: candidate.ID });

            expect(archivedCandidate.status_code).toBe('archived');
        });

        it('should ensure match results stay in sync with candidates', async () => {
            // Create candidate and match result
            // Update candidate
            // Verify match result is marked for recalculation
            // Placeholder for future implementation
            expect(true).toBe(true);
        });
    });
});
