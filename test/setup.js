/**
 * Test Setup for CAP Services
 */
'use strict';

const cds = require('@sap/cds');

// Configure test environment
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(30000);

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
