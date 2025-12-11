"""
Semantic matching endpoints for CV Sorting ML Service.
"""

import logging
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/matching", tags=["Matching"])
logger = logging.getLogger(__name__)


# Request/Response Models

class SemanticMatchRequest(BaseModel):
    """Request model for semantic matching."""
    job_posting_id: str = Field(..., description="Job posting UUID")
    min_score: Optional[float] = Field(None, ge=0, le=100, description="Minimum combined score")
    limit: Optional[int] = Field(None, ge=1, le=500, description="Maximum results")
    include_breakdown: bool = Field(True, description="Include detailed score breakdown")
    exclude_disqualified: bool = Field(False, description="Exclude candidates missing required criteria")


class MatchResultResponse(BaseModel):
    """Response model for a single match result."""
    candidate_id: str
    job_posting_id: str
    cosine_similarity: float
    criteria_score: float
    criteria_max_score: float
    combined_score: float
    rank: int
    score_breakdown: Optional[Dict[str, Any]] = None
    matched_criteria: Optional[List[Dict]] = None
    missing_criteria: Optional[List[Dict]] = None
    disqualified: bool = False


class SemanticMatchResponse(BaseModel):
    """Response model for semantic matching."""
    job_posting_id: str
    total_matches: int
    matches: List[MatchResultResponse]


class SingleMatchRequest(BaseModel):
    """Request model for single match calculation."""
    candidate_id: str = Field(..., description="Candidate UUID")
    job_posting_id: str = Field(..., description="Job posting UUID")


class SemanticSearchRequest(BaseModel):
    """Request model for semantic search by query."""
    query: str = Field(..., min_length=3, description="Natural language search query")
    limit: Optional[int] = Field(20, ge=1, le=100, description="Maximum results")
    min_similarity: Optional[float] = Field(0.3, ge=0, le=1, description="Minimum similarity threshold")


class SemanticSearchResponse(BaseModel):
    """Response model for semantic search."""
    query: str
    total_results: int
    results: List[Dict[str, Any]]


# Endpoints

@router.post("/semantic", response_model=SemanticMatchResponse)
async def find_semantic_matches(request: SemanticMatchRequest) -> Dict[str, Any]:
    """
    Find matching candidates for a job using semantic similarity + criteria scoring.

    Args:
        request: Semantic match request parameters

    Returns:
        List of matching candidates sorted by combined score
    """
    from app.main import get_matching_service

    service = get_matching_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Matching service not available")

    try:
        results = await service.find_matches(
            job_posting_id=request.job_posting_id,
            min_score=request.min_score,
            limit=request.limit,
            include_breakdown=request.include_breakdown,
            exclude_disqualified=request.exclude_disqualified
        )

        matches = [
            {
                "candidate_id": r.candidate_id,
                "job_posting_id": r.job_posting_id,
                "cosine_similarity": r.cosine_similarity,
                "criteria_score": r.criteria_score,
                "criteria_max_score": r.criteria_max_score,
                "combined_score": r.combined_score,
                "rank": r.rank,
                "score_breakdown": r.score_breakdown if request.include_breakdown else None,
                "matched_criteria": r.matched_criteria if request.include_breakdown else None,
                "missing_criteria": r.missing_criteria if request.include_breakdown else None,
                "disqualified": r.disqualified
            }
            for r in results
        ]

        return {
            "job_posting_id": request.job_posting_id,
            "total_matches": len(matches),
            "matches": matches
        }

    except Exception as e:
        logger.error(f"Semantic matching failed: {e}")
        raise HTTPException(status_code=500, detail=f"Matching failed: {str(e)}")


@router.post("/single", response_model=MatchResultResponse)
async def calculate_single_match(request: SingleMatchRequest) -> Dict[str, Any]:
    """
    Calculate match score for a single candidate-job pair.

    Args:
        request: Single match calculation request

    Returns:
        Detailed match result
    """
    from app.main import get_matching_service

    service = get_matching_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Matching service not available")

    try:
        result = await service.calculate_single_match(
            candidate_id=request.candidate_id,
            job_posting_id=request.job_posting_id
        )

        if result is None:
            raise HTTPException(
                status_code=404,
                detail="Could not calculate match - embeddings may not exist"
            )

        return {
            "candidate_id": result.candidate_id,
            "job_posting_id": result.job_posting_id,
            "cosine_similarity": result.cosine_similarity,
            "criteria_score": result.criteria_score,
            "criteria_max_score": result.criteria_max_score,
            "combined_score": result.combined_score,
            "rank": result.rank,
            "score_breakdown": result.score_breakdown,
            "matched_criteria": result.matched_criteria,
            "missing_criteria": result.missing_criteria,
            "disqualified": result.disqualified
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Single match calculation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Match calculation failed: {str(e)}")


@router.post("/search", response_model=SemanticSearchResponse)
async def semantic_search(request: SemanticSearchRequest) -> Dict[str, Any]:
    """
    Search candidates using natural language query.

    Args:
        request: Semantic search request

    Returns:
        List of matching candidates with similarity scores
    """
    from app.main import get_matching_service

    service = get_matching_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Matching service not available")

    try:
        results = await service.semantic_search_query(
            query_text=request.query,
            limit=request.limit,
            min_similarity=request.min_similarity
        )

        formatted_results = [
            {
                "candidate_id": candidate_id,
                "similarity": round(similarity, 5)
            }
            for candidate_id, similarity in results
        ]

        return {
            "query": request.query,
            "total_results": len(formatted_results),
            "results": formatted_results
        }

    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/store-result")
async def store_match_result(result: MatchResultResponse) -> Dict[str, Any]:
    """
    Store a match result in the database.

    Args:
        result: Match result to store

    Returns:
        Storage confirmation
    """
    from app.main import get_matching_service
    from app.services.matching_service import MatchResult

    service = get_matching_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Matching service not available")

    try:
        match_result = MatchResult(
            candidate_id=result.candidate_id,
            job_posting_id=result.job_posting_id,
            cosine_similarity=result.cosine_similarity,
            criteria_score=result.criteria_score,
            criteria_max_score=result.criteria_max_score,
            combined_score=result.combined_score,
            rank=result.rank,
            score_breakdown=result.score_breakdown or {},
            matched_criteria=result.matched_criteria or [],
            missing_criteria=result.missing_criteria or [],
            disqualified=result.disqualified
        )

        success = await service.store_match_result(match_result)

        if not success:
            raise HTTPException(status_code=500, detail="Failed to store match result")

        return {
            "stored": True,
            "candidate_id": result.candidate_id,
            "job_posting_id": result.job_posting_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to store match result: {e}")
        raise HTTPException(status_code=500, detail=f"Storage failed: {str(e)}")


@router.get("/results/{job_posting_id}")
async def get_stored_results(
    job_posting_id: str,
    limit: int = Query(50, ge=1, le=500),
    min_score: float = Query(0, ge=0, le=100)
) -> Dict[str, Any]:
    """
    Get stored match results for a job posting.

    Args:
        job_posting_id: Job posting UUID
        limit: Maximum results
        min_score: Minimum score filter

    Returns:
        List of stored match results
    """
    from app.main import get_db_pool

    db = get_db_pool()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        query = """
            SELECT
                candidate_id,
                job_posting_id,
                cosine_similarity,
                criteria_score,
                criteria_max_score,
                criteria_percentage,
                combined_score,
                rank,
                score_breakdown,
                matched_criteria,
                missing_criteria,
                calculated_at
            FROM semantic_match_results
            WHERE job_posting_id = $1
              AND combined_score >= $2
            ORDER BY combined_score DESC
            LIMIT $3
        """

        rows = await db.fetch(query, job_posting_id, min_score, limit)

        results = [
            {
                "candidate_id": str(row['candidate_id']),
                "job_posting_id": str(row['job_posting_id']),
                "cosine_similarity": float(row['cosine_similarity']),
                "criteria_score": float(row['criteria_score']) if row['criteria_score'] else 0,
                "combined_score": float(row['combined_score']),
                "rank": row['rank'],
                "calculated_at": row['calculated_at'].isoformat() if row['calculated_at'] else None
            }
            for row in rows
        ]

        return {
            "job_posting_id": job_posting_id,
            "total_results": len(results),
            "results": results
        }

    except Exception as e:
        logger.error(f"Failed to get stored results: {e}")
        raise HTTPException(status_code=500, detail=str(e))
