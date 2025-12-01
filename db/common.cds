/**
 * Common Types, Aspects, and Reusable Definitions
 * Following SAP CAP Best Practices for type definitions
 */
namespace cv.sorting.common;

using { Currency, Country, Language } from '@sap/cds/common';

// ============================================
// CUSTOM TYPES
// ============================================

/**
 * Email type with validation pattern
 */
type Email : String(255) @assert.format: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$';

/**
 * Phone number type
 */
type Phone : String(50);

/**
 * URL type with validation
 */
type URL : String(500) @assert.format: '^https?://.*';

/**
 * Percentage type (0-100)
 */
type Percentage : Decimal(5,2) @assert.range: [0, 100];

/**
 * Score type for matching scores
 */
type Score : Decimal(5,2) @assert.range: [0, 100];

/**
 * Years of experience type
 */
type YearsExperience : Decimal(4,1) @assert.range: [0, 99];

// ============================================
// STATUS ENUMS (as types for type safety)
// ============================================

/**
 * Candidate Status values
 */
type CandidateStatusCode : String(20) enum {
    new          = 'new';
    screening    = 'screening';
    interviewing = 'interviewing';
    shortlisted  = 'shortlisted';
    offered      = 'offered';
    hired        = 'hired';
    rejected     = 'rejected';
    withdrawn    = 'withdrawn';
}

/**
 * Document Processing Status
 */
type ProcessingStatus : String(20) enum {
    pending    = 'pending';
    processing = 'processing';
    completed  = 'completed';
    failed     = 'failed';
    manual     = 'manual_required';
}

/**
 * Job Posting Status
 */
type JobStatus : String(20) enum {
    draft   = 'draft';
    open    = 'open';
    closed  = 'closed';
    onHold  = 'on-hold';
}

/**
 * Match Review Status
 */
type ReviewStatus : String(20) enum {
    pending     = 'pending';
    reviewed    = 'reviewed';
    shortlisted = 'shortlisted';
    rejected    = 'rejected';
}

/**
 * Proficiency Levels
 */
type ProficiencyLevel : String(20) enum {
    beginner     = 'beginner';
    intermediate = 'intermediate';
    advanced     = 'advanced';
    expert       = 'expert';
}

/**
 * Language Proficiency
 */
type LanguageProficiency : String(20) enum {
    basic        = 'basic';
    professional = 'professional';
    fluent       = 'fluent';
    native       = 'native';
}

/**
 * Employment Type
 */
type EmploymentType : String(20) enum {
    fullTime   = 'full-time';
    partTime   = 'part-time';
    contract   = 'contract';
    internship = 'internship';
    freelance  = 'freelance';
}

/**
 * Location Type
 */
type LocationType : String(20) enum {
    onsite = 'onsite';
    remote = 'remote';
    hybrid = 'hybrid';
}

// ============================================
// REUSABLE ASPECTS
// ============================================

/**
 * Audit trail aspect - extends managed with additional fields
 */
aspect AuditTrail {
    createdByUser  : String(100);
    modifiedByUser : String(100);
}

/**
 * Soft delete aspect
 */
aspect SoftDelete {
    isDeleted   : Boolean default false;
    deletedAt   : Timestamp;
    deletedBy   : String(100);
}

/**
 * Tenant-aware aspect for multi-tenancy
 */
aspect TenantAware {
    tenant : String(36);
}

/**
 * Taggable aspect
 */
aspect Taggable {
    tags : many String(50);
}

// ============================================
// VALUE HELP ANNOTATIONS
// ============================================

/**
 * Annotate common value helps
 */
annotate Currency with @(
    UI.Hidden: false,
    Common.ValueList: {
        CollectionPath: 'Currencies',
        Parameters: [
            { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: code, ValueListProperty: 'code' },
            { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
    }
);

annotate Country with @(
    Common.ValueList: {
        CollectionPath: 'Countries',
        Parameters: [
            { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: code, ValueListProperty: 'code' },
            { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
        ]
    }
);
