# Analytics Tab Consolidation Design

## Overview

Replace the unused "Processing Queue" tab in CV Management with a full Analytics dashboard, consolidating the standalone Analytics Dashboard app into the main CV Management application.

## Problem

The Processing Queue tab is rarely useful - it only shows activity during batch CV uploads. The Analytics Dashboard app provides valuable daily insights but requires navigating to a separate application.

## Solution

Embed the full Analytics Dashboard content into CV Management as the "Analytics" tab, then remove the standalone Analytics Dashboard app.

## Implementation

### Tab Replacement

1. **Rename tab**: "Processing Queue" → "Analytics"
2. **Update icon**: `sap-icon://process` → `sap-icon://business-objects-experience`
3. **Replace content**: Load analytics content instead of queue content

### Analytics Tab Content

- 6 KPI Cards:
  - Total Candidates
  - Active Jobs
  - Avg Match Score
  - Time to Hire
  - Upcoming Interviews
  - Completion Rate
- Pipeline Status panel (status breakdown table with percentages)
- Top Skills panel (supply/demand ratios)
- AI Insights panel (Joule recommendations)
- Date range filter in header
- Export report functionality

### Files to Create/Modify

**cv-management app:**

| File | Action | Description |
|------|--------|-------------|
| `fragment/AnalyticsSection.fragment.xml` | Create | New fragment with dashboard UI |
| `controller/Main.controller.js` | Modify | Add dashboard model, data loading, event handlers |
| `view/Main.view.xml` | Modify | Update tab name, icon, key |
| `i18n/i18n.properties` | Modify | Add analytics translations |

**Code to add to Main.controller.js:**
- `dashboard` JSONModel initialization
- `_loadDashboardData()` - orchestrates all data loading
- `_callAnalyticsFunction()` - calls analytics service functions
- `_processPipelineData()` - processes pipeline response
- `_processSkillsData()` - processes skills response
- `_loadInterviewData()` - loads interview analytics
- `_loadMatchingData()` - loads match statistics
- `_loadJobsData()` - loads job counts
- `_loadFallbackPipelineData()` - fallback when service unavailable
- `_loadFallbackSkillsData()` - fallback when service unavailable
- `_loadAIInsights()` - loads Joule recommendations
- `_generateSampleInsights()` - generates sample insights when Joule unavailable
- `onRefreshAnalytics()` - refresh button handler
- `onExportReport()` - CSV export handler
- `onDateRangeChange()` - date filter handler
- `onNavigateToSkills()`, `onNavigateToPipeline()`, etc. - navigation handlers
- `onAskJoule()` - Joule dialog handler
- `onAIRecommendationPress()` - recommendation click handler

### Files to Delete

| File | Reason |
|------|--------|
| `app/analytics-dashboard/` | Entire directory - consolidated into cv-management |
| `app/cv-management/webapp/fragment/QueueSection.fragment.xml` | Replaced by AnalyticsSection |

### Cleanup

**Main.controller.js - Remove:**
- `onRefreshQueue()`
- `onToggleAutoRefresh()`
- `onViewQueueDetails()`
- `onCancelQueue()`
- `onDeleteQueue()`
- `onQueueItemPress()`
- `onGoToUpload()`
- `queueView` model references

**Navigation updates:**
- Remove analytics app from any launchpad configuration
- Update cross-app links to use tab navigation instead

## Testing

- [ ] All 6 KPI cards load and display data
- [ ] Pipeline table shows status breakdown with correct states
- [ ] Skills table shows supply/demand ratios
- [ ] AI insights panel generates recommendations (or shows empty state)
- [ ] Date range filter triggers data reload
- [ ] Export report downloads valid CSV
- [ ] Refresh button reloads all data
- [ ] No console errors on tab load
- [ ] Tab loads quickly (< 2 seconds)

## Migration Notes

- Analytics service endpoints remain unchanged
- Joule integration (if configured) continues to work
- All other tabs unaffected
- No database changes required
