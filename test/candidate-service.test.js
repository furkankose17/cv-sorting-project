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

    let CVSortingService;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
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

            const result = await CVSortingService.run(
                INSERT.into('Candidates').entries(candidate)
            );

            expect(result).to.exist;
            testCandidateId = result.ID;
            expect(testCandidateId).to.be.a('string');
        });

        it('should read candidate by ID', async () => {
            const candidate = await CVSortingService.run(
                SELECT.one.from('Candidates').where({ ID: testCandidateId })
            );

            expect(candidate).to.exist;
            expect(candidate.firstName).to.equal('John');
            expect(candidate.lastName).to.equal('Doe');
            expect(candidate.email).to.equal('john.doe@example.com');
        });

        it('should update candidate', async () => {
            await CVSortingService.run(
                UPDATE('Candidates')
                    .where({ ID: testCandidateId })
                    .set({ headline: 'Senior Developer' })
            );

            const updated = await CVSortingService.run(
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
                await CVSortingService.run(
                    INSERT.into('Candidates').entries(duplicate)
                );
                expect.fail('Should have thrown error');
            } catch (error) {
                expect(error.code).to.equal('CONFLICT');
            }
        });

        it('should soft delete candidate', async () => {
            await CVSortingService.run(
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
            const result = await CVSortingService.run(
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
            const candidate = await CVSortingService.run(
                INSERT.into('Candidates').entries({
                    firstName: 'Skill',
                    lastName: 'Test',
                    email: 'skill.test@example.com'
                })
            );
            candidateId = candidate.ID;

            // Get a skill ID
            const skills = await CVSortingService.run(
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
            const skills = await CVSortingService.run(
                SELECT.from('CandidateSkills')
                    .where({ candidate_ID: candidateId, skill_ID: skillId })
            );
            expect(skills.length).to.equal(1);
        });
    });

    describe('Search Functionality', () => {
        beforeAll(async () => {
            // Create test candidates for search
            await CVSortingService.run(
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

    let CVSortingService;
    let testCandidateId;
    let testJobId;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');

        // Create test candidate
        const candidate = await CVSortingService.run(
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
        // Job functionality now in CVSortingService;
        const job = await CVSortingService.run(
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

describe('Email Notification Functions', () => {
    const { expect } = cds.test(__dirname + '/..');
    const { v4: uuidv4 } = require('uuid');

    let CVSortingService;
    let db;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
        db = await cds.connect.to('db');
    });

    describe('getPendingStatusNotifications', () => {
        let candidateWithPendingNotification;
        let candidateWithSentNotification;

        beforeAll(async () => {
            // Create candidate with pending status change notification
            candidateWithPendingNotification = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.Candidates').entries({
                    ID: candidateWithPendingNotification,
                    firstName: 'Pending',
                    lastName: 'Notification',
                    email: 'pending.notification@example.com',
                    status_code: 'screening'
                })
            );

            // Add status history entry (status change from 'new' to 'screening')
            await db.run(
                INSERT.into('cv.sorting.CandidateStatusHistory').entries({
                    candidate_ID: candidateWithPendingNotification,
                    previousStatus_code: 'new',
                    newStatus_code: 'screening',
                    changedAt: new Date(),
                    changedBy: 'test-user'
                })
            );

            // Create candidate with status change AND sent notification
            candidateWithSentNotification = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.Candidates').entries({
                    ID: candidateWithSentNotification,
                    firstName: 'Already',
                    lastName: 'Notified',
                    email: 'already.notified@example.com',
                    status_code: 'interviewing'
                })
            );

            // Add status history entry with explicit ID
            const statusHistoryId = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.CandidateStatusHistory').entries({
                    ID: statusHistoryId,
                    candidate_ID: candidateWithSentNotification,
                    previousStatus_code: 'screening',
                    newStatus_code: 'interviewing',
                    changedAt: new Date(),
                    changedBy: 'test-user'
                })
            );

            // Add email notification record for this status change with statusHistory_ID
            await db.run(
                INSERT.into('cv.sorting.EmailNotifications').entries({
                    candidate_ID: candidateWithSentNotification,
                    statusHistory_ID: statusHistoryId,
                    notificationType: 'status_changed',
                    recipientEmail: 'already.notified@example.com',
                    subject: 'Status Changed',
                    sentAt: new Date(),
                    deliveryStatus: 'sent'
                })
            );
        });

        it('should return candidates with pending status change notifications', async () => {
            const result = await CVSortingService.getPendingStatusNotifications();

            expect(result).to.exist;
            expect(Array.isArray(result)).to.be.true;

            // Should include candidate with pending notification
            const pendingCandidate = result.find(r => r.candidate_ID === candidateWithPendingNotification);
            expect(pendingCandidate).to.exist;
            expect(pendingCandidate.recipientEmail).to.equal('pending.notification@example.com');
            expect(pendingCandidate.newStatus).to.exist;
            expect(pendingCandidate.previousStatus).to.exist;
        });

        it('should NOT return candidates with already sent notifications', async () => {
            const result = await CVSortingService.getPendingStatusNotifications();

            // Should NOT include candidate with sent notification
            const notifiedCandidate = result.find(r => r.candidate_ID === candidateWithSentNotification);
            expect(notifiedCandidate).to.not.exist;
        });
    });

    describe('markNotificationSent', () => {
        let testCandidateId;
        let testStatusHistoryId;

        beforeAll(async () => {
            // Create test candidate
            testCandidateId = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.Candidates').entries({
                    ID: testCandidateId,
                    firstName: 'Test',
                    lastName: 'Notification',
                    email: 'test.notification@example.com',
                    status_code: 'screening'
                })
            );

            // Create status history entry
            testStatusHistoryId = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.CandidateStatusHistory').entries({
                    ID: testStatusHistoryId,
                    candidate_ID: testCandidateId,
                    previousStatus_code: 'new',
                    newStatus_code: 'screening',
                    changedAt: new Date(),
                    changedBy: 'test-user'
                })
            );
        });

        it('should create EmailNotifications record with correct data', async () => {
            const result = await CVSortingService.markNotificationSent({
                statusHistory_ID: testStatusHistoryId,
                candidate_ID: testCandidateId,
                recipientEmail: 'test.notification@example.com',
                subject: 'Your Application Status Has Been Updated',
                templateUsed: 'status_change_notification',
                n8nExecutionId: 'exec_12345'
            });

            expect(result).to.exist;
            expect(result.success).to.be.true;
            expect(result.notificationId).to.be.a('string');

            // Verify the record was created in database
            const notification = await db.run(
                SELECT.one.from('cv.sorting.EmailNotifications')
                    .where({ ID: result.notificationId })
            );

            expect(notification).to.exist;
            expect(notification.statusHistory_ID).to.equal(testStatusHistoryId);
            expect(notification.candidate_ID).to.equal(testCandidateId);
            expect(notification.notificationType).to.equal('status_changed');
            expect(notification.deliveryStatus).to.equal('sent');
            expect(notification.recipientEmail).to.equal('test.notification@example.com');
            expect(notification.subject).to.equal('Your Application Status Has Been Updated');
            expect(notification.templateUsed).to.equal('status_change_notification');
            expect(notification.n8nExecutionId).to.equal('exec_12345');
            expect(notification.sentAt).to.exist;
        });

        it('should be idempotent - calling multiple times should not create duplicates', async () => {
            const params = {
                statusHistory_ID: testStatusHistoryId,
                candidate_ID: testCandidateId,
                recipientEmail: 'test.notification@example.com',
                subject: 'Your Application Status Has Been Updated',
                templateUsed: 'status_change_notification',
                n8nExecutionId: 'exec_idempotent_test'
            };

            // Call first time
            const result1 = await CVSortingService.markNotificationSent(params);
            expect(result1.success).to.be.true;

            // Call second time with same parameters
            const result2 = await CVSortingService.markNotificationSent(params);
            expect(result2.success).to.be.true;

            // Verify only one record exists for this combination
            const notifications = await db.run(
                SELECT.from('cv.sorting.EmailNotifications')
                    .where({
                        statusHistory_ID: testStatusHistoryId,
                        n8nExecutionId: 'exec_idempotent_test'
                    })
            );

            expect(notifications.length).to.equal(1);
        });

        it('should work with optional jobPosting_ID parameter', async () => {
            const jobPostingId = uuidv4();

            const result = await CVSortingService.markNotificationSent({
                statusHistory_ID: testStatusHistoryId,
                candidate_ID: testCandidateId,
                jobPosting_ID: jobPostingId,
                recipientEmail: 'test.notification@example.com',
                subject: 'Application Update',
                n8nExecutionId: 'exec_with_job'
            });

            expect(result.success).to.be.true;

            const notification = await db.run(
                SELECT.one.from('cv.sorting.EmailNotifications')
                    .where({ ID: result.notificationId })
            );

            expect(notification.jobPosting_ID).to.equal(jobPostingId);
        });

        it('should reject missing required parameters', async () => {
            const result = await CVSortingService.markNotificationSent({
                // Missing statusHistory_ID
                candidate_ID: testCandidateId,
                recipientEmail: 'test@example.com'
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('required parameters');
        });

        it('should reject invalid email format', async () => {
            const result = await CVSortingService.markNotificationSent({
                statusHistory_ID: uuidv4(),
                candidate_ID: testCandidateId,
                recipientEmail: 'invalid-email'  // No @ symbol
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('email');
        });

        it('should reject subject that exceeds max length', async () => {
            const result = await CVSortingService.markNotificationSent({
                statusHistory_ID: uuidv4(),
                candidate_ID: testCandidateId,
                recipientEmail: 'test@example.com',
                subject: 'x'.repeat(501)  // Exceeds 500 char limit
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('Subject');
        });
    });
});
