/**
 * CV Sorting Domain Model
 * Following SAP CAP Best Practices
 *
 * @see https://cap.cloud.sap/docs/guides/domain-modeling
 */
namespace cv.sorting;

using {
    cuid,
    managed,
    sap.common.CodeList,
    Currency,
    Country
} from '@sap/cds/common';

using {
    cv.sorting.common.Email,
    cv.sorting.common.Phone,
    cv.sorting.common.URL,
    cv.sorting.common.Score,
    cv.sorting.common.Percentage,
    cv.sorting.common.YearsExperience,
    cv.sorting.common.CandidateStatusCode,
    cv.sorting.common.ProcessingStatus,
    cv.sorting.common.JobStatus,
    cv.sorting.common.ReviewStatus,
    cv.sorting.common.ProficiencyLevel,
    cv.sorting.common.LanguageProficiency,
    cv.sorting.common.EmploymentType,
    cv.sorting.common.LocationType,
    cv.sorting.common.AuditTrail,
    cv.sorting.common.SoftDelete,
    cv.sorting.common.Taggable
} from './common';

// ============================================
// CORE ENTITIES
// ============================================

/**
 * Candidates - Main entity for job applicants
 */
entity Candidates : cuid, managed, AuditTrail, SoftDelete, Taggable {
    // Personal Information
    firstName             : String(100) not null;
    lastName              : String(100) not null;
    email                 : Email not null;
    phone                 : Phone;
    linkedInUrl           : URL;
    portfolioUrl          : URL;

    // Location
    country               : Country;
    city                  : String(100);
    address               : String(500);

    // Professional Summary
    headline              : String(500);
    summary               : LargeString;
    totalExperienceYears  : YearsExperience;
    currentSalary         : Decimal(12,2);
    expectedSalary        : Decimal(12,2);
    salaryCurrency        : Currency;
    noticePeriodDays      : Integer;
    availableFrom         : Date;
    willingToRelocate     : Boolean default false;

    // Status & Scoring
    status                : Association to CandidateStatuses @assert.target;
    overallScore          : Score;
    aiConfidenceScore     : Percentage;

    // Compositions (owned by candidate)
    documents             : Composition of many CVDocuments on documents.candidate = $self;
    experiences           : Composition of many WorkExperiences on experiences.candidate = $self;
    educations            : Composition of many Educations on educations.candidate = $self;
    skills                : Composition of many CandidateSkills on skills.candidate = $self;
    languages             : Composition of many CandidateLanguages on languages.candidate = $self;
    certifications        : Composition of many Certifications on certifications.candidate = $self;
    notes                 : Composition of many CandidateNotes on notes.candidate = $self;
    interviews            : Composition of many Interviews on interviews.candidate = $self;

    // Associations
    matchResults          : Association to many MatchResults on matchResults.candidate = $self;

    // Source tracking
    source                : String(100);
    referredBy            : String(200);

    // Virtual/Calculated fields (computed in service layer)
    virtual fullName      : String(201);
}

/**
 * CV Documents - Uploaded resume/CV files
 */
entity CVDocuments : cuid, managed {
    candidate             : Association to Candidates;

    // File Information
    fileName              : String(255) not null;
    fileType              : String(50);
    fileSize              : Integer;
    @Core.MediaType: mediaType
    @Core.ContentDisposition.Filename: fileName
    fileContent           : LargeBinary;
    mediaType             : String(100);

    // Processing Status
    processingStatus      : ProcessingStatus default 'pending';
    processedAt           : Timestamp;

    // Extracted Data
    // Note: extractedText is reused by OCR processing workflow
    // Initial CV extraction populates this field, OCR may enhance it
    @Core.MediaType: 'text/plain'
    extractedText         : LargeString;
    @Core.MediaType: 'application/json'
    extractedData         : LargeString;

    // AI Processing Metrics
    // Note: ocrConfidence is reused by OCR processing workflow
    // Represents confidence level of OCR text extraction (0.0-1.0)
    ocrConfidence         : Percentage;
    extractionMethod      : String(50);
    processingDuration    : Integer; // milliseconds
    errorMessage          : String(1000);

    // Version Control
    isLatest              : Boolean default true;
    version               : Integer default 1;
    previousVersion       : Association to CVDocuments;

    // OCR Processing Fields
    // OCR workflow states: pending → processing → completed/failed/review_required
    // - pending: Initial state, awaiting OCR processing
    // - processing: OCR extraction in progress
    // - completed: OCR successfully extracted and validated
    // - failed: OCR processing encountered an error
    // - review_required: OCR confidence below threshold, needs human review
    ocrStatus             : String enum {
        pending;
        processing;
        completed;
        failed;
        review_required;
    } default 'pending';
    // Structured JSON data extracted by OCR (skills, experience, education, etc.)
    structuredData        : LargeString;
    // OCR extraction method used (e.g., 'tesseract', 'azure', 'aws-textract')
    ocrMethod             : String(50);
    // Timestamp when OCR processing completed
    ocrProcessedAt        : Timestamp;
    // OCR processing duration in milliseconds
    ocrProcessingTime     : Integer;
    // User who reviewed OCR results (when ocrStatus = 'review_required')
    reviewedBy            : String(255);
    // Timestamp when OCR results were reviewed
    reviewedAt            : Timestamp;
}

/**
 * Batch CV Processing Queue
 * Tracks batch upload jobs with progress and results
 */
entity ProcessingQueue : cuid, managed {
    userId                 : String(255) not null;
    status                 : String enum {
        queued;
        processing;
        completed;
        partial;
        failed;
    } default 'queued';
    totalFiles             : Integer default 0;
    processedCount         : Integer default 0;
    autoCreatedCount       : Integer default 0;
    reviewRequiredCount    : Integer default 0;
    failedCount            : Integer default 0;
    currentFile            : String(500);
    autoCreateThreshold    : Decimal(5,2) default 85.0;
    startedAt              : Timestamp;
    completedAt            : Timestamp;
    estimatedTimeRemaining : Integer;
}

/**
 * Work Experience entries
 */
entity WorkExperiences : cuid, managed {
    candidate             : Association to Candidates not null;

    companyName           : String(200) not null;
    jobTitle              : String(200) not null;
    department            : String(100);
    location              : String(200);
    country               : Country;

    startDate             : Date not null;
    endDate               : Date;
    isCurrent             : Boolean default false;

    @Core.MediaType: 'text/plain'
    description           : LargeString;
    achievements          : LargeString;

    // Calculated
    durationMonths        : Integer;

    // Classification
    industry              : String(100);
    companySize           : String(50);

    // Skills used (denormalized for performance)
    skillsUsed            : many String(100);
}

/**
 * Education entries
 */
entity Educations : cuid, managed {
    candidate             : Association to Candidates not null;

    institution           : String(300) not null;
    degree                : String(200);
    fieldOfStudy          : String(200);

    startDate             : Date;
    endDate               : Date;
    isOngoing             : Boolean default false;

    grade                 : String(50);
    gpa                   : Decimal(3,2);
    maxGpa                : Decimal(3,2);

    description           : LargeString;
    honors                : String(200);

    // Classification
    degreeLevel           : Association to DegreeLevels;
    country               : Country;
}

/**
 * Candidate Skills with proficiency
 */
entity CandidateSkills : cuid, managed {
    candidate             : Association to Candidates not null;
    skill                 : Association to Skills not null @assert.target;

    proficiencyLevel      : ProficiencyLevel default 'intermediate';
    yearsOfExperience     : YearsExperience;
    lastUsedDate          : Date;

    isVerified            : Boolean default false;
    verifiedBy            : String(100);
    verifiedAt            : Timestamp;

    source                : String(50) default 'extracted'; // extracted, manual, inferred
    confidenceScore       : Percentage;
}

/**
 * Candidate Languages
 */
entity CandidateLanguages : cuid, managed {
    candidate             : Association to Candidates not null;
    languageCode          : String(5) not null;
    languageName          : String(50);
    proficiency           : LanguageProficiency default 'professional';
    isNative              : Boolean default false;
}

/**
 * Certifications
 */
entity Certifications : cuid, managed {
    candidate             : Association to Candidates not null;

    name                  : String(300) not null;
    issuingOrganization   : String(200);
    issueDate             : Date;
    expirationDate        : Date;

    credentialId          : String(100);
    credentialUrl         : URL;

    isValid               : Boolean default true;
}

/**
 * Candidate Notes - Comments from recruiters/hiring managers
 */
entity CandidateNotes : cuid, managed, AuditTrail {
    candidate             : Association to Candidates not null;

    noteText              : LargeString not null;
    noteType              : String(50) default 'general';

    isPrivate             : Boolean default false;
    isPinned              : Boolean default false;
}

/**
 * Interviews - Interview scheduling and tracking
 */
entity Interviews : cuid, managed, AuditTrail {
    candidate             : Association to Candidates not null;
    jobPosting            : Association to JobPostings;

    // Interview Details
    title                 : String(200) not null;
    interviewType         : Association to InterviewTypes @assert.target;
    status                : Association to InterviewStatuses @assert.target;

    // Scheduling
    scheduledAt           : DateTime not null;
    duration              : Integer default 60; // minutes
    timezone              : String(50);
    location              : String(500); // Physical location or meeting link
    meetingLink           : URL;

    // Participants
    interviewer           : String(200);
    interviewerEmail      : Email;
    additionalParticipants: many String(200);

    // Feedback (after interview)
    overallRating         : Integer; // 1-5
    technicalRating       : Integer; // 1-5
    communicationRating   : Integer; // 1-5
    cultureFitRating      : Integer; // 1-5

    feedback              : LargeString;
    strengths             : LargeString;
    areasOfImprovement    : LargeString;
    recommendation        : String(50); // strongly_hire, hire, no_hire, strong_no_hire

    // Follow-up
    nextSteps             : LargeString;
    followUpDate          : Date;

    // Reminders
    reminderSent          : Boolean default false;
    feedbackDueDate       : Date;

    // Completion
    completedAt           : Timestamp;
    cancelledAt           : Timestamp;
    cancellationReason    : String(500);
}

// ============================================
// SKILLS CATALOG
// ============================================

/**
 * Master Skills catalog
 */
entity Skills : cuid, managed {
    name                  : String(100) not null;
    normalizedName        : String(100); // lowercase, trimmed for matching

    category              : Association to SkillCategories;
    parentSkill           : Association to Skills;

    description           : String(500);
    aliases               : many String(100);

    isActive              : Boolean default true;
    usageCount            : Integer default 0;

    // Relations
    childSkills           : Association to many Skills on childSkills.parentSkill = $self;
    relatedSkills         : Association to many SkillRelations on relatedSkills.skill1 = $self;
}

/**
 * Skill Relations for similarity matching
 */
entity SkillRelations : cuid {
    skill1                : Association to Skills not null;
    skill2                : Association to Skills not null;
    relationStrength      : Decimal(3,2) default 0.5; // 0-1
    relationType          : String(20); // similar, parent-child, complementary
}

/**
 * Skill Categories
 */
entity SkillCategories : CodeList {
    key code              : String(50);
    icon                  : String(50);
    sortOrder             : Integer;
    skills                : Association to many Skills on skills.category = $self;
}

// ============================================
// JOB POSTINGS
// ============================================

/**
 * Job Postings
 */
entity JobPostings : cuid, managed, AuditTrail, Taggable {
    // Basic Info
    title                 : String(200) not null;
    jobCode               : String(50);
    department            : String(100);

    // Location
    location              : String(200);
    country               : Country;
    locationType          : LocationType default 'onsite';

    // Employment Details
    employmentType        : EmploymentType default 'full-time';

    // Description
    @Core.MediaType: 'text/html'
    description           : LargeString;
    @Core.MediaType: 'text/html'
    responsibilities      : LargeString;
    @Core.MediaType: 'text/html'
    qualifications        : LargeString;
    @Core.MediaType: 'text/html'
    benefits              : LargeString;

    // Requirements
    requiredSkills        : Composition of many JobRequiredSkills on requiredSkills.jobPosting = $self;
    minimumExperience     : YearsExperience;
    preferredExperience   : YearsExperience;
    requiredEducation     : Association to DegreeLevels;

    // Compensation
    salaryMin             : Decimal(12,2);
    salaryMax             : Decimal(12,2);
    salaryCurrency        : Currency;
    showSalary            : Boolean default false;

    // Status & Timeline
    status                : JobStatus default 'draft';
    publishedAt           : Timestamp;
    closingDate           : Date;
    targetHireDate        : Date;

    // Hiring Details
    numberOfPositions     : Integer default 1;
    hiringManager         : String(100);
    recruiter             : String(100);

    // Matching Configuration
    skillWeight           : Decimal(3,2) default 0.40;
    experienceWeight      : Decimal(3,2) default 0.30;
    educationWeight       : Decimal(3,2) default 0.20;
    locationWeight        : Decimal(3,2) default 0.10;

    // Advanced Scoring Configuration
    scoringTemplate       : Association to ScoringRuleTemplates;
    customRules           : Composition of many ScoringRules on customRules.jobPosting = $self;
    scoringStrategy       : String(50) default 'PRIORITY';  // 'SEQUENTIAL', 'PRIORITY', 'GROUPED', 'CUSTOM'
    mlWeight              : Decimal(3,2) default 0.60;      // Dynamic ML vs rule-based weight (0.0-1.0)

    // Relations
    matchResults          : Association to many MatchResults on matchResults.jobPosting = $self;

    // Analytics
    viewCount             : Integer default 0;
    applicationCount      : Integer default 0;
}

/**
 * Job Required Skills with importance weight
 */
entity JobRequiredSkills : cuid {
    jobPosting            : Association to JobPostings not null;
    skill                 : Association to Skills not null @assert.target;

    isRequired            : Boolean default true;
    minimumProficiency    : ProficiencyLevel default 'intermediate';
    weight                : Decimal(3,2) default 1.0;
}

// ============================================
// MATCHING
// ============================================

/**
 * Match Results - Candidate to Job matching scores
 */
entity MatchResults : cuid, managed {
    candidate             : Association to Candidates not null;
    jobPosting            : Association to JobPostings not null;

    // Scores
    overallScore          : Score not null;
    skillScore            : Score;
    experienceScore       : Score;
    educationScore        : Score;
    locationScore         : Score;

    // Ranking
    rank                  : Integer;

    // Detailed Analysis (JSON)
    @Core.MediaType: 'application/json'
    scoreBreakdown        : LargeString;
    @Core.MediaType: 'application/json'
    matchedSkills         : LargeString;
    @Core.MediaType: 'application/json'
    missingSkills         : LargeString;

    // ML Semantic Matching
    semanticScore         : Score;                    // Score from ML vector similarity
    @Core.MediaType: 'application/json'
    mlAnalysis            : LargeString;              // ML matching details (cosine similarity, criteria)

    // AI Insights
    aiRecommendation      : LargeString;
    strengthsAnalysis     : LargeString;
    gapsAnalysis          : LargeString;

    // Review
    reviewStatus          : ReviewStatus default 'pending';
    reviewedBy            : String(100);
    reviewedAt            : Timestamp;
    reviewNotes           : LargeString;

    // Rule Engine Audit Trail
    rulesApplied          : LargeString;              // JSON array of applied rules with before/after scores
    preFilterPassed       : Boolean default true;
    disqualifiedBy        : String(200);              // Rule name if disqualified
}

// ============================================
// SCORING RULE ENGINE
// ============================================

/**
 * Scoring Rule Templates - Reusable rule sets
 */
entity ScoringRuleTemplates : cuid, managed {
    name                  : String(200) not null;
    description           : String(500);
    category              : String(100);              // 'Technical', 'Management', 'Sales', etc.
    isGlobal              : Boolean default true;
    isActive              : Boolean default true;

    // Relations
    rules                 : Composition of many ScoringRules on rules.template = $self;
    usedByJobs            : Association to many JobPostings on usedByJobs.scoringTemplate = $self;
}

/**
 * Scoring Rules - Individual rule definitions with conditions and actions
 */
entity ScoringRules : cuid, managed {
    name                  : String(200) not null;
    description           : String(500);

    // Ownership - rules can belong to template, job, or be global
    template              : Association to ScoringRuleTemplates;
    jobPosting            : Association to JobPostings;
    isGlobal              : Boolean default false;

    // Rule definition
    ruleType              : String(50) not null;      // 'PRE_FILTER', 'CATEGORY_BOOST', 'OVERALL_MODIFIER', 'WEIGHT_ADJUSTER', 'DISQUALIFY'
    priority              : Integer default 50;        // 1-100, higher executes first
    isActive              : Boolean default true;

    // Condition (stored as JSON DSL)
    @Core.MediaType: 'application/json'
    conditions            : LargeString not null;     // JSON: {operator: 'AND', conditions: [{field: 'yearsExperience', op: '>', value: 5}]}

    // Action (stored as JSON DSL)
    @Core.MediaType: 'application/json'
    actions               : LargeString not null;     // JSON: {type: 'BOOST_CATEGORY', category: 'skills', modifier: {type: 'PERCENTAGE', value: 20}}

    // Execution metadata
    executionOrder        : Integer;                   // For sequential execution
    stopOnMatch           : Boolean default false;     // Stop processing further rules if this matches

    // Usage tracking
    executionCount        : Integer default 0;
    lastExecutedAt        : Timestamp;
}

// ============================================
// CODE LISTS / VALUE HELPS
// ============================================

/**
 * Candidate Statuses with workflow order
 */
entity CandidateStatuses : CodeList {
    key code              : String(20);
    sortOrder             : Integer;
    isActive              : Boolean default true;
    criticality           : Integer; // For UI status colors

    // Allowed transitions
    allowedTransitions    : many String(20);
}

/**
 * Degree Levels with ranking
 */
entity DegreeLevels : CodeList {
    key code              : String(50);
    rank                  : Integer; // For comparison
    sortOrder             : Integer;
}

/**
 * Interview Types
 */
entity InterviewTypes : CodeList {
    key code              : String(50);
    icon                  : String(50);
    defaultDuration       : Integer default 60; // minutes
    sortOrder             : Integer;
}

/**
 * Interview Statuses
 */
entity InterviewStatuses : CodeList {
    key code              : String(50);
    criticality           : Integer; // For UI status colors
    sortOrder             : Integer;
    isTerminal            : Boolean default false;
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * Saved Filter Configurations
 */
entity SavedFilters : cuid, managed {
    name                  : String(100) not null;
    description           : String(500);

    @Core.MediaType: 'application/json'
    filterCriteria        : LargeString not null;

    isPublic              : Boolean default false;
    isDefault             : Boolean default false;

    entityType            : String(50); // Candidates, JobPostings, etc.
    owner                 : String(100);
}

/**
 * Sorting Configurations
 */
entity SortingConfigurations : cuid, managed {
    name                  : String(100) not null;
    description           : String(500);

    @Core.MediaType: 'application/json'
    sortingRules          : LargeString not null;

    // Weights for scoring
    skillWeight           : Decimal(3,2) default 0.35;
    experienceWeight      : Decimal(3,2) default 0.25;
    educationWeight       : Decimal(3,2) default 0.20;
    recencyWeight         : Decimal(3,2) default 0.10;
    locationWeight        : Decimal(3,2) default 0.10;

    isDefault             : Boolean default false;
    owner                 : String(100);
}

// ============================================
// AUDIT & WORKFLOW
// ============================================

/**
 * Audit Log for tracking changes
 */
entity AuditLogs : cuid, managed {
    entityName            : String(100) not null;
    entityId              : UUID not null;
    action                : String(20) not null; // CREATE, UPDATE, DELETE

    @Core.MediaType: 'application/json'
    oldValues             : LargeString;
    @Core.MediaType: 'application/json'
    newValues             : LargeString;

    changedFields         : many String(100);
    userId                : String(100);
    userIp                : String(50);
}

/**
 * Workflow Instances for tracking automation
 */
entity WorkflowInstances : cuid, managed {
    workflowType          : String(50) not null;
    workflowDefinitionId  : String(100);

    entityType            : String(50);
    entityId              : UUID;

    status                : String(20) default 'running';
    startedAt             : Timestamp;
    completedAt           : Timestamp;

    currentStep           : String(100);
    @Core.MediaType: 'application/json'
    stepHistory           : LargeString;

    errorCode             : String(50);
    errorMessage          : LargeString;

    triggeredBy           : String(100);
}

// ============================================
// JOULE AI ENTITIES
// ============================================

/**
 * Joule AI Conversations
 */
entity JouleConversations : cuid, managed {
    sessionId             : String(100) not null;
    userId                : String(100);
    context               : String(50);  // candidate-search, job-matching, analytics
    isActive              : Boolean default true;
    messages              : Composition of many JouleMessages on messages.conversation = $self;
}

/**
 * Joule AI Messages
 */
entity JouleMessages : cuid, managed {
    conversation          : Association to JouleConversations not null;
    role                  : String(20) not null;  // user, assistant
    content               : LargeString not null;
    actionType            : String(50);
    @Core.MediaType: 'application/json'
    actionPayload         : LargeString;
    @Core.MediaType: 'application/json'
    actionResult          : LargeString;
}

/**
 * Joule AI Insights
 */
entity JouleInsights : cuid, managed {
    entityType            : String(50) not null;  // candidate, job, match
    entityId              : UUID not null;
    insightType           : String(50) not null;
    priority              : String(20) default 'medium';
    message               : LargeString not null;
    @Core.MediaType: 'application/json'
    details               : LargeString;
    isAcknowledged        : Boolean default false;
    acknowledgedAt        : Timestamp;
    acknowledgedBy        : String(100);
}

// ============================================
// EMAIL AUTOMATION ENTITIES
// ============================================

/**
 * Email Notification Tracking
 * Tracks all automated emails sent to candidates
 */
entity EmailNotifications : cuid, managed {
    candidate: Association to Candidates;
    jobPosting: Association to JobPostings;
    notificationType: String(50) enum {
        cv_received;
        status_changed;
        interview_invitation;
        interview_reminder;
        interview_confirmed;
        offer_extended;
        application_rejected;
        general_update;
    } not null;
    recipientEmail: String(255) not null;
    subject: String(500);
    templateUsed: String(100);
    sentAt: Timestamp;
    deliveryStatus: String(20) enum {
        queued;
        sent;
        failed;
        bounced;
    } default 'queued';
    openedAt: Timestamp;
    clickedAt: Timestamp;
    errorMessage: String(1000);
    n8nExecutionId: String(100);
}

/**
 * Candidate Status History
 * Tracks all status changes for candidates with audit trail
 */
entity CandidateStatusHistory : cuid, managed {
    candidate: Association to Candidates;
    previousStatus: Association to CandidateStatuses;
    newStatus: Association to CandidateStatuses;
    changedAt: Timestamp not null;
    changedBy: String(255);
    reason: String(1000);
    notes: String(2000);
}
