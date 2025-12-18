# Email Center Frontend Design

## Overview

A full admin center for the n8n email automation system, providing monitoring, control, and configuration capabilities. Lives as a new tab in the cv-management app with sub-tabs for different functions.

## Architecture

### Tab Structure

```
[Upload] [Documents] [Candidates] [Jobs] [Analytics] [Email Center]
                                                          ↓
                                    [Dashboard] [History] [Templates] [Settings]
```

### Data Flow

- **Read path**: UI queries `EmailNotifications` entity via OData for history, stats, and recent activity
- **Write path**: Settings changes update `NotificationSettings` entity
- **External integration**: Templates displayed from stored metadata; editing links open n8n UI

### New Backend Additions

- `NotificationSettings` entity for toggle states
- `getEmailStats()` function returning aggregated metrics
- `getRecentNotifications(limit)` with pagination
- `retryFailedNotification(id)` action for manual retry
- `testWebhookConnection()` action for health checks
- `updateNotificationSettings()` action for saving config

### Frontend Components

- `EmailCenter.view.xml` - Main container with IconTabBar
- `EmailDashboard.fragment.xml` - Stats, health, activity, actions
- `EmailHistory.fragment.xml` - Filterable notification list
- `EmailTemplates.fragment.xml` - Template cards with n8n links
- `EmailSettings.fragment.xml` - Toggle switches and config

---

## Dashboard Sub-Tab

### Stats Cards Row

4 key metrics in horizontal cards:
- **Sent Today**: Count with trend arrow vs yesterday
- **Delivery Rate**: Percentage (sent / total attempted)
- **Failed**: Count with red highlight if > 0, clickable to filter History
- **Pending Queue**: Count of queued notifications awaiting send

### System Health Panel

Compact status indicators:
- n8n connection status (Connected/Disconnected)
- SMTP status (OK/Degraded/Down)
- Last successful send timestamp
- Webhooks enabled badge

### Recent Activity Feed

Last 10 notifications showing:
- Type icon
- Notification type
- Recipient email
- Time ago
- Status indicator (success/failure)

### Quick Actions Panel

- "Retry Failed" (disabled if no failures)
- "Send Test Email"
- "Open n8n Dashboard" (external link)
- "Refresh Stats"

---

## History Sub-Tab

### Filter Bar

Horizontal row of filter controls:
- **Date Range**: DatePicker with presets (Today, Last 7 days, Last 30 days, Custom)
- **Type**: MultiComboBox (CV Received, Status Changed, Interview Invitation, etc.)
- **Status**: MultiComboBox (Queued, Sent, Failed, Bounced)
- **Search**: Input field for recipient email or candidate name
- **Clear Filters** button

### Notification Table

Columns:
| Sent At | Type | Recipient | Candidate | Job | Status | Actions |

Actions column:
- View details (opens dialog)
- Retry (only for failed/bounced)

### Detail Dialog

Shows full notification info:
- Full subject line
- Template used
- Timestamps (created, sent, opened, clicked)
- Delivery status with error message if failed
- Link to candidate profile
- Raw payload (collapsible, for debugging)

### Pagination

Bottom bar with items per page (25/50/100) and page navigation

---

## Templates Sub-Tab

### Template Cards Grid

One card per notification type:
- CV Received
- Status Changed
- Interview Invitation
- Interview Reminder
- Interview Confirmed
- Offer Extended
- Application Rejected

Each card shows:
- Template name with icon
- Subject line preview
- Last edited date
- Preview button
- "Edit in n8n" external link

### Preview Dialog

- Rendered HTML preview with sample data
- Shows available variables list
- "Send Test" button

### Info Banner

> "Email templates are managed in n8n. Click 'Edit in n8n' to modify template content, styling, or logic."

---

## Settings Sub-Tab

### Webhook Configuration Panel

- Enable Webhooks toggle
- n8n Webhook URL input
- Connection status indicator
- Test Connection button

### Notification Types Panel

Toggle each type on/off:
- CV Received (default: ON)
- Status Changed (default: ON)
- Interview Invitation (default: ON)
- Interview Reminder (default: ON)
- Offer Extended (default: OFF)
- Application Rejected (default: OFF)

Each toggle shows brief description of when it fires.

### Timing & Rate Limits Panel

- Notification Cooldown: hours input (prevent duplicates)
- Reminder Window: hours before interview
- Rate Limit: emails per minute

### Save Button

"Save Settings" with success toast on save

---

## Implementation Tasks

### Backend (7 tasks)

1. Create `NotificationSettings` entity for storing toggle states
2. Add `getEmailStats()` function - aggregates counts by status, calculates rates
3. Add `getRecentNotifications(limit)` function - last N notifications
4. Add `retryFailedNotification(id)` action - re-triggers webhook for failed item
5. Add `testWebhookConnection()` action - pings n8n health endpoint
6. Add `updateNotificationSettings()` action - saves toggle/config changes
7. Expose `EmailNotifications` entity via OData with proper filtering

### Frontend (8 tasks)

1. Create `EmailCenter.view.xml` with IconTabBar for sub-tabs
2. Create `EmailDashboard.fragment.xml` - stats cards, health panel, activity feed, quick actions
3. Create `EmailHistory.fragment.xml` - filter bar, table, detail dialog
4. Create `EmailTemplates.fragment.xml` - template cards grid, preview dialog
5. Create `EmailSettings.fragment.xml` - toggle panels, save functionality
6. Add `EmailCenter.controller.js` with data binding and event handlers
7. Add route and tab to manifest.json
8. Add i18n translations

### Testing (3 tasks)

1. Unit tests for new backend functions
2. Integration tests for settings persistence
3. E2E tests for tab navigation and basic flows

---

## Technical Notes

- Templates are view-only; n8n is the source of truth for template content
- Settings toggles control whether CAP fires webhooks, not n8n behavior
- Health check pings n8n's `/healthz` endpoint
- Failed notifications can be retried via the same webhook mechanism
