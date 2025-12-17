# n8n Workflows - Quick Start Guide

## Installation (5 Minutes)

### 1. Install n8n

```bash
# Using Docker (Recommended)
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# OR using npm
npm install -g n8n
n8n start
```

Access n8n at: `http://localhost:5678`

### 2. Import Workflows

1. Open n8n web interface
2. Click **Workflows** → **Import from File**
3. Import each JSON file (1-5):
   - `1-status-change-notification.json`
   - `2-cv-received-confirmation.json`
   - `3-interview-scheduling.json`
   - `4-interview-reminders.json`
   - `5-pending-notifications-poller.json`

### 3. Configure Credentials

#### SMTP Credential
1. Click **Credentials** → **Add Credential**
2. Select **SMTP**
3. Enter details:
   - **Name:** `smtp`
   - **Host:** Your SMTP server (e.g., smtp.gmail.com)
   - **Port:** 587
   - **Username:** Your email
   - **Password:** Your password
   - **Secure:** true
4. Click **Save**

#### CAP Service Credential
1. Click **Credentials** → **Add Credential**
2. Select **Header Auth**
3. Enter details:
   - **Name:** `cap-service`
   - **Header Name:** `Authorization`
   - **Header Value:** `Basic <base64-encoded-credentials>`
     ```bash
     # Generate base64 credentials:
     echo -n "username:password" | base64
     ```
4. Click **Save**

### 4. Set Environment Variables

**Using Docker:**
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -e CAP_SERVICE_URL=http://host.docker.internal:4004 \
  -e TEMPLATE_PATH=/templates \
  -e EMAIL_FROM=noreply@yourcompany.com \
  -e EMAIL_FROM_NAME="CV Sorting System" \
  -v ~/.n8n:/home/node/.n8n \
  -v /path/to/email-templates:/templates \
  n8nio/n8n
```

**Using npm:**
Create `.env` file in n8n directory:
```bash
CAP_SERVICE_URL=http://localhost:4004
TEMPLATE_PATH=/path/to/email-templates
EMAIL_FROM=noreply@yourcompany.com
EMAIL_FROM_NAME=CV Sorting System
```

### 5. Activate Workflows

1. Open each workflow
2. Click **Active** toggle (top right)
3. Click **Save**

---

## Testing Workflows

### Test Webhook Workflows

#### Status Change Notification
```bash
curl -X POST http://localhost:5678/webhook/status-change \
  -H "Content-Type: application/json" \
  -d '{
    "candidateId": "550e8400-e29b-41d4-a716-446655440000",
    "statusChange": {
      "oldStatus": "Applied",
      "newStatus": "Under Review",
      "changedAt": "2025-01-15T10:30:00Z",
      "changedBy": "John Doe"
    }
  }'
```

#### CV Received Confirmation
```bash
curl -X POST http://localhost:5678/webhook/cv-received \
  -H "Content-Type: application/json" \
  -d '{
    "candidateId": "550e8400-e29b-41d4-a716-446655440000",
    "documentId": "660e8400-e29b-41d4-a716-446655440001",
    "fileName": "john_doe_cv.pdf"
  }'
```

#### Interview Scheduling
```bash
curl -X POST http://localhost:5678/webhook/interview-schedule \
  -H "Content-Type: application/json" \
  -d '{
    "interviewId": "770e8400-e29b-41d4-a716-446655440002"
  }'
```

### Test Scheduled Workflows

1. Open workflow in n8n
2. Click **Execute Workflow** (bottom left)
3. Check results in execution panel

---

## Configure CAP Service

Add webhook URLs to your CAP service configuration:

**JavaScript Configuration:**
```javascript
// config/email-automation.js
module.exports = {
  n8n: {
    baseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
    webhooks: {
      statusChange: '/webhook/status-change',
      cvReceived: '/webhook/cv-received',
      interviewSchedule: '/webhook/interview-schedule'
    }
  }
};
```

**Call Webhooks from CAP Service:**
```javascript
// After status change
const axios = require('axios');
const config = require('./config/email-automation');

async function notifyStatusChange(candidateId, statusChange) {
  const url = `${config.n8n.baseUrl}${config.n8n.webhooks.statusChange}`;

  try {
    await axios.post(url, {
      candidateId,
      statusChange
    });
    console.log('Status change notification sent');
  } catch (error) {
    console.error('Failed to send notification:', error.message);
  }
}
```

---

## Monitoring

### View Execution History
1. Open workflow
2. Click **Executions** tab
3. Review success/failure status

### Check Logs
```bash
# Docker
docker logs n8n

# npm
# Check console output where n8n was started
```

### Common Issues

**Webhook not working?**
- Ensure workflow is activated
- Check n8n is accessible from CAP service
- Verify webhook URL in browser: `http://localhost:5678/webhook-test/status-change`

**Email not sending?**
- Verify SMTP credentials
- Check SMTP server allows connections
- Review execution logs for errors

**CAP service connection failed?**
- Verify CAP_SERVICE_URL is correct
- Check CAP service is running
- Test authentication credentials

---

## Email Templates

### Template Directory Structure
```
email-templates/
├── status-changed.html
├── cv-received.html
├── interview-invitation.html
└── interview-reminder.html
```

### Template Variables

**status-changed.html:**
- `{{candidateName}}` - Full name
- `{{firstName}}` - First name only
- `{{oldStatus}}` - Previous status
- `{{newStatus}}` - Current status
- `{{statusColor}}` - Color for status badge
- `{{changedAt}}` - Timestamp
- `{{changedBy}}` - User who changed status
- `{{year}}` - Current year

**cv-received.html:**
- `{{candidateName}}` - Full name
- `{{firstName}}` - First name only
- `{{fileName}}` - CV filename
- `{{uploadedAt}}` - Upload timestamp
- `{{hasExtractedData}}` - Boolean for extracted data
- `{{nextSteps}}` - Dynamic section
- `{{year}}` - Current year

**interview-invitation.html:**
- `{{candidateName}}` - Full name
- `{{firstName}}` - First name only
- `{{jobTitle}}` - Position title
- `{{interviewDate}}` - Formatted date/time
- `{{duration}}` - Interview duration
- `{{interviewType}}` - Type of interview
- `{{location}}` - Physical location
- `{{meetingLink}}` - Video call URL
- `{{notes}}` - Additional notes
- `{{year}}` - Current year

**interview-reminder.html:**
- `{{candidateName}}` - Full name
- `{{firstName}}` - First name only
- `{{jobTitle}}` - Position title
- `{{interviewDate}}` - Formatted date/time
- `{{hoursUntil}}` - Hours until interview
- `{{duration}}` - Interview duration
- `{{interviewType}}` - Type of interview
- `{{location}}` - Physical location
- `{{meetingLink}}` - Video call URL
- `{{notes}}` - Additional notes
- `{{year}}` - Current year

---

## Production Deployment

### Using Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=changeme
      - CAP_SERVICE_URL=http://cap-service:4004
      - TEMPLATE_PATH=/templates
      - EMAIL_FROM=noreply@yourcompany.com
      - EMAIL_FROM_NAME=CV Sorting System
      - N8N_HOST=n8n.yourcompany.com
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.yourcompany.com/
    volumes:
      - n8n-data:/home/node/.n8n
      - ./email-templates:/templates:ro
    networks:
      - app-network

volumes:
  n8n-data:

networks:
  app-network:
    external: true
```

### Security Checklist

- [ ] Enable HTTPS for webhook endpoints
- [ ] Set strong basic auth credentials
- [ ] Use environment variables for all secrets
- [ ] Restrict network access to n8n admin interface
- [ ] Configure SMTP with TLS/SSL
- [ ] Rotate credentials regularly
- [ ] Enable n8n audit logs
- [ ] Set up monitoring and alerts

---

## Maintenance

### Backup Workflows

```bash
# Export all workflows
for workflow in n8n-workflows/*.json; do
  name=$(basename "$workflow")
  curl -u admin:password \
    "http://localhost:5678/api/v1/workflows/$name" \
    > "backup/$name"
done
```

### Update Workflows

1. Edit JSON file
2. In n8n: **Workflows** → **Import from File**
3. Select "Replace existing workflow"
4. Import updated file

### Monitor Performance

```bash
# Check execution times
docker exec n8n sqlite3 /home/node/.n8n/database.sqlite \
  "SELECT name, AVG(executionTime) as avg_time FROM execution_entity GROUP BY name;"
```

---

## Support Resources

- **n8n Documentation:** https://docs.n8n.io
- **CAP Documentation:** https://cap.cloud.sap
- **Workflow Logs:** Check n8n execution history
- **Email Templates:** See `email-templates/` directory
- **Troubleshooting:** See `README.md`

---

## Next Steps

1. ✓ Import workflows
2. ✓ Configure credentials
3. ✓ Test webhooks
4. ✓ Configure CAP service
5. ✓ Create email templates
6. ✓ Test end-to-end
7. ✓ Deploy to production
8. ✓ Monitor and maintain

For detailed information, see `README.md` and `WORKFLOW_OVERVIEW.txt`.
