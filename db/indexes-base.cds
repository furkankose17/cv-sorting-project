/**
 * Base Database Indexes - Portable across SQLite and HANA
 * Uses @cds.index annotation for database-agnostic index definitions
 *
 * Performance optimizations for:
 * - Candidate filtering and search
 * - Job matching queries
 * - Skills lookups (N+1 prevention)
 * - Interview scheduling
 * - Audit trail queries
 */

using { cv.sorting as db } from './schema';

// ============================================
// CANDIDATE INDEXES
// ============================================

annotate db.Candidates with {
  // Search and filtering
  email @cds.index;                      // Unique candidate lookup
  status @cds.index;                     // Filter by status (new, screening, hired)
  totalExperienceYears @cds.index;       // Range filtering on experience
  city @cds.index;                       // Geographic filtering

  // Tracking and analytics
  createdAt @cds.index;                  // Time-based queries
  modifiedAt @cds.index;                 // Recently updated candidates
};

// ============================================
// MATCH RESULTS - MOST CRITICAL FOR PERFORMANCE
// ============================================

annotate db.MatchResults with {
  // Foreign keys - enables efficient joins
  candidate @cds.index;                  // Find all matches for a candidate
  jobPosting @cds.index;                 // Find all candidates for a job

  // Filtering and ranking
  reviewStatus @cds.index;               // Filter by review state
  overallScore @cds.index;               // Score-based queries and ranking

  // Tracking
  createdAt @cds.index;                  // Recent matches
  matchedAt @cds.index;                  // When match was calculated
};

// ============================================
// CANDIDATE SKILLS - N+1 QUERY PREVENTION
// ============================================

annotate db.CandidateSkills with {
  // Foreign keys - critical for batch loading
  candidate @cds.index;                  // Get all skills for a candidate
  skill @cds.index;                      // Get all candidates with a skill

  // Filtering
  proficiencyLevel @cds.index;           // Filter by skill level
  isVerified @cds.index;                 // Verified skills only
};

// ============================================
// JOB REQUIRED SKILLS
// ============================================

annotate db.JobRequiredSkills with {
  // Foreign keys
  jobPosting @cds.index;                 // Get required skills for a job
  skill @cds.index;                      // Get jobs requiring a skill

  // Filtering
  isRequired @cds.index;                 // Required vs nice-to-have
};

// ============================================
// WORK EXPERIENCES
// ============================================

annotate db.WorkExperiences with {
  // Foreign key
  candidate @cds.index;                  // Get work history for candidate

  // Timeline queries
  startDate @cds.index;                  // Chronological sorting
  endDate @cds.index;                    // Current position filtering
};

// ============================================
// EDUCATIONS
// ============================================

annotate db.Educations with {
  // Foreign key
  candidate @cds.index;                  // Get education history

  // Filtering
  degreeLevel @cds.index;                // Qualification level filtering
};

// ============================================
// CV DOCUMENTS
// ============================================

annotate db.CVDocuments with {
  // Foreign key
  candidate @cds.index;                  // Get documents for candidate

  // Processing status
  processingStatus @cds.index;           // Batch processing queries

  // Versioning
  isLatest @cds.index;                   // Get latest version only
};

// ============================================
// CANDIDATE LANGUAGES
// ============================================

annotate db.CandidateLanguages with {
  candidate @cds.index;                  // Get languages for candidate
};

// ============================================
// CERTIFICATIONS
// ============================================

annotate db.Certifications with {
  // Foreign key
  candidate @cds.index;                  // Get certifications for candidate

  // Validity
  expirationDate @cds.index;             // Valid certifications only
};

// ============================================
// CANDIDATE NOTES
// ============================================

annotate db.CandidateNotes with {
  candidate @cds.index;                  // Get notes for candidate
  noteType @cds.index;                   // Filter by note type
};

// ============================================
// INTERVIEWS
// ============================================

annotate db.Interviews with {
  // Foreign keys
  candidate @cds.index;                  // Interview history for candidate
  jobPosting @cds.index;                 // Interviews for job

  // Status and scheduling
  status @cds.index;                     // Filter by interview status
  scheduledAt @cds.index;                // Upcoming interviews

  // Tracking
  createdAt @cds.index;                  // Recently scheduled
};

// ============================================
// AUDIT LOGS
// ============================================

annotate db.AuditLogs with {
  // Entity tracking
  entityName @cds.index;                 // Changes by entity type
  entityId @cds.index;                   // Changes to specific record

  // Timeline
  modifiedAt @cds.index;                 // Recent changes
};

// ============================================
// JOB POSTINGS
// ============================================

annotate db.JobPostings with {
  // Status filtering
  status @cds.index;                     // Active/open positions

  // Timeline
  publishedAt @cds.index;                // Recently published
  closingDate @cds.index;                // Deadline-based filtering

  // Tracking
  createdAt @cds.index;                  // New job postings
};

// ============================================
// SKILLS CATALOG
// ============================================

annotate db.Skills with {
  // Category filtering
  category @cds.index;                   // Skills by category

  // Search optimization
  normalizedName @cds.index;             // Case-insensitive lookup
};
