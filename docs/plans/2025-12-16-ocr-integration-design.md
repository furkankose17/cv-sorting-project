# OCR-Powered CV Processing System - Design Document

**Date:** 2025-12-16
**Status:** Approved for Implementation
**Author:** Design Session with User

## Overview

Complete integration of PaddleOCR with CAP service and Fiori apps to enable automated CV processing with semantic search compatibility. Supports both single and batch upload workflows with intelligent auto-create based on confidence thresholds.

## Requirements

### Functional Requirements
- **Single CV Upload**: Upload CV → OCR extraction → Preview/Edit → Create candidate + embedding
- **Batch CV Upload**: Upload multiple CVs → Sequential processing → Auto-create (≥85%) or manual review (<85%)
- **Tiered Extraction**: Extract essential fields (Tier 1), professional background (Tier 2), leave complex data for manual entry (Tier 3)
- **Semantic Integration**: Generate embeddings for all created candidates to enable semantic search
- **Editing Capability**: Side-by-side CV preview with editable extracted data

### Non-Functional Requirements
- **Performance**: 5-10 seconds per CV, 6-12 CVs per minute
- **Quality**: 85% confidence threshold for auto-create
- **Throughput**: Support batches of 50+ CVs (4-8 minutes)
- **Reliability**: Graceful fallback on ML service failure

## Architecture

### Three-Layer Design

**Layer 1: Fiori Frontend (cv-management app)**
- Single entry point for all CV operations
- Four tabs: Upload, Candidates, Documents, Queue
- Side-by-side layout: CV preview (left) + extracted data form (right)
- Real-time batch processing progress

**Layer 2: CAP Service (Node.js)**
- Orchestrates workflow through service actions
- Manages confidence-based routing (≥85% auto-create, <85% manual review)
- Handles state management and validation
- Calls ML service for OCR and embeddings

**Layer 3: Python ML Service (FastAPI)**
- PaddleOCR for document text extraction
- Structured data extraction with confidence scoring
- Semantic embedding generation
- Field-level confidence calculation

### Data Flow

**Single Upload Flow:**
```
1. User uploads CV → Fiori
2. Fiori calls uploadAndProcessCV → CAP Service
3. CAP stores in CVDocuments (status='processing')
4. CAP calls /api/ocr/process → ML Service
5. ML extracts text + structures data → returns with confidence
6. CAP updates CVDocuments with OCR results
7. If confidence ≥85%: auto-create candidate + generate embedding
8. If confidence <85%: return to Fiori for manual review
9. User edits/confirms → CAP creates candidate + embedding
```

**Batch Upload Flow:**
```
1. User selects multiple CVs + sets threshold (default 85%)
2. Fiori calls uploadBatchCVs → CAP Service
3. CAP creates ProcessingQueue record
4. CAP spawns async job, processes each CV sequentially
5. For each CV: same as single upload flow
6. Updates queue progress after each file
7. Fiori polls getBatchProgress every 2 seconds
8. User reviews items marked "Need Review"
```

## Data Model

### CVDocuments Entity Extensions

```cds
entity CVDocuments {
    // ... existing fields ...

    // OCR fields
    ocrStatus: String enum {
        pending;
        processing;
        completed;
        failed;
        review_required;
    };
    ocrConfidence: Decimal(5,2);  // 0-100
    extractedText: LargeString;   // Raw OCR output
    structuredData: LargeString;  // JSON with tiered extraction
    ocrMethod: String;            // 'paddleocr_image' or 'paddleocr_pdf'
    ocrProcessedAt: Timestamp;
    ocrProcessingTime: Integer;   // milliseconds
    reviewedBy: String;
    reviewedAt: Timestamp;
}
```

### StructuredData JSON Format

```json
{
    "overall_confidence": 87.5,
    "tier1": {
        "firstName": {"value": "John", "confidence": 98, "source": "line_1"},
        "lastName": {"value": "Doe", "confidence": 95, "source": "line_1"},
        "email": {"value": "john@example.com", "confidence": 92, "source": "line_3"},
        "phone": {"value": "+1234567890", "confidence": 88, "source": "line_4"},
        "location": {"value": "New York, USA", "confidence": 90, "source": "line_2"}
    },
    "tier2": {
        "workHistory": [
            {
                "company": "TechCorp",
                "role": "Senior Developer",
                "dates": "2020-2023",
                "confidence": 78
            }
        ],
        "education": [
            {
                "institution": "MIT",
                "degree": "BS Computer Science",
                "year": "2019",
                "confidence": 82
            }
        ],
        "skills": ["React", "Node.js", "Python"]
    },
    "tier3": {
        "references": {"value": null, "confidence": 0},
        "certifications": []
    },
    "raw_sections": {
        "experience_section": "Full text...",
        "education_section": "Full text..."
    }
}
```

### ProcessingQueue Entity (New)

```cds
entity ProcessingQueue {
    key ID: UUID;
    userId: String;
    status: String enum {
        queued;
        processing;
        completed;
        partial;
        failed;
    };
    totalFiles: Integer;
    processedCount: Integer;
    autoCreatedCount: Integer;
    reviewRequiredCount: Integer;
    failedCount: Integer;
    currentFile: String;
    autoCreateThreshold: Decimal(5,2);  // Default 85.0
    startedAt: Timestamp;
    completedAt: Timestamp;
    estimatedTimeRemaining: Integer;
}
```

## CAP Service Implementation

### New Service Actions

```cds
// Single CV Upload & OCR
action uploadAndProcessCV(
    fileName: String not null,
    fileContent: LargeBinary not null,
    mediaType: String not null,
    autoCreate: Boolean
) returns {
    documentId: UUID;
    ocrStatus: String;
    confidence: Decimal;
    extractedData: String;
    candidateId: UUID;
    requiresReview: Boolean;
};

// Batch Upload
action uploadBatchCVs(
    files: array of {
        fileName: String;
        fileContent: LargeBinary;
        mediaType: String;
    },
    autoCreateThreshold: Decimal
) returns {
    queueId: UUID;
    totalFiles: Integer;
    estimatedTime: Integer;
};

// Get batch progress
function getBatchProgress(queueId: UUID) returns {
    status: String;
    totalFiles: Integer;
    processed: Integer;
    autoCreated: Integer;
    reviewRequired: Integer;
    failed: Integer;
    currentFile: String;
    estimatedTimeRemaining: Integer;
};

// Review & confirm low-confidence extraction
action reviewAndCreateCandidate(
    documentId: UUID not null,
    editedData: String not null
) returns {
    candidateId: UUID;
    linkedSkillsCount: Integer;
    embeddingGenerated: Boolean;
};
```

### Handler Logic

**uploadAndProcessCV Handler:**
1. Validate file format (PDF, PNG, JPG, TIFF) and size (<10MB)
2. Create CVDocument record with status='processing'
3. Convert fileContent to base64 for ML service
4. Call `mlClient.processOCR()` with extract_structured=true
5. Parse response, extract confidence and structured data
6. Update CVDocument with OCR results
7. If confidence ≥85% AND autoCreate=true:
   - Call createCandidateFromDocument with structured data
   - Call generateCandidateEmbedding
   - Return candidateId
8. If confidence <85%:
   - Set requiresReview=true
   - Return for manual review
9. Return result with documentId, status, extracted data

**uploadBatchCVs Handler:**
1. Create ProcessingQueue record with status='queued'
2. Spawn async job using setImmediate
3. For each file sequentially:
   - Call uploadAndProcessCV internally
   - Update queue progress
4. Return queueId immediately for polling

**reviewAndCreateCandidate Handler:**
1. Load CVDocument by ID
2. Accept user-edited structured data
3. Create candidate with corrected data
4. Generate embedding using final data
5. Mark document as reviewed and completed

## ML Service Implementation

### New Endpoints

**POST /api/ocr/extract-structured**
```python
class ExtractStructuredRequest(BaseModel):
    text: str  # Raw OCR text
    language: str = "en"
    extraction_mode: str = "tiered"

class ExtractStructuredResponse(BaseModel):
    overall_confidence: float
    tier1: Dict[str, FieldExtraction]
    tier2: Dict[str, Any]
    tier3: Dict[str, Any]
    raw_sections: Dict[str, str]
```

### Extraction Logic

**Tier 1 - High Confidence Patterns:**
- Email: Regex pattern `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- Phone: International formats using `phonenumbers` library
- Name: First capitalized words in first 3 lines
- Location: City/country detection using GeoNames database

**Tier 2 - Moderate Confidence:**
- Work History: Section headers ("Experience", "Work History") + date ranges
- Education: Section headers + degree keywords (BS, MS, PhD, Bachelor, Master)
- Skills: Technical keywords matching from skills database

**Tier 3 - Low Confidence:**
- Flag for manual entry (soft skills, references, detailed descriptions)

### Confidence Calculation

Per-field confidence based on:
- Pattern match strength (exact regex=high, fuzzy=medium)
- OCR confidence for text region (from PaddleOCR bbox data)
- Field validation (email syntax, phone format)
- Context (email near "Email:" label = higher confidence)

### Enhanced /api/ocr/process

When `extract_structured=true`:
1. Perform OCR extraction
2. Call extract_structured_data internally
3. Return both raw OCR + structured extraction in one call

## Fiori UI Implementation

### App Structure

cv-management app with IconTabBar:
- **Upload Tab** - Single/batch CV upload with OCR
- **Candidates Tab** - Existing candidate management
- **Documents Tab** - OCR processing history
- **Queue Tab** - Batch processing monitor

### Upload Tab - Single Upload

**Split Container (50/50):**

**Left Panel - CV Preview:**
- FileUploader (PDF, PNG, JPG, TIFF, max 10MB)
- PDF.js viewer for PDFs
- Image component for images
- Zoom controls (+/-)
- Page navigation for multi-page PDFs
- OCR progress indicator

**Right Panel - Extracted Data Form:**

*Section 1: Personal Information (Tier 1)*
- Fields: First Name, Last Name, Email, Phone, Location
- Confidence badges (green ≥90%, yellow 70-89%, red <70%)
- Click badge to highlight source in left panel
- Editable inputs for corrections

*Section 2: Professional Background (Tier 2)*
- Work History table with confidence per row
- "Add Experience" button
- Education table
- Skills multi-select with confidence

*Section 3: Additional Details (Tier 3)*
- Manual entry fields (no OCR data)
- Certifications, Languages, References

**Action Bar:**
- "Cancel" button
- "Create Candidate" button (enabled when Tier 1 complete)
- Overall confidence display

### Upload Tab - Batch Upload

**Step 1 - File Selection:**
- Multiple file uploader with drag & drop
- File list with thumbnails
- Remove individual files
- "Auto-Create Threshold" slider (60%-95%, default 85%)

**Step 2 - Processing:**
- Sequential progress indicator
- Real-time stats: Total, Processed, Auto-created, Need Review, Failed
- List of processed CVs with status icons
- Cancel button

**Step 3 - Review Results:**
- Split view: Review queue (left), detail (right)
- Click "Need Review" items to edit
- Bulk actions: "Accept All", "Delete Failed", "Export Report"

## Error Handling

### ML Service Level
- OCR timeout (>30s): Return partial results with warning
- Unsupported format: HTTP 400 with clear message
- PaddleOCR crash: Fallback to PyPDF2 text extraction
- Low confidence (<50%): Mark for manual review
- File too large: Reject at CAP layer

### CAP Service Level
- ML service unavailable: Save document, retry queue
- Invalid file content: Validate magic numbers
- Duplicate CV: Hash content, check existing, prompt user
- Transaction failures: Rollback candidate if embedding fails
- Concurrent batches: Limit 1 per user

### Fiori Level
- Upload interrupted: Resume option
- OCR timeout: "Still processing..." with cancel
- Network errors: Auto-retry 3 times
- Large batch (>50): Warning with estimated time

## Testing Strategy

### Unit Tests (Python ML Service)
- OCR extraction with various CV formats
- Structured data extraction accuracy
- Confidence calculation edge cases
- Mock PaddleOCR for speed

### Integration Tests (CAP Service)
- Full workflow: upload → OCR → create → embed
- Batch processing with mixed quality
- Error recovery and retry
- Concurrent operations

### E2E Tests (Fiori)
- Single upload workflow
- Batch upload with review
- Editing and re-validation
- Responsive behavior

## Performance Metrics

**Processing Speed:**
- 5-10 seconds per CV (PaddleOCR processing)
- 6-12 CVs per minute throughput
- 50 CV batch: 4-8 minutes total

**Database Optimization:**
- Index CVDocuments.ocrStatus
- Index ProcessingQueue.userId
- Archive completed queues after 30 days

**Monitoring:**
- Track OCR confidence distribution
- Monitor ML service response times
- Track auto-create rate (target 60-70%)
- Log failed extractions

## Security Considerations

- File upload: Validate MIME types, optional malware scan
- CV content: Encrypt fileContent at rest
- Access control: Owner + admins only
- PII handling: Mark email/phone as sensitive, audit access
- Batch jobs: Isolate by user

## Implementation Phases

### Phase 1: Data Model & ML Service
- Extend CVDocuments entity
- Create ProcessingQueue entity
- Implement /api/ocr/extract-structured endpoint
- Test structured extraction accuracy

### Phase 2: CAP Service Actions
- Implement uploadAndProcessCV action
- Implement uploadBatchCVs action
- Implement getBatchProgress function
- Implement reviewAndCreateCandidate action
- Update ml-client.js with new methods

### Phase 3: Fiori Upload Tab - Single Upload
- Create Upload tab with split container
- Implement CV preview component
- Implement extracted data form with confidence badges
- Wire up uploadAndProcessCV action

### Phase 4: Fiori Upload Tab - Batch Upload
- Implement batch file selection
- Implement sequential progress tracking
- Implement review queue
- Wire up batch actions

### Phase 5: Testing & Refinement
- Integration tests
- E2E tests
- Performance tuning
- Error handling improvements

## Success Criteria

- Auto-create rate ≥60% for typical CVs
- Average confidence score ≥75% for auto-created candidates
- Processing time ≤10 seconds per CV
- Zero data loss in batch processing
- All extracted candidates have valid embeddings for semantic search

---

**Design Approved:** 2025-12-16
**Ready for Implementation**
