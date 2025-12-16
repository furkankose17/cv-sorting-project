const cds = require('@sap/cds');

// Start CAP test server
cds.test(__dirname + '/../..');

// Mock the ML client module before connecting to services
jest.mock('../../srv/lib/ml-client', () => {
    const mockMLClient = {
        processOCRWithStructured: jest.fn(),
        generateEmbedding: jest.fn()
    };

    return {
        createMLClient: () => mockMLClient,
        MLClient: jest.fn(() => mockMLClient),
        mockMLClient // Export for test access
    };
});

describe('OCR Workflow Integration Test', () => {
    let CVSortingService, db;
    const mlClientModule = require('../../srv/lib/ml-client');
    const mockMLClient = mlClientModule.mockMLClient;

    beforeAll(async () => {
        // Connect to services after server is ready
        CVSortingService = await cds.connect.to('CVSortingService');
        db = cds.db;
    }, 60000);

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Setup default mock responses
        mockMLClient.processOCRWithStructured.mockResolvedValue({
            text: 'John Doe\njohn.doe@example.com\n+1-555-0123',
            confidence: 78.5,
            method: 'paddleocr',
            structured_data: {
                overall_confidence: 78.5,
                tier1: {
                    firstName: { value: 'John', confidence: 95, source: 'line_1' },
                    lastName: { value: 'Doe', confidence: 93, source: 'line_1' },
                    email: { value: 'john.doe@example.com', confidence: 98, source: 'regex_match' },
                    phone: { value: '+1-555-0123', confidence: 90, source: 'regex_match' }
                },
                tier2: { workHistory: [], education: [], skills: [] },
                tier3: { references: { value: null, confidence: 0 }, certifications: [] },
                raw_sections: {}
            }
        });

        mockMLClient.generateEmbedding.mockResolvedValue({
            embedding: Array(384).fill(0).map(() => Math.random())
        });
    });

    test('Complete workflow: upload → OCR → review → create candidate', async () => {
        // Create a mock PDF file content
        const mockPDFContent = Buffer.from('%PDF-1.4\n%Mock PDF content for testing');

        // Step 1: Upload and process CV
        const uploadResult = await CVSortingService.send({
            event: 'uploadAndProcessCV',
            data: {
                fileName: 'john-doe-cv.pdf',
                fileContent: mockPDFContent,
                mediaType: 'application/pdf',
                autoCreate: false
            }
        });

        // Verify upload results
        expect(uploadResult.documentId).toBeDefined();
        expect(uploadResult.confidence).toBe(78.5);
        expect(uploadResult.requiresReview).toBe(true);
        expect(uploadResult.candidateId).toBeNull();
        expect(uploadResult.ocrStatus).toBe('review_required');

        // Verify document was created in database
        const { CVDocuments } = db.entities('cv.sorting');
        const document = await SELECT.one.from(CVDocuments)
            .where({ ID: uploadResult.documentId });

        expect(document).toBeDefined();
        expect(document.fileName).toBe('john-doe-cv.pdf');
        expect(document.ocrStatus).toBe('review_required');
        expect(document.ocrConfidence).toBe(78.5);

        // Verify ML client was called
        expect(mockMLClient.processOCRWithStructured).toHaveBeenCalledWith({
            fileContent: expect.any(String),
            fileType: 'pdf',
            language: 'en'
        });

        // Step 2: Review and create candidate
        const extractedData = JSON.parse(uploadResult.extractedData);

        const reviewResult = await CVSortingService.send({
            event: 'reviewAndCreateCandidate',
            data: {
                documentId: uploadResult.documentId,
                editedData: JSON.stringify(extractedData)
            }
        });

        // Verify review results
        expect(reviewResult.candidateId).toBeDefined();
        expect(reviewResult.embeddingGenerated).toBe(true);
        expect(reviewResult.linkedSkillsCount).toBeGreaterThanOrEqual(0);

        // Step 3: Verify candidate was created
        const { Candidates } = db.entities('cv.sorting');
        const candidate = await SELECT.one.from(Candidates)
            .where({ ID: reviewResult.candidateId });

        expect(candidate).toBeDefined();
        expect(candidate.firstName).toBe('John');
        expect(candidate.lastName).toBe('Doe');
        expect(candidate.email).toBe('john.doe@example.com');
        expect(candidate.phone).toBe('+1-555-0123');
        expect(candidate.status_code).toBe('new');

        // Step 4: Verify document was linked to candidate
        const updatedDocument = await SELECT.one.from(CVDocuments)
            .where({ ID: uploadResult.documentId });

        expect(updatedDocument.candidate_ID).toBe(reviewResult.candidateId);
        expect(updatedDocument.ocrStatus).toBe('completed');

        // Step 5: Verify embedding generation was called
        expect(mockMLClient.generateEmbedding).toHaveBeenCalled();
    }, 60000);

    test('Auto-create workflow: high confidence → automatic candidate creation', async () => {
        // Setup mock with HIGH confidence
        mockMLClient.processOCRWithStructured.mockResolvedValue({
            text: 'Jane Smith\njane.smith@tech.com',
            confidence: 92.3,
            method: 'paddleocr',
            structured_data: {
                overall_confidence: 92.3,
                tier1: {
                    firstName: { value: 'Jane', confidence: 98, source: 'line_1' },
                    lastName: { value: 'Smith', confidence: 97, source: 'line_1' },
                    email: { value: 'jane.smith@tech.com', confidence: 99, source: 'regex_match' }
                },
                tier2: { workHistory: [], education: [], skills: [] },
                tier3: { references: { value: null, confidence: 0 }, certifications: [] },
                raw_sections: {}
            }
        });

        const mockPDFContent = Buffer.from('%PDF-1.4\n%Mock PDF for Jane Smith');

        // Upload with autoCreate=true
        const uploadResult = await CVSortingService.send({
            event: 'uploadAndProcessCV',
            data: {
                fileName: 'jane-smith-cv.pdf',
                fileContent: mockPDFContent,
                mediaType: 'application/pdf',
                autoCreate: true
            }
        });

        // Verify auto-creation happened
        expect(uploadResult.documentId).toBeDefined();
        expect(uploadResult.confidence).toBe(92.3);
        expect(uploadResult.requiresReview).toBe(false);
        expect(uploadResult.candidateId).toBeDefined();
        expect(uploadResult.ocrStatus).toBe('completed');

        // Verify candidate was auto-created
        const { Candidates } = db.entities('cv.sorting');
        const candidate = await SELECT.one.from(Candidates)
            .where({ ID: uploadResult.candidateId });

        expect(candidate).toBeDefined();
        expect(candidate.firstName).toBe('Jane');
        expect(candidate.lastName).toBe('Smith');
        expect(candidate.email).toBe('jane.smith@tech.com');
    }, 60000);

    test('Error handling: invalid file format rejection', async () => {
        const mockTextContent = Buffer.from('Plain text content');

        // Attempt to upload unsupported format
        await expect(
            CVSortingService.send({
                event: 'uploadAndProcessCV',
                data: {
                    fileName: 'test.txt',
                    fileContent: mockTextContent,
                    mediaType: 'text/plain',
                    autoCreate: false
                }
            })
        ).rejects.toThrow(/unsupported/i);
    });

    test('Error handling: document not found for review', async () => {
        const fakeDocumentId = 'non-existent-document-id-12345';

        // Attempt to review non-existent document
        await expect(
            CVSortingService.send({
                event: 'reviewAndCreateCandidate',
                data: {
                    documentId: fakeDocumentId,
                    editedData: JSON.stringify({ tier1: {} })
                }
            })
        ).rejects.toThrow(); // Just check that it throws, error message format can vary
    });
});
