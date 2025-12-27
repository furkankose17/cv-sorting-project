'use strict';

const cds = require('@sap/cds');
const { createLogger } = require('../lib/logger');
const { ValidationError, ProcessingError, ExternalServiceError } = require('../lib/errors');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

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

    /**
     * Extract text from PDF using pdf-parse library
     * Handles both text-based and scanned PDFs
     */
    async _extractFromPDF(content) {
        LOG.debug('Extracting text from PDF using pdf-parse');

        try {
            const options = {
                max: 0, // Parse all pages
                version: 'default'
            };

            const data = await pdfParse(content, options);

            const extractedText = data.text.trim();
            const pageCount = data.numpages || 1;

            // If no text was extracted, PDF might be scanned (image-based)
            if (!extractedText || extractedText.length < 50) {
                LOG.warn('PDF appears to be scanned or has minimal text. OCR may be needed.');

                return {
                    text: extractedText || '[PDF contains no extractable text - may require OCR]',
                    pages: pageCount,
                    confidence: 0.5,
                    isScanned: true,
                    metadata: {
                        info: data.info,
                        version: data.version
                    }
                };
            }

            LOG.info('PDF text extraction successful', {
                pages: pageCount,
                textLength: extractedText.length
            });

            return {
                text: extractedText,
                pages: pageCount,
                confidence: 0.95, // High confidence for text-based PDFs
                isScanned: false,
                metadata: {
                    info: data.info,
                    version: data.version,
                    title: data.info?.Title,
                    author: data.info?.Author,
                    creationDate: data.info?.CreationDate
                }
            };

        } catch (error) {
            LOG.error('PDF extraction failed', error);

            // Try fallback: basic text extraction
            try {
                const fallbackText = content.toString('utf-8')
                    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
                    .trim();

                if (fallbackText.length > 50) {
                    LOG.warn('Using fallback text extraction for PDF');
                    return {
                        text: fallbackText,
                        pages: 1,
                        confidence: 0.6,
                        usedFallback: true
                    };
                }
            } catch (fallbackError) {
                LOG.error('Fallback extraction also failed', fallbackError);
            }

            throw new ProcessingError(
                `Failed to extract text from PDF: ${error.message}`,
                'PDF_EXTRACTION_FAILED'
            );
        }
    }

    /**
     * Extract text from image using Tesseract.js OCR
     * Supports PNG, JPG, TIFF formats
     */
    async _extractFromImage(content) {
        LOG.debug('Extracting text from image using Tesseract.js OCR');

        try {
            const startTime = Date.now();

            // Create Tesseract worker
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        LOG.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });

            // Perform OCR
            const { data } = await worker.recognize(content);

            await worker.terminate();

            const processingTime = Date.now() - startTime;
            const extractedText = data.text.trim();

            LOG.info('Image OCR completed', {
                textLength: extractedText.length,
                confidence: data.confidence,
                processingTime: `${processingTime}ms`
            });

            return {
                text: extractedText,
                pages: 1,
                confidence: data.confidence / 100, // Convert 0-100 to 0-1
                metadata: {
                    processingTime,
                    words: data.words?.length || 0,
                    lines: data.lines?.length || 0
                }
            };

        } catch (error) {
            LOG.error('Image OCR failed', error);

            throw new ProcessingError(
                `Failed to perform OCR on image: ${error.message}`,
                'IMAGE_OCR_FAILED'
            );
        }
    }

    /**
     * Extract text from DOCX using mammoth library
     * Converts Word document to plain text
     */
    async _extractFromDOCX(content) {
        LOG.debug('Extracting text from DOCX using mammoth');

        try {
            const result = await mammoth.extractRawText({ buffer: content });

            const extractedText = result.value.trim();

            if (result.messages && result.messages.length > 0) {
                LOG.debug('DOCX extraction messages', { messages: result.messages });
            }

            LOG.info('DOCX text extraction successful', {
                textLength: extractedText.length,
                messageCount: result.messages?.length || 0
            });

            return {
                text: extractedText,
                pages: 1, // DOCX doesn't have distinct pages in extracted text
                confidence: 0.98, // High confidence for DOCX
                metadata: {
                    messages: result.messages,
                    hasWarnings: result.messages?.some(m => m.type === 'warning')
                }
            };

        } catch (error) {
            LOG.error('DOCX extraction failed', error);

            throw new ProcessingError(
                `Failed to extract text from DOCX: ${error.message}`,
                'DOCX_EXTRACTION_FAILED'
            );
        }
    }

    /**
     * Extract text from legacy DOC format
     * Note: This format is complex and may require additional libraries
     * Recommend users convert to DOCX for better results
     */
    async _extractFromDOC(content) {
        LOG.warn('Legacy DOC format detected. Recommend converting to DOCX for better results.');

        // Note: The word-extractor library could be added for DOC support
        // For now, we'll attempt basic extraction or recommend conversion

        try {
            // Attempt basic text extraction (may not work well for complex DOC files)
            const text = content.toString('utf-8')
                .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (text.length > 100) {
                LOG.info('Basic DOC extraction successful', { textLength: text.length });
                return {
                    text,
                    pages: 1,
                    confidence: 0.5, // Low confidence due to basic extraction
                    warning: 'Legacy DOC format. For better results, please convert to DOCX.'
                };
            }

            // If basic extraction failed, return helpful message
            throw new ProcessingError(
                'Legacy DOC format requires conversion to DOCX. Please save your document as .docx format for optimal text extraction.',
                'DOC_FORMAT_NOT_SUPPORTED'
            );

        } catch (error) {
            LOG.error('DOC extraction failed', error);

            throw new ProcessingError(
                'Failed to extract text from DOC file. Please convert to DOCX format and try again.',
                'DOC_EXTRACTION_FAILED'
            );
        }
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

        const matches = experienceSection.matchAll(jobPattern);
        for (const match of matches) {
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

        const matches = educationSection.matchAll(eduPattern);
        for (const match of matches) {
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

    /**
     * Language code mapping for common languages
     */
    static LANGUAGE_CODES = {
        'english': { code: 'en', name: 'English' },
        'german': { code: 'de', name: 'German' },
        'french': { code: 'fr', name: 'French' },
        'spanish': { code: 'es', name: 'Spanish' },
        'chinese': { code: 'zh', name: 'Chinese (Mandarin)' },
        'mandarin': { code: 'zh', name: 'Chinese (Mandarin)' },
        'cantonese': { code: 'yue', name: 'Chinese (Cantonese)' },
        'japanese': { code: 'ja', name: 'Japanese' },
        'korean': { code: 'ko', name: 'Korean' },
        'arabic': { code: 'ar', name: 'Arabic' },
        'portuguese': { code: 'pt', name: 'Portuguese' },
        'italian': { code: 'it', name: 'Italian' },
        'russian': { code: 'ru', name: 'Russian' },
        'dutch': { code: 'nl', name: 'Dutch' },
        'turkish': { code: 'tr', name: 'Turkish' },
        'hindi': { code: 'hi', name: 'Hindi' },
        'polish': { code: 'pl', name: 'Polish' },
        'swedish': { code: 'sv', name: 'Swedish' },
        'danish': { code: 'da', name: 'Danish' },
        'norwegian': { code: 'no', name: 'Norwegian' },
        'finnish': { code: 'fi', name: 'Finnish' },
        'greek': { code: 'el', name: 'Greek' },
        'hebrew': { code: 'he', name: 'Hebrew' },
        'thai': { code: 'th', name: 'Thai' },
        'vietnamese': { code: 'vi', name: 'Vietnamese' },
        'indonesian': { code: 'id', name: 'Indonesian' },
        'malay': { code: 'ms', name: 'Malay' },
        'catalan': { code: 'ca', name: 'Catalan' },
        'czech': { code: 'cs', name: 'Czech' },
        'hungarian': { code: 'hu', name: 'Hungarian' },
        'romanian': { code: 'ro', name: 'Romanian' },
        'ukrainian': { code: 'uk', name: 'Ukrainian' }
    };

    /**
     * Proficiency level mapping
     */
    static PROFICIENCY_MAP = {
        'native': 'native',
        'mother tongue': 'native',
        'native speaker': 'native',
        'fluent': 'fluent',
        'c2': 'fluent',
        'c1': 'fluent',
        'advanced': 'professional',
        'b2': 'professional',
        'professional': 'professional',
        'proficient': 'professional',
        'intermediate': 'professional',
        'b1': 'professional',
        'basic': 'basic',
        'a2': 'basic',
        'a1': 'basic',
        'beginner': 'basic',
        'elementary': 'basic'
    };

    _extractLanguages(text) {
        const languages = [];
        const languageSection = this._extractSection(text, 'languages');
        const textToSearch = languageSection || text;

        // Enhanced patterns for language extraction
        const languageNames = Object.keys(OCRService.LANGUAGE_CODES).join('|');
        const proficiencyTerms = 'native|mother\\s*tongue|fluent|advanced|intermediate|basic|beginner|professional|proficient|c1|c2|b1|b2|a1|a2';

        // Pattern 1: Language with proficiency after (e.g., "English - Native", "German: Fluent")
        const pattern1 = new RegExp(
            `\\b(${languageNames})\\b\\s*[-–:,]?\\s*(${proficiencyTerms})?`,
            'gi'
        );

        // Pattern 2: Proficiency before language (e.g., "Native English", "Fluent in German")
        const pattern2 = new RegExp(
            `\\b(${proficiencyTerms})\\s+(?:in\\s+)?(${languageNames})\\b`,
            'gi'
        );

        // Pattern 3: Parenthetical (e.g., "English (Native)", "German (C1)")
        const pattern3 = new RegExp(
            `\\b(${languageNames})\\s*\\(\\s*(${proficiencyTerms})\\s*\\)`,
            'gi'
        );

        const foundLanguages = new Map();

        // Extract with all patterns
        const patterns = [
            { regex: pattern1, langGroup: 1, profGroup: 2 },
            { regex: pattern2, langGroup: 2, profGroup: 1 },
            { regex: pattern3, langGroup: 1, profGroup: 2 }
        ];

        for (const { regex, langGroup, profGroup } of patterns) {
            const matches = textToSearch.matchAll(regex);
            for (const match of matches) {
                const langKey = match[langGroup].toLowerCase();
                const proficiencyRaw = match[profGroup]?.toLowerCase();

                if (OCRService.LANGUAGE_CODES[langKey] && !foundLanguages.has(langKey)) {
                    const langInfo = OCRService.LANGUAGE_CODES[langKey];
                    const proficiency = OCRService.PROFICIENCY_MAP[proficiencyRaw] || 'professional';

                    foundLanguages.set(langKey, {
                        languageCode: langInfo.code,
                        languageName: langInfo.name,
                        proficiency: proficiency,
                        isNative: proficiency === 'native'
                    });
                }
            }
        }

        return Array.from(foundLanguages.values());
    }

    /**
     * Certification issuer mapping for common certifications
     */
    static CERTIFICATION_ISSUERS = {
        'aws': 'Amazon Web Services',
        'amazon': 'Amazon Web Services',
        'azure': 'Microsoft',
        'microsoft': 'Microsoft',
        'google': 'Google Cloud',
        'gcp': 'Google Cloud',
        'sap': 'SAP',
        'pmp': 'Project Management Institute',
        'prince2': 'AXELOS',
        'scrum': 'Scrum Alliance',
        'itil': 'AXELOS',
        'cissp': 'ISC2',
        'cism': 'ISACA',
        'ceh': 'EC-Council',
        'comptia': 'CompTIA',
        'security+': 'CompTIA',
        'network+': 'CompTIA',
        'kubernetes': 'Cloud Native Computing Foundation',
        'cka': 'Cloud Native Computing Foundation',
        'ckad': 'Cloud Native Computing Foundation',
        'cks': 'Cloud Native Computing Foundation',
        'terraform': 'HashiCorp',
        'hashicorp': 'HashiCorp',
        'red hat': 'Red Hat',
        'rhcsa': 'Red Hat',
        'rhce': 'Red Hat',
        'oracle': 'Oracle',
        'cisco': 'Cisco',
        'ccna': 'Cisco',
        'ccnp': 'Cisco'
    };

    _extractCertifications(text) {
        const certifications = [];
        const certSection = this._extractSection(text, 'certifications');
        const textToSearch = certSection || text;

        // Enhanced certification patterns with capturing groups for details
        const certPatterns = [
            // AWS Certifications
            {
                pattern: /(?:AWS|Amazon)\s+(?:Certified)?\s*(Solutions?\s*Architect|Developer|SysOps|DevOps|Machine Learning|Data Analytics|Database|Security|Cloud Practitioner)[\s-]*(Associate|Professional|Specialty)?/gi,
                issuer: 'Amazon Web Services'
            },
            // Microsoft/Azure Certifications
            {
                pattern: /(?:Microsoft|Azure)\s+(?:Certified)?:?\s*(Azure?\s*(?:Administrator|Developer|Solutions?\s*Architect|DevOps|Security|Data|AI)(?:\s*(?:Associate|Expert))?|[\w\s]+)/gi,
                issuer: 'Microsoft'
            },
            // Google Cloud Certifications
            {
                pattern: /(?:Google\s*Cloud|GCP)\s+(?:Certified)?\s*(Professional\s*(?:Cloud\s*)?(?:Architect|Developer|Data Engineer|DevOps Engineer|Network Engineer|Security Engineer)|Associate\s*Cloud\s*Engineer|Cloud\s*Digital\s*Leader)/gi,
                issuer: 'Google Cloud'
            },
            // SAP Certifications
            {
                pattern: /SAP\s+(?:Certified)?\s*(Development|Application|Technology|Integration)?\s*(?:Associate|Specialist|Professional)?\s*[-–:]?\s*(SAP\s*(?:BTP|S\/4HANA|SuccessFactors|Fiori|HANA|Cloud Platform|Integration Suite|CAP|ABAP)[\w\s]*)/gi,
                issuer: 'SAP'
            },
            // Project Management
            {
                pattern: /\b(PMP|Project\s*Management\s*Professional|PRINCE2(?:\s*Foundation|\s*Practitioner)?|CAPM|PMI-ACP)\b/gi,
                issuer: 'Project Management Institute'
            },
            // Agile/Scrum
            {
                pattern: /\b(Certified\s*Scrum\s*Master|CSM|CSPO|Certified\s*Scrum\s*Product\s*Owner|SAFe\s*Agilist|Professional\s*Scrum\s*Master|PSM)\b/gi,
                issuer: 'Scrum Alliance'
            },
            // Kubernetes
            {
                pattern: /\b(Certified\s*Kubernetes\s*(?:Administrator|Application\s*Developer|Security\s*Specialist)|CKA|CKAD|CKS)\b/gi,
                issuer: 'Cloud Native Computing Foundation'
            },
            // Security Certifications
            {
                pattern: /\b(CISSP|CISM|CISA|CEH|CompTIA\s*Security\+|OSCP|GIAC[\w\s]*)\b/gi,
                issuer: null // Will be determined by keyword
            },
            // HashiCorp
            {
                pattern: /(?:HashiCorp\s+)?(?:Certified)?:?\s*(Terraform\s*(?:Associate|Professional)?|Vault\s*(?:Associate|Professional)?|Consul\s*(?:Associate)?)/gi,
                issuer: 'HashiCorp'
            },
            // Red Hat
            {
                pattern: /\b(Red\s*Hat\s*Certified\s*(?:System\s*Administrator|Engineer|Architect)|RHCSA|RHCE|RHCA)\b/gi,
                issuer: 'Red Hat'
            },
            // Generic certification pattern with dates
            {
                pattern: /(?:Certified|Certificate|Certification)[\s:-]+([A-Z][\w\s&-]+?)(?:\s*[-–]\s*|\s+)(?:issued\s*)?(\d{4}|\w+\s+\d{4})?/gi,
                issuer: null
            }
        ];

        const foundCerts = new Map();

        for (const { pattern, issuer: defaultIssuer } of certPatterns) {
            const matches = textToSearch.matchAll(pattern);
            for (const match of matches) {
                const fullMatch = match[0].trim();
                const certName = this._normalizeCertName(fullMatch);

                if (certName.length > 3 && !foundCerts.has(certName.toLowerCase())) {
                    // Determine issuer
                    let issuer = defaultIssuer;
                    if (!issuer) {
                        for (const [keyword, issuerName] of Object.entries(OCRService.CERTIFICATION_ISSUERS)) {
                            if (fullMatch.toLowerCase().includes(keyword)) {
                                issuer = issuerName;
                                break;
                            }
                        }
                    }

                    // Extract date if present (pattern: 2023 or January 2023)
                    const dateMatch = textToSearch.slice(match.index, match.index + 100)
                        .match(/(?:issued|obtained|earned)?[\s:-]*(\d{4}|\w+\s+\d{4})/i);

                    foundCerts.set(certName.toLowerCase(), {
                        name: certName,
                        issuingOrganization: issuer || 'Unknown',
                        issueDate: dateMatch ? this._parseDate(dateMatch[1]) : null,
                        expirationDate: null,
                        credentialId: null,
                        credentialUrl: null,
                        isValid: true
                    });
                }
            }
        }

        return Array.from(foundCerts.values());
    }

    /**
     * Normalize certification name
     */
    _normalizeCertName(name) {
        return name
            .replace(/\s+/g, ' ')
            .replace(/[-–]\s*$/, '')
            .replace(/^\s*[-–:]\s*/, '')
            .trim();
    }

    /**
     * Parse date string to ISO format
     */
    _parseDate(dateStr) {
        if (!dateStr) return null;

        // Handle year-only format
        if (/^\d{4}$/.test(dateStr)) {
            return `${dateStr}-01-01`;
        }

        // Handle month year format
        const monthMatch = dateStr.match(/(\w+)\s+(\d{4})/);
        if (monthMatch) {
            const months = {
                january: '01', february: '02', march: '03', april: '04',
                may: '05', june: '06', july: '07', august: '08',
                september: '09', october: '10', november: '11', december: '12',
                jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
                jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
            };
            const month = months[monthMatch[1].toLowerCase()] || '01';
            return `${monthMatch[2]}-${month}-01`;
        }

        return null;
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

        // Create language records from extracted languages
        let linkedLanguagesCount = 0;
        if (extractedData.languages?.length > 0) {
            for (const lang of extractedData.languages) {
                try {
                    await tx.run(
                        INSERT.into('cv.sorting.CandidateLanguages').entries({
                            ID: cds.utils.uuid(),
                            candidate_ID: candidateId,
                            languageCode: lang.languageCode,
                            languageName: lang.languageName,
                            proficiency: lang.proficiency,
                            isNative: lang.isNative || false
                        })
                    );
                    linkedLanguagesCount++;
                } catch (err) {
                    LOG.warn('Failed to create language record', { lang, error: err.message });
                    warnings.push(`Failed to add language: ${lang.languageName}`);
                }
            }
            LOG.info('Created language records', { count: linkedLanguagesCount });
        }

        // Create certification records from extracted certifications
        let linkedCertificationsCount = 0;
        if (extractedData.certifications?.length > 0) {
            for (const cert of extractedData.certifications) {
                try {
                    await tx.run(
                        INSERT.into('cv.sorting.Certifications').entries({
                            ID: cds.utils.uuid(),
                            candidate_ID: candidateId,
                            name: cert.name,
                            issuingOrganization: cert.issuingOrganization,
                            issueDate: cert.issueDate,
                            expirationDate: cert.expirationDate,
                            credentialId: cert.credentialId,
                            credentialUrl: cert.credentialUrl,
                            isValid: cert.isValid !== false,
                            createdAt: new Date().toISOString(),
                            createdBy: req.user?.id
                        })
                    );
                    linkedCertificationsCount++;
                } catch (err) {
                    LOG.warn('Failed to create certification record', { cert, error: err.message });
                    warnings.push(`Failed to add certification: ${cert.name}`);
                }
            }
            LOG.info('Created certification records', { count: linkedCertificationsCount });
        }

        return {
            candidateId,
            linkedSkillsCount,
            linkedLanguagesCount,
            linkedCertificationsCount,
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
