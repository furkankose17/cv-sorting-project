using { cv.sorting as db } from '../db/schema';

/**
 * Candidate Management Service
 * Handles candidate CRUD, status management, and searches
 */
service CandidateService @(path: '/candidate') {

    // ==========================================
    // ENTITIES
    // ==========================================

    entity Candidates as projection on db.Candidates {
        *,
        documents: redirected to Documents,
        experiences: redirected to WorkExperiences,
        educations: redirected to Educations,
        skills: redirected to CandidateSkills
    };

    entity Documents as projection on db.CVDocuments excluding { fileContent };
    entity WorkExperiences as projection on db.WorkExperiences;
    entity Educations as projection on db.Educations;
    entity CandidateSkills as projection on db.CandidateSkills;
    entity CandidateLanguages as projection on db.CandidateLanguages;
    entity Certifications as projection on db.Certifications;
    entity CandidateNotes as projection on db.CandidateNotes;

    // Value help entities
    @readonly entity CandidateStatuses as projection on db.CandidateStatuses;
    @readonly entity Skills as projection on db.Skills;
    @readonly entity SkillCategories as projection on db.SkillCategories;
    @readonly entity DegreeLevels as projection on db.DegreeLevels;

    // ==========================================
    // ACTIONS - Status Management
    // ==========================================

    /**
     * Update candidate status with optional notes
     */
    action updateStatus(
        candidateId   : UUID,
        newStatus     : String,
        notes         : String,
        notifyCandidate : Boolean
    ) returns {
        success       : Boolean;
        previousStatus: String;
        currentStatus : String;
        message       : String;
    };

    /**
     * Bulk status update for multiple candidates
     */
    action bulkUpdateStatus(
        candidateIds  : array of UUID,
        newStatus     : String,
        notes         : String
    ) returns {
        updated       : Integer;
        failed        : Integer;
        results       : String;  // JSON details
    };

    /**
     * Archive candidate (soft delete)
     */
    action archiveCandidate(
        candidateId   : UUID,
        reason        : String
    ) returns {
        success       : Boolean;
        message       : String;
    };

    /**
     * Merge duplicate candidates
     */
    action mergeCandidates(
        primaryId     : UUID,
        duplicateIds  : array of UUID,
        mergeStrategy : String  // keep-primary, merge-all, select-best
    ) returns {
        success       : Boolean;
        mergedId      : UUID;
        message       : String;
    };

    // ==========================================
    // ACTIONS - Skill Management
    // ==========================================

    /**
     * Add skill to candidate
     */
    action addSkill(
        candidateId       : UUID,
        skillId           : UUID,
        proficiencyLevel  : String,
        yearsOfExperience : Decimal
    ) returns {
        success           : Boolean;
        candidateSkillId  : UUID;
    };

    /**
     * Auto-link skills from text analysis
     */
    action autoLinkSkills(
        candidateId       : UUID,
        sourceText        : String  // Text to analyze for skills
    ) returns {
        linkedSkills      : Integer;
        suggestedSkills   : String;  // JSON array of suggested but not auto-linked
    };

    /**
     * Verify candidate skill (by recruiter/interviewer)
     */
    action verifySkill(
        candidateSkillId  : UUID,
        isVerified        : Boolean,
        actualProficiency : String,
        notes             : String
    ) returns {
        success           : Boolean;
    };

    // ==========================================
    // FUNCTIONS - Search & Query
    // ==========================================

    /**
     * Advanced candidate search
     */
    function searchCandidates(
        query             : String,   // Free text search
        skills            : array of UUID,  // Required skills
        minExperience     : Decimal,
        maxExperience     : Decimal,
        locations         : array of String,
        statuses          : array of String,
        educationLevel    : String,
        sortBy            : String,   // relevance, experience, date, score
        sortOrder         : String,   // asc, desc
        limit             : Integer,
        offset            : Integer
    ) returns {
        candidates        : String;   // JSON array
        totalCount        : Integer;
        facets            : String;   // JSON facets for filtering UI
    };

    /**
     * Find similar candidates
     */
    function findSimilarCandidates(
        candidateId       : UUID,
        similarityFactors : array of String,  // skills, experience, education
        limit             : Integer
    ) returns {
        candidates        : String;   // JSON array with similarity scores
    };

    /**
     * Get candidate timeline (activity history)
     */
    function getCandidateTimeline(
        candidateId       : UUID
    ) returns {
        timeline          : String;   // JSON array of events
    };

    /**
     * Get candidate statistics
     */
    function getCandidateStats(
        candidateId       : UUID
    ) returns {
        applicationsCount : Integer;
        matchesCount      : Integer;
        avgMatchScore     : Decimal;
        topMatchingJobs   : String;   // JSON array
    };

    // ==========================================
    // EVENTS
    // ==========================================

    event CandidateCreated {
        candidateId       : UUID;
        email             : String;
        source            : String;
        timestamp         : Timestamp;
    }

    event CandidateStatusChanged {
        candidateId       : UUID;
        previousStatus    : String;
        newStatus         : String;
        changedBy         : String;
        timestamp         : Timestamp;
    }

    event CandidateSkillVerified {
        candidateId       : UUID;
        skillId           : UUID;
        verifiedBy        : String;
        timestamp         : Timestamp;
    }
}
