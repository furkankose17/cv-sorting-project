const { MLClient } = require('../srv/lib/ml-client');

describe('MLClient OCR Methods', () => {
    let client;

    beforeEach(() => {
        client = new MLClient('http://localhost:8000');
    });

    test('processOCRWithStructured should exist', () => {
        expect(typeof client.processOCRWithStructured).toBe('function');
    });

    test('processOCRWithStructured should format request correctly', async () => {
        // Mock fetch
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    text: 'Sample text',
                    confidence: 85,
                    structured_data: { tier1: {} }
                })
            })
        );

        const result = await client.processOCRWithStructured({
            fileContent: 'base64content',
            fileType: 'pdf',
            language: 'en'
        });

        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/ocr/process',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('extract_structured')
            })
        );

        expect(result.structured_data).toBeDefined();
    });
});
