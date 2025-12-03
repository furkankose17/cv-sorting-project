'use strict';

const cds = require('@sap/cds');
const { createLogger } = require('../lib/logger');
const { ValidationError, ProcessingError, ExternalServiceError } = require('../lib/errors');

const LOG = createLogger('ocr-service');

/**
 * OCR Service Handler
 * Provides text extraction from CV documents using standard OCR
 *
 * Supported formats:
 * - PDF (text and scanned)
 * - Images (PNG, JPG, TIFF)
 * - DOCX, DOC
 */
class OCRService {

    /**
     * Supported MIME types for OCR processing
     */
    static SUPPORTED_TYPES = {
        'application/pdf': { extractor: 'pdf', name: 'PDF Document' },
        'image/png': { extractor: 'image', name: 'PNG Image' },
        'image/jpeg': { extractor: 'image', name: 'JPEG Image' },
        'image/tiff': { extractor: 'image', name: 'TIFF Image' },
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extractor: 'docx', name: 'Word Document' },
        'application/msword': { extractor: 'doc', name: 'Word Document (Legacy)' },
        'text/plain': { extractor: 'text', name: 'Plain Text' }
    };

    /**
     * CV Section patterns for extraction
     */
    static SECTION_PATTERNS = {
        personalInfo: {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            phone: /(?:\+?[\d]{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g,
            linkedin: /(?:linkedin\.com\/in\/|linkedin:?\s*)([a-zA-Z0-9-]+)/gi,
            github: /(?:github\.com\/|github:?\s*)([a-zA-Z0-9-]+)/gi
        },
        sections: {
            experience: /(?:work\s*)?experience|employment\s*history|professional\s*background|career\s*history/i,
            education: /education|academic|qualifications|degrees?|certifications?/i,
            skills: /skills?|competenc(?:y|ies)|technical\s*skills?|expertise|technologies/i,
            summary: /summary|profile|objective|about\s*me|professional\s*summary/i,
            languages: /languages?|language\s*skills?/i,
            projects: /projects?|portfolio|work\s*samples?/i,
            certifications: /certifications?|licenses?|accreditations?/i
        }
    };

    /**
     * Skill extraction patterns
     */
    static SKILL_PATTERNS = {
        // Programming Languages
        programming: /\b(?:JavaScript|TypeScript|Python|Java|C\+\+|C#|Go|Rust|Ruby|PHP|Swift|Kotlin|Scala|R|MATLAB|Perl|Shell|Bash|PowerShell|SQL|HTML|CSS|SASS|LESS)\b/gi,

        // Frameworks & Libraries
        frameworks: /\b(?:React|Angular|Vue\.?js?|Node\.?js?|Express|Django|Flask|Spring|\.NET|ASP\.NET|Rails|Laravel|Symfony|Next\.?js?|Nuxt\.?js?|Svelte|jQuery|Bootstrap|Tailwind|Material-UI)\b/gi,

        // Databases
        databases: /\b(?:MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|Cassandra|Oracle|SQL Server|SQLite|DynamoDB|CosmosDB|Neo4j|MariaDB|CouchDB)\b/gi,

        // Cloud & DevOps
        cloud: /\b(?:AWS|Azure|GCP|Google Cloud|Kubernetes|Docker|Terraform|Ansible|Jenkins|GitLab|GitHub Actions|CircleCI|Travis CI|Helm|Prometheus|Grafana)\b/gi,

        // SAP Technologies
        sap: /\b(?:SAP|ABAP|SAP HANA|S\/4HANA|SAP BTP|SAP CAP|SAP Fiori|SAPUI5|SAP Cloud Platform|SAP Integration Suite|CDS|OData)\b/gi,

        // Soft Skills (optional extraction)
        soft: /\b(?:leadership|communication|teamwork|problem[- ]solving|analytical|agile|scrum|project management|stakeholder management)\b/gi
    };

    /**
     * Initialize OCR service
     */
    constructor() {
        this.ocrEngine = null;
        this.initialized = false;
    }

    /**
     * Initialize the OCR engine
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // In production, this would initialize Tesseract.js or another OCR engine
            LOG.info('Initializing OCR engine');
            this.initialized = true;
            LOG.info('OCR engine initialized successfully');
        } catch (error) {
            LOG.error('Failed to initialize OCR engine', error);
            throw new ExternalServiceError('OCR engine initialization failed', 'OCR_INIT_FAILED');
        }
    }

    /**
     * Extract text from document
     * @param {Buffer} fileContent - Document binary content
     * @param {string} mediaType - MIME type of the document
     * @returns {Promise<{text: string, pages: number, confidence: number}>}
     */
    async extractText(fileContent, mediaType) {
        const timer = LOG.startTimer();

        if (!OCRService.SUPPORTED_TYPES[mediaType]) {
            throw new ValidationError(
                `Unsupported file type: ${mediaType}. Supported types: ${Object.keys(OCRService.SUPPORTED_TYPES).join(', ')}`,
                'UNSUPPORTED_FILE_TYPE'
            );
        }

        await this.initialize();

        try {
            const extractorType = OCRService.SUPPORTED_TYPES[mediaType].extractor;
            let result;

            switch (extractorType) {
                case 'pdf':
                    result = await this._extractFromPDF(fileContent);
                    break;
                case 'image':
                    result = await this._extractFromImage(fileContent);
                    break;
                case 'docx':
                    result = await this._extractFromDOCX(fileContent);
                    break;
                case 'doc':
                    result = await this._extractFromDOC(fileContent);
                    break;
                case 'text':
                    result = await this._extractFromText(fileContent);
                    break;
                default:
                    throw new ProcessingError(`No extractor for type: ${extractorType}`, 'NO_EXTRACTOR');
            }

            timer.end('Text extraction completed');
            return result;
        } catch (error) {
            LOG.error('Text extraction failed', error);
            if (error.code) throw error;
            throw new ProcessingError('Failed to extract text from document', 'EXTRACTION_FAILED');
        }
    }

    /**
     * Extract structured data from CV text
     * @param {string} text - Extracted text content
     * @returns {Promise<Object>} Structured CV data
     */
    async extractCVData(text) {
        const timer = LOG.startTimer();

        try {
            const result = {
                personalInfo: this._extractPersonalInfo(text),
                summary: this._extractSection(text, 'summary'),
                experience: this._extractExperiences(text),
                education: this._extractEducation(text),
                skills: this._extractSkills(text),
                languages: this._extractLanguages(text),
                certifications: this._extractCertifications(text),
                rawText: text,
                extractionConfidence: 0,
                extractedAt: new Date().toISOString()
            };

            // Calculate overall confidence
            result.extractionConfidence = this._calculateConfidence(result);

            timer.end('CV data extraction completed');
            return result;
        } catch (error) {
            LOG.error('CV data extraction failed', error);
            throw new ProcessingError('Failed to extract structured data from CV', 'CV_EXTRACTION_FAILED');
        }
    }

    /**
     * Full document processing pipeline
     * @param {Buffer} fileContent - Document binary content
     * @param {string} mediaType - MIME type
     * @param {Object} options - Processing options
     */
    async processDocument(fileContent, mediaType, options = {}) {
        const timer = LOG.startTimer();

        LOG.info('Starting document processing', { mediaType, options });

        // Step 1: Extract raw text
        const textResult = await this.extractText(fileContent, mediaType);

        // Step 2: Extract structured data
        const cvData = await this.extractCVData(textResult.text);

        // Step 3: Enrich with additional processing
        if (options.enrichSkills !== false) {
            cvData.skills = await this._enrichSkills(cvData.skills);
        }

        timer.end('Document processing completed');

        return {
            success: true,
            extractedData: cvData,
            metadata: {
                pageCount: textResult.pages,
                textConfidence: textResult.confidence,
                dataConfidence: cvData.extractionConfidence,
                processingTime: timer.duration,
                mediaType
            }
        };
    }

    // ============================================
    // PRIVATE EXTRACTION METHODS
    // ============================================

    async _extractFromPDF(content) {
        // In production: use pdf-parse or pdf.js
        // For now, simulate extraction
        LOG.debug('Extracting text from PDF');

        // Simulate PDF text extraction
        const text = content.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');

        return {
            text: text.trim() || '[PDF content - requires pdf-parse library]',
            pages: 1,
            confidence: 0.85
        };
    }

    async _extractFromImage(content) {
        // In production: use Tesseract.js
        LOG.debug('Extracting text from image using OCR');

        // Simulate OCR extraction
        return {
            text: '[Image content - requires tesseract.js library]',
            pages: 1,
            confidence: 0.75
        };
    }

    async _extractFromDOCX(content) {
        // In production: use mammoth or docx library
        LOG.debug('Extracting text from DOCX');

        return {
            text: '[DOCX content - requires mammoth library]',
            pages: 1,
            confidence: 0.95
        };
    }

    async _extractFromDOC(content) {
        // In production: use word-extractor
        LOG.debug('Extracting text from DOC');

        return {
            text: '[DOC content - requires word-extractor library]',
            pages: 1,
            confidence: 0.90
        };
    }

    async _extractFromText(content) {
        LOG.debug('Processing plain text');

        return {
            text: content.toString('utf-8'),
            pages: 1,
            confidence: 1.0
        };
    }

    _extractPersonalInfo(text) {
        const info = {
            email: null,
            phone: null,
            linkedin: null,
            github: null,
            name: null,
            location: null
        };

        // Extract email
        const emailMatch = text.match(OCRService.SECTION_PATTERNS.personalInfo.email);
        if (emailMatch) {
            info.email = emailMatch[0].toLowerCase();
        }

        // Extract phone
        const phoneMatch = text.match(OCRService.SECTION_PATTERNS.personalInfo.phone);
        if (phoneMatch) {
            info.phone = phoneMatch[0].replace(/\s+/g, '');
        }

        // Extract LinkedIn
        const linkedinMatch = text.match(OCRService.SECTION_PATTERNS.personalInfo.linkedin);
        if (linkedinMatch) {
            info.linkedin = linkedinMatch[1] || linkedinMatch[0];
        }

        // Extract GitHub
        const githubMatch = text.match(OCRService.SECTION_PATTERNS.personalInfo.github);
        if (githubMatch) {
            info.github = githubMatch[1] || githubMatch[0];
        }

        // Try to extract name from first few lines
        const lines = text.split('\n').slice(0, 5);
        for (const line of lines) {
            const cleanLine = line.trim();
            // Name detection heuristic: 2-4 words, capitalized, no special chars
            if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(cleanLine)) {
                info.name = cleanLine;
                break;
            }
        }

        return info;
    }

    _extractSection(text, sectionType) {
        const pattern = OCRService.SECTION_PATTERNS.sections[sectionType];
        if (!pattern) return null;

        const lines = text.split('\n');
        let inSection = false;
        let sectionContent = [];
        let nextSectionPattern = Object.values(OCRService.SECTION_PATTERNS.sections)
            .filter(p => p !== pattern);

        for (const line of lines) {
            if (pattern.test(line)) {
                inSection = true;
                continue;
            }

            if (inSection) {
                // Check if we've hit another section
                if (nextSectionPattern.some(p => p.test(line))) {
                    break;
                }
                if (line.trim()) {
                    sectionContent.push(line.trim());
                }
            }
        }

        return sectionContent.join('\n') || null;
    }

    _extractExperiences(text) {
        const experiences = [];
        const experienceSection = this._extractSection(text, 'experience');

        if (!experienceSection) return experiences;

        // Pattern for job entries
        const jobPattern = /(?:^|\n)(.+?)\s*(?:at|@|-|,)\s*(.+?)(?:\s*\(|\s*[-–]\s*)(\d{4}|\w+\s+\d{4})(?:\s*[-–]\s*)(present|\d{4}|\w+\s+\d{4})?/gi;

        let match;
        while ((match = jobPattern.exec(experienceSection)) !== null) {
            experiences.push({
                title: match[1]?.trim(),
                company: match[2]?.trim(),
                startDate: match[3]?.trim(),
                endDate: match[4]?.trim() || 'Present',
                description: null
            });
        }

        return experiences;
    }

    _extractEducation(text) {
        const education = [];
        const educationSection = this._extractSection(text, 'education');

        if (!educationSection) return education;

        // Pattern for education entries
        const eduPattern = /(?:^|\n)(Bachelor|Master|PhD|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|MBA|Doctor).+?(?:in|of)?\s*(.+?)(?:\s*[-–,]\s*)(.+?)(?:\s*\(|\s*[-–]\s*)(\d{4})/gi;

        let match;
        while ((match = eduPattern.exec(educationSection)) !== null) {
            education.push({
                degree: match[1]?.trim(),
                field: match[2]?.trim(),
                institution: match[3]?.trim(),
                year: match[4]?.trim()
            });
        }

        return education;
    }

    _extractSkills(text) {
        const skills = new Set();

        // Extract skills using patterns
        for (const [category, pattern] of Object.entries(OCRService.SKILL_PATTERNS)) {
            const matches = text.match(pattern);
            if (matches) {
                matches.forEach(skill => {
                    skills.add({
                        name: skill.trim(),
                        category: category,
                        confidence: 0.9
                    });
                });
            }
        }

        // Also check skills section for custom skills
        const skillsSection = this._extractSection(text, 'skills');
        if (skillsSection) {
            // Split by common delimiters
            const customSkills = skillsSection.split(/[,;•|\n]+/);
            customSkills.forEach(skill => {
                const cleanSkill = skill.trim();
                if (cleanSkill.length > 1 && cleanSkill.length < 50) {
                    skills.add({
                        name: cleanSkill,
                        category: 'custom',
                        confidence: 0.7
                    });
                }
            });
        }

        return Array.from(skills);
    }

    _extractLanguages(text) {
        const languages = [];
        const languageSection = this._extractSection(text, 'languages');

        if (!languageSection) return languages;

        // Common language pattern
        const langPattern = /\b(English|German|French|Spanish|Chinese|Mandarin|Japanese|Korean|Arabic|Portuguese|Italian|Russian|Dutch|Turkish|Hindi|Polish)\b\s*[-–:]?\s*(Native|Fluent|Advanced|Intermediate|Basic|C1|C2|B1|B2|A1|A2)?/gi;

        let match;
        while ((match = langPattern.exec(languageSection)) !== null) {
            languages.push({
                language: match[1],
                level: match[2] || 'Not specified'
            });
        }

        return languages;
    }

    _extractCertifications(text) {
        const certifications = [];
        const certSection = this._extractSection(text, 'certifications');

        if (!certSection) return certifications;

        // Common certification patterns
        const certPatterns = [
            /(?:AWS|Amazon).+?(?:Certified|Certificate)/gi,
            /(?:Azure|Microsoft).+?(?:Certified|Certificate)/gi,
            /(?:Google|GCP).+?(?:Certified|Certificate)/gi,
            /SAP.+?(?:Certified|Certificate)/gi,
            /PMP|PRINCE2|Scrum Master|ITIL/gi,
            /CISSP|CISM|CEH|Security\+/gi
        ];

        certPatterns.forEach(pattern => {
            const matches = certSection.match(pattern);
            if (matches) {
                matches.forEach(cert => {
                    certifications.push({
                        name: cert.trim(),
                        issuer: null,
                        date: null
                    });
                });
            }
        });

        return certifications;
    }

    async _enrichSkills(skills) {
        // In production, this would:
        // 1. Normalize skill names
        // 2. Map to skill taxonomy
        // 3. Infer related skills
        return skills.map(skill => ({
            ...skill,
            normalized: skill.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
            isVerified: false
        }));
    }

    _calculateConfidence(result) {
        let score = 0;
        let factors = 0;

        // Personal info confidence
        if (result.personalInfo.email) { score += 0.2; factors++; }
        if (result.personalInfo.name) { score += 0.15; factors++; }
        if (result.personalInfo.phone) { score += 0.1; factors++; }

        // Content confidence
        if (result.experience.length > 0) { score += 0.2; factors++; }
        if (result.education.length > 0) { score += 0.15; factors++; }
        if (result.skills.length > 0) { score += 0.15; factors++; }
        if (result.summary) { score += 0.05; factors++; }

        return factors > 0 ? Math.min(score / factors * 100, 100) : 0;
    }
}

// Create singleton instance
const ocrService = new OCRService();

/**
 * CAP Service Handler Registration
 */
module.exports = function(srv) {
    const { Documents, DocumentUploads } = srv.entities;

    /**
     * Process document action
     */
    srv.on('process', Documents, async (req) => {
        const { ID } = req.params[0];
        const { options } = req.data;

        LOG.info('Processing document', { documentId: ID });

        const tx = cds.tx(req);
        const doc = await tx.run(
            SELECT.one.from('cv.sorting.CVDocuments')
                .columns('fileContent', 'mediaType', 'processingStatus')
                .where({ ID })
        );

        if (!doc) {
            throw new ValidationError('Document not found', 'DOCUMENT_NOT_FOUND');
        }

        if (!doc.fileContent) {
            throw new ValidationError('Document has no content', 'NO_CONTENT');
        }

        try {
            // Update status to processing
            await tx.run(
                UPDATE('cv.sorting.CVDocuments')
                    .set({ processingStatus: 'processing' })
                    .where({ ID })
            );

            // Process the document
            const result = await ocrService.processDocument(
                doc.fileContent,
                doc.mediaType,
                options ? JSON.parse(options) : {}
            );

            // Update document with results
            await tx.run(
                UPDATE('cv.sorting.CVDocuments')
                    .set({
                        processingStatus: 'completed',
                        extractedData: JSON.stringify(result.extractedData),
                        confidence: result.metadata.dataConfidence,
                        processedAt: new Date().toISOString()
                    })
                    .where({ ID })
            );

            return {
                success: true,
                confidence: result.metadata.dataConfidence,
                extractedData: JSON.stringify(result.extractedData),
                processingTime: result.metadata.processingTime
            };
        } catch (error) {
            await tx.run(
                UPDATE('cv.sorting.CVDocuments')
                    .set({
                        processingStatus: 'failed',
                        errorMessage: error.message
                    })
                    .where({ ID })
            );
            throw error;
        }
    });

    /**
     * Upload and process document
     */
    srv.on('uploadDocument', async (req) => {
        const { fileName, fileContent, mediaType, candidateId } = req.data;

        LOG.info('Uploading document', { fileName, mediaType, candidateId });

        const tx = cds.tx(req);

        // Create document record
        const docId = cds.utils.uuid();
        await tx.run(
            INSERT.into('cv.sorting.CVDocuments').entries({
                ID: docId,
                candidate_ID: candidateId,
                fileName,
                mediaType,
                fileContent,
                fileSize: fileContent?.length || 0,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user?.id,
                processingStatus: 'pending',
                isActive: true
            })
        );

        return {
            documentId: docId,
            processingStatus: 'pending',
            message: 'Document uploaded successfully. Call process action to extract data.'
        };
    });

    /**
     * Preview extraction without saving
     */
    srv.on('previewExtraction', async (req) => {
        const { fileContent, mediaType } = req.data;

        const result = await ocrService.processDocument(fileContent, mediaType, {
            enrichSkills: false
        });

        return {
            extractedData: JSON.stringify(result.extractedData),
            confidence: result.metadata.dataConfidence,
            warnings: []
        };
    });

    /**
     * Create candidate from document
     */
    srv.on('createCandidateFromDocument', async (req) => {
        const { documentId, additionalData, autoLinkSkills } = req.data;

        const tx = cds.tx(req);

        // Get document with extracted data
        const doc = await tx.run(
            SELECT.one.from('cv.sorting.CVDocuments')
                .where({ ID: documentId, processingStatus: 'completed' })
        );

        if (!doc) {
            throw new ValidationError(
                'Document not found or not processed',
                'DOCUMENT_NOT_PROCESSED'
            );
        }

        const extractedData = JSON.parse(doc.extractedData || '{}');
        const additionalInfo = additionalData ? JSON.parse(additionalData) : {};
        const warnings = [];

        // Create candidate
        const candidateId = cds.utils.uuid();
        const candidateData = {
            ID: candidateId,
            firstName: additionalInfo.firstName || extractedData.personalInfo?.name?.split(' ')[0] || 'Unknown',
            lastName: additionalInfo.lastName || extractedData.personalInfo?.name?.split(' ').slice(1).join(' ') || 'Unknown',
            email: additionalInfo.email || extractedData.personalInfo?.email,
            phone: extractedData.personalInfo?.phone,
            linkedInUrl: extractedData.personalInfo?.linkedin,
            githubUrl: extractedData.personalInfo?.github,
            summary: extractedData.summary,
            status_code: 'new',
            source: 'cv-upload',
            createdAt: new Date().toISOString(),
            createdBy: req.user?.id
        };

        if (!candidateData.email) {
            warnings.push('No email found in document');
        }

        await tx.run(INSERT.into('cv.sorting.Candidates').entries(candidateData));

        // Link document to candidate
        await tx.run(
            UPDATE('cv.sorting.CVDocuments')
                .set({ candidate_ID: candidateId })
                .where({ ID: documentId })
        );

        // Link skills if requested
        let linkedSkillsCount = 0;
        if (autoLinkSkills && extractedData.skills?.length > 0) {
            // Get existing skills from database
            const existingSkills = await tx.run(SELECT.from('cv.sorting.Skills'));
            const skillMap = new Map(existingSkills.map(s => [s.name.toLowerCase(), s.ID]));

            for (const skill of extractedData.skills) {
                const skillId = skillMap.get(skill.name.toLowerCase());
                if (skillId) {
                    await tx.run(
                        INSERT.into('cv.sorting.CandidateSkills').entries({
                            ID: cds.utils.uuid(),
                            candidate_ID: candidateId,
                            skill_ID: skillId,
                            proficiencyLevel: 'intermediate',
                            isFromCV: true
                        })
                    );
                    linkedSkillsCount++;
                }
            }
        }

        return {
            candidateId,
            linkedSkillsCount,
            warnings
        };
    });

    /**
     * Reprocess document
     */
    srv.on('reprocess', Documents, async (req) => {
        const { ID } = req.params[0];

        const tx = cds.tx(req);

        // Reset processing status
        await tx.run(
            UPDATE('cv.sorting.CVDocuments')
                .set({
                    processingStatus: 'pending',
                    extractedData: null,
                    confidence: null,
                    processedAt: null,
                    errorMessage: null
                })
                .where({ ID })
        );

        return SELECT.one.from('cv.sorting.CVDocuments').where({ ID });
    });
};

// Export OCR service for direct use
module.exports.OCRService = OCRService;
module.exports.ocrService = ocrService;
