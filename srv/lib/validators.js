/**
 * Input Validation Utilities
 * Following OWASP Security Best Practices
 */
'use strict';

const { ValidationError } = require('./errors');

/**
 * Validate email format
 */
function validateEmail(email, fieldName = 'email') {
    if (!email) return;

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        throw new ValidationError(`Invalid email format`, fieldName);
    }

    if (email.length > 255) {
        throw new ValidationError(`Email must not exceed 255 characters`, fieldName);
    }
}

/**
 * Validate URL format
 */
function validateUrl(url, fieldName = 'url') {
    if (!url) return;

    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new ValidationError(`URL must use HTTP or HTTPS protocol`, fieldName);
        }
    } catch (e) {
        if (e instanceof ValidationError) throw e;
        throw new ValidationError(`Invalid URL format`, fieldName);
    }

    if (url.length > 500) {
        throw new ValidationError(`URL must not exceed 500 characters`, fieldName);
    }
}

/**
 * Validate phone number format (basic)
 */
function validatePhone(phone, fieldName = 'phone') {
    if (!phone) return;

    // Allow digits, spaces, dashes, parentheses, and plus sign
    const phoneRegex = /^[+]?[\d\s\-()]{7,20}$/;
    if (!phoneRegex.test(phone)) {
        throw new ValidationError(`Invalid phone number format`, fieldName);
    }
}

/**
 * Validate UUID format
 */
function validateUUID(uuid, fieldName = 'id') {
    if (!uuid) {
        throw new ValidationError(`${fieldName} is required`, fieldName);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
        throw new ValidationError(`Invalid UUID format for ${fieldName}`, fieldName);
    }
}

/**
 * Validate required string field
 */
function validateRequired(value, fieldName) {
    if (value === undefined || value === null || value === '') {
        throw new ValidationError(`${fieldName} is required`, fieldName);
    }
}

/**
 * Validate string length
 */
function validateLength(value, fieldName, minLength = 0, maxLength = Infinity) {
    if (!value) return;

    if (value.length < minLength) {
        throw new ValidationError(
            `${fieldName} must be at least ${minLength} characters`,
            fieldName
        );
    }

    if (value.length > maxLength) {
        throw new ValidationError(
            `${fieldName} must not exceed ${maxLength} characters`,
            fieldName
        );
    }
}

/**
 * Validate numeric range
 */
function validateRange(value, fieldName, min = -Infinity, max = Infinity) {
    if (value === undefined || value === null) return;

    const numValue = Number(value);
    if (isNaN(numValue)) {
        throw new ValidationError(`${fieldName} must be a valid number`, fieldName);
    }

    if (numValue < min || numValue > max) {
        throw new ValidationError(
            `${fieldName} must be between ${min} and ${max}`,
            fieldName
        );
    }
}

/**
 * Validate enum value
 */
function validateEnum(value, fieldName, allowedValues) {
    if (!value) return;

    if (!allowedValues.includes(value)) {
        throw new ValidationError(
            `${fieldName} must be one of: ${allowedValues.join(', ')}`,
            fieldName
        );
    }
}

/**
 * Validate date format and range
 */
function validateDate(value, fieldName, options = {}) {
    if (!value) return;

    const date = new Date(value);
    if (isNaN(date.getTime())) {
        throw new ValidationError(`${fieldName} must be a valid date`, fieldName);
    }

    if (options.minDate && date < new Date(options.minDate)) {
        throw new ValidationError(
            `${fieldName} must be after ${options.minDate}`,
            fieldName
        );
    }

    if (options.maxDate && date > new Date(options.maxDate)) {
        throw new ValidationError(
            `${fieldName} must be before ${options.maxDate}`,
            fieldName
        );
    }

    if (options.notInPast && date < new Date()) {
        throw new ValidationError(`${fieldName} must not be in the past`, fieldName);
    }

    if (options.notInFuture && date > new Date()) {
        throw new ValidationError(`${fieldName} must not be in the future`, fieldName);
    }
}

/**
 * Validate array
 */
function validateArray(value, fieldName, options = {}) {
    if (!value) return;

    if (!Array.isArray(value)) {
        throw new ValidationError(`${fieldName} must be an array`, fieldName);
    }

    if (options.minLength !== undefined && value.length < options.minLength) {
        throw new ValidationError(
            `${fieldName} must contain at least ${options.minLength} items`,
            fieldName
        );
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
        throw new ValidationError(
            `${fieldName} must not contain more than ${options.maxLength} items`,
            fieldName
        );
    }

    if (options.itemValidator) {
        value.forEach((item, index) => {
            try {
                options.itemValidator(item);
            } catch (e) {
                throw new ValidationError(
                    `${fieldName}[${index}]: ${e.message}`,
                    `${fieldName}[${index}]`
                );
            }
        });
    }
}

/**
 * Sanitize string input (remove dangerous characters)
 */
function sanitizeString(value) {
    if (!value) return value;

    return String(value)
        .trim()
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>'"]/g, ''); // Remove special characters
}

/**
 * Sanitize for SQL (escape special characters)
 * Note: CAP handles this automatically, but useful for logging
 */
function sanitizeForLog(value) {
    if (!value) return value;
    return String(value).replace(/[\n\r\t]/g, ' ').substring(0, 200);
}

/**
 * Validate candidate data
 */
function validateCandidate(data) {
    validateRequired(data.firstName, 'First Name');
    validateLength(data.firstName, 'First Name', 1, 100);

    validateRequired(data.lastName, 'Last Name');
    validateLength(data.lastName, 'Last Name', 1, 100);

    validateRequired(data.email, 'Email');
    validateEmail(data.email);

    if (data.phone) validatePhone(data.phone);
    if (data.linkedInUrl) validateUrl(data.linkedInUrl, 'LinkedIn URL');
    if (data.portfolioUrl) validateUrl(data.portfolioUrl, 'Portfolio URL');

    if (data.totalExperienceYears !== undefined) {
        validateRange(data.totalExperienceYears, 'Total Experience', 0, 99);
    }
}

/**
 * Validate job posting data
 */
function validateJobPosting(data) {
    validateRequired(data.title, 'Title');
    validateLength(data.title, 'Title', 1, 200);

    if (data.minimumExperience !== undefined) {
        validateRange(data.minimumExperience, 'Minimum Experience', 0, 50);
    }

    if (data.preferredExperience !== undefined) {
        validateRange(data.preferredExperience, 'Preferred Experience', 0, 50);
    }

    if (data.skillWeight !== undefined) {
        validateRange(data.skillWeight, 'Skill Weight', 0, 1);
    }

    if (data.experienceWeight !== undefined) {
        validateRange(data.experienceWeight, 'Experience Weight', 0, 1);
    }

    if (data.closingDate) {
        validateDate(data.closingDate, 'Closing Date', { notInPast: true });
    }
}

module.exports = {
    validateEmail,
    validateUrl,
    validatePhone,
    validateUUID,
    validateRequired,
    validateLength,
    validateRange,
    validateEnum,
    validateDate,
    validateArray,
    sanitizeString,
    sanitizeForLog,
    validateCandidate,
    validateJobPosting
};
