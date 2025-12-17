"""
CAP Service client for fetching candidate and job data.

Communicates with the SAP CAP Node.js backend service
to retrieve candidate profiles for scoring and matching.
"""

import logging
from typing import Dict, Any, Optional, List
import httpx

from app.config import settings
from app.utils.retry import async_retry
from app.utils.vcap import get_xsuaa_credentials

logger = logging.getLogger(__name__)


class CAPClient:
    """
    Client for SAP CAP CVSortingService API.

    Handles authentication via XSUAA and provides methods
    to fetch candidate and job data from the CAP backend.

    Attributes:
        base_url: CAP service base URL
        timeout: Request timeout in seconds
    """

    def __init__(self, base_url: str = None, timeout: float = 30.0):
        """
        Initialize CAP client.

        Args:
            base_url: CAP service URL (defaults to settings.cap_service_url)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url or settings.cap_service_url
        self.timeout = httpx.Timeout(timeout)
        self._token: Optional[str] = None
        self._token_expires: float = 0

    async def _get_auth_token(self) -> Optional[str]:
        """
        Fetch OAuth token from XSUAA.

        Returns:
            Access token string or None if auth not configured
        """
        import time

        # Return cached token if still valid
        if self._token and time.time() < self._token_expires:
            return self._token

        # Check for XSUAA credentials
        xsuaa = get_xsuaa_credentials()
        if xsuaa:
            token_url = xsuaa.get("url", "") + "/oauth/token"
            client_id = xsuaa.get("clientid")
            client_secret = xsuaa.get("clientsecret")
        else:
            # Fall back to environment variables
            token_url = settings.cap_token_url
            client_id = settings.cap_client_id
            client_secret = settings.cap_client_secret

        if not all([token_url, client_id, client_secret]):
            logger.debug("XSUAA credentials not configured, skipping auth")
            return None

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                response.raise_for_status()
                data = response.json()

                self._token = data["access_token"]
                # Cache token with buffer before expiry
                expires_in = data.get("expires_in", 3600)
                self._token_expires = time.time() + expires_in - 60

                logger.info("XSUAA token obtained successfully")
                return self._token

        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to get XSUAA token: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Failed to get auth token: {e}")
            return None

    def _get_headers(self, token: Optional[str] = None) -> Dict[str, str]:
        """Build request headers with optional auth."""
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    @async_retry(max_attempts=3, delay=1.0, exceptions=(httpx.HTTPError, httpx.TimeoutException))
    async def get_candidate(self, candidate_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch candidate data from CAP service.

        Args:
            candidate_id: Candidate UUID

        Returns:
            Transformed candidate data dict or None if not found
        """
        if not self.base_url:
            logger.warning("CAP service URL not configured")
            return None

        token = await self._get_auth_token()

        url = f"{self.base_url}/api/Candidates('{candidate_id}')"
        params = {
            "$expand": "skills($expand=skill),languages,certifications,experiences,educations"
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers=self._get_headers(token)
                )

                if response.status_code == 404:
                    logger.warning(f"Candidate {candidate_id} not found")
                    return None

                response.raise_for_status()
                return self._transform_candidate_data(response.json())

        except httpx.HTTPStatusError as e:
            logger.error(f"CAP API error for candidate {candidate_id}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Failed to fetch candidate {candidate_id}: {e}")
            return None

    @async_retry(max_attempts=3, delay=1.0, exceptions=(httpx.HTTPError, httpx.TimeoutException))
    async def get_job_posting(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch job posting data from CAP service.

        Args:
            job_id: Job posting UUID

        Returns:
            Job posting data dict or None if not found
        """
        if not self.base_url:
            logger.warning("CAP service URL not configured")
            return None

        token = await self._get_auth_token()

        url = f"{self.base_url}/api/JobPostings('{job_id}')"
        params = {"$expand": "requiredSkills($expand=skill)"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers=self._get_headers(token)
                )

                if response.status_code == 404:
                    logger.warning(f"Job posting {job_id} not found")
                    return None

                response.raise_for_status()
                return self._transform_job_data(response.json())

        except httpx.HTTPStatusError as e:
            logger.error(f"CAP API error for job {job_id}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Failed to fetch job {job_id}: {e}")
            return None

    @async_retry(max_attempts=2, delay=0.5, exceptions=(httpx.HTTPError,))
    async def get_candidates_batch(
        self,
        candidate_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch multiple candidates in batch.

        Args:
            candidate_ids: List of candidate UUIDs

        Returns:
            Dict mapping candidate_id to candidate data
        """
        results = {}

        # OData batch requests are complex, use parallel individual requests
        import asyncio
        tasks = [self.get_candidate(cid) for cid in candidate_ids]
        candidates = await asyncio.gather(*tasks, return_exceptions=True)

        for cid, result in zip(candidate_ids, candidates):
            if isinstance(result, Exception):
                logger.warning(f"Failed to fetch candidate {cid}: {result}")
                continue
            if result:
                results[cid] = result

        return results

    def _transform_candidate_data(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform CAP response to scoring-friendly format.

        Args:
            raw: Raw CAP API response

        Returns:
            Transformed candidate data
        """
        # Extract skills with names
        skills = []
        for cs in raw.get("skills", []):
            skill = cs.get("skill", {})
            if skill.get("name"):
                skills.append(skill["name"])

        # Extract languages with proficiency
        languages = {}
        for lang in raw.get("languages", []):
            lang_name = lang.get("language") or lang.get("name", "")
            proficiency = lang.get("proficiency") or lang.get("level", "basic")
            if lang_name:
                languages[lang_name] = proficiency

        # Extract certifications
        certifications = [
            c.get("name") or c.get("title", "")
            for c in raw.get("certifications", [])
            if c.get("name") or c.get("title")
        ]

        # Calculate total experience years
        total_years = raw.get("totalExperienceYears", 0)
        if not total_years:
            for exp in raw.get("experiences", []):
                years = exp.get("durationYears") or exp.get("years", 0)
                total_years += years

        # Get highest education level
        education_level = raw.get("educationLevel", "")
        if not education_level:
            for edu in raw.get("educations", []):
                level = edu.get("degreeLevel") or edu.get("degree", "")
                if level:
                    education_level = level
                    break

        return {
            "id": raw.get("ID"),
            "name": f"{raw.get('firstName', '')} {raw.get('lastName', '')}".strip(),
            "email": raw.get("email"),
            "skills": skills,
            "languages": languages,
            "certifications": certifications,
            "totalExperienceYears": total_years,
            "educationLevel": education_level,
            "summary": raw.get("summary", ""),
            "headline": raw.get("headline", ""),
            "location": raw.get("location", ""),
            "status": raw.get("status")
        }

    def _transform_job_data(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform CAP job response to matching-friendly format.

        Args:
            raw: Raw CAP API response

        Returns:
            Transformed job data
        """
        # Extract required skills
        required_skills = []
        for rs in raw.get("requiredSkills", []):
            skill = rs.get("skill", {})
            skill_name = skill.get("name", "")
            if skill_name:
                required_skills.append({
                    "name": skill_name,
                    "required": rs.get("isRequired", True),
                    "minimumProficiency": rs.get("minimumProficiency", "intermediate"),
                    "weight": float(rs.get("weight", 1.0))
                })

        return {
            "id": raw.get("ID"),
            "title": raw.get("title"),
            "description": raw.get("description", ""),
            "qualifications": raw.get("qualifications", ""),
            "responsibilities": raw.get("responsibilities", ""),
            "requiredSkills": required_skills,
            "minimumExperience": raw.get("minimumExperience", 0),
            "preferredExperience": raw.get("preferredExperience"),
            "requiredEducation": raw.get("requiredEducation"),
            "location": raw.get("location", ""),
            "locationType": raw.get("locationType", "onsite"),
            "employmentType": raw.get("employmentType", "full-time"),
            "status": raw.get("status")
        }

    async def health_check(self) -> bool:
        """
        Check if CAP service is reachable.

        Returns:
            True if service is healthy
        """
        if not self.base_url:
            return False

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                response = await client.get(f"{self.base_url}/health")
                return response.status_code == 200
        except Exception:
            return False


# Global client instance
_cap_client: Optional[CAPClient] = None


def get_cap_client() -> CAPClient:
    """Get or create global CAP client instance."""
    global _cap_client
    if _cap_client is None:
        _cap_client = CAPClient()
    return _cap_client
