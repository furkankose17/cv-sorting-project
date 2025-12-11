# n8n Workflows for CV Sorting

This folder contains n8n workflow configurations for the CV Sorting application.

## Workflows

### 1. CV Email Capture (`cv-email-capture.json`)

Automatically processes CVs sent via email.

**Flow:**
1. **IMAP Trigger** - Monitors inbox for new emails (every 5 minutes)
2. **Filter Attachments** - Checks if email has attachments
3. **Split Attachments** - Processes each attachment separately
4. **Validate File Type** - Ensures file is PDF, DOCX, or image
5. **Upload to CAP** - Stores document in SAP CAP service
6. **OCR Process** - Extracts text using Python ML service
7. **Generate Embedding** - Creates vector embedding for semantic search
8. **Update Status** - Marks document as processed
9. **Send Confirmation** - Emails sender with receipt confirmation

**Required Credentials:**
- `CV Inbox IMAP` - IMAP credentials for email inbox
- `CAP Service OAuth2` - OAuth2 credentials for CAP API
- `SMTP Notification` - SMTP credentials for sending emails

**Environment Variables:**
- `CAP_SERVICE_URL` - URL of the CAP service
- `ML_SERVICE_URL` - URL of the Python ML service
- `NOTIFICATION_FROM_EMAIL` - Sender email for confirmations

### 2. Match Threshold Notification (`match-notification.json`)

Sends HR notifications when match threshold is reached.

**Flow:**
1. **Webhook Trigger** - Receives notification from CAP when matches found
2. **Parse Data** - Extracts job and candidate info
3. **Get Job Details** - Fetches job posting information
4. **Check Threshold** - Verifies minimum candidates count
5. **Check Cooldown** - Prevents notification spam
6. **Send HR Email** - Beautiful HTML email with candidate summary
7. **Record Notification** - Logs notification for cooldown tracking

**Required Credentials:**
- `CAP Service OAuth2` - OAuth2 credentials for CAP API
- `SMTP Notification` - SMTP credentials for sending emails

**Environment Variables:**
- `CAP_SERVICE_URL` - URL of the CAP service
- `ML_SERVICE_URL` - URL of the Python ML service
- `APP_URL` - Base URL of the application
- `HR_NOTIFICATION_EMAIL` - HR email for notifications
- `NOTIFICATION_FROM_EMAIL` - Sender email
- `MIN_CANDIDATES_THRESHOLD` - Minimum candidates (default: 5)
- `NOTIFICATION_COOLDOWN_HOURS` - Hours between notifications (default: 24)

## Setup Instructions

### 1. Import Workflows

1. Log into n8n admin panel
2. Go to **Workflows** → **Import from File**
3. Select `cv-email-capture.json` and import
4. Repeat for `match-notification.json`

### 2. Configure Credentials

#### IMAP Credentials (CV Inbox)
```
Host: imap.example.com
Port: 993
User: cv-inbox@example.com
Password: ********
SSL: true
```

#### OAuth2 Credentials (CAP Service)
```
Client ID: <from xs-security.json>
Client Secret: <from service binding>
Token URL: https://<subdomain>.authentication.eu10.hana.ondemand.com/oauth/token
```

#### SMTP Credentials
```
Host: smtp.example.com
Port: 587
User: notifications@example.com
Password: ********
TLS: true
```

### 3. Set Environment Variables

In n8n settings or via environment:

```env
CAP_SERVICE_URL=https://cv-sorting-srv.cfapps.eu10.hana.ondemand.com
ML_SERVICE_URL=https://cv-sorting-ml.cfapps.eu10.hana.ondemand.com
APP_URL=https://cv-sorting.cfapps.eu10.hana.ondemand.com
HR_NOTIFICATION_EMAIL=hr@example.com
NOTIFICATION_FROM_EMAIL=noreply@example.com
MIN_CANDIDATES_THRESHOLD=5
NOTIFICATION_COOLDOWN_HOURS=24
```

### 4. Activate Workflows

1. Open each workflow
2. Toggle **Active** to ON
3. Test with sample data

## Webhook URLs

After activation, the notification workflow webhook URL will be:
```
https://<n8n-host>/webhook/match-notification
```

Configure this URL in the CAP Notification Service environment:
```env
# Set in CAP service environment (mta.yaml or .env)
N8N_WEBHOOK_URL=https://<n8n-host>/webhook/match-notification
NOTIFICATION_COOLDOWN_HOURS=24
```

## CAP API Endpoints Used

The workflows call these CAP service endpoints (consolidated services):

| Workflow | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| CV Email Capture | `/api/candidates/uploadDocument` | POST | Upload CV document |
| CV Email Capture | `/api/candidates/CVDocuments({id})` | PATCH | Update document status |
| Match Notification | `/api/jobs/JobPostings({id})` | GET | Fetch job details |
| Match Notification | `/api/jobs/triggerNotification` | POST | Record sent notification |

## Python ML Service Endpoints Used

| Workflow | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| CV Email Capture | `/api/ocr/process` | POST | OCR text extraction |
| CV Email Capture | `/api/embeddings/generate` | POST | Generate embeddings |
| Match Notification | `/api/scoring/criteria/{jobId}` | GET | Get scoring criteria |

## Troubleshooting

### Email Not Triggering
- Verify IMAP credentials and inbox folder name
- Check n8n logs for connection errors
- Ensure email service allows IMAP access

### OCR Failures
- Verify ML service is running and accessible
- Check file size limits (default 10MB)
- Verify Tesseract language packs are installed

### Notification Not Sending
- Check SMTP credentials
- Verify HR email address is correct
- Review cooldown settings
