# API Reference

Quick reference tables for all API endpoints.

---

## CAP Services

### CandidateService (`/api/candidates`)

#### Entities

| Entity | Path | Methods | Description |
|--------|------|---------|-------------|
| Candidates | `/Candidates` | GET, POST, PATCH, DELETE | Candidate profiles |
| CVDocuments | `/CVDocuments` | GET, POST, PATCH, DELETE | CV documents |
| Documents | `/Documents` | GET | Read-only document view |
| WorkExperiences | `/WorkExperiences` | GET, POST, PATCH, DELETE | Employment history |
| Educations | `/Educations` | GET, POST, PATCH, DELETE | Education records |
| CandidateSkills | `/CandidateSkills` | GET, POST, PATCH, DELETE | Candidate skills |
| CandidateLanguages | `/CandidateLanguages` | GET, POST, PATCH, DELETE | Languages |
| Certifications | `/Certifications` | GET, POST, PATCH, DELETE | Certifications |
| CandidateNotes | `/CandidateNotes` | GET, POST, PATCH, DELETE | Recruiter notes |
| Interviews | `/Interviews` | GET, POST, PATCH, DELETE | Interview records |
| CandidateStatuses | `/CandidateStatuses` | GET | Status code list |
| Skills | `/Skills` | GET | Skills value help |
| InterviewTypes | `/InterviewTypes` | GET | Interview types |

#### Bound Actions (Candidates)

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| updateStatus | POST | `/Candidates({ID})/CandidateService.updateStatus` | newStatus, notes, notifyCandidate |
| addSkill | POST | `/Candidates({ID})/CandidateService.addSkill` | skillId, proficiencyLevel, yearsOfExperience |
| markAsDuplicate | POST | `/Candidates({ID})/CandidateService.markAsDuplicate` | primaryCandidateId, mergeStrategy |

#### Bound Actions (Interviews)

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| confirm | POST | `/Interviews({ID})/CandidateService.confirm` | - |
| complete | POST | `/Interviews({ID})/CandidateService.complete` | overallRating, feedback, recommendation |
| cancel | POST | `/Interviews({ID})/CandidateService.cancel` | reason |
| reschedule | POST | `/Interviews({ID})/CandidateService.reschedule` | newDateTime, reason |
| recordNoShow | POST | `/Interviews({ID})/CandidateService.recordNoShow` | - |
| submitFeedback | POST | `/Interviews({ID})/CandidateService.submitFeedback` | ratings, feedback, recommendation, nextSteps |

#### Unbound Actions

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| bulkUpdateStatus | POST | `/bulkUpdateStatus` | candidateIds[], newStatus, notes |
| mergeCandidates | POST | `/mergeCandidates` | primaryId, duplicateIds[], mergeStrategy |
| extractSkillsFromText | POST | `/extractSkillsFromText` | candidateId, sourceText |
| uploadDocument | POST | `/uploadDocument` | fileName, fileContent, mediaType, candidateId |
| processDocument | POST | `/processDocument` | documentId, extractionOptions |
| batchProcessDocuments | POST | `/batchProcessDocuments` | documentIds[] |
| reprocessDocument | POST | `/reprocessDocument` | documentId, extractionMethod, options |
| createCandidateFromDocument | POST | `/createCandidateFromDocument` | documentId, additionalData, autoLinkSkills |

#### Functions

| Function | Method | Path | Parameters |
|----------|--------|------|------------|
| searchCandidates | GET | `/searchCandidates(...)` | query, skills, minExperience, locations, statuses, sortBy |
| findSimilarCandidates | GET | `/findSimilarCandidates(...)` | candidateId, similarityFactors, limit |
| getCandidateTimeline | GET | `/getCandidateTimeline(...)` | candidateId |
| getCandidateStats | GET | `/getCandidateStats(...)` | candidateId |
| getProcessingStatus | GET | `/getProcessingStatus(...)` | documentId |
| getExtractedData | GET | `/getExtractedData(...)` | documentId |
| previewExtraction | GET | `/previewExtraction(...)` | fileContent, mediaType |

---

### JobService (`/api/jobs`)

#### Entities

| Entity | Path | Methods | Description |
|--------|------|---------|-------------|
| JobPostings | `/JobPostings` | GET, POST, PATCH, DELETE | Job listings |
| JobRequiredSkills | `/JobRequiredSkills` | GET, POST, PATCH, DELETE | Required skills |
| MatchResults | `/MatchResults` | GET, PATCH | Match scores |
| SortingConfigurations | `/SortingConfigurations` | GET, POST, PATCH, DELETE | Sort configs |
| SavedFilters | `/SavedFilters` | GET, POST, PATCH, DELETE | Filter presets |
| Skills | `/Skills` | GET, POST, PATCH, DELETE | Skills catalog |
| AuditLogs | `/AuditLogs` | GET | Audit trail |

#### Bound Actions (JobPostings)

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| publish | POST | `/JobPostings({ID})/JobService.publish` | - |
| close | POST | `/JobPostings({ID})/JobService.close` | - |
| reopen | POST | `/JobPostings({ID})/JobService.reopen` | - |
| findMatchingCandidates | POST | `/JobPostings({ID})/JobService.findMatchingCandidates` | minScore, limit |

#### Bound Actions (MatchResults)

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| review | POST | `/MatchResults({ID})/JobService.review` | status, notes |

#### Matching Actions

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| calculateMatch | POST | `/calculateMatch` | candidateId, jobPostingId, includeBreakdown |
| batchMatch | POST | `/batchMatch` | jobPostingId, candidateIds, minScore |
| rankCandidates | POST | `/rankCandidates` | jobPostingId, sortingConfigId, topN |
| sortCandidates | POST | `/sortCandidates` | candidateIds, weights, jobPostingId |
| filterCandidates | POST | `/filterCandidates` | criteria, includeScores |

#### Analytics Functions

| Function | Method | Path | Parameters |
|----------|--------|------|------------|
| getPipelineOverview | GET | `/getPipelineOverview(...)` | fromDate, toDate |
| getInterviewAnalytics | GET | `/getInterviewAnalytics(...)` | fromDate, toDate |
| getUpcomingInterviews | GET | `/getUpcomingInterviews(...)` | days, limit |
| getSkillAnalytics | GET | `/getSkillAnalytics(...)` | topN |
| getRecruiterMetrics | GET | `/getRecruiterMetrics(...)` | recruiterId, fromDate, toDate |
| getTrends | GET | `/getTrends(...)` | metric, period, fromDate, toDate |
| getJobStatistics | GET | `/getJobStatistics(...)` | jobPostingId |
| compareCandidates | GET | `/compareCandidates(...)` | jobPostingId, candidateIds |
| getMatchDistribution | GET | `/getMatchDistribution(...)` | jobPostingId |
| analyzeSkillGaps | GET | `/analyzeSkillGaps(...)` | jobPostingId |
| explainMatch | GET | `/explainMatch(...)` | matchResultId |

#### Notification Actions

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| setThreshold | POST | `/setThreshold` | jobPostingId, minScoreThreshold, minCandidatesCount, notifyEmail |
| deleteThreshold | POST | `/deleteThreshold` | jobPostingId |
| checkAndNotify | POST | `/checkAndNotify` | jobPostingId, matchCount, topCandidates |
| triggerNotification | POST | `/triggerNotification` | jobPostingId, notificationType, customMessage |

#### Admin Actions

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| importSkills | POST | `/importSkills` | skills[] |
| recalculateAllMatches | POST | `/recalculateAllMatches` | jobPostingId |
| cleanupData | POST | `/cleanupData` | olderThanDays, dryRun |
| healthCheck | GET | `/healthCheck()` | - |

---

### AIService (`/api/ai`)

**Requires:** `authenticated-user`

#### Entities

| Entity | Path | Methods | Description |
|--------|------|---------|-------------|
| Conversations | `/Conversations` | GET, POST | Joule sessions |
| Messages | `/Messages` | GET | Chat history |
| Insights | `/Insights` | GET, PATCH | AI insights |

#### Joule AI Actions

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| chat | POST | `/chat` | sessionId, message, context |
| searchWithNaturalLanguage | POST | `/searchWithNaturalLanguage` | query, sessionId |
| applyNaturalLanguageFilter | POST | `/applyNaturalLanguageFilter` | query, currentResultIds, sessionId |
| applyNaturalLanguageSort | POST | `/applyNaturalLanguageSort` | query, candidateIds, jobPostingId |
| generateCandidateSummary | POST | `/generateCandidateSummary` | candidateId, style, forJobId |
| analyzeJobFit | POST | `/analyzeJobFit` | candidateId, jobPostingId |
| generateInterviewQuestions | POST | `/generateInterviewQuestions` | candidateId, jobPostingId, focusAreas, count |
| analyzePool | POST | `/analyzePool` | jobPostingId |
| compareWithInsights | POST | `/compareWithInsights` | candidateIds, jobPostingId |
| getProactiveInsights | POST | `/getProactiveInsights` | candidateId |
| getJobInsights | POST | `/getJobInsights` | jobPostingId |
| detectIssues | POST | `/detectIssues` | entityType, entityId |
| provideFeedback | POST | `/provideFeedback` | messageId, rating, feedbackText, wasHelpful |

#### ML Integration Actions

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| generateCandidateEmbedding | POST | `/generateCandidateEmbedding` | candidateId |
| generateJobEmbedding | POST | `/generateJobEmbedding` | jobPostingId |
| bulkGenerateEmbeddings | POST | `/bulkGenerateEmbeddings` | entityType, entityIds |
| findSemanticMatches | POST | `/findSemanticMatches` | jobPostingId, minScore, limit, includeBreakdown |
| calculateSingleMatch | POST | `/calculateSingleMatch` | candidateId, jobPostingId |
| semanticSearch | POST | `/semanticSearch` | query, limit, minSimilarity |
| processDocumentOCR | POST | `/processDocumentOCR` | documentId, language |

#### Scoring Actions

| Action | Method | Path | Parameters |
|--------|--------|------|------------|
| getScoringCriteria | GET | `/getScoringCriteria(...)` | jobPostingId |
| setScoringCriteria | POST | `/setScoringCriteria` | jobPostingId, criteria[], replaceExisting |
| addCriterion | POST | `/addCriterion` | jobPostingId, criteriaType, criteriaValue, points |
| deleteCriterion | POST | `/deleteCriterion` | jobPostingId, criterionId |
| calculateCriteriaScore | POST | `/calculateCriteriaScore` | jobPostingId, candidateData |
| getCriteriaTemplates | GET | `/getCriteriaTemplates()` | - |
| getMLServiceHealth | GET | `/getMLServiceHealth()` | - |

---

## Python ML Service

Base URL: `http://localhost:8000`

### Health Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info |
| GET | `/health` | Basic health check |
| GET | `/health/ready` | Readiness (all components) |
| GET | `/health/live` | Liveness probe |

### Embeddings (`/api/embeddings`)

| Method | Path | Request Body | Response |
|--------|------|--------------|----------|
| POST | `/generate` | `{entity_type, entity_id, text_content, skills_text?, experience_text?, requirements_text?, store?}` | `{entity_id, embedding_dimension, stored, content_hash}` |
| POST | `/bulk-generate` | `{entity_type, entities[]}` | `{processed, failed, errors[]}` |
| GET | `/candidate/{id}` | - | `{entity_id, model, content_hash, created_at}` |
| DELETE | `/candidate/{id}` | - | `{deleted, candidate_id}` |

### OCR (`/api/ocr`)

| Method | Path | Request Body | Response |
|--------|------|--------------|----------|
| POST | `/process` | `{file_content (base64), file_type, language?, extract_structured?}` | `{text, pages, confidence, method, structured_data?}` |
| POST | `/process-upload` | FormData: file, language, extract_structured | Same as above |
| GET | `/formats` | - | `{formats[], mime_types{}}` |
| GET | `/languages` | - | `{languages[{code, name}]}` |

### Matching (`/api/matching`)

| Method | Path | Request Body | Response |
|--------|------|--------------|----------|
| POST | `/semantic` | `{job_posting_id, min_score?, limit?, include_breakdown?, exclude_disqualified?}` | `{job_posting_id, total_matches, matches[]}` |
| POST | `/single` | `{candidate_id, job_posting_id}` | `{candidate_id, cosine_similarity, criteria_score, combined_score, ...}` |
| POST | `/search` | `{query, limit?, min_similarity?}` | `{query, total_results, results[{candidate_id, similarity}]}` |
| POST | `/store-result` | MatchResult object | `{stored, candidate_id, job_posting_id}` |
| GET | `/results/{job_posting_id}` | Query: limit, min_score | `{job_posting_id, total_results, results[]}` |

### Scoring (`/api/scoring`)

| Method | Path | Request Body | Response |
|--------|------|--------------|----------|
| GET | `/criteria/{job_posting_id}` | - | `{job_posting_id, criteria_count, total_max_points, criteria[]}` |
| POST | `/criteria` | `{job_posting_id, criteria[], replace_existing?}` | `{success, criteria_count}` |
| POST | `/criteria/add` | `{job_posting_id, criteria_type, criteria_value, points, ...}` | `{id, criteria_type, ...}` |
| DELETE | `/criteria/{job_posting_id}/{criterion_id}` | - | `{deleted}` |
| POST | `/calculate` | `{job_posting_id, candidate_data{}}` | `{total_points, max_points, percentage, matched_criteria[], missing_criteria[]}` |
| GET | `/templates` | - | JSON template definitions |

---

## HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH |
| 201 | Created | Successful POST (create) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate or constraint violation |
| 500 | Internal Server Error | Unexpected error |
| 503 | Service Unavailable | ML service down |

---

## OData Query Options

### $filter Examples

```
# By status
/Candidates?$filter=status_code eq 'interviewing'

# By date range
/Candidates?$filter=createdAt ge 2024-01-01 and createdAt le 2024-12-31

# By experience
/Candidates?$filter=totalExperienceYears ge 5

# Combined
/Candidates?$filter=status_code eq 'interviewing' and totalExperienceYears ge 3
```

### $expand Examples

```
# Single expansion
/Candidates?$expand=skills

# Multiple expansions
/Candidates?$expand=skills,experiences,educations

# Nested expansion
/Candidates?$expand=skills($expand=skill)

# With select
/Candidates?$expand=skills($select=proficiencyLevel,yearsOfExperience)
```

### $orderby Examples

```
/Candidates?$orderby=createdAt desc
/Candidates?$orderby=totalExperienceYears desc,lastName asc
/JobPostings?$orderby=publishedAt desc
```

### $select Examples

```
/Candidates?$select=ID,firstName,lastName,email
/JobPostings?$select=title,status,department
```

### Pagination

```
/Candidates?$top=20&$skip=40
/Candidates?$count=true&$top=10
```
