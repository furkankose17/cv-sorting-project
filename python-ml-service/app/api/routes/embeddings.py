"""
Embedding generation endpoints for CV Sorting ML Service.
"""

import logging
from typing import Dict, Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/embeddings", tags=["Embeddings"])
logger = logging.getLogger(__name__)


# Request/Response Models

class GenerateEmbeddingRequest(BaseModel):
    """Request model for embedding generation."""
    entity_type: str = Field(..., description="Type: 'candidate' or 'job'")
    entity_id: str = Field(..., description="UUID of the entity")
    text_content: str = Field(..., min_length=10, description="Main text content")
    skills_text: Optional[str] = Field(None, description="Skills section text (candidates)")
    experience_text: Optional[str] = Field(None, description="Experience section (candidates)")
    requirements_text: Optional[str] = Field(None, description="Requirements section (jobs)")
    store: bool = Field(True, description="Store in database")


class GenerateEmbeddingResponse(BaseModel):
    """Response model for embedding generation."""
    entity_id: str
    entity_type: str
    embedding_dimension: int
    stored: bool
    content_hash: str


class BulkGenerateRequest(BaseModel):
    """Request model for bulk embedding generation."""
    entity_type: str = Field(..., description="Type: 'candidate' or 'job'")
    entities: List[Dict[str, Any]] = Field(..., description="List of entities")


class BulkGenerateResponse(BaseModel):
    """Response model for bulk generation."""
    processed: int
    failed: int
    errors: List[Dict[str, str]]


class GetEmbeddingResponse(BaseModel):
    """Response model for getting embeddings."""
    entity_id: str
    entity_type: str
    model: str
    content_hash: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]


# Endpoints

@router.post("/generate", response_model=GenerateEmbeddingResponse)
async def generate_embedding(request: GenerateEmbeddingRequest) -> Dict[str, Any]:
    """
    Generate embedding for a candidate or job posting.

    Args:
        request: Embedding generation request

    Returns:
        Generation result with embedding info
    """
    from app.main import get_embedding_service

    service = get_embedding_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Embedding service not available")

    try:
        if request.entity_type.lower() == "candidate":
            result = await service.generate_candidate_embedding(
                candidate_id=request.entity_id,
                cv_text=request.text_content,
                skills_text=request.skills_text,
                experience_text=request.experience_text,
                store=request.store
            )
            return {
                "entity_id": result['candidate_id'],
                "entity_type": "candidate",
                "embedding_dimension": result['embedding_dimension'],
                "stored": result['stored'],
                "content_hash": result['content_hash']
            }

        elif request.entity_type.lower() == "job":
            result = await service.generate_job_embedding(
                job_posting_id=request.entity_id,
                description=request.text_content,
                requirements=request.requirements_text,
                store=request.store
            )
            return {
                "entity_id": result['job_posting_id'],
                "entity_type": "job",
                "embedding_dimension": result['embedding_dimension'],
                "stored": result['stored'],
                "content_hash": result['content_hash']
            }

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid entity_type: {request.entity_type}. Use 'candidate' or 'job'"
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")


@router.post("/bulk-generate", response_model=BulkGenerateResponse)
async def bulk_generate_embeddings(request: BulkGenerateRequest) -> Dict[str, Any]:
    """
    Generate embeddings for multiple entities.

    Args:
        request: Bulk generation request

    Returns:
        Summary of processed and failed entities
    """
    from app.main import get_embedding_service

    service = get_embedding_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Embedding service not available")

    try:
        if request.entity_type.lower() == "candidate":
            # Transform entities to expected format
            candidates = [
                {
                    'candidate_id': e.get('entity_id') or e.get('candidate_id'),
                    'cv_text': e.get('text_content') or e.get('cv_text', ''),
                    'skills_text': e.get('skills_text'),
                    'experience_text': e.get('experience_text')
                }
                for e in request.entities
            ]
            result = await service.bulk_generate_candidate_embeddings(candidates)
            return result

        elif request.entity_type.lower() == "job":
            # Process jobs one by one (bulk method can be added later)
            processed = 0
            failed = 0
            errors = []

            for entity in request.entities:
                try:
                    await service.generate_job_embedding(
                        job_posting_id=entity.get('entity_id') or entity.get('job_posting_id'),
                        description=entity.get('text_content') or entity.get('description', ''),
                        requirements=entity.get('requirements_text') or entity.get('requirements'),
                        store=True
                    )
                    processed += 1
                except Exception as e:
                    failed += 1
                    errors.append({
                        'entity_id': entity.get('entity_id') or entity.get('job_posting_id'),
                        'error': str(e)
                    })

            return {
                'processed': processed,
                'failed': failed,
                'errors': errors
            }

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid entity_type: {request.entity_type}"
            )

    except Exception as e:
        logger.error(f"Bulk embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate/{candidate_id}", response_model=GetEmbeddingResponse)
async def get_candidate_embedding(candidate_id: str) -> Dict[str, Any]:
    """
    Get embedding info for a candidate.

    Args:
        candidate_id: Candidate UUID

    Returns:
        Embedding metadata (not the vector itself)
    """
    from app.main import get_embedding_service

    service = get_embedding_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Embedding service not available")

    result = await service.get_candidate_embedding(candidate_id)

    if result is None:
        raise HTTPException(status_code=404, detail=f"Embedding not found for candidate {candidate_id}")

    return {
        "entity_id": result['candidate_id'],
        "entity_type": "candidate",
        "model": result['model'],
        "content_hash": result.get('content_hash'),
        "created_at": result.get('created_at'),
        "updated_at": result.get('updated_at')
    }


@router.delete("/candidate/{candidate_id}")
async def delete_candidate_embedding(candidate_id: str) -> Dict[str, Any]:
    """
    Delete embedding for a candidate.

    Args:
        candidate_id: Candidate UUID

    Returns:
        Deletion result
    """
    from app.main import get_embedding_service

    service = get_embedding_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Embedding service not available")

    success = await service.delete_candidate_embedding(candidate_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Could not delete embedding for candidate {candidate_id}")

    return {"deleted": True, "candidate_id": candidate_id}
