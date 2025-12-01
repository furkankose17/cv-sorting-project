/**
 * Custom Error Classes following SAP CAP Best Practices
 *
 * @see https://cap.cloud.sap/docs/node.js/best-practices#error-handling
 */
'use strict';

/**
 * Base application error class
 */
class ApplicationError extends Error {
    constructor(message, code, statusCode = 400, details = null) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                details: this.details,
                '@Common.numericSeverity': 4 // Error severity for UI
            }
        };
    }
}

/**
 * Validation error for input validation failures
 */
class ValidationError extends ApplicationError {
    constructor(message, field = null, details = null) {
        super(message, 'VALIDATION_ERROR', 400, details);
        this.field = field;
    }
}

/**
 * Not found error for missing resources
 */
class NotFoundError extends ApplicationError {
    constructor(entity, id) {
        super(`${entity} with ID '${id}' not found`, 'NOT_FOUND', 404);
        this.entity = entity;
        this.entityId = id;
    }
}

/**
 * Authorization error for permission issues
 */
class AuthorizationError extends ApplicationError {
    constructor(message = 'You are not authorized to perform this action') {
        super(message, 'UNAUTHORIZED', 403);
    }
}

/**
 * Conflict error for business rule violations
 */
class ConflictError extends ApplicationError {
    constructor(message, details = null) {
        super(message, 'CONFLICT', 409, details);
    }
}

/**
 * Processing error for async operations
 */
class ProcessingError extends ApplicationError {
    constructor(message, operation, details = null) {
        super(message, 'PROCESSING_ERROR', 500, details);
        this.operation = operation;
    }
}

/**
 * External service error
 */
class ExternalServiceError extends ApplicationError {
    constructor(serviceName, message, originalError = null) {
        super(`External service '${serviceName}' error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502);
        this.serviceName = serviceName;
        this.originalError = originalError;
    }
}

/**
 * Business rule error
 */
class BusinessRuleError extends ApplicationError {
    constructor(message, rule, details = null) {
        super(message, 'BUSINESS_RULE_VIOLATION', 422, details);
        this.rule = rule;
    }
}

/**
 * Error handler middleware for consistent error responses
 */
function errorHandler(err, req) {
    const LOG = cds.log('error-handler');

    // Log error with context
    LOG.error('Request error:', {
        error: err.message,
        code: err.code,
        stack: err.stack,
        user: req.user?.id,
        path: req.path
    });

    // Return consistent error format
    if (err instanceof ApplicationError) {
        req.error(err.statusCode, err.message, err.code);
    } else if (err.code === 'ENTITY_NOT_FOUND') {
        req.error(404, err.message);
    } else {
        // Generic error - don't expose internal details
        req.error(500, 'An unexpected error occurred', 'INTERNAL_ERROR');
    }
}

module.exports = {
    ApplicationError,
    ValidationError,
    NotFoundError,
    AuthorizationError,
    ConflictError,
    ProcessingError,
    ExternalServiceError,
    BusinessRuleError,
    errorHandler
};
