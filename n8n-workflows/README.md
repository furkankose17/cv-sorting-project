# n8n Email Automation Workflows

This directory contains n8n workflow definitions for automating email notifications in the CV Sorting Application.

## Overview

These workflows integrate with the CAP service to send automated emails for various events in the candidate management lifecycle:

1. **status-change-notification** - Sends emails when candidate status changes
2. **cv-received-confirmation** - Confirms CV receipt with candidates
3. **interview-scheduling** - Sends interview invitations with calendar attachments
4. **interview-reminders** - Sends reminders 24 hours before interviews
5. **pending-notifications-poller** - Polls for and processes pending notifications

## Prerequisites

### Required Software

- n8n (version 1.x or later)
- Access to the CAP service
- SMTP server for sending emails

### Environment Variables

Configure these environment variables in your n8n instance:

```bash
# CAP Service Configuration
CAP_SERVICE_URL=http://localhost:4004
CAP_SERVICE_USER=admin
CAP_SERVICE_PASSWORD=your-password

# Email Template Path
TEMPLATE_PATH=/path/to/email-templates

# Sender Configuration
EMAIL_FROM=noreply@yourcompany.com
EMAIL_FROM_NAME=CV Sorting System
```

### n8n Credentials

Create the following credentials in n8n:

1. **SMTP Account** (name: `smtp`)
   - Type: SMTP
   - Host: Your SMTP server
   - Port: 587 (or your SMTP port)
   - Username: Your SMTP username
   - Password: Your SMTP password
   - Secure: true

2. **HTTP Basic Auth** (name: `cap-service`)
   - Type: Header Auth
   - Name: Authorization
   - Value: Basic [base64-encoded credentials]

## Workflow Descriptions

### 1. Status Change Notification (`1-status-change-notification.json`)

**Trigger:** Webhook (POST request from CAP service)

**Purpose:** Sends email notifications when a candidate's status changes.

**Input Payload:**
```json
{
  "candidateId": "uuid",
  "statusChange": {
    "oldStatus": "Applied",
    "newStatus": "Under Review",
    "changedAt": "2025-01-15T10:30:00Z",
    "changedBy": "John Doe"
  }
}
```

**Process Flow:**
1. Receives webhook trigger with candidate and status data
2. Fetches candidate details from CAP service
3. Loads and populates status-changed.html template
4. Sends email to candidate
5. Calls markNotificationSent action
6. Handles errors and retries

**Webhook URL:** `http://your-n8n-instance:5678/webhook/status-change`

---

### 2. CV Received Confirmation (`2-cv-received-confirmation.json`)

**Trigger:** Webhook (POST request on CV upload)

**Purpose:** Sends confirmation email when a CV is successfully uploaded and processed.

**Input Payload:**
```json
{
  "candidateId": "uuid",
  "documentId": "uuid",
  "fileName": "john_doe_cv.pdf"
}
```

**Process Flow:**
1. Receives webhook with CV upload data
2. Fetches candidate and document details
3. Loads cv-received.html template
4. Sends confirmation email
5. Marks notification as sent

**Webhook URL:** `http://your-n8n-instance:5678/webhook/cv-received`

---

### 3. Interview Scheduling (`3-interview-scheduling.json`)

**Trigger:** Webhook (POST request on interview creation)

**Purpose:** Sends interview invitation with calendar attachment.

**Input Payload:**
```json
{
  "interviewId": "uuid"
}
```

**Process Flow:**
1. Receives interview ID
2. Fetches interview and candidate details
3. Generates .ics calendar file
4. Loads interview-invitation.html template
5. Sends email with calendar attachment
6. Creates InterviewCalendarEvents record
7. Marks notification as sent

**Webhook URL:** `http://your-n8n-instance:5678/webhook/interview-schedule`

---

### 4. Interview Reminders (`4-interview-reminders.json`)

**Trigger:** Schedule (every hour)

**Purpose:** Sends reminder emails 24 hours before scheduled interviews.

**Process Flow:**
1. Runs on hourly schedule
2. Queries interviews scheduled in next 24-48 hours without reminder sent
3. For each interview:
   - Fetches candidate details
   - Loads interview-reminder.html template
   - Sends reminder email
   - Updates interview reminder flag
4. Logs results

**Schedule:** `0 * * * *` (every hour at minute 0)

---

### 5. Pending Notifications Poller (`5-pending-notifications-poller.json`)

**Trigger:** Schedule (every 5 minutes)

**Purpose:** Polls for pending status change notifications and processes them.

**Process Flow:**
1. Runs every 5 minutes
2. Calls getPendingStatusNotifications CAP function
3. For each pending notification:
   - Loads status-changed.html template
   - Sends email
   - Marks notification as sent
4. Handles errors with retry logic

**Schedule:** `*/5 * * * *` (every 5 minutes)

## Installation Instructions

### Step 1: Import Workflows

1. Open n8n web interface
2. Click "Workflows" in the left sidebar
3. Click "Import from File" button
4. Select a workflow JSON file
5. Repeat for all 5 workflow files

### Step 2: Configure Credentials

1. Go to "Credentials" in n8n
2. Create SMTP credential:
   - Click "Add Credential"
   - Select "SMTP"
   - Enter your SMTP server details
   - Name it `smtp`
   - Save

3. Create CAP Service credential:
   - Click "Add Credential"
   - Select "Header Auth"
   - Name: `Authorization`
   - Value: `Basic <base64(username:password)>`
   - Save as `cap-service`

### Step 3: Set Environment Variables

Add to your n8n environment configuration (`.env` file or environment):

```bash
CAP_SERVICE_URL=http://localhost:4004
TEMPLATE_PATH=/path/to/email-templates
EMAIL_FROM=noreply@yourcompany.com
EMAIL_FROM_NAME=CV Sorting System
```

### Step 4: Activate Workflows

1. Open each imported workflow
2. Review node configurations
3. Update any hardcoded values if needed
4. Click "Active" toggle to enable the workflow
5. Save the workflow

## Testing

### Testing Webhook Workflows (1, 2, 3)

Use curl or Postman to send test requests:

**Test Status Change Notification:**
```bash
curl -X POST http://your-n8n-instance:5678/webhook/status-change \
  -H "Content-Type: application/json" \
  -d '{
    "candidateId": "test-uuid",
    "statusChange": {
      "oldStatus": "Applied",
      "newStatus": "Under Review",
      "changedAt": "2025-01-15T10:30:00Z",
      "changedBy": "Test User"
    }
  }'
```

**Test CV Received:**
```bash
curl -X POST http://your-n8n-instance:5678/webhook/cv-received \
  -H "Content-Type: application/json" \
  -d '{
    "candidateId": "test-uuid",
    "documentId": "doc-uuid",
    "fileName": "test_cv.pdf"
  }'
```

**Test Interview Scheduling:**
```bash
curl -X POST http://your-n8n-instance:5678/webhook/interview-schedule \
  -H "Content-Type: application/json" \
  -d '{
    "interviewId": "interview-uuid"
  }'
```

### Testing Scheduled Workflows (4, 5)

1. Open the workflow in n8n
2. Click "Execute Workflow" button to run manually
3. Check execution logs for results
4. Verify emails are sent correctly

### Monitoring

1. **Execution History:**
   - Open workflow
   - Click "Executions" tab
   - Review success/failure status

2. **Error Notifications:**
   - Configure n8n to send error alerts
   - Set up Slack/email notifications for failures

3. **Logs:**
   - Check n8n logs: `docker logs n8n` (if using Docker)
   - Review CAP service logs for API calls

## Troubleshooting

### Common Issues

**Issue: Webhook not receiving requests**
- Check that n8n is publicly accessible or accessible from CAP service
- Verify webhook URL is correctly configured in CAP service
- Check firewall and network settings

**Issue: Email not sending**
- Verify SMTP credentials are correct
- Check SMTP server allows connections
- Review email send node execution logs
- Test SMTP settings outside n8n

**Issue: CAP service API calls failing**
- Verify CAP_SERVICE_URL is correct
- Check CAP service is running
- Verify authentication credentials
- Review CAP service logs

**Issue: Template not found**
- Check TEMPLATE_PATH environment variable
- Verify template files exist at specified path
- Ensure n8n has read access to template directory

**Issue: Schedule not running**
- Verify workflow is activated
- Check n8n scheduler is running
- Review timezone settings

### Debug Mode

Enable debug mode for detailed logging:

1. Open workflow
2. Click "Settings" tab
3. Enable "Save execution progress"
4. Enable "Save manual executions"
5. Run workflow and review detailed execution data

## Webhook URLs Configuration

After importing workflows, configure these webhook URLs in your CAP service:

```javascript
// In CAP service configuration or environment
const N8N_WEBHOOKS = {
  statusChange: 'http://your-n8n-instance:5678/webhook/status-change',
  cvReceived: 'http://your-n8n-instance:5678/webhook/cv-received',
  interviewSchedule: 'http://your-n8n-instance:5678/webhook/interview-schedule'
};
```

## Maintenance

### Regular Tasks

1. **Monitor execution logs** - Check for failures weekly
2. **Update templates** - Keep email templates current
3. **Review error rates** - Investigate if error rate > 5%
4. **Test workflows** - Run end-to-end tests monthly
5. **Update credentials** - Rotate passwords quarterly

### Backup

Export workflows regularly:

1. Open workflow
2. Click menu (three dots)
3. Select "Download"
4. Save JSON file to version control

## Security Considerations

1. **Use environment variables** for all sensitive data
2. **Secure webhook endpoints** with authentication if possible
3. **Limit workflow execution** permissions appropriately
4. **Monitor API usage** to detect anomalies
5. **Keep n8n updated** to latest stable version
6. **Use HTTPS** for all webhook endpoints in production

## Support

For issues or questions:

1. Check n8n documentation: https://docs.n8n.io
2. Review CAP service documentation
3. Check workflow execution logs
4. Contact system administrator

## Version History

- v1.0.0 (2025-01-15) - Initial workflow implementations
  - Status change notifications
  - CV received confirmation
  - Interview scheduling
  - Interview reminders
  - Pending notifications poller
