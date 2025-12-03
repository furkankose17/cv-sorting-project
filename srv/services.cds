/**
 * Service Definitions
 * Following SAP CAP Best Practices
 *
 * @see https://cap.cloud.sap/docs/guides/providing-services
 */
using { cv.sorting as db } from '../db/schema';

// ============================================
// CANDIDATE SERVICE
// ============================================

/**
 * Candidate Management Service
 * Provides CRUD operations for candidates and related entities
 */
@path: '/api/candidates'
@requires: 'authenticated-user'
service CandidateService {

    // ----------------------------------------
    // ENTITY EXPOSURES
    // ----------------------------------------

    @odata.draft.enabled
    entity Candidates as projection on db.Candidates
        actions {
            // Status management
            @cds.odata.bindingparameter.name: '_it'
            action updateStatus(
                newStatus: String not null @assert.range enum { screening; interviewing; shortlisted; offered; hired; rejected; withdrawn },
                notes: String,
                notifyCandidate: Boolean default false
            ) returns Candidates;

            // Skill management
            action addSkill(
                skillId: UUID not null,
                proficiencyLevel: String @assert.range enum { beginner; intermediate; advanced; expert },
                yearsOfExperience: Decimal(4,1)
            ) returns CandidateSkills;

            // Duplicate handling
            action markAsDuplicate(
                primaryCandidateId: UUID not null,
                mergeStrategy: String default 'keep-primary'
            ) returns Boolean;
        };

    // Nested compositions accessible through Candidates
    entity CVDocuments as projection on db.CVDocuments;
    entity WorkExperiences as projection on db.WorkExperiences;
    entity Educations as projection on db.Educations;
    entity CandidateSkills as projection on db.CandidateSkills;
    entity CandidateLanguages as projection on db.CandidateLanguages;
    entity Certifications as projection on db.Certifications;
    entity CandidateNotes as projection on db.CandidateNotes;

    // Value helps
    @readonly entity CandidateStatuses as projection on db.CandidateStatuses;
    @readonly entity DegreeLevels as projection on db.DegreeLevels;
    @readonly entity Skills as projection on db.Skills;
    @readonly entity SkillCategories as projection on db.SkillCategories;

    // ----------------------------------------
    // FUNCTIONS (Read operations)
    // ----------------------------------------

    /**
     * Search candidates with advanced filters
     */
    function searchCandidates(
        query: String,
        skills: array of UUID,
        minExperience: Decimal(4,1),
        maxExperience: Decimal(4,1),
        locations: array of String,
        statuses: array of String,
        sortBy: String default 'modifiedAt',
        sortOrder: String default 'desc' @assert.range enum { asc; desc },
        top: Integer default 50 @assert.range: [1, 500],
        skip: Integer default 0
    ) returns many Candidates;

    /**
     * Find similar candidates based on profile
     */
    function findSimilarCandidates(
        candidateId: UUID not null,
        similarityFactors: array of String,
        limit: Integer default 10 @assert.range: [1, 50]
    ) returns many {
        candidate: Candidates;
        similarityScore: Decimal(5,2);
        matchingFactors: array of String;
    };

    /**
     * Get candidate timeline/activity history
     */
    function getCandidateTimeline(
        candidateId: UUID not null
    ) returns many {
        timestamp: Timestamp;
        eventType: String;
        description: String;
        userId: String;
        details: String; // JSON
    };

    // ----------------------------------------
    // ACTIONS (Write operations)
    // ----------------------------------------

    /**
     * Bulk update candidate status
     */
    action bulkUpdateStatus(
        candidateIds: array of UUID not null,
        newStatus: String not null,
        notes: String
    ) returns {
        successCount: Integer;
        failedCount: Integer;
        errors: array of { candidateId: UUID; error: String };
    };

    /**
     * Merge duplicate candidates
     */
    action mergeCandidates(
        primaryId: UUID not null,
        duplicateIds: array of UUID not null,
        mergeStrategy: String default 'merge-all' @assert.range enum { keep_primary; merge_all; select_best }
    ) returns {
        success: Boolean;
        mergedCandidateId: UUID;
        mergedRecordsCount: Integer;
    };

    /**
     * Auto-extract skills from text
     */
    action extractSkillsFromText(
        candidateId: UUID not null,
        sourceText: String not null
    ) returns {
        extractedSkills: array of { skillId: UUID; skillName: String; confidence: Decimal(5,2) };
        linkedCount: Integer;
    };
}

// ============================================
// JOB SERVICE
// ============================================

/**
 * Job Posting Management Service
 */
@path: '/api/jobs'
@requires: 'authenticated-user'
service JobService {

    @odata.draft.enabled
    entity JobPostings as projection on db.JobPostings
        actions {
            // Publishing workflow
            action publish() returns JobPostings;
            action close() returns JobPostings;
            action reopen() returns JobPostings;

            // Matching
            @cds.odata.bindingparameter.name: '_it'
            action findMatchingCandidates(
                minScore: Decimal(5,2) default 30,
                limit: Integer default 100
            ) returns {
                matchCount: Integer;
                topMatches: many MatchResults;
            };
        };

    entity JobRequiredSkills as projection on db.JobRequiredSkills;
    entity MatchResults as projection on db.MatchResults
        actions {
            action review(
                status: String not null @assert.range enum { reviewed; shortlisted; rejected },
                notes: String
            ) returns MatchResults;
        };

    // Value helps
    @readonly entity Skills as projection on db.Skills;
    @readonly entity DegreeLevels as projection on db.DegreeLevels;

    // ----------------------------------------
    // FUNCTIONS
    // ----------------------------------------

    /**
     * Get job posting statistics
     */
    function getJobStatistics(
        jobPostingId: UUID not null
    ) returns {
        totalApplications: Integer;
        avgMatchScore: Decimal(5,2);
        scoreDistribution: String; // JSON
        topSkillGaps: array of { skillName: String; gapPercentage: Decimal(5,2) };
    };

    /**
     * Compare candidates for a job
     */
    function compareCandidates(
        jobPostingId: UUID not null,
        candidateIds: array of UUID not null
    ) returns {
        comparison: String; // JSON matrix
        recommendation: String;
    };
}

// ============================================
// CV PROCESSING SERVICE
// ============================================

/**
 * CV Upload and Processing Service
 */
@path: '/api/cv'
@requires: 'authenticated-user'
service CVProcessingService {

    entity Documents as projection on db.CVDocuments excluding { fileContent }
        actions {
            // Processing actions
            @cds.odata.bindingparameter.name: '_it'
            action process(
                options: String // JSON extraction options
            ) returns {
                success: Boolean;
                confidence: Decimal(5,2);
                extractedData: String; // JSON
                processingTime: Integer;
            };

            action reprocess() returns Documents;
        };

    // For file uploads with content
    entity DocumentUploads as projection on db.CVDocuments;

    // ----------------------------------------
    // ACTIONS
    // ----------------------------------------

    /**
     * Upload and process a new CV document
     */
    action uploadDocument(
        fileName: String not null,
        fileContent: LargeBinary not null,
        mediaType: String not null,
        candidateId: UUID
    ) returns {
        documentId: UUID;
        processingStatus: String;
        message: String;
    };

    /**
     * Create candidate profile from extracted data
     */
    action createCandidateFromDocument(
        documentId: UUID not null,
        additionalData: String, // JSON
        autoLinkSkills: Boolean default true
    ) returns {
        candidateId: UUID;
        linkedSkillsCount: Integer;
        warnings: array of String;
    };

    /**
     * Preview extraction without saving
     */
    function previewExtraction(
        fileContent: LargeBinary not null,
        mediaType: String not null
    ) returns {
        extractedData: String; // JSON
        confidence: Decimal(5,2);
        warnings: array of String;
    };
}

// ============================================
// MATCHING SERVICE
// ============================================

/**
 * Candidate-Job Matching Service
 */
@path: '/api/matching'
@requires: 'authenticated-user'
service MatchingService {

    @readonly
    entity MatchResults as projection on db.MatchResults {
        *,
        candidate: redirected to CandidateView,
        jobPosting: redirected to JobView
    };

    @readonly
    entity CandidateView as projection on db.Candidates {
        ID, firstName, lastName, email, headline,
        totalExperienceYears, city, country, status, overallScore
    };

    @readonly
    entity JobView as projection on db.JobPostings {
        ID, title, department, location, status, employmentType
    };

    entity SortingConfigurations as projection on db.SortingConfigurations;
    entity SavedFilters as projection on db.SavedFilters;

    // ----------------------------------------
    // MATCHING ACTIONS
    // ----------------------------------------

    /**
     * Calculate match score for candidate-job pair
     */
    action calculateMatch(
        candidateId: UUID not null,
        jobPostingId: UUID not null,
        includeBreakdown: Boolean default true
    ) returns {
        overallScore: Decimal(5,2);
        skillScore: Decimal(5,2);
        experienceScore: Decimal(5,2);
        educationScore: Decimal(5,2);
        locationScore: Decimal(5,2);
        breakdown: String; // JSON
        recommendations: array of String;
    };

    /**
     * Batch calculate matches for a job
     */
    action batchMatch(
        jobPostingId: UUID not null,
        candidateIds: array of UUID,
        minScore: Decimal(5,2) default 0
    ) returns {
        totalProcessed: Integer;
        matchesCreated: Integer;
        avgScore: Decimal(5,2);
        processingTime: Integer;
    };

    /**
     * Rank candidates for a job
     */
    action rankCandidates(
        jobPostingId: UUID not null,
        sortingConfigId: UUID,
        topN: Integer default 50
    ) returns many MatchResults;

    /**
     * Sort candidates with custom weights
     */
    action sortCandidates(
        candidateIds: array of UUID not null,
        weights: {
            skillWeight: Decimal(3,2);
            experienceWeight: Decimal(3,2);
            educationWeight: Decimal(3,2);
            locationWeight: Decimal(3,2);
        },
        jobPostingId: UUID
    ) returns many {
        candidateId: UUID;
        sortScore: Decimal(5,2);
        breakdown: String;
    };

    /**
     * Filter candidates with criteria
     */
    action filterCandidates(
        criteria: {
            skills: array of UUID;
            skillMatchType: String; // all, any
            minExperience: Decimal(4,1);
            maxExperience: Decimal(4,1);
            locations: array of String;
            statuses: array of String;
            minScore: Decimal(5,2);
        },
        includeScores: Boolean default false
    ) returns many {
        candidateId: UUID;
        matchScore: Decimal(5,2);
    };

    // ----------------------------------------
    // ANALYSIS FUNCTIONS
    // ----------------------------------------

    /**
     * Get match distribution analytics
     */
    function getMatchDistribution(
        jobPostingId: UUID not null
    ) returns {
        totalMatches: Integer;
        avgScore: Decimal(5,2);
        medianScore: Decimal(5,2);
        distribution: String; // JSON buckets
    };

    /**
     * Skill gap analysis for a job
     */
    function analyzeSkillGaps(
        jobPostingId: UUID not null
    ) returns {
        requiredSkills: array of {
            skillId: UUID;
            skillName: String;
            coveragePercentage: Decimal(5,2);
            avgProficiency: String;
        };
        mostCommonGaps: array of { skillName: String; missingCount: Integer };
        recommendations: array of String;
    };

    /**
     * Explain match score
     */
    function explainMatch(
        matchResultId: UUID not null
    ) returns {
        explanation: String;
        factors: String; // JSON
        improvementTips: array of String;
    };
}

// ============================================
// ADMIN SERVICE
// ============================================

/**
 * Administrative Service
 */
@path: '/api/admin'
@requires: 'CVAdmin'
service AdminService {

    entity Skills as projection on db.Skills;
    entity SkillCategories as projection on db.SkillCategories;
    entity SkillRelations as projection on db.SkillRelations;
    entity CandidateStatuses as projection on db.CandidateStatuses;
    entity DegreeLevels as projection on db.DegreeLevels;

    @readonly entity AuditLogs as projection on db.AuditLogs;
    @readonly entity WorkflowInstances as projection on db.WorkflowInstances;

    // ----------------------------------------
    // ADMIN ACTIONS
    // ----------------------------------------

    /**
     * Import skills from external source
     */
    action importSkills(
        skills: array of { name: String; category: String; aliases: array of String }
    ) returns {
        importedCount: Integer;
        skippedCount: Integer;
        errors: array of String;
    };

    /**
     * Recalculate all match scores
     */
    action recalculateAllMatches(
        jobPostingId: UUID
    ) returns {
        processedCount: Integer;
        duration: Integer;
    };

    /**
     * Clean up old/orphaned data
     */
    action cleanupData(
        olderThanDays: Integer default 365,
        dryRun: Boolean default true
    ) returns {
        candidatesArchived: Integer;
        documentsDeleted: Integer;
        auditLogsDeleted: Integer;
    };

    /**
     * System health check
     */
    function healthCheck() returns {
        status: String;
        database: String;
        ocr: String;
        ai: {
            provider: String;
            model: String;
            status: String;
        };
        timestamp: Timestamp;
    };
}

// ============================================
// ANALYTICS SERVICE (READ-ONLY)
// ============================================

/**
 * Analytics and Reporting Service
 */
@path: '/api/analytics'
@requires: 'authenticated-user'
@readonly
service AnalyticsService {

    // Pipeline overview
    function getPipelineOverview(
        fromDate: Date,
        toDate: Date
    ) returns {
        totalCandidates: Integer;
        byStatus: array of { status: String; count: Integer };
        bySource: array of { source: String; count: Integer };
        avgTimeToHire: Decimal(6,2);
        conversionRates: String; // JSON
    };

    // Skill analytics
    function getSkillAnalytics(
        topN: Integer default 20
    ) returns {
        topSkills: array of { skillName: String; candidateCount: Integer; demandCount: Integer };
        emergingSkills: array of { skillName: String; growthRate: Decimal(5,2) };
        skillGaps: array of { skillName: String; supplyDemandRatio: Decimal(5,2) };
    };

    // Recruiter performance
    function getRecruiterMetrics(
        recruiterId: String,
        fromDate: Date,
        toDate: Date
    ) returns {
        candidatesProcessed: Integer;
        averageTimeInStage: String; // JSON by stage
        hireRate: Decimal(5,2);
        qualityScore: Decimal(5,2);
    };

    // Time-based trends
    function getTrends(
        metric: String not null @assert.range enum { applications; hires; time_to_hire; match_scores },
        period: String default 'monthly' @assert.range enum { daily; weekly; monthly },
        fromDate: Date,
        toDate: Date
    ) returns many {
        periodStart: Date;
        value: Decimal(12,2);
        change: Decimal(5,2);
    };
}
