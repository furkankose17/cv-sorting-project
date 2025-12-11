# Workflows Overview

Automation workflows using n8n and SAP Build Process Automation (BPA).

---

## n8n Workflows

n8n is a self-hosted workflow automation tool used for email capture and notifications.

### Infrastructure

**Location:** `infrastructure/n8n/`

**Docker Configuration:**
```yaml
# In mta.yaml
- name: cv-sorting-n8n
  type: application
  optional: true
  parameters:
    docker:
      image: n8nio/n8n:latest
    memory: 1024M
    disk-quota: 2048M
  requires:
    - name: cv-sorting-postgresql
```

**Environment Variables:**
```bash
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<secure-password>
N8N_HOST=<n8n-service-url>
N8N_PROTOCOL=https
N8N_PORT=443
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=<postgres-host>
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=<user>
DB_POSTGRESDB_PASSWORD=<password>
```

---

### CV Email Capture Workflow

**File:** `infrastructure/n8n/cv-email-capture.json`

**Purpose:** Automatically capture CVs sent via email and upload them to the system.

#### Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  IMAP Email  │────►│   Filter     │────►│   Extract    │
│  Trigger     │     │  Attachments │     │  Metadata    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Success     │◄────│   CAP API    │◄────│   Base64     │
│  Response    │     │   Upload     │     │   Encode     │
└──────────────┘     └──────────────┘     └──────────────┘
```

#### Workflow Nodes

1. **IMAP Email Trigger**
   - Polls mailbox every 5 minutes
   - Filters for new emails only
   - Extracts attachments

2. **Filter Attachments**
   - Allowed types: PDF, DOCX, DOC, PNG, JPG
   - Max file size: 20MB
   - Rejects invalid files

3. **Extract Metadata**
   - Sender email → candidate contact
   - Subject line → notes
   - Attachment filename

4. **Base64 Encode**
   - Converts binary attachment to base64
   - Prepares for API call

5. **CAP API Upload**
   - Endpoint: `POST /api/candidates/uploadDocument`
   - Body:
     ```json
     {
       "fileName": "{{ $json.attachment.fileName }}",
       "fileContent": "{{ $json.attachment.contentBase64 }}",
       "mediaType": "{{ $json.attachment.mimeType }}"
     }
     ```

6. **Success Response**
   - Logs upload result
   - Optional: Send confirmation email

#### Configuration

```json
{
  "nodes": [
    {
      "name": "IMAP Email",
      "type": "n8n-nodes-base.emailReadImap",
      "parameters": {
        "mailbox": "INBOX",
        "postProcessAction": "read",
        "options": {
          "downloadAttachments": true,
          "allowUnauthorizedCerts": false
        }
      },
      "credentials": {
        "imap": {
          "host": "{{ $env.IMAP_HOST }}",
          "port": 993,
          "secure": true,
          "user": "{{ $env.IMAP_USER }}",
          "password": "{{ $env.IMAP_PASSWORD }}"
        }
      }
    }
  ]
}
```

---

### Match Notification Workflow

**File:** `infrastructure/n8n/match-notification.json`

**Purpose:** Notify recruiters when new candidates match a job posting.

#### Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Webhook    │────►│   Check      │────►│   Build      │
│   Trigger    │     │   Threshold  │     │   Email      │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Log        │◄────│   Record     │◄────│   Send       │
│   Result     │     │   History    │     │   Email      │
└──────────────┘     └──────────────┘     └──────────────┘
```

#### Webhook Payload

Triggered by CAP after match calculation:

```json
{
  "jobPostingId": "uuid-string",
  "jobTitle": "Senior Developer",
  "matchCount": 5,
  "topCandidates": [
    {
      "candidateId": "uuid-1",
      "name": "John Doe",
      "score": 92.5,
      "topSkills": ["JavaScript", "React", "Node.js"]
    },
    {
      "candidateId": "uuid-2",
      "name": "Jane Smith",
      "score": 88.3,
      "topSkills": ["Python", "Django", "PostgreSQL"]
    }
  ],
  "notifyEmail": "hr@company.com",
  "threshold": 80
}
```

#### Workflow Nodes

1. **Webhook Trigger**
   - Path: `/webhook/match-notification`
   - Method: POST
   - Authentication: Basic Auth

2. **Check Threshold**
   - Compare match count against minimum
   - Check if notification already sent recently

3. **Build Email**
   - HTML template with candidate cards
   - Score visualization
   - Direct links to candidate profiles

4. **Send Email**
   - SMTP integration
   - Subject: `New Candidates Match: {{ $json.jobTitle }}`

5. **Record History**
   - Call CAP: `POST /api/jobs/recordNotification`
   - Track sent notifications

#### Email Template

```html
<h2>New Candidate Matches for {{ jobTitle }}</h2>
<p>{{ matchCount }} candidates scored above {{ threshold }}%</p>

<table>
  <tr>
    <th>Candidate</th>
    <th>Score</th>
    <th>Top Skills</th>
  </tr>
  {% for candidate in topCandidates %}
  <tr>
    <td>{{ candidate.name }}</td>
    <td>{{ candidate.score }}%</td>
    <td>{{ candidate.topSkills | join(', ') }}</td>
  </tr>
  {% endfor %}
</table>

<p><a href="{{ appUrl }}/jobs/{{ jobPostingId }}">View All Matches</a></p>
```

---

## SAP Build Process Automation Workflows

**Location:** `workflows/`

SAP BPA workflows for approval processes and complex orchestration.

---

### CV Processing Workflow

**File:** `workflows/cv-processing-workflow.json`

**Purpose:** Orchestrate CV upload, processing, and candidate creation.

#### Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  API/Event   │────►│   Validate   │────►│   Call OCR   │
│  Trigger     │     │   File Type  │     │   Service    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
         ┌───────────────────────────────────────┘
         ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Parallel:   │────►│   Create     │────►│   Generate   │
│  Extract All │     │   Candidate  │     │   Embedding  │
└──────────────┘     └──────────────┘     └──────────────┘
         │
         ├── Extract Skills
         ├── Extract Education
         ├── Extract Experience
         └── Extract Languages
```

#### Workflow Definition

```json
{
  "id": "cv-processing-workflow",
  "name": "CV Processing Workflow",
  "triggers": [
    {
      "type": "api",
      "path": "/cv-processing"
    },
    {
      "type": "event",
      "topic": "cv.uploaded"
    }
  ],
  "steps": [
    {
      "id": "validate",
      "type": "script",
      "script": "validateFileType"
    },
    {
      "id": "ocr",
      "type": "service-call",
      "destination": "ml-service",
      "path": "/api/ocr/process"
    },
    {
      "id": "extract-parallel",
      "type": "parallel",
      "branches": [
        { "id": "extract-skills" },
        { "id": "extract-education" },
        { "id": "extract-experience" },
        { "id": "extract-languages" }
      ]
    },
    {
      "id": "create-candidate",
      "type": "service-call",
      "destination": "cap-service",
      "path": "/api/candidates/createCandidateFromDocument"
    },
    {
      "id": "generate-embedding",
      "type": "service-call",
      "destination": "ml-service",
      "path": "/api/embeddings/generate"
    }
  ]
}
```

---

### Approval Workflow

**File:** `workflows/approval-workflow.json`

**Purpose:** Multi-level approval for candidate status changes.

#### Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Status     │────►│   Check      │────►│   Route to   │
│   Change     │     │   Approval   │     │   Approver   │
│   Request    │     │   Required   │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                     ┌───────────────────────────┘
                     ▼
              ┌──────────────┐
              │   Approval   │
              │   Decision   │
              └──────────────┘
                     │
         ┌──────────┴──────────┐
         ▼                     ▼
┌──────────────┐       ┌──────────────┐
│   Approved   │       │   Rejected   │
│   Update     │       │   Notify     │
│   Status     │       │   Requester  │
└──────────────┘       └──────────────┘
```

#### Approval Rules

| From Status | To Status | Approver |
|-------------|-----------|----------|
| screening | interviewing | Recruiter (auto) |
| interviewing | shortlisted | HR Manager |
| shortlisted | offered | HR Manager + Hiring Manager |
| offered | hired | HR Manager |

#### Workflow Definition

```json
{
  "id": "approval-workflow",
  "name": "Candidate Status Approval",
  "triggers": [
    {
      "type": "event",
      "topic": "candidate.status.change.requested"
    }
  ],
  "steps": [
    {
      "id": "check-approval",
      "type": "decision",
      "condition": "{{ needsApproval(fromStatus, toStatus) }}"
    },
    {
      "id": "route-approver",
      "type": "script",
      "script": "getApprover"
    },
    {
      "id": "approval-form",
      "type": "user-task",
      "form": "approval-form",
      "assignee": "{{ approver }}",
      "dueDate": "P3D"
    },
    {
      "id": "process-decision",
      "type": "decision",
      "branches": [
        {
          "condition": "{{ decision == 'approved' }}",
          "next": "update-status"
        },
        {
          "condition": "{{ decision == 'rejected' }}",
          "next": "notify-rejection"
        }
      ]
    }
  ]
}
```

---

### Candidate Notification Workflow

**Purpose:** Send email notifications to candidates on status changes.

#### Notification Templates

| Status | Template | Subject |
|--------|----------|---------|
| screening | screening.html | Your Application is Under Review |
| interviewing | interview.html | Interview Invitation |
| shortlisted | shortlisted.html | Good News About Your Application |
| offered | offer.html | Job Offer |
| rejected | rejection.html | Application Update |

#### Integration

```javascript
// In CAP service handler
async function onStatusChange(req) {
  const { candidateId, newStatus } = req.data;

  // Update status
  await UPDATE(Candidates).set({ status_code: newStatus }).where({ ID: candidateId });

  // Trigger notification workflow
  await emitEvent('candidate.status.changed', {
    candidateId,
    status: newStatus,
    email: candidate.email,
    name: `${candidate.firstName} ${candidate.lastName}`
  });
}
```

---

## Webhook Integration

### CAP → n8n Webhooks

**Configuration in CAP:**

```javascript
const axios = require('axios');

async function triggerWebhook(webhookPath, payload) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678';

  try {
    await axios.post(`${n8nUrl}/webhook/${webhookPath}`, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      auth: {
        username: process.env.N8N_USER,
        password: process.env.N8N_PASSWORD
      }
    });
  } catch (error) {
    console.error('Webhook failed:', error.message);
    // Don't fail main operation if webhook fails
  }
}
```

### Available Webhooks

| Path | Trigger | Payload |
|------|---------|---------|
| `/match-notification` | New matches calculated | jobPostingId, matchCount, topCandidates |
| `/cv-processed` | CV OCR completed | documentId, candidateId, success |
| `/status-changed` | Candidate status changed | candidateId, oldStatus, newStatus |

---

## Error Handling

### Retry Configuration

```json
{
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 5000
}
```

### Dead Letter Queue

Failed workflow executions are logged for manual review:

```sql
-- n8n database
SELECT * FROM execution_entity
WHERE finished = true
AND status = 'error'
ORDER BY started_at DESC;
```

### Alerting

Configure n8n to send alerts on workflow failures:

1. Create error workflow
2. Subscribe to execution failures
3. Send email/Slack notification
