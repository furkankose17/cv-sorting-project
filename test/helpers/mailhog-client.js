const axios = require('axios');

class MailhogClient {
    constructor(baseUrl = 'http://localhost:8025') {
        this.baseUrl = baseUrl;
        this.apiUrl = `${baseUrl}/api/v2`;
    }

    /**
     * Get all messages from Mailhog
     */
    async getMessages() {
        const response = await axios.get(`${this.apiUrl}/messages`);
        return response.data.items || [];
    }

    /**
     * Get messages sent to a specific email
     */
    async getMessagesTo(email) {
        const messages = await this.getMessages();
        return messages.filter(msg =>
            msg.Raw.To.some(to => to.includes(email))
        );
    }

    /**
     * Search messages by content
     */
    async searchMessages(query) {
        const response = await axios.get(`${this.apiUrl}/search`, {
            params: { kind: 'containing', query }
        });
        return response.data.items || [];
    }

    /**
     * Delete all messages
     */
    async deleteAll() {
        await axios.delete(`${this.apiUrl}/messages`);
    }

    /**
     * Wait for a message to arrive (with timeout)
     */
    async waitForMessage(predicate, timeoutMs = 10000, pollIntervalMs = 500) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const messages = await this.getMessages();
            const found = messages.find(predicate);
            if (found) return found;
            await new Promise(r => setTimeout(r, pollIntervalMs));
        }
        throw new Error(`Timeout waiting for message after ${timeoutMs}ms`);
    }

    /**
     * Extract plain text body from message
     */
    getPlainTextBody(message) {
        return message.Content?.Body || '';
    }

    /**
     * Extract HTML body from message
     */
    getHtmlBody(message) {
        const parts = message.MIME?.Parts || [];
        const htmlPart = parts.find(p => p.Headers?.['Content-Type']?.[0]?.includes('text/html'));
        return htmlPart?.Body || '';
    }
}

module.exports = new MailhogClient();
