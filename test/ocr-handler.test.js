const { uploadAndProcessCV } = require('../srv/handlers/ocr-handler');

describe('OCR Handler - uploadAndProcessCV', () => {

    test('uploadAndProcessCV should validate file format', async () => {
        const req = {
            data: {
                fileName: 'test.txt',
                fileContent: Buffer.from('test'),
                mediaType: 'text/plain',
                autoCreate: false
            },
            user: { id: 'test-user' },
            reject: jest.fn((code, message) => {
                throw new Error(message);
            }),
            error: jest.fn((code, message) => {
                throw new Error(message);
            })
        };

        await expect(uploadAndProcessCV(req)).rejects.toThrow(/unsupported/i);
        expect(req.reject).toHaveBeenCalledWith(
            400,
            expect.stringMatching(/unsupported/i)
        );
    });

    test('uploadAndProcessCV should validate file size', async () => {
        const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

        const req = {
            data: {
                fileName: 'large.pdf',
                fileContent: largeBuffer,
                mediaType: 'application/pdf',
                autoCreate: false
            },
            user: { id: 'test-user' },
            reject: jest.fn((code, message) => {
                throw new Error(message);
            }),
            error: jest.fn((code, message) => {
                throw new Error(message);
            })
        };

        await expect(uploadAndProcessCV(req)).rejects.toThrow(/too large/i);
        expect(req.reject).toHaveBeenCalledWith(
            400,
            expect.stringMatching(/too large/i)
        );
    });
});
