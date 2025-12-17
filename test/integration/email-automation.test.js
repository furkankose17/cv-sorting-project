const cds = require('@sap/cds');
const nock = require('nock');

describe('Email Automation Integration Tests', () => {
    let db, CVSortingService;
    let testCandidate, testJob;

    beforeAll(async () => {
        // Setup test environment - load the CDS model and services
        const csn = await cds.load('srv');
        await cds.deploy(csn).to('sqlite::memory:');

        // Get the service
        CVSortingService = cds.services.CVSortingService || await cds.serve('CVSortingService').from(csn);
        db = cds.db;
    });

    beforeEach(async () => {
        // Clear test data
        const { Candidates, CandidateStatusHistory, EmailNotifications, JobPostings, Interviews, InterviewCalendarEvents } = db.entities('cv.sorting');

        await DELETE.from(InterviewCalendarEvents);
        await DELETE.from(Interviews);
        await DELETE.from(EmailNotifications);
        await DELETE.from(CandidateStatusHistory);
        await DELETE.from(Candidates);
        await DELETE.from(JobPostings);

        // Create test job posting
        await INSERT.into(JobPostings).entries({
            ID: '11111111-1111-1111-1111-111111111111',
            title: 'Software Engineer',
            description: 'Test job description',
            department: 'Engineering',
            location: 'Remote',
            employmentType: 'Full-time',
            status: 'open',
            requiredExperience: 3,
            salaryMin: 60000,
            salaryMax: 90000
        });
        testJob = { ID: '11111111-1111-1111-1111-111111111111' };

        // Create test candidate
        await INSERT.into(Candidates).entries({
            ID: '22222222-2222-2222-2222-222222222222',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            currentStatus_code: 'new',
            jobPosting_ID: testJob.ID
        });
        testCandidate = { ID: '22222222-2222-2222-2222-222222222222' };

        // Clean up nock after each test
        nock.cleanAll();
    });

    afterAll(async () => {
        // Cleanup
        if (db && db.disconnect) {
            await db.disconnect();
        }
    });

    describe('Complete Status Change Workflow', () => {
        it('should track status change and enable email notification', async () => {
            const { Candidates, CandidateStatusHistory, EmailNotifications } = db.entities('cv.sorting');

            // Step 1: Update candidate status
            await UPDATE(Candidates)
                .set({ currentStatus_code: 'screening' })
                .where({ ID: testCandidate.ID });

            // Step 2: Verify CandidateStatusHistory record created
            const historyRecords = await SELECT.from(CandidateStatusHistory)
                .where({ candidate_ID: testCandidate.ID });

            expect(historyRecords).toHaveLength(1);
            expect(historyRecords[0].fromStatus_code).toBe('new');
            expect(historyRecords[0].toStatus_code).toBe('screening');

            // Step 3: Verify getPendingStatusNotifications returns the change
            const pendingNotifications = await CVSortingService.send({
                query: SELECT.from('CVSortingService.getPendingStatusNotifications')
            });

            expect(pendingNotifications).toHaveLength(1);
            expect(pendingNotifications[0].candidate_ID).toBe(testCandidate.ID);
            expect(pendingNotifications[0].recipientEmail).toBe('john.doe@example.com');
            expect(pendingNotifications[0].previousStatus).toBe('new');
            expect(pendingNotifications[0].newStatus).toBe('screening');

            // Step 4: Call markNotificationSent to mark it sent
            const markResult = await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: {
                    statusHistory_ID: historyRecords[0].ID,
                    candidate_ID: testCandidate.ID,
                    jobPosting_ID: testJob.ID,
                    recipientEmail: 'john.doe@example.com',
                    subject: 'Your Application Status Has Changed',
                    templateUsed: 'status_change_email',
                    n8nExecutionId: 'test-exec-001'
                }
            });

            expect(markResult.success).toBe(true);
            expect(markResult.notificationId).toBeTruthy();

            // Step 5: Verify EmailNotifications record created
            const emailNotifications = await SELECT.from(EmailNotifications)
                .where({ statusChange_ID: historyRecords[0].ID });

            expect(emailNotifications).toHaveLength(1);
            expect(emailNotifications[0].recipientEmail).toBe('john.doe@example.com');
            expect(emailNotifications[0].sentAt).toBeTruthy();

            // Step 6: Verify getPendingStatusNotifications no longer returns it
            const pendingAfterSent = await CVSortingService.send({
                query: SELECT.from('CVSortingService.getPendingStatusNotifications')
            });

            expect(pendingAfterSent).toHaveLength(0);
        });
    });

    describe('Multiple Status Changes', () => {
        it('should track all status changes and handle partial notifications', async () => {
            const { Candidates, CandidateStatusHistory } = db.entities('cv.sorting');

            // Update candidate status multiple times
            await UPDATE(Candidates)
                .set({ currentStatus_code: 'screening' })
                .where({ ID: testCandidate.ID });

            await UPDATE(Candidates)
                .set({ currentStatus_code: 'interviewing' })
                .where({ ID: testCandidate.ID });

            await UPDATE(Candidates)
                .set({ currentStatus_code: 'offered' })
                .where({ ID: testCandidate.ID });

            // Verify all changes tracked in history
            const historyRecords = await SELECT.from(CandidateStatusHistory)
                .where({ candidate_ID: testCandidate.ID })
                .orderBy('changedAt');

            expect(historyRecords).toHaveLength(3);
            expect(historyRecords[0].fromStatus_code).toBe('new');
            expect(historyRecords[0].toStatus_code).toBe('screening');
            expect(historyRecords[1].fromStatus_code).toBe('screening');
            expect(historyRecords[1].toStatus_code).toBe('interviewing');
            expect(historyRecords[2].fromStatus_code).toBe('interviewing');
            expect(historyRecords[2].toStatus_code).toBe('offered');

            // Verify all pending notifications returned
            const pendingNotifications = await CVSortingService.send({
                query: SELECT.from('CVSortingService.getPendingStatusNotifications')
            });

            expect(pendingNotifications).toHaveLength(3);

            // Mark first and third as sent
            await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: {
                    statusHistory_ID: historyRecords[0].ID,
                    candidate_ID: testCandidate.ID,
                    jobPosting_ID: testJob.ID,
                    recipientEmail: 'john.doe@example.com',
                    subject: 'Status Change: New → Screening'
                }
            });

            await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: {
                    statusHistory_ID: historyRecords[2].ID,
                    candidate_ID: testCandidate.ID,
                    jobPosting_ID: testJob.ID,
                    recipientEmail: 'john.doe@example.com',
                    subject: 'Status Change: Interviewing → Offered'
                }
            });

            // Verify only unmarked notification returned
            const pendingAfterPartial = await CVSortingService.send({
                query: SELECT.from('CVSortingService.getPendingStatusNotifications')
            });

            expect(pendingAfterPartial).toHaveLength(1);
            expect(pendingAfterPartial[0].previousStatus).toBe('screening');
            expect(pendingAfterPartial[0].newStatus).toBe('interviewing');
        });
    });

    describe('Webhook Integration', () => {
        const originalEnv = process.env.ENABLE_WEBHOOK_NOTIFICATIONS;

        afterEach(() => {
            process.env.ENABLE_WEBHOOK_NOTIFICATIONS = originalEnv;
        });

        it('should prepare notification data for webhook integration', async () => {
            const { Candidates } = db.entities('cv.sorting');

            // Update candidate status
            await UPDATE(Candidates)
                .set({ currentStatus_code: 'screening' })
                .where({ ID: testCandidate.ID });

            // Get pending notifications
            const pendingNotifications = await CVSortingService.send({
                query: SELECT.from('CVSortingService.getPendingStatusNotifications')
            });

            expect(pendingNotifications).toHaveLength(1);

            const notification = pendingNotifications[0];

            // Verify all required data for webhook is present
            expect(notification.candidate_ID).toBeTruthy();
            expect(notification.statusHistory_ID).toBeTruthy();
            expect(notification.recipientEmail).toBe('john.doe@example.com');
            expect(notification.previousStatus).toBe('new');
            expect(notification.newStatus).toBe('screening');
            expect(notification.changedAt).toBeTruthy();
        });
    });

    describe('Interview Calendar Events', () => {
        it('should create calendar events for interviews', async () => {
            const { Interviews, InterviewCalendarEvents } = db.entities('cv.sorting');

            // Create an interview
            const interviewDate = new Date();
            interviewDate.setDate(interviewDate.getDate() + 7); // 7 days from now

            const interviewID = '33333333-3333-3333-3333-333333333333';
            await INSERT.into(Interviews).entries({
                ID: interviewID,
                title: 'Technical Interview',
                candidate_ID: testCandidate.ID,
                jobPosting_ID: testJob.ID,
                scheduledAt: interviewDate.toISOString(),
                type_code: 'technical',
                status_code: 'scheduled',
                interviewerName: 'Jane Smith',
                interviewerEmail: 'jane.smith@example.com',
                location: 'Video Call',
                duration: 60
            });

            // Create calendar event
            await INSERT.into(InterviewCalendarEvents).entries({
                interview_ID: interviewID,
                eventID: 'cal-event-12345',
                calendarProvider: 'google',
                attendees: JSON.stringify([
                    { email: 'john.doe@example.com', name: 'John Doe', role: 'candidate' },
                    { email: 'jane.smith@example.com', name: 'Jane Smith', role: 'interviewer' }
                ])
            });

            // Verify calendar event created
            const calendarEvents = await SELECT.from(InterviewCalendarEvents)
                .where({ interview_ID: interviewID });

            expect(calendarEvents).toHaveLength(1);
            expect(calendarEvents[0].eventID).toBe('cal-event-12345');
            expect(calendarEvents[0].calendarProvider).toBe('google');

            const attendees = JSON.parse(calendarEvents[0].attendees);
            expect(attendees).toHaveLength(2);
            expect(attendees[0].email).toBe('john.doe@example.com');
            expect(attendees[1].email).toBe('jane.smith@example.com');
        });
    });

    describe('Idempotency', () => {
        it('should handle multiple markNotificationSent calls for same status change', async () => {
            const { Candidates, CandidateStatusHistory, EmailNotifications } = db.entities('cv.sorting');

            // Update candidate status
            await UPDATE(Candidates)
                .set({ currentStatus_code: 'screening' })
                .where({ ID: testCandidate.ID });

            // Get status change ID
            const historyRecords = await SELECT.from(CandidateStatusHistory)
                .where({ candidate_ID: testCandidate.ID });

            expect(historyRecords).toHaveLength(1);
            const statusHistoryID = historyRecords[0].ID;

            // Call markNotificationSent multiple times
            const requestData = {
                statusHistory_ID: statusHistoryID,
                candidate_ID: testCandidate.ID,
                jobPosting_ID: testJob.ID,
                recipientEmail: 'john.doe@example.com',
                subject: 'Test Subject'
            };

            const result1 = await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: requestData
            });

            const result2 = await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: requestData
            });

            const result3 = await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: requestData
            });

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            expect(result3.success).toBe(true);

            // Verify only one EmailNotifications record created (idempotency)
            const emailNotifications = await SELECT.from(EmailNotifications)
                .where({ statusChange_ID: statusHistoryID });

            expect(emailNotifications).toHaveLength(1);
        });
    });

    describe('Error Handling', () => {
        it('should handle missing required fields in markNotificationSent', async () => {
            const { Candidates, CandidateStatusHistory } = db.entities('cv.sorting');

            // Update candidate status
            await UPDATE(Candidates)
                .set({ currentStatus_code: 'screening' })
                .where({ ID: testCandidate.ID });

            // Get status change ID
            const historyRecords = await SELECT.from(CandidateStatusHistory)
                .where({ candidate_ID: testCandidate.ID });

            const statusHistoryID = historyRecords[0].ID;

            // Try to mark without candidate_ID
            const result1 = await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: {
                    statusHistory_ID: statusHistoryID,
                    recipientEmail: 'john.doe@example.com'
                }
            });

            expect(result1.success).toBe(false);
            expect(result1.error).toContain('Missing required parameters');

            // Try to mark without recipientEmail
            const result2 = await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: {
                    statusHistory_ID: statusHistoryID,
                    candidate_ID: testCandidate.ID
                }
            });

            expect(result2.success).toBe(false);
            expect(result2.error).toContain('Missing required parameters');
        });

        it('should handle getPendingStatusNotifications with no pending notifications', async () => {
            // Don't create any status changes
            const pendingNotifications = await CVSortingService.send({
                query: SELECT.from('CVSortingService.getPendingStatusNotifications')
            });

            expect(pendingNotifications).toHaveLength(0);
        });

        it('should handle invalid email format', async () => {
            const { Candidates, CandidateStatusHistory } = db.entities('cv.sorting');

            // Update candidate status
            await UPDATE(Candidates)
                .set({ currentStatus_code: 'screening' })
                .where({ ID: testCandidate.ID });

            // Get status change ID
            const historyRecords = await SELECT.from(CandidateStatusHistory)
                .where({ candidate_ID: testCandidate.ID });

            // Try with invalid email
            const result = await CVSortingService.send({
                method: 'POST',
                path: '/markNotificationSent',
                data: {
                    statusHistory_ID: historyRecords[0].ID,
                    candidate_ID: testCandidate.ID,
                    recipientEmail: 'invalid-email',
                    subject: 'Test'
                }
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid email');
        });
    });

    describe('Email Template Variable Population', () => {
        it('should provide all necessary variables for email templates', async () => {
            const { Candidates } = db.entities('cv.sorting');

            // Update candidate status
            await UPDATE(Candidates)
                .set({ currentStatus_code: 'screening' })
                .where({ ID: testCandidate.ID });

            // Get pending notifications
            const pendingNotifications = await CVSortingService.send({
                query: SELECT.from('CVSortingService.getPendingStatusNotifications')
            });

            expect(pendingNotifications).toHaveLength(1);

            const notification = pendingNotifications[0];

            // Verify all template variables are present
            expect(notification.candidate_ID).toBeTruthy();
            expect(notification.statusHistory_ID).toBeTruthy();
            expect(notification.recipientEmail).toBe('john.doe@example.com');
            expect(notification.previousStatus).toBe('new');
            expect(notification.newStatus).toBe('screening');
            expect(notification.changedAt).toBeTruthy();

            // Verify date format is usable
            const changedDate = new Date(notification.changedAt);
            expect(changedDate.getTime()).toBeGreaterThan(0);
        });
    });
});
