/**
 * Database Helper for Tests
 * Provides utilities for setting up and cleaning up test data
 */
'use strict';

const cds = require('@sap/cds');

class DatabaseHelper {
    constructor() {
        this.db = null;
        this.entities = null;
    }

    /**
     * Initialize database connection and entities
     */
    async init() {
        this.db = cds.db;
        if (!this.db) {
            throw new Error('Database not initialized. Make sure cds.test() is called at module level.');
        }

        // Load all entities
        this.entities = cds.entities('cv.sorting');
    }

    /**
     * Clean up all tables (for test isolation)
     * Deletes data in the correct order to respect foreign key constraints
     */
    async cleanup() {
        const {
            MatchResults, CandidateSkills, CandidateLanguages,
            Certifications, Educations, WorkExperiences,
            CandidateNotes, CVDocuments, Interviews,
            JobRequiredSkills, JobPostings, Candidates,
            Skills, SkillCategories, AuditLogs,
            ScoringRules, ScoringRuleTemplates
        } = this.entities;

        // Delete in order of dependencies (children first)
        await cds.run(DELETE.from(MatchResults));
        await cds.run(DELETE.from(Interviews));
        await cds.run(DELETE.from(CandidateSkills));
        await cds.run(DELETE.from(CandidateLanguages));
        await cds.run(DELETE.from(Certifications));
        await cds.run(DELETE.from(Educations));
        await cds.run(DELETE.from(WorkExperiences));
        await cds.run(DELETE.from(CandidateNotes));
        await cds.run(DELETE.from(CVDocuments));
        await cds.run(DELETE.from(JobRequiredSkills));
        await cds.run(DELETE.from(JobPostings));
        await cds.run(DELETE.from(Candidates));
        await cds.run(DELETE.from(ScoringRules));
        await cds.run(DELETE.from(ScoringRuleTemplates));
        await cds.run(DELETE.from(Skills));
        await cds.run(DELETE.from(SkillCategories));
        await cds.run(DELETE.from(AuditLogs));
    }

    /**
     * Insert a candidate into the database
     * @param {Object} candidateData - Candidate data
     * @returns {Object} The inserted candidate with ID
     */
    async createCandidate(candidateData) {
        const { Candidates } = this.entities;
        const candidate = {
            ID: this._generateId(),
            firstName: 'Test',
            lastName: 'Candidate',
            email: `test.${Date.now()}@example.com`,
            status_code: 'new',
            ...candidateData
        };

        await cds.run(INSERT.into(Candidates).entries(candidate));
        return candidate;
    }

    /**
     * Insert a job posting into the database
     * @param {Object} jobData - Job posting data
     * @returns {Object} The inserted job posting with ID
     */
    async createJobPosting(jobData) {
        const { JobPostings } = this.entities;
        const job = {
            ID: this._generateId(),
            title: 'Test Job',
            status: 'open',
            ...jobData
        };

        await cds.run(INSERT.into(JobPostings).entries(job));
        return job;
    }

    /**
     * Insert a skill into the database
     * @param {Object} skillData - Skill data
     * @returns {Object} The inserted skill with ID
     */
    async createSkill(skillData) {
        const { Skills } = this.entities;
        const skill = {
            ID: this._generateId(),
            name: `Skill_${Date.now()}`,
            normalizedName: `skill_${Date.now()}`,
            ...skillData
        };

        await cds.run(INSERT.into(Skills).entries(skill));
        return skill;
    }

    /**
     * Link a skill to a candidate
     * @param {string} candidateId - Candidate ID
     * @param {string} skillId - Skill ID
     * @param {Object} additional - Additional properties
     * @returns {Object} The created link
     */
    async linkSkillToCandidate(candidateId, skillId, additional = {}) {
        const { CandidateSkills } = this.entities;
        const link = {
            ID: this._generateId(),
            candidate_ID: candidateId,
            skill_ID: skillId,
            proficiencyLevel: 'intermediate',
            yearsOfExperience: 2,
            ...additional
        };

        await cds.run(INSERT.into(CandidateSkills).entries(link));
        return link;
    }

    /**
     * Link a required skill to a job posting
     * @param {string} jobId - Job posting ID
     * @param {string} skillId - Skill ID
     * @param {Object} additional - Additional properties
     * @returns {Object} The created link
     */
    async linkSkillToJob(jobId, skillId, additional = {}) {
        const { JobRequiredSkills } = this.entities;
        const link = {
            ID: this._generateId(),
            jobPosting_ID: jobId,
            skill_ID: skillId,
            isRequired: true,
            proficiencyLevel: 'intermediate',
            ...additional
        };

        await cds.run(INSERT.into(JobRequiredSkills).entries(link));
        return link;
    }

    /**
     * Create a match result between a candidate and job
     * @param {string} candidateId - Candidate ID
     * @param {string} jobId - Job posting ID
     * @param {Object} additional - Additional properties
     * @returns {Object} The created match result
     */
    async createMatchResult(candidateId, jobId, additional = {}) {
        const { MatchResults } = this.entities;
        const match = {
            ID: this._generateId(),
            candidate_ID: candidateId,
            jobPosting_ID: jobId,
            overallScore: 75.5,
            reviewStatus: 'pending',
            ...additional
        };

        await cds.run(INSERT.into(MatchResults).entries(match));
        return match;
    }

    /**
     * Get all candidates
     * @returns {Array} List of candidates
     */
    async getAllCandidates() {
        const { Candidates } = this.entities;
        return await cds.run(SELECT.from(Candidates));
    }

    /**
     * Get all job postings
     * @returns {Array} List of job postings
     */
    async getAllJobPostings() {
        const { JobPostings } = this.entities;
        return await cds.run(SELECT.from(JobPostings));
    }

    /**
     * Get candidate by ID with related data
     * @param {string} candidateId - Candidate ID
     * @returns {Object} Candidate with skills, work experiences, etc.
     */
    async getCandidateWithDetails(candidateId) {
        const { Candidates, CandidateSkills, WorkExperiences } = this.entities;

        const candidate = await cds.run(
            SELECT.one.from(Candidates).where({ ID: candidateId })
        );

        if (!candidate) return null;

        candidate.skills = await cds.run(
            SELECT.from(CandidateSkills).where({ candidate_ID: candidateId })
        );

        candidate.workExperiences = await cds.run(
            SELECT.from(WorkExperiences).where({ candidate_ID: candidateId })
        );

        return candidate;
    }

    /**
     * Count records in a table
     * @param {string} entityName - Name of the entity (e.g., 'Candidates')
     * @returns {number} Record count
     */
    async count(entityName) {
        const entity = this.entities[entityName];
        if (!entity) {
            throw new Error(`Entity ${entityName} not found`);
        }

        const result = await cds.run(SELECT.from(entity).columns('count(*) as count'));
        return result[0]?.count || 0;
    }

    /**
     * Execute raw SQL query (for advanced scenarios)
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Array} Query results
     */
    async rawQuery(sql, params = []) {
        return await this.db.run(sql, params);
    }

    /**
     * Generate a UUID for test data
     * @returns {string} UUID
     */
    _generateId() {
        // Simple UUID v4 generator for tests
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Seed database with minimal test data
     * Useful for tests that need some baseline data
     */
    async seedMinimalData() {
        // Create skill categories
        const { SkillCategories, Skills } = this.entities;

        const techCategory = {
            code: 'TECH',
            name: 'Technical Skills'
        };

        const softCategory = {
            code: 'SOFT',
            name: 'Soft Skills'
        };

        await cds.run(INSERT.into(SkillCategories).entries([techCategory, softCategory]));

        // Create some basic skills
        const skills = [
            { ID: this._generateId(), name: 'JavaScript', normalizedName: 'javascript', category_code: 'TECH' },
            { ID: this._generateId(), name: 'Python', normalizedName: 'python', category_code: 'TECH' },
            { ID: this._generateId(), name: 'Communication', normalizedName: 'communication', category_code: 'SOFT' },
            { ID: this._generateId(), name: 'Leadership', normalizedName: 'leadership', category_code: 'SOFT' }
        ];

        await cds.run(INSERT.into(Skills).entries(skills));

        return { skills, categories: [techCategory, softCategory] };
    }
}

module.exports = DatabaseHelper;
