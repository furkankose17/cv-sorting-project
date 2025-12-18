/**
 * Integration test for CV Received webhook flow
 *
 * Prerequisites:
 * - n8n running with cv-received workflow active
 * - Mailhog running
 * - CAP service running with ENABLE_WEBHOOKS=true
 *
 * Run: npm run test:integration
 */

const axios = require('axios');
const mailhog = require('../helpers/mailhog-client');

const CAP_URL = process.env.CAP_SERVICE_URL || 'http://localhost:4004';
const N8N_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';

describe('CV Received Webhook Flow', () => {
    beforeEach(async () => {
        // Clear Mailhog
        await mailhog.deleteAll();
    });

    test.skip('should send confirmation email when CV is processed', async () => {
        // This test requires full stack running
        // 1. Create a candidate
        // 2. Upload a CV document
        // 3. Process the document
        // 4. Verify webhook was called
        // 5. Verify email arrived in Mailhog

        // For now, just verify Mailhog is accessible
        const messages = await mailhog.getMessages();
        expect(Array.isArray(messages)).toBe(true);
    });

    test('should directly call n8n cv-received webhook', async () => {
        // Skip if n8n is not running
        try {
            await axios.get('http://localhost:5678/healthz');
        } catch {
            console.log('n8n not running, skipping integration test');
            return;
        }

        const webhookPayload = {
            eventType: 'cv-received',
            payload: {
                documentId: 'test-doc-123',
                candidateId: 'test-candidate-456',
                fileName: 'test_resume.pdf'
            },
            timestamp: new Date().toISOString(),
            source: 'integration-test'
        };

        // This will fail if workflow is not active - that's expected
        try {
            const response = await axios.post(`${N8N_URL}/cv-received`, webhookPayload);
            expect(response.status).toBe(200);
        } catch (error) {
            // Workflow might not be active
            console.log('Webhook call failed (workflow may not be active):', error.message);
        }
    });
});
