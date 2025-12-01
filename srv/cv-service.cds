using { cv.sorting as db } from '../db/schema';

/**
 * CV Processing Service
 * Handles CV upload, OCR processing, and data extraction
 */
service CVService @(path: '/cv') {

    // ==========================================
    // ENTITIES
    // ==========================================

    @readonly
    entity Documents as projection on db.CVDocuments {
        *,
        candidate.firstName,
        candidate.lastName,
        candidate.email
    } excluding { fileContent };

    // Document with content for download
    @readonly
    entity DocumentContent as projection on db.CVDocuments;

    // ==========================================
    // ACTIONS - Document Processing
    // ==========================================

    /**
     * Upload a new CV document
     * @param fileName - Name of the file
     * @param fileContent - Base64 encoded file content
     * @param fileType - MIME type of the file
     * @param candidateId - Optional: Link to existing candidate
     */
    action uploadDocument(
        fileName    : String,
        fileContent : LargeBinary,
        fileType    : String,
        candidateId : UUID
    ) returns {
        documentId  : UUID;
        status      : String;
        message     : String;
    };

    /**
     * Process document using Document AI / OCR
     * @param documentId - ID of the document to process
     * @param extractionOptions - JSON options for extraction
     */
    action processDocument(
        documentId        : UUID,
        extractionOptions : String
    ) returns {
        success           : Boolean;
        extractedData     : String;  // JSON extracted data
        confidence        : Decimal;
        processingTime    : Integer; // milliseconds
    };

    /**
     * Batch process multiple documents
     */
    action batchProcessDocuments(
        documentIds : array of UUID
    ) returns {
        processed   : Integer;
        failed      : Integer;
        results     : String;  // JSON array of results
    };

    /**
     * Re-process a document with different settings
     */
    action reprocessDocument(
        documentId        : UUID,
        extractionMethod  : String,  // document-ai, enhanced, manual
        options           : String   // JSON options
    ) returns {
        success           : Boolean;
        message           : String;
    };

    /**
     * Create candidate from extracted document data
     */
    action createCandidateFromDocument(
        documentId        : UUID,
        additionalData    : String,  // JSON additional candidate data
        autoLinkSkills    : Boolean  // Auto-link extracted skills to master skills
    ) returns {
        candidateId       : UUID;
        linkedSkills      : Integer;
        warnings          : array of String;
    };

    // ==========================================
    // FUNCTIONS - Query Operations
    // ==========================================

    /**
     * Get extraction status for a document
     */
    function getProcessingStatus(documentId : UUID) returns {
        status            : String;
        progress          : Integer;  // 0-100
        currentStep       : String;
        estimatedTime     : Integer;  // seconds remaining
    };

    /**
     * Get extracted data in structured format
     */
    function getExtractedData(documentId : UUID) returns {
        personalInfo      : String;   // JSON
        workExperience    : String;   // JSON array
        education         : String;   // JSON array
        skills            : String;   // JSON array
        certifications    : String;   // JSON array
        languages         : String;   // JSON array
        rawText           : String;
        confidence        : Decimal;
    };

    /**
     * Preview extraction without saving
     */
    function previewExtraction(
        fileContent       : LargeBinary,
        fileType          : String
    ) returns {
        preview           : String;   // JSON extracted data preview
        confidence        : Decimal;
        warnings          : array of String;
    };

    // ==========================================
    // EVENTS
    // ==========================================

    event DocumentUploaded {
        documentId        : UUID;
        fileName          : String;
        uploadedBy        : String;
        timestamp         : Timestamp;
    }

    event DocumentProcessed {
        documentId        : UUID;
        success           : Boolean;
        candidateId       : UUID;
        confidence        : Decimal;
        timestamp         : Timestamp;
    }

    event ProcessingFailed {
        documentId        : UUID;
        errorCode         : String;
        errorMessage      : String;
        timestamp         : Timestamp;
    }
}
