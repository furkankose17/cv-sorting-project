# Operations Runbook

**CV Sorting Project - Operations and Troubleshooting Guide**

**Version**: 1.0
**Last Updated**: 2025-12-03
**On-Call Support**: ops@company.com

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Common Operations](#common-operations)
3. [Troubleshooting](#troubleshooting)
4. [Incident Response](#incident-response)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Emergency Contacts](#emergency-contacts)

---

## Quick Reference

### Service URLs

```
Production (EU10): https://cv-sorting-project.cfapps.eu10.hana.ondemand.com
Production (US10): https://cv-sorting-project.cfapps.us10.hana.ondemand.com
Health Check: /health
Metrics: /metrics
API Docs: /swagger-ui
```

### Cloud Foundry Commands

```bash
# Login
cf login -a https://api.cf.eu10.hana.ondemand.com

# Check app status
cf app cv-sorting-srv

# View logs
cf logs cv-sorting-srv --recent

# Restart app
cf restart cv-sorting-srv

# SSH into container
cf ssh cv-sorting-srv
```

### Critical Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Response Time (p95) | >500ms | >1000ms | Scale up |
| Memory Usage | >80% | >90% | Restart/Scale |
| CPU Usage | >75% | >90% | Scale up |
| Error Rate | >1% | >5% | Investigate immediately |
| Disk Usage | >70% | >85% | Clear logs/data |

---

## Common Operations

### 1. Checking Application Health

**Command**:
```bash
curl https://<APP-URL>/health
```

**Expected Response**:
```json
{
  "status": "UP",
  "checks": {
    "database": "UP",
    "cache": "UP",
    "services": "UP"
  },
  "timestamp": "2025-12-03T15:30:00.000Z"
}
```

**Unhealthy Response**:
```json
{
  "status": "DOWN",
  "checks": {
    "database": "DOWN",  // ← Problem
    "cache": "UP",
    "services": "UP"
  }
}
```

**Action**: See [Database Connection Issues](#database-connection-issues)

### 2. Viewing Application Logs

**Real-time logs**:
```bash
cf logs cv-sorting-srv
```

**Recent logs**:
```bash
cf logs cv-sorting-srv --recent
```

**Filter by severity**:
```bash
cf logs cv-sorting-srv | grep ERROR
cf logs cv-sorting-srv | grep WARN
```

**Save logs to file**:
```bash
cf logs cv-sorting-srv --recent > logs.txt
```

### 3. Restarting the Application

**Standard restart** (brief downtime):
```bash
cf restart cv-sorting-srv
```

**Zero-downtime restart** (rolling restart):
```bash
cf restart cv-sorting-srv --strategy rolling
```

**Verify restart**:
```bash
# Check app status
cf app cv-sorting-srv

# Test health endpoint
curl https://<APP-URL>/health
```

### 4. Scaling the Application

**Horizontal scaling** (add instances):
```bash
# Scale to 3 instances
cf scale cv-sorting-srv -i 3

# Verify
cf app cv-sorting-srv
```

**Vertical scaling** (increase memory/disk):
```bash
# Increase memory to 2GB, disk to 1GB
cf scale cv-sorting-srv -m 2G -k 1G

# App will restart automatically
```

**Auto-scaling** (requires app-autoscaler service):
```bash
# Configure autoscaling
cf create-service app-autoscaler standard cv-sorting-autoscaler
cf bind-service cv-sorting-srv cv-sorting-autoscaler

# Configure scaling rules (via manifest or console)
```

### 5. Database Operations

**Check HANA status**:
```bash
cf service cv-sorting-hana
```

**Restart HANA** (via SAP BTP Cockpit):
1. Navigate to HANA Cloud
2. Select instance `cv-sorting-hana`
3. Click **Stop** → Wait → Click **Start**

**Test database connection**:
```bash
cf ssh cv-sorting-srv
node -e "require('@sap/cds').connect.to('db').then(() => console.log('Connected'))"
```

### 6. Checking Service Bindings

**View all bindings**:
```bash
cf env cv-sorting-srv
```

**Rebind service**:
```bash
cf unbind-service cv-sorting-srv cv-sorting-hana
cf bind-service cv-sorting-srv cv-sorting-hana
cf restage cv-sorting-srv
```

---

## Troubleshooting

### High Response Time

**Symptoms**:
- API requests taking >1 second
- Users reporting slowness
- p95 latency above threshold

**Diagnosis**:
```bash
# Check application metrics
curl https://<APP-URL>/metrics

# Check CPU and memory
cf app cv-sorting-srv

# View slow queries (if database-related)
cf ssh cv-sorting-srv
# Connect to HANA and run:
# SELECT * FROM M_EXPENSIVE_STATEMENTS;
```

**Solutions**:

1. **Scale up**:
   ```bash
   cf scale cv-sorting-srv -i 4  # Add more instances
   ```

2. **Optimize queries**:
   - Check for missing indexes
   - Review expensive queries
   - Add database statistics

3. **Enable caching**:
   ```bash
   cf create-service redis-cache small cv-sorting-cache
   cf bind-service cv-sorting-srv cv-sorting-cache
   cf restage cv-sorting-srv
   ```

4. **Clear cache** (if using Redis):
   ```bash
   cf ssh cv-sorting-srv
   redis-cli
   > FLUSHALL
   ```

### High Memory Usage

**Symptoms**:
- Memory usage >90%
- Application crashes with "Out of Memory"
- `cf app` shows high memory percentage

**Diagnosis**:
```bash
# Check memory usage
cf app cv-sorting-srv

# Create heap snapshot
cf ssh cv-sorting-srv
node --expose-gc --max-old-space-size=1024 srv/server.js
```

**Solutions**:

1. **Increase memory**:
   ```bash
   cf scale cv-sorting-srv -m 2G
   ```

2. **Enable garbage collection**:
   ```bash
   cf set-env cv-sorting-srv NODE_OPTIONS "--max-old-space-size=1536 --expose-gc"
   cf restart cv-sorting-srv
   ```

3. **Restart application** (temporary fix):
   ```bash
   cf restart cv-sorting-srv
   ```

4. **Investigate memory leak**:
   - Analyze heap snapshot
   - Check for unclosed connections
   - Review event listeners

### Database Connection Issues

**Symptoms**:
- Health check showing database DOWN
- Errors: "Connection refused" or "Timeout"
- Cannot query database

**Diagnosis**:
```bash
# Check HANA status
cf service cv-sorting-hana

# Check service binding
cf env cv-sorting-srv | grep VCAP_SERVICES
```

**Solutions**:

1. **Restart HANA** (if stopped):
   - Via BTP Cockpit: HANA Cloud → Instance → Start

2. **Rebind service**:
   ```bash
   cf unbind-service cv-sorting-srv cv-sorting-hana
   cf bind-service cv-sorting-srv cv-sorting-hana
   cf restage cv-sorting-srv
   ```

3. **Check firewall/network**:
   ```bash
   cf ssh cv-sorting-srv
   nc -zv <HANA-HOST> 443
   ```

4. **Verify credentials**:
   ```bash
   cf service-key cv-sorting-hana cv-sorting-hana-key
   ```

### Authentication Failures

**Symptoms**:
- HTTP 401 Unauthorized
- "Invalid token" errors
- Users cannot log in

**Diagnosis**:
```bash
# Check XSUAA status
cf service cv-sorting-uaa

# Test token generation
curl -X POST https://<XSUAA-URL>/oauth/token \
  -d "grant_type=client_credentials&client_id=<ID>&client_secret=<SECRET>"
```

**Solutions**:

1. **Rebind XSUAA**:
   ```bash
   cf unbind-service cv-sorting-srv cv-sorting-uaa
   cf bind-service cv-sorting-srv cv-sorting-uaa
   cf restage cv-sorting-srv
   ```

2. **Update redirect URIs**:
   - Edit `xs-security.json`
   - Update XSUAA service:
     ```bash
     cf update-service cv-sorting-uaa -c xs-security.json
     ```

3. **Check role assignments**:
   - BTP Cockpit → Security → Role Collections
   - Verify users have correct roles

### File Upload Failures

**Symptoms**:
- "File too large" errors
- Upload timeout
- File validation failures

**Diagnosis**:
```bash
# Check logs for file validation errors
cf logs cv-sorting-srv --recent | grep "File validation"

# Check rate limiting
cf logs cv-sorting-srv --recent | grep "Rate limit"
```

**Solutions**:

1. **Increase file size limit**:
   ```bash
   cf set-env cv-sorting-srv MAX_FILE_SIZE_MB 100
   cf restart cv-sorting-srv
   ```

2. **Increase timeout**:
   ```bash
   cf set-env cv-sorting-srv REQUEST_TIMEOUT_MS 120000  # 2 minutes
   cf restart cv-sorting-srv
   ```

3. **Check disk space**:
   ```bash
   cf app cv-sorting-srv  # Check disk usage
   cf scale cv-sorting-srv -k 2G  # Increase if needed
   ```

4. **Adjust rate limits**:
   ```bash
   cf set-env cv-sorting-srv MAX_UPLOADS_PER_WINDOW 20
   cf restart cv-sorting-srv
   ```

### OCR Processing Failures

**Symptoms**:
- "OCR extraction failed" errors
- Timeout during CV processing
- Low confidence scores

**Diagnosis**:
```bash
# Check OCR logs
cf logs cv-sorting-srv --recent | grep "OCR"

# Check Tesseract worker status
cf ssh cv-sorting-srv
ps aux | grep tesseract
```

**Solutions**:

1. **Increase OCR timeout**:
   ```bash
   cf set-env cv-sorting-srv OCR_TIMEOUT_MS 60000
   cf restart cv-sorting-srv
   ```

2. **Restart application** (reset Tesseract workers):
   ```bash
   cf restart cv-sorting-srv
   ```

3. **Check file quality**:
   - Verify image resolution (min 300 DPI)
   - Check image clarity
   - Ensure text is horizontal

4. **Fallback to manual entry**:
   - Use `previewExtraction` endpoint
   - Manually correct extracted data

### Rate Limiting Issues

**Symptoms**:
- HTTP 429 Too Many Requests
- Users blocked from API
- "Rate limit exceeded" errors

**Diagnosis**:
```bash
# Check rate limit stats
curl https://<APP-URL>/admin/rate-limit-stats \
  -H "Authorization: Bearer <ADMIN-TOKEN>"

# Check logs
cf logs cv-sorting-srv --recent | grep "429"
```

**Solutions**:

1. **Reset rate limit for specific user**:
   ```bash
   curl -X POST https://<APP-URL>/admin/reset-rate-limit \
     -H "Authorization: Bearer <ADMIN-TOKEN>" \
     -d '{"identifier": "user:user123"}'
   ```

2. **Increase rate limits** (temporary):
   ```bash
   cf set-env cv-sorting-srv RATE_LIMIT_MAX_REQUESTS 200
   cf set-env cv-sorting-srv MAX_UPLOADS_PER_WINDOW 20
   cf restart cv-sorting-srv
   ```

3. **Implement Redis-based rate limiting** (distributed):
   ```bash
   cf create-service redis-cache small cv-sorting-cache
   cf bind-service cv-sorting-srv cv-sorting-cache
   cf restage cv-sorting-srv
   ```

### Application Crashes

**Symptoms**:
- App status shows "crashed"
- Repeated restarts
- Error logs showing uncaught exceptions

**Diagnosis**:
```bash
# Check crash logs
cf logs cv-sorting-srv --recent | grep "CRASHED"

# Check events
cf events cv-sorting-srv
```

**Solutions**:

1. **View stack trace**:
   ```bash
   cf logs cv-sorting-srv --recent
   ```

2. **Increase memory** (if OOM):
   ```bash
   cf scale cv-sorting-srv -m 2G
   ```

3. **Rollback to previous version**:
   ```bash
   cf undeploy cv-sorting-project
   cf deploy mta_archives/cv-sorting-project_<PREVIOUS_VERSION>.mtar
   ```

4. **Enable debugging**:
   ```bash
   cf set-env cv-sorting-srv LOG_LEVEL debug
   cf restart cv-sorting-srv
   ```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **P1 - Critical** | System down, data loss | Immediate | After 15 min |
| **P2 - High** | Major feature unavailable | 30 minutes | After 1 hour |
| **P3 - Medium** | Performance degradation | 2 hours | After 4 hours |
| **P4 - Low** | Minor issues | Next business day | - |

### P1 - Critical Incident Procedure

**Immediate Actions** (within 5 minutes):

1. **Alert team**:
   ```
   Post in #incidents Slack channel:
   "P1 INCIDENT: CV Sorting app down. Investigating."
   ```

2. **Check application status**:
   ```bash
   cf app cv-sorting-srv
   curl https://<APP-URL>/health
   ```

3. **Check HANA status**:
   ```bash
   cf service cv-sorting-hana
   ```

4. **Review recent changes**:
   ```bash
   cf events cv-sorting-srv
   git log --oneline -10
   ```

**Investigation** (within 15 minutes):

5. **Analyze logs**:
   ```bash
   cf logs cv-sorting-srv --recent > incident-logs.txt
   grep -i error incident-logs.txt
   ```

6. **Check resource usage**:
   ```bash
   cf app cv-sorting-srv
   ```

7. **Test endpoints**:
   ```bash
   curl -v https://<APP-URL>/candidate/Candidates
   ```

**Resolution** (within 30 minutes):

8. **Quick fixes**:
   - Restart: `cf restart cv-sorting-srv`
   - Scale up: `cf scale cv-sorting-srv -i 4 -m 2G`
   - Rollback: `cf deploy mta_archives/<PREVIOUS_VERSION>.mtar`

9. **Verify resolution**:
   ```bash
   curl https://<APP-URL>/health
   # Test key workflows
   ```

10. **Update status**:
    ```
    "RESOLVED: CV Sorting app restored. Root cause: <XYZ>. Post-mortem scheduled."
    ```

### P2 - High Incident Procedure

**Example: File Upload Service Down**

1. **Diagnose**:
   ```bash
   cf logs cv-sorting-srv --recent | grep "upload"
   ```

2. **Temporary workaround**:
   - Disable rate limiting temporarily
   - Increase upload timeout
   - Scale up instances

3. **Fix**:
   - Apply hotfix
   - Deploy patch

4. **Monitor**:
   - Watch metrics for 30 minutes
   - Verify user reports

---

## Maintenance Procedures

### Daily Checks

```bash
#!/bin/bash
# daily-check.sh

# Check app health
cf app cv-sorting-srv | grep "running"

# Check HANA
cf service cv-sorting-hana | grep "create succeeded"

# Check error rate
cf logs cv-sorting-srv --recent | grep -c ERROR

# Check memory usage
cf app cv-sorting-srv | grep memory

echo "Daily check complete"
```

### Weekly Maintenance

**Sunday 2:00 AM UTC** (Low traffic):

1. **Update database statistics**:
   ```sql
   UPDATE STATISTICS FOR CV_SORTING_CANDIDATES WITH FULLSCAN;
   UPDATE STATISTICS FOR CV_SORTING_DOCUMENTS WITH FULLSCAN;
   UPDATE STATISTICS FOR CV_SORTING_MATCHRESULTS WITH FULLSCAN;
   ```

2. **Clear old logs**:
   ```bash
   cf ssh cv-sorting-srv
   find /tmp -name "*.log" -mtime +7 -delete
   ```

3. **Review metrics**:
   - Check response times (p50, p95, p99)
   - Check error rates
   - Check resource usage trends

4. **Backup verification**:
   ```bash
   # Verify HANA backups
   # Via BTP Cockpit: HANA Cloud → Backups
   ```

### Monthly Maintenance

1. **Rotate credentials**:
   ```bash
   # Generate new service key
   cf create-service-key cv-sorting-uaa cv-sorting-uaa-key-new

   # Update application to use new key
   cf set-env cv-sorting-srv XSUAA_KEY <NEW_KEY>
   cf restart cv-sorting-srv

   # Delete old key
   cf delete-service-key cv-sorting-uaa cv-sorting-uaa-key-old
   ```

2. **Update dependencies**:
   ```bash
   npm audit
   npm update
   npm test
   cf push
   ```

3. **Capacity planning**:
   - Review usage trends
   - Forecast resource needs
   - Plan scaling

4. **Security audit**:
   - Review access logs
   - Check for anomalies
   - Update security policies

---

## Emergency Contacts

### On-Call Schedule

| Role | Primary | Secondary | Phone |
|------|---------|-----------|-------|
| **Platform Engineer** | Alice Smith | Bob Johnson | +1-555-0100 |
| **Database Admin** | Carol White | David Brown | +1-555-0101 |
| **Security Lead** | Eve Davis | Frank Miller | +1-555-0102 |
| **Product Manager** | Grace Lee | Henry Wilson | +1-555-0103 |

### Escalation Path

1. **On-call engineer** (0-15 min)
2. **Team lead** (15-30 min)
3. **Director of Engineering** (30-60 min)
4. **VP Engineering** (1+ hour)

### External Contacts

- **SAP Support**: +1-800-SAP-HELP
- **Cloud Provider**: support@sap.com
- **Security Incident**: security@company.com

---

## Useful Commands Cheat Sheet

```bash
# Application Management
cf apps                                 # List all apps
cf app cv-sorting-srv                   # App details
cf restart cv-sorting-srv               # Restart app
cf restage cv-sorting-srv               # Restage app
cf scale cv-sorting-srv -i 3           # Scale instances
cf scale cv-sorting-srv -m 2G -k 1G    # Scale memory/disk

# Logs
cf logs cv-sorting-srv                  # Stream logs
cf logs cv-sorting-srv --recent         # Recent logs
cf logs cv-sorting-srv | grep ERROR     # Filter errors

# Services
cf services                             # List services
cf service cv-sorting-hana              # Service details
cf bind-service cv-sorting-srv <SVC>    # Bind service
cf unbind-service cv-sorting-srv <SVC>  # Unbind service

# Environment
cf env cv-sorting-srv                   # View environment
cf set-env cv-sorting-srv KEY VALUE     # Set variable
cf unset-env cv-sorting-srv KEY         # Unset variable

# SSH
cf ssh cv-sorting-srv                   # SSH into container
cf ssh cv-sorting-srv -c "command"      # Run command

# Debugging
cf events cv-sorting-srv                # Recent events
cf app cv-sorting-srv --guid            # Get GUID
```

---

## References

- [Cloud Foundry CLI Reference](https://cli.cloudfoundry.org/en-US/v8/)
- [SAP HANA Cloud Operations](https://help.sap.com/docs/hana-cloud-database)
- [Incident Response Playbook](internal-wiki/incident-response)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-03
**On-Call Contact**: +1-555-0199
