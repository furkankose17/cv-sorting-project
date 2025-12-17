/**
 * Jest Configuration for CAP Testing
 *
 * Coverage Targets:
 * - Unit tests: 80%+
 * - Integration tests: Workflow coverage
 * - Security tests: OWASP Top 10 coverage
 */
module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Test file patterns
    testMatch: [
        '**/test/**/*.test.js',
        '!**/node_modules/**'
    ],

    // Test organization
    projects: [
        {
            displayName: 'unit',
            testMatch: ['**/test/*-*.test.js'],
            testPathIgnorePatterns: ['integration.test.js', 'integration/']
        },
        {
            displayName: 'integration',
            testMatch: ['**/test/integration.test.js', '**/test/integration/**/*.test.js']
        }
    ],

    // Timeouts and performance
    testTimeout: 90000, // 90 seconds for integration tests (CAP server startup is slow)
    maxWorkers: 1, // Run tests serially to avoid port conflicts with CAP server

    // Output configuration
    verbose: true,
    bail: false, // Continue running tests after failures

    // Coverage collection
    collectCoverageFrom: [
        'srv/**/*.js',
        '!srv/server.js',
        '!srv/**/node_modules/**',
        '!srv/**/*.cds',
        '!srv/lib/logger.js', // Logging utility - tested indirectly
        '!**/__mocks__/**',
        '!**/test/**'
    ],

    // Coverage output
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',          // Console output
        'text-summary',  // Brief summary
        'lcov',          // For CI/CD integration
        'html',          // HTML report for browsers
        'json'           // Machine-readable format
    ],

    // Coverage thresholds (updated for comprehensive test suite)
    coverageThreshold: {
        global: {
            branches: 70,    // Target: 70% branch coverage
            functions: 75,   // Target: 75% function coverage
            lines: 80,       // Target: 80% line coverage
            statements: 80   // Target: 80% statement coverage
        },
        // Stricter thresholds for critical security modules
        './srv/lib/file-validator.js': {
            branches: 85,
            functions: 90,
            lines: 90,
            statements: 90
        },
        './srv/middleware/rate-limiter.js': {
            branches: 80,
            functions: 85,
            lines: 85,
            statements: 85
        }
    },

    // Setup and teardown
    setupFilesAfterEnv: ['<rootDir>/test/setup.js'],

    // Module paths
    moduleDirectories: ['node_modules', 'srv'],

    // Transform settings (if using TypeScript or modern JS in future)
    transform: {},

    // Error handling
    errorOnDeprecated: true,

    // Watch mode settings (for development)
    watchPathIgnorePatterns: [
        '/node_modules/',
        '/coverage/',
        '/dist/',
        '/.git/'
    ],

    // Notification settings (optional)
    notify: false,
    notifyMode: 'failure-change'
};
