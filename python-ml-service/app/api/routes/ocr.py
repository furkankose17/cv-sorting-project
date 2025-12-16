"""
OCR processing endpoints for CV Sorting ML Service.
"""

import logging
import base64
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from app.api.routes.ocr_extraction import extract_structured_data, ExtractStructuredRequest

router = APIRouter(prefix="/api/ocr", tags=["OCR"])
logger = logging.getLogger(__name__)


# Request/Response Models

class ProcessBase64Request(BaseModel):
    """Request model for base64-encoded file OCR."""
    file_content: str = Field(..., description="Base64-encoded file content")
    file_type: str = Field(..., description="File type (pdf, png, jpg, etc.)")
    language: Optional[str] = Field("eng", description="OCR language code")
    extract_structured: bool = Field(True, description="Extract structured data from CV")


class OCRResponse(BaseModel):
    """Response model for OCR processing."""
    text: str
    pages: int
    confidence: float
    method: str
    language: str
    text_length: int
    content_hash: str
    structured_data: Optional[Dict[str, Any]] = None


class SupportedFormatsResponse(BaseModel):
    """Response model for supported formats."""
    formats: List[str]
    mime_types: Dict[str, str]


# Endpoints

@router.post("/process", response_model=OCRResponse)
async def process_document(request: ProcessBase64Request) -> Dict[str, Any]:
    """
    Process a document with OCR using base64-encoded content.

    Args:
        request: OCR processing request with base64 content

    Returns:
        Extracted text and metadata
    """
    from app.main import get_ocr_processor

    processor = get_ocr_processor()
    if processor is None:
        raise HTTPException(status_code=503, detail="OCR processor not available")

    # Validate file type
    if not processor.is_supported(request.file_type):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {request.file_type}. Supported: {processor.get_supported_formats()}"
        )

    try:
        # Decode base64 content
        file_content = base64.b64decode(request.file_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 content: {e}")

    try:
        # Process document
        result = processor.extract_text(
            file_content=file_content,
            file_type=request.file_type,
            language=request.language
        )

        # Extract structured data if requested
        structured_data = None
        if request.extract_structured and result.get('text'):
            # Call the structured extraction endpoint function
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


@router.post("/process-upload", response_model=OCRResponse)
async def process_uploaded_file(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    extract_structured: bool = Form(True)
) -> Dict[str, Any]:
    """
    Process an uploaded file with OCR.

    Args:
        file: Uploaded file
        language: OCR language code
        extract_structured: Whether to extract structured data

    Returns:
        Extracted text and metadata
    """
    from app.main import get_ocr_processor

    processor = get_ocr_processor()
    if processor is None:
        raise HTTPException(status_code=503, detail="OCR processor not available")

    # Get file type from filename
    filename = file.filename or ""
    file_type = filename.split('.')[-1].lower() if '.' in filename else ""

    if not file_type:
        # Try to get from content type
        content_type = file.content_type or ""
        type_map = {
            'application/pdf': 'pdf',
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/tiff': 'tiff',
            'image/bmp': 'bmp',
            'image/gif': 'gif',
            'image/webp': 'webp'
        }
        file_type = type_map.get(content_type, "")

    if not processor.is_supported(file_type):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_type}. Supported: {processor.get_supported_formats()}"
        )

    try:
        # Read file content
        file_content = await file.read()

        # Process document
        result = processor.extract_text(
            file_content=file_content,
            file_type=file_type,
            language=language
        )

        # Extract structured data if requested
        structured_data = None
        if extract_structured and result.get('text'):
            # Call the structured extraction endpoint function
            extraction_request = ExtractStructuredRequest(
                text=result['text'],
                language=language
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


@router.get("/formats", response_model=SupportedFormatsResponse)
async def get_supported_formats() -> Dict[str, Any]:
    """
    Get list of supported file formats.

    Returns:
        List of supported formats and MIME types
    """
    from app.main import get_ocr_processor

    processor = get_ocr_processor()
    if processor is None:
        # Return default supported formats
        return {
            "formats": ["pdf", "png", "jpg", "jpeg", "tiff", "tif", "bmp", "gif", "webp"],
            "mime_types": {
                "pdf": "application/pdf",
                "png": "image/png",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "tiff": "image/tiff",
                "tif": "image/tiff",
                "bmp": "image/bmp",
                "gif": "image/gif",
                "webp": "image/webp"
            }
        }

    return {
        "formats": processor.get_supported_formats(),
        "mime_types": processor.SUPPORTED_FORMATS
    }


@router.get("/languages")
async def get_supported_languages() -> Dict[str, Any]:
    """
    Get list of common OCR languages.

    Returns:
        List of language codes and names
    """
    return {
        "languages": [
            {"code": "eng", "name": "English"},
            {"code": "deu", "name": "German"},
            {"code": "tur", "name": "Turkish"},
            {"code": "fra", "name": "French"},
            {"code": "spa", "name": "Spanish"},
            {"code": "ita", "name": "Italian"},
            {"code": "por", "name": "Portuguese"},
            {"code": "nld", "name": "Dutch"},
            {"code": "pol", "name": "Polish"},
            {"code": "rus", "name": "Russian"},
            {"code": "ara", "name": "Arabic"},
            {"code": "chi_sim", "name": "Chinese Simplified"},
            {"code": "chi_tra", "name": "Chinese Traditional"},
            {"code": "jpn", "name": "Japanese"},
            {"code": "kor", "name": "Korean"}
        ],
        "note": "Multiple languages can be combined: eng+deu"
    }


@router.get("/health")
async def get_ocr_health() -> Dict[str, Any]:
    """
    Get OCR service health and engine information.

    Returns:
        OCR service status and engine details
    """
    from app.main import get_ocr_processor

    processor = get_ocr_processor()
    if processor is None:
        raise HTTPException(
            status_code=503,
            detail="OCR processor not initialized"
        )

    engine_info = processor.get_engine_info()

    return {
        "status": "healthy" if processor._ocr_available else "unavailable",
        "engine_info": engine_info,
        "message": f"OCR service using {engine_info.get('engine', 'unknown')} engine"
    }
