/**
 * Test Setup for CAP Services
 */
'use strict';

const cds = require('@sap/cds');

// Configure test environment
process.env.NODE_ENV = 'test';

// Global test timeout (90 seconds for CAP server initialization)
jest.setTimeout(90000);

// Before all tests
beforeAll(async () => {
    // Bootstrap CDS
    await cds.connect.to('db');
});

// After all tests
afterAll(async () => {
    // Cleanup
    await cds.disconnect();
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
