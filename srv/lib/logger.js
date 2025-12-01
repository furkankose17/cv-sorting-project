/**
 * Logging Utilities following SAP CAP Best Practices
 *
 * @see https://cap.cloud.sap/docs/node.js/cds-log
 */
'use strict';

const cds = require('@sap/cds');

/**
 * Create a scoped logger
 * @param {string} module - Module name for logging scope
 * @returns {object} Logger instance
 */
function createLogger(module) {
    const LOG = cds.log(module);

    return {
        /**
         * Log info message
         */
        info(message, context = {}) {
            LOG.info(message, sanitizeContext(context));
        },

        /**
         * Log debug message
         */
        debug(message, context = {}) {
            LOG.debug(message, sanitizeContext(context));
        },

        /**
         * Log warning message
         */
        warn(message, context = {}) {
            LOG.warn(message, sanitizeContext(context));
        },

        /**
         * Log error message
         */
        error(message, error = null, context = {}) {
            const errorContext = {
                ...sanitizeContext(context),
                ...(error && {
                    errorMessage: error.message,
                    errorCode: error.code,
                    errorStack: error.stack
                })
            };
            LOG.error(message, errorContext);
        },

        /**
         * Log performance metric
         */
        perf(operation, duration, context = {}) {
            LOG.info(`Performance: ${operation}`, {
                ...sanitizeContext(context),
                duration_ms: duration,
                metric_type: 'performance'
            });
        },

        /**
         * Log audit event
         */
        audit(action, entity, entityId, userId, details = {}) {
            LOG.info(`Audit: ${action} on ${entity}`, {
                action,
                entity,
                entityId,
                userId,
                ...sanitizeContext(details),
                metric_type: 'audit'
            });
        },

        /**
         * Create a child logger with additional context
         */
        child(additionalContext) {
            const childLogger = createLogger(module);
            const originalInfo = childLogger.info;
            const originalDebug = childLogger.debug;
            const originalWarn = childLogger.warn;
            const originalError = childLogger.error;

            childLogger.info = (msg, ctx = {}) => originalInfo(msg, { ...additionalContext, ...ctx });
            childLogger.debug = (msg, ctx = {}) => originalDebug(msg, { ...additionalContext, ...ctx });
            childLogger.warn = (msg, ctx = {}) => originalWarn(msg, { ...additionalContext, ...ctx });
            childLogger.error = (msg, err, ctx = {}) => originalError(msg, err, { ...additionalContext, ...ctx });

            return childLogger;
        }
    };
}

/**
 * Sanitize context to remove sensitive data
 */
function sanitizeContext(context) {
    const sensitiveFields = ['password', 'token', 'secret', 'authorization', 'cookie'];
    const sanitized = { ...context };

    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '***REDACTED***';
        }
    }

    return sanitized;
}

/**
 * Request correlation ID middleware
 */
function correlationMiddleware(req, res, next) {
    const correlationId = req.headers['x-correlation-id'] ||
        req.headers['x-request-id'] ||
        generateCorrelationId();

    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    next();
}

/**
 * Generate a correlation ID
 */
function generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Timer utility for performance logging
 */
class Timer {
    constructor(name, logger) {
        this.name = name;
        this.logger = logger;
        this.startTime = process.hrtime.bigint();
    }

    stop(context = {}) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - this.startTime) / 1e6; // Convert to milliseconds

        if (this.logger) {
            this.logger.perf(this.name, duration, context);
        }

        return duration;
    }
}

/**
 * Create a timer for performance measurement
 */
function startTimer(name, logger) {
    return new Timer(name, logger);
}

module.exports = {
    createLogger,
    correlationMiddleware,
    generateCorrelationId,
    startTimer,
    Timer
};
