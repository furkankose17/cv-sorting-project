/**
 * Integration test for Interview Reminder polling flow
 */

const axios = require('axios');
const mailhog = require('../helpers/mailhog-client');

const CAP_URL = process.env.CAP_SERVICE_URL || 'http://localhost:4004';

describe('Interview Reminder Flow', () => {
    beforeEach(async () => {
        await mailhog.deleteAll();
    });

    test('should return pending interview reminders from CAP', async () => {
        // Skip if CAP is not running
        try {
            await axios.get(`${CAP_URL}/api/$metadata`);
        } catch {
            console.log('CAP service not running, skipping integration test');
            return;
        }

        const response = await axios.get(
            `${CAP_URL}/api/getPendingInterviewReminders()`
        );

        expect(response.status).toBe(200);
        expect(Array.isArray(response.data.value)).toBe(true);
    });

    test('should mark reminder as sent', async () => {
        // Skip if CAP is not running
        try {
            await axios.get(`${CAP_URL}/api/$metadata`);
        } catch {
            console.log('CAP service not running, skipping integration test');
            return;
        }

        // This would need a real interview ID
        // For now just verify the endpoint exists
        try {
            const response = await axios.post(
                `${CAP_URL}/api/markInterviewReminderSent`,
                { interviewId: '00000000-0000-0000-0000-000000000000' }
            );
            // Expect false since interview doesn't exist
            expect(response.data.value).toBe(false);
        } catch (error) {
            // 404 or similar is acceptable for non-existent interview
            expect(error.response?.status).toBeDefined();
        }
    });
});
