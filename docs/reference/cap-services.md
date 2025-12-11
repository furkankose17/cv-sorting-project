# CAP Services Deep Dive

This document provides detailed documentation of the three CAP services that form the backend of the CV Sorting application.

---

## Service Architecture

```
srv/
├── services.cds              # All service definitions (1046 lines)
├── server.js                 # Bootstrap with health checks
├── handlers/
│   ├── candidate-service.js  # CandidateService implementation
│   ├── matching-service.js   # JobService matching logic
│   └── ocr-service.js        # OCR processing
└── lib/
    ├── logger.js             # Correlation-based logging
    ├── validators.js         # Input validation rules
    ├── errors.js             # Custom error types
    ├── ml-client.js          # ML service integration
    └── file-validator.js     # File upload security
```

---

## CandidateService (`/api/candidates`)

### Purpose
Manages candidate lifecycle: profiles, CVs, documents, skills, interviews.

### Entities

| Entity | Description | Draft-Enabled |
|--------|-------------|---------------|
| `Candidates` | Main candidate profiles | Yes |
| `CVDocuments` | Uploaded CV files + extracted data | No |
| `WorkExperiences` | Employment history | No |
| `Educations` | Education records | No |
| `CandidateSkills` | Skills with proficiency | No |
| `CandidateLanguages` | Language proficiency | No |
| `Certifications` | Professional certifications | No |
| `CandidateNotes` | Recruiter comments | No |
| `Interviews` | Interview scheduling/feedback | No |

### Bound Actions (on Candidates)

#### `updateStatus`
Changes candidate status with validation.

```javascript
// Parameters
{
  newStatus: String,      // Required: new status code
  notes: String,          // Optional: status change notes
  notifyCandidate: Boolean // Optional: send notification
}

// Returns: Updated Candidate
```

**Status Transitions:** Validates against `allowedTransitions` in `CandidateStatuses`.

#### `addSkill`
Links a skill to a candidate.

```javascript
// Parameters
{
  skillId: UUID,           // Required: skill ID
  proficiencyLevel: String, // Optional: beginner|intermediate|advanced|expert
  yearsOfExperience: Decimal // Optional
}

// Returns: CandidateSkills
```

#### `markAsDuplicate`
Marks candidate as duplicate of another.

```javascript
// Parameters
{
  primaryCandidateId: UUID, // Required: the primary candidate
  mergeStrategy: String     // Optional: how to merge data
}

// Returns: Boolean
```

### Bound Actions (on Interviews)

| Action | Parameters | Description |
|--------|------------|-------------|
| `confirm` | none | Confirm scheduled interview |
| `complete` | `overallRating`, `feedback`, `recommendation` | Mark as completed with feedback |
| `cancel` | `reason` | Cancel with reason |
| `reschedule` | `newDateTime`, `reason` | Reschedule to new time |
| `recordNoShow` | none | Mark as no-show |
| `submitFeedback` | ratings, feedback, recommendation, nextSteps | Full feedback submission |

### Unbound Actions

#### `bulkUpdateStatus`
Update status for multiple candidates.

```javascript
// Parameters
{
  candidateIds: [UUID],  // Required
  newStatus: String,     // Required
  notes: String          // Optional
}

// Returns
{
  successCount: Integer,
  failedCount: Integer,
  errors: [{ candidateId: UUID, error: String }]
}
```

#### `mergeCandidates`
Merge duplicate candidates.

```javascript
// Parameters
{
  primaryId: UUID,       // Required: keep this profile
  duplicateIds: [UUID],  // Required: merge these into primary
  mergeStrategy: String  // Optional: how to handle conflicts
}

// Returns
{
  success: Boolean,
  mergedCandidateId: UUID,
  mergedRecordsCount: Integer
}
```

#### `uploadDocument`
Upload a CV document.

```javascript
// Parameters
{
  fileName: String,      // Required
  fileContent: Binary,   // Required
  mediaType: String,     // Required: application/pdf, image/png, etc.
  candidateId: UUID      // Optional: link to existing candidate
}

// Returns
{
  documentId: UUID,
  processingStatus: String,
  message: String
}
```

#### `processDocument`
Trigger OCR processing on uploaded document.

```javascript
// Parameters
{
  documentId: UUID,           // Required
  extractionOptions: String   // Optional: JSON config
}

// Returns
{
  success: Boolean,
  extractedData: String,      // JSON
  confidence: Decimal,
  processingTime: Integer     // milliseconds
}
```

#### `createCandidateFromDocument`
Create a candidate from processed CV.

```javascript
// Parameters
{
  documentId: UUID,       // Required
  additionalData: String, // Optional: JSON with extra fields
  autoLinkSkills: Boolean // Optional: auto-link extracted skills
}

// Returns
{
  candidateId: UUID,
  linkedSkillsCount: Integer,
  linkedLanguagesCount: Integer,
  linkedCertificationsCount: Integer,
  warnings: [String]
}
```

### Functions (Read Operations)

| Function | Parameters | Returns |
|----------|------------|---------|
| `searchCandidates` | query, skills, experience range, locations, statuses, sort, pagination | Candidates[] |
| `findSimilarCandidates` | candidateId, similarityFactors, limit | { candidateId, similarityScore, matchingFactors }[] |
| `getCandidateTimeline` | candidateId | { timestamp, eventType, description, userId, details }[] |
| `getCandidateStats` | candidateId | { applicationsCount, matchesCount, avgMatchScore, topMatchingJobs } |
| `getProcessingStatus` | documentId | { status, progress, currentStep, estimatedTime } |
| `getExtractedData` | documentId | { personalInfo, workExperience, education, skills, certifications, languages, rawText, confidence } |
| `previewExtraction` | fileContent, mediaType | { extractedData, confidence, warnings } |

### Events

| Event | Payload | Triggered When |
|-------|---------|----------------|
| `DocumentUploaded` | documentId, fileName, uploadedBy, timestamp | CV uploaded |
| `DocumentProcessed` | documentId, success, candidateId, confidence, timestamp | OCR completed |
| `ProcessingFailed` | documentId, errorCode, errorMessage, timestamp | OCR failed |

---

## JobService (`/api/jobs`)

### Purpose
Manages job postings, candidate matching, analytics, notifications, and admin operations.

### Entities

| Entity | Description | Draft-Enabled |
|--------|-------------|---------------|
| `JobPostings` | Job listings | Yes |
| `JobRequiredSkills` | Skills required per job | No |
| `MatchResults` | Candidate-job match scores | No |
| `SortingConfigurations` | Custom sorting rules | No |
| `SavedFilters` | Saved filter configurations | No |
| `Skills` | Master skills catalog | No |
| `SkillCategories` | Skill groupings | No |
| `NotificationThresholds` | Match notification rules (in-memory) | No |
| `NotificationHistory` | Notification log (in-memory) | No |
| `AuditLogs` | Change history (read-only) | No |
| `WorkflowInstances` | Automation state (read-only) | No |

### Bound Actions (on JobPostings)

#### `publish`
Publish a draft job posting.

```javascript
// No parameters
// Returns: JobPostings (with status = 'published', publishedAt set)
```

#### `close`
Close an active job posting.

```javascript
// No parameters
// Returns: JobPostings (with status = 'closed')
```

#### `reopen`
Reopen a closed job posting.

```javascript
// No parameters
// Returns: JobPostings (with status = 'published')
```

#### `findMatchingCandidates`
Find candidates matching this job.

```javascript
// Parameters
{
  minScore: Decimal,  // Optional: minimum match score (0-100)
  limit: Integer      // Optional: max results
}

// Returns
{
  matchCount: Integer,
  topMatches: String   // JSON array of top matches
}
```

### Bound Actions (on MatchResults)

#### `review`
Review a match result.

```javascript
// Parameters
{
  status: String,  // Required: approved|rejected|pending
  notes: String    // Optional: review notes
}

// Returns: MatchResults (with reviewStatus, reviewedBy, reviewedAt updated)
```

### Matching Actions

#### `calculateMatch`
Calculate match score between candidate and job.

```javascript
// Parameters
{
  candidateId: UUID,
  jobPostingId: UUID,
  includeBreakdown: Boolean
}

// Returns
{
  overallScore: Decimal,
  skillScore: Decimal,
  experienceScore: Decimal,
  educationScore: Decimal,
  locationScore: Decimal,
  breakdown: String,         // JSON breakdown
  recommendations: [String]
}
```

#### `batchMatch`
Calculate matches for multiple candidates.

```javascript
// Parameters
{
  jobPostingId: UUID,
  candidateIds: [UUID],  // Optional: null = all candidates
  minScore: Decimal      // Optional: filter threshold
}

// Returns
{
  totalProcessed: Integer,
  matchesCreated: Integer,
  avgScore: Decimal,
  processingTime: Integer
}
```

#### `rankCandidates`
Rank candidates for a job based on scoring configuration.

```javascript
// Parameters
{
  jobPostingId: UUID,
  sortingConfigId: UUID,  // Optional: custom sorting config
  topN: Integer           // Optional: limit results
}

// Returns: MatchResults[]
```

### Analytics Functions

| Function | Parameters | Returns |
|----------|------------|---------|
| `getPipelineOverview` | fromDate, toDate | { totalCandidates, byStatus[], bySource[], avgTimeToHire, conversionRates } |
| `getInterviewAnalytics` | fromDate, toDate | { totalScheduled, completed, cancelled, noShow, avgRatings, ratingsByType[] } |
| `getUpcomingInterviews` | days, limit | { interviewId, candidateName, jobTitle, scheduledAt, status }[] |
| `getSkillAnalytics` | topN | { topSkills[], emergingSkills[], skillGaps[] } |
| `getRecruiterMetrics` | recruiterId, fromDate, toDate | { candidatesProcessed, averageTimeInStage, hireRate, qualityScore } |
| `getTrends` | metric, period, fromDate, toDate | { periodStart, value, change }[] |

### Notification Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `setThreshold` | jobPostingId, minScoreThreshold, minCandidatesCount, notifyEmail, isActive | Set notification rules |
| `deleteThreshold` | jobPostingId | Remove notification rules |
| `checkAndNotify` | jobPostingId, matchCount, topCandidates | Check thresholds and send notifications |
| `triggerNotification` | jobPostingId, notificationType, customMessage | Force send notification |

### Admin Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `importSkills` | skills[] (name, category, aliases) | Bulk import skills |
| `recalculateAllMatches` | jobPostingId | Recalculate all match scores |
| `cleanupData` | olderThanDays, dryRun | Archive old data |
| `healthCheck` | none | Check system health |

---

## AIService (`/api/ai`)

### Purpose
AI/ML capabilities: Joule conversational AI, embeddings, OCR, semantic matching.

**Requires:** `authenticated-user`

### Entities

| Entity | Description |
|--------|-------------|
| `Conversations` | Joule AI conversation sessions |
| `Messages` | Conversation messages |
| `Insights` | AI-generated insights |
| `ScoringCriteria` | Job scoring rules (in-memory) |

### Joule Conversational AI Actions

#### `chat`
Send a message to Joule AI.

```javascript
// Parameters
{
  sessionId: String,   // Optional: continue existing session
  message: String,     // User message
  context: String      // Optional: candidate-search|job-matching|analytics
}

// Returns
{
  response: String,
  actions: String,           // JSON: suggested actions
  results: String,           // JSON: query results
  followUpQuestions: [String]
}
```

#### `searchWithNaturalLanguage`
Natural language candidate search.

```javascript
// Parameters
{
  query: String,       // e.g., "senior Java developers in Berlin"
  sessionId: String
}

// Returns
{
  candidates: String,              // JSON array
  totalCount: Integer,
  interpretation: String,          // How the query was interpreted
  refinementSuggestions: [String]
}
```

#### `generateCandidateSummary`
AI-generated candidate summary.

```javascript
// Parameters
{
  candidateId: UUID,
  style: String,      // brief|detailed|executive
  forJobId: UUID      // Optional: contextualize for job
}

// Returns
{
  summary: String,
  keyStrengths: [String],
  potentialConcerns: [String],
  fitAssessment: String
}
```

#### `analyzeJobFit`
Detailed fit analysis.

```javascript
// Parameters
{
  candidateId: UUID,
  jobPostingId: UUID
}

// Returns
{
  fitScore: Decimal,
  analysis: String,
  strengths: String,
  gaps: String,
  recommendations: String
}
```

#### `generateInterviewQuestions`
AI-generated interview questions.

```javascript
// Parameters
{
  candidateId: UUID,
  jobPostingId: UUID,
  focusAreas: [String],  // e.g., ["technical", "leadership"]
  questionCount: Integer
}

// Returns
{
  questions: String,    // JSON array of questions
  rationale: String
}
```

### ML Integration Actions

#### `generateCandidateEmbedding`
Generate vector embedding for candidate.

```javascript
// Parameters
{
  candidateId: UUID
}

// Returns
{
  candidateId: UUID,
  embeddingDimension: Integer,  // 384
  stored: Boolean,
  contentHash: String
}
```

#### `generateJobEmbedding`
Generate vector embedding for job.

```javascript
// Parameters
{
  jobPostingId: UUID
}

// Returns
{
  jobPostingId: UUID,
  embeddingDimension: Integer,
  stored: Boolean,
  contentHash: String
}
```

#### `findSemanticMatches`
Find candidates using semantic similarity.

```javascript
// Parameters
{
  jobPostingId: UUID,
  minScore: Decimal,
  limit: Integer,
  includeBreakdown: Boolean,
  excludeDisqualified: Boolean
}

// Returns
[{
  candidateId: UUID,
  jobPostingId: UUID,
  cosineSimilarity: Decimal,
  criteriaScore: Decimal,
  criteriaMaxScore: Decimal,
  combinedScore: Decimal,
  rank: Integer,
  scoreBreakdown: String,
  matchedCriteria: String,
  missingCriteria: String,
  disqualified: Boolean
}]
```

#### `processDocumentOCR`
Process document through Python ML service.

```javascript
// Parameters
{
  documentId: UUID,
  language: String   // Optional: en|de|tr
}

// Returns
{
  documentId: UUID,
  text: String,
  confidence: Decimal,
  pages: Integer,
  structuredData: String  // JSON
}
```

### Scoring Criteria Actions

#### `setScoringCriteria`
Define scoring rules for a job.

```javascript
// Parameters
{
  jobPostingId: UUID,
  criteria: [{
    criteriaType: String,   // skill|language|certification|experience|education|custom
    criteriaValue: String,  // e.g., skill ID or "JavaScript"
    points: Integer,
    isRequired: Boolean,    // Disqualify if missing
    weight: Decimal,
    minValue: Integer,      // For experience: minimum years
    perUnitPoints: Decimal, // Points per additional unit
    maxPoints: Integer,
    sortOrder: Integer
  }],
  replaceExisting: Boolean
}

// Returns
{
  success: Boolean,
  criteriaCount: Integer
}
```

### Events

| Event | Payload | Triggered When |
|-------|---------|----------------|
| `JouleQueryProcessed` | sessionId, queryType, processingTime, resultCount, timestamp | Joule query completed |
| `InsightGenerated` | entityType, entityId, insightType, confidence, timestamp | New AI insight created |

---

## Handler Implementation Details

### File Locations

| Handler | Path | Lines | Purpose |
|---------|------|-------|---------|
| candidate-service.js | `srv/handlers/candidate-service.js` | ~850 | Candidate operations |
| matching-service.js | `srv/handlers/matching-service.js` | ~700 | Matching algorithms |
| ocr-service.js | `srv/handlers/ocr-service.js` | ~1200 | OCR processing |

### Key Implementation Patterns

**Correlation Logging:**
```javascript
const { Logger } = require('../lib/logger');
const log = new Logger('CandidateService');

// In handler
log.info('Processing candidate', { candidateId, correlationId: req.headers['x-correlation-id'] });
```

**Input Validation:**
```javascript
const { validateEmail, validatePhone, validateUUID } = require('../lib/validators');

// In handler
if (!validateEmail(email)) {
  throw new ValidationError('Invalid email format');
}
```

**ML Service Integration:**
```javascript
const { MLClient } = require('../lib/ml-client');
const mlClient = new MLClient();

// In handler
const embedding = await mlClient.generateEmbedding(candidateText);
const matches = await mlClient.findSemanticMatches(jobId, { minScore: 0.7 });
```

**File Validation:**
```javascript
const { FileValidator } = require('../lib/file-validator');

// In handler
const validator = new FileValidator();
await validator.validate(fileContent, {
  allowedTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  maxSize: 50 * 1024 * 1024, // 50MB
  checkMagicBytes: true
});
```
