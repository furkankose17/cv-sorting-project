sap.ui.define([], function () {
    "use strict";

    /**
     * Formatters for status and state mappings
     * Provides consistent state colors across the application
     */
    return {
        /**
         * Format candidate status to UI5 state
         * @param {string} sStatus - Candidate status
         * @returns {string} UI5 state (Success, Warning, Error, Information, None)
         */
        formatStatusState: function (sStatus) {
            if (!sStatus) return "None";

            const mStateMap = {
                "new": "Information",
                "screening": "Warning",
                "interviewing": "Success",
                "offered": "Success",
                "hired": "Success",
                "rejected": "Error"
            };
            return mStateMap[sStatus.toLowerCase()] || "None";
        },

        /**
         * Format proficiency level to UI5 state
         * @param {string} sProficiency - Proficiency level
         * @returns {string} UI5 state
         */
        formatProficiencyState: function (sProficiency) {
            if (!sProficiency) return "None";

            const mStateMap = {
                "beginner": "Error",
                "intermediate": "Warning",
                "advanced": "Success",
                "expert": "Success"
            };
            return mStateMap[sProficiency.toLowerCase()] || "None";
        },

        /**
         * Format interview status to UI5 state
         * @param {string} sStatus - Interview status
         * @returns {string} UI5 state
         */
        formatInterviewStatusState: function (sStatus) {
            if (!sStatus) return "None";

            const mStateMap = {
                "scheduled": "Information",
                "completed": "Success",
                "cancelled": "Error",
                "rescheduled": "Warning"
            };
            return mStateMap[sStatus.toLowerCase()] || "None";
        },

        /**
         * Format job status to UI5 state
         * @param {string} sStatus - Job status
         * @returns {string} UI5 state
         */
        formatJobStatusState: function (sStatus) {
            if (!sStatus) return "None";

            const mStateMap = {
                "draft": "Warning",
                "published": "Success",
                "open": "Success",
                "closed": "Error"
            };
            return mStateMap[sStatus.toLowerCase()] || "None";
        },

        /**
         * Format score to UI5 state based on thresholds
         * @param {number} nScore - Score value (0-100)
         * @returns {string} UI5 state
         */
        formatScoreState: function (nScore) {
            const score = parseFloat(nScore);
            if (isNaN(score)) return "None";

            if (score >= 80) return "Success";
            if (score >= 60) return "Warning";
            return "Error";
        },

        /**
         * Format score to Hot/Warm/Cold badge text
         * @param {number} nScore - Score value (0-100)
         * @returns {string} Badge text (Hot, Warm, Cold)
         */
        formatScoreBadge: function (nScore) {
            const score = parseFloat(nScore);
            if (isNaN(score)) return "";

            if (score >= 80) return "Hot";
            if (score >= 60) return "Warm";
            return "Cold";
        },

        /**
         * Format score to badge icon
         * @param {number} nScore - Score value (0-100)
         * @returns {string} Icon URI
         */
        formatScoreBadgeIcon: function (nScore) {
            const score = parseFloat(nScore);
            if (isNaN(score)) return "";

            if (score >= 80) return "sap-icon://status-positive";
            if (score >= 60) return "sap-icon://status-critical";
            return "sap-icon://status-negative";
        },

        /**
         * Check if job status is draft
         * @param {string} sStatus - Job status
         * @returns {boolean} True if status is 'draft'
         */
        isJobDraft: function (sStatus) {
            return sStatus && sStatus.toLowerCase() === 'draft';
        },

        /**
         * Check if job status is open/published
         * @param {string} sStatus - Job status
         * @returns {boolean} True if status is 'open' or 'published'
         */
        isJobOpen: function (sStatus) {
            if (!sStatus) return false;
            const status = sStatus.toLowerCase();
            return status === 'open' || status === 'published';
        },

        /**
         * Format semantic score value - returns "N/A" for null/undefined
         * @param {number} nScore - Semantic score value
         * @returns {string} Formatted score or "N/A"
         */
        formatSemanticScoreValue: function (nScore) {
            if (nScore === null || nScore === undefined) {
                return "N/A";
            }
            return Math.round(nScore);
        },

        /**
         * Format semantic score unit - returns empty for null/undefined
         * @param {number} nScore - Semantic score value
         * @returns {string} "%" or empty string
         */
        formatSemanticScoreUnit: function (nScore) {
            if (nScore === null || nScore === undefined) {
                return "";
            }
            return "%";
        },

        /**
         * Format semantic score state
         * @param {number} nScore - Semantic score value
         * @returns {string} UI5 state
         */
        formatSemanticScoreState: function (nScore) {
            if (nScore === null || nScore === undefined) {
                return "None";
            }
            const score = parseFloat(nScore);
            if (isNaN(score)) return "None";

            if (score >= 80) return "Success";
            if (score >= 60) return "Warning";
            return "Error";
        },

        /**
         * Check if semantic score is available
         * @param {number} nScore - Semantic score value
         * @returns {boolean} True if score is available
         */
        hasSemanticScore: function (nScore) {
            return nScore !== null && nScore !== undefined && !isNaN(parseFloat(nScore));
        }
    };
});
