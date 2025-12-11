/**
 * Rate Limiting Middleware
 * Protects APIs from abuse and DoS attacks
 */

const { ApplicationError } = require('../lib/errors');
const { createLogger } = require('../lib/logger');

const LOG = createLogger('rate-limiter');

// Configuration from environment variables
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || 60000); // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100);
const MAX_REQUESTS_PER_IP = parseInt(process.env.RATE_LIMIT_MAX_PER_IP || 50);

// Strict limits for sensitive operations
const UPLOAD_WINDOW_MS = parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS || 60000); // 1 minute
const MAX_UPLOADS_PER_WINDOW = parseInt(process.env.MAX_UPLOADS_PER_WINDOW || 10);

// Store for tracking requests
// In production, use Redis or similar distributed cache
const requestStore = new Map();
const uploadStore = new Map();

/**
 * Clean up expired entries from store
 * @param {Map} store - Store to clean
 * @param {number} windowMs - Time window in milliseconds
 */
function cleanupStore(store, windowMs) {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, data] of store.entries()) {
        if (now - data.windowStart > windowMs) {
            expiredKeys.push(key);
        }
    }

    expiredKeys.forEach(key => store.delete(key));
}

/**
 * Get client identifier from request
 * Uses user ID if authenticated, otherwise IP address
 * @param {Object} req - Request object
 * @returns {string} Client identifier
 */
function getClientIdentifier(req) {
    // Prefer user ID if authenticated
    if (req.user && req.user.id) {
        return `user:${req.user.id}`;
    }

    // Fall back to IP address
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.connection?.remoteAddress || 'unknown';
    return `ip:${ip}`;
}

/**
 * Check if request is within rate limit
 * @param {string} identifier - Client identifier
 * @param {Map} store - Request store
 * @param {number} windowMs - Time window
 * @param {number} maxRequests - Max requests allowed
 * @returns {Object} Rate limit status
 */
function checkRateLimit(identifier, store, windowMs, maxRequests) {
    const now = Date.now();

    // Get or create entry
    let entry = store.get(identifier);
    if (!entry || now - entry.windowStart > windowMs) {
        // New window
        entry = {
            windowStart: now,
            requestCount: 0,
            firstRequest: now
        };
        store.set(identifier, entry);
    }

    // Increment counter
    entry.requestCount++;
    entry.lastRequest = now;

    // Check if exceeded
    const isExceeded = entry.requestCount > maxRequests;
    const remainingRequests = Math.max(0, maxRequests - entry.requestCount);
    const resetTime = entry.windowStart + windowMs;

    return {
        isExceeded,
        requestCount: entry.requestCount,
        remainingRequests,
        resetTime,
        resetIn: Math.ceil((resetTime - now) / 1000) // seconds
    };
}

/**
 * Express-compatible rate limiter middleware
 * General rate limiting for all API endpoints
 */
function rateLimiterMiddleware(req, res, next) {
    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/ping') {
        return next();
    }

    const identifier = getClientIdentifier(req);
    const result = checkRateLimit(identifier, requestStore, WINDOW_MS, MAX_REQUESTS);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', result.remainingRequests);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (result.isExceeded) {
        LOG.warn('Rate limit exceeded', null, {
            identifier,
            requestCount: result.requestCount,
            limit: MAX_REQUESTS,
            path: req.path
        });

        res.setHeader('Retry-After', result.resetIn);
        res.status(429).json({
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Too many requests. Please try again in ${result.resetIn} seconds.`,
                retryAfter: result.resetIn
            }
        });
        return;
    }

    // Cleanup expired entries periodically (every 100 requests)
    if (result.requestCount % 100 === 0) {
        setImmediate(() => cleanupStore(requestStore, WINDOW_MS));
    }

    next();
}

/**
 * CAP-compatible rate limiter for actions
 * Use as a before-handler in CAP services
 */
function createCapRateLimiter(options = {}) {
    const windowMs = options.windowMs || WINDOW_MS;
    const maxRequests = options.maxRequests || MAX_REQUESTS;
    const store = options.store || requestStore;

    return async function (req) {
        const identifier = req.user?.id ? `user:${req.user.id}` : 'anonymous';
        const result = checkRateLimit(identifier, store, windowMs, maxRequests);

        if (result.isExceeded) {
            LOG.warn('CAP rate limit exceeded', null, {
                identifier,
                requestCount: result.requestCount,
                limit: maxRequests,
                event: req.event
            });

            throw new ApplicationError(
                `Too many requests. Please try again in ${result.resetIn} seconds.`,
                429
            );
        }
    };
}

/**
 * Strict rate limiter for file uploads
 * Much more restrictive than general rate limiting
 */
function createUploadRateLimiter() {
    return async function (req) {
        const identifier = req.user?.id ? `user:${req.user.id}` : 'anonymous';
        const result = checkRateLimit(identifier, uploadStore, UPLOAD_WINDOW_MS, MAX_UPLOADS_PER_WINDOW);

        if (result.isExceeded) {
            LOG.warn('Upload rate limit exceeded', null, {
                identifier,
                uploadCount: result.requestCount,
                limit: MAX_UPLOADS_PER_WINDOW,
                window: UPLOAD_WINDOW_MS / 1000 + 's'
            });

            throw new ApplicationError(
                `Too many file uploads. You can upload ${MAX_UPLOADS_PER_WINDOW} files per ${UPLOAD_WINDOW_MS / 1000} seconds. Please try again in ${result.resetIn} seconds.`,
                429
            );
        }

        // Cleanup
        if (result.requestCount % 50 === 0) {
            setImmediate(() => cleanupStore(uploadStore, UPLOAD_WINDOW_MS));
        }
    };
}

/**
 * Get current rate limit status for a client
 * Useful for debugging and monitoring
 */
function getRateLimitStatus(identifier, store = requestStore) {
    const entry = store.get(identifier);
    if (!entry) {
        return {
            hasEntry: false,
            message: 'No requests in current window'
        };
    }

    const now = Date.now();
    const windowElapsed = now - entry.windowStart;
    const resetIn = Math.ceil((WINDOW_MS - windowElapsed) / 1000);

    return {
        hasEntry: true,
        requestCount: entry.requestCount,
        maxRequests: MAX_REQUESTS,
        remainingRequests: Math.max(0, MAX_REQUESTS - entry.requestCount),
        windowStart: new Date(entry.windowStart).toISOString(),
        resetIn: resetIn > 0 ? resetIn : 0,
        firstRequest: new Date(entry.firstRequest).toISOString(),
        lastRequest: new Date(entry.lastRequest).toISOString()
    };
}

/**
 * Reset rate limit for a specific client (admin function)
 */
function resetRateLimit(identifier) {
    const deleted = requestStore.delete(identifier) || uploadStore.delete(identifier);
    if (deleted) {
        LOG.info('Rate limit reset', { identifier });
    }
    return deleted;
}

/**
 * Get statistics about rate limiting
 */
function getRateLimitStats() {
    return {
        general: {
            activeClients: requestStore.size,
            config: {
                windowMs: WINDOW_MS,
                maxRequests: MAX_REQUESTS,
                maxRequestsPerIp: MAX_REQUESTS_PER_IP
            }
        },
        uploads: {
            activeClients: uploadStore.size,
            config: {
                windowMs: UPLOAD_WINDOW_MS,
                maxUploads: MAX_UPLOADS_PER_WINDOW
            }
        }
    };
}

module.exports = {
    rateLimiterMiddleware,
    createCapRateLimiter,
    createUploadRateLimiter,
    getRateLimitStatus,
    resetRateLimit,
    getRateLimitStats,
    getClientIdentifier
};
