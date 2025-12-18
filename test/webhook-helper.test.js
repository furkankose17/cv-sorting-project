const nock = require('nock');
const webhookHelper = require('../srv/lib/webhook-helper');

describe('WebhookHelper', () => {
    const mockN8nUrl = 'http://localhost:5678/webhook';

    beforeEach(() => {
        // Clean up nock after each test
        nock.cleanAll();
        // Reset environment variables
        process.env.N8N_WEBHOOK_URL = mockN8nUrl;
        process.env.WEBHOOK_TIMEOUT_MS = '5000';
        process.env.WEBHOOK_RETRIES = '2';
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('sendWebhook', () => {
        test('should send webhook with correct data structure', async () => {
            const eventType = 'candidate-status-change';
            const payload = {
                candidateId: '123',
                oldStatus: 'applied',
                newStatus: 'screening'
            };

            const scope = nock(mockN8nUrl)
                .post(`/${eventType}`, (body) => {
                    // Verify the webhook payload structure
                    expect(body).toHaveProperty('eventType', eventType);
                    expect(body).toHaveProperty('payload', payload);
                    expect(body).toHaveProperty('timestamp');
                    expect(body).toHaveProperty('source', 'cap-service');
                    return true;
                })
                .reply(200, { success: true, webhookId: 'webhook-123' });

            const result = await webhookHelper.sendWebhook(eventType, payload);

            expect(result).toEqual({
                success: true,
                webhookId: 'webhook-123',
                error: null
            });
            expect(scope.isDone()).toBe(true);
        });

        test('should handle successful webhook response', async () => {
            const scope = nock(mockN8nUrl)
                .post('/test-event')
                .reply(200, { success: true, webhookId: 'test-webhook-id' });

            const result = await webhookHelper.sendWebhook('test-event', { test: 'data' });

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('test-webhook-id');
            expect(result.error).toBeNull();
            expect(scope.isDone()).toBe(true);
        });

        test('should retry on failure with exponential backoff', async () => {
            let attemptCount = 0;

            // First two attempts fail, third succeeds
            const scope1 = nock(mockN8nUrl)
                .post('/retry-test')
                .reply(500, { error: 'Server Error' });

            const scope2 = nock(mockN8nUrl)
                .post('/retry-test')
                .reply(500, { error: 'Server Error' });

            const scope3 = nock(mockN8nUrl)
                .post('/retry-test')
                .reply(200, { success: true, webhookId: 'retry-success' });

            const result = await webhookHelper.sendWebhook('retry-test', { data: 'retry' });

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('retry-success');
            expect(scope1.isDone()).toBe(true);
            expect(scope2.isDone()).toBe(true);
            expect(scope3.isDone()).toBe(true);
        });

        test('should return error after max retries exceeded', async () => {
            // All attempts fail
            const scope1 = nock(mockN8nUrl)
                .post('/max-retry-test')
                .reply(500, { error: 'Server Error' });

            const scope2 = nock(mockN8nUrl)
                .post('/max-retry-test')
                .reply(500, { error: 'Server Error' });

            const scope3 = nock(mockN8nUrl)
                .post('/max-retry-test')
                .reply(500, { error: 'Server Error' });

            const result = await webhookHelper.sendWebhook('max-retry-test', { data: 'fail' });

            expect(result.success).toBe(false);
            expect(result.webhookId).toBeNull();
            expect(result.error).toBeTruthy();
            expect(scope1.isDone()).toBe(true);
            expect(scope2.isDone()).toBe(true);
            expect(scope3.isDone()).toBe(true);
        });

        test('should handle timeout', async () => {
            // Set a very short timeout and reload module
            process.env.WEBHOOK_TIMEOUT_MS = '100';
            process.env.WEBHOOK_RETRIES = '0'; // No retries for faster test
            jest.resetModules();
            const helper = require('../srv/lib/webhook-helper');

            const scope = nock(mockN8nUrl)
                .post('/timeout-test')
                .delay(200) // Delay longer than timeout
                .reply(200, { success: true });

            const result = await helper.sendWebhook('timeout-test', { data: 'timeout' });

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
            expect(result.error).toMatch(/timeout/i);

            // Restore environment
            process.env.WEBHOOK_TIMEOUT_MS = '5000';
            process.env.WEBHOOK_RETRIES = '2';
        });

        test('should handle network errors', async () => {
            const scope = nock(mockN8nUrl)
                .post('/network-error')
                .times(3)
                .replyWithError('Network error occurred');

            const result = await webhookHelper.sendWebhook('network-error', { data: 'error' });

            expect(result.success).toBe(false);
            expect(result.webhookId).toBeNull();
            expect(result.error).toBeTruthy();
            expect(scope.isDone()).toBe(true);
        });
    });

    describe('sendStatusChangeWebhook', () => {
        test('should send status change webhook with correct format', async () => {
            const candidateId = 'candidate-123';
            const statusChange = {
                oldStatus: 'applied',
                newStatus: 'screening',
                changedBy: 'user@example.com',
                comments: 'Moving to screening'
            };

            const scope = nock(mockN8nUrl)
                .post('/candidate-status-change', (body) => {
                    expect(body.eventType).toBe('candidate-status-change');
                    expect(body.payload).toMatchObject({
                        candidateId,
                        ...statusChange
                    });
                    return true;
                })
                .reply(200, { success: true, webhookId: 'status-webhook-123' });

            const result = await webhookHelper.sendStatusChangeWebhook(candidateId, statusChange);

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('status-webhook-123');
            expect(scope.isDone()).toBe(true);
        });
    });

    describe('sendInterviewWebhook', () => {
        test('should send interview scheduled webhook', async () => {
            const interviewId = 'interview-123';
            const eventType = 'interview-scheduled';

            const scope = nock(mockN8nUrl)
                .post(`/${eventType}`, (body) => {
                    expect(body.eventType).toBe(eventType);
                    expect(body.payload).toMatchObject({
                        interviewId
                    });
                    return true;
                })
                .reply(200, { success: true, webhookId: 'interview-webhook-123' });

            const result = await webhookHelper.sendInterviewWebhook(interviewId, eventType);

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('interview-webhook-123');
            expect(scope.isDone()).toBe(true);
        });

        test('should send interview completed webhook', async () => {
            const interviewId = 'interview-456';
            const eventType = 'interview-completed';

            const scope = nock(mockN8nUrl)
                .post(`/${eventType}`, (body) => {
                    expect(body.eventType).toBe(eventType);
                    expect(body.payload.interviewId).toBe(interviewId);
                    return true;
                })
                .reply(200, { success: true, webhookId: 'interview-complete-webhook' });

            const result = await webhookHelper.sendInterviewWebhook(interviewId, eventType);

            expect(result.success).toBe(true);
            expect(scope.isDone()).toBe(true);
        });
    });

    describe('sendCVReceivedWebhook', () => {
        test('should send cv-received webhook with document details', async () => {
            const documentId = 'doc-123';
            const candidateId = 'candidate-456';
            const fileName = 'john_doe_resume.pdf';

            const scope = nock(mockN8nUrl)
                .post('/cv-received', (body) => {
                    expect(body.eventType).toBe('cv-received');
                    expect(body.payload).toMatchObject({
                        documentId,
                        candidateId,
                        fileName
                    });
                    return true;
                })
                .reply(200, { success: true, webhookId: 'cv-received-123' });

            const result = await webhookHelper.sendCVReceivedWebhook(documentId, candidateId, fileName);

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('cv-received-123');
            expect(scope.isDone()).toBe(true);
        });
    });

    describe('Configuration', () => {
        test('should use default values when env vars not set', async () => {
            delete process.env.N8N_WEBHOOK_URL;
            delete process.env.WEBHOOK_TIMEOUT_MS;
            delete process.env.WEBHOOK_RETRIES;

            // Need to reload the module to get new defaults
            jest.resetModules();
            const helper = require('../srv/lib/webhook-helper');

            expect(helper.n8nBaseUrl).toBe('http://localhost:5678/webhook');
            expect(helper.timeout).toBe(5000);
            expect(helper.retries).toBe(2);
        });
    });
});
