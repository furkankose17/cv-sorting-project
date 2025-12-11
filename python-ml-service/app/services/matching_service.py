"""
Semantic Matching Service for CV Sorting ML Service.
Combines vector similarity with criteria-based scoring.
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
import numpy as np

from app.services.scoring_service import ScoringService, ScoringResult
from app.models.embeddings import EmbeddingModel
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    """Result of matching a candidate to a job."""
    candidate_id: str
    job_posting_id: str
    cosine_similarity: float
    criteria_score: float
    criteria_max_score: float
    combined_score: float
    rank: int
    score_breakdown: Dict[str, Any]
    matched_criteria: List[Dict]
    missing_criteria: List[Dict]
    disqualified: bool = False


class SemanticMatchingService:
    """
    Service for semantic matching between candidates and jobs.
    Combines embedding-based similarity with criteria scoring.
    """

    def __init__(
        self,
        db_pool,
        embedding_model: EmbeddingModel,
        scoring_service: ScoringService,
        semantic_weight: float = None,
        criteria_weight: float = None
    ):
        """
        Initialize matching service.

        Args:
            db_pool: PostgreSQL connection pool
            embedding_model: Embedding model instance
            scoring_service: Scoring service instance
            semantic_weight: Weight for semantic similarity (0-1)
            criteria_weight: Weight for criteria score (0-1)
        """
        self.db = db_pool
        self.embedding_model = embedding_model
        self.scoring_service = scoring_service

        # Configurable weights (should sum to 1)
        self.semantic_weight = semantic_weight or settings.semantic_weight
        self.criteria_weight = criteria_weight or settings.criteria_weight

    async def find_matches(
        self,
        job_posting_id: str,
        min_score: float = None,
        limit: int = None,
        include_breakdown: bool = True,
        exclude_disqualified: bool = False
    ) -> List[MatchResult]:
        """
        Find matching candidates for a job using semantic + criteria scoring.

        Args:
            job_posting_id: Job posting UUID
            min_score: Minimum combined score (0-100)
            limit: Maximum number of results
            include_breakdown: Include detailed score breakdown
            exclude_disqualified: Exclude candidates missing required criteria

        Returns:
            List of MatchResult sorted by combined_score
        """
        min_score = min_score if min_score is not None else settings.default_min_score
        limit = limit or settings.default_match_limit

        # Get job embedding
        job_embedding = await self._get_job_embedding(job_posting_id)
        if job_embedding is None:
            logger.warning(f"No embedding found for job {job_posting_id}")
            return []

        # Get scoring criteria
        criteria = await self.scoring_service.get_job_criteria(job_posting_id)

        # Perform semantic search using pgvector
        semantic_results = await self._semantic_search(
            job_embedding,
            limit=limit * 2  # Get more candidates to filter
        )

        if not semantic_results:
            logger.info(f"No semantic matches found for job {job_posting_id}")
            return []

        results = []

        for candidate_id, cosine_sim in semantic_results:
            # Get candidate data for criteria scoring
            candidate_data = await self._get_candidate_data(candidate_id)

            if not candidate_data:
                logger.warning(f"No data found for candidate {candidate_id}")
                continue

            # Calculate criteria score
            scoring_result = self.scoring_service.calculate_score(
                candidate_data,
                criteria
            )

            # Skip disqualified if requested
            if exclude_disqualified and scoring_result.disqualified:
                continue

            # Calculate combined score
            semantic_score = cosine_sim * 100  # Convert to 0-100 scale
            criteria_percentage = scoring_result.percentage

            combined_score = (
                semantic_score * self.semantic_weight +
                criteria_percentage * self.criteria_weight
            )

            # Skip if below minimum score
            if combined_score < min_score:
                continue

            # Build result
            result = MatchResult(
                candidate_id=candidate_id,
                job_posting_id=job_posting_id,
                cosine_similarity=round(cosine_sim, 5),
                criteria_score=scoring_result.total_points,
                criteria_max_score=scoring_result.max_points,
                combined_score=round(combined_score, 2),
                rank=0,  # Set after sorting
                score_breakdown={
                    'semantic_raw': round(cosine_sim, 5),
                    'semantic_weighted': round(semantic_score * self.semantic_weight, 2),
                    'criteria_percentage': scoring_result.percentage,
                    'criteria_weighted': round(criteria_percentage * self.criteria_weight, 2),
                    'weights': {
                        'semantic': self.semantic_weight,
                        'criteria': self.criteria_weight
                    }
                } if include_breakdown else {},
                matched_criteria=[
                    {
                        'type': c.criteria_type,
                        'value': c.criteria_value,
                        'points': c.points_earned
                    }
                    for c in scoring_result.matched_criteria
                ] if include_breakdown else [],
                missing_criteria=[
                    {
                        'type': c.criteria_type,
                        'value': c.criteria_value,
                        'is_required': c.is_required
                    }
                    for c in scoring_result.missing_criteria
                ] if include_breakdown else [],
                disqualified=scoring_result.disqualified
            )

            results.append(result)

        # Sort by combined score and assign ranks
        results.sort(key=lambda x: x.combined_score, reverse=True)
        for i, result in enumerate(results[:limit]):
            result.rank = i + 1

        return results[:limit]

    async def calculate_single_match(
        self,
        candidate_id: str,
        job_posting_id: str
    ) -> Optional[MatchResult]:
        """
        Calculate match score for a single candidate-job pair.

        Args:
            candidate_id: Candidate UUID
            job_posting_id: Job posting UUID

        Returns:
            MatchResult or None if embeddings not found
        """
        # Get embeddings
        candidate_embedding = await self._get_candidate_embedding(candidate_id)
        job_embedding = await self._get_job_embedding(job_posting_id)

        if candidate_embedding is None or job_embedding is None:
            logger.warning(f"Missing embeddings for match calculation")
            return None

        # Calculate cosine similarity
        cosine_sim = self.embedding_model.compute_similarity(
            candidate_embedding,
            job_embedding
        )

        # Get candidate data and criteria
        candidate_data = await self._get_candidate_data(candidate_id)
        criteria = await self.scoring_service.get_job_criteria(job_posting_id)

        # Calculate criteria score
        scoring_result = self.scoring_service.calculate_score(
            candidate_data or {},
            criteria
        )

        # Combined score
        semantic_score = cosine_sim * 100
        criteria_percentage = scoring_result.percentage
        combined_score = (
            semantic_score * self.semantic_weight +
            criteria_percentage * self.criteria_weight
        )

        return MatchResult(
            candidate_id=candidate_id,
            job_posting_id=job_posting_id,
            cosine_similarity=round(cosine_sim, 5),
            criteria_score=scoring_result.total_points,
            criteria_max_score=scoring_result.max_points,
            combined_score=round(combined_score, 2),
            rank=0,
            score_breakdown={
                'semantic_raw': round(cosine_sim, 5),
                'semantic_weighted': round(semantic_score * self.semantic_weight, 2),
                'criteria_percentage': scoring_result.percentage,
                'criteria_weighted': round(criteria_percentage * self.criteria_weight, 2),
                'weights': {
                    'semantic': self.semantic_weight,
                    'criteria': self.criteria_weight
                }
            },
            matched_criteria=[
                {'type': c.criteria_type, 'value': c.criteria_value, 'points': c.points_earned}
                for c in scoring_result.matched_criteria
            ],
            missing_criteria=[
                {'type': c.criteria_type, 'value': c.criteria_value, 'is_required': c.is_required}
                for c in scoring_result.missing_criteria
            ],
            disqualified=scoring_result.disqualified
        )

    async def semantic_search_query(
        self,
        query_text: str,
        limit: int = 20,
        min_similarity: float = 0.3
    ) -> List[Tuple[str, float]]:
        """
        Search candidates using a natural language query.
        Supports multilingual queries (EN, DE, TR, FR, ES, etc.)

        Args:
            query_text: Search query (any supported language)
            limit: Maximum results
            min_similarity: Minimum similarity threshold

        Returns:
            List of (candidate_id, similarity) tuples
        """
        # Generate query embedding using E5 query prefix
        # For E5 models, queries use "query: " prefix for optimal retrieval
        query_embedding = self.embedding_model.encode_query(query_text)

        # Search using pgvector
        query = """
            SELECT
                candidate_id,
                1 - (combined_embedding <=> $1::vector) as similarity
            FROM candidate_embeddings
            WHERE 1 - (combined_embedding <=> $1::vector) >= $2
            ORDER BY combined_embedding <=> $1::vector
            LIMIT $3
        """

        try:
            rows = await self.db.fetch(
                query,
                query_embedding.tolist(),
                min_similarity,
                limit
            )
            return [(row['candidate_id'], float(row['similarity'])) for row in rows]
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            return []

    async def _semantic_search(
        self,
        job_embedding: np.ndarray,
        limit: int = 100
    ) -> List[Tuple[str, float]]:
        """
        Perform semantic search against candidate embeddings.

        Args:
            job_embedding: Job embedding vector
            limit: Maximum results

        Returns:
            List of (candidate_id, similarity) tuples
        """
        query = """
            SELECT
                candidate_id,
                1 - (combined_embedding <=> $1::vector) as similarity
            FROM candidate_embeddings
            ORDER BY combined_embedding <=> $1::vector
            LIMIT $2
        """

        try:
            rows = await self.db.fetch(query, job_embedding.tolist(), limit)
            return [(str(row['candidate_id']), float(row['similarity'])) for row in rows]
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            return []

    async def _get_job_embedding(self, job_posting_id: str) -> Optional[np.ndarray]:
        """Retrieve job embedding from PostgreSQL."""
        query = """
            SELECT combined_embedding
            FROM job_embeddings
            WHERE job_posting_id = $1
        """
        try:
            row = await self.db.fetchrow(query, job_posting_id)
            if row and row['combined_embedding']:
                return np.array(row['combined_embedding'], dtype=np.float32)
            return None
        except Exception as e:
            logger.error(f"Failed to get job embedding: {e}")
            return None

    async def _get_candidate_embedding(self, candidate_id: str) -> Optional[np.ndarray]:
        """Retrieve candidate embedding from PostgreSQL."""
        query = """
            SELECT combined_embedding
            FROM candidate_embeddings
            WHERE candidate_id = $1
        """
        try:
            row = await self.db.fetchrow(query, candidate_id)
            if row and row['combined_embedding']:
                return np.array(row['combined_embedding'], dtype=np.float32)
            return None
        except Exception as e:
            logger.error(f"Failed to get candidate embedding: {e}")
            return None

    async def _get_candidate_data(self, candidate_id: str) -> Optional[Dict[str, Any]]:
        """
        Get candidate data for criteria scoring.
        This would ideally call CAP service or have a local cache.
        """
        # TODO: Implement CAP service integration
        # For now, return placeholder based on embeddings metadata
        # In production, this should call the CAP CandidateService API

        # Example: could store basic candidate data in PostgreSQL
        # or call CAP service: GET /api/candidates/Candidates('{candidate_id}')?$expand=skills,languages,certifications

        logger.debug(f"Getting candidate data for {candidate_id}")

        # Placeholder - in real implementation, call CAP API
        return {
            'skills': [],
            'languages': {},
            'certifications': [],
            'totalExperienceYears': 0,
            'educationLevel': ''
        }

    async def store_match_result(self, result: MatchResult) -> bool:
        """
        Store match result in PostgreSQL.

        Args:
            result: MatchResult to store

        Returns:
            Success boolean
        """
        import json

        query = """
            INSERT INTO semantic_match_results (
                candidate_id, job_posting_id, cosine_similarity,
                criteria_score, criteria_max_score, criteria_percentage,
                combined_score, rank, score_breakdown,
                matched_criteria, missing_criteria
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (candidate_id, job_posting_id)
            DO UPDATE SET
                cosine_similarity = EXCLUDED.cosine_similarity,
                criteria_score = EXCLUDED.criteria_score,
                combined_score = EXCLUDED.combined_score,
                rank = EXCLUDED.rank,
                score_breakdown = EXCLUDED.score_breakdown,
                calculated_at = CURRENT_TIMESTAMP
        """

        try:
            criteria_percentage = (
                result.criteria_score / result.criteria_max_score * 100
                if result.criteria_max_score > 0 else 0
            )

            await self.db.execute(
                query,
                result.candidate_id,
                result.job_posting_id,
                result.cosine_similarity,
                result.criteria_score,
                result.criteria_max_score,
                round(criteria_percentage, 2),
                result.combined_score,
                result.rank,
                json.dumps(result.score_breakdown),
                json.dumps(result.matched_criteria),
                json.dumps(result.missing_criteria)
            )
            return True
        except Exception as e:
            logger.error(f"Failed to store match result: {e}")
            return False

    def to_dict(self, result: MatchResult) -> Dict[str, Any]:
        """Convert MatchResult to dictionary."""
        return {
            'candidate_id': result.candidate_id,
            'job_posting_id': result.job_posting_id,
            'cosine_similarity': result.cosine_similarity,
            'criteria_score': result.criteria_score,
            'criteria_max_score': result.criteria_max_score,
            'combined_score': result.combined_score,
            'rank': result.rank,
            'score_breakdown': result.score_breakdown,
            'matched_criteria': result.matched_criteria,
            'missing_criteria': result.missing_criteria,
            'disqualified': result.disqualified
        }
