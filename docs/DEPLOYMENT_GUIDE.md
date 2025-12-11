# SAP BTP Deployment Guide

**CV Sorting Project - Production Deployment**

**Version**: 1.0
**Last Updated**: 2025-12-03
**Target Platform**: SAP Business Technology Platform (Cloud Foundry)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Configuration](#database-configuration)
4. [Security Configuration](#security-configuration)
5. [Build and Deploy](#build-and-deploy)
6. [Post-Deployment](#post-deployment)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Accounts & Subscriptions

- ✅ SAP BTP Global Account with Cloud Foundry enabled
- ✅ SAP HANA Cloud subscription
- ✅ Cloud Foundry organization and space
- ✅ Sufficient entitlements:
  - Application Runtime: 2-4 GB
  - SAP HANA Cloud: Standard or Enterprise
  - Authorization and Trust Management (XSUAA)

### Required Tools

```bash
# Cloud Foundry CLI
cf --version  # v8+

# Cloud MTA Build Tool
mbt --version  # 1.2+

# Node.js
node --version  # v18 or v20 (required)

# SAP Cloud SDK
cds --version  # 7+

# Git
git --version
```

### Install Required Tools

```bash
# Cloud Foundry CLI
# Download from: https://github.com/cloudfoundry/cli/releases

# MBT (Multi-Target Application Build Tool)
npm install -g mbt

# SAP CDS Development Kit
npm install -g @sap/cds-dk

# cf plugins
cf install-plugin multiapps
```

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/furkankose17/cv-sorting-project.git
cd cv-sorting-project
```

### 2. Configure Environment Variables

Create `.env` file for local testing:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Production Configuration
NODE_ENV=production

# File Upload
MAX_FILE_SIZE_MB=50

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
MAX_UPLOADS_PER_WINDOW=10

# OCR Configuration
OCR_LANGUAGE=eng
OCR_TIMEOUT_MS=30000
ENABLE_OCR=true

# AI Features
ENABLE_AI_FEATURES=true

# Logging
LOG_LEVEL=info
```

### 3. Update OAuth Redirect URIs

Edit [xs-security.json](xs-security.json):

```json
{
  "redirect-uris": [
    "https://<YOUR-APP-NAME>.cfapps.<REGION>.hana.ondemand.com/**"
  ]
}
```

Replace:
- `<YOUR-APP-NAME>`: Your application route name
- `<REGION>`: Your CF region (e.g., `eu10`, `us10`)

---

## Database Configuration

### 1. Create HANA Cloud Instance

**Option A: SAP BTP Cockpit**

1. Navigate to your SAP BTP subaccount
2. Go to **SAP HANA Cloud** → **Create** → **SAP HANA Database**
3. Configuration:
   - **Instance Name**: `cv-sorting-hana`
   - **Memory**: 30 GB (minimum for production)
   - **Storage**: 120 GB
   - **Compute**: 2 vCPUs
4. Wait for provisioning (10-15 minutes)

**Option B: Cloud Foundry CLI**

```bash
# Login to Cloud Foundry
cf login -a https://api.cf.<REGION>.hana.ondemand.com

# Target your org and space
cf target -o <ORG> -s <SPACE>

# Create HANA Cloud instance
cf create-service hana-cloud hana cv-sorting-hana -c '{
  "data": {
    "memory": 30,
    "edition": "cloud",
    "systempassword": "<SECURE-PASSWORD>",
    "additionalWorkers": 0,
    "enabledservices": {
      "scriptserver": false
    }
  }
}'

# Check status
cf service cv-sorting-hana
```

### 2. Deploy Database Schema

```bash
# Build CDS model
cds build --production

# Deploy to HANA
cds deploy --to hana:cv-sorting-hana --store-credentials
```

Verify deployment:

```bash
# Connect to HANA
cf ssh cv-sorting-srv

# Check tables
hdbsql -n <HANA-HOST>:443 -u <USER> -p <PASSWORD> \
  "SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = 'CV_SORTING'"
```

Expected tables:
```
CV_SORTING_CANDIDATES
CV_SORTING_DOCUMENTS
CV_SORTING_SKILLS
CV_SORTING_CANDIDATESKILLS
CV_SORTING_JOBPOSTINGS
CV_SORTING_MATCHRESULTS
...
```

---

## Security Configuration

### 1. Configure XSUAA (OAuth 2.0)

Create XSUAA service instance:

```bash
# Create XSUAA service
cf create-service xsuaa application cv-sorting-uaa -c xs-security.json

# Verify creation
cf service cv-sorting-uaa
```

### 2. Create Service Keys (for testing)

```bash
# Create service key
cf create-service-key cv-sorting-uaa cv-sorting-uaa-key

# View credentials
cf service-key cv-sorting-uaa cv-sorting-uaa-key
```

Output contains:
- `clientid`
- `clientsecret`
- `url` (OAuth endpoint)
- `xsappname`

### 3. Role Collections

Create role collections in SAP BTP Cockpit:

1. Navigate to **Security** → **Role Collections**
2. Create the following role collections:

| Role Collection | Roles | Users |
|----------------|-------|-------|
| **CVAdmin** | CVAdmin | System administrators |
| **Recruiter** | Recruiter | Recruiters, hiring managers |
| **HRManager** | HRManager | HR managers |
| **Viewer** | Viewer | Read-only users |

3. Assign users to role collections

---

## Build and Deploy

### 1. Build Multi-Target Application (MTA)

```bash
# Install dependencies
npm install

# Build MTA archive
mbt build

# Output: mta_archives/cv-sorting-project_1.0.0.mtar
```

### 2. Deploy to Cloud Foundry

```bash
# Login to Cloud Foundry
cf login -a https://api.cf.<REGION>.hana.ondemand.com

# Deploy MTA
cf deploy mta_archives/cv-sorting-project_1.0.0.mtar

# Monitor deployment
cf logs cv-sorting-srv --recent
```

### 3. Bind Services

Verify service bindings:

```bash
# Check app environment
cf env cv-sorting-srv

# Should show bindings to:
# - cv-sorting-hana (HANA Cloud)
# - cv-sorting-uaa (XSUAA)
```

### 4. Start Application

```bash
# Check app status
cf apps

# Restart if needed
cf restart cv-sorting-srv

# Scale if needed
cf scale cv-sorting-srv -i 2 -m 1G -k 512M
```

---

## Post-Deployment

### 1. Verify Deployment

**Health Check**:

```bash
# Check application route
cf app cv-sorting-srv

# Test health endpoint
curl https://<YOUR-APP-ROUTE>/health

# Expected: HTTP 200
```

**Database Connection**:

```bash
# SSH into app container
cf ssh cv-sorting-srv

# Test database connection
node -e "const cds = require('@sap/cds'); cds.connect.to('db').then(() => console.log('Connected'))"
```

**Authentication**:

```bash
# Get OAuth token
curl -X POST https://<XSUAA-URL>/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<CLIENT-ID>&client_secret=<CLIENT-SECRET>"

# Use token in API request
curl https://<YOUR-APP-ROUTE>/candidate/Candidates \
  -H "Authorization: Bearer <TOKEN>"
```

### 2. Initialize Sample Data (Optional)

```bash
# SSH into app
cf ssh cv-sorting-srv

# Load sample data
node srv/scripts/load-sample-data.js
```

### 3. Configure Monitoring

**Application Logging**:

```bash
# View logs
cf logs cv-sorting-srv

# Tail logs
cf logs cv-sorting-srv --recent

# Filter logs
cf logs cv-sorting-srv | grep ERROR
```

**Enable SAP Cloud Logging** (optional):

```bash
# Create cloud-logging service
cf create-service application-logs standard cv-sorting-logs

# Bind to app
cf bind-service cv-sorting-srv cv-sorting-logs

# Restage
cf restage cv-sorting-srv
```

### 4. Set Up Destinations (for AI Services)

In SAP BTP Cockpit:

1. Go to **Connectivity** → **Destinations**
2. Create **sap-ai-core-destination**:

```
Name: sap-ai-core-destination
Type: HTTP
URL: https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com
Proxy Type: Internet
Authentication: OAuth2ClientCredentials
Client ID: <AI-CORE-CLIENT-ID>
Client Secret: <AI-CORE-CLIENT-SECRET>
Token Service URL: <AI-CORE-TOKEN-URL>
```

3. Test connection

---

## Configuration Management

### Environment-Specific Configuration

**manifest.yml** (Cloud Foundry):

```yaml
applications:
  - name: cv-sorting-srv
    path: gen/srv
    memory: 1024M
    disk: 512M
    instances: 2
    buildpacks:
      - nodejs_buildpack
    env:
      NODE_ENV: production
      MAX_FILE_SIZE_MB: 50
      RATE_LIMIT_MAX_REQUESTS: 100
    services:
      - cv-sorting-hana
      - cv-sorting-uaa
    routes:
      - route: cv-sorting-project.cfapps.eu10.hana.ondemand.com
```

### Secrets Management

**Do NOT commit secrets**. Use:

1. **CF Environment Variables**:
```bash
cf set-env cv-sorting-srv SECRET_KEY "value"
cf restage cv-sorting-srv
```

2. **SAP Credential Store** (recommended):
```bash
# Create credential store instance
cf create-service credstore standard cv-sorting-creds

# Bind to app
cf bind-service cv-sorting-srv cv-sorting-creds
```

---

## Scaling and Performance

### Horizontal Scaling

```bash
# Scale to 3 instances
cf scale cv-sorting-srv -i 3

# Auto-scaling (requires app-autoscaler service)
cf create-service app-autoscaler standard cv-sorting-autoscaler
cf bind-service cv-sorting-srv cv-sorting-autoscaler
```

### Vertical Scaling

```bash
# Increase memory and disk
cf scale cv-sorting-srv -m 2G -k 1G
```

### Database Scaling

In SAP BTP Cockpit:
1. Navigate to HANA Cloud instance
2. Click **Manage** → **Edit**
3. Adjust:
   - Memory (30GB → 60GB)
   - Storage (120GB → 240GB)
   - Compute (2 vCPU → 4 vCPU)

---

## Troubleshooting

### Application Won't Start

**Check logs**:
```bash
cf logs cv-sorting-srv --recent
```

**Common issues**:

1. **Memory errors**:
   ```bash
   cf scale cv-sorting-srv -m 2G
   ```

2. **Service binding issues**:
   ```bash
   cf env cv-sorting-srv
   cf bind-service cv-sorting-srv cv-sorting-hana
   cf restage cv-sorting-srv
   ```

3. **Port conflicts**:
   ```yaml
   # In manifest.yml, ensure PORT is not hardcoded
   env:
     PORT: ${PORT}  # Use CF-assigned port
   ```

### Database Connection Errors

```bash
# Check HANA status
cf service cv-sorting-hana

# Restart HANA (if stopped)
# Via BTP Cockpit: HANA Cloud → Instance → Start

# Test connection
cf ssh cv-sorting-srv
hdbsql -n <HOST>:443 -u <USER> -p <PASSWORD>
```

### Authentication Failures

```bash
# Verify XSUAA binding
cf env cv-sorting-srv | grep VCAP_SERVICES

# Recreate service binding
cf unbind-service cv-sorting-srv cv-sorting-uaa
cf bind-service cv-sorting-srv cv-sorting-uaa
cf restage cv-sorting-srv
```

### High Memory Usage

```bash
# Check memory usage
cf app cv-sorting-srv

# Analyze heap
cf ssh cv-sorting-srv
node --expose-gc --max-old-space-size=1024 srv/server.js

# Enable heap snapshots
cf set-env cv-sorting-srv NODE_OPTIONS "--max-old-space-size=1024"
```

---

## Rollback Procedures

### Rollback Deployment

```bash
# List deployed MTAs
cf mtas

# Undeploy current version
cf undeploy cv-sorting-project

# Deploy previous version
cf deploy mta_archives/cv-sorting-project_0.9.0.mtar
```

### Rollback Database Schema

```bash
# Connect to HANA
cf ssh cv-sorting-srv

# Restore from backup (if available)
hdbsql -n <HOST>:443 -u SYSTEM -p <PASSWORD> \
  "RESTORE DATA FOR CV_SORTING USING FILE ('<BACKUP-PATH>') CLEAR LOG"
```

### Blue-Green Deployment (Zero Downtime)

```bash
# Deploy new version with different route
cf push cv-sorting-srv-green -f manifest-green.yml

# Test green version
curl https://cv-sorting-green.cfapps.eu10.hana.ondemand.com/health

# Switch traffic
cf map-route cv-sorting-srv-green cfapps.eu10.hana.ondemand.com --hostname cv-sorting-project
cf unmap-route cv-sorting-srv cfapps.eu10.hana.ondemand.com --hostname cv-sorting-project

# Delete old version
cf delete cv-sorting-srv
cf rename cv-sorting-srv-green cv-sorting-srv
```

---

## Performance Optimization

### Application Performance

1. **Enable Compression**:
```javascript
// In srv/server.js
const compression = require('compression');
app.use(compression());
```

2. **Connection Pooling**:
```json
// In package.json cds.hana
{
  "pool": {
    "min": 2,
    "max": 20,
    "acquireTimeoutMillis": 30000
  }
}
```

3. **Caching**:
```bash
# Use Redis for caching
cf create-service redis-cache small cv-sorting-cache
cf bind-service cv-sorting-srv cv-sorting-cache
```

### Database Performance

1. **Create Indexes**:
```sql
CREATE INDEX idx_candidate_email ON CV_SORTING_CANDIDATES(EMAIL);
CREATE INDEX idx_candidate_status ON CV_SORTING_CANDIDATES(STATUS_CODE);
CREATE INDEX idx_match_score ON CV_SORTING_MATCHRESULTS(OVERALLSCORE DESC);
```

2. **Table Partitioning** (for large datasets):
```sql
ALTER TABLE CV_SORTING_DOCUMENTS
PARTITION BY HASH (ID) PARTITIONS 4;
```

3. **Statistics Update**:
```sql
UPDATE STATISTICS FOR CV_SORTING_CANDIDATES;
UPDATE STATISTICS FOR CV_SORTING_MATCHRESULTS;
```

---

## Security Checklist

- [ ] Updated OAuth redirect URIs in xs-security.json
- [ ] Removed default/hardcoded passwords
- [ ] Enabled HTTPS only (no HTTP)
- [ ] Configured rate limiting
- [ ] Enabled file upload validation
- [ ] Set up role-based access control
- [ ] Configured audit logging
- [ ] Enabled data-at-rest encryption (HANA)
- [ ] Set up regular backups
- [ ] Configured security headers (HSTS, CSP)
- [ ] Reviewed and minimized IAM permissions
- [ ] Set up intrusion detection (SAP Cloud Logging)

---

## Backup and Disaster Recovery

### HANA Backup

```bash
# Create backup
hdbsql -n <HOST>:443 -u SYSTEM -p <PASSWORD> \
  "BACKUP DATA FOR CV_SORTING USING FILE ('/backups/cv-sorting-$(date +%Y%m%d)')"

# Scheduled backups (via BTP Cockpit)
# HANA Cloud → Instance → Backups → Schedule
```

### Application Backup

```bash
# Export configuration
cf env cv-sorting-srv > env-backup.json

# Backup service keys
cf service-keys cv-sorting-uaa > service-keys-backup.json

# Backup routes
cf routes > routes-backup.txt
```

### Restore Procedures

1. **Restore HANA**:
```sql
RECOVER DATA FOR CV_SORTING UNTIL TIMESTAMP '<TIMESTAMP>'
  USING BACKUP_ID <BACKUP-ID> CLEAR LOG
```

2. **Restore Application**:
```bash
cf push cv-sorting-srv -f manifest.yml
cf bind-service cv-sorting-srv cv-sorting-hana
cf bind-service cv-sorting-srv cv-sorting-uaa
cf restage cv-sorting-srv
```

---

## Monitoring and Alerting

### Application Metrics

```bash
# CF metrics
cf app cv-sorting-srv --guid
cf curl /v3/apps/<APP-GUID>/stats

# Custom metrics (via SAP Cloud Logging)
cf marketplace -s application-logs
```

### Set Up Alerts

**Example: High Memory Alert**

```yaml
# alert-config.yml
alerts:
  - name: high-memory
    condition: memory_usage > 80%
    action: email
    recipients:
      - ops@company.com
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy to SAP BTP

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build MTA
        run: mbt build

      - name: Deploy to Cloud Foundry
        env:
          CF_API: ${{ secrets.CF_API }}
          CF_ORG: ${{ secrets.CF_ORG }}
          CF_SPACE: ${{ secrets.CF_SPACE }}
          CF_USERNAME: ${{ secrets.CF_USERNAME }}
          CF_PASSWORD: ${{ secrets.CF_PASSWORD }}
        run: |
          cf login -a $CF_API -u $CF_USERNAME -p $CF_PASSWORD -o $CF_ORG -s $CF_SPACE
          cf deploy mta_archives/*.mtar
```

---

## Support and Maintenance

### Regular Maintenance Tasks

**Weekly**:
- [ ] Review application logs
- [ ] Check error rates
- [ ] Monitor response times
- [ ] Review security alerts

**Monthly**:
- [ ] Database statistics update
- [ ] Review and rotate credentials
- [ ] Update dependencies
- [ ] Capacity planning review

**Quarterly**:
- [ ] Security audit
- [ ] Disaster recovery drill
- [ ] Performance tuning
- [ ] Cost optimization review

---

## References

- [SAP BTP Cloud Foundry Documentation](https://help.sap.com/docs/btp/sap-business-technology-platform/cloud-foundry-environment)
- [SAP HANA Cloud](https://help.sap.com/docs/hana-cloud)
- [SAP CAP Documentation](https://cap.cloud.sap/docs/)
- [Cloud Foundry CLI](https://docs.cloudfoundry.org/cf-cli/)
- [MTA Documentation](https://help.sap.com/docs/btp/sap-business-technology-platform/multitarget-applications)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-03
**Status**: ✅ Production Ready
