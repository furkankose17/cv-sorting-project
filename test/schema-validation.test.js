const cds = require('@sap/cds');

describe('CVDocuments Schema', () => {
    let db;

    beforeAll(async () => {
        await cds.deploy(__dirname + '/../db/schema');
        db = await cds.connect.to('db');
    });

    test('CVDocuments should have OCR fields', async () => {
        const { CVDocuments } = db.entities('cv.sorting');
        const metadata = CVDocuments.elements;

        expect(metadata.ocrStatus).toBeDefined();
        expect(metadata.ocrConfidence).toBeDefined();
        expect(metadata.extractedText).toBeDefined();
        expect(metadata.structuredData).toBeDefined();
        expect(metadata.ocrMethod).toBeDefined();
        expect(metadata.ocrProcessedAt).toBeDefined();
        expect(metadata.ocrProcessingTime).toBeDefined();
        expect(metadata.reviewedBy).toBeDefined();
        expect(metadata.reviewedAt).toBeDefined();
    });

    test('ocrStatus should have correct enum values', async () => {
        const { CVDocuments } = db.entities('cv.sorting');
        const ocrStatusElement = CVDocuments.elements.ocrStatus;

        expect(ocrStatusElement.enum).toBeDefined();
        expect(ocrStatusElement.enum).toEqual({
            pending: {},
            processing: {},
            completed: {},
            failed: {},
            review_required: {}
        });
    });

    test('ocrStatus should have default value of pending', async () => {
        const { CVDocuments } = db.entities('cv.sorting');
        const ocrStatusElement = CVDocuments.elements.ocrStatus;

        expect(ocrStatusElement.default).toBeDefined();
        expect(ocrStatusElement.default.val).toBe('pending');
    });

    test('ProcessingQueue entity should exist with required fields', async () => {
        const { ProcessingQueue } = db.entities('cv.sorting');
        const metadata = ProcessingQueue.elements;

        expect(metadata.userId).toBeDefined();
        expect(metadata.status).toBeDefined();
        expect(metadata.totalFiles).toBeDefined();
        expect(metadata.processedCount).toBeDefined();
        expect(metadata.autoCreatedCount).toBeDefined();
        expect(metadata.reviewRequiredCount).toBeDefined();
        expect(metadata.failedCount).toBeDefined();
        expect(metadata.currentFile).toBeDefined();
        expect(metadata.autoCreateThreshold).toBeDefined();
    });
});

describe('Email Automation Entities', () => {
    let db;

    beforeAll(async () => {
        await cds.deploy(__dirname + '/../db/schema');
        db = await cds.connect.to('db');
    });

    describe('EmailNotifications', () => {
        it('should create EmailNotifications record', async () => {
            const { EmailNotifications } = db.entities('cv.sorting');

            const notificationId = cds.utils.uuid();
            await INSERT.into(EmailNotifications).entries({
                ID: notificationId,
                notificationType: 'cv_received',
                recipientEmail: 'test@example.com',
                subject: 'Test Subject',
                sentAt: new Date().toISOString(),
                deliveryStatus: 'sent'
            });

            // Verify record was created
            const notification = await SELECT.one.from(EmailNotifications).where({ ID: notificationId });
            expect(notification).toBeDefined();
            expect(notification.ID).toBe(notificationId);
            expect(notification.notificationType).toBe('cv_received');
            expect(notification.recipientEmail).toBe('test@example.com');
        });

        it('should have EmailNotifications entity with required fields', async () => {
            const { EmailNotifications } = db.entities('cv.sorting');
            const metadata = EmailNotifications.elements;

            expect(metadata.ID).toBeDefined();
            expect(metadata.notificationType).toBeDefined();
            expect(metadata.recipientEmail).toBeDefined();
            expect(metadata.subject).toBeDefined();
            expect(metadata.sentAt).toBeDefined();
            expect(metadata.deliveryStatus).toBeDefined();
            expect(metadata.n8nExecutionId).toBeDefined();
        });

        it('should default deliveryStatus to queued when not specified', async () => {
            const { EmailNotifications } = db.entities('cv.sorting');

            const notificationId = cds.utils.uuid();
            await INSERT.into(EmailNotifications).entries({
                ID: notificationId,
                notificationType: 'cv_received',
                recipientEmail: 'test@example.com',
                subject: 'Test Subject'
                // deliveryStatus not specified
            });

            const notification = await SELECT.one.from(EmailNotifications).where({ ID: notificationId });
            expect(notification.deliveryStatus).toBe('queued');
        });

        it('should allow association to candidate', async () => {
            const { EmailNotifications, Candidates } = db.entities('cv.sorting');

            // Create a candidate first
            const candidateId = cds.utils.uuid();
            await INSERT.into(Candidates).entries({
                ID: candidateId,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com'
            });

            // Create notification with candidate association
            const notificationId = cds.utils.uuid();
            await INSERT.into(EmailNotifications).entries({
                ID: notificationId,
                candidate_ID: candidateId,
                notificationType: 'cv_received',
                recipientEmail: 'john.doe@example.com',
                subject: 'CV Received Confirmation'
            });

            // Verify association works
            const notification = await SELECT.one.from(EmailNotifications).where({ ID: notificationId });
            expect(notification).toBeDefined();
            expect(notification.candidate_ID).toBe(candidateId);

            // Verify candidate exists
            const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            expect(candidate).toBeDefined();
            expect(candidate.firstName).toBe('John');
            expect(candidate.lastName).toBe('Doe');
        });
    });
});
