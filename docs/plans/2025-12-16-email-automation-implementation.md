# Email Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build complete email automation system for CV receiving and candidate status updates using n8n and SAP CAP integration.

**Architecture:** Hybrid webhook/polling approach. CAP service emits webhooks for critical events (interviews, offers), polls for routine status changes. n8n workflows handle email rendering, calendar generation, and reply routing.

**Tech Stack:** SAP CAP (Node.js), CDS, n8n, IMAP/SMTP, .ics calendar format, HTML email templates

---

## Phase 1: Database Schema & Core Infrastructure

### Task 1: Add EmailNotifications Entity

**Files:**
- Modify: `db/schema.cds:1-end` (add new entities after existing ones)
- Test: `test/schema-validation.test.js`

**Step 1: Write failing test for EmailNotifications entity**

Add to `test/schema-validation.test.js`:

```javascript
describe('Email Automation Entities', () => {
    let db;

    beforeAll(async () => {
        await cds.deploy(__dirname + '/../db/schema');
        db = await cds.connect.to('db');
    });

    describe('EmailNotifications', () => {
        it('should create EmailNotifications record', async () => {
            const { EmailNotifications } = db.entities('cv.sorting');

            const notification = await INSERT.into(EmailNotifications).entries({
                ID: cds.utils.uuid(),
                notificationType: 'cv_received',
                recipientEmail: 'test@example.com',
                subject: 'Test Subject',
                sentAt: new Date().toISOString(),
                deliveryStatus: 'sent'
            });

            expect(notification).toBeDefined();
            expect(notification.ID).toBeDefined();
        });

        it('should enforce notificationType enum', async () => {
            const { EmailNotifications } = db.entities('cv.sorting');

            await expect(
                INSERT.into(EmailNotifications).entries({
                    ID: cds.utils.uuid(),
                    notificationType: 'invalid_type',
                    recipientEmail: 'test@example.com'
                })
            ).rejects.toThrow();
        });
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/schema-validation.test.js
```

Expected: FAIL with "Cannot find name 'EmailNotifications'"

**Step 3: Add EmailNotifications entity to schema**

Add to `db/schema.cds` after existing entities:

```cds
/**
 * Email Notification Tracking
 * Tracks all automated emails sent to candidates
 */
entity EmailNotifications {
    key ID: UUID;
    candidate: Association to Candidates;
    jobPosting: Association to JobPostings;
    notificationType: String(50) enum {
        cv_received;
        status_changed;
        interview_invitation;
        interview_reminder;
        interview_confirmed;
        offer_extended;
        application_rejected;
        general_update;
    } not null;
    recipientEmail: String(255) not null;
    subject: String(500);
    templateUsed: String(100);
    sentAt: Timestamp;
    deliveryStatus: String(20) enum {
        queued;
        sent;
        failed;
        bounced;
    } default 'queued';
    openedAt: Timestamp;
    clickedAt: Timestamp;
    errorMessage: String(1000);
    n8nExecutionId: String(100);
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/schema-validation.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add db/schema.cds test/schema-validation.test.js
git commit -m "feat(db): add EmailNotifications entity for tracking automated emails"
```

---

### Task 2: Add CandidateStatusHistory Entity

**Files:**
- Modify: `db/schema.cds:1-end`
- Test: `test/schema-validation.test.js`

**Step 1: Write failing test**

Add to `test/schema-validation.test.js`:

```javascript
describe('CandidateStatusHistory', () => {
    it('should track status changes', async () => {
        const { CandidateStatusHistory, Candidates } = db.entities('cv.sorting');

        // Create candidate first
        const candidate = await INSERT.into(Candidates).entries({
            ID: cds.utils.uuid(),
            firstName: 'Test',
            lastName: 'Candidate',
            email: 'test@example.com',
            status_code: 'new'
        });

        const statusChange = await INSERT.into(CandidateStatusHistory).entries({
            ID: cds.utils.uuid(),
            candidate_ID: candidate.ID,
            oldStatus: 'new',
            newStatus: 'under_review',
            changedAt: new Date().toISOString(),
            changedBy: 'admin',
            notificationSent: false
        });

        expect(statusChange).toBeDefined();
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/schema-validation.test.js -t "CandidateStatusHistory"
```

Expected: FAIL

**Step 3: Add CandidateStatusHistory entity**

Add to `db/schema.cds`:

```cds
/**
 * Candidate Status Change Tracking
 * Used by polling workflow to detect status changes needing notification
 */
entity CandidateStatusHistory {
    key ID: UUID;
    candidate: Association to Candidates not null;
    oldStatus: String(50);
    newStatus: String(50) not null;
    changedAt: Timestamp not null;
    changedBy: String(255);
    notificationSent: Boolean default false;
    notificationScheduledFor: DateTime;
    notes: String(2000);
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/schema-validation.test.js -t "CandidateStatusHistory"
```

Expected: PASS

**Step 5: Commit**

```bash
git add db/schema.cds test/schema-validation.test.js
git commit -m "feat(db): add CandidateStatusHistory for status change tracking"
```

---

### Task 3: Add InterviewCalendarEvents Entity

**Files:**
- Modify: `db/schema.cds:1-end`
- Test: `test/schema-validation.test.js`

**Step 1: Write failing test**

Add to `test/schema-validation.test.js`:

```javascript
describe('InterviewCalendarEvents', () => {
    it('should store calendar invite data', async () => {
        const { InterviewCalendarEvents, Interviews } = db.entities('cv.sorting');

        // Assume interview exists
        const calendarEvent = await INSERT.into(InterviewCalendarEvents).entries({
            ID: cds.utils.uuid(),
            icsFileGenerated: true,
            icsContent: 'BEGIN:VCALENDAR...',
            meetingLink: 'https://zoom.us/j/123456',
            candidateConfirmed: false
        });

        expect(calendarEvent).toBeDefined();
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/schema-validation.test.js -t "InterviewCalendarEvents"
```

Expected: FAIL

**Step 3: Add InterviewCalendarEvents entity**

Add to `db/schema.cds`:

```cds
/**
 * Interview Calendar Integration
 * Stores .ics calendar files and tracks candidate responses
 */
entity InterviewCalendarEvents {
    key ID: UUID;
    interview: Association to Interviews;
    icsFileGenerated: Boolean default false;
    icsContent: LargeString;
    meetingLink: String(500);
    candidateConfirmed: Boolean default false;
    confirmedAt: Timestamp;
    reminderSent: Boolean default false;
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/schema-validation.test.js -t "InterviewCalendarEvents"
```

Expected: PASS

**Step 5: Commit**

```bash
git add db/schema.cds test/schema-validation.test.js
git commit -m "feat(db): add InterviewCalendarEvents for calendar integration"
```

---

## Phase 2: CAP Service Functions & Actions

### Task 4: Add getPendingStatusNotifications Function

**Files:**
- Modify: `srv/services.cds:1070-end` (add before closing brace)
- Create: `srv/handlers/email-notifications.js`
- Test: `test/email-notifications.test.js`

**Step 1: Write failing test**

Create `test/email-notifications.test.js`:

```javascript
'use strict';

const cds = require('@sap/cds');

describe('Email Notification Handlers', () => {
    const { expect } = cds.test(__dirname + '/..');

    let CVSortingService;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
    });

    describe('getPendingStatusNotifications', () => {
        it('should return pending status changes', async () => {
            const { Candidates, CandidateStatusHistory } = CVSortingService.entities;

            // Create candidate
            const candidate = await INSERT.into(Candidates).entries({
                ID: cds.utils.uuid(),
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                status_code: 'new'
            });

            // Create status change
            await INSERT.into(CandidateStatusHistory).entries({
                ID: cds.utils.uuid(),
                candidate_ID: candidate.ID,
                oldStatus: 'new',
                newStatus: 'under_review',
                changedAt: new Date().toISOString(),
                changedBy: 'admin',
                notificationSent: false,
                notificationScheduledFor: new Date().toISOString()
            });

            const result = await CVSortingService.send({
                query: 'getPendingStatusNotifications'
            });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].candidateEmail).toBe('test@example.com');
        });
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/email-notifications.test.js
```

Expected: FAIL with "Unknown function 'getPendingStatusNotifications'"

**Step 3: Add function to services.cds**

Add to `srv/services.cds` before the closing `}`:

```cds
    // ============================================
    // EMAIL NOTIFICATION FUNCTIONS
    // ============================================

    /**
     * Get candidates with status changes pending notification
     * Used by n8n polling workflow
     */
    function getPendingStatusNotifications() returns array of {
        statusHistoryId: UUID;
        candidateId: UUID;
        candidateName: String;
        candidateEmail: String;
        oldStatus: String;
        newStatus: String;
        jobTitle: String;
        changedAt: Timestamp;
    };
```

**Step 4: Implement handler**

Create `srv/handlers/email-notifications.js`:

```javascript
'use strict';

const cds = require('@sap/cds');

module.exports = (srv) => {

    /**
     * Get pending status notifications for n8n polling
     */
    srv.on('getPendingStatusNotifications', async (req) => {
        const { CandidateStatusHistory, Candidates } = srv.entities;

        const pendingChanges = await SELECT.from(CandidateStatusHistory, history => {
            history.ID.as('statusHistoryId');
            history.oldStatus;
            history.newStatus;
            history.changedAt;
            history.candidate(candidate => {
                candidate.ID.as('candidateId');
                candidate.firstName;
                candidate.lastName;
                candidate.email.as('candidateEmail');
            });
        })
        .where({
            notificationSent: false,
            notificationScheduledFor: { '<=': new Date().toISOString() }
        })
        .limit(50); // Process max 50 per poll

        return pendingChanges.map(change => ({
            statusHistoryId: change.statusHistoryId,
            candidateId: change.candidateId,
            candidateName: `${change.candidate_firstName} ${change.candidate_lastName}`,
            candidateEmail: change.candidateEmail,
            oldStatus: change.oldStatus,
            newStatus: change.newStatus,
            jobTitle: 'General Application', // TODO: Link to actual job
            changedAt: change.changedAt
        }));
    });

};
```

**Step 5: Register handler in cv-sorting-service.js**

Add to `srv/cv-sorting-service.js` in the init() method after other handler imports:

```javascript
// Register email notification handlers
require('./handlers/email-notifications')(this);
```

**Step 6: Run test to verify it passes**

```bash
npm test -- test/email-notifications.test.js
```

Expected: PASS

**Step 7: Commit**

```bash
git add srv/services.cds srv/handlers/email-notifications.js srv/cv-sorting-service.js test/email-notifications.test.js
git commit -m "feat(srv): add getPendingStatusNotifications for polling workflow"
```

---

### Task 5: Add markNotificationSent Action

**Files:**
- Modify: `srv/services.cds:1070-end`
- Modify: `srv/handlers/email-notifications.js`
- Test: `test/email-notifications.test.js`

**Step 1: Write failing test**

Add to `test/email-notifications.test.js`:

```javascript
describe('markNotificationSent', () => {
    it('should mark status change as notified', async () => {
        const { Candidates, CandidateStatusHistory } = CVSortingService.entities;

        const candidate = await INSERT.into(Candidates).entries({
            ID: cds.utils.uuid(),
            firstName: 'Mark',
            lastName: 'Test',
            email: 'mark@example.com',
            status_code: 'new'
        });

        const history = await INSERT.into(CandidateStatusHistory).entries({
            ID: cds.utils.uuid(),
            candidate_ID: candidate.ID,
            oldStatus: 'new',
            newStatus: 'screening',
            changedAt: new Date().toISOString(),
            changedBy: 'admin',
            notificationSent: false
        });

        const result = await CVSortingService.send({
            event: 'markNotificationSent',
            data: {
                candidateId: candidate.ID,
                notificationType: 'status_changed',
                n8nExecutionId: 'exec-123'
            }
        });

        expect(result.success).toBe(true);

        // Verify marked as sent
        const updated = await SELECT.one.from(CandidateStatusHistory)
            .where({ ID: history.ID });
        expect(updated.notificationSent).toBe(true);
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/email-notifications.test.js -t "markNotificationSent"
```

Expected: FAIL

**Step 3: Add action to services.cds**

Add to `srv/services.cds` after getPendingStatusNotifications:

```cds
    /**
     * Mark notification as sent
     * Called by n8n after successfully sending email
     */
    action markNotificationSent(
        candidateId: UUID not null,
        notificationType: String not null,
        n8nExecutionId: String
    ) returns {
        success: Boolean;
    };
```

**Step 4: Implement handler**

Add to `srv/handlers/email-notifications.js`:

```javascript
    /**
     * Mark notification as sent
     */
    srv.on('markNotificationSent', async (req) => {
        const { candidateId, notificationType, n8nExecutionId } = req.data;
        const { CandidateStatusHistory, EmailNotifications, Candidates } = srv.entities;

        // Update status history
        await UPDATE(CandidateStatusHistory)
            .where({ candidate_ID: candidateId, notificationSent: false })
            .set({
                notificationSent: true
            })
            .limit(1);

        // Create email notification record
        const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });

        await INSERT.into(EmailNotifications).entries({
            ID: cds.utils.uuid(),
            candidate_ID: candidateId,
            notificationType: notificationType,
            recipientEmail: candidate.email,
            sentAt: new Date().toISOString(),
            deliveryStatus: 'sent',
            n8nExecutionId: n8nExecutionId
        });

        return { success: true };
    });
```

**Step 5: Run test to verify it passes**

```bash
npm test -- test/email-notifications.test.js -t "markNotificationSent"
```

Expected: PASS

**Step 6: Commit**

```bash
git add srv/services.cds srv/handlers/email-notifications.js test/email-notifications.test.js
git commit -m "feat(srv): add markNotificationSent action for n8n callback"
```

---

### Task 6: Add Status Change Tracking Hook

**Files:**
- Modify: `srv/cv-sorting-service.js:1-end`
- Test: `test/email-notifications.test.js`

**Step 1: Write failing test**

Add to `test/email-notifications.test.js`:

```javascript
describe('Status Change Tracking', () => {
    it('should auto-create status history on candidate update', async () => {
        const { Candidates, CandidateStatusHistory } = CVSortingService.entities;

        const candidate = await INSERT.into(Candidates).entries({
            ID: cds.utils.uuid(),
            firstName: 'Auto',
            lastName: 'Track',
            email: 'auto@example.com',
            status_code: 'new'
        });

        // Update status
        await UPDATE(Candidates)
            .where({ ID: candidate.ID })
            .set({ status_code: 'screening' });

        // Check history created
        const history = await SELECT.from(CandidateStatusHistory)
            .where({ candidate_ID: candidate.ID });

        expect(history.length).toBe(1);
        expect(history[0].oldStatus).toBe('new');
        expect(history[0].newStatus).toBe('screening');
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/email-notifications.test.js -t "Status Change Tracking"
```

Expected: FAIL (no history created)

**Step 3: Add before UPDATE hook**

Add to `srv/cv-sorting-service.js` in the init() method:

```javascript
        // Track candidate status changes for email notifications
        this.before('UPDATE', 'Candidates', async (req) => {
            const { ID } = req.data;

            if (!ID || !req.data.status_code) return;

            const { Candidates, CandidateStatusHistory } = this.entities;

            // Get current status
            const current = await SELECT.one.from(Candidates, ID)
                .columns('status_code');

            const newStatus = req.data.status_code;

            // If status changed, record it
            if (current && newStatus && current.status_code !== newStatus) {
                await INSERT.into(CandidateStatusHistory).entries({
                    ID: cds.utils.uuid(),
                    candidate_ID: ID,
                    oldStatus: current.status_code,
                    newStatus: newStatus,
                    changedAt: new Date().toISOString(),
                    changedBy: req.user.id || 'system',
                    notificationSent: false,
                    notificationScheduledFor: new Date().toISOString()
                });
            }
        });
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/email-notifications.test.js -t "Status Change Tracking"
```

Expected: PASS

**Step 5: Commit**

```bash
git add srv/cv-sorting-service.js test/email-notifications.test.js
git commit -m "feat(srv): auto-track candidate status changes for notifications"
```

---

### Task 7: Add Webhook Helper Function

**Files:**
- Create: `srv/lib/webhook-client.js`
- Test: `test/webhook-client.test.js`

**Step 1: Write failing test**

Create `test/webhook-client.test.js`:

```javascript
'use strict';

const { triggerN8nWebhook } = require('../srv/lib/webhook-client');

describe('Webhook Client', () => {
    beforeEach(() => {
        // Mock fetch
        global.fetch = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    it('should call n8n webhook with correct payload', async () => {
        process.env.N8N_WEBHOOK_BASE_URL = 'https://n8n.test.com/webhook';
        process.env.N8N_WEBHOOK_SECRET = 'test-secret';

        global.fetch.mockResolvedValue({
            status: 200,
            headers: new Map([['x-n8n-execution-id', 'exec-123']])
        });

        const result = await triggerN8nWebhook('test_event', {
            data: 'test'
        });

        expect(result.triggered).toBe(true);
        expect(result.executionId).toBe('exec-123');
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/webhook/critical-event'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'X-Webhook-Secret': 'test-secret'
                })
            })
        );
    });

    it('should handle webhook failure gracefully', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));

        const result = await triggerN8nWebhook('test_event', {});

        expect(result.triggered).toBe(false);
        expect(result.error).toBeDefined();
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/webhook-client.test.js
```

Expected: FAIL (module not found)

**Step 3: Implement webhook client**

Create `srv/lib/webhook-client.js`:

```javascript
'use strict';

/**
 * N8n Webhook Client
 * Triggers n8n workflows via webhook with retry logic
 */

const LOG = require('./logger').createLogger('webhook-client');

/**
 * Trigger n8n webhook for critical events
 */
async function triggerN8nWebhook(eventType, payload) {
    const webhookUrl = process.env.N8N_WEBHOOK_BASE_URL;
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

    if (!webhookUrl) {
        LOG.warn('N8N_WEBHOOK_BASE_URL not configured, skipping webhook');
        return { triggered: false };
    }

    try {
        const response = await fetch(`${webhookUrl}/critical-event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': webhookSecret || ''
            },
            body: JSON.stringify({
                eventType,
                timestamp: new Date().toISOString(),
                ...payload
            })
        });

        const executionId = response.headers.get('x-n8n-execution-id');

        return {
            triggered: true,
            status: response.status,
            executionId
        };
    } catch (error) {
        LOG.error('Failed to trigger n8n webhook', { eventType, error: error.message });
        return { triggered: false, error: error.message };
    }
}

/**
 * Trigger webhook with retry logic
 */
async function triggerN8nWebhookWithRetry(eventType, payload, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await triggerN8nWebhook(eventType, payload);

            if (result.triggered) {
                return result;
            }

            lastError = result.error;
        } catch (error) {
            lastError = error.message;
            LOG.warn(`Webhook attempt ${attempt}/${maxRetries} failed`, { error: error.message });
        }

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        }
    }

    LOG.error(`Failed to trigger webhook after ${maxRetries} attempts`, { lastError });
    return { triggered: false, error: lastError };
}

module.exports = {
    triggerN8nWebhook,
    triggerN8nWebhookWithRetry
};
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/webhook-client.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add srv/lib/webhook-client.js test/webhook-client.test.js
git commit -m "feat(lib): add n8n webhook client with retry logic"
```

---

## Phase 3: Email Templates & n8n Workflows

### Task 8: Create Email Template Directory Structure

**Files:**
- Create: `infrastructure/n8n/templates/base-template.html`
- Create: `infrastructure/n8n/templates/cv-received.html`
- Create: `infrastructure/n8n/templates/under-review.html`
- Create: `infrastructure/n8n/templates/interview-invitation.html`

**Step 1: Create base template**

Create `infrastructure/n8n/templates/base-template.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ subject }}</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        .header {
            background: #0070f3;
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 30px;
            line-height: 1.6;
        }
        .button {
            background: #0070f3;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            display: inline-block;
            margin: 20px 0;
        }
        .button:hover {
            background: #0051cc;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #e0e0e0;
        }
        .info-box {
            background: #f5f5f5;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #0070f3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ companyName }}</h1>
        </div>
        <div class="content">
            {{ content }}
        </div>
        <div class="footer">
            <p>{{ companyName }} | Recruitment Team</p>
            <p>This is an automated message. For questions, contact: {{ supportEmail }}</p>
        </div>
    </div>
</body>
</html>
```

**Step 2: Create CV received template**

Create `infrastructure/n8n/templates/cv-received.html`:

```html
<h2>Application Received</h2>

<p>Dear {{ candidateName }},</p>

<p>Thank you for your interest in joining our team! We have received your application and CV.</p>

<div class="info-box">
    <p><strong>Application Details:</strong></p>
    <ul style="list-style: none; padding: 0;">
        <li>📄 <strong>Application ID:</strong> {{ applicationId }}</li>
        <li>📅 <strong>Submitted:</strong> {{ submittedDate }}</li>
        <li>💼 <strong>Position:</strong> {{ jobTitle }}</li>
    </ul>
</div>

<p><strong>What happens next?</strong></p>
<ol>
    <li>Our team will review your application within 3-5 business days</li>
    <li>If your profile matches our requirements, we'll contact you for next steps</li>
    <li>You can track your application status via email updates</li>
</ol>

<p>We appreciate your interest and will be in touch soon!</p>

<p>Best regards,<br>
{{ recruiterName }}<br>
Recruitment Team</p>
```

**Step 3: Create under review template**

Create `infrastructure/n8n/templates/under-review.html`:

```html
<h2>Application Under Review</h2>

<p>Dear {{ candidateName }},</p>

<p>Good news! Your application for <strong>{{ jobTitle }}</strong> has progressed to the review stage.</p>

<div class="info-box">
    <p><strong>Current Status:</strong> Under Review</p>
    <p>Our hiring team is currently evaluating your qualifications and experience.</p>
</div>

<p><strong>Timeline:</strong> You can expect to hear back from us within 5-7 business days.</p>

<p>We appreciate your patience during this process.</p>

<p>Best regards,<br>
Recruitment Team</p>
```

**Step 4: Create interview invitation template**

Create `infrastructure/n8n/templates/interview-invitation.html`:

```html
<h2>Interview Invitation - {{ jobTitle }}</h2>

<p>Dear {{ candidateName }},</p>

<p>We are pleased to invite you to an interview for the position of <strong>{{ jobTitle }}</strong>.</p>

<div class="info-box">
    <p><strong>Interview Details:</strong></p>
    <ul style="list-style: none; padding: 0;">
        <li>📅 <strong>Date:</strong> {{ interviewDate }}</li>
        <li>🕐 <strong>Time:</strong> {{ interviewTime }} ({{ timezone }})</li>
        <li>⏱️ <strong>Duration:</strong> {{ duration }} minutes</li>
        <li>📍 <strong>Location:</strong> {{ location }}</li>
        <li>👤 <strong>Interviewer:</strong> {{ interviewerName }}, {{ interviewerTitle }}</li>
    </ul>
</div>

{{ #if meetingLink }}
<p style="text-align: center;">
    <a href="{{ meetingLink }}" class="button">Join Video Interview</a>
</p>
{{ /if }}

<p><strong>Please confirm your attendance by replying to this email with "Confirm".</strong></p>

<p><strong>To prepare for the interview:</strong></p>
<ul>
    <li>Review the job description and requirements</li>
    <li>Prepare examples of relevant experience</li>
    <li>Have questions ready about the role and team</li>
</ul>

<p>A calendar invitation (.ics file) is attached to this email for your convenience.</p>

<p>If you need to reschedule, please reply as soon as possible.</p>

<p>We look forward to speaking with you!</p>

<p>Best regards,<br>
{{ recruiterName }}<br>
Recruitment Team</p>
```

**Step 5: Commit**

```bash
git add infrastructure/n8n/templates/
git commit -m "feat(templates): add HTML email templates for candidate communications"
```

---

### Task 9: Create n8n Workflow Stubs

**Files:**
- Create: `infrastructure/n8n/workflows/status-change-polling.json`
- Create: `infrastructure/n8n/workflows/critical-event-webhook.json`
- Create: `infrastructure/n8n/workflows/interview-scheduling.json`

**Step 1: Create status polling workflow stub**

Create `infrastructure/n8n/workflows/status-change-polling.json`:

```json
{
  "name": "Status Change Polling Workflow",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 3
            }
          ]
        }
      },
      "id": "cron-trigger",
      "name": "Cron Trigger (Every 3 min)",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $env.CAP_SERVICE_URL }}/api/getPendingStatusNotifications",
        "authentication": "genericCredentialType",
        "genericAuthType": "oAuth2Api",
        "options": {}
      },
      "id": "get-pending",
      "name": "Get Pending Notifications",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [460, 300],
      "credentials": {
        "oAuth2Api": {
          "id": "2",
          "name": "CAP Service OAuth2"
        }
      }
    },
    {
      "parameters": {
        "functionCode": "// TODO: Implement template selection and email sending\nreturn $input.all();"
      },
      "id": "process-notifications",
      "name": "Process Notifications",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    }
  ],
  "connections": {
    "Cron Trigger (Every 3 min)": {
      "main": [[{ "node": "Get Pending Notifications", "type": "main", "index": 0 }]]
    },
    "Get Pending Notifications": {
      "main": [[{ "node": "Process Notifications", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": {},
  "versionId": "1.0"
}
```

**Step 2: Create critical event webhook stub**

Create `infrastructure/n8n/workflows/critical-event-webhook.json`:

```json
{
  "name": "Critical Event Webhook Workflow",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "critical-event",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [240, 300],
      "webhookId": "critical-event-webhook"
    },
    {
      "parameters": {
        "functionCode": "// Validate webhook secret\nconst receivedSecret = $input.item.json.headers['x-webhook-secret'];\nconst expectedSecret = $env.N8N_WEBHOOK_SECRET;\n\nif (!receivedSecret || receivedSecret !== expectedSecret) {\n  throw new Error('Invalid webhook secret');\n}\n\nreturn $input.all();"
      },
      "id": "validate-secret",
      "name": "Validate Secret",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "functionCode": "// TODO: Implement event routing and processing\nreturn $input.all();"
      },
      "id": "route-event",
      "name": "Route Event",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [[{ "node": "Validate Secret", "type": "main", "index": 0 }]]
    },
    "Validate Secret": {
      "main": [[{ "node": "Route Event", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": {},
  "versionId": "1.0"
}
```

**Step 3: Create interview scheduling workflow stub**

Create `infrastructure/n8n/workflows/interview-scheduling.json`:

```json
{
  "name": "Interview Scheduling Workflow",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "interview-scheduled",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [240, 300],
      "webhookId": "interview-scheduled-webhook"
    },
    {
      "parameters": {
        "functionCode": "// TODO: Generate .ics calendar file\nreturn $input.all();"
      },
      "id": "generate-ics",
      "name": "Generate ICS",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "functionCode": "// TODO: Send email with calendar attachment\nreturn $input.all();"
      },
      "id": "send-email",
      "name": "Send Email",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [[{ "node": "Generate ICS", "type": "main", "index": 0 }]]
    },
    "Generate ICS": {
      "main": [[{ "node": "Send Email", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": {},
  "versionId": "1.0"
}
```

**Step 4: Commit**

```bash
git add infrastructure/n8n/workflows/
git commit -m "feat(n8n): add workflow stubs for email automation"
```

---

## Phase 4: Configuration & Documentation

### Task 10: Add Environment Configuration

**Files:**
- Modify: `infrastructure/n8n/.env.example`
- Create: `docs/EMAIL_AUTOMATION_SETUP.md`

**Step 1: Update .env.example**

Add to `infrastructure/n8n/.env.example`:

```env
# ============================================
# Email Automation Configuration
# ============================================

# CAP Service Integration
CAP_SERVICE_URL=https://cv-sorting-srv.cfapps.eu10.hana.ondemand.com
N8N_WEBHOOK_SECRET=generate-secure-random-string-here

# Python ML Service
ML_SERVICE_URL=https://cv-sorting-ml.cfapps.eu10.hana.ondemand.com

# Email Server Configuration
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=cv-inbox@company.com
IMAP_PASSWORD=app-specific-password
IMAP_TLS=true

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@company.com
SMTP_PASSWORD=app-specific-password
SMTP_TLS=true

# Email Settings
EMAIL_FROM_ADDRESS=noreply@company.com
EMAIL_FROM_NAME=Company Recruitment Team
EMAIL_REPLY_TO=recruiting@company.com
HR_NOTIFICATION_EMAIL=hr@company.com

# Application URLs
APP_URL=https://cv-sorting.cfapps.eu10.hana.ondemand.com

# Workflow Settings
STATUS_POLL_INTERVAL=3
MIN_CANDIDATES_THRESHOLD=5
NOTIFICATION_COOLDOWN_HOURS=24

# Rate Limiting
MAX_EMAILS_PER_CANDIDATE_PER_DAY=3
MAX_EMAILS_PER_HOUR=50

# Company Branding
COMPANY_NAME=Your Company Name
SUPPORT_EMAIL=support@company.com
```

**Step 2: Create setup documentation**

Create `docs/EMAIL_AUTOMATION_SETUP.md`:

```markdown
# Email Automation Setup Guide

## Prerequisites

- n8n instance running (self-hosted or cloud)
- Email server with IMAP/SMTP access
- CAP service deployed and accessible

## Setup Steps

### 1. Configure CAP Service

Add environment variables to CAP service:

\`\`\`bash
cf set-env cv-sorting-srv N8N_WEBHOOK_BASE_URL https://n8n.your-domain.com/webhook
cf set-env cv-sorting-srv N8N_WEBHOOK_SECRET your-secret-key
cf set-env cv-sorting-srv EMAIL_FROM_ADDRESS noreply@company.com
cf restage cv-sorting-srv
\`\`\`

### 2. Import n8n Workflows

1. Log into n8n admin panel
2. Go to **Workflows** → **Import from File**
3. Import these files in order:
   - `infrastructure/n8n/workflows/status-change-polling.json`
   - `infrastructure/n8n/workflows/critical-event-webhook.json`
   - `infrastructure/n8n/workflows/interview-scheduling.json`

### 3. Configure n8n Credentials

Create these credentials in n8n:

**CAP Service OAuth2:**
- Client ID: (from xs-security.json)
- Client Secret: (from service binding)
- Token URL: https://<subdomain>.authentication.eu10.hana.ondemand.com/oauth/token

**SMTP Notification:**
- Host: smtp.gmail.com
- Port: 587
- User: notifications@company.com
- Password: (app-specific password)
- TLS: true

### 4. Set n8n Environment Variables

Configure in n8n settings:

\`\`\`env
CAP_SERVICE_URL=https://cv-sorting-srv.cfapps.eu10.hana.ondemand.com
ML_SERVICE_URL=https://cv-sorting-ml.cfapps.eu10.hana.ondemand.com
N8N_WEBHOOK_SECRET=your-secret-key
EMAIL_FROM_ADDRESS=noreply@company.com
COMPANY_NAME=Your Company Name
SUPPORT_EMAIL=support@company.com
\`\`\`

### 5. Activate Workflows

1. Open each workflow
2. Toggle **Active** to ON
3. Test with sample data

### 6. Verify Setup

Test the integration:

\`\`\`bash
# Trigger a status change
curl -X PATCH https://your-cap-service.com/api/Candidates(id) \\
  -H "Content-Type: application/json" \\
  -d '{"status_code": "under_review"}'

# Check n8n execution logs
# Check EmailNotifications table
\`\`\`

## Troubleshooting

**Webhooks not triggering:**
- Verify N8N_WEBHOOK_BASE_URL is correct
- Check webhook secret matches
- Review n8n execution logs

**Emails not sending:**
- Verify SMTP credentials
- Check email rate limits
- Review delivery status in EmailNotifications table

**Status polling not working:**
- Verify cron schedule is active
- Check CAP service is accessible
- Review CandidateStatusHistory table
\`\`\`

**Step 3: Commit**

```bash
git add infrastructure/n8n/.env.example docs/EMAIL_AUTOMATION_SETUP.md
git commit -m "docs: add email automation configuration and setup guide"
```

---

## Verification & Testing

### Task 11: Integration Test

**Files:**
- Create: `test/email-automation-integration.test.js`

**Step 1: Write integration test**

Create `test/email-automation-integration.test.js`:

```javascript
'use strict';

const cds = require('@sap/cds');

describe('Email Automation Integration', () => {
    const { expect } = cds.test(__dirname + '/..');

    let CVSortingService;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
    });

    it('should complete full status change notification flow', async () => {
        const { Candidates, CandidateStatusHistory, EmailNotifications } = CVSortingService.entities;

        // Step 1: Create candidate
        const candidate = await INSERT.into(Candidates).entries({
            ID: cds.utils.uuid(),
            firstName: 'Integration',
            lastName: 'Test',
            email: 'integration@example.com',
            status_code: 'new'
        });

        // Step 2: Update status (triggers history creation)
        await UPDATE(Candidates)
            .where({ ID: candidate.ID })
            .set({ status_code: 'under_review' });

        // Step 3: Verify status history created
        const history = await SELECT.from(CandidateStatusHistory)
            .where({ candidate_ID: candidate.ID });

        expect(history.length).toBe(1);
        expect(history[0].notificationSent).toBe(false);

        // Step 4: Get pending notifications
        const pending = await CVSortingService.send({
            query: 'getPendingStatusNotifications'
        });

        expect(pending.length).toBeGreaterThan(0);

        // Step 5: Mark as sent
        await CVSortingService.send({
            event: 'markNotificationSent',
            data: {
                candidateId: candidate.ID,
                notificationType: 'status_changed',
                n8nExecutionId: 'test-123'
            }
        });

        // Step 6: Verify notification record created
        const notifications = await SELECT.from(EmailNotifications)
            .where({ candidate_ID: candidate.ID });

        expect(notifications.length).toBe(1);
        expect(notifications[0].deliveryStatus).toBe('sent');

        // Step 7: Verify status history marked as sent
        const updatedHistory = await SELECT.from(CandidateStatusHistory)
            .where({ candidate_ID: candidate.ID });

        expect(updatedHistory[0].notificationSent).toBe(true);
    });
});
```

**Step 2: Run integration test**

```bash
npm test -- test/email-automation-integration.test.js
```

Expected: PASS

**Step 3: Commit**

```bash
git add test/email-automation-integration.test.js
git commit -m "test: add email automation integration test"
```

---

## Completion

All tasks completed! The email automation foundation is now in place:

✅ Database schema (EmailNotifications, CandidateStatusHistory, InterviewCalendarEvents)
✅ CAP service functions (getPendingStatusNotifications, markNotificationSent)
✅ Status change tracking hooks
✅ Webhook client with retry logic
✅ Email templates (base, cv-received, under-review, interview-invitation)
✅ n8n workflow stubs
✅ Configuration and documentation
✅ Integration tests

**Next Steps:**
1. Deploy CAP service changes
2. Configure n8n instance with workflows
3. Set up email server credentials
4. Test end-to-end flow
5. Monitor and iterate based on usage

**See:** `docs/EMAIL_AUTOMATION_SETUP.md` for deployment instructions.
