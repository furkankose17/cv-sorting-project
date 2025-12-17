# RapidOCR Migration Design

**Date:** 2025-12-17
**Status:** Approved
**Author:** Claude Code (brainstorming session)

## Executive Summary

Replace PaddleOCR with RapidOCR to resolve performance issues (timeouts, crashes) while maintaining accuracy for mixed-quality CV documents with multilingual support.

**Expected outcomes:**
- Processing time: 30-60 seconds per CV (down from 5+ minutes/timeout)
- Memory usage: ~500MB (down from 2GB+)
- Startup time: <15 seconds (down from 30+)
- Accuracy maintained: 97-98% for clean and scanned documents

## Context & Requirements

### Current Problem
PaddleOCR v3.x is timing out (even with 5-minute timeout) when processing PDF CVs:
- Too computationally expensive on CPU
- High memory footprint (2GB+)
- Slow initialization (30+ seconds)
- Service crashes during processing

### Requirements
- **Balanced speed/accuracy:** 97-98% accuracy, 30-60 seconds processing time
- **Mixed quality documents:** Clean PDFs + scanned/photographed CVs (50/50 split)
- **Medium volume, interactive:** 5-10 CVs at once, 1-2 minute acceptable wait time
- **Multilingual support:** English, Turkish, German, French, Spanish, etc.

## Architecture

### Engine Choice: RapidOCR

**What is RapidOCR:**
- Lightweight, optimized version of PaddleOCR
- Same core models with inference optimization via ONNX Runtime
- 3-5x faster than PaddleOCR
- Lower memory footprint (~500MB vs 2GB+)

**Why RapidOCR:**
1. 50/50 mix of clean PDFs and scans means Tesseract alone insufficient
2. Medium volume doesn't justify hybrid engine complexity
3. Good accuracy on both clean and scanned documents
4. Built-in multilingual support (60+ languages)
5. Simpler API than PaddleOCR
6. 30-45 seconds meets interactive requirement

### Integration Strategy

**Single Engine with Fallback:**
- Primary: RapidOCR for all documents
- Fallback: Tesseract (already in code) for rare RapidOCR failures
- Remove: PaddleOCR entirely

**Existing Abstraction Layer:**
- Keep `OCRProcessor` class in `python-ml-service/app/models/ocr.py`
- Add `rapidocr` as third engine option (alongside `paddleocr`, `tesseract`)
- Maintain existing API endpoints (no breaking changes)

**PDF Processing Pipeline:**
- Continue using `pdf2image` with poppler (150 DPI)
- RapidOCR processes PIL Image objects
- Structured extraction pipeline unchanged

## Implementation Details

### Dependencies

**Remove from `requirements.txt`:**
```python
paddleocr>=3.0.0
paddlepaddle>=2.6.0
```

**Add to `requirements.txt`:**
```python
rapidocr-onnxruntime>=1.3.0  # ~50MB package
```

### Code Changes

**File:** `python-ml-service/app/models/ocr.py`

**1. Add RapidOCR Initialization:**
```python
def _init_rapidocr(self):
    """Initialize RapidOCR engine."""
    try:
        from rapidocr_onnxruntime import RapidOCR

        self._rapid_ocr = RapidOCR()
        logger.info("RapidOCR initialized successfully")
    except ImportError:
        logger.warning("RapidOCR not available, falling back to Tesseract")
        self.engine = "tesseract"
        self._init_tesseract(None)
    except Exception as e:
        logger.warning(f"RapidOCR initialization failed: {e}, falling back to Tesseract")
        self.engine = "tesseract"
        self._init_tesseract(None)
```

**2. Add RapidOCR Processing Method:**
```python
def _ocr_with_rapid(self, image, language: str) -> Dict[str, Any]:
    """
    Perform OCR using RapidOCR.

    Args:
        image: PIL Image object
        language: Language code (not used by RapidOCR - auto-detects)

    Returns:
        Dict with text, confidence, and optional tables
    """
    # RapidOCR accepts PIL Image directly
    result, elapse = self._rapid_ocr(image)

    # result format: [[bbox, text, confidence], ...] or None
    if not result or len(result) == 0:
        return {'text': '', 'confidence': 0.0, 'lines': [], 'tables': []}

    # Extract text and confidence
    texts = [item[1] for item in result]
    confidences = [item[2] for item in result]

    full_text = '\n'.join(texts)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        'text': full_text,
        'confidence': avg_confidence,
        'lines': len(texts),
        'tables': []  # RapidOCR doesn't provide table detection separately
    }
```

**3. Update Constructor:**
```python
def __init__(self, engine: Optional[str] = None, ...):
    self.engine = engine or os.getenv("OCR_ENGINE", "rapidocr")  # Changed default
    # ... existing code ...

    if self.engine == "rapidocr":
        self._init_rapidocr()
    elif self.engine == "paddleocr":
        self._init_paddleocr()
    else:
        self._init_tesseract(tesseract_cmd)
```

**4. Update Processing Logic:**
```python
def _process_pdf(self, content: bytes, language: str, use_engine: str):
    # ... existing PDF to image conversion ...

    for i, image in enumerate(images):
        logger.debug(f"Processing page {i + 1}/{len(images)}")

        if use_engine == "rapidocr" and self._rapid_ocr:
            page_result = self._ocr_with_rapid(image, language)
        elif use_engine == "paddleocr" and self._paddle_ocr:
            page_result = self._ocr_with_paddle(image, language)
        else:
            page_result = self._ocr_with_tesseract(image, language)

        # ... rest of existing code ...
```

### Configuration

**Environment Variable:**
```bash
# python-ml-service/.env
OCR_ENGINE=rapidocr
```

**CAP Server (already configured):**
```javascript
// srv/lib/ml-client.js - Already has 5-minute timeout
this.timeout = parseInt(process.env.ML_SERVICE_TIMEOUT) || 300000;
```

## Data Flow

### Processing Flow (Unchanged High-Level)
1. User uploads PDF via `/api/uploadAndProcessCV`
2. CAP server calls ML service `/api/ocr/process` with base64 PDF
3. ML service converts PDF → images (150 DPI)
4. RapidOCR processes each page → text extraction
5. Structured extraction parses text → candidate data
6. Return to CAP server → create document/candidate

### RapidOCR Execution Flow
```python
# For each PDF page (PIL Image):
result, elapse = self._rapid_ocr(image)

# result = [
#   [[x1,y1,x2,y2,x3,y3,x4,y4], "John Doe", 0.95],
#   [[x1,y1,x2,y2,x3,y3,x4,y4], "john@example.com", 0.92],
#   ...
# ] or None

# Extract text and confidence:
texts = [item[1] for item in result] if result else []
confidences = [item[2] for item in result] if result else []
full_text = '\n'.join(texts)
avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
```

## Error Handling

### Fallback Strategy
```python
try:
    ocr_result = self._ocr_with_rapid(image, language)
except Exception as e:
    logger.warning(f"RapidOCR failed: {e}, falling back to Tesseract")
    ocr_result = self._ocr_with_tesseract(image, language)
```

### Edge Cases
- **Empty results:** Return text="" and confidence=0.0, let structured extraction handle
- **Timeout:** Keep 5-minute timeout; RapidOCR should complete in 30-60s
- **Memory:** RapidOCR auto-releases models between calls
- **Initialization failure:** Falls back to Tesseract automatically

## Testing Strategy

### Unit Tests
```python
# tests/test_ocr_rapidocr.py

def test_rapidocr_clean_pdf():
    """Test RapidOCR on clean digital PDF"""
    processor = OCRProcessor(engine="rapidocr")
    result = processor.extract_text(clean_pdf_bytes, "pdf", "en")
    assert result['confidence'] > 0.90
    assert "expected text" in result['text']

def test_rapidocr_scanned_pdf():
    """Test RapidOCR on scanned document"""
    processor = OCRProcessor(engine="rapidocr")
    result = processor.extract_text(scanned_pdf_bytes, "pdf", "en")
    assert result['confidence'] > 0.85

def test_rapidocr_multilingual():
    """Test Turkish, German, French text extraction"""
    processor = OCRProcessor(engine="rapidocr")
    result = processor.extract_text(turkish_cv_bytes, "pdf", "tr")
    assert "Furkan" in result['text']

def test_rapidocr_fallback():
    """Test fallback to Tesseract when RapidOCR fails"""
    # Mock RapidOCR to raise exception
    # Verify Tesseract is called
```

### Integration Tests
```bash
# Test with actual CV
curl -X POST http://localhost:8000/api/ocr/process \
  -F "file=@Furkan Köse-2.pdf" \
  --max-time 120
```

### Performance Benchmarking
- Measure processing time for 1, 2, 3-page CVs
- Compare RapidOCR vs old PaddleOCR times
- Verify 30-60 second target met

## Migration Plan

### Phase 1: Parallel Installation (10 mins)
```bash
cd python-ml-service
source venv/bin/activate
pip install rapidocr-onnxruntime
# Keep PaddleOCR installed temporarily as backup
```

### Phase 2: Code Update (30 mins)
- Add `_init_rapidocr()` method
- Add `_ocr_with_rapid()` method
- Update `__init__` to support `engine="rapidocr"`
- Update default engine to `rapidocr`

### Phase 3: Test & Validate (20 mins)
- Set `OCR_ENGINE=rapidocr` in .env
- Restart ML service
- Test with "Furkan Köse-2.pdf"
- Verify structured extraction works
- Check end-to-end upload flow

### Phase 4: Cleanup (5 mins)
- If successful, uninstall PaddleOCR: `pip uninstall paddleocr paddlepaddle`
- Remove `_init_paddleocr()` and `_ocr_with_paddle()` methods
- Update requirements.txt

**Total migration time: ~1 hour** (including testing)

### Rollback Plan
If RapidOCR doesn't work:
```bash
# Change env variable back
OCR_ENGINE=tesseract  # or paddleocr
# Restart service - old code still present during Phase 3
```

## Monitoring

### Performance Metrics
```python
# Log processing times
logger.info(f"Processing {file_type} with engine: {use_engine}")
logger.info(f"PDF has {len(images)} pages")
logger.info(f"RapidOCR page {i+1} took {elapse}ms")
```

### Success Indicators
- Response time < 60 seconds ✅
- Confidence > 0.85 ✅
- Fallback to Tesseract count (track failures)
- Empty text results (track OCR failures)

### Log Monitoring
```bash
# Watch processing
tail -f /tmp/ml-service.log | grep -E "RapidOCR|Processing|confidence"

# Check fallback usage
grep "falling back to Tesseract" /tmp/ml-service.log
```

## Success Criteria

After migration, validate:
- ✅ "Furkan Köse-2.pdf" processes successfully in < 60 seconds
- ✅ Extracted text includes name, email, skills
- ✅ Confidence score > 0.85 for typical CVs
- ✅ Memory usage < 1GB (down from 2GB+ with PaddleOCR)
- ✅ Service startup time < 15 seconds (down from 30+)
- ✅ No timeout errors with 5-minute limit

## Performance Expectations

**RapidOCR Processing Times:**
- 1-page CV: 5-10 seconds
- 2-page CV: 10-20 seconds
- 3-page CV: 15-30 seconds
- Memory: ~500MB (vs 2GB+ for PaddleOCR)
- Initialization: ~5 seconds (vs 30+ for PaddleOCR)

Well within 1-2 minute interactive requirement.

## Future Optimization Options

If needed later:
- Add document quality pre-check (skip OCR for born-digital PDFs with extractable text)
- Implement page-level caching for multi-upload scenarios
- Add GPU support for RapidOCR if volume increases (10x speedup)
- Hybrid routing: Tesseract for clean PDFs, RapidOCR for scans

## API Compatibility

No breaking changes:
- All existing endpoints remain unchanged
- Request/response formats unchanged
- Structured extraction unchanged
- CAP server integration unchanged

Only internal OCR engine swapped.
