/**
 * Simple in-memory cache for frequently accessed data
 * Addresses performance issues with repeated queries for static data
 */

class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.ttlMap = new Map(); // Time-to-live for each key
    }

    /**
     * Set a value in cache with optional TTL (in seconds)
     */
    set(key, value, ttlSeconds = 300) {
        this.cache.set(key, value);
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.ttlMap.set(key, expiresAt);
        return value;
    }

    /**
     * Get a value from cache
     * Returns null if key doesn't exist or has expired
     */
    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }

        const expiresAt = this.ttlMap.get(key);
        if (expiresAt && Date.now() > expiresAt) {
            // Expired, remove from cache
            this.cache.delete(key);
            this.ttlMap.delete(key);
            return null;
        }

        return this.cache.get(key);
    }

    /**
     * Check if key exists and is not expired
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Delete a specific key from cache
     */
    delete(key) {
        this.cache.delete(key);
        this.ttlMap.delete(key);
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
        this.ttlMap.clear();
    }

    /**
     * Get or set pattern: if key exists, return cached value, otherwise execute fn and cache result
     */
    async getOrSet(key, fn, ttlSeconds = 300) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        const value = await fn();
        this.set(key, value, ttlSeconds);
        return value;
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, expiresAt] of this.ttlMap.entries()) {
            if (now > expiresAt) {
                this.cache.delete(key);
                this.ttlMap.delete(key);
            }
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Export singleton instance
const cache = new SimpleCache();

// Run cleanup every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

module.exports = cache;
