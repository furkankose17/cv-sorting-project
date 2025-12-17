/**
 * Rate Limiting Middleware
 * Prevents API abuse by limiting the number of requests per time window
 */

const cds = require('@sap/cds');
const LOG = cds.log('rate-limiter');

class RateLimiter {
    constructor() {
        // Map: key -> {count, resetTime}
        this.requests = new Map();

        // Default configuration
        this.config = {
            windowMs: 60 * 1000, // 1 minute
            maxRequests: 100, // 100 requests per window
            keyGenerator: (req) => {
                // Use user ID if authenticated, otherwise IP
                return req.user?.id || req._.req?.ip || 'anonymous';
            },
            skipSuccessfulRequests: false,
            skipFailedRequests: false
        };

        // Cleanup old entries every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Configure rate limiter
     */
    configure(options = {}) {
        this.config = { ...this.config, ...options };
    }

    /**
     * Check if request should be allowed
     */
    async checkLimit(req) {
        const key = this.config.keyGenerator(req);
        const now = Date.now();

        let record = this.requests.get(key);

        if (!record || now > record.resetTime) {
            // New window
            record = {
                count: 0,
                resetTime: now + this.config.windowMs
            };
            this.requests.set(key, record);
        }

        record.count++;

        const remaining = Math.max(0, this.config.maxRequests - record.count);
        const resetTime = Math.ceil((record.resetTime - now) / 1000);

        if (record.count > this.config.maxRequests) {
            LOG.warn('Rate limit exceeded', {
                key,
                count: record.count,
                limit: this.config.maxRequests
            });

            return {
                allowed: false,
                limit: this.config.maxRequests,
                remaining: 0,
                reset: resetTime,
                retryAfter: resetTime
            };
        }

        return {
            allowed: true,
            limit: this.config.maxRequests,
            remaining,
            reset: resetTime
        };
    }

    /**
     * CAP middleware integration
     */
    middleware() {
        return async (req) => {
            // Skip rate limiting for health checks
            if (req.path === '/health' || req.path === '/ready') {
                return;  // CAP: just return to continue
            }

            const result = await this.checkLimit(req);

            // Add rate limit headers
            if (req._.res) {
                req._.res.setHeader('X-RateLimit-Limit', result.limit);
                req._.res.setHeader('X-RateLimit-Remaining', result.remaining);
                req._.res.setHeader('X-RateLimit-Reset', result.reset);
            }

            if (!result.allowed) {
                if (req._.res) {
                    req._.res.setHeader('Retry-After', result.retryAfter);
                }
                req.reject(429, 'Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED');
                return;
            }

            // CAP: just return to continue (no next() needed)
            return;
        };
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, record] of this.requests.entries()) {
            if (now > record.resetTime + this.config.windowMs) {
                this.requests.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            LOG.info(`Cleaned up ${cleaned} expired rate limit entries`);
        }
    }

    /**
     * Reset rate limit for a specific key
     */
    reset(key) {
        this.requests.delete(key);
    }

    /**
     * Get current stats
     */
    getStats() {
        return {
            totalKeys: this.requests.size,
            config: this.config
        };
    }
}

// Export singleton instance
module.exports = new RateLimiter();
