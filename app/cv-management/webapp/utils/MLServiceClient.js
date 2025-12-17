sap.ui.define([], function () {
    "use strict";

    /**
     * ML Service Client
     * Provides methods to call the ML service with automatic fallback to OData
     */
    return {

        /**
         * Base URL for ML service
         * In production: /ml-api/api (via BTP destination)
         * In development: http://localhost:8000/api (direct connection)
         */
        _baseURL: window.location.hostname === "localhost" ? "http://localhost:8000/api" : "/ml-api/api",

        /**
         * Semantic search for candidates
         * @param {string} sQuery The natural language query
         * @param {number} iLimit Maximum number of results (default: 50)
         * @param {number} fMinScore Minimum similarity score (default: 0.3)
         * @returns {Promise<object>} Search results with candidates array
         */
        semanticSearch: async function (sQuery, iLimit = 50, fMinScore = 0.3) {
            try {
                const response = await fetch(this._baseURL + "/matching/search", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        query: sQuery,
                        limit: iLimit,
                        min_score: fMinScore
                    })
                });

                if (!response.ok) {
                    throw new Error("ML service returned " + response.status);
                }

                const data = await response.json();
                return {
                    success: true,
                    candidates: data.candidates || data.results || [],
                    totalMatches: data.total_matches || data.candidates?.length || 0,
                    mlUsed: true
                };
            } catch (error) {
                console.warn("ML service unavailable, using traditional search:", error);
                return this._fallbackSearch(sQuery, iLimit);
            }
        },

        /**
         * Find similar candidates
         * @param {string} sCandidateId The candidate ID to find similar to
         * @param {number} iLimit Maximum number of results (default: 10)
         * @param {object} oFactors Similarity factors (skills, experience, education, location)
         * @returns {Promise<object>} Similar candidates with similarity scores
         */
        findSimilarCandidates: async function (sCandidateId, iLimit = 10, oFactors = null) {
            try {
                const payload = {
                    candidate_id: sCandidateId,
                    limit: iLimit
                };

                if (oFactors) {
                    payload.similarity_factors = oFactors;
                }

                const response = await fetch(this._baseURL + "/matching/similar-candidates", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error("ML service returned " + response.status);
                }

                const data = await response.json();
                return {
                    success: true,
                    candidates: data.similar_candidates || data.results || [],
                    mlUsed: true
                };
            } catch (error) {
                console.warn("ML service unavailable, using OData fallback:", error);
                return this._fallbackSimilar(sCandidateId, iLimit);
            }
        },

        /**
         * Find semantic matches for a job posting
         * @param {string} sJobId The job posting ID
         * @param {number} fMinScore Minimum match score (default: 0.5)
         * @param {number} iLimit Maximum number of results (default: 50)
         * @param {boolean} bIncludeBreakdown Include score breakdown (default: false)
         * @returns {Promise<object>} Match results with candidates
         */
        findSemanticMatches: async function (sJobId, fMinScore = 0.5, iLimit = 50, bIncludeBreakdown = false) {
            try {
                const response = await fetch(this._baseURL + "/matching/semantic", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        job_posting_id: sJobId,
                        min_score: fMinScore,
                        limit: iLimit,
                        include_breakdown: bIncludeBreakdown
                    })
                });

                if (!response.ok) {
                    throw new Error("ML service returned " + response.status);
                }

                const data = await response.json();
                return {
                    success: true,
                    matches: data.matches || data.results || [],
                    totalMatches: data.total_matches || data.matches?.length || 0,
                    mlUsed: true
                };
            } catch (error) {
                console.warn("ML service unavailable, using OData fallback:", error);
                return this._fallbackMatching(sJobId, fMinScore, iLimit);
            }
        },

        /**
         * Load scoring criteria for a job posting
         * @param {string} sJobId The job posting ID
         * @returns {Promise<object>} Scoring criteria
         */
        loadScoringCriteria: async function (sJobId) {
            try {
                const response = await fetch(this._baseURL + "/scoring-criteria?job_posting_id=" + sJobId, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json"
                    }
                });

                if (!response.ok) {
                    throw new Error("ML service returned " + response.status);
                }

                const data = await response.json();
                return {
                    success: true,
                    criteria: data.criteria || data,
                    mlUsed: true
                };
            } catch (error) {
                console.warn("ML service unavailable:", error);
                return {
                    success: false,
                    criteria: [],
                    mlUsed: false,
                    error: error.message
                };
            }
        },

        /**
         * Save scoring criteria for a job posting
         * @param {string} sJobId The job posting ID
         * @param {Array} aCriteria The criteria array
         * @returns {Promise<object>} Save result
         */
        saveScoringCriteria: async function (sJobId, aCriteria) {
            try {
                const response = await fetch(this._baseURL + "/scoring-criteria", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        job_posting_id: sJobId,
                        criteria: aCriteria
                    })
                });

                if (!response.ok) {
                    throw new Error("ML service returned " + response.status);
                }

                const data = await response.json();
                return {
                    success: true,
                    data: data,
                    mlUsed: true
                };
            } catch (error) {
                console.error("Failed to save scoring criteria:", error);
                return {
                    success: false,
                    mlUsed: false,
                    error: error.message
                };
            }
        },

        /**
         * Load scoring criteria templates
         * @returns {Promise<object>} Templates
         */
        loadScoringTemplates: async function () {
            try {
                const response = await fetch(this._baseURL + "/scoring-criteria/templates", {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json"
                    }
                });

                if (!response.ok) {
                    throw new Error("ML service returned " + response.status);
                }

                const data = await response.json();
                return {
                    success: true,
                    templates: data.templates || data,
                    mlUsed: true
                };
            } catch (error) {
                console.warn("ML service unavailable, returning default templates:", error);
                return this._getDefaultTemplates();
            }
        },

        // ==================== Fallback Methods ====================

        /**
         * Fallback to traditional search using OData filter
         * @param {string} sQuery The search query
         * @param {number} iLimit Maximum results
         * @returns {Promise<object>} Search results
         * @private
         */
        _fallbackSearch: async function (sQuery, iLimit) {
            // This would call the OData service instead
            // For now, return empty results with mlUsed: false
            return {
                success: true,
                candidates: [],
                totalMatches: 0,
                mlUsed: false,
                message: "ML service unavailable - use traditional search filters"
            };
        },

        /**
         * Fallback for finding similar candidates
         * @param {string} sCandidateId The candidate ID
         * @param {number} iLimit Maximum results
         * @returns {Promise<object>} Similar candidates
         * @private
         */
        _fallbackSimilar: async function (sCandidateId, iLimit) {
            // This would call the OData findSimilarCandidates function
            return {
                success: true,
                candidates: [],
                mlUsed: false,
                message: "ML service unavailable - similar candidates unavailable"
            };
        },

        /**
         * Fallback for semantic matching using OData batchMatch action
         * @param {string} sJobId The job ID
         * @param {number} fMinScore Minimum score
         * @param {number} iLimit Maximum results
         * @returns {Promise<object>} Match results
         * @private
         */
        _fallbackMatching: async function (sJobId, fMinScore, iLimit) {
            // Validate job ID
            if (!sJobId || sJobId === "undefined") {
                console.error("Invalid job ID in fallback matching:", sJobId);
                return {
                    success: false,
                    matches: [],
                    totalMatches: 0,
                    mlUsed: false,
                    error: "Invalid job ID",
                    message: "Job ID is missing. Please refresh the page and try again."
                };
            }

            try {
                // Call the OData batchMatch action (rule-based matching only)
                const response = await fetch("/api/batchMatch", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        jobPostingId: sJobId,
                        minScore: fMinScore || 0,
                        useSemanticMatching: false  // Disable ML, use rule-based only
                    })
                });

                if (!response.ok) {
                    throw new Error("OData batchMatch failed with status " + response.status);
                }

                const data = await response.json();

                // Fetch the created match results to return them
                const filterQuery = encodeURIComponent(`jobPosting_ID eq '${sJobId}'`);
                const matchesResponse = await fetch(`/api/MatchResults?$filter=${filterQuery}&$top=${iLimit || 50}&$orderby=overallScore desc&$expand=candidate($select=ID,firstName,lastName,email)`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json"
                    }
                });

                if (!matchesResponse.ok) {
                    throw new Error("Failed to fetch match results: " + matchesResponse.status);
                }

                const matchesData = await matchesResponse.json();
                const matches = matchesData.value || [];

                return {
                    success: true,
                    matches: matches.map(m => ({
                        candidate_id: m.candidate_ID,
                        candidateName: `${m.candidate?.firstName || ''} ${m.candidate?.lastName || ''}`,
                        overall_score: m.overallScore,
                        skill_score: m.skillScore,
                        experience_score: m.experienceScore,
                        semantic_score: 0  // No semantic score in fallback mode
                    })),
                    totalMatches: data.value?.matchesCreated || matches.length,
                    mlUsed: false,
                    message: "ML service unavailable - using rule-based matching"
                };
            } catch (error) {
                console.error("Fallback matching also failed:", error);
                return {
                    success: false,
                    matches: [],
                    totalMatches: 0,
                    mlUsed: false,
                    error: error.message,
                    message: "Both ML and fallback matching unavailable"
                };
            }
        },

        /**
         * Get default scoring templates
         * @returns {object} Default templates
         * @private
         */
        _getDefaultTemplates: function () {
            return {
                success: true,
                templates: [
                    {
                        name: "Software Engineer",
                        criteria: [
                            { type: "skill", value: "JavaScript", points: 20, weight: 1.5, required: true },
                            { type: "skill", value: "React", points: 15, weight: 1.2, required: false },
                            { type: "experience", value: "3+", points: 25, weight: 1.0, required: true }
                        ]
                    },
                    {
                        name: "Data Scientist",
                        criteria: [
                            { type: "skill", value: "Python", points: 20, weight: 1.5, required: true },
                            { type: "skill", value: "Machine Learning", points: 25, weight: 2.0, required: true },
                            { type: "education", value: "Master's", points: 15, weight: 1.0, required: false }
                        ]
                    }
                ],
                mlUsed: false
            };
        }

    };
});
