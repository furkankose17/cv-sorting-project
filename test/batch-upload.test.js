const cds = require('@sap/cds');

// Mock the database connection and handlers
jest.mock('@sap/cds', () => {
    const actualCds = jest.requireActual('@sap/cds');
    return {
        ...actualCds,
        connect: {
            to: jest.fn()
        },
        utils: {
            uuid: jest.fn(() => 'test-uuid-123')
        },
        log: jest.fn(() => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        }))
    };
});

describe('Batch Upload Handler', () => {

    test('uploadBatchCVs handler should exist and be importable', () => {
        // This will fail until we add the handlers to ocr-handler.js
        const ocrHandler = require('../srv/handlers/ocr-handler');
        expect(ocrHandler.uploadBatchCVs).toBeDefined();
        expect(typeof ocrHandler.uploadBatchCVs).toBe('function');
    });

    test('getBatchProgress handler should exist and be importable', () => {
        const ocrHandler = require('../srv/handlers/ocr-handler');
        expect(ocrHandler.getBatchProgress).toBeDefined();
        expect(typeof ocrHandler.getBatchProgress).toBe('function');
    });

    test('uploadBatchCVs should reject empty files array', async () => {
        const ocrHandler = require('../srv/handlers/ocr-handler');

        const req = {
            data: {
                files: [],
                autoCreateThreshold: 85.0
            },
            user: { id: 'test-user' },
            reject: jest.fn((code, message) => {
                throw new Error(message);
            })
        };

        await expect(ocrHandler.uploadBatchCVs(req)).rejects.toThrow(/no files/i);
        expect(req.reject).toHaveBeenCalledWith(400, 'No files provided');
    });
});
