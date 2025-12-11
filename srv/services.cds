/**
 * CV Sorting Application - Consolidated Service Definitions
 *
 * Architecture: 3 Services
 * 1. CandidateService - Candidates, CVs, Documents, Skills
 * 2. JobService - Jobs, Matching, Analytics, Notifications, Admin
 * 3. AIService - Joule AI, ML Integration, Embeddings, OCR
 *
 * @see https://cap.cloud.sap/docs/guides/providing-services
 */
using { cv.sorting as db } from '../db/schema';
using { cuid, managed } from '@sap/cds/common';

// ============================================
// CANDIDATE SERVICE
// ============================================
// Handles: Candidates, CVs, Documents, Skills, Interviews
// Merged from: CandidateService, CVProcessingService, CVService

@path: '/api/candidates'
service CandidateService {

    // ----------------------------------------
    // MAIN ENTITIES
    // ----------------------------------------

    @odata.draft.enabled
    entity Candidates as projection on db.Candidates
        actions {
            @cds.odata.bindingparameter.name: '_it'
            action updateStatus(
                newStatus: String not null,
                notes: String,
                notifyCandidate: Boolean
            ) returns Candidates;

            action addSkill(
                skillId: UUID not null,
                proficiencyLevel: String,
                yearsOfExperience: Decimal(4,1)
            ) returns CandidateSkills;

            action markAsDuplicate(
                primaryCandidateId: UUID not null,
                mergeStrategy: String
            ) returns Boolean;
        };

    // Nested compositions
    @cds.redirection.target
    entity CVDocuments as projection on db.CVDocuments;
    entity WorkExperiences as projection on db.WorkExperiences;
    entity Educations as projection on db.Educations;
    entity CandidateSkills as projection on db.CandidateSkills;
    entity CandidateLanguages as projection on db.CandidateLanguages;
    entity Certifications as projection on db.Certifications;
    entity CandidateNotes as projection on db.CandidateNotes;

    entity Interviews as projection on db.Interviews
        actions {
            @cds.odata.bindingparameter.name: '_it'
            action confirm() returns Interviews;

            @cds.odata.bindingparameter.name: '_it'
            action complete(
                overallRating: Integer,
                feedback: String,
                recommendation: String
            ) returns Interviews;

            @cds.odata.bindingparameter.name: '_it'
            action cancel(reason: String) returns Interviews;

            @cds.odata.bindingparameter.name: '_it'
            action reschedule(
                newDateTime: DateTime not null,
                reason: String
            ) returns Interviews;

            @cds.odata.bindingparameter.name: '_it'
            action recordNoShow() returns Interviews;

            @cds.odata.bindingparameter.name: '_it'
            action submitFeedback(
                overallRating: Integer,
                technicalRating: Integer,
                communicationRating: Integer,
                cultureFitRating: Integer,
                feedback: String,
                strengths: String,
                areasOfImprovement: String,
                recommendation: String,
                nextSteps: String
            ) returns Interviews;
        };

    // Document views
    @readonly
    entity Documents as projection on db.CVDocuments {
        *,
        candidate.firstName,
        candidate.lastName,
        candidate.email
    } excluding { fileContent };

    entity DocumentUploads as projection on db.CVDocuments;

    // Value helps
    @readonly entity CandidateStatuses as projection on db.CandidateStatuses;
    @readonly entity DegreeLevels as projection on db.DegreeLevels;
    @readonly entity Skills as projection on db.Skills;
    @readonly entity SkillCategories as projection on db.SkillCategories;
    @readonly entity InterviewTypes as projection on db.InterviewTypes;
    @readonly entity InterviewStatuses as projection on db.InterviewStatuses;

    // ----------------------------------------
    // FUNCTIONS (Read operations)
    // ----------------------------------------

    function searchCandidates(
        query: String,
        skills: array of UUID,
        minExperience: Decimal(4,1),
        maxExperience: Decimal(4,1),
        locations: array of String,
        statuses: array of String,
        sortBy: String,
        sortOrder: String,
        top: Integer,
        skip: Integer
    ) returns many Candidates;

    function findSimilarCandidates(
        candidateId: UUID not null,
        similarityFactors: array of String,
        limit: Integer
    ) returns many {
        candidateId: UUID;
        similarityScore: Decimal(5,2);
        matchingFactors: String;
    };

    function getCandidateTimeline(
        candidateId: UUID not null
    ) returns many {
        timestamp: Timestamp;
        eventType: String;
        description: String;
        userId: String;
        details: String;
    };

    function getCandidateStats(
        candidateId: UUID not null
    ) returns {
        applicationsCount: Integer;
        matchesCount: Integer;
        avgMatchScore: Decimal(5,2);
        topMatchingJobs: String;
    };

    function getProcessingStatus(documentId: UUID) returns {
        status: String;
        progress: Integer;
        currentStep: String;
        estimatedTime: Integer;
    };

    function getExtractedData(documentId: UUID) returns {
        personalInfo: String;
        workExperience: String;
        education: String;
        skills: String;
        certifications: String;
        languages: String;
        rawText: String;
        confidence: Decimal;
    };

    function previewExtraction(
        fileContent: LargeBinary not null,
        mediaType: String not null
    ) returns {
        extractedData: String;
        confidence: Decimal(5,2);
        warnings: array of String;
    };

    // ----------------------------------------
    // ACTIONS (Write operations)
    // ----------------------------------------

    action bulkUpdateStatus(
        candidateIds: array of UUID not null,
        newStatus: String not null,
        notes: String
    ) returns {
        successCount: Integer;
        failedCount: Integer;
        errors: array of { candidateId: UUID; error: String };
    };

    action mergeCandidates(
        primaryId: UUID not null,
        duplicateIds: array of UUID not null,
        mergeStrategy: String
    ) returns {
        success: Boolean;
        mergedCandidateId: UUID;
        mergedRecordsCount: Integer;
    };

    action extractSkillsFromText(
        candidateId: UUID not null,
        sourceText: String not null
    ) returns {
        extractedSkills: array of { skillId: UUID; skillName: String; confidence: Decimal(5,2) };
        linkedCount: Integer;
    };

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

    action processDocument(
        documentId: UUID not null,
        extractionOptions: String
    ) returns {
        success: Boolean;
        extractedData: String;
        confidence: Decimal;
        processingTime: Integer;
    };

    action batchProcessDocuments(
        documentIds: array of UUID
    ) returns {
        processed: Integer;
        failed: Integer;
        results: String;
    };

    action reprocessDocument(
        documentId: UUID not null,
        extractionMethod: String,
        options: String
    ) returns {
        success: Boolean;
        message: String;
    };

    action createCandidateFromDocument(
        documentId: UUID not null,
        additionalData: String,
        autoLinkSkills: Boolean
    ) returns {
        candidateId: UUID;
        linkedSkillsCount: Integer;
        linkedLanguagesCount: Integer;
        linkedCertificationsCount: Integer;
        warnings: array of String;
    };

    // Events
    event DocumentUploaded {
        documentId: UUID;
        fileName: String;
        uploadedBy: String;
        timestamp: Timestamp;
    }

    event DocumentProcessed {
        documentId: UUID;
        success: Boolean;
        candidateId: UUID;
        confidence: Decimal;
        timestamp: Timestamp;
    }

    event ProcessingFailed {
        documentId: UUID;
        errorCode: String;
        errorMessage: String;
        timestamp: Timestamp;
    }
}

// ============================================
// JOB SERVICE
// ============================================
// Handles: Jobs, Matching, Analytics, Notifications, Admin
// Merged from: JobService, MatchingService, AnalyticsService, NotificationService, AdminService

@path: '/api/jobs'
service JobService {

    // ----------------------------------------
    // JOB ENTITIES
    // ----------------------------------------

    @odata.draft.enabled
    @cds.redirection.target
    entity JobPostings as projection on db.JobPostings
        actions {
            action publish() returns JobPostings;
            action close() returns JobPostings;
            action reopen() returns JobPostings;

            @cds.odata.bindingparameter.name: '_it'
            action findMatchingCandidates(
                minScore: Decimal(5,2),
                limit: Integer
            ) returns {
                matchCount: Integer;
                topMatches: String;
            };
        };

    entity JobRequiredSkills as projection on db.JobRequiredSkills;

    entity MatchResults as projection on db.MatchResults {
        *,
        candidate: redirected to CandidateView,
        jobPosting: redirected to JobView
    } actions {
        action review(
            status: String not null,
            notes: String
        ) returns MatchResults;
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

    // Admin entities
    @cds.redirection.target
    entity Skills as projection on db.Skills;
    entity SkillCategories as projection on db.SkillCategories;
    entity SkillRelations as projection on db.SkillRelations;
    entity CandidateStatuses as projection on db.CandidateStatuses;
    @cds.redirection.target
    entity DegreeLevels as projection on db.DegreeLevels;

    @readonly entity AuditLogs as projection on db.AuditLogs;
    @readonly entity WorkflowInstances as projection on db.WorkflowInstances;

    // Notification entities (in-memory)
    @cds.persistence.skip
    entity NotificationThresholds {
        key id: UUID;
        jobPostingId: UUID;
        minScoreThreshold: Decimal default 70.0;
        minCandidatesCount: Integer default 5;
        notifyEmail: String;
        isActive: Boolean default true;
        lastNotifiedAt: Timestamp;
        createdAt: Timestamp;
        updatedAt: Timestamp;
    }

    @cds.persistence.skip
    entity NotificationHistory {
        key id: UUID;
        jobPostingId: UUID;
        notificationType: String enum { threshold_reached; new_match; candidate_update; system_alert; };
        recipientEmail: String;
        subject: String;
        matchCount: Integer;
        topScore: Decimal;
        payload: LargeString;
        sentAt: Timestamp;
        deliveryStatus: String enum { pending; sent; failed };
        errorMessage: String;
    }

    // Value helps
    @readonly entity SkillsValueHelp as projection on db.Skills;
    @readonly entity DegreeLevelsValueHelp as projection on db.DegreeLevels;

    // ----------------------------------------
    // JOB FUNCTIONS
    // ----------------------------------------

    function getJobStatistics(
        jobPostingId: UUID not null
    ) returns {
        totalApplications: Integer;
        avgMatchScore: Decimal(5,2);
        scoreDistribution: String;
        topSkillGaps: array of { skillName: String; gapPercentage: Decimal(5,2) };
    };

    function compareCandidates(
        jobPostingId: UUID not null,
        candidateIds: array of UUID not null
    ) returns {
        comparison: String;
        recommendation: String;
    };

    // ----------------------------------------
    // MATCHING FUNCTIONS & ACTIONS
    // ----------------------------------------

    action calculateMatch(
        candidateId: UUID not null,
        jobPostingId: UUID not null,
        includeBreakdown: Boolean
    ) returns {
        overallScore: Decimal(5,2);
        skillScore: Decimal(5,2);
        experienceScore: Decimal(5,2);
        educationScore: Decimal(5,2);
        locationScore: Decimal(5,2);
        breakdown: String;
        recommendations: array of String;
    };

    action batchMatch(
        jobPostingId: UUID not null,
        candidateIds: array of UUID,
        minScore: Decimal(5,2)
    ) returns {
        totalProcessed: Integer;
        matchesCreated: Integer;
        avgScore: Decimal(5,2);
        processingTime: Integer;
    };

    action rankCandidates(
        jobPostingId: UUID not null,
        sortingConfigId: UUID,
        topN: Integer
    ) returns many MatchResults;

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

    action filterCandidates(
        criteria: {
            skills: array of UUID;
            skillMatchType: String;
            minExperience: Decimal(4,1);
            maxExperience: Decimal(4,1);
            locations: array of String;
            statuses: array of String;
            minScore: Decimal(5,2);
        },
        includeScores: Boolean
    ) returns many {
        candidateId: UUID;
        matchScore: Decimal(5,2);
    };

    function getMatchDistribution(
        jobPostingId: UUID not null
    ) returns {
        totalMatches: Integer;
        avgScore: Decimal(5,2);
        medianScore: Decimal(5,2);
        distribution: String;
    };

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

    function explainMatch(
        matchResultId: UUID not null
    ) returns {
        explanation: String;
        factors: String;
        improvementTips: array of String;
    };

    // ----------------------------------------
    // ANALYTICS FUNCTIONS
    // ----------------------------------------

    function getPipelineOverview(
        fromDate: Date,
        toDate: Date
    ) returns {
        totalCandidates: Integer;
        byStatus: array of { status: String; count: Integer };
        bySource: array of { source: String; count: Integer };
        avgTimeToHire: Decimal(6,2);
        conversionRates: String;
    };

    function getInterviewAnalytics(
        fromDate: Date,
        toDate: Date
    ) returns {
        totalScheduled: Integer;
        completed: Integer;
        cancelled: Integer;
        noShow: Integer;
        avgOverallRating: Decimal(3,2);
        avgTechnicalRating: Decimal(3,2);
        avgCommunicationRating: Decimal(3,2);
        avgCultureFitRating: Decimal(3,2);
        ratingsByType: array of { type: String; avgRating: Decimal(3,2); count: Integer };
        upcomingCount: Integer;
        completionRate: Decimal(5,2);
    };

    function getUpcomingInterviews(
        days: Integer,
        limit: Integer
    ) returns array of {
        interviewId: UUID;
        candidateName: String;
        candidateId: UUID;
        jobTitle: String;
        interviewType: String;
        scheduledAt: DateTime;
        interviewer: String;
        status: String;
    };

    function getSkillAnalytics(
        topN: Integer
    ) returns {
        topSkills: array of { skillName: String; candidateCount: Integer; demandCount: Integer };
        emergingSkills: array of { skillName: String; growthRate: Decimal(5,2) };
        skillGaps: array of { skillName: String; supplyDemandRatio: Decimal(5,2) };
    };

    function getRecruiterMetrics(
        recruiterId: String,
        fromDate: Date,
        toDate: Date
    ) returns {
        candidatesProcessed: Integer;
        averageTimeInStage: String;
        hireRate: Decimal(5,2);
        qualityScore: Decimal(5,2);
    };

    function getTrends(
        metric: String not null,
        period: String,
        fromDate: Date,
        toDate: Date
    ) returns many {
        periodStart: Date;
        value: Decimal(12,2);
        change: Decimal(5,2);
    };

    // ----------------------------------------
    // NOTIFICATION ACTIONS & FUNCTIONS
    // ----------------------------------------

    action setThreshold(
        jobPostingId: UUID,
        minScoreThreshold: Decimal,
        minCandidatesCount: Integer,
        notifyEmail: String,
        isActive: Boolean
    ) returns NotificationThresholds;

    function getThreshold(jobPostingId: UUID) returns NotificationThresholds;

    action deleteThreshold(jobPostingId: UUID) returns { deleted: Boolean };

    action checkAndNotify(
        jobPostingId: UUID,
        matchCount: Integer,
        topCandidates: LargeString
    ) returns {
        shouldNotify: Boolean;
        notificationSent: Boolean;
        reason: String;
    };

    action triggerNotification(
        jobPostingId: UUID,
        notificationType: String,
        customMessage: String
    ) returns {
        sent: Boolean;
        notificationId: UUID;
    };

    function getNotificationHistory(
        jobPostingId: UUID,
        limit: Integer
    ) returns array of NotificationHistory;

    function getLastNotificationTime(jobPostingId: UUID) returns {
        sentAt: Timestamp;
        type: String;
    };

    action recordNotification(
        jobPostingId: UUID,
        notificationType: String,
        matchCount: Integer,
        sentAt: Timestamp
    ) returns { recorded: Boolean };

    function getActiveThresholds() returns array of NotificationThresholds;

    action batchCheckThresholds() returns array of {
        jobPostingId: UUID;
        shouldNotify: Boolean;
        matchCount: Integer;
        threshold: Integer;
    };

    // ----------------------------------------
    // ADMIN ACTIONS
    // ----------------------------------------

    action importSkills(
        skills: array of { name: String; category: String; aliases: array of String }
    ) returns {
        importedCount: Integer;
        skippedCount: Integer;
        errors: array of String;
    };

    action recalculateAllMatches(
        jobPostingId: UUID
    ) returns {
        processedCount: Integer;
        duration: Integer;
    };

    action cleanupData(
        olderThanDays: Integer,
        dryRun: Boolean
    ) returns {
        candidatesArchived: Integer;
        documentsDeleted: Integer;
        auditLogsDeleted: Integer;
    };

    function healthCheck() returns {
        status: String;
        database: String;
        ocr: String;
        jouleAI: String;
        timestamp: Timestamp;
    };
}

// ============================================
// AI SERVICE
// ============================================
// Handles: Joule AI, ML Integration, Embeddings, OCR, Scoring Criteria
// Merged from: JouleService, MLIntegrationService

@path: '/api/ai'
@requires: 'authenticated-user'
service AIService {

    // ----------------------------------------
    // ENTITIES
    // ----------------------------------------

    entity Conversations as projection on db.JouleConversations;
    entity Messages as projection on db.JouleMessages;
    entity Insights as projection on db.JouleInsights;

    @cds.persistence.skip
    entity ScoringCriteria {
        key id: UUID;
        jobPostingId: UUID;
        criteriaType: String enum { skill; language; certification; experience; education; custom; };
        criteriaValue: String;
        points: Integer;
        isRequired: Boolean;
        weight: Decimal;
        minValue: Integer;
        perUnitPoints: Decimal;
        maxPoints: Integer;
        sortOrder: Integer;
    };

    // ----------------------------------------
    // JOULE CONVERSATIONAL AI
    // ----------------------------------------

    action chat(
        sessionId: String,
        message: String,
        context: String
    ) returns {
        response: String;
        actions: String;
        results: String;
        followUpQuestions: array of String;
    };

    action searchWithNaturalLanguage(
        query: String,
        sessionId: String
    ) returns {
        candidates: String;
        totalCount: Integer;
        interpretation: String;
        refinementSuggestions: array of String;
    };

    action applyNaturalLanguageFilter(
        query: String,
        currentResultIds: array of UUID,
        sessionId: String
    ) returns {
        filteredCandidates: String;
        appliedFilter: String;
        removedCount: Integer;
    };

    action applyNaturalLanguageSort(
        query: String,
        candidateIds: array of UUID,
        jobPostingId: UUID,
        sessionId: String
    ) returns {
        sortedCandidates: String;
        sortingLogic: String;
    };

    action generateCandidateSummary(
        candidateId: UUID,
        style: String,
        forJobId: UUID
    ) returns {
        summary: String;
        keyStrengths: array of String;
        potentialConcerns: array of String;
        fitAssessment: String;
    };

    action analyzeJobFit(
        candidateId: UUID,
        jobPostingId: UUID
    ) returns {
        fitScore: Decimal;
        analysis: String;
        strengths: String;
        gaps: String;
        recommendations: String;
    };

    action generateInterviewQuestions(
        candidateId: UUID,
        jobPostingId: UUID,
        focusAreas: array of String,
        questionCount: Integer
    ) returns {
        questions: String;
        rationale: String;
    };

    action analyzePool(
        jobPostingId: UUID
    ) returns {
        poolSize: Integer;
        qualityAssessment: String;
        skillCoverage: String;
        recommendations: String;
        marketInsights: String;
    };

    action compareWithInsights(
        candidateIds: array of UUID,
        jobPostingId: UUID
    ) returns {
        comparison: String;
        recommendation: String;
        tradeoffs: String;
    };

    action getProactiveInsights(
        candidateId: UUID
    ) returns {
        insights: String;
        suggestedActions: String;
    };

    action getJobInsights(
        jobPostingId: UUID
    ) returns {
        insights: String;
        marketAnalysis: String;
        suggestedChanges: String;
    };

    action detectIssues(
        entityType: String,
        entityId: UUID
    ) returns {
        issues: String;
        severity: String;
        resolutions: String;
    };

    action provideFeedback(
        messageId: UUID,
        rating: Integer,
        feedbackText: String,
        wasHelpful: Boolean
    ) returns {
        success: Boolean;
        message: String;
    };

    action learnFromDecision(
        candidateId: UUID,
        jobPostingId: UUID,
        decision: String,
        decisionFactors: String
    ) returns {
        acknowledged: Boolean;
        modelImpact: String;
    };

    function quickStat(query: String) returns {
        answer: String;
        value: String;
        context: String;
    };

    function getConversationHistory(
        sessionId: String,
        limit: Integer
    ) returns {
        messages: String;
    };

    function getSuggestedQueries(
        context: String,
        currentEntityType: String,
        currentEntityId: UUID
    ) returns {
        suggestions: array of String;
    };

    // ----------------------------------------
    // ML INTEGRATION (Embeddings, OCR, Scoring)
    // ----------------------------------------

    action generateCandidateEmbedding(
        candidateId: UUID
    ) returns {
        candidateId: UUID;
        embeddingDimension: Integer;
        stored: Boolean;
        contentHash: String;
    };

    action generateJobEmbedding(
        jobPostingId: UUID
    ) returns {
        jobPostingId: UUID;
        embeddingDimension: Integer;
        stored: Boolean;
        contentHash: String;
    };

    action bulkGenerateEmbeddings(
        entityType: String,
        entityIds: array of UUID
    ) returns {
        processed: Integer;
        failed: Integer;
        errors: array of { entityId: UUID; error: String; };
    };

    action findSemanticMatches(
        jobPostingId: UUID,
        minScore: Decimal,
        limit: Integer,
        includeBreakdown: Boolean,
        excludeDisqualified: Boolean
    ) returns array of {
        candidateId: UUID;
        jobPostingId: UUID;
        cosineSimilarity: Decimal;
        criteriaScore: Decimal;
        criteriaMaxScore: Decimal;
        combinedScore: Decimal;
        rank: Integer;
        scoreBreakdown: LargeString;
        matchedCriteria: LargeString;
        missingCriteria: LargeString;
        disqualified: Boolean;
    };

    action calculateSingleMatch(
        candidateId: UUID,
        jobPostingId: UUID
    ) returns {
        candidateId: UUID;
        jobPostingId: UUID;
        cosineSimilarity: Decimal;
        criteriaScore: Decimal;
        combinedScore: Decimal;
        scoreBreakdown: LargeString;
    };

    action semanticSearch(
        query: String,
        limit: Integer,
        minSimilarity: Decimal
    ) returns array of {
        candidateId: UUID;
        similarity: Decimal;
    };

    action processDocumentOCR(
        documentId: UUID,
        language: String
    ) returns {
        documentId: UUID;
        text: LargeString;
        confidence: Decimal;
        pages: Integer;
        structuredData: LargeString;
    };

    function getScoringCriteria(
        jobPostingId: UUID
    ) returns array of ScoringCriteria;

    action setScoringCriteria(
        jobPostingId: UUID,
        criteria: array of {
            criteriaType: String;
            criteriaValue: String;
            points: Integer;
            isRequired: Boolean;
            weight: Decimal;
            minValue: Integer;
            perUnitPoints: Decimal;
            maxPoints: Integer;
            sortOrder: Integer;
        },
        replaceExisting: Boolean
    ) returns {
        success: Boolean;
        criteriaCount: Integer;
    };

    action addCriterion(
        jobPostingId: UUID,
        criteriaType: String,
        criteriaValue: String,
        points: Integer,
        isRequired: Boolean,
        weight: Decimal
    ) returns ScoringCriteria;

    action deleteCriterion(
        jobPostingId: UUID,
        criterionId: UUID
    ) returns { deleted: Boolean };

    action calculateCriteriaScore(
        jobPostingId: UUID,
        candidateData: LargeString
    ) returns {
        totalPoints: Integer;
        maxPoints: Integer;
        percentage: Decimal;
        matchedCriteria: LargeString;
        missingCriteria: LargeString;
        disqualified: Boolean;
        disqualificationReason: String;
    };

    function getCriteriaTemplates() returns LargeString;

    function getMLServiceHealth() returns {
        status: String;
        embeddingModel: {
            name: String;
            dimension: Integer;
            loaded: Boolean;
        };
        database: Boolean;
        ocr: Boolean;
    };

    // Events
    event JouleQueryProcessed {
        sessionId: String;
        queryType: String;
        processingTime: Integer;
        resultCount: Integer;
        timestamp: Timestamp;
    }

    event InsightGenerated {
        entityType: String;
        entityId: UUID;
        insightType: String;
        confidence: Decimal;
        timestamp: Timestamp;
    }
}
