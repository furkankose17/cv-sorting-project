sap.ui.define([], function () {
    "use strict";

    /**
     * Safe formatters for data type conversion
     * Prevents "Accessed value is not primitive" errors
     */
    return {
        /**
         * Format skills array to comma-separated string
         * @param {Array} aSkills - Array of skill associations
         * @returns {string} Formatted skills list
         */
        formatSkillsList: function (aSkills) {
            if (!aSkills || !Array.isArray(aSkills) || aSkills.length === 0) {
                return "No skills";
            }

            // Safe navigation: handle both expanded and non-expanded
            const aSkillNames = aSkills
                .slice(0, 3)
                .map(oSkillAssoc => {
                    // Handle nested object
                    if (oSkillAssoc && typeof oSkillAssoc === 'object') {
                        return oSkillAssoc.skill?.name ||
                               oSkillAssoc.skillName ||
                               "Unknown";
                    }
                    return "Unknown";
                })
                .filter(name => name !== "Unknown");

            return aSkillNames.join(", ") + (aSkills.length > 3 ? "..." : "");
        },

        /**
         * Format score to 1 decimal place
         * @param {number|string} vScore - Score value
         * @returns {string} Formatted score
         */
        formatScore: function (vScore) {
            // Type guard: handle null, undefined, empty string
            if (vScore === null || vScore === undefined || vScore === "") {
                return "0.0";
            }

            // Convert to number if string
            const nScore = typeof vScore === 'number' ? vScore : parseFloat(vScore);

            // Validate conversion
            if (isNaN(nScore)) {
                return "0.0";
            }

            return nScore.toFixed(1);
        },

        /**
         * Format location from city and country
         * @param {string} sCity - City name
         * @param {string|object} vCountry - Country name or object
         * @returns {string} Formatted location
         */
        formatLocation: function (sCity, vCountry) {
            // Extract country name from object or string
            const sCountryName = typeof vCountry === 'object'
                ? (vCountry?.name || vCountry?.countryName)
                : vCountry;

            // Build location string
            if (sCity && sCountryName) {
                return sCity + ", " + sCountryName;
            } else if (sCity) {
                return sCity;
            } else if (sCountryName) {
                return sCountryName;
            }
            return "N/A";
        },

        /**
         * Format best match from match results
         * @param {Array} aMatchResults - Array of match results
         * @returns {string} Formatted best match text
         */
        formatBestMatch: function (aMatchResults) {
            if (!aMatchResults || !Array.isArray(aMatchResults) || aMatchResults.length === 0) {
                return "";
            }

            // Get best match (first one since sorted by overallScore desc)
            const oBestMatch = aMatchResults[0];
            if (!oBestMatch) {
                return "";
            }

            // Format score (scores are already 0-100, no need to multiply)
            const nScore = typeof oBestMatch.overallScore === 'number'
                ? oBestMatch.overallScore
                : parseFloat(oBestMatch.overallScore) || 0;
            const sScore = Math.round(nScore);

            // Get job title
            const sJobTitle = oBestMatch.jobPosting?.title || "Unknown Job";

            // Format: "92% · Senior Backend Engineer"
            let sText = sScore + "% · " + sJobTitle;

            // Add indicator if more matches
            if (aMatchResults.length > 1) {
                sText += " (+" + (aMatchResults.length - 1) + " more)";
            }

            return sText;
        },

        /**
         * Check if array has items (for visibility)
         * @param {Array} aArray - Array to check
         * @returns {boolean} True if array has items
         */
        hasItems: function (aArray) {
            return aArray && Array.isArray(aArray) && aArray.length > 0;
        },

        /**
         * Check if array is empty (for visibility)
         * @param {Array} aArray - Array to check
         * @returns {boolean} True if array is empty
         */
        isEmpty: function (aArray) {
            return !aArray || !Array.isArray(aArray) || aArray.length === 0;
        },

        /**
         * Check if value exists (for visibility bindings)
         * @param {any} vValue - Value to check
         * @returns {boolean} True if value exists
         */
        hasValue: function (vValue) {
            // Proper boolean check, not string-to-boolean conversion
            return vValue !== null &&
                   vValue !== undefined &&
                   vValue !== "";
        }
    };
});
