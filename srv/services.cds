/**
 * CV Sorting Application - Unified Service
 *
 * Single consolidated service combining:
 * - Candidate Management (CRUD, documents, skills, interviews)
 * - Job Management (postings, matching, analytics, notifications)
 * - AI/ML Integration (Joule AI, embeddings, OCR, scoring)
 *
 * @path /api
 */
using { cv.sorting as db } from '../db/schema';
using { cuid, managed } from '@sap/cds/common';

@path: '/api'
@impl: './cv-sorting-service.js'
service CVSortingService {

    // ============================================
    // CANDIDATE DOMAIN
    // ============================================

    @odata.draft.enabled
    @cds.redirection.target
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

    @cds.redirection.target
    entity CVDocuments as projection on db.CVDocuments;
    entity WorkExperiences as projection on db.WorkExperiences;
    entity Educations as projection on db.Educations;
    entity CandidateSkills as projection on db.CandidateSkills;
    entity CandidateLanguages as projection on db.CandidateLanguages;
    entity Certifications as projection on db.Certifications;
    entity CandidateNotes as projection on db.CandidateNotes;

    @readonly
    entity ProcessingQueue as projection on db.ProcessingQueue;

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

    @readonly
    entity Documents as projection on db.CVDocuments {
        *,
        candidate.firstName,
        candidate.lastName,
        candidate.email
    } excluding { fileContent }
    actions {
        action process() returns {
            documentId: UUID;
            status: String;
            text: LargeString;
            confidence: Decimal;
        };
    };

    entity DocumentUploads as projection on db.CVDocuments;

    // Candidate Functions
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

    // Candidate Actions
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
        candidateId: UUID;
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

    // ============================================
    // JOB DOMAIN
    // ============================================

    @odata.draft.enabled
    @cds.redirection.target
    entity JobPostings as projection on db.JobPostings {
        *,
        virtual null as statusCriticality : Integer
    }
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
        jobPosting: redirected to JobView,
        virtual null as scoreCriticality : Integer,
        virtual null as reviewStatusCriticality : Integer
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

    // Semantic Matching with Feedback Loop
    entity MatchFeedback as projection on db.MatchFeedback;
    entity JobEmbeddings as projection on db.JobEmbeddings;

    @readonly entity AuditLogs as projection on db.AuditLogs;
    @readonly entity WorkflowInstances as projection on db.WorkflowInstances;

    // Job Functions
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

    // Matching Functions & Actions
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
        minScore: Decimal(5,2),
        useSemanticMatching: Boolean  // Enable ML semantic matching (defaults to true in handler)
    ) returns {
        totalProcessed: Integer;
        matchesCreated: Integer;
        avgScore: Decimal(5,2);
        processingTime: Integer;
        mlUsed: Boolean;  // Whether ML service was used
    };

    // Match a single candidate against all published jobs
    action matchCandidateWithAllJobs(
        candidateId: UUID not null,
        minScore: Decimal(5,2),
        useSemanticMatching: Boolean
    ) returns {
        totalJobsProcessed: Integer;
        matchesCreated: Integer;
        matchesUpdated: Integer;
        topMatches: array of {
            jobPostingId: UUID;
            jobTitle: String;
            overallScore: Decimal(5,2);
            rank: Integer;
        };
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

    // Analytics Functions
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

    // Notification Actions
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

    // Admin Actions
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

    // ============================================
    // AI/ML DOMAIN
    // ============================================

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

    // AI Search Assistant Action
    action aiSearch(
        query: String not null,
        contextJobId: UUID,
        contextCandidateId: UUID
    ) returns {
        intent: String;
        message: String;
        results: array of {
            type: String;           // 'candidate' | 'job'
            id: UUID;
            title: String;          // name or job title
            subtitle: String;       // skills or department
            score: Decimal;
            metadata: LargeString;  // JSON string for extra data
        };
        totalCount: Integer;
    };

    // Joule AI Actions
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

    // ML Integration Actions
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

    // Semantic Matching Feedback Actions
    action submitMatchFeedback(
        matchResultId: UUID not null,
        feedbackType: String not null,  // 'positive' or 'negative'
        notes: String
    ) returns {
        success: Boolean;
        feedbackId: UUID;
        newMultiplier: Decimal;
    };

    action removeMatchFeedback(
        feedbackId: UUID not null
    ) returns {
        success: Boolean;
        newMultiplier: Decimal;
    };

    action refreshMatchScores(
        jobPostingId: UUID not null
    ) returns {
        matchesUpdated: Integer;
        avgScoreChange: Decimal;
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

    // ============================================
    // OCR PROCESSING ACTIONS
    // ============================================

    /**
     * Upload and process single CV with OCR
     */
    action uploadAndProcessCV(
        fileName: String not null,
        fileContent: LargeBinary not null,
        mediaType: String not null,
        autoCreate: Boolean
    ) returns {
        documentId: UUID;
        ocrStatus: String;
        confidence: Decimal;
        extractedData: String;
        candidateId: UUID;
        requiresReview: Boolean;
    };

    /**
     * Upload batch of CVs for processing
     */
    action uploadBatchCVs(
        files: array of {
            fileName: String;
            fileContent: LargeBinary;
            mediaType: String;
        },
        autoCreateThreshold: Decimal
    ) returns {
        queueId: UUID;
        totalFiles: Integer;
        estimatedTime: Integer;
    };

    /**
     * Get batch processing progress
     */
    function getBatchProgress(queueId: UUID not null) returns {
        status: String;
        totalFiles: Integer;
        processed: Integer;
        autoCreated: Integer;
        reviewRequired: Integer;
        failed: Integer;
        currentFile: String;
        estimatedTimeRemaining: Integer;
    };

    /**
     * Review and create candidate from low-confidence extraction
     */
    action reviewAndCreateCandidate(
        documentId: UUID not null,
        editedData: String not null
    ) returns {
        candidateId: UUID;
        linkedSkillsCount: Integer;
        embeddingGenerated: Boolean;
    };

    // ============================================
    // EMAIL NOTIFICATION FUNCTIONS
    // ============================================

    /**
     * Get candidates with pending status change notifications
     * Returns status changes that don't have corresponding sent email notifications
     */
    function getPendingStatusNotifications() returns array of {
        candidate_ID: UUID;
        statusHistory_ID: UUID;
        previousStatus: String(50);
        newStatus: String(50);
        changedAt: Timestamp;
        recipientEmail: String(255);
    };

    /**
     * Mark notification as sent after n8n successfully sends email
     * Called by n8n workflows after email delivery
     */
    action markNotificationSent(
        statusHistory_ID: UUID not null,
        candidate_ID: UUID not null,
        jobPosting_ID: UUID,
        recipientEmail: String(255) not null,
        subject: String(500),
        templateUsed: String(100),
        n8nExecutionId: String(100)
    ) returns {
        success: Boolean;
        notificationId: UUID;
    };

    // Email automation - pending interview reminders for n8n polling
    function getPendingInterviewReminders() returns array of {
        interviewId      : UUID;
        candidateId      : UUID;
        candidateEmail   : String;
        candidateName    : String;
        jobTitle         : String;
        scheduledAt      : DateTime;
        interviewTitle   : String;
        location         : String;
        meetingLink      : String;
        interviewerName  : String;
        interviewerEmail : String;
    };

    // Email automation - mark reminder as sent (called by n8n after sending)
    action markInterviewReminderSent(interviewId: UUID) returns Boolean;

    // Email automation - log notification (called by n8n after sending email)
    action logEmailNotification(
        candidateId      : UUID,
        jobPostingId     : UUID,
        notificationType : String,
        recipientEmail   : String,
        subject          : String,
        templateUsed     : String,
        deliveryStatus   : String
    ) returns UUID;

    // ============================================
    // EMAIL NOTIFICATIONS DOMAIN
    // ============================================

    @readonly
    entity EmailNotifications as projection on db.EmailNotifications {
        *,
        candidate.firstName as candidateFirstName,
        candidate.lastName as candidateLastName,
        candidate.email as candidateEmail,
        jobPosting.title as jobTitle
    };

    entity NotificationSettings as projection on db.NotificationSettings;

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

    // ============================================
    // SHARED MASTER DATA
    // ============================================

    @cds.redirection.target
    entity Skills as projection on db.Skills;
    entity SkillCategories as projection on db.SkillCategories;
    entity SkillRelations as projection on db.SkillRelations;
    @readonly entity CandidateStatuses as projection on db.CandidateStatuses;
    @cds.redirection.target
    entity DegreeLevels as projection on db.DegreeLevels;
    @readonly entity InterviewTypes as projection on db.InterviewTypes;
    @readonly entity InterviewStatuses as projection on db.InterviewStatuses;

    // ============================================
    // SCORING RULE ENGINE
    // ============================================

    @cds.redirection.target
    entity ScoringRuleTemplates as projection on db.ScoringRuleTemplates
        actions {
            action activate() returns ScoringRuleTemplates;
            action deactivate() returns ScoringRuleTemplates;
            action duplicate(newName: String) returns ScoringRuleTemplates;
        };

    @cds.redirection.target
    entity ScoringRules as projection on db.ScoringRules
        actions {
            action activate() returns ScoringRules;
            action deactivate() returns ScoringRules;
            action testRule(
                candidateData: String,
                jobData: String
            ) returns {
                wouldMatch: Boolean;
                conditionResult: Boolean;
                actionResult: String;
                beforeScore: Decimal;
                afterScore: Decimal;
            };
        };

    // Rule Engine Functions
    function getRuleTemplates(
        category: String,
        isGlobal: Boolean
    ) returns array of {
        templateId: UUID;
        name: String;
        description: String;
        category: String;
        ruleCount: Integer;
        usageCount: Integer;
    };

    function evaluateRulesForJob(
        jobPostingId: UUID not null,
        candidateId: UUID not null,
        includeAuditTrail: Boolean
    ) returns {
        totalRulesEvaluated: Integer;
        rulesMatched: Integer;
        preFilterPassed: Boolean;
        disqualified: Boolean;
        disqualificationReason: String;
        originalScore: Decimal;
        finalScore: Decimal;
        auditTrail: array of {
            ruleId: UUID;
            ruleName: String;
            matched: Boolean;
            actionTaken: String;
            scoreImpact: Decimal;
        };
    };

    function validateRuleSyntax(
        conditions: String not null,
        actions: String not null
    ) returns {
        valid: Boolean;
        errors: array of String;
        warnings: array of String;
    };

    // Rule Engine Actions
    action applyTemplateToJob(
        jobPostingId: UUID not null,
        templateId: UUID not null,
        replaceExisting: Boolean
    ) returns {
        success: Boolean;
        rulesApplied: Integer;
    };

    action dryRunMatching(
        jobPostingId: UUID not null,
        candidateIds: array of UUID,
        testRules: array of {
            ruleType: String;
            conditions: String;
            actions: String;
            priority: Integer;
        }
    ) returns array of {
        candidateId: UUID;
        currentScore: Decimal;
        projectedScore: Decimal;
        scoreDelta: Decimal;
        rulesApplied: Integer;
        wouldBeDisqualified: Boolean;
    };

    action createRuleTemplate(
        name: String not null,
        description: String,
        category: String,
        rules: array of {
            name: String;
            ruleType: String;
            conditions: String;
            actions: String;
            priority: Integer;
        }
    ) returns {
        templateId: UUID;
        rulesCreated: Integer;
    };

    // ============================================
    // EVENTS
    // ============================================

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

    event JouleQueryProcessed {
        sessionId: String;
        queryType: String;
        processingTime: Integer;
        resultCount: Integer;
        timestamp: Timestamp;
    }
}
