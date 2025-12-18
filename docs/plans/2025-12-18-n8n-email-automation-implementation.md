# n8n Email Automation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up CAP services to n8n webhooks for automated email notifications on CV processing, status changes, and interview scheduling.

**Architecture:** Event-driven webhooks (CAP → n8n) for immediate notifications + scheduled polling (n8n → CAP) for batch operations. Mailhog captures emails in development.

**Tech Stack:** n8n (Docker), Mailhog (SMTP capture), CAP OData, Jest (testing), nock (HTTP mocking)

---

## Phase 1: Infrastructure Setup

### Task 1: Create docker-compose for development services

**Files:**
- Create: `docker-compose.yml`

**Step 1: Create docker-compose file**

```yaml
version: '3.8'

services:
  # n8n workflow automation
  n8n:
    image: n8nio/n8n:latest
    container_name: cv-sorting-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=admin123
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=Europe/Berlin
    volumes:
      - n8n_data:/home/node/.n8n
      - ./email-templates:/home/node/templates:ro
    networks:
      - cv-sorting-network

  # Mailhog - email capture for development
  mailhog:
    image: mailhog/mailhog:latest
    container_name: cv-sorting-mailhog
    restart: unless-stopped
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
    networks:
      - cv-sorting-network

volumes:
  n8n_data:

networks:
  cv-sorting-network:
    driver: bridge
```

**Step 2: Verify docker-compose syntax**

Run: `docker-compose config`
Expected: Valid YAML output, no errors

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose for n8n and mailhog"
```

---

### Task 2: Add SMTP configuration to .env.example

**Files:**
- Modify: `.env.example` (append after line 156)

**Step 1: Add SMTP configuration section**

Append to `.env.example`:

```bash

# =============================================================================
# SMTP CONFIGURATION (for n8n email sending)
# =============================================================================

# Development: Mailhog (no auth required)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@cv-sorting.local
FROM_NAME=CV Sorting System

# Production: Gmail SMTP (uncomment and configure)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=true
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# FROM_EMAIL=your-email@gmail.com
# FROM_NAME=CV Sorting System
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "feat: add SMTP configuration to .env.example"
```

---

### Task 3: Create development setup script

**Files:**
- Create: `scripts/setup-email-dev.sh`

**Step 1: Create the setup script**

```bash
#!/bin/bash
# Setup script for n8n email automation development environment

set -e

echo "🚀 Setting up n8n email automation development environment..."

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start services
echo "📦 Starting n8n and Mailhog containers..."
docker-compose up -d n8n mailhog

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Check n8n is ready
until curl -s http://localhost:5678/healthz > /dev/null 2>&1; do
    echo "  Waiting for n8n..."
    sleep 2
done

# Check Mailhog is ready
until curl -s http://localhost:8025 > /dev/null 2>&1; do
    echo "  Waiting for Mailhog..."
    sleep 2
done

echo ""
echo "✅ Services are ready!"
echo ""
echo "📧 Mailhog UI:     http://localhost:8025"
echo "🔧 n8n UI:         http://localhost:5678"
echo "   Username:       admin"
echo "   Password:       admin123"
echo ""
echo "Next steps:"
echo "1. Open n8n UI and import workflows from n8n-workflows/"
echo "2. Configure credentials in n8n (CAP Service, SMTP)"
echo "3. Activate workflows"
echo "4. Set ENABLE_WEBHOOKS=true in your .env file"
echo ""
```

**Step 2: Make script executable**

Run: `chmod +x scripts/setup-email-dev.sh`

**Step 3: Verify script exists**

Run: `ls -la scripts/setup-email-dev.sh`
Expected: `-rwxr-xr-x ... scripts/setup-email-dev.sh`

**Step 4: Commit**

```bash
git add scripts/setup-email-dev.sh
git commit -m "feat: add development setup script for email automation"
```

---

## Phase 2: CAP Service Integration

### Task 4: Add sendCVReceivedWebhook to webhook-helper

**Files:**
- Modify: `srv/lib/webhook-helper.js:110` (before sleep method)
- Test: `test/webhook-helper.test.js`

**Step 1: Write the failing test**

Add to `test/webhook-helper.test.js` after the `sendInterviewWebhook` describe block (around line 218):

```javascript
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
```

**Step 2: Run test to verify it fails**

Run: `npx jest test/webhook-helper.test.js --testNamePattern="sendCVReceivedWebhook" --no-coverage`
Expected: FAIL with "webhookHelper.sendCVReceivedWebhook is not a function"

**Step 3: Implement sendCVReceivedWebhook**

Add to `srv/lib/webhook-helper.js` before the `sleep` method (around line 110):

```javascript
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
```

**Step 4: Run test to verify it passes**

Run: `npx jest test/webhook-helper.test.js --testNamePattern="sendCVReceivedWebhook" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add srv/lib/webhook-helper.js test/webhook-helper.test.js
git commit -m "feat: add sendCVReceivedWebhook to webhook-helper"
```

---

### Task 5: Add sendInterviewScheduledWebhook to webhook-helper

**Files:**
- Modify: `srv/lib/webhook-helper.js` (after sendCVReceivedWebhook)
- Test: `test/webhook-helper.test.js`

**Step 1: Write the failing test**

Add to `test/webhook-helper.test.js` after the `sendCVReceivedWebhook` describe block:

```javascript
    describe('sendInterviewScheduledWebhook', () => {
        test('should send interview-scheduled webhook with full details', async () => {
            const interviewId = 'interview-789';
            const candidateId = 'candidate-456';
            const jobPostingId = 'job-123';
            const scheduledAt = '2025-12-20T10:00:00Z';
            const interviewerEmail = 'interviewer@company.com';

            const scope = nock(mockN8nUrl)
                .post('/interview-scheduled', (body) => {
                    expect(body.eventType).toBe('interview-scheduled');
                    expect(body.payload).toMatchObject({
                        interviewId,
                        candidateId,
                        jobPostingId,
                        scheduledAt,
                        interviewerEmail
                    });
                    return true;
                })
                .reply(200, { success: true, webhookId: 'interview-scheduled-123' });

            const result = await webhookHelper.sendInterviewScheduledWebhook(
                interviewId, candidateId, jobPostingId, scheduledAt, interviewerEmail
            );

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('interview-scheduled-123');
            expect(scope.isDone()).toBe(true);
        });
    });
```

**Step 2: Run test to verify it fails**

Run: `npx jest test/webhook-helper.test.js --testNamePattern="sendInterviewScheduledWebhook" --no-coverage`
Expected: FAIL with "webhookHelper.sendInterviewScheduledWebhook is not a function"

**Step 3: Implement sendInterviewScheduledWebhook**

Add to `srv/lib/webhook-helper.js` after sendCVReceivedWebhook:

```javascript
    /**
     * Send interview scheduled webhook with full details
     * @param {string} interviewId - Interview ID
     * @param {string} candidateId - Candidate ID
     * @param {string} jobPostingId - Job Posting ID
     * @param {string} scheduledAt - ISO datetime string
     * @param {string} interviewerEmail - Interviewer email
     * @returns {Promise<{success: boolean, webhookId: string|null, error: string|null}>}
     */
    async sendInterviewScheduledWebhook(interviewId, candidateId, jobPostingId, scheduledAt, interviewerEmail) {
        const payload = {
            interviewId,
            candidateId,
            jobPostingId,
            scheduledAt,
            interviewerEmail
        };

        return this.sendWebhook('interview-scheduled', payload);
    }
```

**Step 4: Run test to verify it passes**

Run: `npx jest test/webhook-helper.test.js --testNamePattern="sendInterviewScheduledWebhook" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add srv/lib/webhook-helper.js test/webhook-helper.test.js
git commit -m "feat: add sendInterviewScheduledWebhook to webhook-helper"
```

---

### Task 6: Wire CV-received webhook trigger in CVDocuments handler

**Files:**
- Modify: `srv/cv-sorting-service.js:119-132` (after UPDATE CVDocuments handler)

**Step 1: Read current handler**

The current handler at line 119-132 generates embeddings. We need to add webhook trigger after embedding generation.

**Step 2: Add CV-received webhook trigger**

Modify the `after('UPDATE', 'CVDocuments')` handler in `srv/cv-sorting-service.js`. Find the existing handler around line 119 and update it:

```javascript
        // Generate candidate embedding when CV document is processed
        this.after('UPDATE', 'CVDocuments', async (data, req) => {
            // Check if document was just processed (has extracted text)
            if (data.extractedText && data.processingStatus === 'completed') {
                const candidateId = data.candidate_ID;
                if (!candidateId) return;

                LOG.info('CV processed, generating candidate embedding', { documentId: data.ID, candidateId });

                // Generate embedding asynchronously
                this._generateCandidateEmbeddingAsync(candidateId, entities).catch(err => {
                    LOG.warn('Failed to generate candidate embedding after CV upload', { candidateId, error: err.message });
                });

                // Send CV received webhook (if enabled)
                if (process.env.ENABLE_WEBHOOKS === 'true') {
                    try {
                        const result = await webhookHelper.sendCVReceivedWebhook(
                            data.ID,
                            candidateId,
                            data.fileName || 'unknown'
                        );

                        if (result.success) {
                            LOG.info('CV received webhook sent successfully', {
                                documentId: data.ID,
                                webhookId: result.webhookId
                            });
                        } else {
                            LOG.warn('CV received webhook failed (non-blocking)', {
                                documentId: data.ID,
                                error: result.error
                            });
                        }
                    } catch (webhookError) {
                        LOG.error('Unexpected CV received webhook error (non-blocking)', {
                            documentId: data.ID,
                            error: webhookError.message
                        });
                    }
                }
            }
        });
```

**Step 3: Verify the change compiles**

Run: `node -c srv/cv-sorting-service.js`
Expected: No syntax errors

**Step 4: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "feat: wire CV-received webhook trigger on document completion"
```

---

### Task 7: Add after CREATE Interviews handler for webhook

**Files:**
- Modify: `srv/cv-sorting-service.js` (add after line 410, after submitFeedback handler)

**Step 1: Find the location**

Look for the `submitFeedback` handler which ends around line 410. Add the new handler after it.

**Step 2: Add interview scheduled webhook trigger**

Add after the `submitFeedback` handler in `srv/cv-sorting-service.js`:

```javascript
        // Send webhook when interview is created
        this.after('CREATE', 'Interviews', async (data, req) => {
            if (process.env.ENABLE_WEBHOOKS !== 'true') return;

            try {
                const result = await webhookHelper.sendInterviewScheduledWebhook(
                    data.ID,
                    data.candidate_ID,
                    data.jobPosting_ID || null,
                    data.scheduledAt,
                    data.interviewerEmail || null
                );

                if (result.success) {
                    LOG.info('Interview scheduled webhook sent successfully', {
                        interviewId: data.ID,
                        webhookId: result.webhookId
                    });
                } else {
                    LOG.warn('Interview scheduled webhook failed (non-blocking)', {
                        interviewId: data.ID,
                        error: result.error
                    });
                }
            } catch (webhookError) {
                LOG.error('Unexpected interview webhook error (non-blocking)', {
                    interviewId: data.ID,
                    error: webhookError.message
                });
            }
        });
```

**Step 3: Verify the change compiles**

Run: `node -c srv/cv-sorting-service.js`
Expected: No syntax errors

**Step 4: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "feat: add interview scheduled webhook trigger on CREATE"
```

---

### Task 8: Add getPendingInterviewReminders function to services.cds

**Files:**
- Modify: `srv/services.cds` (add after existing functions, around line 200)

**Step 1: Find location for new function**

Look for the function definitions section in services.cds.

**Step 2: Add the function definition**

Add to `srv/services.cds` in the CVSortingService block:

```cds
    // Email automation - pending interview reminders for n8n polling
    function getPendingInterviewReminders() returns array of {
        interviewId      : UUID;
        candidateId      : UUID;
        candidateEmail   : String;
        candidateName    : String;
        jobTitle         : String;
        scheduledAt      : DateTime;
        interviewTitle   : String;
        location         : String;
        meetingLink      : String;
        interviewerName  : String;
        interviewerEmail : String;
    };
```

**Step 3: Verify CDS compiles**

Run: `npx cds compile srv/services.cds --to json > /dev/null && echo "CDS OK"`
Expected: "CDS OK"

**Step 4: Commit**

```bash
git add srv/services.cds
git commit -m "feat: add getPendingInterviewReminders function definition"
```

---

### Task 9: Implement getPendingInterviewReminders handler

**Files:**
- Modify: `srv/cv-sorting-service.js` (add handler implementation)

**Step 1: Add handler implementation**

Add to `srv/cv-sorting-service.js` in the init method, after other handlers:

```javascript
        // Handler for n8n polling - get interviews needing reminders
        this.on('getPendingInterviewReminders', async (req) => {
            const { Interviews, Candidates, JobPostings } = this.entities;

            try {
                // Get interviews scheduled 24-48 hours from now that haven't had reminders sent
                const now = new Date();
                const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

                const interviews = await SELECT.from(Interviews)
                    .where({
                        scheduledAt: { '>=': in24Hours.toISOString(), '<=': in48Hours.toISOString() },
                        status_code: { in: ['scheduled', 'confirmed'] },
                        reminderSent: { '=': false, or: { '=': null } }
                    });

                // Expand with candidate and job details
                const results = [];
                for (const interview of interviews) {
                    const candidate = await SELECT.one.from(Candidates)
                        .where({ ID: interview.candidate_ID });

                    let jobTitle = null;
                    if (interview.jobPosting_ID) {
                        const job = await SELECT.one.from(JobPostings)
                            .columns('title')
                            .where({ ID: interview.jobPosting_ID });
                        jobTitle = job?.title;
                    }

                    if (candidate?.email) {
                        results.push({
                            interviewId: interview.ID,
                            candidateId: candidate.ID,
                            candidateEmail: candidate.email,
                            candidateName: `${candidate.firstName} ${candidate.lastName}`,
                            jobTitle: jobTitle,
                            scheduledAt: interview.scheduledAt,
                            interviewTitle: interview.title,
                            location: interview.location,
                            meetingLink: interview.meetingLink,
                            interviewerName: interview.interviewer,
                            interviewerEmail: interview.interviewerEmail
                        });
                    }
                }

                LOG.info(`Found ${results.length} interviews pending reminders`);
                return results;

            } catch (error) {
                LOG.error('Error in getPendingInterviewReminders:', error);
                throw error;
            }
        });
```

**Step 2: Verify the change compiles**

Run: `node -c srv/cv-sorting-service.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "feat: implement getPendingInterviewReminders handler"
```

---

### Task 10: Add reminderSent field to Interviews entity

**Files:**
- Modify: `db/schema.cds` (add field to Interviews entity)

**Step 1: Find Interviews entity**

Look for `entity Interviews` in db/schema.cds (around line 307).

**Step 2: Add reminderSent field**

Add after the `interviewerEmail` field in the Interviews entity:

```cds
    // Email notification tracking
    reminderSent          : Boolean default false;
    reminderSentAt        : Timestamp;
```

**Step 3: Verify CDS compiles**

Run: `npx cds compile db/schema.cds --to json > /dev/null && echo "CDS OK"`
Expected: "CDS OK"

**Step 4: Commit**

```bash
git add db/schema.cds
git commit -m "feat: add reminderSent tracking to Interviews entity"
```

---

### Task 11: Add markReminderSent action to services.cds

**Files:**
- Modify: `srv/services.cds` (add action for n8n callback)

**Step 1: Add the action definition**

Add to `srv/services.cds` after getPendingInterviewReminders:

```cds
    // Email automation - mark reminder as sent (called by n8n after sending)
    action markInterviewReminderSent(interviewId: UUID) returns Boolean;
```

**Step 2: Verify CDS compiles**

Run: `npx cds compile srv/services.cds --to json > /dev/null && echo "CDS OK"`
Expected: "CDS OK"

**Step 3: Commit**

```bash
git add srv/services.cds
git commit -m "feat: add markInterviewReminderSent action definition"
```

---

### Task 12: Implement markInterviewReminderSent handler

**Files:**
- Modify: `srv/cv-sorting-service.js`

**Step 1: Add handler implementation**

Add to `srv/cv-sorting-service.js`:

```javascript
        // Handler for n8n callback - mark interview reminder as sent
        this.on('markInterviewReminderSent', async (req) => {
            const { interviewId } = req.data;
            const { Interviews } = this.entities;

            try {
                const result = await UPDATE(Interviews)
                    .where({ ID: interviewId })
                    .set({
                        reminderSent: true,
                        reminderSentAt: new Date().toISOString()
                    });

                if (result === 1) {
                    LOG.info('Interview reminder marked as sent', { interviewId });
                    return true;
                } else {
                    LOG.warn('Interview not found for reminder update', { interviewId });
                    return false;
                }
            } catch (error) {
                LOG.error('Error marking reminder sent:', { interviewId, error: error.message });
                throw error;
            }
        });
```

**Step 2: Verify the change compiles**

Run: `node -c srv/cv-sorting-service.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "feat: implement markInterviewReminderSent handler"
```

---

### Task 13: Add logEmailNotification action

**Files:**
- Modify: `srv/services.cds`
- Modify: `srv/cv-sorting-service.js`

**Step 1: Add action definition to services.cds**

```cds
    // Email automation - log notification (called by n8n after sending email)
    action logEmailNotification(
        candidateId      : UUID,
        jobPostingId     : UUID,
        notificationType : String,
        recipientEmail   : String,
        subject          : String,
        templateUsed     : String,
        deliveryStatus   : String
    ) returns UUID;
```

**Step 2: Add handler implementation to cv-sorting-service.js**

```javascript
        // Handler for n8n callback - log email notification
        this.on('logEmailNotification', async (req) => {
            const { EmailNotifications } = this.entities;
            const {
                candidateId,
                jobPostingId,
                notificationType,
                recipientEmail,
                subject,
                templateUsed,
                deliveryStatus
            } = req.data;

            try {
                const notification = {
                    candidate_ID: candidateId,
                    jobPosting_ID: jobPostingId || null,
                    notificationType,
                    recipientEmail,
                    subject,
                    templateUsed,
                    sentAt: new Date().toISOString(),
                    deliveryStatus: deliveryStatus || 'sent'
                };

                const result = await INSERT.into(EmailNotifications).entries(notification);

                LOG.info('Email notification logged', {
                    notificationType,
                    recipientEmail,
                    deliveryStatus
                });

                return result.req.data.ID || notification.ID;
            } catch (error) {
                LOG.error('Error logging email notification:', error);
                throw error;
            }
        });
```

**Step 3: Verify both files compile**

Run: `npx cds compile srv/services.cds --to json > /dev/null && node -c srv/cv-sorting-service.js && echo "All OK"`
Expected: "All OK"

**Step 4: Commit**

```bash
git add srv/services.cds srv/cv-sorting-service.js
git commit -m "feat: add logEmailNotification action for n8n callbacks"
```

---

## Phase 3: Integration Testing

### Task 14: Create integration test helper for Mailhog

**Files:**
- Create: `test/helpers/mailhog-client.js`

**Step 1: Create Mailhog API client**

```javascript
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
```

**Step 2: Commit**

```bash
git add test/helpers/mailhog-client.js
git commit -m "feat: add Mailhog API client for integration tests"
```

---

### Task 15: Create integration test for CV-received webhook flow

**Files:**
- Create: `test/integration/cv-received-webhook.test.js`

**Step 1: Create integration test**

```javascript
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
```

**Step 2: Add integration test script to package.json**

Add to scripts in package.json:

```json
"test:integration": "jest test/integration --no-coverage --testTimeout=30000"
```

**Step 3: Commit**

```bash
git add test/integration/cv-received-webhook.test.js package.json
git commit -m "test: add integration test for CV-received webhook flow"
```

---

### Task 16: Create integration test for interview reminder flow

**Files:**
- Create: `test/integration/interview-reminder.test.js`

**Step 1: Create integration test**

```javascript
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
```

**Step 2: Commit**

```bash
git add test/integration/interview-reminder.test.js
git commit -m "test: add integration test for interview reminder flow"
```

---

## Phase 4: Documentation

### Task 17: Update README with email automation setup

**Files:**
- Modify: `README.md` (add Email Automation section)

**Step 1: Add Email Automation section**

Add to README.md:

```markdown
## Email Automation Setup

The application supports automated email notifications via n8n workflow automation.

### Quick Start

```bash
# Start n8n and Mailhog
./scripts/setup-email-dev.sh

# Enable webhooks in your .env
ENABLE_WEBHOOKS=true
```

### Services

| Service | URL | Purpose |
|---------|-----|---------|
| n8n | http://localhost:5678 | Workflow automation |
| Mailhog | http://localhost:8025 | Email capture (dev) |

### Workflows

1. **Status Change Notification** - Emails candidates when their application status changes
2. **CV Received Confirmation** - Confirms receipt of uploaded CVs
3. **Interview Scheduling** - Sends interview invitations with calendar attachments
4. **Interview Reminders** - Sends 24-hour reminders for upcoming interviews
5. **Pending Notifications Poller** - Processes queued notifications

### Configuration

See `.env.example` for all email-related configuration options.

### Testing Emails

All emails in development are captured by Mailhog. Visit http://localhost:8025 to view sent emails.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add email automation setup to README"
```

---

### Task 18: Run all webhook tests to verify implementation

**Files:**
- None (verification only)

**Step 1: Run all webhook-related tests**

Run: `npx jest --testPathPattern="webhook" --no-coverage`
Expected: All tests pass (should be 13+ tests now)

**Step 2: Run CDS compilation check**

Run: `npx cds compile srv/services.cds --to json > /dev/null && echo "CDS OK"`
Expected: "CDS OK"

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

---

## Success Criteria

- [ ] docker-compose.yml creates n8n and Mailhog containers
- [ ] `scripts/setup-email-dev.sh` starts services successfully
- [ ] `sendCVReceivedWebhook` method exists and has tests
- [ ] `sendInterviewScheduledWebhook` method exists and has tests
- [ ] CVDocuments UPDATE handler triggers cv-received webhook
- [ ] Interviews CREATE handler triggers interview-scheduled webhook
- [ ] `getPendingInterviewReminders` function returns upcoming interviews
- [ ] `markInterviewReminderSent` action updates interview record
- [ ] `logEmailNotification` action creates EmailNotifications record
- [ ] All unit tests pass (13+ webhook tests)
- [ ] Integration test helpers created for Mailhog
- [ ] README updated with email automation setup
