/**
 * Fiori Elements Annotations for Candidate Management App
 * Following SAP Fiori Design Guidelines
 *
 * @see https://experience.sap.com/fiori-design-web/
 */
using CandidateService from '../../srv/services';

// ============================================
// CANDIDATES - LIST REPORT
// ============================================

annotate CandidateService.Candidates with @(
    Capabilities: {
        InsertRestrictions: { Insertable: true },
        UpdateRestrictions: { Updatable: true },
        DeleteRestrictions: { Deletable: true },
        FilterRestrictions: {
            FilterExpressionRestrictions: [
                { Property: createdAt, AllowedExpressions: 'SingleRange' }
            ]
        }
    },
    UI: {
        // Header Info
        HeaderInfo: {
            TypeName: '{i18n>Candidate}',
            TypeNamePlural: '{i18n>Candidates}',
            Title: { Value: fullName },
            Description: { Value: headline },
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

        // Line Item (Table Columns) - Columns with #High importance are visible by default
        LineItem: [
            {
                Value: firstName,
                Label: '{i18n>FirstName}',
                ![@UI.Importance]: #High,
                ![@HTML5.CssDefaults]: { width: '10rem' }
            },
            {
                Value: lastName,
                Label: '{i18n>LastName}',
                ![@UI.Importance]: #High,
                ![@HTML5.CssDefaults]: { width: '10rem' }
            },
            {
                Value: overallScore,
                Label: '{i18n>AIScore}',
                ![@UI.Importance]: #High,
                ![@HTML5.CssDefaults]: { width: '7rem' }
            },
            {
                Value: totalExperienceYears,
                Label: '{i18n>YearsExperience}',
                ![@UI.Importance]: #High,
                ![@HTML5.CssDefaults]: { width: '8rem' }
            },
            {
                Value: status.name,
                Label: '{i18n>Status}',
                ![@UI.Importance]: #High,
                ![@HTML5.CssDefaults]: { width: '8rem' }
            },
            {
                Value: country.name,
                Label: '{i18n>Country}',
                ![@UI.Importance]: #High,
                ![@HTML5.CssDefaults]: { width: '10rem' }
            },
            {
                Value: email,
                Label: '{i18n>Email}',
                ![@UI.Importance]: #Medium,
                ![@HTML5.CssDefaults]: { width: '15rem' }
            },
            {
                Value: city,
                Label: '{i18n>City}',
                ![@UI.Importance]: #Medium,
                ![@HTML5.CssDefaults]: { width: '10rem' }
            },
            {
                Value: source,
                Label: '{i18n>Source}',
                ![@UI.Importance]: #Low,
                ![@HTML5.CssDefaults]: { width: '8rem' }
            },
            {
                Value: createdAt,
                Label: '{i18n>Created}',
                ![@UI.Importance]: #Low,
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
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.updateStatus',
                Label: '{i18n>UpdateStatus}',
                ![@UI.Importance]: #High
            },
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.addSkill',
                Label: '{i18n>AddSkill}',
                ![@UI.Importance]: #Medium
            }
            // Note: markAsDuplicate removed - use mergeCandidates via FindSimilar action instead
        ],

        // ============================================
        // OBJECT PAGE - HEADER
        // ============================================
        HeaderFacets: [
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'StatusFacet',
                Target: '@UI.FieldGroup#Status',
                Label: '{i18n>Status}'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'ContactFacet',
                Target: '@UI.FieldGroup#Contact',
                Label: '{i18n>Contact}'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'ScoreFacet',
                Target: '@UI.DataPoint#Score',
                Label: '{i18n>MatchScore}'
            }
        ],

        // Data Points
        DataPoint#Score: {
            Value: overallScore,
            Title: '{i18n>MatchScore}',
            Visualization: #Progress,
            TargetValue: 100,
            CriticalityCalculation: {
                ImprovementDirection: #Maximize,
                DeviationRangeLowValue: 40,
                ToleranceRangeLowValue: 60
            }
        },

        // Field Groups for Header
        FieldGroup#Status: {
            Data: [
                { Value: status.name, Label: '{i18n>Status}' },
                { Value: source, Label: '{i18n>Source}' }
            ]
        },

        FieldGroup#Contact: {
            Data: [
                { Value: email, Label: '{i18n>Email}' },
                { Value: phone, Label: '{i18n>Phone}' }
            ]
        },

        // Field Groups for Object Page (Facets defined at end of file with Interviews)
        FieldGroup#PersonalInfo: {
            Data: [
                { Value: firstName, Label: '{i18n>FirstName}' },
                { Value: lastName, Label: '{i18n>LastName}' },
                { Value: email, Label: '{i18n>Email}' },
                { Value: phone, Label: '{i18n>Phone}' },
                { Value: linkedInUrl, Label: '{i18n>LinkedIn}' }
            ]
        },

        FieldGroup#Location: {
            Data: [
                { Value: city, Label: '{i18n>City}' },
                { Value: state, Label: '{i18n>State}' },
                { Value: country.name, Label: '{i18n>Country}' }
            ]
        },

        FieldGroup#Professional: {
            Data: [
                { Value: headline, Label: '{i18n>Headline}' },
                { Value: totalExperienceYears, Label: '{i18n>YearsExperience}' },
                { Value: currentCompany, Label: '{i18n>CurrentCompany}' },
                { Value: currentJobTitle, Label: '{i18n>CurrentTitle}' }
            ]
        },

        FieldGroup#Summary: {
            Data: [
                { Value: summary, Label: '{i18n>Summary}' }
            ]
        }
    }
);

// ============================================
// WORK EXPERIENCES
// ============================================
annotate CandidateService.WorkExperiences with @(
    UI: {
        LineItem: [
            { Value: jobTitle, Label: '{i18n>JobTitle}', ![@UI.Importance]: #High },
            { Value: company, Label: '{i18n>Company}', ![@UI.Importance]: #High },
            { Value: startDate, Label: '{i18n>StartDate}' },
            { Value: endDate, Label: '{i18n>EndDate}' },
            { Value: isCurrent, Label: '{i18n>Current}' }
        ],
        HeaderInfo: {
            TypeName: '{i18n>Experience}',
            TypeNamePlural: '{i18n>Experiences}',
            Title: { Value: jobTitle },
            Description: { Value: company }
        },
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'ExperienceDetails',
                Label: '{i18n>Details}',
                Target: '@UI.FieldGroup#ExperienceDetails'
            }
        ],
        FieldGroup#ExperienceDetails: {
            Data: [
                { Value: jobTitle, Label: '{i18n>JobTitle}' },
                { Value: company, Label: '{i18n>Company}' },
                { Value: location, Label: '{i18n>Location}' },
                { Value: startDate, Label: '{i18n>StartDate}' },
                { Value: endDate, Label: '{i18n>EndDate}' },
                { Value: isCurrent, Label: '{i18n>Current}' },
                { Value: description, Label: '{i18n>Description}' }
            ]
        }
    }
);

// ============================================
// EDUCATIONS
// ============================================
annotate CandidateService.Educations with @(
    UI: {
        LineItem: [
            { Value: degree, Label: '{i18n>Degree}', ![@UI.Importance]: #High },
            { Value: fieldOfStudy, Label: '{i18n>FieldOfStudy}', ![@UI.Importance]: #High },
            { Value: institution, Label: '{i18n>Institution}' },
            { Value: graduationYear, Label: '{i18n>GraduationYear}' }
        ],
        HeaderInfo: {
            TypeName: '{i18n>Education}',
            TypeNamePlural: '{i18n>Educations}',
            Title: { Value: degree },
            Description: { Value: institution }
        }
    }
);

// ============================================
// CANDIDATE SKILLS
// ============================================
annotate CandidateService.CandidateSkills with @(
    UI: {
        LineItem: [
            { Value: skill.name, Label: '{i18n>Skill}', ![@UI.Importance]: #High },
            { Value: proficiencyLevel, Label: '{i18n>Proficiency}' },
            { Value: yearsOfExperience, Label: '{i18n>YearsExperience}' }
        ],
        HeaderInfo: {
            TypeName: '{i18n>Skill}',
            TypeNamePlural: '{i18n>Skills}',
            Title: { Value: skill.name }
        }
    }
);

// ============================================
// CV DOCUMENTS
// ============================================
annotate CandidateService.CVDocuments with @(
    UI: {
        LineItem: [
            { Value: fileName, Label: '{i18n>FileName}', ![@UI.Importance]: #High },
            { Value: status, Label: '{i18n>Status}' },
            { Value: uploadedAt, Label: '{i18n>UploadedAt}' },
            { Value: mimeType, Label: '{i18n>FileType}' }
        ],
        HeaderInfo: {
            TypeName: '{i18n>Document}',
            TypeNamePlural: '{i18n>Documents}',
            Title: { Value: fileName }
        }
    }
);

// ============================================
// CANDIDATE NOTES
// ============================================
annotate CandidateService.CandidateNotes with @(
    UI: {
        LineItem: [
            { Value: noteText, Label: '{i18n>NoteText}', ![@UI.Importance]: #High },
            { Value: noteType, Label: '{i18n>NoteType}', ![@UI.Importance]: #High },
            { Value: isPinned, Label: '{i18n>Pinned}' },
            { Value: createdAt, Label: '{i18n>Created}' },
            { Value: createdBy, Label: '{i18n>CreatedBy}' }
        ],
        HeaderInfo: {
            TypeName: '{i18n>Note}',
            TypeNamePlural: '{i18n>Notes}',
            Title: { Value: noteType },
            Description: { Value: noteText }
        },
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'NoteDetails',
                Label: '{i18n>Details}',
                Target: '@UI.FieldGroup#NoteDetails'
            }
        ],
        FieldGroup#NoteDetails: {
            Data: [
                { Value: noteText, Label: '{i18n>NoteText}' },
                { Value: noteType, Label: '{i18n>NoteType}' },
                { Value: isPrivate, Label: '{i18n>Private}' },
                { Value: isPinned, Label: '{i18n>Pinned}' },
                { Value: createdAt, Label: '{i18n>Created}' },
                { Value: createdBy, Label: '{i18n>CreatedBy}' }
            ]
        }
    }
);

// ============================================
// CANDIDATE LANGUAGES
// ============================================
annotate CandidateService.CandidateLanguages with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Language}',
            TypeNamePlural: '{i18n>Languages}',
            Title: { Value: languageName },
            Description: { Value: proficiency }
        },
        LineItem: [
            { Value: languageName, Label: '{i18n>LanguageName}', ![@UI.Importance]: #High },
            { Value: proficiency, Label: '{i18n>Proficiency}', ![@UI.Importance]: #High },
            { Value: isNative, Label: '{i18n>NativeSpeaker}' },
            { Value: languageCode, Label: '{i18n>LanguageCode}' }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'LanguageDetails',
                Label: '{i18n>Details}',
                Target: '@UI.FieldGroup#LanguageDetails'
            }
        ],
        FieldGroup#LanguageDetails: {
            Data: [
                { Value: languageName, Label: '{i18n>LanguageName}' },
                { Value: languageCode, Label: '{i18n>LanguageCode}' },
                { Value: proficiency, Label: '{i18n>Proficiency}' },
                { Value: isNative, Label: '{i18n>NativeSpeaker}' }
            ]
        }
    }
);

// ============================================
// CERTIFICATIONS
// ============================================
annotate CandidateService.Certifications with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Certification}',
            TypeNamePlural: '{i18n>Certifications}',
            Title: { Value: name },
            Description: { Value: issuingOrganization }
        },
        LineItem: [
            { Value: name, Label: '{i18n>CertificationName}', ![@UI.Importance]: #High },
            { Value: issuingOrganization, Label: '{i18n>IssuingOrganization}', ![@UI.Importance]: #High },
            { Value: issueDate, Label: '{i18n>IssueDate}' },
            { Value: expirationDate, Label: '{i18n>ExpirationDate}' },
            { Value: isValid, Label: '{i18n>Valid}' }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'CertificationDetails',
                Label: '{i18n>Details}',
                Target: '@UI.FieldGroup#CertificationDetails'
            }
        ],
        FieldGroup#CertificationDetails: {
            Data: [
                { Value: name, Label: '{i18n>CertificationName}' },
                { Value: issuingOrganization, Label: '{i18n>IssuingOrganization}' },
                { Value: issueDate, Label: '{i18n>IssueDate}' },
                { Value: expirationDate, Label: '{i18n>ExpirationDate}' },
                { Value: credentialId, Label: '{i18n>CredentialId}' },
                { Value: credentialUrl, Label: '{i18n>CredentialUrl}' },
                { Value: isValid, Label: '{i18n>Valid}' }
            ]
        }
    }
);

// Certification semantic annotations
annotate CandidateService.Certifications with {
    credentialUrl @Common.IsUrl;
};

// ============================================
// CANDIDATE STATUSES
// ============================================
annotate CandidateService.CandidateStatuses with @(
    UI: {
        LineItem: [
            { Value: code, Label: '{i18n>Code}' },
            { Value: name, Label: '{i18n>Name}' },
            { Value: description, Label: '{i18n>Description}' }
        ]
    }
);

// ============================================
// VALUE HELPS
// ============================================

// Status Value Help
annotate CandidateService.Candidates with {
    status @Common: {
        Text: status.name,
        TextArrangement: #TextOnly,
        ValueList: {
            CollectionPath: 'CandidateStatuses',
            Parameters: [
                { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status_code, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description' }
            ]
        }
    };
    country @Common: {
        Text: country.name,
        TextArrangement: #TextOnly,
        ValueList: {
            CollectionPath: 'Countries',
            Parameters: [
                { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: country_code, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
            ]
        }
    };
};

// Skills Value Help
annotate CandidateService.CandidateSkills with {
    skill @Common: {
        Text: skill.name,
        TextArrangement: #TextOnly,
        ValueList: {
            CollectionPath: 'Skills',
            Parameters: [
                { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: skill_ID, ValueListProperty: 'ID' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'category.name' }
            ]
        }
    };
};

// ============================================
// FIELD CONTROLS & SEMANTIC ANNOTATIONS
// ============================================

annotate CandidateService.Candidates with {
    // Computed fields - read only
    fullName @Core.Computed;
    overallScore @Core.Computed;

    // Immutable fields - can't change after creation
    createdAt @Core.Immutable;
    createdBy @Core.Immutable;

    // Semantic annotations
    email @Communication.IsEmailAddress;
    phone @Communication.IsPhoneNumber;
    linkedInUrl @Common.IsUrl;

    // Field labels
    firstName @Common.Label: '{i18n>FirstName}';
    lastName @Common.Label: '{i18n>LastName}';
    email @Common.Label: '{i18n>Email}';
    phone @Common.Label: '{i18n>Phone}';
    headline @Common.Label: '{i18n>Headline}';
    summary @Common.Label: '{i18n>Summary}';
    city @Common.Label: '{i18n>City}';
    totalExperienceYears @Common.Label: '{i18n>YearsExperience}';
    source @Common.Label: '{i18n>Source}';
};

// ============================================
// INTERVIEWS
// ============================================
annotate CandidateService.Interviews with @(
    UI: {
        HeaderInfo: {
            TypeName: '{i18n>Interview}',
            TypeNamePlural: '{i18n>Interviews}',
            Title: { Value: title },
            Description: { Value: interviewType.name }
        },
        LineItem: [
            { Value: title, Label: '{i18n>InterviewTitle}', ![@UI.Importance]: #High },
            { Value: interviewType.name, Label: '{i18n>InterviewType}', ![@UI.Importance]: #High },
            { Value: scheduledAt, Label: '{i18n>ScheduledAt}', ![@UI.Importance]: #High },
            { Value: status.name, Label: '{i18n>Status}', ![@UI.Importance]: #High },
            { Value: interviewer, Label: '{i18n>Interviewer}' },
            { Value: overallRating, Label: '{i18n>OverallRating}' }
        ],
        Identification: [
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.confirm',
                Label: '{i18n>Confirm}',
                ![@UI.Importance]: #High
            },
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.complete',
                Label: '{i18n>Complete}',
                ![@UI.Importance]: #High
            },
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.cancel',
                Label: '{i18n>Cancel}',
                ![@UI.Importance]: #Medium
            },
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.reschedule',
                Label: '{i18n>Reschedule}',
                ![@UI.Importance]: #Medium
            },
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.submitFeedback',
                Label: '{i18n>SubmitFeedback}',
                ![@UI.Importance]: #High
            },
            {
                $Type: 'UI.DataFieldForAction',
                Action: 'CandidateService.recordNoShow',
                Label: '{i18n>RecordNoShow}',
                ![@UI.Importance]: #Low
            }
        ],
        Facets: [
            {
                $Type: 'UI.CollectionFacet',
                ID: 'InterviewBasics',
                Label: '{i18n>BasicInfo}',
                Facets: [
                    {
                        $Type: 'UI.ReferenceFacet',
                        ID: 'InterviewDetails',
                        Label: '{i18n>InterviewDetails}',
                        Target: '@UI.FieldGroup#InterviewDetails'
                    },
                    {
                        $Type: 'UI.ReferenceFacet',
                        ID: 'ScheduleInfo',
                        Label: '{i18n>Schedule}',
                        Target: '@UI.FieldGroup#Schedule'
                    }
                ]
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'Ratings',
                Label: '{i18n>Ratings}',
                Target: '@UI.FieldGroup#Ratings'
            },
            {
                $Type: 'UI.ReferenceFacet',
                ID: 'FeedbackSection',
                Label: '{i18n>Feedback}',
                Target: '@UI.FieldGroup#Feedback'
            }
        ],
        FieldGroup#InterviewDetails: {
            Data: [
                { Value: title, Label: '{i18n>InterviewTitle}' },
                { Value: interviewType.name, Label: '{i18n>InterviewType}' },
                { Value: status.name, Label: '{i18n>Status}' },
                { Value: interviewer, Label: '{i18n>Interviewer}' },
                { Value: interviewerEmail, Label: '{i18n>InterviewerEmail}' }
            ]
        },
        FieldGroup#Schedule: {
            Data: [
                { Value: scheduledAt, Label: '{i18n>ScheduledAt}' },
                { Value: duration, Label: '{i18n>Duration}' },
                { Value: timezone, Label: '{i18n>Timezone}' },
                { Value: location, Label: '{i18n>Location}' },
                { Value: meetingLink, Label: '{i18n>MeetingLink}' }
            ]
        },
        FieldGroup#Ratings: {
            Data: [
                { Value: overallRating, Label: '{i18n>OverallRating}' },
                { Value: technicalRating, Label: '{i18n>TechnicalRating}' },
                { Value: communicationRating, Label: '{i18n>CommunicationRating}' },
                { Value: cultureFitRating, Label: '{i18n>CultureFitRating}' }
            ]
        },
        FieldGroup#Feedback: {
            Data: [
                { Value: feedback, Label: '{i18n>Feedback}' },
                { Value: strengths, Label: '{i18n>Strengths}' },
                { Value: areasOfImprovement, Label: '{i18n>AreasOfImprovement}' },
                { Value: recommendation, Label: '{i18n>Recommendation}' },
                { Value: nextSteps, Label: '{i18n>NextSteps}' }
            ]
        }
    }
);

// Interview Value Helps
annotate CandidateService.Interviews with {
    interviewType @Common: {
        Text: interviewType.name,
        TextArrangement: #TextOnly,
        ValueList: {
            CollectionPath: 'InterviewTypes',
            Parameters: [
                { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: interviewType_code, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
            ]
        }
    };
    status @Common: {
        Text: status.name,
        TextArrangement: #TextOnly,
        ValueList: {
            CollectionPath: 'InterviewStatuses',
            Parameters: [
                { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status_code, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
            ]
        }
    };
    // Semantic annotations
    interviewerEmail @Communication.IsEmailAddress;
    meetingLink @Common.IsUrl;
};

// ============================================
// CANDIDATE OBJECT PAGE FACETS
// ============================================
annotate CandidateService.Candidates with @(
    UI.Facets: [
        // General Information Section
        {
            $Type: 'UI.CollectionFacet',
            ID: 'GeneralSection',
            Label: '{i18n>GeneralInformation}',
            Facets: [
                {
                    $Type: 'UI.ReferenceFacet',
                    ID: 'PersonalInfo',
                    Label: '{i18n>PersonalDetails}',
                    Target: '@UI.FieldGroup#PersonalInfo'
                },
                {
                    $Type: 'UI.ReferenceFacet',
                    ID: 'LocationInfo',
                    Label: '{i18n>Location}',
                    Target: '@UI.FieldGroup#Location'
                }
            ]
        },
        // Professional Section
        {
            $Type: 'UI.CollectionFacet',
            ID: 'ProfessionalSection',
            Label: '{i18n>Professional}',
            Facets: [
                {
                    $Type: 'UI.ReferenceFacet',
                    ID: 'ProfessionalInfo',
                    Label: '{i18n>ProfessionalDetails}',
                    Target: '@UI.FieldGroup#Professional'
                },
                {
                    $Type: 'UI.ReferenceFacet',
                    ID: 'SummaryInfo',
                    Label: '{i18n>Summary}',
                    Target: '@UI.FieldGroup#Summary'
                }
            ]
        },
        // Experience Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Experience',
            Label: '{i18n>WorkExperience}',
            Target: 'experiences/@UI.LineItem'
        },
        // Education Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Education',
            Label: '{i18n>Education}',
            Target: 'educations/@UI.LineItem'
        },
        // Skills Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Skills',
            Label: '{i18n>Skills}',
            Target: 'skills/@UI.LineItem'
        },
        // Languages Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Languages',
            Label: '{i18n>Languages}',
            Target: 'languages/@UI.LineItem'
        },
        // Certifications Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Certifications',
            Label: '{i18n>Certifications}',
            Target: 'certifications/@UI.LineItem'
        },
        // Interviews Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Interviews',
            Label: '{i18n>Interviews}',
            Target: 'interviews/@UI.LineItem'
        },
        // Documents Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Documents',
            Label: '{i18n>Documents}',
            Target: 'documents/@UI.LineItem'
        },
        // Notes Section
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'Notes',
            Label: '{i18n>Notes}',
            Target: 'notes/@UI.LineItem'
        }
    ]
);
