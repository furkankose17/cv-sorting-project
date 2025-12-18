const axios = require('axios');
const cds = require('@sap/cds');
const LOG = cds.log('webhook-helper');

class WebhookHelper {
    constructor() {
        this.n8nBaseUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';
        this.timeout = parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000;
        this.retries = parseInt(process.env.WEBHOOK_RETRIES) || 2;
    }

    /**
     * Send webhook notification to n8n
     * @param {string} eventType - Type of event (e.g., 'candidate-status-change')
     * @param {Object} payload - Event payload data
     * @returns {Promise<{success: boolean, webhookId: string|null, error: string|null}>}
     */
    async sendWebhook(eventType, payload) {
        const webhookUrl = `${this.n8nBaseUrl}/${eventType}`;
        const webhookData = {
            eventType,
            payload,
            timestamp: new Date().toISOString(),
            source: 'cap-service'
        };

        let lastError = null;

        // Attempt sending with retries
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            try {
                LOG.info(`Sending webhook to ${webhookUrl} (attempt ${attempt + 1}/${this.retries + 1})`);

                const response = await axios.post(webhookUrl, webhookData, {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                LOG.info(`Webhook sent successfully to ${webhookUrl}`, {
                    webhookId: response.data.webhookId,
                    status: response.status
                });

                return {
                    success: true,
                    webhookId: response.data.webhookId || null,
                    error: null
                };
            } catch (error) {
                lastError = error;

                const errorMessage = error.code === 'ECONNABORTED'
                    ? `Webhook timeout after ${this.timeout}ms`
                    : error.message;

                LOG.warn(`Webhook attempt ${attempt + 1} failed for ${webhookUrl}:`, errorMessage);

                // If not the last attempt, wait before retrying with exponential backoff
                if (attempt < this.retries) {
                    const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s...
                    LOG.info(`Retrying in ${backoffMs}ms...`);
                    await this.sleep(backoffMs);
                }
            }
        }

        // All retries exhausted
        const errorMessage = lastError?.code === 'ECONNABORTED'
            ? `Webhook timeout after ${this.timeout}ms`
            : lastError?.message || 'Unknown error';

        LOG.error(`Webhook failed after ${this.retries + 1} attempts to ${webhookUrl}:`, errorMessage);

        return {
            success: false,
            webhookId: null,
            error: errorMessage
        };
    }

    /**
     * Send status change webhook
     * @param {string} candidateId - Candidate ID
     * @param {Object} statusChange - Status change details
     * @returns {Promise<{success: boolean, webhookId: string|null, error: string|null}>}
     */
    async sendStatusChangeWebhook(candidateId, statusChange) {
        const payload = {
            candidateId,
            ...statusChange
        };

        return this.sendWebhook('candidate-status-change', payload);
    }

    /**
     * Send interview event webhook
     * @param {string} interviewId - Interview ID
     * @param {string} eventType - Event type (e.g., 'interview-scheduled', 'interview-completed')
     * @returns {Promise<{success: boolean, webhookId: string|null, error: string|null}>}
     */
    async sendInterviewWebhook(interviewId, eventType) {
        const payload = {
            interviewId
        };

        return this.sendWebhook(eventType, payload);
    }

    /**
     * Send CV received webhook
     * @param {string} documentId - Document ID
     * @param {string} candidateId - Candidate ID
     * @param {string} fileName - Original file name
     * @returns {Promise<{success: boolean, webhookId: string|null, error: string|null}>}
     */
    async sendCVReceivedWebhook(documentId, candidateId, fileName) {
        const payload = {
            documentId,
            candidateId,
            fileName
        };

        return this.sendWebhook('cv-received', payload);
    }

    /**
     * Sleep helper for retry backoff
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new WebhookHelper();
