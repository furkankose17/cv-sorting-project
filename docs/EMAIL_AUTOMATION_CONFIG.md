# Email Automation Configuration Guide

This document provides detailed information about configuring the email automation system for the CV Sorting Application.

## Table of Contents

- [Overview](#overview)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Overview

The email automation system integrates with n8n to provide intelligent email notifications for candidate status changes and high-scoring job matches. The system is designed to be flexible, resilient, and production-ready.

### Key Features

- Webhook-based integration with n8n
- Automatic retry logic with exponential backoff
- Configurable notification cooldown periods
- Rate limiting for email operations
- Feature flags for granular control
- Comprehensive logging

---

## Environment Variables

### Required Variables

These variables must be set for the email automation system to function:

#### `N8N_WEBHOOK_URL`

**Description:** Base URL for n8n webhook endpoints.

**Type:** String (URL)

**Default:** `http://localhost:5678/webhook`

**Examples:**
```bash
# Development (local n8n)
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# Production (SAP BTP)
N8N_WEBHOOK_URL=https://cv-sorting-n8n.cfapps.eu10.hana.ondemand.com/webhook

# Staging
N8N_WEBHOOK_URL=https://cv-sorting-n8n-staging.cfapps.eu10.hana.ondemand.com/webhook
```

**Notes:**
- The base URL should NOT include the specific webhook path (e.g., `/candidate-status-change`)
- Webhook paths are automatically appended by the webhook helper
- Ensure the URL is accessible from your CAP service

---

### Optional Variables

These variables have sensible defaults but can be customized:

#### `ENABLE_WEBHOOKS`

**Description:** Enable or disable webhook notifications globally.

**Type:** Boolean (`true` | `false`)

**Default:** `false`

**When to use:**
- Set to `false` during development when n8n is not running
- Set to `true` in staging/production to enable notifications
- Useful for feature toggling without code changes

**Examples:**
```bash
# Development - disable webhooks
ENABLE_WEBHOOKS=false

# Production - enable webhooks
ENABLE_WEBHOOKS=true
```

**Security Note:** When disabled, status changes are still tracked and logged, but no external HTTP calls are made.

---

#### `WEBHOOK_TIMEOUT_MS`

**Description:** Maximum time to wait for a webhook response before timing out.

**Type:** Integer (milliseconds)

**Default:** `5000` (5 seconds)

**Recommended Range:** 3000-10000ms

**Examples:**
```bash
# Fast timeout for local development
WEBHOOK_TIMEOUT_MS=3000

# Standard timeout for production
WEBHOOK_TIMEOUT_MS=5000

# Generous timeout for slow networks
WEBHOOK_TIMEOUT_MS=10000
```

**Performance Impact:**
- Lower values: Faster failure detection, but may timeout valid slow requests
- Higher values: More tolerant of network delays, but slower failure detection

---

#### `WEBHOOK_RETRIES`

**Description:** Number of retry attempts for failed webhooks.

**Type:** Integer

**Default:** `2`

**Recommended Range:** 1-3

**Retry Logic:**
- Total attempts = 1 (initial) + `WEBHOOK_RETRIES`
- Exponential backoff: 1s, 2s, 4s, 8s...
- Only retries on network errors, not 4xx responses

**Examples:**
```bash
# No retries (fail fast)
WEBHOOK_RETRIES=0

# Standard retries (3 total attempts)
WEBHOOK_RETRIES=2

# Aggressive retries (5 total attempts)
WEBHOOK_RETRIES=4
```

**Best Practice:** Use 2-3 retries for production to handle transient network issues.

---

#### `NOTIFICATION_WINDOW_HOURS`

**Description:** Time window for querying pending notifications.

**Type:** Integer (hours)

**Default:** `24`

**Examples:**
```bash
# Check last 12 hours
NOTIFICATION_WINDOW_HOURS=12

# Check last day (default)
NOTIFICATION_WINDOW_HOURS=24

# Check last week
NOTIFICATION_WINDOW_HOURS=168
```

**Usage:**
- Used by the `getPendingNotifications` action
- Determines how far back to look for candidates requiring notifications
- Larger windows = more candidates returned, but slower queries

---

#### `NOTIFICATION_COOLDOWN_HOURS`

**Description:** Cooldown period to prevent duplicate notifications for the same candidate-job match.

**Type:** Integer (hours)

**Default:** `24`

**Examples:**
```bash
# Short cooldown (4 hours)
NOTIFICATION_COOLDOWN_HOURS=4

# Standard cooldown (1 day)
NOTIFICATION_COOLDOWN_HOURS=24

# Long cooldown (1 week)
NOTIFICATION_COOLDOWN_HOURS=168
```

**Behavior:**
- Prevents sending multiple emails about the same match
- Tracked per candidate-job pair
- Cooldown resets after the specified period

---

#### `ENABLE_STATUS_TRACKING`

**Description:** Enable automatic webhook notifications on candidate status changes.

**Type:** Boolean (`true` | `false`)

**Default:** `true`

**Examples:**
```bash
# Enable status change webhooks
ENABLE_STATUS_TRACKING=true

# Disable status change webhooks
ENABLE_STATUS_TRACKING=false
```

**Impact:**
- When `true`: Status changes trigger webhooks to n8n
- When `false`: Status changes are logged but no webhooks sent
- Independent of `ENABLE_WEBHOOKS` (both must be `true`)

---

#### `ENABLE_AUTO_NOTIFICATIONS`

**Description:** Enable automatic email notifications for high-scoring job matches.

**Type:** Boolean (`true` | `false`)

**Default:** `true`

**Examples:**
```bash
# Enable match notifications
ENABLE_AUTO_NOTIFICATIONS=true

# Disable match notifications
ENABLE_AUTO_NOTIFICATIONS=false
```

**Impact:**
- When `true`: High-scoring matches trigger notifications
- When `false`: Notifications must be triggered manually
- Respects `NOTIFICATION_COOLDOWN_HOURS` when enabled

---

#### `RATE_LIMIT_EMAIL_REQUESTS`

**Description:** Maximum number of email-related API requests per window.

**Type:** Integer

**Default:** `50`

**Examples:**
```bash
# Conservative limit
RATE_LIMIT_EMAIL_REQUESTS=20

# Standard limit (default)
RATE_LIMIT_EMAIL_REQUESTS=50

# Generous limit
RATE_LIMIT_EMAIL_REQUESTS=100
```

**Purpose:**
- Prevents email spam from misconfigured clients
- Separate from general API rate limits
- Applied to notification endpoints

---

#### `RATE_LIMIT_EMAIL_WINDOW_MS`

**Description:** Time window for email rate limiting.

**Type:** Integer (milliseconds)

**Default:** `60000` (1 minute)

**Examples:**
```bash
# Short window (30 seconds)
RATE_LIMIT_EMAIL_WINDOW_MS=30000

# Standard window (1 minute)
RATE_LIMIT_EMAIL_WINDOW_MS=60000

# Long window (5 minutes)
RATE_LIMIT_EMAIL_WINDOW_MS=300000
```

---

## Configuration Examples

### Development Environment

Minimal configuration for local development without n8n:

```bash
# .env (development)
NODE_ENV=development
PORT=4004
LOG_LEVEL=debug

# Email automation - disabled for local dev
ENABLE_WEBHOOKS=false
ENABLE_STATUS_TRACKING=true
ENABLE_AUTO_NOTIFICATIONS=false
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# Quick timeouts for fast feedback
WEBHOOK_TIMEOUT_MS=3000
WEBHOOK_RETRIES=1
NOTIFICATION_WINDOW_HOURS=24
NOTIFICATION_COOLDOWN_HOURS=1
```

**Rationale:**
- Webhooks disabled to avoid errors when n8n isn't running
- Status tracking enabled to test the logging
- Auto-notifications disabled to prevent spam during testing
- Short cooldown for rapid testing

---

### Development with n8n

Configuration for development with local n8n instance:

```bash
# .env (development + n8n)
NODE_ENV=development
PORT=4004
LOG_LEVEL=debug

# Email automation - enabled with local n8n
ENABLE_WEBHOOKS=true
ENABLE_STATUS_TRACKING=true
ENABLE_AUTO_NOTIFICATIONS=true
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# Development-friendly timeouts
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRIES=2
NOTIFICATION_WINDOW_HOURS=24
NOTIFICATION_COOLDOWN_HOURS=4
```

**Rationale:**
- All features enabled for full testing
- Standard timeouts for realistic behavior
- Shorter cooldown (4h) for testing without long waits

---

### Staging Environment

Configuration for staging on SAP BTP:

```bash
# .env (staging)
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Email automation - full production config with verbose logging
ENABLE_WEBHOOKS=true
ENABLE_STATUS_TRACKING=true
ENABLE_AUTO_NOTIFICATIONS=true
N8N_WEBHOOK_URL=https://cv-sorting-n8n-staging.cfapps.eu10.hana.ondemand.com/webhook

# Production-like timeouts
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRIES=2
NOTIFICATION_WINDOW_HOURS=24
NOTIFICATION_COOLDOWN_HOURS=24

# Standard rate limits
RATE_LIMIT_EMAIL_REQUESTS=50
RATE_LIMIT_EMAIL_WINDOW_MS=60000
```

**Rationale:**
- Production configuration for realistic testing
- Standard cooldown to catch timing issues
- Sufficient logging for debugging

---

### Production Environment

Secure, optimized configuration for production:

```bash
# .env (production)
NODE_ENV=production
PORT=8080
LOG_LEVEL=warn

# Email automation - production optimized
ENABLE_WEBHOOKS=true
ENABLE_STATUS_TRACKING=true
ENABLE_AUTO_NOTIFICATIONS=true
N8N_WEBHOOK_URL=https://cv-sorting-n8n.cfapps.eu10.hana.ondemand.com/webhook

# Robust retry configuration
WEBHOOK_TIMEOUT_MS=7000
WEBHOOK_RETRIES=3
NOTIFICATION_WINDOW_HOURS=24
NOTIFICATION_COOLDOWN_HOURS=24

# Conservative rate limits
RATE_LIMIT_EMAIL_REQUESTS=50
RATE_LIMIT_EMAIL_WINDOW_MS=60000
```

**Rationale:**
- Higher timeout (7s) for network resilience
- More retries (3) to handle transient failures
- Conservative rate limits to prevent abuse
- Minimal logging (warn) for performance

---

## Security Considerations

### Webhook URL Security

**Threat:** Unauthorized access to n8n webhooks

**Mitigation:**
1. Use HTTPS in production (required)
2. Configure n8n authentication (basic auth or API key)
3. Restrict n8n network access (VPC, firewall rules)
4. Never expose webhook URLs in client-side code

**Example Secure Configuration:**
```bash
# Production - HTTPS only
N8N_WEBHOOK_URL=https://cv-sorting-n8n.cfapps.eu10.hana.ondemand.com/webhook

# n8n should have N8N_BASIC_AUTH_ACTIVE=true
# or use API key authentication
```

---

### Environment Variable Protection

**Threat:** Exposure of sensitive configuration

**Best Practices:**
1. Never commit `.env` to version control (already in `.gitignore`)
2. Use SAP BTP's User-Provided Services for production secrets
3. Rotate credentials regularly
4. Use different webhook URLs per environment

**Verification:**
```bash
# Ensure .env is ignored
git check-ignore .env
# Should output: .env

# Check for accidental commits
git log --all --full-history -- .env
# Should be empty
```

---

### Rate Limiting

**Threat:** Email spam from malicious or misconfigured clients

**Mitigation:**
- Rate limits are enforced at multiple levels:
  1. General API rate limit (100 req/min)
  2. Email-specific rate limit (50 req/min)
  3. Notification cooldown (prevents duplicate emails)

**Configuration:**
```bash
# Adjust based on expected load
RATE_LIMIT_EMAIL_REQUESTS=50        # Max emails triggered per minute
NOTIFICATION_COOLDOWN_HOURS=24      # Prevents duplicate emails
```

---

### Webhook Payload Security

**Threat:** Sensitive data exposure in webhook payloads

**Built-in Protections:**
- Payloads only include IDs and status codes, not full candidate data
- n8n workflow fetches full details using authenticated CAP API
- Webhook URLs are not logged in error messages

**Example Payload (Safe):**
```json
{
  "eventType": "candidate-status-change",
  "payload": {
    "candidateId": "abc-123",
    "oldStatus": "SCREENING",
    "newStatus": "INTERVIEW"
  },
  "timestamp": "2025-12-17T10:30:00Z",
  "source": "cap-service"
}
```

---

## Troubleshooting

### Issue: Webhooks Not Sending

**Symptoms:**
- Status changes logged but no emails received
- No errors in logs

**Diagnosis:**
```bash
# Check configuration
cat .env | grep ENABLE_WEBHOOKS
cat .env | grep ENABLE_STATUS_TRACKING

# Check logs
cds watch --profile development
# Look for: "Webhook sent successfully" or "Webhook disabled"
```

**Solutions:**
1. Ensure `ENABLE_WEBHOOKS=true`
2. Ensure `ENABLE_STATUS_TRACKING=true` (both must be true)
3. Check n8n is running and accessible
4. Verify `N8N_WEBHOOK_URL` is correct

---

### Issue: Webhook Timeouts

**Symptoms:**
- Errors: "Webhook timeout after 5000ms"
- Emails delayed or not sent

**Diagnosis:**
```bash
# Test webhook manually
curl -X POST http://localhost:5678/webhook/candidate-status-change \
  -H "Content-Type: application/json" \
  -d '{"eventType":"test","payload":{},"timestamp":"2025-12-17T10:00:00Z","source":"manual"}'

# Measure response time
time curl -X POST http://localhost:5678/webhook/candidate-status-change ...
```

**Solutions:**
1. Increase timeout: `WEBHOOK_TIMEOUT_MS=10000`
2. Optimize n8n workflow (remove slow nodes)
3. Check network latency between CAP and n8n
4. Ensure n8n has sufficient resources

---

### Issue: Duplicate Notifications

**Symptoms:**
- Same candidate receives multiple emails for one match
- Email spam

**Diagnosis:**
```bash
# Check cooldown setting
cat .env | grep NOTIFICATION_COOLDOWN_HOURS

# Check notification history
# In CAP service, check notificationHistory array
```

**Solutions:**
1. Increase cooldown: `NOTIFICATION_COOLDOWN_HOURS=48`
2. Verify cooldown logic is working (check logs)
3. Check if multiple CAP instances are running (each has its own history)
4. For multi-instance: Consider Redis-backed notification tracking

---

### Issue: Rate Limit Errors

**Symptoms:**
- HTTP 429 errors
- "Too many requests" in logs

**Diagnosis:**
```bash
# Check current rate limits
cat .env | grep RATE_LIMIT

# Monitor request rate
# Look for patterns in access logs
```

**Solutions:**
1. Increase limits if legitimate traffic:
   ```bash
   RATE_LIMIT_EMAIL_REQUESTS=100
   ```
2. Investigate source of high request volume
3. Implement client-side debouncing
4. Check for retry loops

---

### Issue: n8n Webhooks Not Triggering Workflows

**Symptoms:**
- CAP service logs "Webhook sent successfully"
- n8n doesn't execute workflow

**Diagnosis:**
```bash
# Check n8n logs
docker logs n8n-container

# Verify webhook URL matches n8n workflow
# In n8n: Check webhook node URL
```

**Solutions:**
1. Ensure webhook path matches exactly:
   - CAP sends to: `{N8N_WEBHOOK_URL}/candidate-status-change`
   - n8n webhook path must be: `candidate-status-change`
2. Verify n8n workflow is activated (toggle on)
3. Check n8n webhook authentication matches CAP client
4. Test webhook manually using n8n's test feature

---

### Issue: Missing Environment Variables

**Symptoms:**
- Service uses default values
- Unexpected behavior

**Diagnosis:**
```bash
# Verify .env file exists
ls -la .env

# Check .env is loaded
node -e "require('dotenv').config(); console.log(process.env.N8N_WEBHOOK_URL)"

# Check for typos
diff .env.example .env
```

**Solutions:**
1. Ensure `.env` file exists in project root
2. Copy from template: `cp .env.example .env`
3. Restart CAP service after changes
4. Check for typos in variable names (case-sensitive)

---

## Best Practices

### Development Workflow

1. **Start with webhooks disabled:**
   ```bash
   ENABLE_WEBHOOKS=false
   ```
   - Test core functionality first
   - Enable webhooks once n8n is configured

2. **Use verbose logging:**
   ```bash
   LOG_LEVEL=debug
   ```
   - See webhook payloads
   - Debug retry logic
   - Switch to `info` or `warn` in production

3. **Test with short cooldowns:**
   ```bash
   NOTIFICATION_COOLDOWN_HOURS=1
   ```
   - Faster testing iteration
   - Increase to 24h for production

---

### Staging Best Practices

1. **Mirror production configuration:**
   - Use same timeout values
   - Use same rate limits
   - Test realistic scenarios

2. **Use separate n8n instance:**
   - Prevents test emails to real recipients
   - Isolates test data
   - Allows workflow experimentation

3. **Enable comprehensive logging:**
   ```bash
   LOG_LEVEL=info
   ```
   - Captures enough detail for debugging
   - Not as verbose as `debug`

---

### Production Best Practices

1. **Use environment-specific secrets:**
   - Never reuse staging credentials
   - Rotate periodically
   - Use SAP BTP service bindings

2. **Monitor webhook health:**
   - Track success/failure rates
   - Alert on consecutive failures
   - Monitor response times

3. **Set appropriate timeouts:**
   ```bash
   WEBHOOK_TIMEOUT_MS=7000  # Generous for network variance
   WEBHOOK_RETRIES=3        # Handle transient failures
   ```

4. **Implement graceful degradation:**
   - If webhooks fail, log locally
   - Consider dead letter queue for failed webhooks
   - Have manual notification fallback

5. **Minimize logging:**
   ```bash
   LOG_LEVEL=warn  # Only warnings and errors
   ```
   - Reduces log volume
   - Improves performance
   - Lowers costs

---

### Validation Checklist

Before deploying to production, verify:

- [ ] All required variables are set
- [ ] Webhook URL uses HTTPS
- [ ] n8n authentication is enabled
- [ ] Rate limits are appropriate for expected load
- [ ] Cooldown period prevents spam
- [ ] Timeout values tested under load
- [ ] Retry count balances reliability vs. latency
- [ ] Feature flags match deployment requirements
- [ ] Logging level appropriate for environment
- [ ] `.env` file NOT committed to git
- [ ] Documentation updated with any custom values

---

## Environment Variable Reference Table

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `N8N_WEBHOOK_URL` | String | `http://localhost:5678/webhook` | Yes | Base URL for n8n webhooks |
| `ENABLE_WEBHOOKS` | Boolean | `false` | No | Global webhook enable/disable |
| `WEBHOOK_TIMEOUT_MS` | Integer | `5000` | No | Webhook timeout in milliseconds |
| `WEBHOOK_RETRIES` | Integer | `2` | No | Number of retry attempts |
| `NOTIFICATION_WINDOW_HOURS` | Integer | `24` | No | Time window for pending notifications |
| `NOTIFICATION_COOLDOWN_HOURS` | Integer | `24` | No | Cooldown between duplicate notifications |
| `ENABLE_STATUS_TRACKING` | Boolean | `true` | No | Enable status change webhooks |
| `ENABLE_AUTO_NOTIFICATIONS` | Boolean | `true` | No | Enable automatic match notifications |
| `RATE_LIMIT_EMAIL_REQUESTS` | Integer | `50` | No | Max email requests per window |
| `RATE_LIMIT_EMAIL_WINDOW_MS` | Integer | `60000` | No | Email rate limit window (ms) |

---

## Additional Resources

- [n8n Documentation](https://docs.n8n.io/)
- [n8n Webhook Nodes](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [SAP BTP Environment Variables](https://help.sap.com/docs/btp/sap-business-technology-platform/environment-variables)
- [Webhook Security Best Practices](https://docs.n8n.io/hosting/security/)

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-17 | 1.0.0 | Initial documentation for email automation configuration |

---

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review logs with `LOG_LEVEL=debug`
3. Test webhooks manually using curl
4. Verify n8n workflow configuration
5. Consult team documentation or open an issue
