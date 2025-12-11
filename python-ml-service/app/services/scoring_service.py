"""
Scoring Service for CV Sorting ML Service.
Implements criteria-based scoring for candidates against job requirements.
"""

import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class CriteriaType(str, Enum):
    """Types of scoring criteria."""
    SKILL = "skill"
    LANGUAGE = "language"
    CERTIFICATION = "certification"
    EXPERIENCE = "experience"
    EDUCATION = "education"
    CUSTOM = "custom"


@dataclass
class ScoringCriterion:
    """A single scoring criterion."""
    criteria_type: str
    criteria_value: str
    points: int
    is_required: bool = False
    weight: float = 1.0
    min_value: Optional[int] = None
    per_unit_points: Optional[float] = None
    max_points: Optional[int] = None


@dataclass
class CriterionResult:
    """Result of evaluating a single criterion."""
    criteria_type: str
    criteria_value: str
    points_possible: int
    points_earned: int
    is_required: bool
    matched: bool
    details: Optional[str] = None


@dataclass
class ScoringResult:
    """Complete scoring result for a candidate."""
    total_points: int
    max_points: int
    percentage: float
    matched_criteria: List[CriterionResult] = field(default_factory=list)
    missing_criteria: List[CriterionResult] = field(default_factory=list)
    required_missing: List[CriterionResult] = field(default_factory=list)
    disqualified: bool = False
    disqualification_reason: Optional[str] = None


class ScoringService:
    """
    Service for calculating criteria-based scores.
    Evaluates candidates against job-specific scoring rules.
    """

    # Education level hierarchy (index = rank)
    EDUCATION_LEVELS = [
        "high_school",
        "associate",
        "bachelor",
        "master",
        "doctorate",
        "phd"
    ]

    # Language proficiency mapping (multilingual)
    LANGUAGE_PROFICIENCY_SCORES = {
        # English
        "native": 1.0,
        "fluent": 0.9,
        "professional": 0.7,
        "intermediate": 0.5,
        "basic": 0.3,
        "beginner": 0.2,
        # German
        "muttersprachler": 1.0,
        "fließend": 0.9,
        "verhandlungssicher": 0.8,
        "fortgeschritten": 0.6,
        "grundkenntnisse": 0.3,
        # Turkish
        "anadil": 1.0,
        "akıcı": 0.9,
        "ileri": 0.7,
        "orta": 0.5,
        "başlangıç": 0.2,
    }

    # Multilingual skill synonyms for cross-language matching
    SKILL_SYNONYMS = {
        # Programming languages
        "javascript": ["js", "ecmascript", "es6", "es2015"],
        "typescript": ["ts"],
        "python": ["py", "python3"],
        "java": ["j2ee", "jee"],
        "c++": ["cpp", "cplusplus"],
        "c#": ["csharp", "c sharp", "dotnet", ".net"],
        # Frameworks
        "react": ["reactjs", "react.js"],
        "angular": ["angularjs", "angular.js"],
        "vue": ["vuejs", "vue.js"],
        "nodejs": ["node", "node.js"],
        "express": ["expressjs", "express.js"],
        # SAP Technologies (German/Turkish variants)
        "sap": ["sap erp", "sap ag"],
        "abap": ["abap/4"],
        "fiori": ["sap fiori", "sapui5", "ui5"],
        "hana": ["sap hana", "s/4hana", "s4hana"],
        "btp": ["sap btp", "business technology platform", "cloud foundry"],
        # German skill names
        "softwareentwicklung": ["software development", "yazılım geliştirme"],
        "datenbanken": ["databases", "veritabanı"],
        "programmierung": ["programming", "programlama"],
        "projektmanagement": ["project management", "proje yönetimi"],
        # Turkish skill names
        "yazılım": ["software"],
        "veri analizi": ["data analysis", "datenanalyse"],
        "web geliştirme": ["web development", "webentwicklung"],
        # Cloud platforms
        "aws": ["amazon web services", "amazon aws"],
        "azure": ["microsoft azure", "ms azure"],
        "gcp": ["google cloud", "google cloud platform"],
        # Data/ML
        "machine learning": ["ml", "makine öğrenimi", "maschinelles lernen"],
        "deep learning": ["dl", "derin öğrenme"],
        "data science": ["datenwissenschaft", "veri bilimi"],
        "artificial intelligence": ["ai", "ki", "künstliche intelligenz", "yapay zeka"],
    }

    def __init__(self, db_pool=None):
        """
        Initialize scoring service.

        Args:
            db_pool: PostgreSQL connection pool
        """
        self.db = db_pool

    async def get_job_criteria(self, job_posting_id: str) -> List[ScoringCriterion]:
        """
        Fetch scoring criteria for a job posting from database.

        Args:
            job_posting_id: Job posting UUID

        Returns:
            List of scoring criteria
        """
        if not self.db:
            logger.warning("No database connection, returning empty criteria")
            return []

        query = """
            SELECT
                criteria_type,
                criteria_value,
                points,
                is_required,
                weight,
                min_value,
                per_unit_points,
                max_points
            FROM scoring_criteria
            WHERE job_posting_id = $1
            ORDER BY is_required DESC, sort_order, points DESC
        """

        try:
            rows = await self.db.fetch(query, job_posting_id)
            return [
                ScoringCriterion(
                    criteria_type=row['criteria_type'],
                    criteria_value=row['criteria_value'],
                    points=row['points'],
                    is_required=row['is_required'],
                    weight=float(row['weight']) if row['weight'] else 1.0,
                    min_value=row['min_value'],
                    per_unit_points=float(row['per_unit_points']) if row['per_unit_points'] else None,
                    max_points=row['max_points']
                )
                for row in rows
            ]
        except Exception as e:
            logger.error(f"Failed to fetch criteria: {e}")
            return []

    def calculate_score(
        self,
        candidate_data: Dict[str, Any],
        criteria: List[ScoringCriterion]
    ) -> ScoringResult:
        """
        Calculate score for a candidate against criteria.

        Args:
            candidate_data: Candidate profile data
            criteria: List of scoring criteria

        Returns:
            ScoringResult with detailed breakdown
        """
        if not criteria:
            return ScoringResult(
                total_points=0,
                max_points=0,
                percentage=100.0,
                matched_criteria=[],
                missing_criteria=[],
                required_missing=[]
            )

        matched = []
        missing = []
        required_missing = []
        total_points = 0
        max_points = 0

        # Normalize candidate data
        candidate_skills = self._normalize_set(candidate_data.get('skills', []))
        candidate_languages = self._normalize_dict(candidate_data.get('languages', {}))
        candidate_certs = self._normalize_set(candidate_data.get('certifications', []))
        candidate_experience = candidate_data.get('totalExperienceYears', 0) or 0
        candidate_education = self._normalize_string(candidate_data.get('educationLevel', ''))

        for criterion in criteria:
            points_possible = int(criterion.points * criterion.weight)
            max_points += points_possible

            result = self._evaluate_criterion(
                criterion,
                candidate_skills,
                candidate_languages,
                candidate_certs,
                candidate_experience,
                candidate_education
            )

            criterion_result = CriterionResult(
                criteria_type=criterion.criteria_type,
                criteria_value=criterion.criteria_value,
                points_possible=points_possible,
                points_earned=result['points'],
                is_required=criterion.is_required,
                matched=result['matched'],
                details=result.get('details')
            )

            if result['matched']:
                total_points += result['points']
                matched.append(criterion_result)
            else:
                missing.append(criterion_result)
                if criterion.is_required:
                    required_missing.append(criterion_result)

        # Calculate percentage
        percentage = (total_points / max_points * 100) if max_points > 0 else 0

        # Check for disqualification
        disqualified = len(required_missing) > 0
        disqualification_reason = None
        if disqualified:
            missing_names = [c.criteria_value for c in required_missing[:3]]
            disqualification_reason = f"Missing required criteria: {', '.join(missing_names)}"

        return ScoringResult(
            total_points=total_points,
            max_points=max_points,
            percentage=round(percentage, 2),
            matched_criteria=matched,
            missing_criteria=missing,
            required_missing=required_missing,
            disqualified=disqualified,
            disqualification_reason=disqualification_reason
        )

    def _evaluate_criterion(
        self,
        criterion: ScoringCriterion,
        skills: set,
        languages: dict,
        certifications: set,
        experience_years: float,
        education_level: str
    ) -> Dict[str, Any]:
        """
        Evaluate a single criterion against candidate data.

        Returns:
            Dict with 'matched', 'points', and optional 'details'
        """
        criterion_type = criterion.criteria_type.lower()
        value = criterion.criteria_value.lower()
        max_points = int(criterion.points * criterion.weight)

        if criterion_type == CriteriaType.SKILL:
            # Check if skill is in candidate's skills (with multilingual synonym support)
            matched, match_detail = self._check_skill_match(value, skills)
            return {
                'matched': matched,
                'points': max_points if matched else 0,
                'details': f"Skill '{criterion.criteria_value}' {match_detail}"
            }

        elif criterion_type == CriteriaType.LANGUAGE:
            # Check language with proficiency
            if value in languages:
                proficiency = languages[value]
                score_multiplier = self.LANGUAGE_PROFICIENCY_SCORES.get(proficiency, 0.5)
                points = int(max_points * score_multiplier)
                return {
                    'matched': True,
                    'points': points,
                    'details': f"Language '{criterion.criteria_value}' at {proficiency} level"
                }
            return {
                'matched': False,
                'points': 0,
                'details': f"Language '{criterion.criteria_value}' not found"
            }

        elif criterion_type == CriteriaType.CERTIFICATION:
            # Check certification (partial match allowed)
            matched = value in certifications or any(value in c for c in certifications)
            return {
                'matched': matched,
                'points': max_points if matched else 0,
                'details': f"Certification '{criterion.criteria_value}' {'found' if matched else 'not found'}"
            }

        elif criterion_type == CriteriaType.EXPERIENCE:
            # Experience scoring with per_unit_points
            min_years = criterion.min_value or int(criterion.criteria_value)

            if experience_years >= min_years:
                if criterion.per_unit_points:
                    # Points per year
                    points = int(experience_years * criterion.per_unit_points)
                    if criterion.max_points:
                        points = min(points, criterion.max_points)
                    return {
                        'matched': True,
                        'points': points,
                        'details': f"{experience_years} years experience ({points} points)"
                    }
                return {
                    'matched': True,
                    'points': max_points,
                    'details': f"{experience_years} years meets {min_years} year requirement"
                }
            else:
                # Partial credit for experience below threshold
                if experience_years > 0 and not criterion.is_required:
                    partial_points = int(max_points * (experience_years / min_years))
                    return {
                        'matched': False,
                        'points': partial_points,
                        'details': f"{experience_years} years below {min_years} year requirement (partial credit)"
                    }
                return {
                    'matched': False,
                    'points': 0,
                    'details': f"{experience_years} years below {min_years} year requirement"
                }

        elif criterion_type == CriteriaType.EDUCATION:
            # Check education level hierarchy
            required_level = value
            matched = self._check_education_match(education_level, required_level)

            if matched:
                return {
                    'matched': True,
                    'points': max_points,
                    'details': f"Education '{education_level}' meets '{required_level}' requirement"
                }
            else:
                # Partial credit for lower education
                cand_rank = self._get_education_rank(education_level)
                req_rank = self._get_education_rank(required_level)
                if cand_rank > 0 and req_rank > 0:
                    partial = int(max_points * (cand_rank / req_rank))
                    return {
                        'matched': False,
                        'points': partial if not criterion.is_required else 0,
                        'details': f"Education '{education_level}' below '{required_level}'"
                    }
                return {
                    'matched': False,
                    'points': 0,
                    'details': f"Education level not matched"
                }

        else:
            # Custom criteria - default to string matching
            return {
                'matched': False,
                'points': 0,
                'details': f"Unknown criteria type: {criterion_type}"
            }

    def _check_skill_match(self, required_skill: str, candidate_skills: set) -> tuple:
        """
        Check if a required skill matches any candidate skill.
        Supports multilingual synonym matching (EN, DE, TR).

        Args:
            required_skill: The required skill (lowercase)
            candidate_skills: Set of candidate skills (lowercase)

        Returns:
            Tuple of (matched: bool, detail: str)
        """
        # Direct match
        if required_skill in candidate_skills:
            return True, "found (exact match)"

        # Partial match (skill contained in candidate skill or vice versa)
        for candidate_skill in candidate_skills:
            if required_skill in candidate_skill or candidate_skill in required_skill:
                return True, f"found (partial match: '{candidate_skill}')"

        # Check synonyms - is required skill a synonym of something candidate has?
        for canonical, synonyms in self.SKILL_SYNONYMS.items():
            all_variants = [canonical] + synonyms

            # If required skill matches any variant
            if required_skill in all_variants or any(required_skill in v for v in all_variants):
                # Check if candidate has any variant
                for variant in all_variants:
                    if variant in candidate_skills:
                        return True, f"found (synonym match: '{variant}')"
                    # Also check partial matches for synonyms
                    for candidate_skill in candidate_skills:
                        if variant in candidate_skill or candidate_skill in variant:
                            return True, f"found (synonym partial: '{candidate_skill}')"

        return False, "not found"

    def _check_education_match(self, candidate_level: str, required_level: str) -> bool:
        """Check if candidate education meets or exceeds requirement."""
        cand_rank = self._get_education_rank(candidate_level)
        req_rank = self._get_education_rank(required_level)
        return cand_rank >= req_rank and cand_rank > 0

    def _get_education_rank(self, level: str) -> int:
        """Get numeric rank for education level."""
        level = level.lower().strip()
        try:
            return self.EDUCATION_LEVELS.index(level) + 1
        except ValueError:
            # Try partial matching
            for i, edu in enumerate(self.EDUCATION_LEVELS):
                if edu in level or level in edu:
                    return i + 1
            return 0

    def _normalize_set(self, items: List[str]) -> set:
        """Normalize list to lowercase set."""
        if not items:
            return set()
        return {str(item).lower().strip() for item in items if item}

    def _normalize_dict(self, items: Any) -> dict:
        """Normalize language dict or list to lowercase dict."""
        if isinstance(items, dict):
            return {k.lower(): v.lower() if isinstance(v, str) else v for k, v in items.items()}
        elif isinstance(items, list):
            return {str(item).lower(): 'professional' for item in items if item}
        return {}

    def _normalize_string(self, s: str) -> str:
        """Normalize string to lowercase."""
        return str(s).lower().strip() if s else ""

    def to_dict(self, result: ScoringResult) -> Dict[str, Any]:
        """Convert ScoringResult to dictionary."""
        return {
            'total_points': result.total_points,
            'max_points': result.max_points,
            'percentage': result.percentage,
            'matched_criteria': [
                {
                    'type': c.criteria_type,
                    'value': c.criteria_value,
                    'points_earned': c.points_earned,
                    'points_possible': c.points_possible,
                    'details': c.details
                }
                for c in result.matched_criteria
            ],
            'missing_criteria': [
                {
                    'type': c.criteria_type,
                    'value': c.criteria_value,
                    'points_possible': c.points_possible,
                    'is_required': c.is_required,
                    'details': c.details
                }
                for c in result.missing_criteria
            ],
            'required_missing': [
                {
                    'type': c.criteria_type,
                    'value': c.criteria_value,
                    'is_required': True
                }
                for c in result.required_missing
            ],
            'disqualified': result.disqualified,
            'disqualification_reason': result.disqualification_reason
        }
