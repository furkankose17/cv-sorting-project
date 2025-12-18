# n8n Email Automation - Implementation Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable automated email notifications for CV processing, status changes, and interview scheduling via n8n workflow automation.

**Architecture:** Event-driven webhooks for immediate notifications + scheduled polling for batch operations (reminders, queued notifications).

**Tech Stack:** n8n (Docker), Mailhog (dev), Gmail SMTP (prod), CAP OData endpoints

---

## 1. Architecture Overview

```
┌─────────────────┐     Webhooks      ┌─────────────────┐     SMTP      ┌─────────────────┐
│   CAP Service   │ ───────────────▶  │      n8n        │ ───────────▶  │  Email Server   │
│                 │                   │   (Docker)      │               │ (Mailhog/Gmail) │
│  - Status Δ     │ ◀─────────────── │                 │               │                 │
│  - CV Upload    │    OData Polls    │  5 Workflows    │               │                 │
│  - Interviews   │                   │  8 Templates    │               │                 │
└─────────────────┘                   └─────────────────┘               └─────────────────┘
```

**Data Flow:**
1. **Event-driven (webhooks):** CAP calls n8n webhook when status changes, CV completes processing, or interview is created
2. **Poll-driven (scheduled):** n8n queries CAP every hour for pending interview reminders, every 5 min for queued notifications

**Key Components:**
- `webhook-helper.js` - Sends webhooks to n8n with retry logic (already exists)
- `EmailNotifications` entity - Tracks all sent emails (already exists)
- `InterviewCalendarEvents` entity - Stores ICS files and RSVP status (already exists)
- n8n workflows - Process events, render templates, send emails

**Environment Configs:**
- Development: Mailhog (captures emails without sending)
- Testing: Mailhog + automated verification
- Production: Gmail SMTP (or SendGrid later)

---

## 2. CAP Service Integration

**What exists:**
- `webhook-helper.js` with `sendStatusChangeWebhook()` and `sendInterviewWebhook()`
- Status change webhook trigger in `cv-sorting-service.js:765`
- `EmailNotifications` and `InterviewCalendarEvents` entities

**What needs to be added:**

### 2.1 CV Received Webhook

Location: `srv/cv-sorting-service.js` in `after('UPDATE', 'CVDocuments')` handler

```javascript
// When document status changes to 'completed', trigger cv-received webhook
if (data.status === 'completed' && data.candidate_ID) {
    await webhookHelper.sendWebhook('cv-received', {
        documentId: data.ID,
        candidateId: data.candidate_ID,
        fileName: data.fileName
    });
}
```

### 2.2 Interview Scheduled Webhook

Location: `srv/cv-sorting-service.js` or `srv/handlers/candidate-service.js`

```javascript
// Add after('CREATE', 'Interviews') handler
this.after('CREATE', 'Interviews', async (data, req) => {
    await webhookHelper.sendWebhook('interview-schedule', {
        interviewId: data.ID,
        candidateId: data.candidate_ID,
        scheduledAt: data.scheduledAt
    });
});
```

### 2.3 Polling Endpoint

Location: `srv/services.cds`

```cds
function getPendingInterviewReminders() returns array of {
    interviewId: UUID;
    candidateEmail: String;
    candidateName: String;
    scheduledAt: DateTime;
    interviewTitle: String;
    location: String;
};
```

### 2.4 Notification Logging Action

Location: `srv/services.cds`

```cds
action logEmailNotification(
    candidateId: UUID,
    notificationType: String,
    recipientEmail: String,
    subject: String,
    templateUsed: String,
    deliveryStatus: String
) returns EmailNotifications;
```

---

## 3. n8n Deployment & Configuration

### 3.1 Docker Setup

```bash
# Development with persistent data
docker run -d \
  --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=<secure-password> \
  n8nio/n8n
```

### 3.2 Credentials Configuration

| Credential | Type | Values |
|------------|------|--------|
| CAP Service | HTTP Header Auth | `X-Custom-Auth: <token>` |
| Mailhog SMTP | SMTP | Host: `localhost:1025`, No auth |
| Gmail SMTP | SMTP | Host: `smtp.gmail.com:587`, TLS, App Password |

### 3.3 Environment Variables

```bash
# n8n connection
N8N_WEBHOOK_URL=http://localhost:5678/webhook
ENABLE_WEBHOOKS=true
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRIES=2

# Email (Mailhog for dev)
SMTP_HOST=localhost
SMTP_PORT=1025
FROM_EMAIL=noreply@cv-sorting.local

# Gmail (for real sends)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
```

### 3.4 Mailhog Setup

```bash
docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
# SMTP on :1025, Web UI on http://localhost:8025
```

---

## 4. Workflow Configuration

### 4.1 Workflows to Import

| # | Workflow | Trigger | Description |
|---|----------|---------|-------------|
| 1 | Status Change Notification | Webhook `/status-change` | Fetches candidate → Renders template → Sends email → Logs |
| 2 | CV Received Confirmation | Webhook `/cv-received` | Fetches candidate + document → Sends confirmation |
| 3 | Interview Scheduling | Webhook `/interview-schedule` | Generates ICS → Sends invite with attachment |
| 4 | Interview Reminders | Schedule (hourly) | Queries pending → Sends reminders → Updates flag |
| 5 | Pending Notifications Poller | Schedule (5 min) | Processes queued notifications |

### 4.2 Post-Import Configuration

1. Open workflow in n8n UI
2. Click each HTTP/SMTP node
3. Select the credentials created above
4. Update `CAP_SERVICE_URL` to `http://host.docker.internal:4004`
5. Activate workflow

### 4.3 Webhook URLs

- `http://localhost:5678/webhook/status-change`
- `http://localhost:5678/webhook/cv-received`
- `http://localhost:5678/webhook/interview-schedule`

---

## 5. Testing Strategy

### 5.1 Unit Tests

Location: `srv/__tests__/webhook-helper.test.js`

- Test `sendWebhook()` with mocked axios
- Test retry logic (1st fail, 2nd succeed)
- Test timeout handling
- Test all webhook types

### 5.2 Integration Tests

Location: `tests/integration/email-workflows.test.js`

```javascript
test('status change triggers email', async () => {
    // 1. Update candidate status via CAP API
    await capClient.patch(`/Candidates(${id})`, { status_code: 'screening' });

    // 2. Wait for email (poll Mailhog API)
    const emails = await mailhog.getMessages({ to: 'candidate@test.com' });

    // 3. Verify email content
    expect(emails[0].subject).toContain('Application Status Update');
});
```

### 5.3 E2E Tests

Location: `e2e/tests/email-notifications.spec.ts`

- Full user journey: Upload CV → Process → Status change → Verify email
- Use Playwright to trigger UI actions
- Query Mailhog API to verify emails

---

## 6. Implementation Tasks

### Phase 1: Infrastructure Setup
1. Add Mailhog to docker-compose
2. Add n8n to docker-compose with volume persistence
3. Create `.env.example` with all email/webhook variables
4. Update `config-validator.js` to validate email config

### Phase 2: CAP Service Integration
5. Add `sendCVReceivedWebhook()` to webhook-helper
6. Wire CV-received trigger in `after('UPDATE', 'CVDocuments')`
7. Add `after('CREATE', 'Interviews')` handler for interview-schedule webhook
8. Add `getPendingInterviewReminders` function to services.cds
9. Implement the function in cv-sorting-service.js
10. Add `logEmailNotification` action for n8n callback

### Phase 3: n8n Workflow Setup
11. Import all 5 workflow JSON files
12. Configure CAP Service credentials
13. Configure SMTP credentials (Mailhog)
14. Update workflow nodes with correct URLs
15. Activate all workflows

### Phase 4: Testing
16. Write unit tests for webhook-helper
17. Write integration test for status-change flow
18. Write integration test for cv-received flow
19. Write integration test for interview-schedule flow
20. Write E2E test for full notification journey
21. Add npm scripts: `test:email`, `test:email:integration`

### Phase 5: Documentation & Polish
22. Update README with email automation setup
23. Add troubleshooting guide
24. Create `scripts/setup-email-dev.sh` for one-command setup

---

## 7. Success Criteria

- [ ] All 5 n8n workflows imported and active
- [ ] Status change emails sent within 5 seconds
- [ ] CV received confirmations sent on document completion
- [ ] Interview invitations include valid ICS attachment
- [ ] Interview reminders sent 24 hours before
- [ ] All emails logged in `EmailNotifications` table
- [ ] Unit tests passing (>80% coverage on webhook-helper)
- [ ] Integration tests verify all 3 webhook flows
- [ ] E2E test validates full journey
- [ ] One-command dev setup script works
