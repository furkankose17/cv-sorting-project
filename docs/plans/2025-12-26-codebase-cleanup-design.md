# Codebase Cleanup & Feature Completion Design

**Date:** 2025-12-26
**Status:** Approved
**Scope:** 41 issues across 5 phases

## Overview

Address all identified errors, unimplemented features, and code quality issues in the CV Sorting Application. Work is organized by file to minimize context switching and merge conflicts.

## Priority Order

1. Core workflow features (Edit Job, Bulk Matching, Document Preview)
2. Secondary features (View Interviews, Jobs Management, Test Email)
3. Backend integration (CAP Integration in Python ML service)
4. Advanced configuration (Scoring Rule Builder, Import/Export)

---

## Phase 1: Service Layer Cleanup

**File:** `srv/cv-sorting-service.js`
**Issues:** 6

### Changes

1. **Environment-based configuration**
   - Replace hardcoded n8n webhook URL (line 65)
   - Replace placeholder email domain (line 676)
   ```javascript
   const config = {
     n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
     emailDomain: process.env.DEFAULT_EMAIL_DOMAIN || 'pending-verification.local'
   };
   ```

2. **Proper handler delegation**
   - Fix null return without error (line 2748)
   ```javascript
   if (!handler) {
     throw new Error(`Handler '${handlerName}' not implemented`);
   }
   ```

3. **Consistent async error handling**
   - Wrap critical paths in try-catch
   - Propagate errors with context
   - Log errors but don't expose internals to clients

**Estimated scope:** ~50 lines changed

---

## Phase 2: Main Controller Features

**File:** `app/cv-management/webapp/controller/Main.controller.js`
**Issues:** 9

### Features to Implement

1. **Edit Job Dialog** (line 1843)
   - Create `EditJobDialog.fragment.xml` with form fields
   - Implement `onEditJob()` to open dialog pre-filled with job data
   - Add save handler calling `PATCH /api/JobPostings(id)`

2. **Bulk Matching** (line 2049)
   - Add button to Jobs tab triggering batch operation
   - Call existing match endpoint for each active job
   - Show progress dialog with results summary

3. **Document Preview** (line 2095)
   - Implement in-dialog PDF viewer using existing preview infrastructure
   - Reuse CV preview component from CVReview page

4. **View Interviews** (line 2057)
   - Show scheduled interviews from MatchResults with status "Interview"
   - Simple table with candidate, job, date columns

5. **Jobs Management Page** (line 3197)
   - Navigate to dedicated jobs management view
   - Or integrate into existing Jobs tab

6. **Send Test Email** (line 3691)
   - Integrate with email service
   - Show confirmation dialog with result

7. **URL Configuration** (lines 128, 3698, 4004)
   - Move all URLs to `manifest.json` or config model
   - Use `sap.ui.core.Configuration` for runtime access

**Estimated scope:** ~400 lines new, ~100 lines modified

---

## Phase 3: Job Detail & Rule Builder

**File:** `app/cv-management/webapp/controller/JobDetail.controller.js`
**Issues:** 7

### Features to Implement

1. **Edit Job** (line 174)
   - Reuse `EditJobDialog.fragment.xml` from Phase 2
   - Same save logic, different context

2. **Rule Builder Dialog** (lines 958, 1073)
   - Create `RuleBuilderDialog.fragment.xml`
   - Fields: name, field selector, operator, value, weight
   - Support rule types: keyword match, range check, boolean

3. **Rule Templates** (line 981)
   - Predefined templates: "Technical Role", "Senior Position", "Entry Level"
   - Load from JSON config or backend endpoint
   - One-click apply with customization option

4. **Test Rule** (line 1139)
   - Run rule against sample candidates
   - Show match/no-match results with scores
   - Display which candidates would be affected

5. **Import/Export Rules** (lines 1175, 1182)
   - Export: Download rules as JSON file
   - Import: Upload JSON, validate schema, merge or replace

**Estimated scope:** ~500 lines new code

---

## Phase 4: Python ML Service

**File:** `python-ml-service/app/services/matching_service.py`
**Issues:** 1 (critical)

### Implementation

1. **CAP Service Integration** (line 378)
   ```python
   async def _get_candidate_data(self, candidate_id: str) -> dict:
       response = await self.http_client.get(
           f"{self.cap_url}/api/Candidates({candidate_id})",
           params={"$expand": "workHistory,education,skills"}
       )
       return self._transform_candidate_response(response.json())
   ```

2. **Configuration**
   - Add `CAP_SERVICE_URL` environment variable
   - Add health check for CAP connectivity
   - Graceful fallback if CAP unavailable

3. **Data Transformation**
   - Map CAP entity structure to ML service expectations
   - Handle missing fields with sensible defaults
   - Validate required fields for matching

4. **Error Handling**
   - Timeout handling for slow CAP responses
   - Retry logic with exponential backoff
   - Clear error messages for debugging

**Estimated scope:** ~80 lines new, ~20 lines modified

---

## Phase 5: Remaining Files & Code Quality

### `srv/handlers/ocr-service.js` (5 issues)

- Fix regex infinite loop potential (lines 549, 572, 720, 845)
  - Add iteration limit or use `matchAll()` instead of `exec()` loops
- Sanitize error messages before returning to client
- Improve DOC file handling confidence warning

### `srv/candidate-service.js` (1 issue)

- Replace `console.log` notification placeholder with real implementation
- Integrate with existing email service or create notification queue

### `db/schema.cds` (1 issue)

- Add computed expression for `fullName` virtual field:
  ```cds
  virtual fullName : String = firstName || ' ' || lastName;
  ```

### `test/` cleanup (2 issues)

- Enable skipped integration test or document why skipped
- Remove deprecated method references

### General cleanup

- Search and fix remaining TODOs/FIXMEs
- Ensure consistent error handling patterns
- Add missing input validation at system boundaries

**Estimated scope:** ~100 lines modified across 6 files

---

## New Files to Create

| File | Purpose |
|------|---------|
| `app/cv-management/webapp/fragment/EditJobDialog.fragment.xml` | Edit job form dialog |
| `app/cv-management/webapp/fragment/RuleBuilderDialog.fragment.xml` | Create/edit scoring rules |
| `app/cv-management/webapp/fragment/RuleTemplatesDialog.fragment.xml` | Rule template selection |
| `app/cv-management/webapp/fragment/DocumentPreviewDialog.fragment.xml` | In-app document viewer |

---

## Summary

| Phase | Focus | Issues | New Code | Modified |
|-------|-------|--------|----------|----------|
| 1 | Service Layer | 6 | ~20 lines | ~50 lines |
| 2 | Main Controller | 9 | ~400 lines | ~100 lines |
| 3 | Job Detail & Rules | 7 | ~500 lines | ~50 lines |
| 4 | Python ML Service | 1 | ~80 lines | ~20 lines |
| 5 | Remaining & Quality | 10+ | ~30 lines | ~100 lines |
| **Total** | | **41** | **~1,030 lines** | **~320 lines** |

## Dependencies

- Phase 2 Edit Job dialog is reused in Phase 3
- Phase 4 requires CAP service running for testing
