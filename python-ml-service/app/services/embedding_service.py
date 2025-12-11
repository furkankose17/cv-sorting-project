"""
Embedding Service for CV Sorting ML Service.
Handles embedding generation, storage, and retrieval.
"""

import logging
import hashlib
from typing import Dict, List, Any, Optional
import numpy as np

from app.models.embeddings import EmbeddingModel
from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Service for managing embeddings.
    Handles generation, storage, and retrieval of vector embeddings.
    """

    def __init__(self, db_pool, embedding_model: EmbeddingModel):
        """
        Initialize embedding service.

        Args:
            db_pool: PostgreSQL connection pool
            embedding_model: Embedding model instance
        """
        self.db = db_pool
        self.model = embedding_model

    async def generate_candidate_embedding(
        self,
        candidate_id: str,
        cv_text: str,
        skills_text: Optional[str] = None,
        experience_text: Optional[str] = None,
        store: bool = True
    ) -> Dict[str, Any]:
        """
        Generate and optionally store embeddings for a candidate.

        Args:
            candidate_id: Candidate UUID
            cv_text: Full CV text
            skills_text: Skills section text
            experience_text: Experience section text
            store: Whether to store in database

        Returns:
            Dict with embedding info
        """
        logger.info(f"Generating embedding for candidate {candidate_id}")

        # Generate embeddings
        cv_embedding = self.model.encode_single(cv_text) if cv_text else None

        skills_embedding = None
        if skills_text:
            skills_embedding = self.model.encode_single(skills_text)

        experience_embedding = None
        if experience_text:
            experience_embedding = self.model.encode_single(experience_text)

        # Create combined embedding (weighted average)
        embeddings_to_combine = []
        weights = []

        if cv_embedding is not None:
            embeddings_to_combine.append(cv_embedding)
            weights.append(0.5)

        if skills_embedding is not None:
            embeddings_to_combine.append(skills_embedding)
            weights.append(0.3)

        if experience_embedding is not None:
            embeddings_to_combine.append(experience_embedding)
            weights.append(0.2)

        if not embeddings_to_combine:
            raise ValueError("No text provided for embedding generation")

        combined_embedding = self.model.combine_embeddings(
            embeddings_to_combine,
            weights
        )

        # Compute content hash for change detection
        content_hash = self._compute_hash(cv_text + (skills_text or '') + (experience_text or ''))

        # Store in database if requested
        if store and self.db:
            await self._store_candidate_embedding(
                candidate_id=candidate_id,
                cv_embedding=cv_embedding,
                skills_embedding=skills_embedding,
                experience_embedding=experience_embedding,
                combined_embedding=combined_embedding,
                content_hash=content_hash
            )

        return {
            'candidate_id': candidate_id,
            'embedding_dimension': self.model.dimension,
            'stored': store and self.db is not None,
            'content_hash': content_hash
        }

    async def generate_job_embedding(
        self,
        job_posting_id: str,
        description: str,
        requirements: Optional[str] = None,
        store: bool = True
    ) -> Dict[str, Any]:
        """
        Generate and optionally store embeddings for a job posting.

        Args:
            job_posting_id: Job posting UUID
            description: Job description text
            requirements: Requirements section text
            store: Whether to store in database

        Returns:
            Dict with embedding info
        """
        logger.info(f"Generating embedding for job {job_posting_id}")

        # Generate embeddings
        description_embedding = self.model.encode_single(description) if description else None

        requirements_embedding = None
        if requirements:
            requirements_embedding = self.model.encode_single(requirements)

        # Create combined embedding
        embeddings_to_combine = []
        weights = []

        if description_embedding is not None:
            embeddings_to_combine.append(description_embedding)
            weights.append(0.6)

        if requirements_embedding is not None:
            embeddings_to_combine.append(requirements_embedding)
            weights.append(0.4)

        if not embeddings_to_combine:
            raise ValueError("No text provided for embedding generation")

        combined_embedding = self.model.combine_embeddings(
            embeddings_to_combine,
            weights
        )

        # Compute content hash
        content_hash = self._compute_hash(description + (requirements or ''))

        # Store if requested
        if store and self.db:
            await self._store_job_embedding(
                job_posting_id=job_posting_id,
                description_embedding=description_embedding,
                requirements_embedding=requirements_embedding,
                combined_embedding=combined_embedding,
                content_hash=content_hash
            )

        return {
            'job_posting_id': job_posting_id,
            'embedding_dimension': self.model.dimension,
            'stored': store and self.db is not None,
            'content_hash': content_hash
        }

    async def bulk_generate_candidate_embeddings(
        self,
        candidates: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generate embeddings for multiple candidates.

        Args:
            candidates: List of dicts with candidate_id and text fields

        Returns:
            Summary of results
        """
        processed = 0
        failed = 0
        errors = []

        for candidate in candidates:
            try:
                await self.generate_candidate_embedding(
                    candidate_id=candidate['candidate_id'],
                    cv_text=candidate.get('cv_text', ''),
                    skills_text=candidate.get('skills_text'),
                    experience_text=candidate.get('experience_text'),
                    store=True
                )
                processed += 1
            except Exception as e:
                failed += 1
                errors.append({
                    'candidate_id': candidate.get('candidate_id'),
                    'error': str(e)
                })
                logger.error(f"Failed to generate embedding: {e}")

        return {
            'processed': processed,
            'failed': failed,
            'errors': errors
        }

    async def get_candidate_embedding(
        self,
        candidate_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve candidate embedding from database.

        Args:
            candidate_id: Candidate UUID

        Returns:
            Dict with embeddings or None
        """
        if not self.db:
            return None

        query = """
            SELECT
                candidate_id,
                cv_text_embedding,
                skills_embedding,
                experience_embedding,
                combined_embedding,
                embedding_model,
                cv_text_hash,
                created_at,
                updated_at
            FROM candidate_embeddings
            WHERE candidate_id = $1
        """

        try:
            row = await self.db.fetchrow(query, candidate_id)
            if not row:
                return None

            return {
                'candidate_id': str(row['candidate_id']),
                'combined_embedding': list(row['combined_embedding']) if row['combined_embedding'] else None,
                'model': row['embedding_model'],
                'content_hash': row['cv_text_hash'],
                'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
            }
        except Exception as e:
            logger.error(f"Failed to get candidate embedding: {e}")
            return None

    async def delete_candidate_embedding(self, candidate_id: str) -> bool:
        """Delete candidate embedding from database."""
        if not self.db:
            return False

        query = "DELETE FROM candidate_embeddings WHERE candidate_id = $1"
        try:
            await self.db.execute(query, candidate_id)
            return True
        except Exception as e:
            logger.error(f"Failed to delete embedding: {e}")
            return False

    async def _store_candidate_embedding(
        self,
        candidate_id: str,
        cv_embedding: Optional[np.ndarray],
        skills_embedding: Optional[np.ndarray],
        experience_embedding: Optional[np.ndarray],
        combined_embedding: np.ndarray,
        content_hash: str
    ) -> bool:
        """Store candidate embedding in PostgreSQL."""
        query = """
            INSERT INTO candidate_embeddings (
                candidate_id, cv_text_embedding, skills_embedding,
                experience_embedding, combined_embedding,
                embedding_model, cv_text_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (candidate_id) DO UPDATE SET
                cv_text_embedding = EXCLUDED.cv_text_embedding,
                skills_embedding = EXCLUDED.skills_embedding,
                experience_embedding = EXCLUDED.experience_embedding,
                combined_embedding = EXCLUDED.combined_embedding,
                cv_text_hash = EXCLUDED.cv_text_hash,
                updated_at = CURRENT_TIMESTAMP
        """

        try:
            await self.db.execute(
                query,
                candidate_id,
                cv_embedding.tolist() if cv_embedding is not None else None,
                skills_embedding.tolist() if skills_embedding is not None else None,
                experience_embedding.tolist() if experience_embedding is not None else None,
                combined_embedding.tolist(),
                self.model.model_name,
                content_hash
            )
            logger.info(f"Stored embedding for candidate {candidate_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to store candidate embedding: {e}")
            return False

    async def _store_job_embedding(
        self,
        job_posting_id: str,
        description_embedding: Optional[np.ndarray],
        requirements_embedding: Optional[np.ndarray],
        combined_embedding: np.ndarray,
        content_hash: str
    ) -> bool:
        """Store job embedding in PostgreSQL."""
        query = """
            INSERT INTO job_embeddings (
                job_posting_id, description_embedding,
                requirements_embedding, combined_embedding,
                embedding_model, description_hash
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (job_posting_id) DO UPDATE SET
                description_embedding = EXCLUDED.description_embedding,
                requirements_embedding = EXCLUDED.requirements_embedding,
                combined_embedding = EXCLUDED.combined_embedding,
                description_hash = EXCLUDED.description_hash,
                updated_at = CURRENT_TIMESTAMP
        """

        try:
            await self.db.execute(
                query,
                job_posting_id,
                description_embedding.tolist() if description_embedding is not None else None,
                requirements_embedding.tolist() if requirements_embedding is not None else None,
                combined_embedding.tolist(),
                self.model.model_name,
                content_hash
            )
            logger.info(f"Stored embedding for job {job_posting_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to store job embedding: {e}")
            return False

    def _compute_hash(self, content: str) -> str:
        """Compute SHA-256 hash of content."""
        return hashlib.sha256(content.encode()).hexdigest()
