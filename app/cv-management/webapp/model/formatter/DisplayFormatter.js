sap.ui.define([], function () {
    "use strict";

    /**
     * Formatters for user-facing display strings
     * Handles dates, names, and composed text
     */
    return {
        /**
         * Format first and last name to initials
         * @param {string} sFirstName - First name
         * @param {string} sLastName - Last name
         * @returns {string} Initials (e.g., "JD")
         */
        formatInitials: function (sFirstName, sLastName) {
            if (!sFirstName && !sLastName) return "?";

            const firstInitial = sFirstName ? sFirstName.charAt(0).toUpperCase() : "";
            const lastInitial = sLastName ? sLastName.charAt(0).toUpperCase() : "";
            return firstInitial + lastInitial;
        },

        /**
         * Format date range for work experience or education
         * @param {string} sStartDate - Start date (ISO format)
         * @param {string} sEndDate - End date (ISO format)
         * @param {boolean} bIsCurrent - Whether currently ongoing
         * @returns {string} Formatted date range (e.g., "Jan 2020 - Present")
         */
        formatDateRange: function (sStartDate, sEndDate, bIsCurrent) {
            if (!sStartDate) return "N/A";

            const oStartDate = new Date(sStartDate);
            const sFormattedStart = oStartDate.toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
            });

            let sFormattedEnd = "Present";
            if (!bIsCurrent && sEndDate) {
                const oEndDate = new Date(sEndDate);
                sFormattedEnd = oEndDate.toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric'
                });
            } else if (!bIsCurrent && !sEndDate) {
                sFormattedEnd = "N/A";
            }

            return sFormattedStart + " - " + sFormattedEnd;
        },

        /**
         * Format education with institution and year range
         * @param {string} sInstitution - Institution name
         * @param {string} sStartDate - Start date (ISO format)
         * @param {string} sEndDate - End date (ISO format)
         * @param {boolean} bIsOngoing - Whether currently ongoing
         * @returns {string} Formatted education (e.g., "MIT (2018 - 2022)")
         */
        formatEducation: function (sInstitution, sStartDate, sEndDate, bIsOngoing) {
            if (!sInstitution) return "N/A";
            if (!sStartDate) return sInstitution;

            const oStartDate = new Date(sStartDate);
            const sFormattedStart = oStartDate.getFullYear().toString();

            let sFormattedEnd = "Present";
            if (!bIsOngoing && sEndDate) {
                const oEndDate = new Date(sEndDate);
                sFormattedEnd = oEndDate.getFullYear().toString();
            } else if (!bIsOngoing && !sEndDate) {
                sFormattedEnd = "N/A";
            }

            return sInstitution + " (" + sFormattedStart + " - " + sFormattedEnd + ")";
        }
    };
});
