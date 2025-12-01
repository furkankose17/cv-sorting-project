/**
 * Fiori Elements Annotations for Candidate Management
 * Following SAP Fiori Design Guidelines
 *
 * @see https://experience.sap.com/fiori-design-web/
 */
using CandidateService from '../../srv/services';

// ============================================
// CANDIDATES - LIST REPORT
// ============================================

annotate CandidateService.Candidates with @(
    UI: {
        // Header Info
        HeaderInfo: {
            TypeName: '{i18n>Candidate}',
            TypeNamePlural: '{i18n>Candidates}',
            Title: { Value: fullName },
            Description: { Value: headline },
            ImageUrl: linkedInUrl,
            TypeImageUrl: 'sap-icon://person-placeholder'
        },

        // Selection Fields for Filter Bar
        SelectionFields: [
            status_code,
            totalExperienceYears,
            city,
            country_code,
            source,
            createdAt
        ],

        // Line Item (Table Columns)
        LineItem: [
            { Value: firstName, Label: '{i18n>FirstName}' },
            { Value: lastName, Label: '{i18n>LastName}' },
            { Value: email, Label: '{i18n>Email}' },
            {
                Value: status_code,
                Label: '{i18n>Status}',
                Criticality: status.criticality,
                ![@HTML5.CssDefaults]: { width: '8rem' }
            },
            { Value: totalExperienceYears, Label: '{i18n>Experience}' },
            { Value: city, Label: '{i18n>City}' },
            {
                Value: overallScore,
                Label: '{i18n>MatchScore}',
                ![@HTML5.CssDefaults]: { width: '6rem' }
            },
            { Value: source, Label: '{i18n>Source}' },
            {
                Value: createdAt,
                Label: '{i18n>CreatedAt}',
                ![@HTML5.CssDefaults]: { width: '10rem' }
            }
        ],

        // Sort Order
        PresentationVariant: {
            SortOrder: [
                { Property: modifiedAt, Descending: true }
            ],
            Visualizations: ['@UI.LineItem']
        },

        // Quick Actions
        Identification: [
            { $Type: 'UI.DataFieldForAction', Action: 'CandidateService.updateStatus', Label: '{i18n>UpdateStatus}' }
        ]
    }
);

// ============================================
// CANDIDATES - OBJECT PAGE
// ============================================

annotate CandidateService.Candidates with @(
    UI: {
        // Header Facets
        HeaderFacets: [
            {
                $Type: 'UI.ReferenceFacet',
                Target: '@UI.FieldGroup#HeaderStatus',
                Label: '{i18n>Status}'
            },
            {
                $Type: 'UI.ReferenceFacet',
                Target: '@UI.DataPoint#MatchScore',
                Label: '{i18n>MatchScore}'
            },
            {
                $Type: 'UI.ReferenceFacet',
                Target: '@UI.DataPoint#Experience',
                Label: '{i18n>Experience}'
            }
        ],

        // Data Points for Header
        DataPoint#MatchScore: {
            Value: overallScore,
            Title: '{i18n>MatchScore}',
            TargetValue: 100,
            Visualization: #Progress,
            Criticality: #Positive
        },
        DataPoint#Experience: {
            Value: totalExperienceYears,
            Title: '{i18n>YearsExperience}'
        },

        // Field Groups
        FieldGroup#HeaderStatus: {
            Data: [
                { Value: status_code, Label: '{i18n>Status}', Criticality: status.criticality },
                { Value: source, Label: '{i18n>Source}' }
            ]
        },

        FieldGroup#PersonalInfo: {
            Label: '{i18n>PersonalInformation}',
            Data: [
                { Value: firstName, Label: '{i18n>FirstName}' },
                { Value: lastName, Label: '{i18n>LastName}' },
                { Value: email, Label: '{i18n>Email}' },
                { Value: phone, Label: '{i18n>Phone}' },
                { Value: linkedInUrl, Label: '{i18n>LinkedIn}' },
                { Value: portfolioUrl, Label: '{i18n>Portfolio}' }
            ]
        },

        FieldGroup#Location: {
            Label: '{i18n>Location}',
            Data: [
                { Value: city, Label: '{i18n>City}' },
                { Value: country_code, Label: '{i18n>Country}' },
                { Value: address, Label: '{i18n>Address}' },
                { Value: willingToRelocate, Label: '{i18n>WillingToRelocate}' }
            ]
        },

        FieldGroup#Professional: {
            Label: '{i18n>ProfessionalDetails}',
            Data: [
                { Value: headline, Label: '{i18n>Headline}' },
                { Value: totalExperienceYears, Label: '{i18n>TotalExperience}' },
                { Value: expectedSalary, Label: '{i18n>ExpectedSalary}' },
                { Value: salaryCurrency_code, Label: '{i18n>Currency}' },
                { Value: noticePeriodDays, Label: '{i18n>NoticePeriod}' },
                { Value: availableFrom, Label: '{i18n>AvailableFrom}' }
            ]
        },

        FieldGroup#AIMetrics: {
            Label: '{i18n>AIMetrics}',
            Data: [
                { Value: overallScore, Label: '{i18n>OverallScore}' },
                { Value: aiConfidenceScore, Label: '{i18n>AIConfidence}' }
            ]
        },

        // Object Page Facets (Sections)
        Facets: [
            {
                $Type: 'UI.CollectionFacet',
                ID: 'GeneralInfo',
                Label: '{i18n>GeneralInformation}',
                Facets: [
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#PersonalInfo' },
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Location' },
                    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Professional' }
                ]
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Summary',
                Label: '{i18n>Summary}',
                Target: '@UI.FieldGroup#Summary'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Experience',
                Label: '{i18n>WorkExperience}',
                Target: 'experiences/@UI.LineItem'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Education',
                Label: '{i18n>Education}',
                Target: 'educations/@UI.LineItem'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Skills',
                Label: '{i18n>Skills}',
                Target: 'skills/@UI.LineItem'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Documents',
                Label: '{i18n>Documents}',
                Target: 'documents/@UI.LineItem'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Notes',
                Label: '{i18n>Notes}',
                Target: 'notes/@UI.LineItem'
            }
        ],

        FieldGroup#Summary: {
            Label: '{i18n>Summary}',
            Data: [
                { Value: summary, Label: '{i18n>ProfessionalSummary}' }
            ]
        }
    }
);

// ============================================
// WORK EXPERIENCES
// ============================================

annotate CandidateService.WorkExperiences with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Experience}',
            TypeNamePlural: '{i18n>Experiences}',
            Title: { Value: jobTitle },
            Description: { Value: companyName }
        },
        LineItem: [
            { Value: jobTitle, Label: '{i18n>JobTitle}' },
            { Value: companyName, Label: '{i18n>Company}' },
            { Value: location, Label: '{i18n>Location}' },
            { Value: startDate, Label: '{i18n>StartDate}' },
            { Value: endDate, Label: '{i18n>EndDate}' },
            { Value: isCurrent, Label: '{i18n>Current}' },
            { Value: durationMonths, Label: '{i18n>Duration}' }
        ]
    }
);

// ============================================
// EDUCATION
// ============================================

annotate CandidateService.Educations with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Education}',
            TypeNamePlural: '{i18n>Education}',
            Title: { Value: degree },
            Description: { Value: institution }
        },
        LineItem: [
            { Value: degree, Label: '{i18n>Degree}' },
            { Value: institution, Label: '{i18n>Institution}' },
            { Value: fieldOfStudy, Label: '{i18n>FieldOfStudy}' },
            { Value: startDate, Label: '{i18n>StartDate}' },
            { Value: endDate, Label: '{i18n>EndDate}' },
            { Value: grade, Label: '{i18n>Grade}' }
        ]
    }
);

// ============================================
// SKILLS
// ============================================

annotate CandidateService.CandidateSkills with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Skill}',
            TypeNamePlural: '{i18n>Skills}',
            Title: { Value: skill.name }
        },
        LineItem: [
            { Value: skill.name, Label: '{i18n>Skill}' },
            { Value: skill.category.name, Label: '{i18n>Category}' },
            { Value: proficiencyLevel, Label: '{i18n>Proficiency}' },
            { Value: yearsOfExperience, Label: '{i18n>Years}' },
            { Value: isVerified, Label: '{i18n>Verified}' }
        ]
    }
);

// ============================================
// DOCUMENTS
// ============================================

annotate CandidateService.CVDocuments with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Document}',
            TypeNamePlural: '{i18n>Documents}',
            Title: { Value: fileName }
        },
        LineItem: [
            { Value: fileName, Label: '{i18n>FileName}' },
            { Value: fileType, Label: '{i18n>Type}' },
            {
                Value: processingStatus,
                Label: '{i18n>Status}',
                Criticality: processingStatusCriticality
            },
            { Value: ocrConfidence, Label: '{i18n>Confidence}' },
            { Value: createdAt, Label: '{i18n>UploadedAt}' }
        ]
    }
);

// Virtual criticality for processing status
annotate CandidateService.CVDocuments with {
    processingStatusCriticality @UI.Hidden;
};

// ============================================
// NOTES
// ============================================

annotate CandidateService.CandidateNotes with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Note}',
            TypeNamePlural: '{i18n>Notes}',
            Title: { Value: noteType }
        },
        LineItem: [
            { Value: noteType, Label: '{i18n>Type}' },
            { Value: noteText, Label: '{i18n>Note}' },
            { Value: createdBy, Label: '{i18n>CreatedBy}' },
            { Value: createdAt, Label: '{i18n>CreatedAt}' },
            { Value: isPrivate, Label: '{i18n>Private}' }
        ]
    }
);

// ============================================
// VALUE HELPS
// ============================================

annotate CandidateService.Candidates with {
    status @(
        Common: {
            Text: status.name,
            TextArrangement: #TextOnly,
            ValueList: {
                CollectionPath: 'CandidateStatuses',
                Parameters: [
                    { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status_code, ValueListProperty: 'code' },
                    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
                ]
            }
        }
    );

    country @(
        Common: {
            Text: country.name,
            TextArrangement: #TextFirst,
            ValueListWithFixedValues: true
        }
    );
}

annotate CandidateService.CandidateSkills with {
    skill @(
        Common: {
            Text: skill.name,
            TextArrangement: #TextOnly,
            ValueList: {
                CollectionPath: 'Skills',
                Parameters: [
                    { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: skill_ID, ValueListProperty: 'ID' },
                    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
                    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'category/name' }
                ]
            }
        }
    );

    proficiencyLevel @(
        Common: {
            ValueListWithFixedValues: true
        }
    );
}

// ============================================
// LABELS AND SEMANTICS
// ============================================

annotate CandidateService.Candidates with {
    ID                   @UI.Hidden;
    createdAt            @UI.HiddenFilter: false;
    createdBy            @UI.HiddenFilter: true;
    modifiedAt           @UI.HiddenFilter: true;
    modifiedBy           @UI.HiddenFilter: true;

    firstName            @title: '{i18n>FirstName}';
    lastName             @title: '{i18n>LastName}';
    email                @title: '{i18n>Email}'  @Communication.IsEmailAddress;
    phone                @title: '{i18n>Phone}'  @Communication.IsPhoneNumber;
    linkedInUrl          @title: '{i18n>LinkedIn}';
    city                 @title: '{i18n>City}';
    totalExperienceYears @title: '{i18n>Experience}'  @Measures.Unit: 'years';
    overallScore         @title: '{i18n>MatchScore}'  @Measures.Unit: '%';
    aiConfidenceScore    @title: '{i18n>AIConfidence}'  @Measures.Unit: '%';
}
