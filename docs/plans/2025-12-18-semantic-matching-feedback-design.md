# Semantic Matching with Feedback Loop - Design Document

**Date:** 2025-12-18
**Status:** Approved
**Goal:** Improve job-candidate matching quality through embedding-based similarity and recruiter feedback

---

## Overview

Build an embedding-based skill matching system with a feedback loop. When a job is posted, the system finds semantically similar candidates using vector similarity. Recruiters provide thumbs up/down feedback which adjusts future ranking.

**Key Benefits:**
- "React" naturally matches "React.js", "Frontend Development" through semantic similarity
- No manual skill taxonomy maintenance required
- System learns from recruiter decisions over time
- Works immediately with existing embedding infrastructure

---

## Data Model

### New Entities

```cds
entity MatchFeedback {
  key ID           : UUID;
  matchResult      : Association to MatchResults;
  feedbackType     : String enum { positive, negative };
  feedbackBy       : String;  // user ID
  feedbackAt       : Timestamp;
  notes            : String(500);  // optional context
}

entity JobEmbeddings {
  key ID           : UUID;
  jobPosting       : Association to JobPostings;
  embedding        : LargeBinary;  // 384-dim vector
  embeddingModel   : String default 'e5-small';
  generatedAt      : Timestamp;
}
```

### Modifications to Existing Entities

- `MatchResults`: Add `feedbackMultiplier` field (Decimal, default 1.0)
- `Candidates`: Add `embeddingStaleAt` timestamp for regeneration tracking

---

## Matching Algorithm

### Job Embedding Generation

When a job is saved, generate an embedding from concatenated text:

```
"passage: Senior React Developer. Build modern web applications
using React, TypeScript, Node.js. 5+ years experience required."
```

### Candidate Retrieval

Query PostgreSQL pgvector for top N candidates:

```sql
SELECT candidate_id, 1 - (embedding <=> job_embedding) as similarity
FROM candidate_embeddings
ORDER BY embedding <=> job_embedding
LIMIT 50;
```

### Score Calculation

Combine semantic similarity with feedback adjustments:

```
finalScore = semanticScore * feedbackMultiplier
```

- `feedbackMultiplier` starts at 1.0
- Each positive feedback increases it by 0.05 (caps at 1.5)
- Each negative feedback decreases it by 0.1 (floors at 0.5)

---

## User Interface

### Match Results View

Add feedback buttons to each match row:

```
┌─────────────────────────────────────────────────────────────┐
│ John Smith                           Match: 87%            │
│ React, TypeScript, Node.js           ┌───┐ ┌───┐          │
│ 5 years experience                   │ 👍 │ │ 👎 │          │
│                                      └───┘ └───┘          │
└─────────────────────────────────────────────────────────────┘
```

**Interaction behavior:**
- Clicking button saves feedback immediately with visual confirmation
- Toggle behavior: click again to remove feedback
- Click opposite button to switch feedback
- Optional notes on feedback ("Great culture fit", "Overqualified")

### Match Score Breakdown

Show on hover or expansion:

```
87% Match
├── Semantic Similarity: 92%
├── Feedback Adjustment: 0.95x (1 negative from other jobs)
└── Final Score: 87%
```

### Candidate Detail - Feedback History

Display feedback history on candidate profile:
- "👍 for Senior React Developer (Dec 15)"
- "👎 for Junior Frontend Role (Dec 10) - Overqualified"

---

## API & Backend

### New CAP Service Actions

```cds
action generateJobEmbedding(jobId: UUID) returns { success: Boolean; embeddingId: UUID };
action submitMatchFeedback(matchResultId: UUID, feedbackType: String, notes: String) returns { success: Boolean };
action removeMatchFeedback(feedbackId: UUID) returns { success: Boolean };
action refreshMatchScores(jobId: UUID) returns { matchesUpdated: Integer };
```

### Python ML Service Endpoints

```python
# POST /api/embeddings/job
# Input: { jobId, title, description, requiredSkills[] }
# Output: { embedding: float[], stored: true }

# POST /api/match/semantic
# Input: { jobEmbedding: float[], limit: 50 }
# Output: { candidates: [{ id, similarity, skills[] }] }
```

### Automatic Triggers

1. **On Job Create/Update** → Generate job embedding automatically
2. **On Feedback Submit** → Recalculate affected candidate's `feedbackMultiplier`
3. **Nightly Job (optional)** → Refresh all match scores to incorporate accumulated feedback

### Data Flow

```
Job Created → CAP Handler → ML Service (embedding) → PostgreSQL (store)
                                ↓
                         pgvector similarity search
                                ↓
                         MatchResults updated
                                ↓
Recruiter reviews → Feedback submitted → Multiplier recalculated
```

---

## Error Handling & Edge Cases

### Edge Cases

| Case | Solution |
|------|----------|
| New candidate, no embedding | Trigger generation on creation, exclude until ready |
| Job with no required skills | Fall back to title + description, show warning |
| Conflicting feedback | Job-specific multipliers, average across similar job categories |
| Stale embeddings | Track `embeddingStaleAt`, regenerate on profile changes |

### Error Responses

| Scenario | Response |
|----------|----------|
| ML service down | Return cached matches, show "Scores may be outdated" |
| Embedding generation fails | Log error, exclude from matches, retry in background |
| Invalid feedback (duplicate) | Idempotent - update existing feedback |
| pgvector query timeout | Return partial results with warning |

---

## Testing Strategy

### Unit Tests (Python ML Service)

```python
# test_job_embeddings.py
- test_generate_job_embedding_basic()
- test_generate_job_embedding_no_skills()
- test_embedding_dimension_matches_candidate()

# test_semantic_match.py
- test_similar_jobs_return_similar_candidates()
- test_unrelated_job_returns_low_scores()
- test_limit_parameter_respected()
```

### Integration Tests (CAP Service)

```javascript
// test/match-feedback.test.js
- "should save positive feedback"
- "should toggle feedback on second click"
- "should recalculate multiplier after feedback"
- "should handle ML service timeout gracefully"
```

### End-to-End Scenarios

1. **Happy Path:** Create job → matches generated → give feedback → scores adjust
2. **Cold Start:** New candidate uploads CV → embedding generated → appears in matches
3. **Feedback Impact:** Same candidate, 3 thumbs up → verify multiplier increases to 1.15

### Manual Testing Checklist

- [ ] Create job with skills, verify matches appear
- [ ] Click 👍, verify button state changes
- [ ] Click 👍 again, verify feedback removed
- [ ] Check candidate detail shows feedback history
- [ ] Verify score breakdown on hover

---

## Implementation Phases

### Phase 1: Job Embeddings & Basic Matching
- Add JobEmbeddings entity and ML endpoint
- Generate embeddings on job create/update
- Display semantic match scores

### Phase 2: Feedback UI & Storage
- Add MatchFeedback entity
- Implement feedback buttons in UI
- Store feedback with notes

### Phase 3: Learning Integration
- Calculate feedbackMultiplier from accumulated feedback
- Apply multiplier to match scores
- Display score breakdown

### Phase 4: Polish & Edge Cases
- Handle stale embeddings
- Add feedback history to candidate view
- Error handling and graceful degradation
