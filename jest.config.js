/**
 * Jest Configuration for CAP Testing
 */
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.js'],
    testTimeout: 30000,
    verbose: true,
    collectCoverageFrom: [
        'srv/**/*.js',
        '!srv/server.js',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        }
    },
    setupFilesAfterEnv: ['<rootDir>/test/setup.js']
};
