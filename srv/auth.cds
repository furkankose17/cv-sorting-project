/**
 * Authorization Configuration
 * Following SAP CAP Security Best Practices
 *
 * @see https://cap.cloud.sap/docs/guides/security/authorization
 */
using { CandidateService, JobService, CVProcessingService, MatchingService, AdminService, AnalyticsService } from './services';
using { cv.sorting as db } from '../db/schema';

// ============================================
// ROLE DEFINITIONS
// ============================================

// Roles are defined in xs-security.json and referenced here
// CVAdmin, Recruiter, HRManager, HRReviewer, JobManager, Viewer

// ============================================
// CANDIDATE SERVICE AUTHORIZATION
// ============================================

annotate CandidateService with @(requires: 'authenticated-user');

// Candidates entity
annotate CandidateService.Candidates with @(
    restrict: [
        { grant: 'READ', to: ['Viewer', 'Recruiter', 'HRManager', 'HRReviewer', 'CVAdmin'] },
        { grant: 'WRITE', to: ['Recruiter', 'HRManager', 'CVAdmin'] },
        { grant: 'DELETE', to: ['HRManager', 'CVAdmin'] }
    ]
);

// Bound actions on Candidates
annotate CandidateService.Candidates actions {
    @(requires: ['Recruiter', 'HRManager', 'CVAdmin'])
    updateStatus;

    @(requires: ['Recruiter', 'HRManager', 'CVAdmin'])
    addSkill;

    @(requires: ['HRManager', 'CVAdmin'])
    markAsDuplicate;
}

// Candidate Notes - private notes handling
annotate CandidateService.CandidateNotes with @(
    restrict: [
        { grant: 'READ', where: 'isPrivate = false or createdBy = $user' },
        { grant: 'WRITE', to: ['Recruiter', 'HRManager', 'CVAdmin'] },
        { grant: 'DELETE', where: 'createdBy = $user', to: ['Recruiter', 'HRManager', 'CVAdmin'] }
    ]
);

// CV Documents
annotate CandidateService.CVDocuments with @(
    restrict: [
        { grant: 'READ', to: ['Viewer', 'Recruiter', 'HRManager', 'HRReviewer', 'CVAdmin'] },
        { grant: 'WRITE', to: ['Recruiter', 'HRManager', 'CVAdmin'] }
    ]
);

// Nested entities inherit from parent or have specific rules
annotate CandidateService.WorkExperiences with @(
    restrict: [
        { grant: '*', to: ['Recruiter', 'HRManager', 'CVAdmin'] },
        { grant: 'READ', to: ['Viewer', 'HRReviewer'] }
    ]
);

annotate CandidateService.Educations with @(
    restrict: [
        { grant: '*', to: ['Recruiter', 'HRManager', 'CVAdmin'] },
        { grant: 'READ', to: ['Viewer', 'HRReviewer'] }
    ]
);

annotate CandidateService.CandidateSkills with @(
    restrict: [
        { grant: '*', to: ['Recruiter', 'HRManager', 'CVAdmin'] },
        { grant: 'READ', to: ['Viewer', 'HRReviewer'] }
    ]
);

// Service-level actions
annotate CandidateService.bulkUpdateStatus with @(requires: ['HRManager', 'CVAdmin']);
annotate CandidateService.mergeCandidates with @(requires: ['HRManager', 'CVAdmin']);
annotate CandidateService.extractSkillsFromText with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);
annotate CandidateService.searchCandidates with @(requires: ['Viewer', 'Recruiter', 'HRManager', 'HRReviewer', 'CVAdmin']);
annotate CandidateService.findSimilarCandidates with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);
annotate CandidateService.getCandidateTimeline with @(requires: ['Recruiter', 'HRManager', 'HRReviewer', 'CVAdmin']);

// ============================================
// JOB SERVICE AUTHORIZATION
// ============================================

annotate JobService with @(requires: 'authenticated-user');

annotate JobService.JobPostings with @(
    restrict: [
        { grant: 'READ', to: ['Viewer', 'Recruiter', 'HRManager', 'JobManager', 'CVAdmin'] },
        { grant: 'WRITE', to: ['JobManager', 'HRManager', 'CVAdmin'] },
        { grant: 'DELETE', to: ['HRManager', 'CVAdmin'] }
    ]
);

annotate JobService.JobPostings actions {
    @(requires: ['JobManager', 'HRManager', 'CVAdmin'])
    publish;

    @(requires: ['JobManager', 'HRManager', 'CVAdmin'])
    close;

    @(requires: ['JobManager', 'HRManager', 'CVAdmin'])
    reopen;

    @(requires: ['Recruiter', 'HRManager', 'CVAdmin'])
    findMatchingCandidates;
}

annotate JobService.MatchResults with @(
    restrict: [
        { grant: 'READ', to: ['Recruiter', 'HRManager', 'JobManager', 'CVAdmin'] },
        { grant: 'WRITE', to: ['Recruiter', 'HRManager', 'CVAdmin'] }
    ]
);

annotate JobService.MatchResults actions {
    @(requires: ['Recruiter', 'HRManager', 'CVAdmin'])
    review;
}

// ============================================
// CV PROCESSING SERVICE AUTHORIZATION
// ============================================

annotate CVProcessingService with @(requires: 'authenticated-user');

annotate CVProcessingService.Documents with @(
    restrict: [
        { grant: 'READ', to: ['Viewer', 'Recruiter', 'HRManager', 'HRReviewer', 'CVAdmin'] },
        { grant: 'WRITE', to: ['Recruiter', 'HRManager', 'CVAdmin'] }
    ]
);

annotate CVProcessingService.Documents actions {
    @(requires: ['Recruiter', 'HRManager', 'CVAdmin'])
    process;

    @(requires: ['Recruiter', 'HRManager', 'CVAdmin'])
    reprocess;
}

annotate CVProcessingService.uploadDocument with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);
annotate CVProcessingService.createCandidateFromDocument with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);
annotate CVProcessingService.previewExtraction with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);

// ============================================
// MATCHING SERVICE AUTHORIZATION
// ============================================

annotate MatchingService with @(requires: 'authenticated-user');

annotate MatchingService.MatchResults with @(
    restrict: [
        { grant: 'READ', to: ['Recruiter', 'HRManager', 'JobManager', 'CVAdmin'] }
    ]
);

annotate MatchingService.SortingConfigurations with @(
    restrict: [
        { grant: 'READ', to: ['Recruiter', 'HRManager', 'CVAdmin'] },
        { grant: 'WRITE', where: 'owner = $user or isPublic = true', to: ['Recruiter', 'HRManager', 'CVAdmin'] }
    ]
);

annotate MatchingService.SavedFilters with @(
    restrict: [
        { grant: 'READ', where: 'owner = $user or isPublic = true' },
        { grant: 'WRITE', where: 'owner = $user', to: ['Recruiter', 'HRManager', 'CVAdmin'] }
    ]
);

// Matching actions
annotate MatchingService.calculateMatch with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);
annotate MatchingService.batchMatch with @(requires: ['HRManager', 'CVAdmin']);
annotate MatchingService.rankCandidates with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);
annotate MatchingService.sortCandidates with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);
annotate MatchingService.filterCandidates with @(requires: ['Recruiter', 'HRManager', 'CVAdmin']);

// ============================================
// ADMIN SERVICE AUTHORIZATION
// ============================================

// Admin service requires CVAdmin role (defined at service level)
annotate AdminService with @(requires: 'CVAdmin');

// All entities and actions in AdminService require CVAdmin
annotate AdminService.Skills with @(restrict: [{ grant: '*', to: 'CVAdmin' }]);
annotate AdminService.SkillCategories with @(restrict: [{ grant: '*', to: 'CVAdmin' }]);
annotate AdminService.CandidateStatuses with @(restrict: [{ grant: '*', to: 'CVAdmin' }]);
annotate AdminService.DegreeLevels with @(restrict: [{ grant: '*', to: 'CVAdmin' }]);
annotate AdminService.AuditLogs with @(restrict: [{ grant: 'READ', to: 'CVAdmin' }]);

// ============================================
// ANALYTICS SERVICE AUTHORIZATION
// ============================================

annotate AnalyticsService with @(requires: ['HRManager', 'CVAdmin']);

// All analytics functions require at least HRManager role
annotate AnalyticsService.getPipelineOverview with @(requires: ['HRManager', 'CVAdmin']);
annotate AnalyticsService.getSkillAnalytics with @(requires: ['HRManager', 'CVAdmin']);
annotate AnalyticsService.getRecruiterMetrics with @(requires: ['HRManager', 'CVAdmin']);
annotate AnalyticsService.getTrends with @(requires: ['HRManager', 'CVAdmin']);

// ============================================
// DATA PRIVACY ANNOTATIONS
// ============================================

// Mark personal data for GDPR compliance
annotate db.Candidates with @PersonalData: {
    DataSubjectRole: 'Candidate',
    EntitySemantics: 'DataSubject'
} {
    ID              @PersonalData.FieldSemantics: 'DataSubjectID';
    firstName       @PersonalData.IsPotentiallyPersonal;
    lastName        @PersonalData.IsPotentiallyPersonal;
    email           @PersonalData.IsPotentiallyPersonal;
    phone           @PersonalData.IsPotentiallyPersonal;
    address         @PersonalData.IsPotentiallyPersonal;
    linkedInUrl     @PersonalData.IsPotentiallyPersonal;
}

annotate db.CVDocuments with @PersonalData: {
    EntitySemantics: 'DataSubjectDetails'
} {
    extractedText   @PersonalData.IsPotentiallyPersonal;
    extractedData   @PersonalData.IsPotentiallyPersonal;
    fileContent     @PersonalData.IsPotentiallyPersonal;
}

// ============================================
// AUDIT LOG CONFIGURATION
// ============================================

// Enable change tracking for key entities
annotate db.Candidates with @changelog: [firstName, lastName, email, status];
annotate db.JobPostings with @changelog: [title, status, publishedAt, closingDate];
annotate db.MatchResults with @changelog: [reviewStatus, reviewedBy, reviewNotes];
