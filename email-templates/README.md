# Email Templates for n8n Automation

This directory contains professional HTML email templates used by n8n workflows for candidate communication.

## Overview

These templates are designed to be:
- **Responsive**: Mobile-friendly layouts that work on all devices
- **Compatible**: Tested across major email clients (Gmail, Outlook, Apple Mail)
- **Professional**: Clean, modern design with company branding
- **Accessible**: ARIA labels and semantic HTML for screen readers
- **n8n Ready**: Using `{{variableName}}` syntax for dynamic content

## Available Templates

| Template | Purpose | Key Variables |
|----------|---------|---------------|
| `cv-received.html` | Confirmation when CV is received | candidateFirstName, submittedAt, companyName |
| `status-changed.html` | Notification when application status changes | candidateFirstName, previousStatus, newStatus, statusReason |
| `interview-invitation.html` | Invitation to interview | candidateFirstName, interviewDate, interviewTime, interviewLocation, interviewType, interviewerName |
| `interview-reminder.html` | Reminder before interview | candidateFirstName, interviewDate, interviewTime, hoursUntil |
| `interview-confirmed.html` | Confirmation of interview attendance | candidateFirstName, interviewDate, interviewTime |
| `offer-extended.html` | Job offer notification | candidateFirstName, positionTitle, offerDetails |
| `application-rejected.html` | Rejection notification | candidateFirstName, positionTitle, rejectionReason |
| `general-update.html` | General updates and communications | candidateFirstName, updateMessage |

## Using Templates in n8n

### Step 1: Read Template File

Use the "Read Binary File" node to load the template:

```
Node: Read Binary File
- File Path: /path/to/email-templates/cv-received.html
- Property Name: data
```

### Step 2: Convert to Text

Use the "Move Binary Data" node:

```
Node: Move Binary Data
- Mode: Binary to Text
- Source Key: data
- Destination Key: htmlContent
```

### Step 3: Replace Variables

Use the "Set" node with expressions to replace variables:

```javascript
// In Set node, use expression:
{{ $json.htmlContent
  .replace(/\{\{candidateFirstName\}\}/g, $json.firstName)
  .replace(/\{\{candidateLastName\}\}/g, $json.lastName)
  .replace(/\{\{companyName\}\}/g, 'YourCompany')
}}
```

Or use the "HTML Template" node (if available):

```
Node: HTML Template
- Template: {{ $node["Read Binary File"].json.htmlContent }}
- Variables: Set each variable from your data
```

### Step 4: Send Email

Use the "Send Email" node:

```
Node: Send Email (SMTP/Gmail/etc.)
- To: {{ $json.email }}
- Subject: Based on template type
- HTML: {{ $json.processedHtml }}
```

## Template Variables

### Common Variables (All Templates)

- `{{companyName}}` - Your company name
- `{{companyWebsite}}` - Your company website URL
- `{{companyEmail}}` - Contact email address
- `{{companyPhone}}` - Contact phone number
- `{{companyAddress}}` - Company address
- `{{companyLogo}}` - URL to company logo image
- `{{unsubscribeLink}}` - Unsubscribe URL
- `{{currentYear}}` - Current year for copyright

### cv-received.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{candidateLastName}}` - Candidate's last name
- `{{submittedAt}}` - Submission timestamp (formatted)
- `{{positionTitle}}` - Job position applied for
- `{{applicationId}}` - Application reference number

### status-changed.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{previousStatus}}` - Previous application status
- `{{newStatus}}` - New application status
- `{{statusReason}}` - Reason for status change (optional)
- `{{nextSteps}}` - What happens next (optional)

### interview-invitation.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{positionTitle}}` - Job position
- `{{interviewDate}}` - Interview date (formatted: "Monday, January 15, 2025")
- `{{interviewTime}}` - Interview time (formatted: "2:00 PM EST")
- `{{interviewDuration}}` - Expected duration (e.g., "45 minutes")
- `{{interviewLocation}}` - Physical address or "Virtual"
- `{{interviewType}}` - Type (Phone, Video, In-Person)
- `{{meetingLink}}` - Video conference link (if virtual)
- `{{interviewerName}}` - Name of interviewer
- `{{interviewerTitle}}` - Interviewer's job title
- `{{confirmationLink}}` - Link to confirm attendance

### interview-reminder.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{interviewDate}}` - Interview date
- `{{interviewTime}}` - Interview time
- `{{hoursUntil}}` - Hours until interview (e.g., "24")
- `{{interviewLocation}}` - Location or meeting link
- `{{interviewType}}` - Type of interview
- `{{preparationTips}}` - Optional preparation suggestions

### interview-confirmed.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{interviewDate}}` - Interview date
- `{{interviewTime}}` - Interview time
- `{{interviewLocation}}` - Location or meeting link
- `{{calendarInvite}}` - Link to add to calendar

### offer-extended.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{positionTitle}}` - Job position
- `{{offerDetails}}` - Brief offer summary
- `{{offerLetterLink}}` - Link to full offer letter
- `{{responseDeadline}}` - Deadline to respond
- `{{hrContactName}}` - HR contact person
- `{{hrContactEmail}}` - HR contact email

### application-rejected.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{positionTitle}}` - Job position
- `{{rejectionReason}}` - Optional feedback
- `{{futureOpportunities}}` - Message about future openings
- `{{feedbackAvailable}}` - Whether feedback is available

### general-update.html

- `{{candidateFirstName}}` - Candidate's first name
- `{{updateTitle}}` - Title of the update
- `{{updateMessage}}` - Main message content (HTML supported)
- `{{actionRequired}}` - Whether action is needed
- `{{actionLink}}` - Link for action (if required)

## HTML Email Best Practices

### 1. Use Inline CSS

Email clients strip `<style>` tags. Always use inline styles:

```html
<!-- Good -->
<p style="color: #333333; font-size: 16px;">Text</p>

<!-- Bad -->
<style>.text { color: #333333; }</style>
<p class="text">Text</p>
```

### 2. Use Tables for Layout

Use `<table>` elements for reliable layout across email clients:

```html
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>Content</td>
  </tr>
</table>
```

### 3. Set Explicit Widths

Always specify widths in pixels for predictable rendering:

```html
<table width="600" style="max-width: 600px;">
```

### 4. Optimize Images

- Use absolute URLs for images
- Include alt text for accessibility
- Set explicit width and height
- Host images on reliable CDN

```html
<img src="https://cdn.example.com/logo.png"
     alt="Company Logo"
     width="150"
     height="50"
     style="display: block;">
```

### 5. Test Across Clients

Test templates in:
- Gmail (web and mobile)
- Outlook (Windows and Mac)
- Apple Mail (iOS and macOS)
- Yahoo Mail
- Android email clients

### 6. Keep Width Under 600px

Most email clients render best at 600px width or less.

### 7. Use Web-Safe Fonts

Stick to web-safe fonts:
- Arial
- Georgia
- Helvetica
- Times New Roman
- Verdana

## Customizing Templates

### Branding

Replace these placeholders with your brand values:

1. **Colors**: Update hex color codes throughout templates
   - Primary: `#0066CC` (brand blue)
   - Secondary: `#333333` (dark gray)
   - Accent: `#00AA66` (success green)

2. **Logo**: Replace `{{companyLogo}}` with actual logo URL

3. **Fonts**: Update font-family declarations

### Content

Templates include placeholder text. Customize:
- Tone of voice
- Message length
- Call-to-action text
- Footer information

### Structure

You can modify the template structure, but maintain:
- Responsive design principles
- Inline CSS styling
- Table-based layout
- Accessibility attributes

## Testing Templates

### Manual Testing

1. Create a test workflow in n8n
2. Use hardcoded test data
3. Send to your own email
4. Check rendering on multiple devices/clients

### Automated Testing

Use services like:
- [Litmus](https://litmus.com/)
- [Email on Acid](https://www.emailonacid.com/)
- [Mailtrap](https://mailtrap.io/)

### Preview Tools

- [PutsMail](https://putsmail.com/) - Free email preview
- [Email on Acid](https://www.emailonacid.com/) - Comprehensive testing
- [Litmus](https://litmus.com/) - Professional testing platform

## Troubleshooting

### Variables Not Replacing

- Ensure exact match: `{{variableName}}` is case-sensitive
- Check for extra spaces: `{{ variable }}` won't match `{{variable}}`
- Verify variable exists in n8n workflow data

### Images Not Showing

- Use absolute URLs (not relative)
- Ensure images are publicly accessible
- Check HTTPS hosting
- Include alt text for accessibility

### Layout Breaking

- Validate HTML structure
- Check for unclosed tags
- Ensure tables are properly nested
- Test inline CSS syntax

### Mobile Rendering Issues

- Use `max-width` instead of fixed width
- Test on actual mobile devices
- Ensure font sizes are readable (14px minimum)
- Make buttons large enough for touch (44px minimum)

## Security Considerations

1. **Sanitize User Input**: Never insert unsanitized user data
2. **Validate URLs**: Check all dynamic links
3. **HTTPS Only**: Use secure URLs for all resources
4. **Unsubscribe**: Always include unsubscribe option
5. **Privacy**: Don't include sensitive candidate data

## Compliance

Ensure emails comply with:
- **CAN-SPAM Act** (US): Include physical address, unsubscribe link
- **GDPR** (EU): Data protection, consent, right to be forgotten
- **CASL** (Canada): Consent requirements

## Support

For issues or questions:
- Check n8n documentation: https://docs.n8n.io/
- Review email best practices
- Test thoroughly before deployment

## Version History

- **v1.0.0** (2025-12-17): Initial template creation
  - 8 professional email templates
  - Responsive, mobile-friendly design
  - n8n variable syntax
  - Comprehensive documentation
