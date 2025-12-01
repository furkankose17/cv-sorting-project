const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

/**
 * CV Processing Service Implementation
 * Handles CV upload, OCR processing via Document AI, and data extraction
 */
module.exports = class CVService extends cds.ApplicationService {

    async init() {
        const { CVDocuments, Candidates } = this.entities;

        // Connect to Document AI service
        this.documentAI = await cds.connect.to('document-ai');

        // Register action handlers
        this.on('uploadDocument', this.handleUploadDocument);
        this.on('processDocument', this.handleProcessDocument);
        this.on('batchProcessDocuments', this.handleBatchProcess);
        this.on('reprocessDocument', this.handleReprocess);
        this.on('createCandidateFromDocument', this.handleCreateCandidate);

        // Register function handlers
        this.on('getProcessingStatus', this.handleGetStatus);
        this.on('getExtractedData', this.handleGetExtractedData);
        this.on('previewExtraction', this.handlePreviewExtraction);

        await super.init();
    }

    /**
     * Handle document upload
     */
    async handleUploadDocument(req) {
        const { fileName, fileContent, fileType, candidateId } = req.data;
        const { CVDocuments } = this.entities;

        try {
            // Validate file type
            const allowedTypes = ['application/pdf', 'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/png', 'image/jpeg', 'image/jpg'];

            if (!allowedTypes.includes(fileType)) {
                return {
                    documentId: null,
                    status: 'error',
                    message: `Unsupported file type: ${fileType}. Allowed types: PDF, DOC, DOCX, PNG, JPG`
                };
            }

            // Create document record
            const documentId = uuidv4();
            const document = {
                ID: documentId,
                fileName,
                fileType,
                fileContent: Buffer.from(fileContent, 'base64'),
                fileSize: Buffer.from(fileContent, 'base64').length,
                mediaType: fileType,
                processingStatus: 'pending',
                candidate_ID: candidateId || null,
                isLatest: true,
                version: 1
            };

            await INSERT.into(CVDocuments).entries(document);

            // Emit upload event
            await this.emit('DocumentUploaded', {
                documentId,
                fileName,
                uploadedBy: req.user?.id || 'anonymous',
                timestamp: new Date()
            });

            return {
                documentId,
                status: 'uploaded',
                message: 'Document uploaded successfully. Call processDocument to extract data.'
            };

        } catch (error) {
            console.error('Upload error:', error);
            return {
                documentId: null,
                status: 'error',
                message: `Upload failed: ${error.message}`
            };
        }
    }

    /**
     * Process document using Document AI
     */
    async handleProcessDocument(req) {
        const { documentId, extractionOptions } = req.data;
        const { CVDocuments } = this.entities;
        const startTime = Date.now();

        try {
            // Get document
            const document = await SELECT.one.from(CVDocuments).where({ ID: documentId });
            if (!document) {
                return { success: false, extractedData: null, confidence: 0, processingTime: 0 };
            }

            // Update status to processing
            await UPDATE(CVDocuments).where({ ID: documentId }).set({
                processingStatus: 'processing'
            });

            // Parse extraction options
            const options = extractionOptions ? JSON.parse(extractionOptions) : {};

            // Call Document AI for extraction
            const extractionResult = await this._extractWithDocumentAI(document, options);

            // Update document with extracted data
            await UPDATE(CVDocuments).where({ ID: documentId }).set({
                processingStatus: 'completed',
                processedAt: new Date(),
                extractedText: extractionResult.rawText,
                extractedData: JSON.stringify(extractionResult.structuredData),
                ocrConfidence: extractionResult.confidence,
                extractionMethod: 'document-ai'
            });

            // Emit processed event
            await this.emit('DocumentProcessed', {
                documentId,
                success: true,
                candidateId: document.candidate_ID,
                confidence: extractionResult.confidence,
                timestamp: new Date()
            });

            return {
                success: true,
                extractedData: JSON.stringify(extractionResult.structuredData),
                confidence: extractionResult.confidence,
                processingTime: Date.now() - startTime
            };

        } catch (error) {
            console.error('Processing error:', error);

            // Update status to failed
            await UPDATE(CVDocuments).where({ ID: documentId }).set({
                processingStatus: 'failed',
                errorMessage: error.message
            });

            // Emit failure event
            await this.emit('ProcessingFailed', {
                documentId,
                errorCode: 'PROCESSING_ERROR',
                errorMessage: error.message,
                timestamp: new Date()
            });

            return {
                success: false,
                extractedData: null,
                confidence: 0,
                processingTime: Date.now() - startTime
            };
        }
    }

    /**
     * Extract data using SAP Document AI
     */
    async _extractWithDocumentAI(document, options) {
        try {
            // Prepare document for Document AI
            const payload = {
                options: {
                    documentType: 'resume',
                    extraction: {
                        headerFields: ['name', 'email', 'phone', 'address', 'linkedin'],
                        lineItems: ['work_experience', 'education', 'skills', 'certifications']
                    },
                    languageCode: options.language || 'en'
                },
                document: {
                    content: document.fileContent.toString('base64'),
                    mediaType: document.mediaType
                }
            };

            // Call Document AI service
            const result = await this.documentAI.send('POST', '/document/jobs', payload);

            // Wait for job completion (polling)
            const jobResult = await this._pollDocumentAIJob(result.id);

            // Transform Document AI response to our structure
            return this._transformExtractionResult(jobResult);

        } catch (error) {
            console.error('Document AI extraction error:', error);

            // Fallback to basic extraction if Document AI fails
            return this._fallbackExtraction(document);
        }
    }

    /**
     * Poll Document AI job until completion
     */
    async _pollDocumentAIJob(jobId, maxAttempts = 30, interval = 2000) {
        for (let i = 0; i < maxAttempts; i++) {
            const status = await this.documentAI.send('GET', `/document/jobs/${jobId}`);

            if (status.status === 'DONE') {
                return status.result;
            } else if (status.status === 'FAILED') {
                throw new Error(`Document AI job failed: ${status.error}`);
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }
        throw new Error('Document AI job timed out');
    }

    /**
     * Transform Document AI result to our data structure
     */
    _transformExtractionResult(aiResult) {
        const structuredData = {
            personalInfo: {
                name: aiResult.headerFields?.name?.value || '',
                email: aiResult.headerFields?.email?.value || '',
                phone: aiResult.headerFields?.phone?.value || '',
                address: aiResult.headerFields?.address?.value || '',
                linkedin: aiResult.headerFields?.linkedin?.value || ''
            },
            workExperience: (aiResult.lineItems?.work_experience || []).map(exp => ({
                company: exp.company?.value || '',
                title: exp.title?.value || '',
                location: exp.location?.value || '',
                startDate: exp.start_date?.value || '',
                endDate: exp.end_date?.value || '',
                description: exp.description?.value || '',
                confidence: exp.confidence || 0
            })),
            education: (aiResult.lineItems?.education || []).map(edu => ({
                institution: edu.institution?.value || '',
                degree: edu.degree?.value || '',
                field: edu.field?.value || '',
                startDate: edu.start_date?.value || '',
                endDate: edu.end_date?.value || '',
                grade: edu.grade?.value || '',
                confidence: edu.confidence || 0
            })),
            skills: (aiResult.lineItems?.skills || []).map(skill => ({
                name: skill.name?.value || skill.value || '',
                category: skill.category?.value || 'general',
                confidence: skill.confidence || 0
            })),
            certifications: (aiResult.lineItems?.certifications || []).map(cert => ({
                name: cert.name?.value || '',
                issuer: cert.issuer?.value || '',
                date: cert.date?.value || '',
                confidence: cert.confidence || 0
            })),
            languages: (aiResult.lineItems?.languages || []).map(lang => ({
                language: lang.name?.value || lang.value || '',
                proficiency: lang.proficiency?.value || 'professional',
                confidence: lang.confidence || 0
            }))
        };

        // Calculate average confidence
        const confidences = [
            ...Object.values(aiResult.headerFields || {}).map(f => f.confidence || 0),
            ...(aiResult.lineItems?.work_experience || []).map(e => e.confidence || 0),
            ...(aiResult.lineItems?.education || []).map(e => e.confidence || 0)
        ];
        const avgConfidence = confidences.length > 0
            ? confidences.reduce((a, b) => a + b, 0) / confidences.length
            : 0;

        return {
            rawText: aiResult.rawText || '',
            structuredData,
            confidence: avgConfidence
        };
    }

    /**
     * Fallback extraction when Document AI is unavailable
     */
    async _fallbackExtraction(document) {
        // Basic text extraction (placeholder - would use pdf-parse or mammoth)
        return {
            rawText: 'Text extraction fallback - Document AI unavailable',
            structuredData: {
                personalInfo: {},
                workExperience: [],
                education: [],
                skills: [],
                certifications: [],
                languages: []
            },
            confidence: 0.1
        };
    }

    /**
     * Batch process multiple documents
     */
    async handleBatchProcess(req) {
        const { documentIds } = req.data;
        let processed = 0;
        let failed = 0;
        const results = [];

        for (const documentId of documentIds) {
            try {
                const result = await this.handleProcessDocument({
                    data: { documentId },
                    user: req.user
                });

                if (result.success) {
                    processed++;
                } else {
                    failed++;
                }

                results.push({ documentId, ...result });
            } catch (error) {
                failed++;
                results.push({ documentId, success: false, error: error.message });
            }
        }

        return {
            processed,
            failed,
            results: JSON.stringify(results)
        };
    }

    /**
     * Reprocess document with different settings
     */
    async handleReprocess(req) {
        const { documentId, extractionMethod, options } = req.data;
        const { CVDocuments } = this.entities;

        // Reset document status
        await UPDATE(CVDocuments).where({ ID: documentId }).set({
            processingStatus: 'pending',
            extractedText: null,
            extractedData: null,
            ocrConfidence: null,
            errorMessage: null
        });

        // Process again
        return this.handleProcessDocument({
            data: { documentId, extractionOptions: options },
            user: req.user
        });
    }

    /**
     * Create candidate from extracted document data
     */
    async handleCreateCandidate(req) {
        const { documentId, additionalData, autoLinkSkills } = req.data;
        const { CVDocuments, Candidates, WorkExperiences, Educations, CandidateSkills, Skills } = this.entities;

        try {
            // Get document with extracted data
            const document = await SELECT.one.from(CVDocuments).where({ ID: documentId });
            if (!document || !document.extractedData) {
                return { candidateId: null, linkedSkills: 0, warnings: ['No extracted data found'] };
            }

            const extractedData = JSON.parse(document.extractedData);
            const additional = additionalData ? JSON.parse(additionalData) : {};
            const warnings = [];

            // Create candidate
            const candidateId = uuidv4();
            const names = this._parseName(extractedData.personalInfo?.name || '');

            const candidate = {
                ID: candidateId,
                firstName: additional.firstName || names.firstName || 'Unknown',
                lastName: additional.lastName || names.lastName || 'Unknown',
                email: additional.email || extractedData.personalInfo?.email || '',
                phone: additional.phone || extractedData.personalInfo?.phone || '',
                linkedInUrl: extractedData.personalInfo?.linkedin || '',
                location: extractedData.personalInfo?.address || '',
                status_code: 'new',
                aiConfidenceScore: document.ocrConfidence,
                source: additional.source || 'cv-upload'
            };

            await INSERT.into(Candidates).entries(candidate);

            // Link document to candidate
            await UPDATE(CVDocuments).where({ ID: documentId }).set({
                candidate_ID: candidateId
            });

            // Create work experiences
            for (const exp of extractedData.workExperience || []) {
                await INSERT.into(WorkExperiences).entries({
                    ID: uuidv4(),
                    candidate_ID: candidateId,
                    companyName: exp.company,
                    jobTitle: exp.title,
                    location: exp.location,
                    startDate: this._parseDate(exp.startDate),
                    endDate: this._parseDate(exp.endDate),
                    description: exp.description
                });
            }

            // Create education entries
            for (const edu of extractedData.education || []) {
                await INSERT.into(Educations).entries({
                    ID: uuidv4(),
                    candidate_ID: candidateId,
                    institution: edu.institution,
                    degree: edu.degree,
                    fieldOfStudy: edu.field,
                    startDate: this._parseDate(edu.startDate),
                    endDate: this._parseDate(edu.endDate),
                    grade: edu.grade
                });
            }

            // Link skills
            let linkedSkills = 0;
            if (autoLinkSkills && extractedData.skills) {
                for (const skill of extractedData.skills) {
                    const existingSkill = await SELECT.one.from(Skills)
                        .where({ name: { like: `%${skill.name}%` } });

                    if (existingSkill) {
                        await INSERT.into(CandidateSkills).entries({
                            ID: uuidv4(),
                            candidate_ID: candidateId,
                            skill_ID: existingSkill.ID,
                            source: 'extracted'
                        });
                        linkedSkills++;
                    } else {
                        warnings.push(`Skill not found in catalog: ${skill.name}`);
                    }
                }
            }

            return { candidateId, linkedSkills, warnings };

        } catch (error) {
            console.error('Create candidate error:', error);
            return { candidateId: null, linkedSkills: 0, warnings: [error.message] };
        }
    }

    /**
     * Get processing status
     */
    async handleGetStatus(req) {
        const { documentId } = req.data;
        const { CVDocuments } = this.entities;

        const document = await SELECT.one.from(CVDocuments)
            .columns('processingStatus', 'errorMessage')
            .where({ ID: documentId });

        if (!document) {
            return { status: 'not_found', progress: 0, currentStep: '', estimatedTime: 0 };
        }

        const statusMap = {
            'pending': { progress: 0, step: 'Waiting in queue', time: 30 },
            'processing': { progress: 50, step: 'Extracting data with AI', time: 15 },
            'completed': { progress: 100, step: 'Completed', time: 0 },
            'failed': { progress: 0, step: 'Failed', time: 0 }
        };

        const info = statusMap[document.processingStatus] || statusMap.pending;

        return {
            status: document.processingStatus,
            progress: info.progress,
            currentStep: info.step,
            estimatedTime: info.time
        };
    }

    /**
     * Get extracted data in structured format
     */
    async handleGetExtractedData(req) {
        const { documentId } = req.data;
        const { CVDocuments } = this.entities;

        const document = await SELECT.one.from(CVDocuments)
            .columns('extractedText', 'extractedData', 'ocrConfidence')
            .where({ ID: documentId });

        if (!document || !document.extractedData) {
            return null;
        }

        const data = JSON.parse(document.extractedData);

        return {
            personalInfo: JSON.stringify(data.personalInfo || {}),
            workExperience: JSON.stringify(data.workExperience || []),
            education: JSON.stringify(data.education || []),
            skills: JSON.stringify(data.skills || []),
            certifications: JSON.stringify(data.certifications || []),
            languages: JSON.stringify(data.languages || []),
            rawText: document.extractedText,
            confidence: document.ocrConfidence
        };
    }

    /**
     * Preview extraction without saving
     */
    async handlePreviewExtraction(req) {
        const { fileContent, fileType } = req.data;

        try {
            const result = await this._extractWithDocumentAI({
                fileContent: Buffer.from(fileContent, 'base64'),
                mediaType: fileType
            }, {});

            return {
                preview: JSON.stringify(result.structuredData),
                confidence: result.confidence,
                warnings: []
            };
        } catch (error) {
            return {
                preview: null,
                confidence: 0,
                warnings: [error.message]
            };
        }
    }

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    _parseName(fullName) {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 0) return { firstName: '', lastName: '' };
        if (parts.length === 1) return { firstName: parts[0], lastName: '' };
        return {
            firstName: parts[0],
            lastName: parts.slice(1).join(' ')
        };
    }

    _parseDate(dateStr) {
        if (!dateStr) return null;
        try {
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        } catch {
            return null;
        }
    }
};
