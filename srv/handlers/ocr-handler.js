/**
 * OCR Processing Handlers
 */
const cds = require('@sap/cds');
const { createMLClient } = require('../lib/ml-client');

const SUPPORTED_FORMATS = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Upload and process single CV with OCR
 */
async function uploadAndProcessCV(req) {
    const { fileName, fileContent, mediaType, autoCreate } = req.data;
    const LOG = cds.log('ocr-handler');

    // Validate file format
    if (!SUPPORTED_FORMATS.includes(mediaType)) {
        req.reject(400, `Unsupported file format: ${mediaType}. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
    }

    // Validate file size
    if (fileContent.length > MAX_FILE_SIZE) {
        req.reject(400, `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const db = await cds.connect.to('db');
    const { CVDocuments, Candidates } = db.entities('cv.sorting');

    let documentId;

    try {
        // Create document record
        documentId = cds.utils.uuid();
        await INSERT.into(CVDocuments).entries({
            ID: documentId,
            fileName,
            mediaType,
            fileContent,
            uploadedBy: req.user.id,
            ocrStatus: 'processing'
        });

        LOG.info(`Created document ${documentId}, starting OCR...`);

        // Convert to base64 for ML service
        const fileContentB64 = fileContent.toString('base64');
        const fileType = mediaType.split('/')[1];

        // Call ML service
        const mlClient = createMLClient();
        const ocrResult = await mlClient.processOCRWithStructured({
            fileContent: fileContentB64,
            fileType,
            language: 'en'
        });

        LOG.info(`OCR completed with confidence: ${ocrResult.confidence}%`);

        // Prepare extracted data with structured info and lines for PDF highlighting
        const extractedDataObj = {
            ...(ocrResult.structured_data || {}),
            lines: ocrResult.lines || [],  // Lines with bounding boxes for highlighting
            preview_image: ocrResult.preview_image || null,  // Base64 first page for overlay
            preview_dimensions: ocrResult.preview_dimensions || null,  // Image dimensions
            pages: ocrResult.pages,
            method: ocrResult.method
        };

        // Update document with OCR results
        await UPDATE(CVDocuments)
            .set({
                extractedText: ocrResult.text,
                extractedData: JSON.stringify(extractedDataObj),  // Store in extractedData for CVReview
                structuredData: JSON.stringify(ocrResult.structured_data),
                ocrConfidence: ocrResult.confidence,
                ocrMethod: ocrResult.method,
                ocrStatus: 'completed',
                ocrProcessedAt: new Date()
            })
            .where({ ID: documentId });

        // Check if auto-create threshold met
        const threshold = 85.0;
        let candidateId = null;
        let requiresReview = true;

        if (autoCreate && ocrResult.confidence >= threshold) {
            // Auto-create candidate
            candidateId = await createCandidateFromExtraction(
                ocrResult.structured_data,
                documentId,
                db
            );
            requiresReview = false;
            LOG.info(`Auto-created candidate ${candidateId}`);
        } else if (ocrResult.confidence < threshold) {
            // Mark for review
            await UPDATE(CVDocuments)
                .set({ ocrStatus: 'review_required' })
                .where({ ID: documentId });
            LOG.info(`Document requires review (confidence: ${ocrResult.confidence}%)`);
        }

        return {
            documentId,
            ocrStatus: requiresReview ? 'review_required' : 'completed',
            confidence: ocrResult.confidence,
            extractedData: JSON.stringify(ocrResult.structured_data),
            candidateId,
            requiresReview
        };

    } catch (error) {
        LOG.error(`OCR processing failed: ${error.message}`);

        // Update document with error status if it was created
        if (documentId) {
            await UPDATE(CVDocuments)
                .set({ ocrStatus: 'failed' })
                .where({ ID: documentId });
        }

        req.error(500, `OCR processing failed: ${error.message}`);
    }
}

/**
 * Create candidate from structured extraction data
 */
async function createCandidateFromExtraction(structuredData, documentId, db) {
    const { Candidates, CVDocuments } = db.entities('cv.sorting');
    const tier1 = structuredData.tier1 || {};

    const candidateId = cds.utils.uuid();
    await INSERT.into(Candidates).entries({
        ID: candidateId,
        firstName: tier1.firstName?.value,
        lastName: tier1.lastName?.value,
        email: tier1.email?.value,
        phone: tier1.phone?.value,
        city: tier1.location?.value?.split(',')[0]?.trim(),
        country: tier1.location?.value?.split(',')[1]?.trim(),
        status_code: 'new'
    });

    // Link document to candidate
    await UPDATE(CVDocuments)
        .set({ candidate_ID: candidateId })
        .where({ ID: documentId });

    return candidateId;
}

/**
 * Upload batch of CVs for processing
 */
async function uploadBatchCVs(req) {
    const { files, autoCreateThreshold } = req.data;
    const LOG = cds.log('ocr-handler');

    if (!files || files.length === 0) {
        req.reject(400, 'No files provided');
    }

    const db = await cds.connect.to('db');
    const { ProcessingQueue } = db.entities('cv.sorting');

    // Create queue record
    const queueId = cds.utils.uuid();
    await INSERT.into(ProcessingQueue).entries({
        ID: queueId,
        userId: req.user.id,
        status: 'queued',
        totalFiles: files.length,
        processedCount: 0,
        autoCreatedCount: 0,
        reviewRequiredCount: 0,
        failedCount: 0,
        autoCreateThreshold: autoCreateThreshold || 85.0,
        startedAt: new Date()
    });

    LOG.info(`Created batch queue ${queueId} with ${files.length} files`);

    // Process files sequentially in background
    setImmediate(() => processBatchQueue(queueId, files, autoCreateThreshold, req.user.id));

    // Estimate time (8 seconds per file)
    const estimatedTime = files.length * 8;

    return {
        queueId,
        totalFiles: files.length,
        estimatedTime
    };
}

/**
 * Process batch queue sequentially
 */
async function processBatchQueue(queueId, files, autoCreateThreshold, userId) {
    const LOG = cds.log('batch-processor');
    const db = await cds.connect.to('db');
    const { ProcessingQueue } = db.entities('cv.sorting');

    await UPDATE(ProcessingQueue)
        .set({ status: 'processing' })
        .where({ ID: queueId });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        LOG.info(`Processing file ${i + 1}/${files.length}: ${file.fileName}`);

        await UPDATE(ProcessingQueue)
            .set({ currentFile: file.fileName })
            .where({ ID: queueId });

        try {
            // Create mock request for uploadAndProcessCV
            const mockReq = {
                data: {
                    fileName: file.fileName,
                    fileContent: file.fileContent,
                    mediaType: file.mediaType,
                    autoCreate: true
                },
                user: { id: userId },
                reject: (code, msg) => { throw new Error(msg); },
                error: (code, msg) => { throw new Error(msg); }
            };

            const result = await uploadAndProcessCV(mockReq);

            // Update queue counters
            const updates = { processedCount: i + 1 };
            if (result.candidateId) {
                const queue = await SELECT.one.from(ProcessingQueue).where({ ID: queueId });
                updates.autoCreatedCount = (queue?.autoCreatedCount || 0) + 1;
            } else if (result.requiresReview) {
                const queue = await SELECT.one.from(ProcessingQueue).where({ ID: queueId });
                updates.reviewRequiredCount = (queue?.reviewRequiredCount || 0) + 1;
            }

            await UPDATE(ProcessingQueue).set(updates).where({ ID: queueId });

        } catch (error) {
            LOG.error(`Failed to process ${file.fileName}: ${error.message}`);

            const queue = await SELECT.one.from(ProcessingQueue).where({ ID: queueId });
            await UPDATE(ProcessingQueue)
                .set({
                    failedCount: (queue?.failedCount || 0) + 1,
                    processedCount: i + 1
                })
                .where({ ID: queueId });
        }
    }

    // Mark queue as completed
    await UPDATE(ProcessingQueue)
        .set({
            status: 'completed',
            completedAt: new Date(),
            currentFile: null
        })
        .where({ ID: queueId });

    LOG.info(`Batch queue ${queueId} completed`);
}

/**
 * Get batch processing progress
 */
async function getBatchProgress(req) {
    const { queueId } = req.data;
    const db = await cds.connect.to('db');

    const queue = await SELECT.one.from('cv.sorting.ProcessingQueue')
        .where({ ID: queueId });

    if (!queue) {
        req.reject(404, `Queue ${queueId} not found`);
    }

    // Calculate estimated time remaining
    let estimatedTimeRemaining = 0;
    if (queue.status === 'processing') {
        const remaining = queue.totalFiles - queue.processedCount;
        estimatedTimeRemaining = remaining * 8; // 8 seconds per file
    }

    return {
        status: queue.status,
        totalFiles: queue.totalFiles,
        processed: queue.processedCount,
        autoCreated: queue.autoCreatedCount,
        reviewRequired: queue.reviewRequiredCount,
        failed: queue.failedCount,
        currentFile: queue.currentFile,
        estimatedTimeRemaining
    };
}

/**
 * Review and create candidate from low-confidence extraction
 */
async function reviewAndCreateCandidate(req) {
    const { documentId, editedData } = req.data;
    const LOG = cds.log('ocr-handler');

    const db = await cds.connect.to('db');
    const { CVDocuments, Candidates, CandidateSkills, Skills, WorkExperiences, Educations } = db.entities('cv.sorting');

    try {
        // Get document
        const document = await SELECT.one.from(CVDocuments)
            .where({ ID: documentId });

        if (!document) {
            req.reject(404, `Document ${documentId} not found`);
        }

        // Parse edited data
        const extractedData = JSON.parse(editedData);
        const tier1 = extractedData.tier1 || {};
        const tier2 = extractedData.tier2 || {};

        // Create candidate
        const candidateId = cds.utils.uuid();

        // Parse location: "San Francisco, CA, USA" -> city="San Francisco", country_code="US"
        const locationParts = (tier1.location?.value || '').split(',').map(p => p.trim());
        const city = locationParts[0] || null;
        // Map common country names to ISO codes
        const countryMapping = { 'USA': 'US', 'United States': 'US', 'UK': 'GB', 'United Kingdom': 'GB' };
        const rawCountry = locationParts[locationParts.length - 1] || null;
        const country_code = countryMapping[rawCountry] || (rawCountry?.length === 2 ? rawCountry : null);

        await INSERT.into(Candidates).entries({
            ID: candidateId,
            firstName: tier1.firstName?.value,
            lastName: tier1.lastName?.value,
            email: tier1.email?.value,
            phone: tier1.phone?.value,
            city: city,
            country_code: country_code,
            status_code: 'new'
        });

        LOG.info(`Created candidate ${candidateId} from reviewed document ${documentId}`);

        // Link document to candidate
        await UPDATE(CVDocuments)
            .set({
                candidate_ID: candidateId,
                ocrStatus: 'completed',
                reviewedBy: req.user?.id || 'system',
                reviewedAt: new Date()
            })
            .where({ ID: documentId });

        // Save work experiences
        const workHistory = tier2.workHistory || [];
        for (const job of workHistory) {
            const startYear = job.startDate?.value;
            const endYear = job.endDate?.value;
            const isCurrent = endYear?.toLowerCase() === 'present' || !endYear;

            await INSERT.into(WorkExperiences).entries({
                ID: cds.utils.uuid(),
                candidate_ID: candidateId,
                companyName: job.company?.value || 'Unknown',
                jobTitle: job.jobTitle?.value || 'Unknown',
                startDate: startYear ? `${startYear}-01-01` : null,
                endDate: isCurrent ? null : (endYear ? `${endYear}-12-31` : null),
                isCurrent: isCurrent,
                description: job.responsibilities?.value || ''
            });
        }
        LOG.info(`Saved ${workHistory.length} work experiences for candidate ${candidateId}`);

        // Save education
        const education = tier2.education || [];
        for (const edu of education) {
            const gradYear = edu.graduationYear?.value;

            await INSERT.into(Educations).entries({
                ID: cds.utils.uuid(),
                candidate_ID: candidateId,
                institution: edu.institution?.value || 'Unknown',
                degree: edu.degree?.value || '',
                fieldOfStudy: edu.fieldOfStudy?.value || '',
                endDate: gradYear ? `${gradYear}-06-30` : null
            });
        }
        LOG.info(`Saved ${education.length} education entries for candidate ${candidateId}`);

        // Save skills - find or create skill, then link to candidate
        let linkedSkillsCount = 0;
        const skills = tier2.skills || [];
        for (const skillData of skills) {
            const skillName = skillData.name?.value;
            if (!skillName) continue;

            const normalizedName = skillName.toLowerCase().trim();

            // Find existing skill or create new one
            let skill = await SELECT.one.from(Skills)
                .where({ normalizedName: normalizedName });

            if (!skill) {
                const skillId = cds.utils.uuid();
                await INSERT.into(Skills).entries({
                    ID: skillId,
                    name: skillName,
                    normalizedName: normalizedName,
                    isActive: true,
                    usageCount: 1
                });
                skill = { ID: skillId };
                LOG.info(`Created new skill: ${skillName}`);
            } else {
                // Increment usage count
                await UPDATE(Skills)
                    .set({ usageCount: (skill.usageCount || 0) + 1 })
                    .where({ ID: skill.ID });
            }

            // Link skill to candidate
            await INSERT.into(CandidateSkills).entries({
                ID: cds.utils.uuid(),
                candidate_ID: candidateId,
                skill_ID: skill.ID,
                proficiencyLevel: 'intermediate',
                source: 'extracted',
                confidenceScore: skillData.name?.confidence || 90
            });
            linkedSkillsCount++;
        }
        LOG.info(`Linked ${linkedSkillsCount} skills to candidate ${candidateId}`);

        // Generate embedding for semantic search
        let embeddingGenerated = false;
        try {
            const mlClient = createMLClient();

            // Build text content for embedding
            const skillsText = skills.map(s => s.name?.value).filter(Boolean).join(', ');
            const experienceText = workHistory.map(job =>
                `${job.jobTitle?.value || ''} at ${job.company?.value || ''}: ${job.responsibilities?.value || ''}`
            ).join('\n');

            // Use CV extracted text as main content
            const textContent = document.extractedText || `${tier1.firstName?.value || ''} ${tier1.lastName?.value || ''} - ${skillsText}`;

            if (textContent && textContent.length >= 10) {
                const embeddingResult = await mlClient.generateEmbedding({
                    entityType: 'candidate',
                    entityId: candidateId,
                    textContent: textContent,
                    skillsText: skillsText,
                    experienceText: experienceText
                });

                if (embeddingResult && embeddingResult.stored) {
                    embeddingGenerated = true;
                    LOG.info(`Generated embedding for candidate ${candidateId}`);
                }
            } else {
                LOG.warn(`Insufficient text content for embedding generation (length: ${textContent?.length || 0})`);
            }
        } catch (embeddingError) {
            LOG.warn(`Failed to generate embedding for candidate ${candidateId}: ${embeddingError.message}`);
            // Don't fail the whole operation if embedding generation fails
        }

        return {
            candidateId,
            linkedSkillsCount,
            embeddingGenerated
        };

    } catch (error) {
        LOG.error(`Failed to create candidate from document ${documentId}: ${error.message}`);
        req.error(500, `Failed to create candidate: ${error.message}`);
    }
}

module.exports = {
    uploadAndProcessCV,
    uploadBatchCVs,
    getBatchProgress,
    reviewAndCreateCandidate,
    createCandidateFromExtraction
};
