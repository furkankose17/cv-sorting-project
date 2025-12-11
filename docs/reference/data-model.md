# Data Model Deep Dive

Complete documentation of the database schema, entities, relationships, and data patterns.

---

## Database Architecture

The application uses a dual-database strategy:

| Database | Purpose | Technology |
|----------|---------|------------|
| **HANA Cloud** | Business data (candidates, jobs, matches) | SAP HANA HDI-shared |
| **PostgreSQL** | ML data (embeddings, scoring, caches) | PostgreSQL + pgvector |

---

## HANA Schema (CDS Model)

### Schema Files

```
db/
├── schema.cds      # Entity definitions (640+ lines)
├── common.cds      # Shared types, aspects, enums
└── data/           # Seed data (18 CSV files)
```

---

## Core Entities

### Candidates

The main entity for job applicants.

```cds
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
    status                : Association to CandidateStatuses;
    overallScore          : Score;
    aiConfidenceScore     : Percentage;

    // Compositions
    documents             : Composition of many CVDocuments;
    experiences           : Composition of many WorkExperiences;
    educations            : Composition of many Educations;
    skills                : Composition of many CandidateSkills;
    languages             : Composition of many CandidateLanguages;
    certifications        : Composition of many Certifications;
    notes                 : Composition of many CandidateNotes;
    interviews            : Composition of many Interviews;

    // Associations
    matchResults          : Association to many MatchResults;

    // Source tracking
    source                : String(100);
    referredBy            : String(200);

    // Virtual
    virtual fullName      : String(201);
}
```

**Key Aspects Applied:**
- `cuid` - Auto-generated UUID primary key
- `managed` - `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`
- `AuditTrail` - Change tracking fields
- `SoftDelete` - `isDeleted`, `deletedAt`, `deletedBy`
- `Taggable` - `tags` array field

### CVDocuments

Uploaded CV files with extracted data.

```cds
entity CVDocuments : cuid, managed {
    candidate             : Association to Candidates not null;

    // File Information
    fileName              : String(255) not null;
    fileType              : String(50);
    fileSize              : Integer;
    fileContent           : LargeBinary;
    mediaType             : String(100);

    // Processing Status
    processingStatus      : ProcessingStatus default 'pending';
    processedAt           : Timestamp;

    // Extracted Data
    extractedText         : LargeString;
    extractedData         : LargeString;  // JSON

    // AI Processing Metrics
    ocrConfidence         : Percentage;
    extractionMethod      : String(50);
    processingDuration    : Integer;  // milliseconds
    errorMessage          : String(1000);

    // Version Control
    isLatest              : Boolean default true;
    version               : Integer default 1;
    previousVersion       : Association to CVDocuments;
}
```

### WorkExperiences

Employment history entries.

```cds
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

    description           : LargeString;
    achievements          : LargeString;
    durationMonths        : Integer;

    industry              : String(100);
    companySize           : String(50);
    skillsUsed            : many String(100);  // Denormalized
}
```

### CandidateSkills

Skills linked to candidates with proficiency.

```cds
entity CandidateSkills : cuid, managed {
    candidate             : Association to Candidates not null;
    skill                 : Association to Skills not null;

    proficiencyLevel      : ProficiencyLevel default 'intermediate';
    yearsOfExperience     : YearsExperience;
    lastUsedDate          : Date;

    isVerified            : Boolean default false;
    verifiedBy            : String(100);
    verifiedAt            : Timestamp;

    source                : String(50) default 'extracted';  // extracted|manual|inferred
    confidenceScore       : Percentage;
}
```

### Interviews

Interview scheduling and feedback.

```cds
entity Interviews : cuid, managed, AuditTrail {
    candidate             : Association to Candidates not null;
    jobPosting            : Association to JobPostings;

    // Details
    title                 : String(200) not null;
    interviewType         : Association to InterviewTypes;
    status                : Association to InterviewStatuses;

    // Scheduling
    scheduledAt           : DateTime not null;
    duration              : Integer default 60;
    timezone              : String(50);
    location              : String(500);
    meetingLink           : URL;

    // Participants
    interviewer           : String(200);
    interviewerEmail      : Email;
    additionalParticipants: many String(200);

    // Ratings (1-5)
    overallRating         : Integer;
    technicalRating       : Integer;
    communicationRating   : Integer;
    cultureFitRating      : Integer;

    // Feedback
    feedback              : LargeString;
    strengths             : LargeString;
    areasOfImprovement    : LargeString;
    recommendation        : String(50);  // strongly_hire|hire|no_hire|strong_no_hire

    // Follow-up
    nextSteps             : LargeString;
    followUpDate          : Date;

    // Completion
    completedAt           : Timestamp;
    cancelledAt           : Timestamp;
    cancellationReason    : String(500);
}
```

---

## Job Entities

### JobPostings

Job listings with requirements.

```cds
entity JobPostings : cuid, managed, AuditTrail, Taggable {
    // Basic Info
    title                 : String(200) not null;
    jobCode               : String(50);
    department            : String(100);

    // Location
    location              : String(200);
    country               : Country;
    locationType          : LocationType default 'onsite';

    // Employment
    employmentType        : EmploymentType default 'full-time';

    // Description (HTML)
    description           : LargeString;
    responsibilities      : LargeString;
    qualifications        : LargeString;
    benefits              : LargeString;

    // Requirements
    requiredSkills        : Composition of many JobRequiredSkills;
    minimumExperience     : YearsExperience;
    preferredExperience   : YearsExperience;
    requiredEducation     : Association to DegreeLevels;

    // Compensation
    salaryMin             : Decimal(12,2);
    salaryMax             : Decimal(12,2);
    salaryCurrency        : Currency;
    showSalary            : Boolean default false;

    // Status
    status                : JobStatus default 'draft';
    publishedAt           : Timestamp;
    closingDate           : Date;
    targetHireDate        : Date;

    // Hiring
    numberOfPositions     : Integer default 1;
    hiringManager         : String(100);
    recruiter             : String(100);

    // Matching Weights (total = 1.0)
    skillWeight           : Decimal(3,2) default 0.40;
    experienceWeight      : Decimal(3,2) default 0.30;
    educationWeight       : Decimal(3,2) default 0.20;
    locationWeight        : Decimal(3,2) default 0.10;

    // Relations
    matchResults          : Association to many MatchResults;

    // Analytics
    viewCount             : Integer default 0;
    applicationCount      : Integer default 0;
}
```

### JobRequiredSkills

Skills required for a job with weighting.

```cds
entity JobRequiredSkills : cuid {
    jobPosting            : Association to JobPostings not null;
    skill                 : Association to Skills not null;

    isRequired            : Boolean default true;
    minimumProficiency    : ProficiencyLevel default 'intermediate';
    weight                : Decimal(3,2) default 1.0;
}
```

### MatchResults

Candidate-to-job match scores.

```cds
entity MatchResults : cuid, managed {
    candidate             : Association to Candidates not null;
    jobPosting            : Association to JobPostings not null;

    // Scores (0-100)
    overallScore          : Score not null;
    skillScore            : Score;
    experienceScore       : Score;
    educationScore        : Score;
    locationScore         : Score;

    // Ranking
    rank                  : Integer;

    // Detailed Analysis (JSON)
    scoreBreakdown        : LargeString;
    matchedSkills         : LargeString;
    missingSkills         : LargeString;

    // AI Insights
    aiRecommendation      : LargeString;
    strengthsAnalysis     : LargeString;
    gapsAnalysis          : LargeString;

    // Review
    reviewStatus          : ReviewStatus default 'pending';
    reviewedBy            : String(100);
    reviewedAt            : Timestamp;
    reviewNotes           : LargeString;
}
```

---

## Skills Catalog

### Skills

Master skills catalog with hierarchy.

```cds
entity Skills : cuid, managed {
    name                  : String(100) not null;
    normalizedName        : String(100);  // lowercase for matching

    category              : Association to SkillCategories;
    parentSkill           : Association to Skills;

    description           : String(500);
    aliases               : many String(100);

    isActive              : Boolean default true;
    usageCount            : Integer default 0;

    // Relations
    childSkills           : Association to many Skills;
    relatedSkills         : Association to many SkillRelations;
}
```

### SkillRelations

Skill similarity relationships.

```cds
entity SkillRelations : cuid {
    skill1                : Association to Skills not null;
    skill2                : Association to Skills not null;
    relationStrength      : Decimal(3,2) default 0.5;  // 0-1
    relationType          : String(20);  // similar|parent-child|complementary
}
```

---

## Code Lists (Value Helps)

### CandidateStatuses

```cds
entity CandidateStatuses : CodeList {
    key code              : String(20);
    sortOrder             : Integer;
    isActive              : Boolean default true;
    criticality           : Integer;  // UI status color
    allowedTransitions    : many String(20);
}
```

**Default Values:**
| Code | Name | Allowed Transitions |
|------|------|---------------------|
| new | New | screening, rejected |
| screening | Screening | interviewing, rejected, withdrawn |
| interviewing | Interviewing | shortlisted, rejected, withdrawn |
| shortlisted | Shortlisted | offered, rejected, withdrawn |
| offered | Offered | hired, rejected, withdrawn |
| hired | Hired | - |
| rejected | Rejected | - |
| withdrawn | Withdrawn | - |

### DegreeLevels

```cds
entity DegreeLevels : CodeList {
    key code              : String(50);
    rank                  : Integer;  // For comparison
    sortOrder             : Integer;
}
```

**Default Values:**
| Code | Rank |
|------|------|
| high_school | 1 |
| associate | 2 |
| bachelor | 3 |
| master | 4 |
| doctorate | 5 |

### InterviewTypes

| Code | Default Duration |
|------|------------------|
| phone_screen | 30 |
| technical | 60 |
| behavioral | 45 |
| panel | 90 |
| final | 60 |

### InterviewStatuses

| Code | Is Terminal |
|------|-------------|
| scheduled | No |
| confirmed | No |
| in_progress | No |
| completed | Yes |
| cancelled | Yes |
| no_show | Yes |

---

## Common Types (common.cds)

### Custom Types

```cds
type Email         : String(254) @assert.format: '^[^@]+@[^@]+\.[^@]+$';
type Phone         : String(30);
type URL           : String(2048) @assert.format: '^https?://.*';
type Score         : Decimal(5,2) @assert.range: [0, 100];
type Percentage    : Decimal(5,2) @assert.range: [0, 100];
type YearsExperience : Decimal(4,1) @assert.range: [0, 99];
```

### Enums

```cds
type CandidateStatusCode : String enum {
    new; screening; interviewing; shortlisted;
    offered; hired; rejected; withdrawn;
}

type ProcessingStatus : String enum {
    pending; processing; completed; failed;
}

type JobStatus : String enum {
    draft; published; closed; cancelled;
}

type ReviewStatus : String enum {
    pending; approved; rejected;
}

type ProficiencyLevel : String enum {
    beginner; intermediate; advanced; expert;
}

type LanguageProficiency : String enum {
    elementary; limited; professional; full_professional; native;
}

type EmploymentType : String enum {
    full-time; part-time; contract; internship; temporary;
}

type LocationType : String enum {
    onsite; remote; hybrid;
}
```

### Aspects

```cds
aspect AuditTrail {
    auditCreatedAt        : Timestamp @cds.on.insert: $now;
    auditCreatedBy        : String(100) @cds.on.insert: $user;
}

aspect SoftDelete {
    isDeleted             : Boolean default false;
    deletedAt             : Timestamp;
    deletedBy             : String(100);
}

aspect Taggable {
    tags                  : many String(50);
}
```

---

## PostgreSQL Schema (pgvector)

Located at: `infrastructure/postgresql/schema-vectors.sql`

### candidate_embeddings

```sql
CREATE TABLE candidate_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL UNIQUE,

    -- 384-dimensional vectors (Sentence Transformers)
    cv_text_embedding vector(384),
    skills_embedding vector(384),
    experience_embedding vector(384),
    combined_embedding vector(384),

    content_hash VARCHAR(64),  -- For change detection
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IVFFlat index for fast similarity search
CREATE INDEX idx_candidate_combined_embedding
ON candidate_embeddings USING ivfflat (combined_embedding vector_cosine_ops);
```

### job_embeddings

```sql
CREATE TABLE job_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL UNIQUE,

    description_embedding vector(384),
    requirements_embedding vector(384),
    combined_embedding vector(384),

    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_combined_embedding
ON job_embeddings USING ivfflat (combined_embedding vector_cosine_ops);
```

### scoring_criteria

```sql
CREATE TABLE scoring_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL,

    criteria_type VARCHAR(50) NOT NULL,  -- skill|language|certification|experience|education|custom
    criteria_value VARCHAR(255),
    points INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT FALSE,
    weight DECIMAL(3,2) DEFAULT 1.0,

    -- For experience-based scoring
    min_value INTEGER,
    per_unit_points DECIMAL(5,2),
    max_points INTEGER,

    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scoring_criteria_job ON scoring_criteria(job_posting_id);
```

### semantic_match_results

```sql
CREATE TABLE semantic_match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL,
    job_posting_id UUID NOT NULL,

    cosine_similarity DECIMAL(5,4),
    criteria_score INTEGER,
    criteria_max_score INTEGER,
    combined_score DECIMAL(5,2),

    score_breakdown JSONB,
    matched_criteria JSONB,
    missing_criteria JSONB,
    disqualified BOOLEAN DEFAULT FALSE,

    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(candidate_id, job_posting_id)
);

CREATE INDEX idx_match_job ON semantic_match_results(job_posting_id);
CREATE INDEX idx_match_score ON semantic_match_results(combined_score DESC);
```

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CANDIDATES                                  │
│  ┌─────────────┐                                                        │
│  │ Candidates  │◄────────────────────────────────────────────────────┐  │
│  └──────┬──────┘                                                     │  │
│         │ 1:N                                                        │  │
│    ┌────┴────┬────────┬────────┬────────┬────────┬────────┐         │  │
│    ▼         ▼        ▼        ▼        ▼        ▼        ▼         │  │
│ CVDocs   WorkExp  Educations Skills  Languages Certs   Notes        │  │
│                                  │                                   │  │
│                                  ▼                                   │  │
│                            Skills (master)                          │  │
│                                  │                                   │  │
│                            ┌─────┴─────┐                            │  │
│                            ▼           ▼                            │  │
│                       Categories   Relations                        │  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                 JOBS                                     │
│  ┌─────────────┐                                                        │
│  │ JobPostings │                                                        │
│  └──────┬──────┘                                                        │
│         │ 1:N                                                           │
│    ┌────┴────┐                                                          │
│    ▼         ▼                                                          │
│ RequiredSkills  MatchResults──────────────────────────► Candidates      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERVIEWS                                  │
│  ┌─────────────┐        ┌─────────────┐                                 │
│  │ Candidates  │◄──────►│ Interviews  │◄──────► JobPostings            │
│  └─────────────┘        └─────────────┘                                 │
│                               │                                         │
│                          ┌────┴────┐                                    │
│                          ▼         ▼                                    │
│                    InterviewTypes  InterviewStatuses                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              JOULE AI                                    │
│  ┌─────────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │  Conversations  │────►│  Messages   │     │  Insights   │           │
│  └─────────────────┘     └─────────────┘     └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Seed Data

Located in `db/data/`:

| File | Records | Purpose |
|------|---------|---------|
| cv.sorting-CandidateStatuses.csv | 8 | Status workflow states |
| cv.sorting-DegreeLevels.csv | 5 | Education levels |
| cv.sorting-InterviewTypes.csv | 5 | Interview categories |
| cv.sorting-InterviewStatuses.csv | 6 | Interview states |
| cv.sorting-SkillCategories.csv | 10 | Skill groupings |
| cv.sorting-Skills.csv | 50+ | Master skills catalog |
