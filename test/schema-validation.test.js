const cds = require('@sap/cds');

describe('CVDocuments Schema', () => {
    let db;

    beforeAll(async () => {
        await cds.deploy(__dirname + '/../db/schema');
        db = await cds.connect.to('db');
    });

    test('CVDocuments should have OCR fields', async () => {
        const { CVDocuments } = db.entities('cv.sorting');
        const metadata = CVDocuments.elements;

        expect(metadata.ocrStatus).toBeDefined();
        expect(metadata.ocrConfidence).toBeDefined();
        expect(metadata.extractedText).toBeDefined();
        expect(metadata.structuredData).toBeDefined();
        expect(metadata.ocrMethod).toBeDefined();
        expect(metadata.ocrProcessedAt).toBeDefined();
        expect(metadata.ocrProcessingTime).toBeDefined();
        expect(metadata.reviewedBy).toBeDefined();
        expect(metadata.reviewedAt).toBeDefined();
    });
});
