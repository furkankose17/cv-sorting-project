# OCR Integration with CAP and Fiori Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate PaddleOCR with CAP service and Fiori apps to enable automated CV processing with single/batch upload, confidence-based auto-create, and semantic search compatibility.

**Architecture:** Three-layer system where Fiori cv-management app uploads CVs, CAP service orchestrates OCR processing and candidate creation, and Python ML service performs PaddleOCR extraction with structured field parsing. Sequential batch processing with 85% confidence threshold for auto-create vs manual review.

**Tech Stack:** SAP CAP (Node.js), Fiori UI5, Python FastAPI, PaddleOCR, PostgreSQL

---

## Phase 1: Database Schema & Core Models

### Task 1: Extend CVDocuments Entity with OCR Fields

**Files:**
- Modify: `db/schema.cds` (CVDocuments entity around line 150)
- Test: `test/schema-validation.test.js` (new file)

**Step 1: Write the failing test**

Create `test/schema-validation.test.js`:
```javascript
const cds = require('@sap/cds');

describe('CVDocuments Schema', () => {
    let db;

    beforeAll(async () => {
        db = await cds.connect.to('db');
    });

    test('CVDocuments should have OCR fields', async () => {
        const { CVDocuments } = db.entities('cv.sorting');
        const metadata = CVDocuments.elements;

        expect(metadata.ocrStatus).toBeDefined();
        expect(metadata.ocrConfidence).toBeDefined();
        expect(metadata.extractedText).toBeDefined();
        expect(metadata.structuredData).toBeDefined();
        expect(metadata.ocrMethod).toBeDefined();
        expect(metadata.ocrProcessedAt).toBeDefined();
        expect(metadata.ocrProcessingTime).toBeDefined();
        expect(metadata.reviewedBy).toBeDefined();
        expect(metadata.reviewedAt).toBeDefined();
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/schema-validation.test.js`
Expected: FAIL with "Cannot read property 'ocrStatus' of undefined"

**Step 3: Add OCR fields to CVDocuments entity**

In `db/schema.cds`, find the CVDocuments entity and add after existing fields:
```cds
entity CVDocuments : cuid, managed {
    // ... existing fields ...

    // OCR Processing Fields
    ocrStatus           : String enum {
        pending;
        processing;
        completed;
        failed;
        review_required;
    } default 'pending';
    ocrConfidence       : Decimal(5,2);
    extractedText       : LargeString;
    structuredData      : LargeString;
    ocrMethod          : String(50);
    ocrProcessedAt     : Timestamp;
    ocrProcessingTime  : Integer;
    reviewedBy         : String(255);
    reviewedAt         : Timestamp;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/schema-validation.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add db/schema.cds test/schema-validation.test.js
git commit -m "feat(db): add OCR fields to CVDocuments entity

- Add ocrStatus enum (pending, processing, completed, failed, review_required)
- Add ocrConfidence, extractedText, structuredData fields
- Add ocrMethod, processing timestamps, review tracking fields

🤖 Generated with Claude Code"
```

---

### Task 2: Create ProcessingQueue Entity

**Files:**
- Modify: `db/schema.cds` (add new entity)
- Test: `test/schema-validation.test.js`

**Step 1: Write the failing test**

Add to `test/schema-validation.test.js`:
```javascript
test('ProcessingQueue entity should exist with required fields', async () => {
    const { ProcessingQueue } = db.entities('cv.sorting');
    const metadata = ProcessingQueue.elements;

    expect(metadata.userId).toBeDefined();
    expect(metadata.status).toBeDefined();
    expect(metadata.totalFiles).toBeDefined();
    expect(metadata.processedCount).toBeDefined();
    expect(metadata.autoCreatedCount).toBeDefined();
    expect(metadata.reviewRequiredCount).toBeDefined();
    expect(metadata.failedCount).toBeDefined();
    expect(metadata.currentFile).toBeDefined();
    expect(metadata.autoCreateThreshold).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/schema-validation.test.js`
Expected: FAIL with "Cannot destructure property 'ProcessingQueue' of undefined"

**Step 3: Add ProcessingQueue entity**

In `db/schema.cds`, add after CVDocuments:
```cds
/**
 * Batch CV Processing Queue
 * Tracks batch upload jobs with progress and results
 */
entity ProcessingQueue : cuid, managed {
    userId                 : String(255) not null;
    status                 : String enum {
        queued;
        processing;
        completed;
        partial;
        failed;
    } default 'queued';
    totalFiles             : Integer default 0;
    processedCount         : Integer default 0;
    autoCreatedCount       : Integer default 0;
    reviewRequiredCount    : Integer default 0;
    failedCount            : Integer default 0;
    currentFile            : String(500);
    autoCreateThreshold    : Decimal(5,2) default 85.0;
    startedAt              : Timestamp;
    completedAt            : Timestamp;
    estimatedTimeRemaining : Integer;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/schema-validation.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add db/schema.cds test/schema-validation.test.js
git commit -m "feat(db): add ProcessingQueue entity for batch uploads

- Track batch job status (queued, processing, completed, partial, failed)
- Store progress counters (total, processed, auto-created, review required, failed)
- Support configurable auto-create threshold (default 85%)

🤖 Generated with Claude Code"
```

---

## Phase 2: ML Service Structured Extraction

### Task 3: Create Structured Extraction Endpoint

**Files:**
- Create: `python-ml-service/app/api/routes/ocr_extraction.py`
- Modify: `python-ml-service/app/main.py` (register router)
- Test: `python-ml-service/tests/test_ocr_extraction.py`

**Step 1: Write the failing test**

Create `python-ml-service/tests/test_ocr_extraction.py`:
```python
"""
Tests for OCR structured data extraction.
"""
import pytest
from fastapi.testclient import TestClient


def test_extract_structured_endpoint_exists(client: TestClient):
    """Test that extract-structured endpoint exists."""
    response = client.post(
        "/api/ocr/extract-structured",
        json={
            "text": "John Doe\nSoftware Engineer\njohn@example.com\n+1234567890",
            "language": "en"
        }
    )
    assert response.status_code in [200, 422], "Endpoint should exist"


def test_extract_personal_info_tier1(client: TestClient):
    """Test extraction of tier 1 personal information."""
    sample_text = """
    John Michael Doe
    New York, NY, USA
    Email: john.doe@example.com
    Phone: +1 (555) 123-4567
    """

    response = client.post(
        "/api/ocr/extract-structured",
        json={"text": sample_text, "language": "en"}
    )

    assert response.status_code == 200
    data = response.json()

    assert "tier1" in data
    assert "firstName" in data["tier1"]
    assert data["tier1"]["firstName"]["value"] == "John"
    assert data["tier1"]["firstName"]["confidence"] > 80

    assert "email" in data["tier1"]
    assert "john.doe@example.com" in data["tier1"]["email"]["value"]

    assert "overall_confidence" in data
    assert data["overall_confidence"] > 0


def test_extract_work_history_tier2(client: TestClient):
    """Test extraction of tier 2 work history."""
    sample_text = """
    WORK EXPERIENCE

    Senior Software Engineer
    TechCorp Inc.
    January 2020 - Present

    Software Developer
    StartupXYZ
    June 2018 - December 2019
    """

    response = client.post(
        "/api/ocr/extract-structured",
        json={"text": sample_text, "language": "en"}
    )

    assert response.status_code == 200
    data = response.json()

    assert "tier2" in data
    assert "workHistory" in data["tier2"]
    assert len(data["tier2"]["workHistory"]) >= 1
```

**Step 2: Run test to verify it fails**

Run: `cd python-ml-service && source venv/bin/activate && pytest tests/test_ocr_extraction.py -v`
Expected: FAIL with "404 Not Found"

**Step 3: Create structured extraction endpoint**

Create `python-ml-service/app/api/routes/ocr_extraction.py`:
```python
"""
Structured data extraction from OCR text.
"""
import logging
import re
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/ocr", tags=["OCR Extraction"])
logger = logging.getLogger(__name__)


class FieldExtraction(BaseModel):
    """Single field extraction result."""
    value: Optional[str] = None
    confidence: float = Field(ge=0, le=100)
    source: Optional[str] = None


class ExtractStructuredRequest(BaseModel):
    """Request model for structured extraction."""
    text: str = Field(..., description="Raw OCR text")
    language: str = Field("en", description="Language code")
    extraction_mode: str = Field("tiered", description="Extraction mode")


class ExtractStructuredResponse(BaseModel):
    """Response model for structured extraction."""
    overall_confidence: float
    tier1: Dict[str, FieldExtraction]
    tier2: Dict[str, Any]
    tier3: Dict[str, Any]
    raw_sections: Dict[str, str]


@router.post("/extract-structured", response_model=ExtractStructuredResponse)
async def extract_structured_data(request: ExtractStructuredRequest) -> Dict[str, Any]:
    """
    Extract structured candidate data from OCR text.

    Tier 1: Essential personal info (name, email, phone, location)
    Tier 2: Professional background (work history, education, skills)
    Tier 3: Additional details (manual entry recommended)
    """
    try:
        # Extract tier 1 data
        tier1 = extract_tier1_personal_info(request.text)

        # Extract tier 2 data
        tier2 = extract_tier2_professional(request.text)

        # Tier 3 is mostly null (manual entry)
        tier3 = {
            "references": {"value": None, "confidence": 0},
            "certifications": []
        }

        # Extract raw sections
        raw_sections = extract_raw_sections(request.text)

        # Calculate overall confidence
        confidences = []
        for field_data in tier1.values():
            if isinstance(field_data, dict) and "confidence" in field_data:
                confidences.append(field_data["confidence"])

        overall_confidence = sum(confidences) / len(confidences) if confidences else 0

        return {
            "overall_confidence": overall_confidence,
            "tier1": tier1,
            "tier2": tier2,
            "tier3": tier3,
            "raw_sections": raw_sections
        }

    except Exception as e:
        logger.error(f"Structured extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def extract_tier1_personal_info(text: str) -> Dict[str, FieldExtraction]:
    """Extract tier 1 essential personal information."""
    lines = text.strip().split('\n')
    tier1 = {}

    # Extract name from first non-empty line
    for i, line in enumerate(lines[:5]):
        line = line.strip()
        if line and len(line.split()) >= 2:
            # Assume first line with 2+ words is name
            words = line.split()
            tier1["firstName"] = {
                "value": words[0],
                "confidence": 98,
                "source": f"line_{i+1}"
            }
            tier1["lastName"] = {
                "value": words[-1],
                "confidence": 95,
                "source": f"line_{i+1}"
            }
            break

    # Extract email
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    email_match = re.search(email_pattern, text, re.IGNORECASE)
    if email_match:
        tier1["email"] = {
            "value": email_match.group(),
            "confidence": 95,
            "source": "regex_match"
        }

    # Extract phone
    phone_pattern = r'[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]'
    phone_match = re.search(phone_pattern, text)
    if phone_match:
        tier1["phone"] = {
            "value": phone_match.group().strip(),
            "confidence": 88,
            "source": "regex_match"
        }

    # Extract location (simple version - look for City, State/Country patterns)
    location_pattern = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2}|[A-Z][a-z]+)'
    location_match = re.search(location_pattern, text)
    if location_match:
        tier1["location"] = {
            "value": location_match.group(),
            "confidence": 85,
            "source": "regex_match"
        }

    return tier1


def extract_tier2_professional(text: str) -> Dict[str, Any]:
    """Extract tier 2 professional background."""
    tier2 = {
        "workHistory": [],
        "education": [],
        "skills": []
    }

    # Extract work history section
    work_pattern = r'(?:WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT\s+HISTORY)(.*?)(?=EDUCATION|SKILLS|$)'
    work_match = re.search(work_pattern, text, re.IGNORECASE | re.DOTALL)

    if work_match:
        work_text = work_match.group(1)
        # Simple extraction: look for company/role patterns
        # This is a basic implementation - real version would be more sophisticated
        lines = work_text.strip().split('\n')
        current_job = {}
        for line in lines:
            line = line.strip()
            if line and len(line) > 5:
                # Heuristic: lines with dates are likely positions
                if re.search(r'\d{4}', line):
                    if current_job:
                        tier2["workHistory"].append(current_job)
                    current_job = {"role": line, "confidence": 75}

        if current_job:
            tier2["workHistory"].append(current_job)

    return tier2


def extract_raw_sections(text: str) -> Dict[str, str]:
    """Extract raw text sections for reference."""
    sections = {}

    # Extract experience section
    exp_match = re.search(
        r'(?:WORK\s+EXPERIENCE|EXPERIENCE)(.*?)(?=EDUCATION|SKILLS|$)',
        text,
        re.IGNORECASE | re.DOTALL
    )
    if exp_match:
        sections["experience_section"] = exp_match.group(1).strip()

    # Extract education section
    edu_match = re.search(
        r'EDUCATION(.*?)(?=SKILLS|CERTIFICATIONS|$)',
        text,
        re.IGNORECASE | re.DOTALL
    )
    if edu_match:
        sections["education_section"] = edu_match.group(1).strip()

    return sections
```

**Step 4: Register router in main.py**

In `python-ml-service/app/main.py`, add import and include router:
```python
from app.api.routes import ocr_extraction

# ... existing code ...

# Include routers
app.include_router(ocr_extraction.router)
```

**Step 5: Run test to verify it passes**

Run: `cd python-ml-service && pytest tests/test_ocr_extraction.py -v`
Expected: PASS (all 3 tests)

**Step 6: Commit**

```bash
git add python-ml-service/app/api/routes/ocr_extraction.py \
        python-ml-service/app/main.py \
        python-ml-service/tests/test_ocr_extraction.py
git commit -m "feat(ml): add structured OCR data extraction endpoint

- POST /api/ocr/extract-structured endpoint
- Tier 1: Extract name, email, phone, location with high confidence
- Tier 2: Extract work history, education sections
- Tier 3: Flag for manual entry
- Return per-field confidence scores and overall confidence

🤖 Generated with Claude Code"
```

---

### Task 4: Enhance /api/ocr/process to Call Structured Extraction

**Files:**
- Modify: `python-ml-service/app/api/routes/ocr.py`
- Test: `python-ml-service/tests/test_ocr.py`

**Step 1: Write the failing test**

Add to `python-ml-service/tests/test_ocr.py`:
```python
def test_process_with_structured_extraction():
    """Test OCR process endpoint with extract_structured=true."""
    import base64
    from PIL import Image
    import io

    # Create simple test image
    img = Image.new('RGB', (400, 100), color='white')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_b64 = base64.b64encode(img_bytes.getvalue()).decode()

    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)

    response = client.post(
        "/api/ocr/process",
        json={
            "file_content": img_b64,
            "file_type": "png",
            "language": "en",
            "extract_structured": True
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert "structured_data" in data
    assert data["structured_data"] is not None
```

**Step 2: Run test to verify it fails**

Run: `cd python-ml-service && pytest tests/test_ocr.py::test_process_with_structured_extraction -v`
Expected: FAIL with "KeyError: 'structured_data'" or assertion error

**Step 3: Modify process endpoint to include structured extraction**

In `python-ml-service/app/api/routes/ocr.py`, update the `process_document` function:
```python
# Add import at top
from app.api.routes.ocr_extraction import extract_structured_data, ExtractStructuredRequest

# Modify the process_document function
@router.post("/process", response_model=OCRResponse)
async def process_document(request: ProcessBase64Request) -> Dict[str, Any]:
    """
    Process a document with OCR using base64-encoded content.
    """
    from app.main import get_ocr_processor

    processor = get_ocr_processor()
    if processor is None:
        raise HTTPException(status_code=503, detail="OCR processor not initialized")

    try:
        # Decode base64 content
        import base64
        file_content = base64.b64decode(request.file_content)

        # Process document
        result = processor.extract_text(
            file_content=file_content,
            file_type=request.file_type,
            language=request.language
        )

        # Extract structured data if requested
        structured_data = None
        if request.extract_structured and result.get('text'):
            extraction_request = ExtractStructuredRequest(
                text=result['text'],
                language=request.language
            )
            structured_result = await extract_structured_data(extraction_request)
            structured_data = structured_result

        return {
            "text": result['text'],
            "pages": result['pages'],
            "confidence": result['confidence'],
            "method": result['method'],
            "language": result['language'],
            "text_length": result['text_length'],
            "content_hash": result['content_hash'],
            "structured_data": structured_data
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
```

**Step 4: Run test to verify it passes**

Run: `cd python-ml-service && pytest tests/test_ocr.py::test_process_with_structured_extraction -v`
Expected: PASS

**Step 5: Commit**

```bash
git add python-ml-service/app/api/routes/ocr.py \
        python-ml-service/tests/test_ocr.py
git commit -m "feat(ml): integrate structured extraction with OCR process

- Add extract_structured parameter to /api/ocr/process
- Automatically extract structured data when extract_structured=true
- Return both raw OCR text and structured extraction in one call

🤖 Generated with Claude Code"
```

---

## Phase 3: CAP Service Actions

### Task 5: Add Service Actions to services.cds

**Files:**
- Modify: `srv/services.cds` (add new actions)
- Test: Manual verification after CDS compilation

**Step 1: Add uploadAndProcessCV action**

In `srv/services.cds`, add after existing actions in CVSortingService:
```cds
    // ============================================
    // OCR PROCESSING ACTIONS
    // ============================================

    /**
     * Upload and process single CV with OCR
     */
    action uploadAndProcessCV(
        fileName: String not null,
        fileContent: LargeBinary not null,
        mediaType: String not null,
        autoCreate: Boolean default false
    ) returns {
        documentId: UUID;
        ocrStatus: String;
        confidence: Decimal;
        extractedData: String;
        candidateId: UUID;
        requiresReview: Boolean;
    };

    /**
     * Upload batch of CVs for processing
     */
    action uploadBatchCVs(
        files: array of {
            fileName: String;
            fileContent: LargeBinary;
            mediaType: String;
        },
        autoCreateThreshold: Decimal default 85.0
    ) returns {
        queueId: UUID;
        totalFiles: Integer;
        estimatedTime: Integer;
    };

    /**
     * Get batch processing progress
     */
    function getBatchProgress(queueId: UUID not null) returns {
        status: String;
        totalFiles: Integer;
        processed: Integer;
        autoCreated: Integer;
        reviewRequired: Integer;
        failed: Integer;
        currentFile: String;
        estimatedTimeRemaining: Integer;
    };

    /**
     * Review and create candidate from low-confidence extraction
     */
    action reviewAndCreateCandidate(
        documentId: UUID not null,
        editedData: String not null
    ) returns {
        candidateId: UUID;
        linkedSkillsCount: Integer;
        embeddingGenerated: Boolean;
    };
```

**Step 2: Compile CDS to verify syntax**

Run: `cds compile srv/services.cds`
Expected: No errors, successful compilation

**Step 3: Commit**

```bash
git add srv/services.cds
git commit -m "feat(srv): add OCR processing actions to service

- uploadAndProcessCV: Single CV upload with OCR
- uploadBatchCVs: Batch upload with configurable threshold
- getBatchProgress: Poll batch processing status
- reviewAndCreateCandidate: Manual review and confirm

🤖 Generated with Claude Code"
```

---

### Task 6: Update ML Client with OCR Methods

**Files:**
- Modify: `srv/lib/ml-client.js`
- Test: `test/ml-client.test.js`

**Step 1: Write the failing test**

Create or update `test/ml-client.test.js`:
```javascript
const { MLClient } = require('../srv/lib/ml-client');

describe('MLClient OCR Methods', () => {
    let client;

    beforeEach(() => {
        client = new MLClient('http://localhost:8000');
    });

    test('processOCRWithStructured should exist', () => {
        expect(typeof client.processOCRWithStructured).toBe('function');
    });

    test('processOCRWithStructured should format request correctly', async () => {
        // Mock fetch
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    text: 'Sample text',
                    confidence: 85,
                    structured_data: { tier1: {} }
                })
            })
        );

        const result = await client.processOCRWithStructured({
            fileContent: 'base64content',
            fileType: 'pdf',
            language: 'en'
        });

        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/ocr/process',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('extract_structured')
            })
        );

        expect(result.structured_data).toBeDefined();
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/ml-client.test.js`
Expected: FAIL with "client.processOCRWithStructured is not a function"

**Step 3: Add processOCRWithStructured method to MLClient**

In `srv/lib/ml-client.js`, add after the existing processOCR method:
```javascript
    /**
     * Process document with OCR and structured extraction
     */
    async processOCRWithStructured({ fileContent, fileType, language }) {
        return this.request('/api/ocr/process', 'POST', {
            file_content: fileContent,
            file_type: fileType,
            language: language || 'en',
            extract_structured: true
        });
    }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/ml-client.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add srv/lib/ml-client.js test/ml-client.test.js
git commit -m "feat(srv): add processOCRWithStructured method to ML client

- New method calls /api/ocr/process with extract_structured=true
- Returns both raw OCR text and structured field extraction
- Add comprehensive tests for OCR methods

🤖 Generated with Claude Code"
```

---

### Task 7: Implement uploadAndProcessCV Handler

**Files:**
- Create: `srv/handlers/ocr-handler.js`
- Modify: `srv/cv-sorting-service.js` (import and use handler)
- Test: `test/ocr-handler.test.js`

**Step 1: Write the failing test**

Create `test/ocr-handler.test.js`:
```javascript
const cds = require('@sap/cds');

describe('OCR Handler - uploadAndProcessCV', () => {
    let CVSortingService;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
    });

    test('uploadAndProcessCV should validate file format', async () => {
        const req = {
            data: {
                fileName: 'test.txt',
                fileContent: Buffer.from('test'),
                mediaType: 'text/plain',
                autoCreate: false
            }
        };

        await expect(
            CVSortingService.uploadAndProcessCV(req.data)
        ).rejects.toThrow(/unsupported/i);
    });

    test('uploadAndProcessCV should process valid PDF', async () => {
        // Mock ML service
        const mockMLClient = {
            processOCRWithStructured: jest.fn().mockResolvedValue({
                text: 'John Doe\njohn@example.com',
                confidence: 90,
                structured_data: {
                    overall_confidence: 90,
                    tier1: {
                        firstName: { value: 'John', confidence: 95 },
                        email: { value: 'john@example.com', confidence: 92 }
                    }
                }
            })
        };

        const req = {
            data: {
                fileName: 'resume.pdf',
                fileContent: Buffer.from('fake pdf content'),
                mediaType: 'application/pdf',
                autoCreate: false
            }
        };

        const result = await CVSortingService.uploadAndProcessCV(req.data);

        expect(result.documentId).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.extractedData).toBeDefined();
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/ocr-handler.test.js`
Expected: FAIL with "uploadAndProcessCV is not a function" or handler not found

**Step 3: Create OCR handler**

Create `srv/handlers/ocr-handler.js`:
```javascript
/**
 * OCR Processing Handlers
 */
const cds = require('@sap/cds');
const { createMLClient } = require('../lib/ml-client');

const SUPPORTED_FORMATS = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Upload and process single CV with OCR
 */
async function uploadAndProcessCV(req) {
    const { fileName, fileContent, mediaType, autoCreate } = req.data;
    const LOG = cds.log('ocr-handler');

    // Validate file format
    if (!SUPPORTED_FORMATS.includes(mediaType)) {
        req.reject(400, `Unsupported file format: ${mediaType}. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
    }

    // Validate file size
    if (fileContent.length > MAX_FILE_SIZE) {
        req.reject(400, `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const db = await cds.connect.to('db');
    const { CVDocuments, Candidates } = db.entities('cv.sorting');

    try {
        // Create document record
        const documentId = cds.utils.uuid();
        await INSERT.into(CVDocuments).entries({
            ID: documentId,
            fileName,
            mediaType,
            fileContent,
            uploadedBy: req.user.id,
            ocrStatus: 'processing'
        });

        LOG.info(`Created document ${documentId}, starting OCR...`);

        // Convert to base64 for ML service
        const fileContentB64 = fileContent.toString('base64');
        const fileType = mediaType.split('/')[1];

        // Call ML service
        const mlClient = createMLClient();
        const ocrResult = await mlClient.processOCRWithStructured({
            fileContent: fileContentB64,
            fileType,
            language: 'en'
        });

        LOG.info(`OCR completed with confidence: ${ocrResult.confidence}%`);

        // Update document with OCR results
        await UPDATE(CVDocuments)
            .set({
                extractedText: ocrResult.text,
                structuredData: JSON.stringify(ocrResult.structured_data),
                ocrConfidence: ocrResult.confidence,
                ocrMethod: ocrResult.method,
                ocrStatus: 'completed',
                ocrProcessedAt: new Date()
            })
            .where({ ID: documentId });

        // Check if auto-create threshold met
        const threshold = 85.0;
        let candidateId = null;
        let requiresReview = true;

        if (autoCreate && ocrResult.confidence >= threshold) {
            // Auto-create candidate
            candidateId = await createCandidateFromExtraction(
                ocrResult.structured_data,
                documentId,
                db
            );
            requiresReview = false;
            LOG.info(`Auto-created candidate ${candidateId}`);
        } else if (ocrResult.confidence < threshold) {
            // Mark for review
            await UPDATE(CVDocuments)
                .set({ ocrStatus: 'review_required' })
                .where({ ID: documentId });
            LOG.info(`Document requires review (confidence: ${ocrResult.confidence}%)`);
        }

        return {
            documentId,
            ocrStatus: requiresReview ? 'review_required' : 'completed',
            confidence: ocrResult.confidence,
            extractedData: JSON.stringify(ocrResult.structured_data),
            candidateId,
            requiresReview
        };

    } catch (error) {
        LOG.error(`OCR processing failed: ${error.message}`);

        // Update document with error status
        await UPDATE(CVDocuments)
            .set({ ocrStatus: 'failed' })
            .where({ ID: documentId });

        req.error(500, `OCR processing failed: ${error.message}`);
    }
}

/**
 * Create candidate from structured extraction data
 */
async function createCandidateFromExtraction(structuredData, documentId, db) {
    const { Candidates } = db.entities('cv.sorting');
    const tier1 = structuredData.tier1 || {};

    const candidateId = cds.utils.uuid();
    await INSERT.into(Candidates).entries({
        ID: candidateId,
        firstName: tier1.firstName?.value,
        lastName: tier1.lastName?.value,
        email: tier1.email?.value,
        phone: tier1.phone?.value,
        city: tier1.location?.value?.split(',')[0]?.trim(),
        country: tier1.location?.value?.split(',')[1]?.trim(),
        status_code: 'new'
    });

    // Link document to candidate
    const { CVDocuments } = db.entities('cv.sorting');
    await UPDATE(CVDocuments)
        .set({ candidate_ID: candidateId })
        .where({ ID: documentId });

    return candidateId;
}

module.exports = {
    uploadAndProcessCV,
    createCandidateFromExtraction
};
```

**Step 4: Wire up handler in service**

In `srv/cv-sorting-service.js`, add:
```javascript
const ocrHandler = require('./handlers/ocr-handler');

module.exports = cds.service.impl(async function() {
    // ... existing code ...

    // OCR Actions
    this.on('uploadAndProcessCV', ocrHandler.uploadAndProcessCV);
});
```

**Step 5: Run test to verify it passes**

Run: `npm test -- test/ocr-handler.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add srv/handlers/ocr-handler.js \
        srv/cv-sorting-service.js \
        test/ocr-handler.test.js
git commit -m "feat(srv): implement uploadAndProcessCV handler

- Validate file format (PDF, PNG, JPG, TIFF) and size (<10MB)
- Create CVDocument record with status='processing'
- Call ML service for OCR + structured extraction
- Auto-create candidate if confidence ≥85% and autoCreate=true
- Mark for review if confidence <85%
- Handle errors gracefully with proper status updates

🤖 Generated with Claude Code"
```

---

## Phase 4: Batch Processing & Review

### Task 8: Implement Batch Upload Handler

**Files:**
- Modify: `srv/handlers/ocr-handler.js`
- Modify: `srv/cv-sorting-service.js`
- Test: `test/batch-upload.test.js`

**Step 1: Write the failing test**

Create `test/batch-upload.test.js`:
```javascript
const cds = require('@sap/cds');

describe('Batch Upload Handler', () => {
    let CVSortingService;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
    });

    test('uploadBatchCVs should create processing queue', async () => {
        const req = {
            data: {
                files: [
                    {
                        fileName: 'cv1.pdf',
                        fileContent: Buffer.from('fake pdf 1'),
                        mediaType: 'application/pdf'
                    },
                    {
                        fileName: 'cv2.pdf',
                        fileContent: Buffer.from('fake pdf 2'),
                        mediaType: 'application/pdf'
                    }
                ],
                autoCreateThreshold: 85.0
            }
        };

        const result = await CVSortingService.uploadBatchCVs(req.data);

        expect(result.queueId).toBeDefined();
        expect(result.totalFiles).toBe(2);
        expect(result.estimatedTime).toBeGreaterThan(0);
    });

    test('getBatchProgress should return progress', async () => {
        // First create a queue
        const uploadResult = await CVSortingService.uploadBatchCVs({
            files: [{
                fileName: 'cv1.pdf',
                fileContent: Buffer.from('test'),
                mediaType: 'application/pdf'
            }],
            autoCreateThreshold: 85.0
        });

        const progress = await CVSortingService.getBatchProgress(uploadResult.queueId);

        expect(progress.status).toBeDefined();
        expect(progress.totalFiles).toBe(1);
        expect(progress.processed).toBeGreaterThanOrEqual(0);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/batch-upload.test.js`
Expected: FAIL with handler not implemented

**Step 3: Add batch handlers**

In `srv/handlers/ocr-handler.js`, add:
```javascript
/**
 * Upload batch of CVs for processing
 */
async function uploadBatchCVs(req) {
    const { files, autoCreateThreshold } = req.data;
    const LOG = cds.log('ocr-handler');

    if (!files || files.length === 0) {
        req.reject(400, 'No files provided');
    }

    const db = await cds.connect.to('db');
    const { ProcessingQueue } = db.entities('cv.sorting');

    // Create queue record
    const queueId = cds.utils.uuid();
    await INSERT.into(ProcessingQueue).entries({
        ID: queueId,
        userId: req.user.id,
        status: 'queued',
        totalFiles: files.length,
        processedCount: 0,
        autoCreatedCount: 0,
        reviewRequiredCount: 0,
        failedCount: 0,
        autoCreateThreshold: autoCreateThreshold || 85.0,
        startedAt: new Date()
    });

    LOG.info(`Created batch queue ${queueId} with ${files.length} files`);

    // Process files sequentially in background
    setImmediate(() => processBatchQueue(queueId, files, autoCreateThreshold, req.user.id));

    // Estimate time (8 seconds per file)
    const estimatedTime = files.length * 8;

    return {
        queueId,
        totalFiles: files.length,
        estimatedTime
    };
}

/**
 * Process batch queue sequentially
 */
async function processBatchQueue(queueId, files, autoCreateThreshold, userId) {
    const LOG = cds.log('batch-processor');
    const db = await cds.connect.to('db');
    const { ProcessingQueue } = db.entities('cv.sorting');

    await UPDATE(ProcessingQueue)
        .set({ status: 'processing' })
        .where({ ID: queueId });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        LOG.info(`Processing file ${i + 1}/${files.length}: ${file.fileName}`);

        await UPDATE(ProcessingQueue)
            .set({ currentFile: file.fileName })
            .where({ ID: queueId });

        try {
            // Create mock request for uploadAndProcessCV
            const mockReq = {
                data: {
                    fileName: file.fileName,
                    fileContent: file.fileContent,
                    mediaType: file.mediaType,
                    autoCreate: true
                },
                user: { id: userId },
                reject: (code, msg) => { throw new Error(msg); },
                error: (code, msg) => { throw new Error(msg); }
            };

            const result = await uploadAndProcessCV(mockReq);

            // Update queue counters
            const updates = { processedCount: i + 1 };
            if (result.candidateId) {
                updates.autoCreatedCount = await SELECT.from('cv.sorting.ProcessingQueue')
                    .where({ ID: queueId })
                    .then(r => (r[0]?.autoCreatedCount || 0) + 1);
            } else if (result.requiresReview) {
                updates.reviewRequiredCount = await SELECT.from('cv.sorting.ProcessingQueue')
                    .where({ ID: queueId })
                    .then(r => (r[0]?.reviewRequiredCount || 0) + 1);
            }

            await UPDATE(ProcessingQueue).set(updates).where({ ID: queueId });

        } catch (error) {
            LOG.error(`Failed to process ${file.fileName}: ${error.message}`);

            const failedCount = await SELECT.from('cv.sorting.ProcessingQueue')
                .where({ ID: queueId })
                .then(r => (r[0]?.failedCount || 0) + 1);

            await UPDATE(ProcessingQueue)
                .set({
                    failedCount,
                    processedCount: i + 1
                })
                .where({ ID: queueId });
        }
    }

    // Mark queue as completed
    await UPDATE(ProcessingQueue)
        .set({
            status: 'completed',
            completedAt: new Date(),
            currentFile: null
        })
        .where({ ID: queueId });

    LOG.info(`Batch queue ${queueId} completed`);
}

/**
 * Get batch processing progress
 */
async function getBatchProgress(req) {
    const { queueId } = req.data;
    const db = await cds.connect.to('db');

    const queue = await SELECT.one.from('cv.sorting.ProcessingQueue')
        .where({ ID: queueId });

    if (!queue) {
        req.reject(404, `Queue ${queueId} not found`);
    }

    // Calculate estimated time remaining
    let estimatedTimeRemaining = 0;
    if (queue.status === 'processing') {
        const remaining = queue.totalFiles - queue.processedCount;
        estimatedTimeRemaining = remaining * 8; // 8 seconds per file
    }

    return {
        status: queue.status,
        totalFiles: queue.totalFiles,
        processed: queue.processedCount,
        autoCreated: queue.autoCreatedCount,
        reviewRequired: queue.reviewRequiredCount,
        failed: queue.failedCount,
        currentFile: queue.currentFile,
        estimatedTimeRemaining
    };
}

module.exports = {
    uploadAndProcessCV,
    uploadBatchCVs,
    getBatchProgress,
    createCandidateFromExtraction
};
```

**Step 4: Wire up handlers**

In `srv/cv-sorting-service.js`:
```javascript
    this.on('uploadBatchCVs', ocrHandler.uploadBatchCVs);
    this.on('getBatchProgress', ocrHandler.getBatchProgress);
```

**Step 5: Run test to verify it passes**

Run: `npm test -- test/batch-upload.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add srv/handlers/ocr-handler.js \
        srv/cv-sorting-service.js \
        test/batch-upload.test.js
git commit -m "feat(srv): implement batch CV upload with queue

- uploadBatchCVs creates ProcessingQueue record
- Sequential processing with real-time progress updates
- Track auto-created, review required, and failed counts
- getBatchProgress returns current status and estimated time
- Background processing using setImmediate

🤖 Generated with Claude Code"
```

---

## Phase 5: Fiori UI Components

### Task 9: Create Upload Tab in cv-management App

**Files:**
- Create: `app/cv-management/webapp/view/Upload.view.xml`
- Create: `app/cv-management/webapp/controller/Upload.controller.js`
- Modify: `app/cv-management/webapp/manifest.json` (add route)
- Test: Manual testing in browser

**Step 1: Create Upload view**

Create `app/cv-management/webapp/view/Upload.view.xml`:
```xml
<mvc:View
    controllerName="cvmanagement.controller.Upload"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:l="sap.ui.layout"
    xmlns:f="sap.ui.layout.form"
    displayBlock="true">

    <Page
        id="uploadPage"
        title="{i18n>uploadTitle}"
        showNavButton="false">

        <content>
            <!-- Mode Toggle -->
            <Bar>
                <contentLeft>
                    <SegmentedButton selectedKey="{view>/uploadMode}">
                        <items>
                            <SegmentedButtonItem key="single" text="Single Upload" />
                            <SegmentedButtonItem key="batch" text="Batch Upload" />
                        </items>
                    </SegmentedButton>
                </contentLeft>
                <contentRight>
                    <Text text="Auto-create threshold: {view>/autoCreateThreshold}%" />
                    <Slider
                        value="{view>/autoCreateThreshold}"
                        min="60"
                        max="95"
                        step="5"
                        width="200px"
                        enableTickmarks="true"
                        visible="{= ${view>/uploadMode} === 'batch'}" />
                </contentRight>
            </Bar>

            <!-- Single Upload View -->
            <l:Splitter
                id="splitContainer"
                visible="{= ${view>/uploadMode} === 'single' &amp;&amp; ${view>/documentLoaded}}"
                orientation="Horizontal"
                height="100%">

                <!-- Left: CV Preview -->
                <l:contentAreas>
                    <VBox class="sapUiSmallMargin">
                        <Text text="CV Preview" class="sapUiTinyMarginBottom" />
                        <FlexBox
                            id="cvPreviewContainer"
                            height="600px"
                            width="100%"
                            justifyContent="Center"
                            alignItems="Center"
                            backgroundDesign="Solid">
                            <Image
                                id="cvPreviewImage"
                                src="{view>/previewUrl}"
                                width="100%"
                                visible="{= ${view>/fileType} !== 'pdf'}" />
                            <HTML
                                id="cvPreviewPdf"
                                content="{view>/pdfContent}"
                                visible="{= ${view>/fileType} === 'pdf'}" />
                        </FlexBox>
                    </VBox>

                    <!-- Right: Extracted Data Form -->
                    <ScrollContainer height="100%" vertical="true">
                        <VBox class="sapUiSmallMargin">
                            <ObjectHeader
                                title="Extracted Data"
                                number="{view>/confidence}"
                                numberUnit="%"
                                numberState="{= ${view>/confidence} >= 85 ? 'Success' : ${view>/confidence} >= 70 ? 'Warning' : 'Error'}" />

                            <!-- Tier 1: Personal Information -->
                            <Panel
                                headerText="Personal Information (Tier 1)"
                                expanded="true"
                                class="sapUiTinyMargin">
                                <f:SimpleForm
                                    editable="true"
                                    layout="ResponsiveGridLayout">
                                    <f:content>
                                        <Label text="First Name" />
                                        <HBox>
                                            <Input
                                                value="{view>/tier1/firstName/value}"
                                                width="80%" />
                                            <ObjectStatus
                                                text="{view>/tier1/firstName/confidence}%"
                                                state="{= ${view>/tier1/firstName/confidence} >= 90 ? 'Success' : 'Warning'}"
                                                class="sapUiTinyMarginBegin" />
                                        </HBox>

                                        <Label text="Last Name" />
                                        <HBox>
                                            <Input
                                                value="{view>/tier1/lastName/value}"
                                                width="80%" />
                                            <ObjectStatus
                                                text="{view>/tier1/lastName/confidence}%"
                                                state="{= ${view>/tier1/lastName/confidence} >= 90 ? 'Success' : 'Warning'}"
                                                class="sapUiTinyMarginBegin" />
                                        </HBox>

                                        <Label text="Email" />
                                        <HBox>
                                            <Input
                                                value="{view>/tier1/email/value}"
                                                width="80%"
                                                type="Email" />
                                            <ObjectStatus
                                                text="{view>/tier1/email/confidence}%"
                                                state="{= ${view>/tier1/email/confidence} >= 90 ? 'Success' : 'Warning'}"
                                                class="sapUiTinyMarginBegin" />
                                        </HBox>

                                        <Label text="Phone" />
                                        <HBox>
                                            <Input
                                                value="{view>/tier1/phone/value}"
                                                width="80%"
                                                type="Tel" />
                                            <ObjectStatus
                                                text="{view>/tier1/phone/confidence}%"
                                                state="{= ${view>/tier1/phone/confidence} >= 90 ? 'Success' : 'Warning'}"
                                                class="sapUiTinyMarginBegin" />
                                        </HBox>

                                        <Label text="Location" />
                                        <HBox>
                                            <Input
                                                value="{view>/tier1/location/value}"
                                                width="80%" />
                                            <ObjectStatus
                                                text="{view>/tier1/location/confidence}%"
                                                state="{= ${view>/tier1/location/confidence} >= 90 ? 'Success' : 'Warning'}"
                                                class="sapUiTinyMarginBegin" />
                                        </HBox>
                                    </f:content>
                                </f:SimpleForm>
                            </Panel>

                            <!-- Tier 2: Professional Background -->
                            <Panel
                                headerText="Professional Background (Tier 2)"
                                expanded="false"
                                class="sapUiTinyMargin">
                                <Text text="Work history and education will be added manually after candidate creation." />
                            </Panel>

                            <!-- Action Buttons -->
                            <Toolbar>
                                <ToolbarSpacer />
                                <Button
                                    text="Cancel"
                                    press=".onCancelUpload" />
                                <Button
                                    text="Create Candidate"
                                    type="Emphasized"
                                    press=".onCreateCandidate"
                                    enabled="{= ${view>/tier1/firstName/value} &amp;&amp; ${view>/tier1/email/value}}" />
                            </Toolbar>
                        </VBox>
                    </ScrollContainer>
                </l:contentAreas>
            </l:Splitter>

            <!-- File Uploader (shown when no document loaded) -->
            <VBox
                alignItems="Center"
                justifyContent="Center"
                class="sapUiLargeMargin"
                visible="{= !${view>/documentLoaded}}">
                <FileUploader
                    id="fileUploader"
                    name="cvFile"
                    uploadUrl=""
                    placeholder="Choose CV file (PDF, PNG, JPG, TIFF)"
                    fileType="pdf,png,jpg,jpeg,tiff"
                    maximumFileSize="10"
                    change=".onFileChange"
                    class="sapUiLargeMarginBottom" />
                <Text text="Maximum file size: 10 MB" class="sapUiTinyMarginTop" />
            </VBox>

            <!-- Batch Upload View -->
            <Panel
                visible="{= ${view>/uploadMode} === 'batch'}"
                class="sapUiSmallMargin">
                <headerToolbar>
                    <Toolbar>
                        <Title text="Batch Upload Queue" />
                        <ToolbarSpacer />
                        <Button
                            text="Start Processing"
                            type="Emphasized"
                            press=".onStartBatch"
                            enabled="{= ${view>/batchFiles}.length > 0 &amp;&amp; ${view>/batchStatus} !== 'processing'}" />
                    </Toolbar>
                </headerToolbar>

                <content>
                    <Upload​Set
                        id="batchUploadSet"
                        instantUpload="false"
                        uploadUrl=""
                        fileTypes="pdf,png,jpg,jpeg,tiff"
                        maxFileSize="10"
                        items="{view>/batchFiles}" />

                    <!-- Progress Section -->
                    <VBox
                        visible="{= ${view>/batchStatus} === 'processing' || ${view>/batchStatus} === 'completed'}"
                        class="sapUiSmallMargin">
                        <ProgressIndicator
                            percentValue="{= (${view>/batchProcessed} / ${view>/batchTotal}) * 100}"
                            displayValue="Processing {view>/batchProcessed} of {view>/batchTotal}"
                            state="Information" />

                        <HBox class="sapUiTinyMarginTop">
                            <VBox class="sapUiSmallMarginEnd">
                                <ObjectNumber
                                    number="{view>/batchAutoCreated}"
                                    unit="Auto-created"
                                    state="Success" />
                            </VBox>
                            <VBox class="sapUiSmallMarginEnd">
                                <ObjectNumber
                                    number="{view>/batchReviewRequired}"
                                    unit="Need Review"
                                    state="Warning" />
                            </VBox>
                            <VBox>
                                <ObjectNumber
                                    number="{view>/batchFailed}"
                                    unit="Failed"
                                    state="Error" />
                            </VBox>
                        </HBox>
                    </VBox>
                </content>
            </Panel>
        </content>
    </Page>
</mvc:View>
```

**Step 2: Create Upload controller**

Create `app/cv-management/webapp/controller/Upload.controller.js`:
```javascript
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("cvmanagement.controller.Upload", {

        onInit: function () {
            const viewModel = new JSONModel({
                uploadMode: "single",
                autoCreateThreshold: 85,
                documentLoaded: false,
                previewUrl: null,
                fileType: null,
                confidence: 0,
                tier1: {},
                tier2: {},
                batchFiles: [],
                batchStatus: "idle",
                batchTotal: 0,
                batchProcessed: 0,
                batchAutoCreated: 0,
                batchReviewRequired: 0,
                batchFailed: 0,
                currentQueueId: null
            });
            this.getView().setModel(viewModel, "view");
        },

        onFileChange: function (oEvent) {
            const file = oEvent.getParameter("files")[0];
            if (!file) return;

            MessageToast.show("Processing CV with OCR...");
            this._processFile(file);
        },

        _processFile: async function (file) {
            const viewModel = this.getView().getModel("view");

            try {
                // Read file as base64
                const fileContent = await this._readFileAsBase64(file);

                // Show preview
                if (file.type.startsWith("image/")) {
                    viewModel.setProperty("/previewUrl", URL.createObjectURL(file));
                    viewModel.setProperty("/fileType", "image");
                } else {
                    viewModel.setProperty("/fileType", "pdf");
                }

                // Call uploadAndProcessCV action
                const oModel = this.getView().getModel();
                const result = await oModel.callAction("/uploadAndProcessCV", {
                    fileName: file.name,
                    fileContent: fileContent,
                    mediaType: file.type,
                    autoCreate: false
                });

                // Parse extracted data
                const extractedData = JSON.parse(result.extractedData);

                viewModel.setProperty("/documentLoaded", true);
                viewModel.setProperty("/confidence", result.confidence);
                viewModel.setProperty("/tier1", extractedData.tier1 || {});
                viewModel.setProperty("/tier2", extractedData.tier2 || {});
                viewModel.setProperty("/documentId", result.documentId);

                MessageToast.show(`OCR completed with ${result.confidence}% confidence`);

            } catch (error) {
                MessageBox.error("Failed to process CV: " + error.message);
            }
        },

        _readFileAsBase64: function (file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        },

        onCreateCandidate: async function () {
            const viewModel = this.getView().getModel("view");
            const tier1 = viewModel.getProperty("/tier1");
            const documentId = viewModel.getProperty("/documentId");

            try {
                const oModel = this.getView().getModel();
                const result = await oModel.callAction("/reviewAndCreateCandidate", {
                    documentId: documentId,
                    editedData: JSON.stringify({ tier1, tier2: {} })
                });

                MessageBox.success(
                    `Candidate created successfully! ID: ${result.candidateId}`,
                    {
                        onClose: () => {
                            this.onCancelUpload();
                        }
                    }
                );

            } catch (error) {
                MessageBox.error("Failed to create candidate: " + error.message);
            }
        },

        onCancelUpload: function () {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/documentLoaded", false);
            viewModel.setProperty("/tier1", {});
            viewModel.setProperty("/confidence", 0);

            const fileUploader = this.byId("fileUploader");
            if (fileUploader) {
                fileUploader.clear();
            }
        },

        onStartBatch: async function () {
            const viewModel = this.getView().getModel("view");
            const uploadSet = this.byId("batchUploadSet");
            const items = uploadSet.getItems();

            if (items.length === 0) {
                MessageBox.warning("Please select files to upload");
                return;
            }

            // Prepare files array
            const files = [];
            for (const item of items) {
                const file = item.getFileObject();
                const fileContent = await this._readFileAsBase64(file);
                files.push({
                    fileName: file.name,
                    fileContent: fileContent,
                    mediaType: file.type
                });
            }

            try {
                const oModel = this.getView().getModel();
                const result = await oModel.callAction("/uploadBatchCVs", {
                    files: files,
                    autoCreateThreshold: viewModel.getProperty("/autoCreateThreshold")
                });

                viewModel.setProperty("/batchStatus", "processing");
                viewModel.setProperty("/batchTotal", result.totalFiles);
                viewModel.setProperty("/currentQueueId", result.queueId);

                MessageToast.show(`Batch processing started (${result.totalFiles} files)`);

                // Start polling for progress
                this._pollBatchProgress(result.queueId);

            } catch (error) {
                MessageBox.error("Failed to start batch: " + error.message);
            }
        },

        _pollBatchProgress: function (queueId) {
            const viewModel = this.getView().getModel("view");

            this._pollInterval = setInterval(async () => {
                try {
                    const oModel = this.getView().getModel();
                    const progress = await oModel.callFunction("/getBatchProgress", {
                        queueId: queueId
                    });

                    viewModel.setProperty("/batchProcessed", progress.processed);
                    viewModel.setProperty("/batchAutoCreated", progress.autoCreated);
                    viewModel.setProperty("/batchReviewRequired", progress.reviewRequired);
                    viewModel.setProperty("/batchFailed", progress.failed);

                    if (progress.status === "completed") {
                        clearInterval(this._pollInterval);
                        viewModel.setProperty("/batchStatus", "completed");
                        MessageToast.show("Batch processing completed!");
                    }
                } catch (error) {
                    clearInterval(this._pollInterval);
                    MessageBox.error("Failed to get progress: " + error.message);
                }
            }, 2000); // Poll every 2 seconds
        }
    });
});
```

**Step 3: Add route to manifest.json**

In `app/cv-management/webapp/manifest.json`, add route under routing/routes:
```json
{
    "name": "Upload",
    "pattern": "upload",
    "target": "Upload"
}
```

And add target under routing/targets:
```json
{
    "Upload": {
        "viewType": "XML",
        "viewName": "Upload",
        "viewId": "upload",
        "viewLevel": 1
    }
}
```

**Step 4: Manual test in browser**

Run: `npm start` and navigate to http://localhost:4004/cv-management/webapp/index.html#/upload
Expected: Upload page loads with file uploader

**Step 5: Commit**

```bash
git add app/cv-management/webapp/view/Upload.view.xml \
        app/cv-management/webapp/controller/Upload.controller.js \
        app/cv-management/webapp/manifest.json
git commit -m "feat(ui): add Upload tab to cv-management app

- Side-by-side layout: CV preview (left) + extracted data form (right)
- Single upload mode with OCR processing
- Batch upload mode with progress tracking
- Confidence badges for each field (green/yellow/red)
- Auto-create threshold slider for batch mode
- Real-time progress polling for batch processing

🤖 Generated with Claude Code"
```

---

## Phase 6: Testing & Integration

### Task 10: Add Integration Test

**Files:**
- Create: `test/integration/ocr-workflow.test.js`

**Step 1: Create integration test**

Create `test/integration/ocr-workflow.test.js`:
```javascript
const cds = require('@sap/cds');
const path = require('path');
const fs = require('fs');

describe('OCR Workflow Integration Test', () => {
    let CVSortingService;

    beforeAll(async () => {
        CVSortingService = await cds.connect.to('CVSortingService');
    });

    test('Complete workflow: upload → OCR → review → create candidate', async () => {
        // Read sample CV file
        const samplePdf = fs.readFileSync(
            path.join(__dirname, '../fixtures/sample-cv.pdf')
        );

        // Step 1: Upload and process
        const uploadResult = await CVSortingService.uploadAndProcessCV({
            fileName: 'john-doe-cv.pdf',
            fileContent: samplePdf,
            mediaType: 'application/pdf',
            autoCreate: false
        });

        expect(uploadResult.documentId).toBeDefined();
        expect(uploadResult.confidence).toBeGreaterThan(0);

        // Step 2: Review and create candidate
        const extractedData = JSON.parse(uploadResult.extractedData);
        const reviewResult = await CVSortingService.reviewAndCreateCandidate({
            documentId: uploadResult.documentId,
            editedData: JSON.stringify(extractedData)
        });

        expect(reviewResult.candidateId).toBeDefined();
        expect(reviewResult.embeddingGenerated).toBe(true);

        // Step 3: Verify candidate created
        const db = await cds.connect.to('db');
        const candidate = await SELECT.one.from('cv.sorting.Candidates')
            .where({ ID: reviewResult.candidateId });

        expect(candidate).toBeDefined();
        expect(candidate.firstName).toBeTruthy();
        expect(candidate.email).toBeTruthy();
    }, 30000); // 30 second timeout for OCR processing
});
```

**Step 2: Run test**

Run: `npm test -- test/integration/ocr-workflow.test.js`
Expected: PASS (full workflow works end-to-end)

**Step 3: Commit**

```bash
git add test/integration/ocr-workflow.test.js
git commit -m "test: add OCR workflow integration test

- Test complete flow: upload → OCR → review → create candidate
- Verify document creation, OCR processing, and candidate creation
- Confirm embedding generation after candidate creation

🤖 Generated with Claude Code"
```

---

## Execution Complete

Plan complete and saved to `docs/plans/2025-12-16-ocr-integration.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration with quality gates

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints between phases

Which approach would you like to use?
