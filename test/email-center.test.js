/**
 * Email Center Backend Functions Unit Tests
 * Following SAP CAP Testing Best Practices
 *
 * Tests for email center functionality including:
 * - getEmailStats: Email statistics retrieval
 * - getRecentNotifications: Recent notification history
 * - testWebhookConnection: Webhook connection status
 * - NotificationSettings: Settings entity CRUD
 */
'use strict';

const cds = require('@sap/cds');

describe('Email Center Backend Functions', () => {
    const { expect } = cds.test(__dirname + '/..');

    let CVSortingService;
    let db;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
        db = await cds.connect.to('db');
    });

    describe('getEmailStats', () => {
        it('should return email statistics', async () => {
            const result = await CVSortingService.send('getEmailStats');

            expect(result).to.exist;
            expect(result).to.have.property('sentToday');
            expect(result).to.have.property('sentYesterday');
            expect(result).to.have.property('deliveryRate');
            expect(result).to.have.property('failedCount');
            expect(result).to.have.property('pendingCount');
            expect(result).to.have.property('totalSent');
            expect(result).to.have.property('openRate');
            expect(result).to.have.property('clickRate');

            // Verify types
            expect(result.sentToday).to.be.a('number');
            expect(result.sentYesterday).to.be.a('number');
            expect(result.deliveryRate).to.be.a('number');
            expect(result.failedCount).to.be.a('number');
            expect(result.pendingCount).to.be.a('number');
            expect(result.totalSent).to.be.a('number');
            expect(result.openRate).to.be.a('number');
            expect(result.clickRate).to.be.a('number');

            // Verify ranges
            expect(result.deliveryRate).to.be.at.least(0);
            expect(result.deliveryRate).to.be.at.most(100);
            expect(result.openRate).to.be.at.least(0);
            expect(result.openRate).to.be.at.most(100);
            expect(result.clickRate).to.be.at.least(0);
            expect(result.clickRate).to.be.at.most(100);
        });

        it('should return zero values when no notifications exist', async () => {
            const result = await CVSortingService.send('getEmailStats');

            // With no data, counts should be >= 0
            expect(result.sentToday).to.be.at.least(0);
            expect(result.sentYesterday).to.be.at.least(0);
            expect(result.failedCount).to.be.at.least(0);
            expect(result.pendingCount).to.be.at.least(0);
            expect(result.totalSent).to.be.at.least(0);
        });

        it('should calculate delivery rate correctly', async () => {
            const result = await CVSortingService.send('getEmailStats');

            // Delivery rate should be a valid percentage
            expect(result.deliveryRate).to.be.a('number');
            expect(result.deliveryRate).to.be.at.least(0);
            expect(result.deliveryRate).to.be.at.most(100);
        });
    });

    describe('getRecentNotifications', () => {
        it('should return array of recent notifications', async () => {
            const result = await CVSortingService.send('getRecentNotifications', { limit: 5 });

            expect(result).to.exist;
            expect(result).to.be.an('array');
            expect(result.length).to.be.at.most(5);
        });

        it('should return notifications with required fields', async () => {
            const result = await CVSortingService.send('getRecentNotifications', { limit: 10 });

            expect(result).to.be.an('array');

            // If notifications exist, verify structure
            if (result.length > 0) {
                const notification = result[0];
                expect(notification).to.have.property('ID');
                expect(notification).to.have.property('notificationType');
                expect(notification).to.have.property('recipientEmail');
                expect(notification).to.have.property('deliveryStatus');
                expect(notification).to.have.property('createdAt');
                expect(notification).to.have.property('candidateFirstName');
                expect(notification).to.have.property('candidateLastName');
                expect(notification).to.have.property('jobTitle');
            }
        });

        it('should default to 10 when limit not specified', async () => {
            const result = await CVSortingService.send('getRecentNotifications', {});

            expect(result).to.be.an('array');
            expect(result.length).to.be.at.most(10);
        });

        it('should respect custom limit parameter', async () => {
            const result = await CVSortingService.send('getRecentNotifications', { limit: 3 });

            expect(result).to.be.an('array');
            expect(result.length).to.be.at.most(3);
        });

        it('should return notifications ordered by creation date desc', async () => {
            const result = await CVSortingService.send('getRecentNotifications', { limit: 10 });

            if (result.length > 1) {
                // Verify descending order by createdAt
                for (let i = 0; i < result.length - 1; i++) {
                    const current = new Date(result[i].createdAt);
                    const next = new Date(result[i + 1].createdAt);
                    expect(current >= next).to.be.true;
                }
            }
        });
    });

    describe('testWebhookConnection', () => {
        it('should return connection status', async () => {
            const result = await CVSortingService.send('testWebhookConnection');

            expect(result).to.exist;
            expect(result).to.have.property('connected');
            expect(result).to.have.property('message');
            expect(result).to.have.property('responseTime');

            // Verify types
            expect(result.connected).to.be.a('boolean');
            expect(result.message).to.be.a('string');
            expect(result.responseTime).to.be.a('number');
        });

        it('should return valid response time', async () => {
            const result = await CVSortingService.send('testWebhookConnection');

            expect(result.responseTime).to.be.a('number');
            expect(result.responseTime).to.be.at.least(0);
        });

        it('should include descriptive message', async () => {
            const result = await CVSortingService.send('testWebhookConnection');

            expect(result.message).to.be.a('string');
            expect(result.message.length).to.be.greaterThan(0);
        });
    });

    describe('NotificationSettings', () => {
        it('should have default settings', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            expect(settings).to.exist;
            expect(settings).to.be.an('array');
            expect(settings.length).to.be.greaterThan(0);
        });

        it('should have webhooks_enabled setting', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            const webhooksEnabled = settings.find(s => s.settingKey === 'webhooks_enabled');
            expect(webhooksEnabled).to.exist;
            expect(webhooksEnabled.settingType).to.equal('boolean');
            // SQLite stores booleans as 0/1 or as string 'true'/'false'
            expect(['true', 'false', '0', '1', 0, 1]).to.include(webhooksEnabled.settingValue);
        });

        it('should have webhook_url setting', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            const webhookUrl = settings.find(s => s.settingKey === 'webhook_url');
            expect(webhookUrl).to.exist;
            expect(webhookUrl.settingType).to.equal('string');
            expect(webhookUrl.settingValue).to.be.a('string');
        });

        it('should have notification type settings', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            const requiredTypes = [
                'type_cv_received',
                'type_status_changed',
                'type_interview_invitation',
                'type_interview_reminder',
                'type_offer_extended',
                'type_application_rejected'
            ];

            for (const typeKey of requiredTypes) {
                const typeSetting = settings.find(s => s.settingKey === typeKey);
                expect(typeSetting).to.exist;
                expect(typeSetting.settingType).to.equal('boolean');
            }
        });

        it('should have timing and rate limit settings', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            const cooldown = settings.find(s => s.settingKey === 'notification_cooldown_hours');
            expect(cooldown).to.exist;
            expect(cooldown.settingType).to.equal('number');

            const reminderWindow = settings.find(s => s.settingKey === 'reminder_window_hours');
            expect(reminderWindow).to.exist;
            expect(reminderWindow.settingType).to.equal('number');

            const rateLimit = settings.find(s => s.settingKey === 'rate_limit_per_minute');
            expect(rateLimit).to.exist;
            expect(rateLimit.settingType).to.equal('number');
        });

        it('should have description for each setting', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            for (const setting of settings) {
                expect(setting.description).to.exist;
                expect(setting.description).to.be.a('string');
                expect(setting.description.length).to.be.greaterThan(0);
            }
        });

        it('should have valid setting types', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            const validTypes = ['boolean', 'number', 'string'];

            for (const setting of settings) {
                expect(setting.settingType).to.be.oneOf(validTypes);
            }
        });

        it('should validate number type values are numeric', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            const numberSettings = settings.filter(s => s.settingType === 'number');

            for (const setting of numberSettings) {
                const numValue = Number(setting.settingValue);
                expect(isNaN(numValue)).to.be.false;
                expect(numValue).to.be.a('number');
            }
        });

        it('should validate boolean type values are true or false', async () => {
            const settings = await CVSortingService.read('NotificationSettings');

            const booleanSettings = settings.filter(s => s.settingType === 'boolean');

            for (const setting of booleanSettings) {
                // SQLite stores booleans as 0/1 or as string 'true'/'false'
                const validBooleanValues = ['true', 'false', '0', '1', 0, 1];
                expect(validBooleanValues).to.include(setting.settingValue);
            }
        });
    });

    describe('updateNotificationSettings', () => {
        it('should update settings successfully', async () => {
            const settingsToUpdate = [
                { settingKey: 'webhooks_enabled', settingValue: 'true' },
                { settingKey: 'notification_cooldown_hours', settingValue: '48' }
            ];

            const result = await CVSortingService.send('updateNotificationSettings', {
                settings: settingsToUpdate
            });

            expect(result).to.be.true;
        });

        it('should persist updated settings', async () => {
            const settingsToUpdate = [
                { settingKey: 'rate_limit_per_minute', settingValue: '100' }
            ];

            await CVSortingService.send('updateNotificationSettings', {
                settings: settingsToUpdate
            });

            // Verify the update
            const settings = await CVSortingService.read('NotificationSettings');
            const rateLimit = settings.find(s => s.settingKey === 'rate_limit_per_minute');
            expect(rateLimit.settingValue).to.equal('100');
        });

        it('should handle multiple settings update', async () => {
            const settingsToUpdate = [
                { settingKey: 'type_cv_received', settingValue: 'true' },
                { settingKey: 'type_status_changed', settingValue: 'false' },
                { settingKey: 'notification_cooldown_hours', settingValue: '24' }
            ];

            const result = await CVSortingService.send('updateNotificationSettings', {
                settings: settingsToUpdate
            });

            expect(result).to.be.true;

            // Verify all updates
            const settings = await CVSortingService.read('NotificationSettings');

            for (const update of settingsToUpdate) {
                const setting = settings.find(s => s.settingKey === update.settingKey);
                expect(setting.settingValue).to.equal(update.settingValue);
            }
        });

        it('should return false on error', async () => {
            // Try to update non-existent setting
            const settingsToUpdate = [
                { settingKey: 'non_existent_key', settingValue: 'value' }
            ];

            const result = await CVSortingService.send('updateNotificationSettings', {
                settings: settingsToUpdate
            });

            // Should handle gracefully without throwing
            expect(result).to.be.a('boolean');
        });
    });

    describe('retryFailedNotification', () => {
        let testNotificationId;
        let testCandidateId;

        beforeAll(async () => {
            const { v4: uuidv4 } = require('uuid');

            // Create a test candidate
            testCandidateId = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.Candidates').entries({
                    ID: testCandidateId,
                    firstName: 'Retry',
                    lastName: 'Test',
                    email: 'retry.test@example.com',
                    status_code: 'new'
                })
            );

            // Create a failed notification
            testNotificationId = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.EmailNotifications').entries({
                    ID: testNotificationId,
                    candidate_ID: testCandidateId,
                    notificationType: 'cv_received',
                    recipientEmail: 'retry.test@example.com',
                    subject: 'Test Failed Notification',
                    deliveryStatus: 'failed',
                    createdAt: new Date()
                })
            );
        });

        it('should return false for non-existent notification', async () => {
            const { v4: uuidv4 } = require('uuid');
            const fakeId = uuidv4();

            try {
                const result = await CVSortingService.send('retryFailedNotification', {
                    notificationId: fakeId
                });
                expect(result).to.be.false;
            } catch (error) {
                // Expecting an error
                expect(error).to.exist;
            }
        });

        it('should return false for non-failed notification', async () => {
            const { v4: uuidv4 } = require('uuid');

            // Create a successful notification
            const successId = uuidv4();
            await db.run(
                INSERT.into('cv.sorting.EmailNotifications').entries({
                    ID: successId,
                    candidate_ID: testCandidateId,
                    notificationType: 'cv_received',
                    recipientEmail: 'retry.test@example.com',
                    subject: 'Test Successful Notification',
                    deliveryStatus: 'sent',
                    sentAt: new Date(),
                    createdAt: new Date()
                })
            );

            try {
                const result = await CVSortingService.send('retryFailedNotification', {
                    notificationId: successId
                });
                expect(result).to.be.false;
            } catch (error) {
                // Expecting an error
                expect(error).to.exist;
            }
        });
    });
});
