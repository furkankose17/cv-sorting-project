"""
Scoring criteria endpoints for CV Sorting ML Service.
"""

import logging
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/scoring", tags=["Scoring"])
logger = logging.getLogger(__name__)


# Request/Response Models

class ScoringCriterionRequest(BaseModel):
    """Request model for a single scoring criterion."""
    criteria_type: str = Field(..., description="Type: skill, language, certification, experience, education")
    criteria_value: str = Field(..., description="Value (e.g., 'Python', 'English', '5' for years)")
    points: int = Field(..., ge=1, le=100, description="Points for this criterion")
    is_required: bool = Field(False, description="Whether criterion is required (disqualifying if missing)")
    weight: float = Field(1.0, ge=0.1, le=5.0, description="Weight multiplier")
    min_value: Optional[int] = Field(None, description="Minimum value (for experience)")
    per_unit_points: Optional[float] = Field(None, description="Points per unit (e.g., per year)")
    max_points: Optional[int] = Field(None, description="Maximum points (for graduated scoring)")
    sort_order: int = Field(0, description="Display order")


class ScoringCriterionResponse(BaseModel):
    """Response model for a scoring criterion."""
    id: Optional[str] = None
    criteria_type: str
    criteria_value: str
    points: int
    is_required: bool
    weight: float
    min_value: Optional[int] = None
    per_unit_points: Optional[float] = None
    max_points: Optional[int] = None
    sort_order: int = 0


class SetCriteriaRequest(BaseModel):
    """Request model for setting all criteria for a job."""
    job_posting_id: str = Field(..., description="Job posting UUID")
    criteria: List[ScoringCriterionRequest] = Field(..., description="List of criteria")
    replace_existing: bool = Field(True, description="Replace all existing criteria")


class CalculateScoreRequest(BaseModel):
    """Request model for calculating a score."""
    job_posting_id: str = Field(..., description="Job posting UUID")
    candidate_data: Dict[str, Any] = Field(..., description="Candidate data for scoring")


class ScoreResponse(BaseModel):
    """Response model for score calculation."""
    total_points: int
    max_points: int
    percentage: float
    matched_criteria: List[Dict[str, Any]]
    missing_criteria: List[Dict[str, Any]]
    required_missing: List[Dict[str, Any]]
    disqualified: bool
    disqualification_reason: Optional[str] = None


# Endpoints

@router.get("/criteria/{job_posting_id}", response_model=List[ScoringCriterionResponse])
async def get_scoring_criteria(job_posting_id: str) -> List[Dict[str, Any]]:
    """
    Get scoring criteria for a job posting.

    Args:
        job_posting_id: Job posting UUID

    Returns:
        List of scoring criteria
    """
    from app.main import get_db_pool

    db = get_db_pool()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        query = """
            SELECT
                id, criteria_type, criteria_value, points,
                is_required, weight, min_value, per_unit_points,
                max_points, sort_order
            FROM scoring_criteria
            WHERE job_posting_id = $1
            ORDER BY sort_order, is_required DESC, points DESC
        """

        rows = await db.fetch(query, job_posting_id)

        return [
            {
                "id": str(row['id']),
                "criteria_type": row['criteria_type'],
                "criteria_value": row['criteria_value'],
                "points": row['points'],
                "is_required": row['is_required'],
                "weight": float(row['weight']) if row['weight'] else 1.0,
                "min_value": row['min_value'],
                "per_unit_points": float(row['per_unit_points']) if row['per_unit_points'] else None,
                "max_points": row['max_points'],
                "sort_order": row['sort_order'] or 0
            }
            for row in rows
        ]

    except Exception as e:
        logger.error(f"Failed to get criteria: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/criteria")
async def set_scoring_criteria(request: SetCriteriaRequest) -> Dict[str, Any]:
    """
    Set scoring criteria for a job posting.

    Args:
        request: Criteria configuration request

    Returns:
        Summary of created/updated criteria
    """
    from app.main import get_db_pool

    db = get_db_pool()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Delete existing criteria if replacing
        if request.replace_existing:
            await db.execute(
                "DELETE FROM scoring_criteria WHERE job_posting_id = $1",
                request.job_posting_id
            )

        # Insert new criteria
        insert_query = """
            INSERT INTO scoring_criteria (
                job_posting_id, criteria_type, criteria_value, points,
                is_required, weight, min_value, per_unit_points,
                max_points, sort_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (job_posting_id, criteria_type, criteria_value)
            DO UPDATE SET
                points = EXCLUDED.points,
                is_required = EXCLUDED.is_required,
                weight = EXCLUDED.weight,
                min_value = EXCLUDED.min_value,
                per_unit_points = EXCLUDED.per_unit_points,
                max_points = EXCLUDED.max_points,
                sort_order = EXCLUDED.sort_order
        """

        created = 0
        for criterion in request.criteria:
            await db.execute(
                insert_query,
                request.job_posting_id,
                criterion.criteria_type,
                criterion.criteria_value,
                criterion.points,
                criterion.is_required,
                criterion.weight,
                criterion.min_value,
                criterion.per_unit_points,
                criterion.max_points,
                criterion.sort_order
            )
            created += 1

        return {
            "success": True,
            "job_posting_id": request.job_posting_id,
            "criteria_count": created,
            "replaced_existing": request.replace_existing
        }

    except Exception as e:
        logger.error(f"Failed to set criteria: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/criteria/{job_posting_id}/add", response_model=ScoringCriterionResponse)
async def add_single_criterion(
    job_posting_id: str,
    criterion: ScoringCriterionRequest
) -> Dict[str, Any]:
    """
    Add a single criterion to a job posting.

    Args:
        job_posting_id: Job posting UUID
        criterion: Criterion to add

    Returns:
        Created criterion
    """
    from app.main import get_db_pool

    db = get_db_pool()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        query = """
            INSERT INTO scoring_criteria (
                job_posting_id, criteria_type, criteria_value, points,
                is_required, weight, min_value, per_unit_points,
                max_points, sort_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, criteria_type, criteria_value, points,
                      is_required, weight, min_value, per_unit_points,
                      max_points, sort_order
        """

        row = await db.fetchrow(
            query,
            job_posting_id,
            criterion.criteria_type,
            criterion.criteria_value,
            criterion.points,
            criterion.is_required,
            criterion.weight,
            criterion.min_value,
            criterion.per_unit_points,
            criterion.max_points,
            criterion.sort_order
        )

        return {
            "id": str(row['id']),
            "criteria_type": row['criteria_type'],
            "criteria_value": row['criteria_value'],
            "points": row['points'],
            "is_required": row['is_required'],
            "weight": float(row['weight']) if row['weight'] else 1.0,
            "min_value": row['min_value'],
            "per_unit_points": float(row['per_unit_points']) if row['per_unit_points'] else None,
            "max_points": row['max_points'],
            "sort_order": row['sort_order'] or 0
        }

    except Exception as e:
        logger.error(f"Failed to add criterion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/criteria/{job_posting_id}/{criterion_id}")
async def delete_criterion(job_posting_id: str, criterion_id: str) -> Dict[str, Any]:
    """
    Delete a specific criterion.

    Args:
        job_posting_id: Job posting UUID
        criterion_id: Criterion UUID

    Returns:
        Deletion confirmation
    """
    from app.main import get_db_pool

    db = get_db_pool()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        result = await db.execute(
            "DELETE FROM scoring_criteria WHERE id = $1 AND job_posting_id = $2",
            criterion_id,
            job_posting_id
        )

        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Criterion not found")

        return {
            "deleted": True,
            "criterion_id": criterion_id,
            "job_posting_id": job_posting_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete criterion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/criteria/{job_posting_id}")
async def delete_all_criteria(job_posting_id: str) -> Dict[str, Any]:
    """
    Delete all criteria for a job posting.

    Args:
        job_posting_id: Job posting UUID

    Returns:
        Deletion summary
    """
    from app.main import get_db_pool

    db = get_db_pool()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Get count first
        count = await db.fetchval(
            "SELECT COUNT(*) FROM scoring_criteria WHERE job_posting_id = $1",
            job_posting_id
        )

        await db.execute(
            "DELETE FROM scoring_criteria WHERE job_posting_id = $1",
            job_posting_id
        )

        return {
            "deleted": True,
            "job_posting_id": job_posting_id,
            "criteria_deleted": count
        }

    except Exception as e:
        logger.error(f"Failed to delete criteria: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate", response_model=ScoreResponse)
async def calculate_score(request: CalculateScoreRequest) -> Dict[str, Any]:
    """
    Calculate score for candidate data against job criteria.

    Args:
        request: Score calculation request

    Returns:
        Detailed scoring result
    """
    from app.main import get_scoring_service

    service = get_scoring_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Scoring service not available")

    try:
        # Get criteria for the job
        criteria = await service.get_job_criteria(request.job_posting_id)

        if not criteria:
            return {
                "total_points": 0,
                "max_points": 0,
                "percentage": 100.0,
                "matched_criteria": [],
                "missing_criteria": [],
                "required_missing": [],
                "disqualified": False,
                "disqualification_reason": None
            }

        # Calculate score
        result = service.calculate_score(request.candidate_data, criteria)

        return service.to_dict(result)

    except Exception as e:
        logger.error(f"Failed to calculate score: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates")
async def get_criteria_templates() -> Dict[str, Any]:
    """
    Get predefined criteria templates for common job types.

    Returns:
        Dictionary of templates by job type
    """
    return {
        "software_developer": [
            {"criteria_type": "skill", "criteria_value": "Python", "points": 10, "is_required": True},
            {"criteria_type": "skill", "criteria_value": "JavaScript", "points": 8, "is_required": False},
            {"criteria_type": "skill", "criteria_value": "Git", "points": 5, "is_required": True},
            {"criteria_type": "experience", "criteria_value": "3", "points": 10, "is_required": False, "min_value": 3, "per_unit_points": 2, "max_points": 20},
            {"criteria_type": "education", "criteria_value": "bachelor", "points": 5, "is_required": False},
            {"criteria_type": "language", "criteria_value": "English", "points": 5, "is_required": True}
        ],
        "sap_consultant": [
            {"criteria_type": "skill", "criteria_value": "SAP", "points": 15, "is_required": True},
            {"criteria_type": "skill", "criteria_value": "ABAP", "points": 10, "is_required": False},
            {"criteria_type": "skill", "criteria_value": "Fiori", "points": 8, "is_required": False},
            {"criteria_type": "skill", "criteria_value": "HANA", "points": 8, "is_required": False},
            {"criteria_type": "certification", "criteria_value": "SAP Certified", "points": 10, "is_required": False},
            {"criteria_type": "experience", "criteria_value": "5", "points": 15, "is_required": True, "min_value": 5},
            {"criteria_type": "language", "criteria_value": "German", "points": 5, "is_required": False}
        ],
        "data_scientist": [
            {"criteria_type": "skill", "criteria_value": "Python", "points": 10, "is_required": True},
            {"criteria_type": "skill", "criteria_value": "Machine Learning", "points": 10, "is_required": True},
            {"criteria_type": "skill", "criteria_value": "SQL", "points": 8, "is_required": True},
            {"criteria_type": "skill", "criteria_value": "TensorFlow", "points": 5, "is_required": False},
            {"criteria_type": "skill", "criteria_value": "PyTorch", "points": 5, "is_required": False},
            {"criteria_type": "education", "criteria_value": "master", "points": 10, "is_required": False},
            {"criteria_type": "experience", "criteria_value": "2", "points": 10, "is_required": False, "min_value": 2, "per_unit_points": 3, "max_points": 15}
        ],
        "project_manager": [
            {"criteria_type": "certification", "criteria_value": "PMP", "points": 15, "is_required": False},
            {"criteria_type": "certification", "criteria_value": "Scrum Master", "points": 10, "is_required": False},
            {"criteria_type": "skill", "criteria_value": "Agile", "points": 8, "is_required": True},
            {"criteria_type": "skill", "criteria_value": "JIRA", "points": 5, "is_required": False},
            {"criteria_type": "experience", "criteria_value": "5", "points": 15, "is_required": True, "min_value": 5},
            {"criteria_type": "language", "criteria_value": "English", "points": 5, "is_required": True}
        ]
    }
