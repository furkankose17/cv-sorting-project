using { cv.sorting as db } from '../db/schema';

/**
 * Job Matching Service
 * Handles job postings, candidate matching, scoring, and ranking
 */
service MatchingService @(path: '/matching') {

    // ==========================================
    // ENTITIES
    // ==========================================

    entity JobPostings as projection on db.JobPostings {
        *,
        requiredSkills: redirected to JobRequiredSkills
    };

    entity JobRequiredSkills as projection on db.JobRequiredSkills {
        *,
        skill: redirected to Skills
    };

    entity MatchResults as projection on db.MatchResults {
        *,
        candidate: redirected to CandidateView,
        jobPosting: redirected to JobPostings
    };

    // Read-only candidate view for matches
    @readonly
    entity CandidateView as projection on db.Candidates {
        ID,
        firstName,
        lastName,
        email,
        headline,
        totalExperienceYears,
        location,
        overallScore,
        status
    };

    @readonly entity Skills as projection on db.Skills;
    @readonly entity DegreeLevels as projection on db.DegreeLevels;

    // Sorting configurations
    entity SortingConfigurations as projection on db.SortingConfigurations;
    entity SavedFilters as projection on db.SavedFilters;

    // ==========================================
    // ACTIONS - Matching Engine
    // ==========================================

    /**
     * Find matching candidates for a job posting
     * Core matching algorithm execution
     */
    action findMatches(
        jobPostingId      : UUID,
        options           : String  // JSON matching options
    ) returns {
        matchCount        : Integer;
        topMatches        : String;   // JSON top 10 matches preview
        processingTime    : Integer;  // milliseconds
        message           : String;
    };

    /**
     * Recalculate all matches for a job posting
     */
    action recalculateMatches(
        jobPostingId      : UUID,
        includeArchived   : Boolean
    ) returns {
        updated           : Integer;
        newMatches        : Integer;
        removedMatches    : Integer;
    };

    /**
     * Calculate match score for specific candidate-job pair
     */
    action calculateMatchScore(
        candidateId       : UUID,
        jobPostingId      : UUID,
        detailedBreakdown : Boolean
    ) returns {
        overallScore      : Decimal;
        skillScore        : Decimal;
        experienceScore   : Decimal;
        educationScore    : Decimal;
        locationScore     : Decimal;
        breakdown         : String;   // JSON detailed breakdown
        recommendations   : String;   // JSON improvement suggestions
    };

    /**
     * Batch match candidates to multiple jobs
     */
    action batchMatch(
        candidateIds      : array of UUID,
        jobPostingIds     : array of UUID
    ) returns {
        totalMatches      : Integer;
        processingTime    : Integer;
        summary           : String;   // JSON summary
    };

    // ==========================================
    // ACTIONS - Sorting & Filtering
    // ==========================================

    /**
     * Apply custom sorting to candidates
     * Uses weighted scoring algorithm
     */
    action sortCandidates(
        candidateIds      : array of UUID,
        sortingConfigId   : UUID,     // Use saved config
        customWeights     : String,   // Or provide custom weights JSON
        filters           : String    // JSON filter criteria
    ) returns {
        sortedCandidates  : String;   // JSON sorted array with scores
        appliedWeights    : String;   // JSON weights used
    };

    /**
     * Filter candidates with complex criteria
     */
    action filterCandidates(
        filterId          : UUID,     // Use saved filter
        customCriteria    : String,   // Or provide custom criteria JSON
        includeScores     : Boolean
    ) returns {
        candidates        : String;   // JSON filtered array
        totalCount        : Integer;
        appliedFilters    : String;   // JSON applied filter summary
    };

    /**
     * Rank candidates for a specific position
     */
    action rankCandidates(
        jobPostingId      : UUID,
        rankingMethod     : String,   // score, weighted, ai-enhanced
        topN              : Integer
    ) returns {
        rankedCandidates  : String;   // JSON ranked array
        rankingDetails    : String;   // JSON ranking methodology details
    };

    // ==========================================
    // ACTIONS - Match Review
    // ==========================================

    /**
     * Review/update match result
     */
    action reviewMatch(
        matchResultId     : UUID,
        reviewStatus      : String,   // reviewed, shortlisted, rejected
        notes             : String
    ) returns {
        success           : Boolean;
        message           : String;
    };

    /**
     * Bulk review matches
     */
    action bulkReviewMatches(
        matchResultIds    : array of UUID,
        reviewStatus      : String,
        notes             : String
    ) returns {
        updated           : Integer;
        failed            : Integer;
    };

    /**
     * Shortlist top N candidates for a job
     */
    action shortlistTopCandidates(
        jobPostingId      : UUID,
        count             : Integer,
        minScore          : Decimal,
        notifyRecruiter   : Boolean
    ) returns {
        shortlisted       : Integer;
        candidateIds      : array of UUID;
    };

    // ==========================================
    // FUNCTIONS - Analysis
    // ==========================================

    /**
     * Get match distribution for a job
     */
    function getMatchDistribution(
        jobPostingId      : UUID
    ) returns {
        distribution      : String;   // JSON score distribution
        avgScore          : Decimal;
        medianScore       : Decimal;
        topPercentile     : String;   // JSON top 10% analysis
    };

    /**
     * Get skill gap analysis
     */
    function getSkillGapAnalysis(
        jobPostingId      : UUID
    ) returns {
        requiredSkills    : String;   // JSON with coverage %
        commonGaps        : String;   // JSON most common missing skills
        recommendations   : String;   // JSON hiring recommendations
    };

    /**
     * Compare candidates side by side
     */
    function compareCandidates(
        candidateIds      : array of UUID,
        jobPostingId      : UUID,
        comparisonFactors : array of String
    ) returns {
        comparison        : String;   // JSON comparison matrix
        recommendation    : String;   // JSON AI recommendation
    };

    /**
     * Get matching algorithm explanation
     */
    function explainMatch(
        matchResultId     : UUID
    ) returns {
        explanation       : String;   // Human-readable explanation
        factors           : String;   // JSON factor breakdown
        improvementTips   : String;   // JSON tips for candidate
    };

    // ==========================================
    // EVENTS
    // ==========================================

    event MatchesCalculated {
        jobPostingId      : UUID;
        matchCount        : Integer;
        topScore          : Decimal;
        timestamp         : Timestamp;
    }

    event CandidateShortlisted {
        candidateId       : UUID;
        jobPostingId      : UUID;
        score             : Decimal;
        shortlistedBy     : String;
        timestamp         : Timestamp;
    }

    event MatchReviewed {
        matchResultId     : UUID;
        reviewStatus      : String;
        reviewedBy        : String;
        timestamp         : Timestamp;
    }
}
