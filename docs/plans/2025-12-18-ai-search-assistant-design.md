# AI Search Assistant Design

## Overview

Add a conversational chat interface to CV Management app that allows recruiters to search candidates and jobs using natural language queries like "top candidates for Senior Developer" or "compare John vs Sarah".

## Problem

The current ML Showcase app provides technical endpoint testing but isn't practical for daily recruiter use. Recruiters need a natural way to ask questions without knowing API parameters or navigating to specific pages.

## Solution

A floating "Joule-style" AI assistant button that opens a chat dialog, available from any tab in CV Management.

## UI Components

### Floating Action Button (FAB)
- Position: Bottom-right corner
- Icon: `sap-icon://da-2` (AI assistant)
- Tooltip: "AI Search Assistant"
- Always visible across all tabs

### Chat Dialog
- Type: `sap.m.Dialog` (400px x 500px, non-stretch)
- Header: "AI Search Assistant" + close button
- Body: Scrollable message list
- Footer: Input field + Send button + Quick action chips

### Message Types
1. **User message** - Right-aligned, blue background
2. **AI response** - Left-aligned, gray background, optional result cards
3. **Result cards** - Compact list items showing:
   - Candidate: Name, skills (3 max), match score, View button
   - Job: Title, department, View Matches button

### Quick Action Chips
Context-aware suggestions below input:
- "Top candidates for [current job]" (on Job Detail)
- "Similar to [current candidate]" (on Candidate Detail)
- "Compare top matches"

## Query Processing

### Supported Intents

| Intent | Example Queries | Backend Call |
|--------|----------------|--------------|
| `job_matches` | "Top candidates for Senior Developer" | `findSemanticMatches()` |
| `candidate_search` | "Find React developers" | `semanticSearch({ query })` |
| `similar_candidates` | "Similar to John Smith" | `semanticSearch({ candidateId })` |
| `compare` | "Compare John vs Sarah" | `calculateSingleMatch()` x2 |
| `job_fit` | "What jobs fit Michael?" | `semanticSearch()` against jobs |

### Intent Detection
Simple keyword matching:
- Job name/ID in query → `job_matches`
- "similar to" + candidate name → `similar_candidates`
- "compare" keyword → `compare`
- "fit" + candidate name → `job_fit`
- Default → `candidate_search`

### Entity Resolution
- Candidate names: Fuzzy match against `Candidates.firstName + lastName`
- Job titles: Fuzzy match against `JobPostings.title`
- Context references: "this job", "this candidate" resolve from current page

### Response Format
- Friendly message: "Found 8 candidates matching 'React developer'. Here are the top 3:"
- Top 3 result cards inline
- "See all X results" link for full view

## Implementation

### Files to Create

| File | Purpose |
|------|---------|
| `fragment/AIAssistantDialog.fragment.xml` | Chat dialog UI |
| `fragment/AIResultCard.fragment.xml` | Reusable result card |
| `controller/AIAssistant.controller.js` | Chat logic, intent detection, API calls |
| `css/aiAssistant.css` | Chat styling |

### Files to Modify

| File | Changes |
|------|---------|
| `view/Main.view.xml` | Add FAB button |
| `controller/Main.controller.js` | Initialize assistant, FAB handler |
| `i18n/i18n.properties` | Add translations |
| `srv/services.cds` | Add `aiSearch` action |
| `srv/cv-sorting-service.js` | Implement `aiSearch` handler |

### State Model

```javascript
// aiAssistant JSONModel
{
  isOpen: false,
  messages: [
    { type: 'user'|'ai', text: string, results?: [], timestamp: Date }
  ],
  isLoading: false,
  quickActions: [
    { text: string, query: string }
  ],
  currentContext: {
    jobId: string | null,
    candidateId: string | null
  }
}
```

### Backend Action

```cds
action aiSearch(
  query: String not null,
  contextJobId: UUID,
  contextCandidateId: UUID
) returns {
  intent: String;
  message: String;
  results: array of {
    type: String;        // 'candidate' | 'job'
    id: UUID;
    title: String;       // name or job title
    subtitle: String;    // skills or department
    score: Decimal;
    metadata: String;    // JSON string for extra data
  };
  totalCount: Integer;
};
```

## Testing

- [ ] FAB visible on all tabs
- [ ] Dialog opens/closes correctly
- [ ] User messages appear right-aligned
- [ ] AI responses appear left-aligned
- [ ] "Top candidates for [job]" returns job matches
- [ ] "Find React developers" returns candidate search results
- [ ] "Similar to [name]" finds similar candidates
- [ ] "Compare X vs Y" shows comparison
- [ ] Quick actions update based on current page context
- [ ] Result cards navigate to correct detail pages
- [ ] "See all results" navigates to filtered list
- [ ] Loading state shown during API calls
- [ ] Error messages displayed gracefully
