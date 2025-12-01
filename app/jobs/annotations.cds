/**
 * Fiori Elements Annotations for Job Management
 */
using JobService from '../../srv/services';

// ============================================
// JOB POSTINGS - LIST REPORT
// ============================================

annotate JobService.JobPostings with @(
    UI: {
        // Header Info
        HeaderInfo: {
            TypeName: '{i18n>JobPosting}',
            TypeNamePlural: '{i18n>JobPostings}',
            Title: { Value: title },
            Description: { Value: department },
            TypeImageUrl: 'sap-icon://business-card'
        },

        // Selection Fields
        SelectionFields: [
            status,
            department,
            location,
            employmentType,
            locationType,
            publishedAt
        ],

        // Line Item
        LineItem: [
            {
                Value: title,
                Label: '{i18n>Title}',
                ![@HTML5.CssDefaults]: { width: '20rem' }
            },
            { Value: jobCode, Label: '{i18n>JobCode}' },
            { Value: department, Label: '{i18n>Department}' },
            { Value: location, Label: '{i18n>Location}' },
            {
                Value: status,
                Label: '{i18n>Status}',
                Criticality: statusCriticality,
                ![@HTML5.CssDefaults]: { width: '8rem' }
            },
            { Value: employmentType, Label: '{i18n>EmploymentType}' },
            { Value: applicationCount, Label: '{i18n>Applications}' },
            { Value: publishedAt, Label: '{i18n>PublishedAt}' },
            { Value: closingDate, Label: '{i18n>ClosingDate}' }
        ],

        // Actions
        Identification: [
            { $Type: 'UI.DataFieldForAction', Action: 'JobService.publish', Label: '{i18n>Publish}' },
            { $Type: 'UI.DataFieldForAction', Action: 'JobService.close', Label: '{i18n>Close}' },
            { $Type: 'UI.DataFieldForAction', Action: 'JobService.findMatchingCandidates', Label: '{i18n>FindMatches}' }
        ],

        PresentationVariant: {
            SortOrder: [
                { Property: createdAt, Descending: true }
            ]
        }
    }
);

// ============================================
// JOB POSTINGS - OBJECT PAGE
// ============================================

annotate JobService.JobPostings with @(
    UI: {
        HeaderFacets: [
            {
                $Type: 'UI.ReferenceFacet',
                Target: '@UI.FieldGroup#HeaderStats',
                Label: '{i18n>Statistics}'
            },
            {
                $Type: 'UI.ReferenceFacet',
                Target: '@UI.DataPoint#Status',
                Label: '{i18n>Status}'
            }
        ],

        DataPoint#Status: {
            Value: status,
            Title: '{i18n>Status}',
            Criticality: statusCriticality
        },

        FieldGroup#HeaderStats: {
            Data: [
                { Value: applicationCount, Label: '{i18n>Applications}' },
                { Value: viewCount, Label: '{i18n>Views}' },
                { Value: numberOfPositions, Label: '{i18n>Positions}' }
            ]
        },

        FieldGroup#BasicInfo: {
            Label: '{i18n>BasicInformation}',
            Data: [
                { Value: title, Label: '{i18n>Title}' },
                { Value: jobCode, Label: '{i18n>JobCode}' },
                { Value: department, Label: '{i18n>Department}' },
                { Value: hiringManager, Label: '{i18n>HiringManager}' },
                { Value: recruiter, Label: '{i18n>Recruiter}' }
            ]
        },

        FieldGroup#Location: {
            Label: '{i18n>Location}',
            Data: [
                { Value: location, Label: '{i18n>Location}' },
                { Value: country_code, Label: '{i18n>Country}' },
                { Value: locationType, Label: '{i18n>LocationType}' }
            ]
        },

        FieldGroup#Employment: {
            Label: '{i18n>EmploymentDetails}',
            Data: [
                { Value: employmentType, Label: '{i18n>EmploymentType}' },
                { Value: numberOfPositions, Label: '{i18n>Positions}' }
            ]
        },

        FieldGroup#Compensation: {
            Label: '{i18n>Compensation}',
            Data: [
                { Value: salaryMin, Label: '{i18n>MinSalary}' },
                { Value: salaryMax, Label: '{i18n>MaxSalary}' },
                { Value: salaryCurrency_code, Label: '{i18n>Currency}' },
                { Value: showSalary, Label: '{i18n>ShowSalary}' }
            ]
        },

        FieldGroup#Requirements: {
            Label: '{i18n>Requirements}',
            Data: [
                { Value: minimumExperience, Label: '{i18n>MinExperience}' },
                { Value: preferredExperience, Label: '{i18n>PreferredExperience}' },
                { Value: requiredEducation_code, Label: '{i18n>RequiredEducation}' }
            ]
        },

        FieldGroup#Timeline: {
            Label: '{i18n>Timeline}',
            Data: [
                { Value: status, Label: '{i18n>Status}', Criticality: statusCriticality },
                { Value: publishedAt, Label: '{i18n>PublishedAt}' },
                { Value: closingDate, Label: '{i18n>ClosingDate}' },
                { Value: targetHireDate, Label: '{i18n>TargetHireDate}' }
            ]
        },

        FieldGroup#MatchingWeights: {
            Label: '{i18n>MatchingConfiguration}',
            Data: [
                { Value: skillWeight, Label: '{i18n>SkillWeight}' },
                { Value: experienceWeight, Label: '{i18n>ExperienceWeight}' },
                { Value: educationWeight, Label: '{i18n>EducationWeight}' },
                { Value: locationWeight, Label: '{i18n>LocationWeight}' }
            ]
        },

        // Object Page Facets
        Facets: [
            {
                $Type: 'UI.CollectionFacet',
                ID: 'GeneralInfo',
                Label: '{i18n>GeneralInformation}',
                Facets: [
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#BasicInfo' },
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Location' },
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Employment' }
                ]
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Description',
                Label: '{i18n>Description}',
                Target: '@UI.FieldGroup#Description'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'RequiredSkills',
                Label: '{i18n>RequiredSkills}',
                Target: 'requiredSkills/@UI.LineItem'
            },
            {
                $Type: 'UI.CollectionFacet',
                ID: 'CompensationReq',
                Label: '{i18n>CompensationRequirements}',
                Facets: [
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Compensation' },
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Requirements' }
                ]
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Timeline',
                Label: '{i18n>Timeline}',
                Target: '@UI.FieldGroup#Timeline'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Matches',
                Label: '{i18n>CandidateMatches}',
                Target: 'matchResults/@UI.LineItem'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'MatchingConfig',
                Label: '{i18n>MatchingConfiguration}',
                Target: '@UI.FieldGroup#MatchingWeights'
            }
        ],

        FieldGroup#Description: {
            Data: [
                { Value: description, Label: '{i18n>Description}' },
                { Value: responsibilities, Label: '{i18n>Responsibilities}' },
                { Value: qualifications, Label: '{i18n>Qualifications}' },
                { Value: benefits, Label: '{i18n>Benefits}' }
            ]
        }
    }
);

// ============================================
// REQUIRED SKILLS
// ============================================

annotate JobService.JobRequiredSkills with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>RequiredSkill}',
            TypeNamePlural: '{i18n>RequiredSkills}'
        },
        LineItem: [
            { Value: skill.name, Label: '{i18n>Skill}' },
            { Value: skill.category.name, Label: '{i18n>Category}' },
            { Value: isRequired, Label: '{i18n>Required}' },
            { Value: minimumProficiency, Label: '{i18n>MinProficiency}' },
            { Value: weight, Label: '{i18n>Weight}' }
        ]
    }
);

// ============================================
// MATCH RESULTS
// ============================================

annotate JobService.MatchResults with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Match}',
            TypeNamePlural: '{i18n>Matches}',
            Title: { Value: candidate.fullName },
            Description: { Value: candidate.headline }
        },
        LineItem: [
            { Value: candidate.firstName, Label: '{i18n>FirstName}' },
            { Value: candidate.lastName, Label: '{i18n>LastName}' },
            {
                Value: overallScore,
                Label: '{i18n>OverallScore}',
                Criticality: scoreCriticality
            },
            { Value: skillScore, Label: '{i18n>SkillScore}' },
            { Value: experienceScore, Label: '{i18n>ExperienceScore}' },
            {
                Value: reviewStatus,
                Label: '{i18n>ReviewStatus}',
                Criticality: reviewStatusCriticality
            },
            { Value: rank, Label: '{i18n>Rank}' }
        ],
        Identification: [
            { $Type: 'UI.DataFieldForAction', Action: 'JobService.review', Label: '{i18n>Review}' }
        ]
    }
);

// ============================================
// VALUE HELPS & LABELS
// ============================================

annotate JobService.JobPostings with {
    ID                @UI.Hidden;
    status            @title: '{i18n>Status}';
    title             @title: '{i18n>Title}';
    department        @title: '{i18n>Department}';
    location          @title: '{i18n>Location}';
    employmentType    @title: '{i18n>EmploymentType}'  @Common.ValueListWithFixedValues;
    locationType      @title: '{i18n>LocationType}'    @Common.ValueListWithFixedValues;
    minimumExperience @title: '{i18n>MinExperience}'   @Measures.Unit: 'years';
    salaryMin         @title: '{i18n>MinSalary}';
    salaryMax         @title: '{i18n>MaxSalary}';

    statusCriticality @UI.Hidden;
}

// Status criticality mapping
annotate JobService.JobPostings with {
    statusCriticality @Core.Computed;
}
