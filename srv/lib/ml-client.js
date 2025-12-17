/**
 * ML Service HTTP Client
 * Handles communication with the Python ML microservice
 */

const cds = require('@sap/cds');
const LOG = cds.log('ml-client');

class MLClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl || process.env.ML_SERVICE_URL || 'http://localhost:8000';
        this.timeout = parseInt(process.env.ML_SERVICE_TIMEOUT) || 300000; // 5 minutes for PDF OCR
    }

    /**
     * Make HTTP request to ML service
     */
    async request(path, method = 'GET', body = null) {
        const url = `${this.baseUrl}${path}`;

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        LOG.info(`ML Service request: ${method} ${url}`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`ML Service error (${response.status}): ${errorBody}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`ML Service timeout after ${this.timeout}ms`);
            }
            LOG.error(`ML Service request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate embedding for entity
     */
    async generateEmbedding({ entityType, entityId, textContent, skillsText, experienceText, requirementsText }) {
        return this.request('/api/embeddings/generate', 'POST', {
            entity_type: entityType,
            entity_id: entityId,
            text_content: textContent,
            skills_text: skillsText,
            experience_text: experienceText,
            requirements_text: requirementsText,
            store: true
        });
    }

    /**
     * Bulk generate embeddings
     */
    async bulkGenerateEmbeddings({ entityType, entities }) {
        return this.request('/api/embeddings/bulk-generate', 'POST', {
            entity_type: entityType,
            entities
        });
    }

    /**
     * Find semantic matches for job
     */
    async findSemanticMatches({ jobPostingId, minScore, limit, includeBreakdown, excludeDisqualified }) {
        return this.request('/api/matching/semantic', 'POST', {
            job_posting_id: jobPostingId,
            min_score: minScore,
            limit,
            include_breakdown: includeBreakdown,
            exclude_disqualified: excludeDisqualified
        });
    }

    /**
     * Calculate single match
     */
    async calculateSingleMatch({ candidateId, jobPostingId }) {
        return this.request('/api/matching/single', 'POST', {
            candidate_id: candidateId,
            job_posting_id: jobPostingId
        });
    }

    /**
     * Semantic search by query text
     */
    async semanticSearch({ query, candidateId, limit, minSimilarity }) {
        // If candidateId is provided, search for similar candidates
        if (candidateId) {
            return this.request('/api/matching/similar-candidates', 'POST', {
                candidate_id: candidateId,
                limit,
                min_similarity: minSimilarity
            });
        }
        // Otherwise search by query text
        return this.request('/api/matching/search', 'POST', {
            query,
            limit,
            min_similarity: minSimilarity
        });
    }

    /**
     * Process document with OCR
     */
    async processOCR({ fileContent, fileType, language, extractStructured }) {
        return this.request('/api/ocr/process', 'POST', {
            file_content: fileContent,
            file_type: fileType,
            language,
            extract_structured: extractStructured
        });
    }

    /**
     * Process document with OCR and structured extraction
     */
    async processOCRWithStructured({ fileContent, fileType, language }) {
        return this.request('/api/ocr/process', 'POST', {
            file_content: fileContent,
            file_type: fileType,
            language: language || 'en',
            extract_structured: true
        });
    }

    /**
     * Get scoring criteria
     */
    async getScoringCriteria(jobPostingId) {
        return this.request(`/api/scoring/criteria/${jobPostingId}`);
    }

    /**
     * Set scoring criteria
     */
    async setScoringCriteria({ jobPostingId, criteria, replaceExisting }) {
        return this.request('/api/scoring/criteria', 'POST', {
            job_posting_id: jobPostingId,
            criteria,
            replace_existing: replaceExisting
        });
    }

    /**
     * Add single criterion
     */
    async addCriterion({ jobPostingId, criteriaType, criteriaValue, points, isRequired, weight }) {
        return this.request(`/api/scoring/criteria/${jobPostingId}/add`, 'POST', {
            criteria_type: criteriaType,
            criteria_value: criteriaValue,
            points,
            is_required: isRequired,
            weight
        });
    }

    /**
     * Delete criterion
     */
    async deleteCriterion(jobPostingId, criterionId) {
        return this.request(`/api/scoring/criteria/${jobPostingId}/${criterionId}`, 'DELETE');
    }

    /**
     * Calculate criteria score
     */
    async calculateCriteriaScore({ jobPostingId, candidateData }) {
        return this.request('/api/scoring/calculate', 'POST', {
            job_posting_id: jobPostingId,
            candidate_data: candidateData
        });
    }

    /**
     * Get criteria templates
     */
    async getCriteriaTemplates() {
        return this.request('/api/scoring/templates');
    }

    /**
     * Health check
     */
    async getHealth() {
        return this.request('/health/ready');
    }

    /**
     * Basic health check
     */
    async ping() {
        return this.request('/health/live');
    }
}

/**
 * Create ML client instance
 */
function createMLClient(baseUrl) {
    return new MLClient(baseUrl);
}

module.exports = {
    MLClient,
    createMLClient
};
