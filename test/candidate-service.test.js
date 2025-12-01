/**
 * Candidate Service Unit Tests
 * Following SAP CAP Testing Best Practices
 *
 * @see https://cap.cloud.sap/docs/node.js/cds-test
 */
'use strict';

const cds = require('@sap/cds');

describe('CandidateService', () => {
    const { expect } = cds.test(__dirname + '/..');

    let CandidateService;

    beforeAll(async () => {
        CandidateService = await cds.connect.to('CandidateService');
    });

    describe('Candidates CRUD', () => {
        let testCandidateId;

        it('should create a new candidate', async () => {
            const candidate = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                phone: '+1234567890',
                city: 'Berlin',
                country_code: 'DE',
                totalExperienceYears: 5.5
            };

            const result = await CandidateService.run(
                INSERT.into('Candidates').entries(candidate)
            );

            expect(result).to.exist;
            testCandidateId = result.ID;
            expect(testCandidateId).to.be.a('string');
        });

        it('should read candidate by ID', async () => {
            const candidate = await CandidateService.run(
                SELECT.one.from('Candidates').where({ ID: testCandidateId })
            );

            expect(candidate).to.exist;
            expect(candidate.firstName).to.equal('John');
            expect(candidate.lastName).to.equal('Doe');
            expect(candidate.email).to.equal('john.doe@example.com');
        });

        it('should update candidate', async () => {
            await CandidateService.run(
                UPDATE('Candidates')
                    .where({ ID: testCandidateId })
                    .set({ headline: 'Senior Developer' })
            );

            const updated = await CandidateService.run(
                SELECT.one.from('Candidates').where({ ID: testCandidateId })
            );

            expect(updated.headline).to.equal('Senior Developer');
        });

        it('should not allow duplicate email', async () => {
            const duplicate = {
                firstName: 'Jane',
                lastName: 'Doe',
                email: 'john.doe@example.com' // Same email
            };

            try {
                await CandidateService.run(
                    INSERT.into('Candidates').entries(duplicate)
                );
                expect.fail('Should have thrown error');
            } catch (error) {
                expect(error.code).to.equal('CONFLICT');
            }
        });

        it('should soft delete candidate', async () => {
            await CandidateService.run(
                DELETE.from('Candidates').where({ ID: testCandidateId })
            );

            // Direct DB query should show isDeleted = true
            const deleted = await cds.run(
                SELECT.one.from('cv.sorting.Candidates').where({ ID: testCandidateId })
            );

            expect(deleted.isDeleted).to.be.true;
        });
    });

    describe('Status Transitions', () => {
        let candidateId;

        beforeAll(async () => {
            const result = await CandidateService.run(
                INSERT.into('Candidates').entries({
                    firstName: 'Test',
                    lastName: 'Candidate',
                    email: 'test.status@example.com',
                    status_code: 'new'
                })
            );
            candidateId = result.ID;
        });

        it('should allow valid status transition new -> screening', async () => {
            const result = await CandidateService.updateStatus(candidateId, {
                newStatus: 'screening',
                notes: 'Moving to screening phase'
            });

            expect(result.status_code).to.equal('screening');
        });

        it('should allow valid status transition screening -> interviewing', async () => {
            const result = await CandidateService.updateStatus(candidateId, {
                newStatus: 'interviewing'
            });

            expect(result.status_code).to.equal('interviewing');
        });

        it('should reject invalid status transition', async () => {
            try {
                await CandidateService.updateStatus(candidateId, {
                    newStatus: 'hired' // Cannot go directly to hired
                });
                expect.fail('Should have thrown error');
            } catch (error) {
                expect(error.code).to.equal('BUSINESS_RULE_VIOLATION');
            }
        });
    });

    describe('Skills Management', () => {
        let candidateId;
        let skillId;

        beforeAll(async () => {
            // Create test candidate
            const candidate = await CandidateService.run(
                INSERT.into('Candidates').entries({
                    firstName: 'Skill',
                    lastName: 'Test',
                    email: 'skill.test@example.com'
                })
            );
            candidateId = candidate.ID;

            // Get a skill ID
            const skills = await CandidateService.run(
                SELECT.from('Skills').limit(1)
            );
            skillId = skills[0]?.ID;
        });

        it('should add skill to candidate', async () => {
            if (!skillId) {
                console.warn('No skills in database, skipping test');
                return;
            }

            const result = await CandidateService.addSkill(candidateId, {
                skillId,
                proficiencyLevel: 'advanced',
                yearsOfExperience: 3
            });

            expect(result).to.exist;
            expect(result.skill_ID).to.equal(skillId);
            expect(result.proficiencyLevel).to.equal('advanced');
        });

        it('should update existing skill instead of duplicating', async () => {
            if (!skillId) return;

            const result = await CandidateService.addSkill(candidateId, {
                skillId,
                proficiencyLevel: 'expert',
                yearsOfExperience: 5
            });

            expect(result.proficiencyLevel).to.equal('expert');
            expect(result.yearsOfExperience).to.equal(5);

            // Verify no duplicate
            const skills = await CandidateService.run(
                SELECT.from('CandidateSkills')
                    .where({ candidate_ID: candidateId, skill_ID: skillId })
            );
            expect(skills.length).to.equal(1);
        });
    });

    describe('Search Functionality', () => {
        beforeAll(async () => {
            // Create test candidates for search
            await CandidateService.run(
                INSERT.into('Candidates').entries([
                    {
                        firstName: 'Search',
                        lastName: 'One',
                        email: 'search.one@example.com',
                        totalExperienceYears: 3,
                        city: 'Berlin',
                        status_code: 'new'
                    },
                    {
                        firstName: 'Search',
                        lastName: 'Two',
                        email: 'search.two@example.com',
                        totalExperienceYears: 7,
                        city: 'Munich',
                        status_code: 'screening'
                    }
                ])
            );
        });

        it('should search by name', async () => {
            const results = await CandidateService.searchCandidates({
                query: 'Search',
                top: 10
            });

            expect(results.length).to.be.at.least(2);
            expect(results.every(c => c.firstName === 'Search')).to.be.true;
        });

        it('should filter by experience range', async () => {
            const results = await CandidateService.searchCandidates({
                minExperience: 5,
                top: 10
            });

            expect(results.every(c => c.totalExperienceYears >= 5)).to.be.true;
        });

        it('should filter by status', async () => {
            const results = await CandidateService.searchCandidates({
                statuses: ['new'],
                top: 10
            });

            expect(results.every(c => c.status_code === 'new')).to.be.true;
        });

        it('should filter by location', async () => {
            const results = await CandidateService.searchCandidates({
                locations: ['Berlin'],
                top: 10
            });

            expect(results.every(c => c.city === 'Berlin')).to.be.true;
        });
    });
});

describe('MatchingService', () => {
    const { expect } = cds.test(__dirname + '/..');

    let MatchingService;
    let testCandidateId;
    let testJobId;

    beforeAll(async () => {
        MatchingService = await cds.connect.to('MatchingService');

        // Create test candidate
        const CandidateService = await cds.connect.to('CandidateService');
        const candidate = await CandidateService.run(
            INSERT.into('Candidates').entries({
                firstName: 'Match',
                lastName: 'Test',
                email: 'match.test@example.com',
                totalExperienceYears: 5,
                city: 'Berlin',
                country_code: 'DE'
            })
        );
        testCandidateId = candidate.ID;

        // Create test job
        const JobService = await cds.connect.to('JobService');
        const job = await JobService.run(
            INSERT.into('JobPostings').entries({
                title: 'Test Developer Position',
                department: 'Engineering',
                location: 'Berlin',
                country_code: 'DE',
                locationType: 'hybrid',
                employmentType: 'full-time',
                minimumExperience: 3,
                preferredExperience: 5,
                status: 'open'
            })
        );
        testJobId = job.ID;
    });

    describe('Match Calculation', () => {
        it('should calculate match score', async () => {
            const result = await MatchingService.calculateMatch({
                candidateId: testCandidateId,
                jobPostingId: testJobId,
                includeBreakdown: true
            });

            expect(result).to.exist;
            expect(result.overallScore).to.be.a('number');
            expect(result.overallScore).to.be.at.least(0);
            expect(result.overallScore).to.be.at.most(100);
            expect(result.skillScore).to.exist;
            expect(result.experienceScore).to.exist;
            expect(result.educationScore).to.exist;
            expect(result.locationScore).to.exist;
        });

        it('should include breakdown when requested', async () => {
            const result = await MatchingService.calculateMatch({
                candidateId: testCandidateId,
                jobPostingId: testJobId,
                includeBreakdown: true
            });

            expect(result.breakdown).to.be.a('string');
            const breakdown = JSON.parse(result.breakdown);
            expect(breakdown.weights).to.exist;
        });
    });

    describe('Batch Matching', () => {
        it('should batch match candidates to job', async () => {
            const result = await MatchingService.batchMatch({
                jobPostingId: testJobId,
                minScore: 0
            });

            expect(result).to.exist;
            expect(result.totalProcessed).to.be.at.least(1);
            expect(result.processingTime).to.be.a('number');
        });
    });

    describe('Match Distribution', () => {
        it('should get match distribution for job', async () => {
            // First ensure matches exist
            await MatchingService.batchMatch({
                jobPostingId: testJobId,
                minScore: 0
            });

            const result = await MatchingService.getMatchDistribution({
                jobPostingId: testJobId
            });

            expect(result).to.exist;
            expect(result.totalMatches).to.be.at.least(0);
            expect(result.distribution).to.be.a('string');
        });
    });
});
