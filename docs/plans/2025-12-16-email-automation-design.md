# Email Automation Design - CV Sorting Application

**Date:** 2025-12-16
**Status:** Approved Design
**Author:** Design Session with User

## Overview

Complete email automation system for CV receiving and candidate status updates using n8n and SAP CAP service integration. Covers the full candidate lifecycle from application receipt to offer/rejection.

## Requirements

### Scope

- **CV Email Capture**: Receive CVs via email, process with OCR, send confirmations
- **Status Update Notifications**: Automated emails when candidate status changes
- **Interview Scheduling**: Calendar invites (.ics) with meeting details
- **Email Reply Processing**: Parse candidate replies and route intelligently
- **Bi-directional Communication**: Complete candidate lifecycle coverage

### Triggering Strategy

**Hybrid approach:**
- **Webhooks (real-time)**: Critical events - interview scheduled, offer extended, interview confirmed
- **Polling (2-5 min delay)**: Routine updates - status changes, application confirmations
- **Event-based**: CV received (IMAP), candidate replies (IMAP)

### Email Templates

- **Professional HTML templates** with company branding
- Logo, styled layouts, clear CTAs
- Responsive design for mobile/desktop
- Conditional content based on candidate data

### Interview Scheduling

- **Calendar integration** (.ics file generation)
- Include meeting links (Zoom/Teams placeholders)
- Track candidate confirmations in CAP service
- Interview reminder emails 24h before

### Reply Handling

- **Parse and route** based on keywords
- Common intents: CONFIRM, DECLINE, RESCHEDULE
- Auto-update CAP service for confirmations
- Forward complex replies to recruiters

### Data Protection

- Basic data protection with access controls
- Delete processed emails after 30 days
- Encrypted credential storage in n8n
- PII redaction in logs

## Architecture

### System Components

Five main n8n workflows:

1. **CV Email Capture** (enhanced existing)
2. **Status Change Polling** (new)
3. **Critical Event Webhook** (new)
4. **Interview Scheduling** (new)
5. **Email Reply Router** (new)

### Integration Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Email Server (IMAP/SMTP)              │
│  - Receive CVs                                           │
│  - Send status updates, invites                          │
│  - Process candidate replies                             │
└─────────────┬───────────────────────────┬────────────────┘
              │ IMAP                      │ Reply parsing
              ▼                           ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│  n8n Workflow Engine    │   │  Email Reply Router      │
│  - 5 workflows          │   │  - Keyword detection     │
│  - Template rendering   │◄──┤  - CAP updates           │
│  - Calendar .ics gen    │   │  - Recruiter routing     │
└─────────────┬───────────┘   └──────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│              CAP Service (CVSortingService)              │
│  Webhooks:                     Polling endpoints:        │
│  - /webhook/interview-scheduled  - /api/StatusChanges   │
│  - /webhook/offer-extended       - /api/PendingActions  │
└─────────────────────────────────────────────────────────┘
```

## Data Model

### New Entities (db/schema.cds)

```cds
// Email notification tracking
entity EmailNotifications {
  key ID: UUID;
  candidate: Association to Candidates;
  jobPosting: Association to JobPostings;
  notificationType: String enum {
    cv_received; status_changed; interview_invitation;
    interview_reminder; interview_confirmed; offer_extended;
    application_rejected; general_update;
  };
  recipientEmail: String(255);
  subject: String(500);
  templateUsed: String(100);
  sentAt: Timestamp;
  deliveryStatus: String enum { queued; sent; failed; bounced; };
  openedAt: Timestamp;
  clickedAt: Timestamp;
  errorMessage: String(1000);
  n8nExecutionId: String(100);
}

// Candidate status change tracking for polling
entity CandidateStatusHistory {
  key ID: UUID;
  candidate: Association to Candidates;
  oldStatus: String(50);
  newStatus: String(50);
  changedAt: Timestamp;
  changedBy: String(255);
  notificationSent: Boolean default false;
  notificationScheduledFor: DateTime;
  notes: String(2000);
}

// Interview calendar integration
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

### New CAP Service Functions (srv/services.cds)

```cds
// Get candidates with status changes pending notification
function getPendingStatusNotifications() returns array of {
  candidateId: UUID;
  candidateName: String;
  candidateEmail: String;
  oldStatus: String;
  newStatus: String;
  jobTitle: String;
  changedAt: Timestamp;
};

// Mark notification as sent
action markNotificationSent(
  candidateId: UUID,
  notificationType: String,
  n8nExecutionId: String
) returns { success: Boolean };

// Webhook endpoints for critical events
action notifyInterviewScheduled(
  interviewId: UUID
) returns { webhookTriggered: Boolean; n8nUrl: String };

action notifyOfferExtended(
  candidateId: UUID,
  jobPostingId: UUID,
  offerDetails: String
) returns { webhookTriggered: Boolean };
```

## n8n Workflow Details

### Workflow 1: Enhanced CV Email Capture

```
IMAP Trigger (every 5 min)
  ↓
Has Attachments? → Split Attachments → Valid File?
  ↓
Upload to CAP (/api/uploadDocument)
  ↓
Process OCR + Generate Embedding
  ↓
Create EmailNotification record (type: cv_received)
  ↓
Send Confirmation Email (HTML template)
  - Subject: "We received your application for [Job Title]"
  - Include: Application ID, next steps, timeline
  - Reply-To: recruiting@company.com
```

### Workflow 2: Status Change Polling

```
Cron Trigger (every 3 minutes)
  ↓
GET /api/getPendingStatusNotifications
  ↓
For each pending change:
  ↓
  Switch on newStatus:
    - "Under Review" → Template: under-review.html
    - "Screening" → Template: screening-scheduled.html
    - "Rejected" → Template: application-rejected.html
    - Default → Template: status-update.html
  ↓
  Render HTML Template with candidate data
  ↓
  Send Email via SMTP
  ↓
  POST /api/markNotificationSent
  ↓
  Create EmailNotifications record
```

### Workflow 3: Critical Event Webhooks

```
Webhook Trigger (/webhook/critical-event)
  Headers: { "X-Webhook-Secret": "..." }
  ↓
Validate webhook secret
  ↓
Parse payload: { eventType, candidateId, interviewId?, data }
  ↓
Switch on eventType:
  ├─ "interview_scheduled" → Generate .ics + Send invite
  ├─ "offer_extended" → Send offer email (high priority)
  └─ "interview_reminder" → Send reminder 24h before
  ↓
Create EmailNotifications record
  ↓
Return { success: true, executionId }
```

### Workflow 4: Interview Scheduling with Calendar

```
Webhook: /webhook/interview-scheduled
  ↓
GET /api/Interviews({interviewId}) with candidate, job details
  ↓
Generate .ics Calendar File (RFC 5545 format)
  ↓
Check if virtual interview → Include meeting link
  ↓
Render interview-invitation.html template
  ↓
Send email with .ics attachment
  ↓
Store .ics in InterviewCalendarEvents
  ↓
POST /api/markNotificationSent
```

### Workflow 5: Email Reply Router

```
IMAP Trigger (every 2 minutes)
  Filter: In-Reply-To or References headers (replies only)
  ↓
Extract reply metadata and find candidate by email
  ↓
Parse reply body for keywords:
  - "confirm" OR "accept" → Intent: CONFIRM
  - "decline" OR "reject" → Intent: DECLINE
  - "reschedule" → Intent: RESCHEDULE
  - Default → Intent: MANUAL_REVIEW
  ↓
Switch on Intent:
  ├─ CONFIRM: Update interview status, send acknowledgment
  ├─ DECLINE: Update status, forward to recruiter
  ├─ RESCHEDULE: Create note, send to recruiter
  └─ MANUAL_REVIEW: Forward to assigned recruiter
```

## Email Templates

### Template Structure

```
infrastructure/n8n/templates/
├── base-template.html          # Master layout
├── cv-received.html            # Application confirmation
├── under-review.html           # Status: Under review
├── screening-scheduled.html    # Screening interview
├── interview-invitation.html   # Formal interview invite
├── interview-reminder.html     # 24h reminder
├── interview-confirmed.html    # Confirmation acknowledgment
├── offer-extended.html         # Job offer
├── application-rejected.html   # Rejection (polite)
└── status-update.html          # Generic status change
```

### Base Template

Professional HTML with:
- Company header with logo
- Responsive container (max-width: 600px)
- Styled content area
- Footer with contact info and disclaimers
- SAP Fiori-inspired color scheme

### Interview Invitation Template

Key elements:
- Personalized greeting
- Interview details box (date, time, location, interviewer)
- "Add to Calendar" CTA with .ics attachment
- Meeting link (for virtual interviews)
- Preparation instructions
- Confirmation request (reply with "Confirm")

### Calendar (.ics) File Generation

RFC 5545 compliant iCalendar format with:
- Event summary, description, location
- Start/end times in UTC
- Organizer and attendee details
- 24-hour reminder alarm
- RSVP tracking

## CAP Service Implementation

### Webhook Event Emitters

**Helper function:**
```javascript
async function triggerN8nWebhook(eventType, payload) {
  const webhookUrl = process.env.N8N_WEBHOOK_BASE_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  // POST to n8n with secret header
  // Return execution ID
  // Handle errors gracefully
}
```

**Interview scheduled handler:**
```javascript
srv.on('confirm', 'Interviews', async (req) => {
  // Update interview status
  // Trigger n8n webhook
  // Create EmailNotification record
});
```

### Status Change Tracking

**Before UPDATE handler:**
```javascript
srv.before('UPDATE', 'Candidates', async (req) => {
  // Get current status
  // If status changed, insert into CandidateStatusHistory
});
```

**updateStatus action:**
```javascript
srv.on('updateStatus', 'Candidates', async (req) => {
  // Update candidate status
  // Record in status history
  // If critical status (Offer), trigger webhook immediately
});
```

### Polling Endpoint

```javascript
srv.on('getPendingStatusNotifications', async (req) => {
  // Query CandidateStatusHistory
  // WHERE notificationSent = false
  // Return max 50 pending changes
});

srv.on('markNotificationSent', async (req) => {
  // Update status history: notificationSent = true
  // Create EmailNotification record
});
```

### Error Handling

**Webhook retry logic:**
- 3 retry attempts with exponential backoff (1s, 2s, 4s)
- Log failures to EmailNotifications with status 'failed'
- Graceful degradation (don't throw errors)
- Manual review queue for failed notifications

## Security

### Webhook Authentication

- n8n validates `X-Webhook-Secret` header on all incoming webhooks
- Reject unauthorized requests with 401

### Email Data Protection

- Redact PII (email, names) in n8n execution logs
- Delete processed IMAP emails after 30 days
- Store credentials using n8n encrypted vault
- Limit workflow edit access to HR admins

### Rate Limiting

- Max 3 emails per candidate per day
- Max 50 emails per hour system-wide
- Track in EmailNotifications table
- Skip sending if limit exceeded

### Email Validation

- Validate email format with regex before sending
- Log invalid addresses for manual review
- Prevent email injection attacks

## Configuration

### Environment Variables

**CAP Service (.env / mta.yaml):**
```env
N8N_WEBHOOK_BASE_URL=https://n8n.company.com/webhook
N8N_WEBHOOK_SECRET=secure-random-string
EMAIL_FROM_ADDRESS=noreply@company.com
EMAIL_REPLY_TO=recruiting@company.com
EMAIL_NOTIFICATIONS_ENABLED=true
```

**n8n (.env):**
```env
# CAP Service
CAP_SERVICE_URL=https://cv-sorting-srv.cfapps.eu10.hana.ondemand.com
N8N_WEBHOOK_SECRET=secure-random-string

# ML Service
ML_SERVICE_URL=https://cv-sorting-ml.cfapps.eu10.hana.ondemand.com

# Email Server
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# Settings
EMAIL_FROM_ADDRESS=noreply@company.com
EMAIL_FROM_NAME=Company Recruitment Team
EMAIL_REPLY_TO=recruiting@company.com
STATUS_POLL_INTERVAL=3
MAX_EMAILS_PER_CANDIDATE_PER_DAY=3
DELETE_PROCESSED_EMAILS_AFTER_DAYS=30
DEFAULT_INTERVIEW_DURATION_MINUTES=60
INTERVIEW_REMINDER_HOURS_BEFORE=24
TIMEZONE=Europe/Berlin
```

### n8n Credentials

Store in n8n UI:
1. **CV Inbox IMAP** - Email monitoring
2. **CAP Service OAuth2** - API authentication
3. **SMTP Notification** - Outbound emails
4. **CAP Service API Key** - Webhook secret header

## Deployment

### Sequence

**Phase 1: Database & CAP Service**
1. Update `db/schema.cds` with new entities
2. Add webhook handlers to `srv/cv-sorting-service.js`
3. Add polling endpoints
4. Update environment variables
5. Deploy to Cloud Foundry

**Phase 2: n8n Workflows**
1. Import 5 workflows to n8n
2. Configure credentials (IMAP, SMTP, OAuth2)
3. Set environment variables
4. Test each workflow individually

**Phase 3: Email Templates**
1. Create template files in `infrastructure/n8n/templates/`
2. Import as reusable snippets in n8n
3. Test rendering with sample data
4. Get stakeholder approval

### Testing Strategy

**Unit Tests (per workflow):**
- CV Email Capture: Upload → OCR → Confirmation
- Status Polling: Detect change → Send email → Mark sent
- Interview Webhook: .ics generation → Email with attachment
- Reply Router: Parse intent → Update status → Route

**Integration Tests:**
- End-to-end CV application flow
- Interview scheduling → confirmation → status update
- Status change → email delivery → tracking
- Rate limiting enforcement

**Manual Testing:**
- Email rendering in Gmail, Outlook, mobile
- Calendar invites import correctly
- Reply-to addresses work
- Webhook authentication
- Error handling and retries

### Rollout Plan

**Week 1: Soft Launch** - Internal testing with HR team
**Week 2: Pilot Group** - 10-20 real candidates
**Week 3: Gradual Rollout** - 50% of applications
**Week 4: Full Production** - All candidates

**Rollback Plan:**
- Disable workflows in n8n
- Revert CAP service to previous version
- Queue pending notifications for manual sending

## Monitoring

### Metrics to Track

- Email volume (sent per hour/day)
- Delivery rate (successful vs failed)
- Webhook health (success rate, latency)
- Template usage distribution
- Reply processing (intents detected, manual review rate)

### Health Check Workflow

Daily cron job (9 AM):
- Query EmailNotifications for last 24h
- Calculate failure rate
- If > 5%, send alert to admin
- Create incident in CAP service

### Alerting

- SMTP failures
- Webhook authentication failures
- Rate limit exceeded
- CAP service unavailable
- IMAP connection issues

## Future Enhancements

Not in initial scope, consider for v2:

- **Template management UI** - Admin interface to edit email templates
- **A/B testing** - Test different email variations
- **Multi-language support** - Localized templates
- **Email analytics** - Open rates, click rates, engagement metrics
- **Self-service scheduling** - Candidates pick time slots
- **Calendar sync** - Google/Outlook bi-directional sync
- **SMS notifications** - Critical updates via SMS
- **GDPR compliance** - Explicit consent tracking, right to erasure

## Success Criteria

- 95%+ email delivery rate
- < 5% failed webhook calls
- < 1 minute average notification delay for critical events
- Zero manual email sending for routine updates
- Positive candidate feedback on email quality
- HR time savings of 50%+ on status communications

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Email spam filtering | High | Use authenticated SMTP, professional templates, opt-out links |
| n8n downtime | High | Retry logic, queue pending notifications, monitoring alerts |
| CAP service unavailable | Medium | Graceful degradation, store failures for retry |
| IMAP rate limits | Medium | Throttle polling, use dedicated inbox |
| Template rendering bugs | Low | Test across email clients, fallback to plain text |
| Reply parsing errors | Low | Default to manual review, improve keywords over time |

## Conclusion

This email automation system provides complete candidate lifecycle communication while maintaining security and reliability. The hybrid webhook/polling approach balances real-time responsiveness with implementation simplicity. Professional HTML templates and calendar integration create a polished candidate experience.
