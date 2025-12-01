namespace cv.sorting;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

// ==========================================
// CORE ENTITIES
// ==========================================

/**
 * Candidates - Main entity for job applicants
 */
entity Candidates : cuid, managed {
    firstName           : String(100) @mandatory;
    lastName            : String(100) @mandatory;
    email               : String(255) @mandatory;
    phone               : String(50);
    linkedInUrl         : String(500);
    portfolioUrl        : String(500);
    location            : String(200);
    country             : String(100);
    city                : String(100);

    // Professional Summary
    headline            : String(500);
    summary             : LargeString;
    totalExperienceYears: Decimal(4,1);

    // Status & Scoring
    status              : Association to CandidateStatuses;
    overallScore        : Decimal(5,2);  // Calculated match score (0-100)
    aiConfidenceScore   : Decimal(5,2);  // AI extraction confidence

    // Relationships
    documents           : Composition of many CVDocuments on documents.candidate = $self;
    experiences         : Composition of many WorkExperiences on experiences.candidate = $self;
    educations          : Composition of many Educations on educations.candidate = $self;
    skills              : Composition of many CandidateSkills on skills.candidate = $self;
    languages           : Composition of many CandidateLanguages on languages.candidate = $self;
    certifications      : Composition of many Certifications on certifications.candidate = $self;
    matchResults        : Association to many MatchResults on matchResults.candidate = $self;
    notes               : Composition of many CandidateNotes on notes.candidate = $self;

    // Source tracking
    source              : String(100);   // Where the CV came from
    tags                : array of String;
}

/**
 * CV Documents - Uploaded resume/CV files
 */
entity CVDocuments : cuid, managed {
    candidate           : Association to Candidates;
    fileName            : String(255) @mandatory;
    fileType            : String(50);    // pdf, docx, doc, png, jpg
    fileSize            : Integer;       // in bytes
    fileContent         : LargeBinary @Core.MediaType: mediaType;
    mediaType           : String(100);

    // Processing Status
    processingStatus    : String(20) default 'pending';  // pending, processing, completed, failed
    processedAt         : Timestamp;
    extractedText       : LargeString;   // Raw extracted text
    extractedData       : LargeString;   // JSON structured data

    // AI Processing
    ocrConfidence       : Decimal(5,2);
    extractionMethod    : String(50);    // document-ai, manual, hybrid
    errorMessage        : String(1000);

    isLatest            : Boolean default true;
    version             : Integer default 1;
}

/**
 * Work Experience entries
 */
entity WorkExperiences : cuid, managed {
    candidate           : Association to Candidates;
    companyName         : String(200) @mandatory;
    jobTitle            : String(200) @mandatory;
    location            : String(200);
    startDate           : Date;
    endDate             : Date;
    isCurrent           : Boolean default false;
    description         : LargeString;

    // Calculated fields
    durationMonths      : Integer;

    // Skills used in this role
    skills              : array of String;

    // Industry classification
    industry            : String(100);
}

/**
 * Education entries
 */
entity Educations : cuid, managed {
    candidate           : Association to Candidates;
    institution         : String(300) @mandatory;
    degree              : String(200);
    fieldOfStudy        : String(200);
    startDate           : Date;
    endDate             : Date;
    grade               : String(50);
    description         : LargeString;

    // Classification
    degreeLevel         : Association to DegreeLevels;
}

/**
 * Candidate Skills with proficiency
 */
entity CandidateSkills : cuid {
    candidate           : Association to Candidates;
    skill               : Association to Skills;
    proficiencyLevel    : String(20);    // beginner, intermediate, advanced, expert
    yearsOfExperience   : Decimal(4,1);
    isVerified          : Boolean default false;
    source              : String(50);    // extracted, manual, inferred
}

/**
 * Master Skills catalog
 */
entity Skills : cuid, managed {
    name                : String(100) @mandatory;
    category            : Association to SkillCategories;
    aliases             : array of String;  // Alternative names for the skill
    isActive            : Boolean default true;

    // For matching
    parentSkill         : Association to Skills;  // Skill hierarchy
    relatedSkills       : Association to many SkillRelations on relatedSkills.skill1 = $self;
}

entity SkillRelations : cuid {
    skill1              : Association to Skills;
    skill2              : Association to Skills;
    relationStrength    : Decimal(3,2);  // 0-1 how related the skills are
}

/**
 * Skill Categories
 */
entity SkillCategories : CodeList {
    key code            : String(50);
    skills              : Association to many Skills on skills.category = $self;
}

/**
 * Candidate Languages
 */
entity CandidateLanguages : cuid {
    candidate           : Association to Candidates;
    language            : String(50) @mandatory;
    proficiency         : String(20);    // native, fluent, professional, basic
}

/**
 * Certifications
 */
entity Certifications : cuid, managed {
    candidate           : Association to Candidates;
    name                : String(300) @mandatory;
    issuingOrganization : String(200);
    issueDate           : Date;
    expirationDate      : Date;
    credentialId        : String(100);
    credentialUrl       : String(500);
}

/**
 * Candidate Notes - Comments from recruiters
 */
entity CandidateNotes : cuid, managed {
    candidate           : Association to Candidates;
    noteText            : LargeString @mandatory;
    noteType            : String(50);    // general, interview, feedback, internal
    isPrivate           : Boolean default false;
}

// ==========================================
// JOB POSTING & MATCHING
// ==========================================

/**
 * Job Postings
 */
entity JobPostings : cuid, managed {
    title               : String(200) @mandatory;
    department          : String(100);
    location            : String(200);
    locationType        : String(50);    // onsite, remote, hybrid
    employmentType      : String(50);    // full-time, part-time, contract, internship

    description         : LargeString;
    responsibilities    : LargeString;

    // Requirements
    requiredSkills      : Composition of many JobRequiredSkills on requiredSkills.jobPosting = $self;
    minimumExperience   : Decimal(4,1);  // years
    preferredExperience : Decimal(4,1);
    requiredEducation   : Association to DegreeLevels;

    // Salary
    salaryMin           : Decimal(12,2);
    salaryMax           : Decimal(12,2);
    salaryCurrency      : String(3) default 'USD';

    // Status
    status              : String(20) default 'draft';  // draft, open, closed, on-hold
    publishedAt         : Timestamp;
    closingDate         : Date;

    // Matching
    matchResults        : Association to many MatchResults on matchResults.jobPosting = $self;

    // Weights for scoring algorithm
    skillWeight         : Decimal(3,2) default 0.40;
    experienceWeight    : Decimal(3,2) default 0.30;
    educationWeight     : Decimal(3,2) default 0.20;
    locationWeight      : Decimal(3,2) default 0.10;
}

/**
 * Job Required Skills with importance
 */
entity JobRequiredSkills : cuid {
    jobPosting          : Association to JobPostings;
    skill               : Association to Skills;
    isRequired          : Boolean default true;  // required vs nice-to-have
    minimumProficiency  : String(20);
    weight              : Decimal(3,2) default 1.0;  // Importance weight
}

/**
 * Match Results - Candidate to Job matching scores
 */
entity MatchResults : cuid, managed {
    candidate           : Association to Candidates;
    jobPosting          : Association to JobPostings;

    // Overall score
    overallScore        : Decimal(5,2) @mandatory;  // 0-100

    // Component scores
    skillScore          : Decimal(5,2);
    experienceScore     : Decimal(5,2);
    educationScore      : Decimal(5,2);
    locationScore       : Decimal(5,2);

    // Detailed breakdown (JSON)
    scoreBreakdown      : LargeString;

    // AI insights
    aiRecommendation    : LargeString;
    strengthsAnalysis   : LargeString;
    gapsAnalysis        : LargeString;

    // Ranking
    rank                : Integer;

    // Status
    reviewStatus        : String(20) default 'pending';  // pending, reviewed, shortlisted, rejected
    reviewedBy          : String(100);
    reviewedAt          : Timestamp;
    reviewNotes         : LargeString;
}

// ==========================================
// SUPPORTING ENTITIES
// ==========================================

/**
 * Candidate Statuses
 */
entity CandidateStatuses : CodeList {
    key code            : String(20);
    // new, screening, interviewing, shortlisted, offered, hired, rejected, withdrawn
}

/**
 * Degree Levels
 */
entity DegreeLevels : CodeList {
    key code            : String(50);
    rank                : Integer;  // For comparison: 1=high school, 2=associate, 3=bachelor, 4=master, 5=doctorate
}

// ==========================================
// FILTERING & SORTING CONFIGURATION
// ==========================================

/**
 * Saved Filter Configurations
 */
entity SavedFilters : cuid, managed {
    name                : String(100) @mandatory;
    description         : String(500);
    filterCriteria      : LargeString @mandatory;  // JSON filter configuration
    isPublic            : Boolean default false;
    isDefault           : Boolean default false;
    createdByUser       : String(100);
}

/**
 * Sorting Configurations
 */
entity SortingConfigurations : cuid, managed {
    name                : String(100) @mandatory;
    description         : String(500);
    sortingRules        : LargeString @mandatory;  // JSON sorting rules

    // Weights for custom scoring
    skillWeight         : Decimal(3,2) default 0.35;
    experienceWeight    : Decimal(3,2) default 0.25;
    educationWeight     : Decimal(3,2) default 0.20;
    recencyWeight       : Decimal(3,2) default 0.10;
    locationWeight      : Decimal(3,2) default 0.10;

    isDefault           : Boolean default false;
}

// ==========================================
// JOULE AI INTEGRATION
// ==========================================

/**
 * Joule Conversation History
 */
entity JouleConversations : cuid, managed {
    sessionId           : String(100) @mandatory;
    userId              : String(100);
    context             : String(50);    // candidate-search, job-matching, analytics

    messages            : Composition of many JouleMessages on messages.conversation = $self;
}

entity JouleMessages : cuid, managed {
    conversation        : Association to JouleConversations;
    role                : String(20) @mandatory;  // user, assistant
    content             : LargeString @mandatory;

    // If the message resulted in an action
    actionType          : String(50);    // search, filter, sort, analyze
    actionPayload       : LargeString;   // JSON action details
    actionResult        : LargeString;   // JSON result summary
}

/**
 * Joule Insights - AI-generated insights
 */
entity JouleInsights : cuid, managed {
    entityType          : String(50) @mandatory;  // candidate, job, match
    entityId            : UUID @mandatory;
    insightType         : String(50);    // summary, recommendation, gap-analysis, improvement
    content             : LargeString @mandatory;
    confidence          : Decimal(5,2);
    isActive            : Boolean default true;
}

// ==========================================
// ANALYTICS & REPORTING
// ==========================================

/**
 * Pipeline Analytics snapshots
 */
entity PipelineSnapshots : cuid, managed {
    snapshotDate        : Date @mandatory;

    totalCandidates     : Integer;
    newCandidates       : Integer;
    inScreening         : Integer;
    inInterview         : Integer;
    shortlisted         : Integer;
    hired               : Integer;
    rejected            : Integer;

    avgTimeToHire       : Decimal(6,2);  // days
    avgMatchScore       : Decimal(5,2);

    bySource            : LargeString;   // JSON breakdown by source
    byLocation          : LargeString;   // JSON breakdown by location
    topSkills           : LargeString;   // JSON top skills in pipeline
}

// ==========================================
// WORKFLOW TRACKING
// ==========================================

/**
 * Workflow Instances
 */
entity WorkflowInstances : cuid, managed {
    workflowType        : String(50) @mandatory;  // cv-processing, approval, notification
    entityType          : String(50);
    entityId            : UUID;

    status              : String(20) default 'running';  // running, completed, failed, cancelled
    startedAt           : Timestamp;
    completedAt         : Timestamp;

    currentStep         : String(100);
    stepHistory         : LargeString;   // JSON array of completed steps
    errorDetails        : LargeString;
}
