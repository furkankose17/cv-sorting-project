/**
 * Rate Limiter Tests
 * Tests for DoS protection and rate limiting functionality
 */
'use strict';

const {
    createCapRateLimiter,
    createUploadRateLimiter,
    getRateLimitStatus,
    resetRateLimit,
    getRateLimitStats,
    getClientIdentifier
} = require('../srv/middleware/rate-limiter');

describe('Rate Limiter', () => {

    beforeEach(() => {
        // Clear any rate limit state between tests
        // In production, this would be Redis, but we're using in-memory Map
    });

    describe('Client Identification', () => {
        it('should identify user by ID when authenticated', () => {
            const req = {
                user: { id: 'user123' },
                headers: {},
                connection: {}
            };

            const identifier = getClientIdentifier(req);
            expect(identifier).toBe('user:user123');
        });

        it('should identify client by IP when not authenticated', () => {
            const req = {
                user: null,
                headers: { 'x-forwarded-for': '192.168.1.1' },
                connection: {}
            };

            const identifier = getClientIdentifier(req);
            expect(identifier).toBe('ip:192.168.1.1');
        });

        it('should handle multiple IPs in X-Forwarded-For', () => {
            const req = {
                user: null,
                headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1' },
                connection: {}
            };

            const identifier = getClientIdentifier(req);
            expect(identifier).toBe('ip:192.168.1.1');
        });

        it('should fall back to connection IP', () => {
            const req = {
                user: null,
                headers: {},
                connection: { remoteAddress: '192.168.1.100' }
            };

            const identifier = getClientIdentifier(req);
            expect(identifier).toContain('192.168.1.100');
        });

        it('should handle unknown client', () => {
            const req = {
                user: null,
                headers: {},
                connection: {}
            };

            const identifier = getClientIdentifier(req);
            expect(identifier).toContain('unknown');
        });
    });

    describe('CAP Rate Limiter', () => {
        it('should allow requests within limit', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 5, windowMs: 60000 });

            const req = {
                user: { id: 'test-user' },
                event: 'testAction'
            };

            // Should allow first 5 requests
            for (let i = 0; i < 5; i++) {
                await expect(limiter(req)).resolves.not.toThrow();
            }
        });

        it('should block requests exceeding limit', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 3, windowMs: 60000 });

            const req = {
                user: { id: 'test-user-exceed' },
                event: 'testAction'
            };

            // Use first 3 requests
            for (let i = 0; i < 3; i++) {
                await limiter(req);
            }

            // 4th request should be blocked
            await expect(limiter(req)).rejects.toThrow('Too many requests');
        });

        it('should provide retry-after time in error', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 2, windowMs: 60000 });

            const req = {
                user: { id: 'test-user-retry' },
                event: 'testAction'
            };

            // Exhaust limit
            await limiter(req);
            await limiter(req);

            // Next request should fail with retry time
            try {
                await limiter(req);
                fail('Should have thrown error');
            } catch (error) {
                expect(error.message).toContain('seconds');
                expect(error.code).toBe(429);
            }
        });

        it('should reset after time window', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 2, windowMs: 100 }); // Short window for testing

            const req = {
                user: { id: 'test-user-reset' },
                event: 'testAction'
            };

            // Use up limit
            await limiter(req);
            await limiter(req);

            // Wait for window to expire
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should allow requests again
            await expect(limiter(req)).resolves.not.toThrow();
        });

        it('should track different users separately', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 2, windowMs: 60000 });

            const reqUser1 = {
                user: { id: 'user1' },
                event: 'testAction'
            };

            const reqUser2 = {
                user: { id: 'user2' },
                event: 'testAction'
            };

            // Use up user1 limit
            await limiter(reqUser1);
            await limiter(reqUser1);

            // User2 should still be allowed
            await expect(limiter(reqUser2)).resolves.not.toThrow();
        });
    });

    describe('Upload Rate Limiter', () => {
        it('should enforce stricter limits for uploads', async () => {
            const limiter = createUploadRateLimiter();

            const req = {
                user: { id: 'uploader' }
            };

            // Upload limiter should have lower limit (default 10)
            // Test that it enforces limit
            for (let i = 0; i < 10; i++) {
                await limiter(req);
            }

            // 11th upload should be blocked
            await expect(limiter(req)).rejects.toThrow('Too many file uploads');
        });

        it('should provide informative upload error message', async () => {
            const limiter = createUploadRateLimiter();

            const req = {
                user: { id: 'uploader2' }
            };

            // Exhaust upload limit
            for (let i = 0; i < 10; i++) {
                await limiter(req);
            }

            try {
                await limiter(req);
                fail('Should have thrown error');
            } catch (error) {
                expect(error.message).toContain('file uploads');
                expect(error.message).toContain('per');
                expect(error.message).toContain('seconds');
            }
        });
    });

    describe('Rate Limit Status', () => {
        it('should return status for existing client', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 5, windowMs: 60000 });

            const req = {
                user: { id: 'status-test' },
                event: 'testAction'
            };

            // Make some requests
            await limiter(req);
            await limiter(req);

            const status = getRateLimitStatus('user:status-test');

            expect(status.hasEntry).toBe(true);
            expect(status.requestCount).toBe(2);
            expect(status.remainingRequests).toBe(3); // 5 - 2
        });

        it('should return empty status for non-existent client', () => {
            const status = getRateLimitStatus('user:non-existent');

            expect(status.hasEntry).toBe(false);
            expect(status.message).toContain('No requests');
        });

        it('should include timing information', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 5, windowMs: 60000 });

            const req = {
                user: { id: 'timing-test' },
                event: 'testAction'
            };

            await limiter(req);

            const status = getRateLimitStatus('user:timing-test');

            expect(status.windowStart).toBeDefined();
            expect(status.resetIn).toBeGreaterThanOrEqual(0);
            expect(status.firstRequest).toBeDefined();
            expect(status.lastRequest).toBeDefined();
        });
    });

    describe('Rate Limit Reset', () => {
        it('should reset rate limit for specific client', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 2, windowMs: 60000 });

            const req = {
                user: { id: 'reset-test' },
                event: 'testAction'
            };

            // Exhaust limit
            await limiter(req);
            await limiter(req);

            // Verify blocked
            await expect(limiter(req)).rejects.toThrow();

            // Reset
            const wasReset = resetRateLimit('user:reset-test');
            expect(wasReset).toBe(true);

            // Should allow requests again
            await expect(limiter(req)).resolves.not.toThrow();
        });

        it('should return false for non-existent client', () => {
            const wasReset = resetRateLimit('user:does-not-exist');
            expect(wasReset).toBe(false);
        });
    });

    describe('Rate Limit Statistics', () => {
        it('should provide global statistics', async () => {
            const limiter1 = createCapRateLimiter({ maxRequests: 5, windowMs: 60000 });
            const limiter2 = createUploadRateLimiter();

            const req1 = { user: { id: 'stats-user1' }, event: 'action' };
            const req2 = { user: { id: 'stats-user2' } };

            await limiter1(req1);
            await limiter2(req2);

            const stats = getRateLimitStats();

            expect(stats.general).toBeDefined();
            expect(stats.general.activeClients).toBeGreaterThan(0);
            expect(stats.general.config).toBeDefined();
            expect(stats.uploads).toBeDefined();
            expect(stats.uploads.activeClients).toBeGreaterThan(0);
        });

        it('should include configuration in stats', () => {
            const stats = getRateLimitStats();

            expect(stats.general.config.windowMs).toBeDefined();
            expect(stats.general.config.maxRequests).toBeDefined();
            expect(stats.uploads.config.windowMs).toBeDefined();
            expect(stats.uploads.config.maxUploads).toBeDefined();
        });
    });

    describe('DoS Prevention', () => {
        it('should prevent rapid-fire requests', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 10, windowMs: 1000 });

            const req = {
                user: { id: 'dos-test' },
                event: 'testAction'
            };

            // Try to make 100 requests rapidly
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(limiter(req).catch(e => e));
            }

            const results = await Promise.all(promises);
            const blocked = results.filter(r => r instanceof Error).length;

            // Should have blocked many requests
            expect(blocked).toBeGreaterThan(80); // At least 80/100 blocked
        });

        it('should prevent distributed DoS (multiple IPs)', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 3, windowMs: 60000 });

            const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.3'];

            for (const ip of ips) {
                const req = {
                    user: null,
                    headers: { 'x-forwarded-for': ip },
                    connection: {},
                    event: 'testAction'
                };

                // Each IP gets its own limit
                await limiter(req);
                await limiter(req);
                await limiter(req);

                // 4th request from this IP should be blocked
                await expect(limiter(req)).rejects.toThrow();
            }
        });

        it('should handle burst traffic gracefully', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 50, windowMs: 5000 });

            const req = {
                user: { id: 'burst-test' },
                event: 'testAction'
            };

            // Send 30 requests at once (within limit)
            const promises = Array(30).fill(null).map(() => limiter(req));
            const results = await Promise.allSettled(promises);

            const successful = results.filter(r => r.status === 'fulfilled').length;
            expect(successful).toBe(30); // All should succeed

            // Wait a bit then send more
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should still have capacity
            await expect(limiter(req)).resolves.not.toThrow();
        });
    });

    describe('Memory Management', () => {
        it('should clean up expired entries', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 100, windowMs: 100 }); // Short window

            // Create many entries
            for (let i = 0; i < 10; i++) {
                const req = {
                    user: { id: `cleanup-user-${i}` },
                    event: 'testAction'
                };
                await limiter(req);
            }

            // Wait for entries to expire
            await new Promise(resolve => setTimeout(resolve, 200));

            // Trigger cleanup by making new requests
            for (let i = 0; i < 5; i++) {
                const req = {
                    user: { id: `new-user-${i}` },
                    event: 'testAction'
                };
                await limiter(req);
            }

            // Stats should show fewer active clients (cleanup occurred)
            // This is implementation-dependent but should work
            const stats = getRateLimitStats();
            expect(stats.general.activeClients).toBeLessThan(15);
        });
    });

    describe('Edge Cases', () => {
        it('should handle concurrent requests from same user', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 10, windowMs: 60000 });

            const req = {
                user: { id: 'concurrent-test' },
                event: 'testAction'
            };

            // Send 10 requests simultaneously
            const promises = Array(10).fill(null).map(() => limiter(req));
            const results = await Promise.allSettled(promises);

            // All 10 should succeed (no race condition)
            const successful = results.filter(r => r.status === 'fulfilled').length;
            expect(successful).toBe(10);

            // 11th should fail
            await expect(limiter(req)).rejects.toThrow();
        });

        it('should handle anonymous users', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 5, windowMs: 60000 });

            const req = {
                user: null,
                headers: {},
                connection: {},
                event: 'testAction'
            };

            // Should still apply rate limiting
            for (let i = 0; i < 5; i++) {
                await limiter(req);
            }

            await expect(limiter(req)).rejects.toThrow();
        });

        it('should handle undefined user gracefully', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 5, windowMs: 60000 });

            const req = {
                user: undefined,
                headers: {},
                connection: { remoteAddress: '127.0.0.1' },
                event: 'testAction'
            };

            await expect(limiter(req)).resolves.not.toThrow();
        });
    });

    describe('Configuration', () => {
        it('should respect custom window size', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 2, windowMs: 100 });

            const req = {
                user: { id: 'window-test' },
                event: 'testAction'
            };

            // Use up limit
            await limiter(req);
            await limiter(req);
            await expect(limiter(req)).rejects.toThrow();

            // Wait for window to reset
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should work again
            await expect(limiter(req)).resolves.not.toThrow();
        });

        it('should respect custom max requests', async () => {
            const limiter = createCapRateLimiter({ maxRequests: 3, windowMs: 60000 });

            const req = {
                user: { id: 'max-test' },
                event: 'testAction'
            };

            // Should allow exactly 3
            await limiter(req);
            await limiter(req);
            await limiter(req);

            // 4th should fail
            await expect(limiter(req)).rejects.toThrow();
        });
    });
});
