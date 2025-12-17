/**
 * Mock ML Client for Testing
 * Simulates ML service responses without requiring actual ML service
 */
'use strict';

class MockMLClient {
    constructor(options = {}) {
        this.options = {
            simulateDelay: false,
            delayMs: 100,
            failureRate: 0,  // 0 = never fail, 1 = always fail
            ...options
        };

        this.callHistory = [];
    }

    /**
     * Mock text extraction from document
     * @param {Buffer|string} documentContent - Document content
     * @param {Object} options - Extraction options
     * @returns {Promise<Object>} Extracted text and metadata
     */
    async extractText(documentContent, options = {}) {
        this._recordCall('extractText', { documentContent, options });
        await this._simulateDelay();
        this._maybeThrowError();

        return {
            text: this._generateMockCVText(),
            confidence: 0.95,
            pageCount: 2,
            language: 'en',
            metadata: {
                extractedAt: new Date().toISOString(),
                method: 'mock'
            }
        };
    }

    /**
     * Mock skill extraction from text
     * @param {string} text - Text to extract skills from
     * @returns {Promise<Array>} Extracted skills
     */
    async extractSkills(text) {
        this._recordCall('extractSkills', { text });
        await this._simulateDelay();
        this._maybeThrowError();

        return [
            { name: 'JavaScript', confidence: 0.95, category: 'TECH' },
            { name: 'Python', confidence: 0.92, category: 'TECH' },
            { name: 'React', confidence: 0.88, category: 'TECH' },
            { name: 'Node.js', confidence: 0.85, category: 'TECH' },
            { name: 'Leadership', confidence: 0.80, category: 'SOFT' }
        ];
    }

    /**
     * Mock entity extraction (name, email, phone, etc.)
     * @param {string} text - Text to extract entities from
     * @returns {Promise<Object>} Extracted entities
     */
    async extractEntities(text) {
        this._recordCall('extractEntities', { text });
        await this._simulateDelay();
        this._maybeThrowError();

        return {
            name: { firstName: 'John', lastName: 'Doe', confidence: 0.90 },
            email: { value: 'john.doe@example.com', confidence: 0.95 },
            phone: { value: '+1-555-0123', confidence: 0.85 },
            location: { city: 'San Francisco', country: 'USA', confidence: 0.80 },
            links: {
                linkedin: 'https://linkedin.com/in/johndoe',
                github: 'https://github.com/johndoe'
            }
        };
    }

    /**
     * Mock embedding generation
     * @param {string} text - Text to generate embedding for
     * @returns {Promise<Array>} Embedding vector
     */
    async generateEmbedding(text) {
        this._recordCall('generateEmbedding', { text });
        await this._simulateDelay();
        this._maybeThrowError();

        // Generate a mock 384-dimensional embedding (matching intfloat/multilingual-e5-small)
        const embedding = [];
        for (let i = 0; i < 384; i++) {
            // Generate pseudo-random but deterministic values based on text
            const seed = text ? text.charCodeAt(i % text.length) : i;
            embedding.push((Math.sin(seed * i) + 1) / 2);  // Values between 0 and 1
        }

        return {
            embedding,
            dimensions: 384,
            model: 'mock-multilingual-e5-small'
        };
    }

    /**
     * Mock semantic similarity calculation
     * @param {Array} embedding1 - First embedding vector
     * @param {Array} embedding2 - Second embedding vector
     * @returns {Promise<number>} Similarity score (0-1)
     */
    async calculateSimilarity(embedding1, embedding2) {
        this._recordCall('calculateSimilarity', { embedding1, embedding2 });
        await this._simulateDelay();
        this._maybeThrowError();

        // Mock cosine similarity
        // In reality, we'd calculate actual cosine similarity
        // For testing, return a random but realistic value
        return 0.65 + Math.random() * 0.25;  // Between 0.65 and 0.90
    }

    /**
     * Mock candidate-job matching
     * @param {Object} candidate - Candidate data
     * @param {Object} job - Job posting data
     * @returns {Promise<Object>} Match result
     */
    async matchCandidateToJob(candidate, job) {
        this._recordCall('matchCandidateToJob', { candidate, job });
        await this._simulateDelay();
        this._maybeThrowError();

        return {
            overallScore: 75.5,
            skillMatchScore: 80.0,
            experienceScore: 70.0,
            educationScore: 75.0,
            semanticScore: 0.78,
            confidence: 0.85,
            explanation: {
                strengths: ['Strong technical skills', 'Relevant experience'],
                weaknesses: ['Missing some nice-to-have skills'],
                recommendations: ['Consider for technical interview']
            }
        };
    }

    /**
     * Mock skill gap analysis
     * @param {Object} candidate - Candidate data
     * @param {Object} job - Job posting data
     * @returns {Promise<Object>} Skill gap analysis
     */
    async analyzeSkillGaps(candidate, job) {
        this._recordCall('analyzeSkillGaps', { candidate, job });
        await this._simulateDelay();
        this._maybeThrowError();

        return {
            missingCriticalSkills: [
                { name: 'Kubernetes', priority: 'high', confidence: 0.90 }
            ],
            missingNiceToHaveSkills: [
                { name: 'Docker', priority: 'medium', confidence: 0.85 },
                { name: 'AWS', priority: 'low', confidence: 0.80 }
            ],
            matchingSkills: [
                { name: 'JavaScript', proficiency: 'advanced', confidence: 0.95 },
                { name: 'Python', proficiency: 'intermediate', confidence: 0.88 }
            ],
            overallGapScore: 0.72  // 0 = large gap, 1 = no gap
        };
    }

    /**
     * Mock CV quality assessment
     * @param {string} cvText - CV text
     * @returns {Promise<Object>} Quality assessment
     */
    async assessCVQuality(cvText) {
        this._recordCall('assessCVQuality', { cvText });
        await this._simulateDelay();
        this._maybeThrowError();

        return {
            overallScore: 8.5,  // Out of 10
            completeness: 0.90,
            clarity: 0.85,
            formatting: 0.88,
            recommendations: [
                'Add more quantifiable achievements',
                'Include technical certifications'
            ],
            strengths: [
                'Clear work experience section',
                'Well-organized skills section'
            ],
            improvements: [
                'Add project descriptions',
                'Include education details'
            ]
        };
    }

    /**
     * Get all recorded calls (for testing/verification)
     * @returns {Array} Call history
     */
    getCallHistory() {
        return this.callHistory;
    }

    /**
     * Clear call history
     */
    clearCallHistory() {
        this.callHistory = [];
    }

    /**
     * Get count of specific method calls
     * @param {string} methodName - Method name to count
     * @returns {number} Call count
     */
    getCallCount(methodName) {
        return this.callHistory.filter(call => call.method === methodName).length;
    }

    /**
     * Verify that a method was called with specific arguments
     * @param {string} methodName - Method name
     * @param {Object} expectedArgs - Expected arguments
     * @returns {boolean} True if call was found
     */
    wasCalledWith(methodName, expectedArgs) {
        return this.callHistory.some(call => {
            if (call.method !== methodName) return false;

            // Check if all expected args match
            return Object.keys(expectedArgs).every(key => {
                return JSON.stringify(call.args[key]) === JSON.stringify(expectedArgs[key]);
            });
        });
    }

    /**
     * Set failure rate for testing error handling
     * @param {number} rate - Failure rate (0-1)
     */
    setFailureRate(rate) {
        this.options.failureRate = Math.max(0, Math.min(1, rate));
    }

    /**
     * Configure delay simulation
     * @param {boolean} enabled - Enable delay simulation
     * @param {number} ms - Delay in milliseconds
     */
    setDelay(enabled, ms = 100) {
        this.options.simulateDelay = enabled;
        this.options.delayMs = ms;
    }

    /**
     * Reset mock to initial state
     */
    reset() {
        this.callHistory = [];
        this.options.failureRate = 0;
        this.options.simulateDelay = false;
    }

    // Private helper methods

    _recordCall(method, args) {
        this.callHistory.push({
            method,
            args,
            timestamp: new Date().toISOString()
        });
    }

    async _simulateDelay() {
        if (this.options.simulateDelay) {
            await new Promise(resolve => setTimeout(resolve, this.options.delayMs));
        }
    }

    _maybeThrowError() {
        if (Math.random() < this.options.failureRate) {
            throw new Error('Mock ML service error (simulated failure)');
        }
    }

    _generateMockCVText() {
        return `
JOHN DOE
Email: john.doe@example.com
Phone: +1-555-0123
LinkedIn: linkedin.com/in/johndoe

PROFESSIONAL SUMMARY
Experienced software engineer with 5+ years of experience in full-stack development.

WORK EXPERIENCE
Senior Software Engineer | Tech Corp | 2020 - Present
- Led development of microservices architecture
- Implemented CI/CD pipelines
- Mentored junior developers

Software Engineer | StartupXYZ | 2018 - 2020
- Developed React-based frontend applications
- Built RESTful APIs with Node.js
- Worked with PostgreSQL and MongoDB

EDUCATION
Bachelor of Science in Computer Science
University of Technology | 2018

SKILLS
Technical: JavaScript, Python, React, Node.js, Docker, Kubernetes
Soft Skills: Leadership, Communication, Problem Solving

CERTIFICATIONS
AWS Certified Developer - Associate | 2021
        `.trim();
    }
}

module.exports = MockMLClient;
