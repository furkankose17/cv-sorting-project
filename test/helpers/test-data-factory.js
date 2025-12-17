/**
 * Test Data Factory
 * Provides factory methods for creating realistic test data
 */
'use strict';

class TestDataFactory {
    constructor() {
        this.counter = 0;
    }

    /**
     * Generate a unique ID
     * @returns {string} UUID
     */
    generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Generate a unique email address
     * @param {string} prefix - Email prefix
     * @returns {string} Email address
     */
    generateEmail(prefix = 'test') {
        this.counter++;
        return `${prefix}.${Date.now()}.${this.counter}@example.com`;
    }

    /**
     * Create candidate data
     * @param {Object} overrides - Properties to override
     * @returns {Object} Candidate data
     */
    createCandidate(overrides = {}) {
        this.counter++;
        return {
            ID: this.generateId(),
            firstName: `TestFirst${this.counter}`,
            lastName: `TestLast${this.counter}`,
            email: this.generateEmail(`candidate${this.counter}`),
            phone: `+1-555-${String(this.counter).padStart(4, '0')}`,
            city: 'TestCity',
            country_code: 'USA',
            status_code: 'new',
            totalExperienceYears: 5,
            willingToRelocate: false,
            ...overrides
        };
    }

    /**
     * Create job posting data
     * @param {Object} overrides - Properties to override
     * @returns {Object} Job posting data
     */
    createJobPosting(overrides = {}) {
        this.counter++;
        return {
            ID: this.generateId(),
            title: `Test Job Position ${this.counter}`,
            description: 'A test job posting for automated testing',
            status: 'open',
            department: 'Engineering',
            location: 'TestCity',
            employmentType: 'full-time',
            experienceLevel: 'mid',
            minYearsExperience: 3,
            maxYearsExperience: 7,
            ...overrides
        };
    }

    /**
     * Create skill data
     * @param {Object} overrides - Properties to override
     * @returns {Object} Skill data
     */
    createSkill(overrides = {}) {
        this.counter++;
        const name = `TestSkill${this.counter}`;
        return {
            ID: this.generateId(),
            name,
            normalizedName: name.toLowerCase(),
            category_code: 'TECH',
            ...overrides
        };
    }

    /**
     * Create candidate skill link data
     * @param {string} candidateId - Candidate ID
     * @param {string} skillId - Skill ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} Candidate skill link data
     */
    createCandidateSkill(candidateId, skillId, overrides = {}) {
        return {
            ID: this.generateId(),
            candidate_ID: candidateId,
            skill_ID: skillId,
            proficiencyLevel: 'intermediate',
            yearsOfExperience: 3,
            isVerified: false,
            ...overrides
        };
    }

    /**
     * Create job required skill link data
     * @param {string} jobId - Job posting ID
     * @param {string} skillId - Skill ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} Job required skill link data
     */
    createJobRequiredSkill(jobId, skillId, overrides = {}) {
        return {
            ID: this.generateId(),
            jobPosting_ID: jobId,
            skill_ID: skillId,
            proficiencyLevel: 'intermediate',
            isRequired: true,
            weight: 1.0,
            ...overrides
        };
    }

    /**
     * Create work experience data
     * @param {string} candidateId - Candidate ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} Work experience data
     */
    createWorkExperience(candidateId, overrides = {}) {
        this.counter++;
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 3);

        return {
            ID: this.generateId(),
            candidate_ID: candidateId,
            title: `Test Position ${this.counter}`,
            company: `Test Company ${this.counter}`,
            startDate: startDate.toISOString().split('T')[0],
            endDate: null,  // Current position
            description: 'Test work experience description',
            isCurrent: true,
            ...overrides
        };
    }

    /**
     * Create education data
     * @param {string} candidateId - Candidate ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} Education data
     */
    createEducation(candidateId, overrides = {}) {
        this.counter++;
        return {
            ID: this.generateId(),
            candidate_ID: candidateId,
            institution: `Test University ${this.counter}`,
            degree: 'Bachelor of Science',
            fieldOfStudy: 'Computer Science',
            degreeLevel_code: 'bachelor',
            graduationYear: 2018,
            ...overrides
        };
    }

    /**
     * Create certification data
     * @param {string} candidateId - Candidate ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} Certification data
     */
    createCertification(candidateId, overrides = {}) {
        this.counter++;
        const issueDate = new Date();
        issueDate.setFullYear(issueDate.getFullYear() - 1);

        return {
            ID: this.generateId(),
            candidate_ID: candidateId,
            name: `Test Certification ${this.counter}`,
            issuingOrganization: 'Test Org',
            issueDate: issueDate.toISOString().split('T')[0],
            expirationDate: null,
            credentialId: `CERT-${this.counter}`,
            ...overrides
        };
    }

    /**
     * Create match result data
     * @param {string} candidateId - Candidate ID
     * @param {string} jobId - Job posting ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} Match result data
     */
    createMatchResult(candidateId, jobId, overrides = {}) {
        return {
            ID: this.generateId(),
            candidate_ID: candidateId,
            jobPosting_ID: jobId,
            overallScore: 75.0,
            skillMatchScore: 80.0,
            experienceScore: 70.0,
            educationScore: 75.0,
            reviewStatus: 'pending',
            matchedAt: new Date().toISOString(),
            ...overrides
        };
    }

    /**
     * Create interview data
     * @param {string} candidateId - Candidate ID
     * @param {string} jobId - Job posting ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} Interview data
     */
    createInterview(candidateId, jobId, overrides = {}) {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + 7);  // 7 days from now

        return {
            ID: this.generateId(),
            candidate_ID: candidateId,
            jobPosting_ID: jobId,
            type_code: 'technical',
            status_code: 'scheduled',
            scheduledAt: scheduledDate.toISOString(),
            durationMinutes: 60,
            ...overrides
        };
    }

    /**
     * Create CV document data
     * @param {string} candidateId - Candidate ID
     * @param {Object} overrides - Properties to override
     * @returns {Object} CV document data
     */
    createCVDocument(candidateId, overrides = {}) {
        this.counter++;
        return {
            ID: this.generateId(),
            candidate_ID: candidateId,
            fileName: `test-cv-${this.counter}.pdf`,
            mimeType: 'application/pdf',
            fileSize: 102400,  // 100KB
            processingStatus: 'pending',
            isLatest: true,
            ...overrides
        };
    }

    /**
     * Create a complete candidate profile with related data
     * @param {Object} options - Configuration options
     * @returns {Object} Complete candidate profile
     */
    createCompleteCandidate(options = {}) {
        const {
            skillCount = 3,
            workExperienceCount = 2,
            educationCount = 1,
            certificationCount = 1
        } = options;

        const candidate = this.createCandidate(options.candidate);

        const skills = [];
        for (let i = 0; i < skillCount; i++) {
            const skill = this.createSkill();
            const candidateSkill = this.createCandidateSkill(candidate.ID, skill.ID);
            skills.push({ skill, link: candidateSkill });
        }

        const workExperiences = [];
        for (let i = 0; i < workExperienceCount; i++) {
            workExperiences.push(this.createWorkExperience(candidate.ID));
        }

        const educations = [];
        for (let i = 0; i < educationCount; i++) {
            educations.push(this.createEducation(candidate.ID));
        }

        const certifications = [];
        for (let i = 0; i < certificationCount; i++) {
            certifications.push(this.createCertification(candidate.ID));
        }

        return {
            candidate,
            skills,
            workExperiences,
            educations,
            certifications
        };
    }

    /**
     * Create a complete job posting with required skills
     * @param {Object} options - Configuration options
     * @returns {Object} Complete job posting
     */
    createCompleteJobPosting(options = {}) {
        const { skillCount = 4 } = options;

        const job = this.createJobPosting(options.job);

        const skills = [];
        for (let i = 0; i < skillCount; i++) {
            const skill = this.createSkill();
            const jobSkill = this.createJobRequiredSkill(job.ID, skill.ID, {
                isRequired: i < 2  // First 2 are required, rest are nice-to-have
            });
            skills.push({ skill, link: jobSkill });
        }

        return {
            job,
            skills
        };
    }

    /**
     * Create bulk test candidates
     * @param {number} count - Number of candidates to create
     * @param {Object} overrides - Properties to override
     * @returns {Array} Array of candidate data
     */
    createBulkCandidates(count, overrides = {}) {
        const candidates = [];
        for (let i = 0; i < count; i++) {
            candidates.push(this.createCandidate(overrides));
        }
        return candidates;
    }

    /**
     * Create bulk test job postings
     * @param {number} count - Number of jobs to create
     * @param {Object} overrides - Properties to override
     * @returns {Array} Array of job posting data
     */
    createBulkJobPostings(count, overrides = {}) {
        const jobs = [];
        for (let i = 0; i < count; i++) {
            jobs.push(this.createJobPosting(overrides));
        }
        return jobs;
    }

    /**
     * Reset counter (useful between tests)
     */
    reset() {
        this.counter = 0;
    }
}

module.exports = TestDataFactory;
