using { cv.sorting as db } from '../db/schema';

/**
 * Joule AI Copilot Service
 * Provides natural language interface for candidate search,
 * job matching, and intelligent insights
 */
service JouleService @(path: '/joule') {

    // ==========================================
    // ENTITIES
    // ==========================================

    entity Conversations as projection on db.JouleConversations;
    entity Messages as projection on db.JouleMessages;
    entity Insights as projection on db.JouleInsights;

    // ==========================================
    // ACTIONS - Conversational AI
    // ==========================================

    /**
     * Send a message to Joule and get a response
     * Main conversational interface
     */
    action chat(
        sessionId         : String,   // Conversation session ID
        message           : String,   // User's natural language query
        context           : String    // Context: candidate-search, job-matching, analytics
    ) returns {
        response          : String;   // Joule's response
        actions           : String;   // JSON array of suggested actions
        results           : String;   // JSON search/query results if applicable
        followUpQuestions : array of String;
    };

    /**
     * Natural language candidate search
     * "Find me candidates with 5+ years Java experience in Berlin"
     */
    action searchWithNaturalLanguage(
        query             : String,   // Natural language query
        sessionId         : String
    ) returns {
        candidates        : String;   // JSON array of matching candidates
        totalCount        : Integer;
        interpretation    : String;   // How Joule interpreted the query
        refinementSuggestions : array of String;
    };

    /**
     * Natural language filtering
     * "Show only candidates who are currently employed"
     */
    action applyNaturalLanguageFilter(
        query             : String,
        currentResultIds  : array of UUID,
        sessionId         : String
    ) returns {
        filteredCandidates: String;   // JSON filtered results
        appliedFilter     : String;   // Description of applied filter
        removedCount      : Integer;
    };

    /**
     * Natural language sorting
     * "Sort by most relevant experience first"
     */
    action applyNaturalLanguageSort(
        query             : String,
        candidateIds      : array of UUID,
        jobPostingId      : UUID,     // Optional context
        sessionId         : String
    ) returns {
        sortedCandidates  : String;   // JSON sorted results
        sortingLogic      : String;   // Explanation of sorting
    };

    // ==========================================
    // ACTIONS - Intelligent Analysis
    // ==========================================

    /**
     * Generate candidate summary
     * AI-powered candidate profile summary
     */
    action generateCandidateSummary(
        candidateId       : UUID,
        style             : String,   // brief, detailed, executive
        forJobId          : UUID      // Optional: contextualize for specific job
    ) returns {
        summary           : String;
        keyStrengths      : array of String;
        potentialConcerns : array of String;
        fitAssessment     : String;   // If job context provided
    };

    /**
     * Generate job-candidate fit analysis
     */
    action analyzeJobFit(
        candidateId       : UUID,
        jobPostingId      : UUID
    ) returns {
        fitScore          : Decimal;
        analysis          : String;   // Detailed analysis
        strengths         : String;   // JSON array
        gaps              : String;   // JSON array
        recommendations   : String;   // Recommendations for both parties
    };

    /**
     * Generate interview questions
     * AI-generated questions based on candidate profile
     */
    action generateInterviewQuestions(
        candidateId       : UUID,
        jobPostingId      : UUID,
        focusAreas        : array of String,  // skills, experience, culture-fit
        questionCount     : Integer
    ) returns {
        questions         : String;   // JSON array of questions
        rationale         : String;   // Why these questions
    };

    /**
     * Analyze candidate pool for a job
     */
    action analyzePool(
        jobPostingId      : UUID
    ) returns {
        poolSize          : Integer;
        qualityAssessment : String;
        skillCoverage     : String;   // JSON skill coverage analysis
        recommendations   : String;   // Hiring recommendations
        marketInsights    : String;   // Labor market context
    };

    /**
     * Compare candidates with AI insights
     */
    action compareWithInsights(
        candidateIds      : array of UUID,
        jobPostingId      : UUID
    ) returns {
        comparison        : String;   // Structured comparison
        recommendation    : String;   // AI recommendation
        tradeoffs         : String;   // Key tradeoffs between candidates
    };

    // ==========================================
    // ACTIONS - Proactive Insights
    // ==========================================

    /**
     * Get proactive insights for a candidate
     */
    action getProactiveInsights(
        candidateId       : UUID
    ) returns {
        insights          : String;   // JSON array of insights
        suggestedActions  : String;   // JSON suggested actions
    };

    /**
     * Get proactive insights for a job posting
     */
    action getJobInsights(
        jobPostingId      : UUID
    ) returns {
        insights          : String;   // JSON array of insights
        marketAnalysis    : String;
        suggestedChanges  : String;   // Suggested job posting improvements
    };

    /**
     * Detect anomalies or issues
     */
    action detectIssues(
        entityType        : String,   // candidate, job, match
        entityId          : UUID
    ) returns {
        issues            : String;   // JSON array of detected issues
        severity          : String;   // Overall severity
        resolutions       : String;   // Suggested resolutions
    };

    // ==========================================
    // ACTIONS - Learning & Feedback
    // ==========================================

    /**
     * Provide feedback on Joule response
     */
    action provideFeedback(
        messageId         : UUID,
        rating            : Integer,  // 1-5
        feedbackText      : String,
        wasHelpful        : Boolean
    ) returns {
        success           : Boolean;
        message           : String;
    };

    /**
     * Learn from hiring decision
     */
    action learnFromDecision(
        candidateId       : UUID,
        jobPostingId      : UUID,
        decision          : String,   // hired, rejected, withdrawn
        decisionFactors   : String    // JSON factors that influenced decision
    ) returns {
        acknowledged      : Boolean;
        modelImpact       : String;   // How this affects future predictions
    };

    // ==========================================
    // FUNCTIONS - Quick Queries
    // ==========================================

    /**
     * Quick stat query
     * "How many candidates do we have?"
     */
    function quickStat(
        query             : String
    ) returns {
        answer            : String;
        value             : String;
        context           : String;
    };

    /**
     * Get conversation history
     */
    function getConversationHistory(
        sessionId         : String,
        limit             : Integer
    ) returns {
        messages          : String;   // JSON array of messages
    };

    /**
     * Get suggested queries based on context
     */
    function getSuggestedQueries(
        context           : String,
        currentEntityType : String,
        currentEntityId   : UUID
    ) returns {
        suggestions       : array of String;
    };

    // ==========================================
    // EVENTS
    // ==========================================

    event JouleQueryProcessed {
        sessionId         : String;
        queryType         : String;
        processingTime    : Integer;
        resultCount       : Integer;
        timestamp         : Timestamp;
    }

    event InsightGenerated {
        entityType        : String;
        entityId          : UUID;
        insightType       : String;
        confidence        : Decimal;
        timestamp         : Timestamp;
    }
}
