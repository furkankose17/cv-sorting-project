# AI Assistant Phase 1 MVP Design

**Date:** 2025-12-23
**Status:** Approved
**Scope:** 3 new AI-powered features for the CV Management AI Assistant

## Overview

Enhance the existing AI Search Assistant with intelligent features that help recruiters work faster and make better decisions. Phase 1 focuses on features that work without external LLM integration.

### Goals
- Help recruiters understand match scores (transparency)
- Enable quick candidate comparisons (decision support)
- Surface daily priorities automatically (productivity)

### Constraints
- No external LLM integration available yet
- Must work with existing data (Candidates, Skills, MatchResults, Jobs)
- Features should be template-based, not generative

---

## Feature 1: Explainable Match Scores

### User Experience

**Trigger phrases:**
- "Why did John score 92%?"
- "Explain John's match for Full-Stack Developer"
- "Why this score?"
- "How did X score Y for Z?"

**Response format:**
```
John scored 92% for Senior Full-Stack Developer because:

Skills Match (35/40 pts)
  JavaScript: Expert (8 yrs) - exceeds requirement
  React: Expert (6 yrs) - meets requirement
  Node.js: Expert (7 yrs) - exceeds requirement
  Missing: Kubernetes (required)

Experience (30/30 pts)
  8 years total - exceeds 5 year requirement
  Previous Senior Developer role at TechCorp

Location (15/15 pts)
  Remote-compatible, matches job location

Education (12/15 pts)
  BS Computer Science - meets requirement
  No Master's (preferred, not required)
```

### Technical Implementation

**1. Extend `_calculateMatchScore()` method:**

Current signature:
```javascript
_calculateMatchScore(candidate, job, candidateSkills, requiredSkills)
// Returns: { overallScore: number, ... }
```

New signature:
```javascript
_calculateMatchScore(candidate, job, candidateSkills, requiredSkills, options = {})
// options.includeBreakdown: boolean
// Returns: {
//   overallScore: number,
//   breakdown: {
//     skills: { score, max, matches: [], missing: [] },
//     experience: { score, max, details: string },
//     location: { score, max, details: string },
//     education: { score, max, details: string }
//   }
// }
```

**2. New intent detection pattern:**

Add to `_detectIntent()`:
```javascript
// Explain score patterns
const explainPatterns = [
    /why\s+did\s+(.+?)\s+score\s+(\d+)/i,
    /explain\s+(.+?)(?:'s|s)?\s+(?:match|score)/i,
    /how\s+did\s+(.+?)\s+(?:get|score|match)/i,
    /why\s+(?:this|the)\s+score/i
];
```

Returns:
```javascript
{ type: 'explain_score', candidateName: string, jobTitle?: string }
```

**3. New handler method:**

```javascript
async _explainMatchScore(candidateName, jobTitle, db) {
    // 1. Find candidate by name
    // 2. Find job by title (or use context)
    // 3. Get existing match result or calculate new one
    // 4. Call _calculateMatchScore with includeBreakdown: true
    // 5. Format breakdown into readable response
    return {
        message: formattedExplanation,
        results: [],
        totalCount: 0
    };
}
```

**4. Store breakdowns (optional optimization):**

Add to MatchResults entity:
```cds
entity MatchResults {
    // ... existing fields
    scoreBreakdown : LargeString; // JSON stringified breakdown
}
```

### UI Integration

- Add "?" icon button next to match scores in MatchResultsDialog
- Clicking opens explanation in AI Assistant with pre-filled query

---

## Feature 2: Compare Candidates

### User Experience

**Trigger phrases:**
- "Compare John Smith and Michael Chen"
- "John vs Michael for Full-Stack Developer"
- "Which is better: John or Michael?"
- "Compare these two candidates"

**Response format:**
```
Comparison for Senior Full-Stack Developer:

                    John Smith         Michael Chen
-----------------------------------------------------
Match Score         92%                78%
Experience          8 years            5 years
Location            San Francisco      Remote

Key Skills:
  JavaScript        Expert (8yr)       Advanced (4yr)
  React             Expert (6yr)       Advanced (3yr)
  Node.js           Expert (7yr)       Intermediate
  Kubernetes        Missing            Advanced (2yr)

Strengths:
  John: More experience, stronger frontend skills
  Michael: Has Kubernetes (required), cloud-native focus

Recommendation: John for senior IC role, Michael if
DevOps/infrastructure is priority.
```

### Technical Implementation

**1. New intent detection pattern:**

```javascript
// Compare candidates patterns
const comparePatterns = [
    /compare\s+(.+?)\s+(?:and|vs\.?|versus|with)\s+(.+)/i,
    /(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:\s+for\s+(.+))?/i,
    /which\s+is\s+better[:\s]+(.+?)\s+or\s+(.+)/i,
    /difference\s+between\s+(.+?)\s+and\s+(.+)/i
];
```

Returns:
```javascript
{
    type: 'compare_candidates',
    candidate1Name: string,
    candidate2Name: string,
    jobTitle?: string
}
```

**2. New handler method:**

```javascript
async _compareCandidates(candidate1Name, candidate2Name, jobId, db) {
    const { Candidates, CandidateSkills, Skills, MatchResults } = db.entities;

    // 1. Find both candidates
    const c1 = await this._findCandidateByName(candidate1Name, db);
    const c2 = await this._findCandidateByName(candidate2Name, db);

    // 2. Get their skills
    const c1Skills = await SELECT.from(CandidateSkills)
        .where({ candidate_ID: c1.ID });
    const c2Skills = await SELECT.from(CandidateSkills)
        .where({ candidate_ID: c2.ID });

    // 3. Get match scores if job context exists
    let c1Score, c2Score;
    if (jobId) {
        c1Score = await SELECT.one.from(MatchResults)
            .where({ candidate_ID: c1.ID, jobPosting_ID: jobId });
        c2Score = await SELECT.one.from(MatchResults)
            .where({ candidate_ID: c2.ID, jobPosting_ID: jobId });
    }

    // 4. Build comparison object
    const comparison = this._buildComparison(c1, c2, c1Skills, c2Skills, c1Score, c2Score);

    // 5. Format as message
    return {
        message: this._formatComparison(comparison),
        results: [
            { type: 'candidate', id: c1.ID, title: `${c1.firstName} ${c1.lastName}`, score: c1Score?.overallScore },
            { type: 'candidate', id: c2.ID, title: `${c2.firstName} ${c2.lastName}`, score: c2Score?.overallScore }
        ],
        totalCount: 2
    };
}
```

**3. Comparison logic:**

```javascript
_buildComparison(c1, c2, c1Skills, c2Skills, c1Score, c2Score) {
    // Merge all unique skills from both candidates
    const allSkillIds = new Set([
        ...c1Skills.map(s => s.skill_ID),
        ...c2Skills.map(s => s.skill_ID)
    ]);

    const skillComparison = [];
    for (const skillId of allSkillIds) {
        const s1 = c1Skills.find(s => s.skill_ID === skillId);
        const s2 = c2Skills.find(s => s.skill_ID === skillId);
        skillComparison.push({
            skillId,
            c1: s1 ? { level: s1.proficiencyLevel, years: s1.yearsOfExperience } : null,
            c2: s2 ? { level: s2.proficiencyLevel, years: s2.yearsOfExperience } : null
        });
    }

    return {
        candidates: [c1, c2],
        scores: [c1Score?.overallScore, c2Score?.overallScore],
        experience: [c1.totalExperienceYears, c2.totalExperienceYears],
        location: [c1.city || 'Remote', c2.city || 'Remote'],
        skills: skillComparison,
        strengths: this._inferStrengths(c1, c2, skillComparison, c1Score, c2Score)
    };
}
```

**4. Strength inference (rule-based):**

```javascript
_inferStrengths(c1, c2, skills, score1, score2) {
    const c1Strengths = [];
    const c2Strengths = [];

    // Experience comparison
    if (c1.totalExperienceYears > c2.totalExperienceYears + 2) {
        c1Strengths.push('More experience');
    } else if (c2.totalExperienceYears > c1.totalExperienceYears + 2) {
        c2Strengths.push('More experience');
    }

    // Skill breadth
    const c1SkillCount = skills.filter(s => s.c1).length;
    const c2SkillCount = skills.filter(s => s.c2).length;
    if (c1SkillCount > c2SkillCount + 2) {
        c1Strengths.push('Broader skill set');
    } else if (c2SkillCount > c1SkillCount + 2) {
        c2Strengths.push('Broader skill set');
    }

    // Expert-level skills
    const c1Experts = skills.filter(s => s.c1?.level === 'expert').length;
    const c2Experts = skills.filter(s => s.c2?.level === 'expert').length;
    if (c1Experts > c2Experts) {
        c1Strengths.push('More expert-level skills');
    } else if (c2Experts > c1Experts) {
        c2Strengths.push('More expert-level skills');
    }

    return { c1: c1Strengths, c2: c2Strengths };
}
```

---

## Feature 3: Smart Daily Priorities

### User Experience

**Trigger phrases:**
- "What should I focus on today?"
- "What needs attention?"
- "My priorities"
- "What's urgent?"
- "Daily tasks"

**Response format:**
```
Here's your priority list for today:

URGENT (3 items)
  - 5 candidates awaiting review for "Senior Full-Stack Developer"
    Oldest waiting: 3 days - John Smith (92% match)
  - Interview feedback pending for Michael Chen
    Interview was 2 days ago
  - "DevOps Engineer" job has 0 candidates in pipeline
    Published 5 days ago, no applications

REVIEW TODAY (4 items)
  - 3 new CVs uploaded yesterday need processing
  - Sarah Johnson moved to "Interview" 7 days ago - follow up?
  - 2 candidates with 80%+ match haven't been contacted

QUICK STATS
  - Active jobs: 4
  - Candidates in pipeline: 23
  - Pending reviews: 8
  - Avg time-to-review: 2.3 days
```

### Technical Implementation

**1. New intent detection pattern:**

```javascript
const priorityPatterns = [
    /what\s+should\s+i\s+(?:focus|work)\s+on/i,
    /what(?:'s|\s+is)?\s+(?:urgent|priority|important)/i,
    /(?:my|today'?s?)\s+(?:priorities|tasks|focus)/i,
    /what\s+needs\s+(?:attention|review|action)/i,
    /daily\s+(?:tasks|priorities|summary)/i
];
```

Returns:
```javascript
{ type: 'daily_priorities' }
```

**2. Priority rules engine:**

```javascript
const PRIORITY_RULES = {
    urgent: [
        {
            name: 'unreviewed_high_matches',
            query: async (db) => {
                // Candidates with 80%+ match, no status change in 3+ days
            },
            format: (results) => `${results.length} candidates awaiting review`
        },
        {
            name: 'stale_interviews',
            query: async (db) => {
                // Candidates in 'interview' status for 5+ days without feedback
            },
            format: (results) => `Interview feedback pending for ${results[0].name}`
        },
        {
            name: 'empty_pipelines',
            query: async (db) => {
                // Active jobs with 0 candidates in pipeline
            },
            format: (results) => `"${results[0].title}" has 0 candidates`
        }
    ],
    review: [
        {
            name: 'pending_cv_processing',
            query: async (db) => {
                // CVUploads from last 24h not yet processed
            },
            format: (results) => `${results.length} new CVs need processing`
        },
        {
            name: 'uncontacted_matches',
            query: async (db) => {
                // High-match candidates never contacted
            },
            format: (results) => `${results.length} high-match candidates not contacted`
        }
    ]
};
```

**3. Handler method:**

```javascript
async _getDailyPriorities(db) {
    const { Candidates, MatchResults, JobPostings, CVUploads } = db.entities;

    const urgent = [];
    const review = [];

    // Run all priority rule queries
    for (const rule of PRIORITY_RULES.urgent) {
        const results = await rule.query(db);
        if (results.length > 0) {
            urgent.push({
                type: rule.name,
                message: rule.format(results),
                count: results.length,
                items: results.slice(0, 3) // Top 3 for details
            });
        }
    }

    for (const rule of PRIORITY_RULES.review) {
        const results = await rule.query(db);
        if (results.length > 0) {
            review.push({
                type: rule.name,
                message: rule.format(results),
                count: results.length,
                items: results.slice(0, 3)
            });
        }
    }

    // Calculate quick stats
    const stats = await this._calculateQuickStats(db);

    // Format response
    return {
        message: this._formatPriorities(urgent, review, stats),
        results: [], // Could include top priority items as clickable cards
        totalCount: urgent.length + review.length
    };
}
```

**4. Quick stats calculation:**

```javascript
async _calculateQuickStats(db) {
    const { JobPostings, Candidates, MatchResults, CVUploads } = db.entities;

    const [activeJobs] = await SELECT.from(JobPostings)
        .where({ status: 'published' })
        .columns('count(*) as count');

    const [pipelineCandidates] = await SELECT.from(Candidates)
        .where({ status_code: { '!=': 'rejected' }, isDeleted: false })
        .columns('count(*) as count');

    const [pendingReviews] = await SELECT.from(MatchResults)
        .where({ feedback: null })
        .columns('count(*) as count');

    return {
        activeJobs: activeJobs.count,
        pipelineCandidates: pipelineCandidates.count,
        pendingReviews: pendingReviews.count
    };
}
```

---

## Shared Infrastructure

### Updated Intent Detection

Add to `_detectIntent()` method:

```javascript
// Check for explain score
for (const pattern of explainPatterns) {
    const match = query.match(pattern);
    if (match) {
        return { type: 'explain_score', candidateName: match[1]?.trim() };
    }
}

// Check for compare candidates
for (const pattern of comparePatterns) {
    const match = query.match(pattern);
    if (match) {
        return {
            type: 'compare_candidates',
            candidate1Name: match[1]?.trim(),
            candidate2Name: match[2]?.trim(),
            jobTitle: match[3]?.trim()
        };
    }
}

// Check for daily priorities
for (const pattern of priorityPatterns) {
    if (pattern.test(query)) {
        return { type: 'daily_priorities' };
    }
}
```

### Updated Handler Switch

Add to `_handleAISearch()`:

```javascript
case 'explain_score':
    const explainResult = await this._explainMatchScore(
        intent.candidateName,
        intent.jobTitle || contextJobId,
        db
    );
    results = explainResult.results;
    message = explainResult.message;
    break;

case 'compare_candidates':
    const compareResult = await this._compareCandidates(
        intent.candidate1Name,
        intent.candidate2Name,
        intent.jobTitle || contextJobId,
        db
    );
    results = compareResult.results;
    message = compareResult.message;
    totalCount = compareResult.totalCount;
    break;

case 'daily_priorities':
    const prioritiesResult = await this._getDailyPriorities(db);
    results = prioritiesResult.results;
    message = prioritiesResult.message;
    totalCount = prioritiesResult.totalCount;
    break;
```

### New Quick Actions

Update quick actions in Main.controller.js:

```javascript
quickActions: [
    { text: "Full-Stack matches", query: "Top candidates for Senior Full-Stack Developer" },
    { text: "My priorities", query: "What should I focus on today?" },
    { text: "Compare top 2", query: "Compare the top 2 candidates" },
    { text: "JavaScript devs", query: "Find JavaScript developers" }
]
```

---

## Testing Strategy

### Unit Tests

1. **Intent detection tests:**
   - Test all trigger phrase variations
   - Test edge cases (partial names, typos)

2. **Score breakdown tests:**
   - Verify breakdown components sum to total
   - Test missing skills detection
   - Test exceeds/meets/missing classification

3. **Comparison logic tests:**
   - Test skill merging from both candidates
   - Test strength inference rules
   - Test with missing data (one candidate has no skills)

4. **Priority rules tests:**
   - Test each rule in isolation
   - Test empty results handling
   - Test date calculations (3+ days ago, etc.)

### Integration Tests

1. **End-to-end AI queries:**
   ```javascript
   // Test explain score flow
   const response = await aiSearch("Why did John Smith score 92%?");
   expect(response.message).toContain("Skills Match");
   expect(response.message).toContain("Experience");

   // Test compare flow
   const compare = await aiSearch("Compare John and Michael");
   expect(compare.results.length).toBe(2);

   // Test priorities flow
   const priorities = await aiSearch("What should I focus on?");
   expect(priorities.message).toContain("URGENT");
   ```

---

## Future Phases (Out of Scope)

**Phase 2 - LLM Integration (when available):**
- AI-generated candidate summaries
- Natural language bulk actions ("Move all 80%+ to shortlist")
- Conversational context memory

**Phase 3 - Learning & Automation:**
- Learn from thumbs up/down feedback
- Auto-suggest candidates for new jobs
- Predictive pipeline health alerts

---

## Implementation Checklist

- [ ] Extend `_calculateMatchScore()` with breakdown option
- [ ] Add `_explainMatchScore()` handler
- [ ] Add `_compareCandidates()` handler
- [ ] Add `_buildComparison()` and `_formatComparison()` helpers
- [ ] Add `_getDailyPriorities()` handler
- [ ] Add `_calculateQuickStats()` helper
- [ ] Update `_detectIntent()` with new patterns
- [ ] Update `_handleAISearch()` switch statement
- [ ] Update quick actions in Main.controller.js
- [ ] Add unit tests for intent detection
- [ ] Add integration tests for each feature
- [ ] Update i18n with new messages
