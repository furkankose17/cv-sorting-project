'use strict';

/**
 * CV Sorting Service - Main Handler
 *
 * Unified CAP service that delegates to modular handler files:
 * - candidate-service.js: Candidate CRUD, status management, skills
 * - job-service.js: Jobs, matching, analytics, notifications
 * - ai-service.js: Joule AI, ML integration, embeddings, OCR
 *
 * @path /api
 * @service CVSortingService
 */

const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

// Import handler modules
const CandidateHandlers = require('./candidate-service');
const JobHandlers = require('./job-service');
const AIHandlers = require('./ai-service');

// Import shared utilities
const { createMLClient } = require('./lib/ml-client');
const { sanitizeString, validateLength } = require('./lib/validators');
const RuleEngine = require('./lib/rule-engine');
const cache = require('./lib/cache');
const { createCapRateLimiter } = require('./middleware/rate-limiter');
const webhookHelper = require('./lib/webhook-helper');
const ConfigValidator = require('./lib/config-validator');

const LOG = cds.log('cv-sorting-service');

module.exports = class CVSortingService extends cds.ApplicationService {

    async init() {
        LOG.info('Initializing unified CV Sorting Service');

        // Validate email automation configuration
        try {
            ConfigValidator.validateAndWarn();
        } catch (error) {
            LOG.error('Configuration validation failed:', error.message);
            // Continue initialization even if validation fails (warnings only)
        }

        // Register rate limiting middleware
        const rateLimiterMiddleware = createCapRateLimiter({
            windowMs: 60 * 1000, // 1 minute
            maxRequests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
            keyGenerator: (req) => req.user?.id || req._.req?.ip || 'anonymous'
        });
        this.before('*', rateLimiterMiddleware);
        LOG.info('Rate limiter configured');

        // Initialize ML client (shared across domains)
        this.mlClient = createMLClient();
        LOG.info('ML Client initialized');

        // Initialize Rule Engine for advanced scoring
        this.ruleEngine = new RuleEngine(cds.db);
        LOG.info('Rule Engine initialized');

        // Initialize n8n webhook config (from JobService)
        this.n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/match-notification';
        this.cooldownHours = parseInt(process.env.NOTIFICATION_COOLDOWN_HOURS) || 24;
        this.thresholds = new Map();
        this.notificationHistory = [];

        // Connect to SAP AI Core (from AIService)
        try {
            this.aiCore = await cds.connect.to('joule-ai');
            LOG.info('Connected to SAP AI Core');
        } catch (e) {
            LOG.warn('SAP AI Core not available, using local AI simulation');
            this.aiCore = null;
        }

        // Get all entity references
        const entities = cds.entities('cv.sorting');

        // ============================================================
        // CANDIDATE DOMAIN HANDLERS
        // ============================================================
        this._registerCandidateHandlers(entities);

        // ============================================================
        // JOB DOMAIN HANDLERS
        // ============================================================
        this._registerJobHandlers(entities);

        // ============================================================
        // AI/ML DOMAIN HANDLERS
        // ============================================================
        this._registerAIHandlers(entities);

        // ============================================================
        // EMAIL NOTIFICATION HANDLERS
        // ============================================================
        this._registerEmailNotificationHandlers(entities);

        // ============================================================
        // AUTO-EMBEDDING TRIGGERS
        // ============================================================
        this._registerEmbeddingTriggers(entities);

        LOG.info('CV Sorting Service initialized with all handlers');
        await super.init();
    }

    // ================================================================
    // AUTO-EMBEDDING TRIGGERS (ML Integration)
    // ================================================================

    _registerEmbeddingTriggers(entities) {
        const { CVDocuments, Candidates, CandidateSkills, WorkExperiences } = entities;

        // Generate candidate embedding when CV document is processed
        this.after('UPDATE', 'CVDocuments', async (data, req) => {
            // Check if document was just processed (has extracted text)
            if (data.extractedText && data.processingStatus === 'completed') {
                const candidateId = data.candidate_ID;
                if (!candidateId) return;

                LOG.info('CV processed, generating candidate embedding', { documentId: data.ID, candidateId });

                // Generate embedding asynchronously
                this._generateCandidateEmbeddingAsync(candidateId, entities).catch(err => {
                    LOG.warn('Failed to generate candidate embedding after CV upload', { candidateId, error: err.message });
                });

                // Send CV received webhook (if enabled)
                if (process.env.ENABLE_WEBHOOKS === 'true') {
                    try {
                        const result = await webhookHelper.sendCVReceivedWebhook(
                            data.ID,
                            candidateId,
                            data.fileName || 'unknown'
                        );

                        if (result.success) {
                            LOG.info('CV received webhook sent successfully', {
                                documentId: data.ID,
                                webhookId: result.webhookId
                            });
                        } else {
                            LOG.warn('CV received webhook failed (non-blocking)', {
                                documentId: data.ID,
                                error: result.error
                            });
                        }
                    } catch (webhookError) {
                        LOG.error('Unexpected CV received webhook error (non-blocking)', {
                            documentId: data.ID,
                            error: webhookError.message
                        });
                    }
                }
            }
        });

        // Generate candidate embedding when candidate profile is updated significantly
        this.after('UPDATE', 'Candidates', async (data, req) => {
            const candidateId = data.ID;
            if (!candidateId) return;

            // Check if significant fields were updated
            const significantFields = ['summary', 'headline', 'totalExperienceYears'];
            const hasSignificantUpdate = significantFields.some(field => data[field] !== undefined);

            if (hasSignificantUpdate) {
                LOG.info('Candidate profile updated, regenerating embedding', { candidateId });

                this._generateCandidateEmbeddingAsync(candidateId, entities).catch(err => {
                    LOG.warn('Failed to regenerate candidate embedding after profile update', { candidateId, error: err.message });
                });
            }
        });

        // Generate embedding when skills are added
        this.after('CREATE', 'CandidateSkills', async (data, req) => {
            const candidateId = data.candidate_ID;
            if (!candidateId) return;

            LOG.info('Skill added, regenerating candidate embedding', { candidateId, skillId: data.skill_ID });

            this._generateCandidateEmbeddingAsync(candidateId, entities).catch(err => {
                LOG.warn('Failed to regenerate candidate embedding after skill add', { candidateId, error: err.message });
            });
        });

        LOG.info('Embedding triggers registered');
    }

    /**
     * Generate candidate embedding asynchronously
     */
    async _generateCandidateEmbeddingAsync(candidateId, entities) {
        const { Candidates, CVDocuments, CandidateSkills, WorkExperiences } = entities;

        // Get candidate data
        const candidate = await SELECT.one.from(Candidates)
            .where({ ID: candidateId })
            .columns(['ID', 'firstName', 'lastName', 'summary', 'headline', 'totalExperienceYears']);

        if (!candidate) {
            LOG.warn('Candidate not found for embedding generation', { candidateId });
            return;
        }

        // Get CV document text
        const cvDoc = await SELECT.one.from(CVDocuments)
            .where({ candidate_ID: candidateId, processingStatus: 'completed' })
            .orderBy({ createdAt: 'desc' })
            .columns(['extractedText']);

        const cvText = cvDoc?.extractedText || candidate.summary || '';

        if (!cvText || cvText.length < 50) {
            LOG.info('Insufficient text content for embedding', { candidateId, textLength: cvText.length });
            return;
        }

        // Get skills with names from Skills entity
        const skills = await SELECT.from(CandidateSkills)
            .where({ candidate_ID: candidateId })
            .columns(['skill_ID', 'proficiencyLevel']);

        // Get skill names
        const skillIds = skills.map(s => s.skill_ID).filter(Boolean);
        let skillsText = '';
        if (skillIds.length > 0) {
            const skillEntities = await SELECT.from('cv.sorting.Skills').where({ ID: { in: skillIds } });
            const skillNameMap = new Map(skillEntities.map(s => [s.ID, s.name]));
            skillsText = skills.map(s => {
                const name = skillNameMap.get(s.skill_ID) || 'Unknown';
                return `${name} (${s.proficiencyLevel || 'intermediate'})`;
            }).join(', ');
        }

        // Get work experience
        const experiences = await SELECT.from(WorkExperiences)
            .where({ candidate_ID: candidateId })
            .columns(['jobTitle', 'companyName', 'description']);

        const experienceText = experiences.map(e =>
            `${e.jobTitle} at ${e.companyName}: ${e.description || ''}`
        ).join('\n');

        // Call ML service
        try {
            const result = await this.mlClient.generateEmbedding({
                entityType: 'candidate',
                entityId: candidateId,
                textContent: cvText,
                skillsText: skillsText,
                experienceText: experienceText
            });

            LOG.info('Candidate embedding generated', {
                candidateId,
                embeddingDimension: result.embedding_dimension,
                stored: result.stored
            });

            return result;
        } catch (error) {
            LOG.error('ML service embedding generation failed', { candidateId, error: error.message });
            throw error;
        }
    }

    // ================================================================
    // CANDIDATE DOMAIN REGISTRATION
    // ================================================================

    _registerCandidateHandlers(entities) {
        const { Candidates, CandidateSkills, Skills, CandidateNotes, CVDocuments,
                WorkExperiences, Educations, MatchResults, Interviews, CandidateStatusHistory } = entities;

        // ----- Bound Actions on Candidates -----

        this.on('updateStatus', 'Candidates', async (req) => {
            const candidateId = req.params[0];
            const { newStatus, notes, notifyCandidate } = req.data;

            const candidate = await SELECT.one.from(Candidates)
                .columns('status_code', 'email', 'firstName')
                .where({ ID: candidateId });

            if (!candidate) {
                return { success: false, previousStatus: null, currentStatus: null, message: 'Candidate not found' };
            }

            const previousStatus = candidate.status_code;
            const validTransitions = this._getValidStatusTransitions(previousStatus);

            if (!validTransitions.includes(newStatus)) {
                return { success: false, previousStatus, currentStatus: previousStatus,
                         message: `Invalid status transition from ${previousStatus} to ${newStatus}` };
            }

            await UPDATE(Candidates).where({ ID: candidateId }).set({ status_code: newStatus });

            if (notes) {
                await INSERT.into(CandidateNotes).entries({
                    ID: uuidv4(), candidate_ID: candidateId,
                    noteText: `Status changed from ${previousStatus} to ${newStatus}: ${notes}`,
                    noteType: 'status-change'
                });
            }

            await this.emit('CandidateStatusChanged', {
                candidateId, previousStatus, newStatus,
                changedBy: req.user?.id || 'system', timestamp: new Date()
            });

            return { success: true, previousStatus, currentStatus: newStatus, message: 'Status updated successfully' };
        });

        this.on('addSkill', 'Candidates', async (req) => {
            const candidateId = req.params[0];
            const { skillId, proficiencyLevel, yearsOfExperience } = req.data;

            const id = uuidv4();
            await INSERT.into(CandidateSkills).entries({
                ID: id, candidate_ID: candidateId, skill_ID: skillId,
                proficiencyLevel: proficiencyLevel || 'intermediate',
                yearsOfExperience: yearsOfExperience || 0,
                source: 'manual', isVerified: false
            });

            return SELECT.one.from(CandidateSkills).where({ ID: id });
        });

        this.on('markAsDuplicate', 'Candidates', async (req) => {
            const candidateId = req.params[0];
            const { primaryCandidateId, mergeStrategy } = req.data;

            const primaryCandidate = await SELECT.one.from(Candidates).where({ ID: primaryCandidateId });
            if (!primaryCandidate) {
                req.error(404, `Primary candidate ${primaryCandidateId} not found`);
                return false;
            }

            if (candidateId === primaryCandidateId) {
                req.error(400, 'Cannot mark a candidate as duplicate of itself');
                return false;
            }

            if (mergeStrategy === 'merge-all' || mergeStrategy === 'merge-documents') {
                await UPDATE(CVDocuments).where({ candidate_ID: candidateId }).set({ candidate_ID: primaryCandidateId });
            }

            if (mergeStrategy === 'merge-all') {
                await UPDATE(WorkExperiences).where({ candidate_ID: candidateId }).set({ candidate_ID: primaryCandidateId });
                await UPDATE(Educations).where({ candidate_ID: candidateId }).set({ candidate_ID: primaryCandidateId });

                const dupSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
                const primarySkills = await SELECT.from(CandidateSkills).where({ candidate_ID: primaryCandidateId });
                const primarySkillIds = new Set(primarySkills.map(s => s.skill_ID));

                for (const skill of dupSkills) {
                    if (!primarySkillIds.has(skill.skill_ID)) {
                        await UPDATE(CandidateSkills).where({ ID: skill.ID }).set({ candidate_ID: primaryCandidateId });
                    } else {
                        await DELETE.from(CandidateSkills).where({ ID: skill.ID });
                    }
                }
            }

            await UPDATE(Candidates).where({ ID: candidateId }).set({ status_code: 'duplicate' });

            await INSERT.into(CandidateNotes).entries([
                { ID: uuidv4(), candidate_ID: candidateId,
                  noteText: `Marked as duplicate of candidate ${primaryCandidateId}. Strategy: ${mergeStrategy || 'none'}`,
                  noteType: 'system' },
                { ID: uuidv4(), candidate_ID: primaryCandidateId,
                  noteText: `Candidate ${candidateId} marked as duplicate of this record`,
                  noteType: 'system' }
            ]);

            return true;
        });

        // ----- Bound Actions on Interviews -----

        this.on('confirm', 'Interviews', async (req) => {
            const interviewId = req.params[0];
            await UPDATE(Interviews).where({ ID: interviewId }).set({ status_code: 'confirmed' });
            return SELECT.one.from(Interviews).where({ ID: interviewId });
        });

        this.on('complete', 'Interviews', async (req) => {
            const interviewId = req.params[0];
            const { overallRating, feedback, recommendation } = req.data;
            await UPDATE(Interviews).where({ ID: interviewId }).set({
                status_code: 'completed', overallRating, feedback, recommendation
            });
            return SELECT.one.from(Interviews).where({ ID: interviewId });
        });

        this.on('cancel', 'Interviews', async (req) => {
            const interviewId = req.params[0];
            await UPDATE(Interviews).where({ ID: interviewId }).set({
                status_code: 'cancelled', cancellationReason: req.data.reason
            });
            return SELECT.one.from(Interviews).where({ ID: interviewId });
        });

        this.on('reschedule', 'Interviews', async (req) => {
            const interviewId = req.params[0];
            await UPDATE(Interviews).where({ ID: interviewId }).set({
                scheduledAt: req.data.newDateTime, rescheduleReason: req.data.reason
            });
            return SELECT.one.from(Interviews).where({ ID: interviewId });
        });

        this.on('recordNoShow', 'Interviews', async (req) => {
            const interviewId = req.params[0];
            await UPDATE(Interviews).where({ ID: interviewId }).set({ status_code: 'no_show' });
            return SELECT.one.from(Interviews).where({ ID: interviewId });
        });

        this.on('submitFeedback', 'Interviews', async (req) => {
            const interviewId = req.params[0];
            await UPDATE(Interviews).where({ ID: interviewId }).set({
                overallRating: req.data.overallRating,
                technicalRating: req.data.technicalRating,
                communicationRating: req.data.communicationRating,
                cultureFitRating: req.data.cultureFitRating,
                feedback: req.data.feedback,
                strengths: req.data.strengths,
                areasOfImprovement: req.data.areasOfImprovement,
                recommendation: req.data.recommendation,
                nextSteps: req.data.nextSteps
            });
            return SELECT.one.from(Interviews).where({ ID: interviewId });
        });

        // Send webhook when interview is created
        this.after('CREATE', 'Interviews', async (data, req) => {
            if (process.env.ENABLE_WEBHOOKS !== 'true') return;

            try {
                const result = await webhookHelper.sendInterviewScheduledWebhook(
                    data.ID,
                    data.candidate_ID,
                    data.jobPosting_ID || null,
                    data.scheduledAt,
                    data.interviewerEmail || null
                );

                if (result.success) {
                    LOG.info('Interview scheduled webhook sent successfully', {
                        interviewId: data.ID,
                        webhookId: result.webhookId
                    });
                } else {
                    LOG.warn('Interview scheduled webhook failed (non-blocking)', {
                        interviewId: data.ID,
                        error: result.error
                    });
                }
            } catch (webhookError) {
                LOG.error('Unexpected interview webhook error (non-blocking)', {
                    interviewId: data.ID,
                    error: webhookError.message
                });
            }
        });

        // ----- Candidate Functions -----

        this.on('searchCandidates', async (req) => {
            const { query, skills, minExperience, maxExperience, locations, statuses,
                    educationLevel, sortBy, sortOrder, limit, offset } = req.data;

            let cqnQuery = SELECT.from(Candidates);
            const conditions = [];

            if (query) {
                const sanitizedQuery = sanitizeString(query.trim());
                validateLength(sanitizedQuery, 'Search query', 1, 255);
                conditions.push({
                    or: [
                        { firstName: { like: `%${sanitizedQuery}%` } },
                        { lastName: { like: `%${sanitizedQuery}%` } },
                        { email: { like: `%${sanitizedQuery}%` } },
                        { headline: { like: `%${sanitizedQuery}%` } }
                    ]
                });
            }

            if (minExperience !== undefined) conditions.push({ totalExperienceYears: { '>=': minExperience } });
            if (maxExperience !== undefined) conditions.push({ totalExperienceYears: { '<=': maxExperience } });
            if (locations?.length > 0) conditions.push({ city: { in: locations } });
            if (statuses?.length > 0) conditions.push({ status_code: { in: statuses } });

            if (conditions.length > 0) cqnQuery = cqnQuery.where(conditions);

            const orderBy = sortBy || 'createdAt';
            const order = sortOrder === 'asc' ? 'asc' : 'desc';
            cqnQuery = cqnQuery.orderBy(`${orderBy} ${order}`).limit(limit || 50, offset || 0);

            const candidates = await cqnQuery;

            let filteredCandidates = candidates;
            if (skills?.length > 0) {
                const candidatesWithSkills = [];
                for (const candidate of candidates) {
                    const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });
                    const candidateSkillIds = candidateSkills.map(s => s.skill_ID);
                    if (skills.every(s => candidateSkillIds.includes(s))) {
                        candidatesWithSkills.push(candidate);
                    }
                }
                filteredCandidates = candidatesWithSkills;
            }

            const countResult = await SELECT.from(Candidates).columns('count(*) as count');
            const totalCount = countResult[0]?.count || 0;

            return { candidates: JSON.stringify(filteredCandidates), totalCount, facets: '{}' };
        });

        this.on('findSimilarCandidates', async (req) => {
            const { candidateId, similarityFactors, limit } = req.data;

            const refCandidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            if (!refCandidate) return { candidates: '[]' };

            // Try ML-based semantic similarity first
            const useSemanticSimilarity = !similarityFactors || similarityFactors.includes('semantic');
            let semanticMatches = new Map();

            if (useSemanticSimilarity) {
                try {
                    // Use ML service to find semantically similar candidates
                    const mlResult = await this.mlClient.semanticSearch({
                        candidateId: candidateId,
                        limit: 100,
                        minSimilarity: 0.3
                    });

                    if (mlResult && mlResult.matches) {
                        for (const match of mlResult.matches) {
                            semanticMatches.set(match.candidate_id, match.similarity * 100);
                        }
                        LOG.info('ML semantic similarity used for findSimilar', { candidateId, mlMatches: mlResult.matches.length });
                    }
                } catch (mlError) {
                    LOG.warn('ML semantic similarity unavailable, using rule-based', { error: mlError.message });
                }
            }

            const refSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
            const refSkillIds = new Set(refSkills.map(s => s.skill_ID));

            const allCandidates = await SELECT.from(Candidates).where({ ID: { '!=': candidateId } }).limit(500);
            const similarCandidates = [];

            // FIX N+1: Fetch all candidate skills in one query
            const candidateIds = allCandidates.map(c => c.ID);
            const allCandidateSkills = candidateIds.length > 0
                ? await SELECT.from(CandidateSkills).where({ candidate_ID: { in: candidateIds } })
                : [];

            // Create lookup map: candidate_ID -> skills array
            const candidateSkillsMap = new Map();
            allCandidateSkills.forEach(cs => {
                if (!candidateSkillsMap.has(cs.candidate_ID)) {
                    candidateSkillsMap.set(cs.candidate_ID, []);
                }
                candidateSkillsMap.get(cs.candidate_ID).push(cs);
            });

            for (const candidate of allCandidates) {
                let similarity = 0, factors = 0;

                // Use ML semantic score if available
                if (semanticMatches.has(candidate.ID)) {
                    similarity += semanticMatches.get(candidate.ID);
                    factors++;
                }

                if (!similarityFactors || similarityFactors.includes('skills')) {
                    const skills = candidateSkillsMap.get(candidate.ID) || [];
                    const skillIds = new Set(skills.map(s => s.skill_ID));
                    const intersection = [...refSkillIds].filter(id => skillIds.has(id));
                    const union = new Set([...refSkillIds, ...skillIds]);
                    if (union.size > 0) {
                        similarity += (intersection.length / union.size) * 100;
                        factors++;
                    }
                }

                if (!similarityFactors || similarityFactors.includes('experience')) {
                    const expDiff = Math.abs((refCandidate.totalExperienceYears || 0) - (candidate.totalExperienceYears || 0));
                    similarity += Math.max(0, 100 - (expDiff * 10));
                    factors++;
                }

                if (factors > 0) {
                    candidate.similarityScore = Math.round((similarity / factors) * 100) / 100;
                    candidate.hasSemanticScore = semanticMatches.has(candidate.ID);
                    similarCandidates.push(candidate);
                }
            }

            similarCandidates.sort((a, b) => b.similarityScore - a.similarityScore);
            return { candidates: JSON.stringify(similarCandidates.slice(0, limit || 10)) };
        });

        this.on('getCandidateTimeline', async (req) => {
            const { candidateId } = req.data;
            const timeline = [];

            const notes = await SELECT.from(CandidateNotes).where({ candidate_ID: candidateId }).orderBy('createdAt desc');
            for (const note of notes) {
                timeline.push({ type: 'note', date: note.createdAt, title: note.noteType, description: note.noteText });
            }

            const docs = await SELECT.from(CVDocuments).where({ candidate_ID: candidateId }).orderBy('createdAt desc');
            for (const doc of docs) {
                timeline.push({ type: 'document', date: doc.createdAt, title: 'Document uploaded', description: doc.fileName });
            }

            timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
            return { timeline: JSON.stringify(timeline) };
        });

        this.on('getCandidateStats', async (req) => {
            const { candidateId } = req.data;
            const matches = await SELECT.from(MatchResults).where({ candidate_ID: candidateId });

            const avgScore = matches.length > 0
                ? matches.reduce((sum, m) => sum + (m.overallScore || 0), 0) / matches.length : 0;
            const topMatches = matches.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0)).slice(0, 5);

            return {
                applicationsCount: matches.length,
                matchesCount: matches.filter(m => m.overallScore >= 50).length,
                avgMatchScore: avgScore,
                topMatchingJobs: JSON.stringify(topMatches)
            };
        });

        // Remaining candidate handlers delegated to CandidateHandlers module
        this.on('bulkUpdateStatus', (req) => this._delegateToCandidateModule(req, 'handleBulkUpdateStatus'));
        this.on('archiveCandidate', (req) => this._delegateToCandidateModule(req, 'handleArchive'));
        this.on('mergeCandidates', (req) => this._delegateToCandidateModule(req, 'handleMerge'));
        this.on('autoLinkSkills', (req) => this._delegateToCandidateModule(req, 'handleAutoLinkSkills'));
        this.on('verifySkill', (req) => this._delegateToCandidateModule(req, 'handleVerifySkill'));
        this.on('extractSkillsFromText', (req) => this._delegateToCandidateModule(req, 'handleExtractSkillsFromText'));

        // ----- Document Upload Handler -----
        this.on('uploadDocument', async (req) => {
            const { fileName, fileContent, mediaType, candidateId } = req.data;

            // Determine or create candidate
            let targetCandidateId = candidateId;
            if (!targetCandidateId) {
                // Create new candidate from file name (extract name if possible)
                const nameParts = fileName.replace(/\.[^/.]+$/, '').split(/[_\-\s]+/);
                const firstName = nameParts[0] || 'Unknown';
                const lastName = nameParts.slice(1).join(' ') || 'Candidate';

                targetCandidateId = uuidv4();
                await INSERT.into(Candidates).entries({
                    ID: targetCandidateId,
                    firstName: firstName,
                    lastName: lastName,
                    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@cv-upload.placeholder`,
                    status_code: 'new',
                    source: 'cv-upload'
                });
                LOG.info('Created new candidate from CV upload', { candidateId: targetCandidateId, fileName });
            }

            // Store document
            const documentId = uuidv4();
            const contentBuffer = Buffer.from(fileContent, 'base64');

            await INSERT.into(CVDocuments).entries({
                ID: documentId,
                candidate_ID: targetCandidateId,
                fileName: fileName,
                mediaType: mediaType,
                fileContent: contentBuffer,
                fileSize: contentBuffer.length,
                processingStatus: 'pending'
            });

            LOG.info('Document uploaded', { documentId, candidateId: targetCandidateId, fileName });

            return {
                documentId: documentId,
                candidateId: targetCandidateId,
                processingStatus: 'uploaded',
                message: 'Document uploaded successfully'
            };
        });

        // ----- Document Processing Handler (bound action) -----
        this.on('process', 'Documents', async (req) => {
            const documentId = req.params[0];
            const doc = await SELECT.one.from(CVDocuments).where({ ID: documentId });

            if (!doc) {
                req.error(404, 'Document not found');
                return;
            }

            LOG.info('Processing document', { documentId, candidateId: doc.candidate_ID });

            // Call OCR processing
            try {
                const ocrResult = await this.mlClient.processOCR({
                    fileContent: doc.content.toString('base64'),
                    fileType: this._getFileTypeFromMime(doc.contentType),
                    language: 'eng+deu+tur',
                    extractStructured: true
                });

                // Update document with extracted text
                await UPDATE(CVDocuments).where({ ID: documentId }).set({
                    extractedText: ocrResult.text,
                    ocrConfidence: ocrResult.confidence,
                    processingStatus: 'completed',
                    processedAt: new Date()
                });

                LOG.info('OCR completed', { documentId, confidence: ocrResult.confidence, textLength: ocrResult.text?.length });

                // Auto-extract skills from text
                if (ocrResult.text && doc.candidate_ID) {
                    this._autoExtractSkillsAndEmbedding(doc.candidate_ID, ocrResult.text).catch(err => {
                        LOG.warn('Failed to auto-extract skills', { candidateId: doc.candidate_ID, error: err.message });
                    });
                }

                return {
                    documentId,
                    status: 'completed',
                    text: ocrResult.text,
                    confidence: ocrResult.confidence
                };
            } catch (error) {
                LOG.error('OCR processing failed', { documentId, error: error.message });
                await UPDATE(CVDocuments).where({ ID: documentId }).set({
                    processingStatus: 'failed',
                    processingError: error.message
                });
                req.error(500, `OCR processing failed: ${error.message}`);
            }
        });

        // ----- Status Change Tracking Hooks -----

        // Track status changes - capture previous status before update
        this.before('UPDATE', 'Candidates', async (req) => {
            if (!req.data.status_code) return;

            // For UPDATE operations, we need to get the current records that will be updated
            // Execute a SELECT with the same WHERE clause as the UPDATE
            const currentRecords = await SELECT.from(Candidates)
                .where(req.query.UPDATE.where)
                .columns(['ID', 'status_code']);

            // Store the status changes for each candidate that will actually change
            req._statusChanges = [];

            for (const record of currentRecords) {
                if (record.status_code !== req.data.status_code) {
                    req._statusChanges.push({
                        candidateId: record.ID,
                        previousStatus: record.status_code,
                        newStatus: req.data.status_code
                    });
                }
            }
        });

        // Create history record after successful status change
        this.after('UPDATE', 'Candidates', async (data, req) => {
            if (req._statusChanges && req._statusChanges.length > 0) {
                // Create history entries for all status changes
                const historyEntries = req._statusChanges.map(change => ({
                    ID: uuidv4(),
                    candidate_ID: change.candidateId,
                    previousStatus_code: change.previousStatus,
                    newStatus_code: change.newStatus,
                    changedAt: new Date().toISOString(),
                    changedBy: req.user?.id || 'system',
                    reason: req.data.statusChangeReason || null,
                    notes: req.data.statusChangeNotes || null
                }));

                await INSERT.into(CandidateStatusHistory).entries(historyEntries);

                LOG.info('Status change tracked', {
                    count: historyEntries.length,
                    changes: req._statusChanges.map(c => ({
                        candidateId: c.candidateId,
                        from: c.previousStatus,
                        to: c.newStatus
                    }))
                });

                // Send webhooks for status changes (if enabled)
                if (process.env.ENABLE_WEBHOOKS === 'true') {
                    for (const change of req._statusChanges) {
                        try {
                            const statusChange = {
                                oldStatus: change.previousStatus,
                                newStatus: change.newStatus,
                                changedBy: req.user?.id || 'system',
                                reason: req.data.statusChangeReason || null,
                                notes: req.data.statusChangeNotes || null
                            };

                            const result = await webhookHelper.sendStatusChangeWebhook(
                                change.candidateId,
                                statusChange
                            );

                            if (result.success) {
                                LOG.info('Status change webhook sent successfully', {
                                    candidateId: change.candidateId,
                                    webhookId: result.webhookId
                                });
                            } else {
                                LOG.warn('Status change webhook failed (non-blocking)', {
                                    candidateId: change.candidateId,
                                    error: result.error
                                });
                            }
                        } catch (webhookError) {
                            // Log error but don't fail the status change
                            LOG.error('Unexpected webhook error (non-blocking)', {
                                candidateId: change.candidateId,
                                error: webhookError.message
                            });
                        }
                    }
                }
            }
        });

        LOG.info('Candidate domain handlers registered');
    }

    // ================================================================
    // JOB DOMAIN REGISTRATION
    // ================================================================

    _registerJobHandlers(entities) {
        const { JobPostings, JobRequiredSkills, MatchResults, Candidates, CandidateSkills,
                Skills, Interviews, AuditLogs, CVDocuments } = entities;

        // ----- Bound Actions on JobPostings -----

        this.on('publish', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });

            if (!jobPosting) { req.error(404, 'Job posting not found'); return; }
            if (jobPosting.status === 'open') { req.error(400, 'Job posting is already published'); return; }
            if (!jobPosting.title) { req.error(400, 'Job title is required before publishing'); return; }

            await UPDATE(JobPostings).where({ ID: jobPostingId }).set({
                status: 'open', publishedAt: new Date().toISOString()
            });

            // Generate embedding asynchronously
            const description = [jobPosting.title, jobPosting.description, jobPosting.responsibilities, jobPosting.qualifications].filter(Boolean).join('\n\n');
            this.mlClient.generateEmbedding({
                entityType: 'job', entityId: jobPostingId,
                textContent: description, requirementsText: jobPosting.qualifications || ''
            }).then(result => LOG.info('Job embedding generated', { jobId: jobPostingId }))
              .catch(err => LOG.warn('Failed to generate job embedding', { error: err.message }));

            return SELECT.one.from(JobPostings).where({ ID: jobPostingId });
        });

        this.on('close', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) { req.error(404, 'Job posting not found'); return; }
            if (jobPosting.status === 'closed') { req.error(400, 'Job posting is already closed'); return; }
            await UPDATE(JobPostings).where({ ID: jobPostingId }).set({ status: 'closed' });
            return SELECT.one.from(JobPostings).where({ ID: jobPostingId });
        });

        this.on('reopen', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) { req.error(404, 'Job posting not found'); return; }
            if (jobPosting.status !== 'closed') { req.error(400, 'Only closed job postings can be reopened'); return; }
            await UPDATE(JobPostings).where({ ID: jobPostingId }).set({ status: 'open', publishedAt: new Date().toISOString() });
            return SELECT.one.from(JobPostings).where({ ID: jobPostingId });
        });

        this.on('findMatchingCandidates', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const { minScore = 50, limit = 50 } = req.data;

            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) return { matchCount: 0, topMatches: '[]' };

            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });
            const candidates = await SELECT.from(Candidates)
                .where({ isDeleted: false })
                .and({ status_code: { 'not in': ['rejected', 'withdrawn', 'archived'] } });

            const matches = [];
            for (const candidate of candidates) {
                const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });
                const matchResult = this._calculateMatchScore(candidate, jobPosting, candidateSkills, requiredSkills);

                if (matchResult.overallScore >= minScore) {
                    matches.push({
                        candidateId: candidate.ID,
                        candidateName: `${candidate.firstName} ${candidate.lastName}`,
                        score: matchResult.overallScore,
                        skillScore: matchResult.skillScore,
                        experienceScore: matchResult.experienceScore
                    });

                    const existingMatch = await SELECT.one.from(MatchResults)
                        .where({ candidate_ID: candidate.ID, jobPosting_ID: jobPostingId });

                    if (existingMatch) {
                        await UPDATE(MatchResults).where({ ID: existingMatch.ID }).set({
                            overallScore: matchResult.overallScore, skillScore: matchResult.skillScore,
                            experienceScore: matchResult.experienceScore, educationScore: matchResult.educationScore,
                            locationScore: matchResult.locationScore
                        });
                    } else {
                        await INSERT.into(MatchResults).entries({
                            ID: uuidv4(), candidate_ID: candidate.ID, jobPosting_ID: jobPostingId,
                            overallScore: matchResult.overallScore, skillScore: matchResult.skillScore,
                            experienceScore: matchResult.experienceScore, educationScore: matchResult.educationScore,
                            locationScore: matchResult.locationScore, reviewStatus: 'pending'
                        });
                    }
                }
            }

            matches.sort((a, b) => b.score - a.score);
            return { matchCount: matches.length, topMatches: JSON.stringify(matches.slice(0, limit)) };
        });

        // ----- Bound Actions on MatchResults -----

        this.on('review', 'MatchResults', async (req) => {
            const matchResultId = req.params[0];
            const { status, notes } = req.data;
            const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected'];
            if (!validStatuses.includes(status)) {
                req.error(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
                return;
            }
            await UPDATE(MatchResults).where({ ID: matchResultId }).set({
                reviewStatus: status, reviewNotes: notes || null,
                reviewedBy: req.user?.id || 'anonymous', reviewedAt: new Date().toISOString()
            });
            return SELECT.one.from(MatchResults).where({ ID: matchResultId });
        });

        // ----- Job/Matching Functions -----

        this.on('calculateMatch', (req) => this._delegateToJobModule(req, 'calculateMatch'));

        // batchMatch with ML semantic matching integration
        this.on('batchMatch', async (req) => {
            const { jobPostingId, candidateIds, minScore, useSemanticMatching } = req.data;
            const startTime = Date.now();

            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) {
                return { totalProcessed: 0, matchesCreated: 0, avgScore: 0, processingTime: 0, mlUsed: false };
            }

            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });
            let candidates;

            if (candidateIds && candidateIds.length > 0) {
                candidates = await SELECT.from(Candidates).where({ ID: { in: candidateIds } });
            } else {
                candidates = await SELECT.from(Candidates)
                    .where({ isDeleted: false })
                    .and({ status_code: { 'not in': ['rejected', 'withdrawn', 'archived'] } });
            }

            let matchesCreated = 0;
            let totalScore = 0;
            let mlUsed = false;
            let semanticScores = new Map();

            // Try ML semantic matching if enabled (default: true)
            const shouldUseML = useSemanticMatching !== false;
            if (shouldUseML) {
                try {
                    const mlResult = await this.mlClient.findSemanticMatches({
                        jobPostingId,
                        minScore: 0,
                        limit: 1000,
                        includeBreakdown: true,
                        excludeDisqualified: false
                    });

                    if (mlResult && mlResult.matches) {
                        mlUsed = true;
                        for (const match of mlResult.matches) {
                            semanticScores.set(match.candidate_id, {
                                cosineSimilarity: match.cosine_similarity || 0,
                                criteriaScore: match.criteria_score || 0,
                                combinedScore: match.combined_score || 0,
                                matchedCriteria: match.matched_criteria || [],
                                missingCriteria: match.missing_criteria || []
                            });
                        }
                        LOG.info('ML semantic matching used', { jobId: jobPostingId, mlMatches: mlResult.matches.length });
                    }
                } catch (mlError) {
                    LOG.warn('ML semantic matching unavailable, using rule-based', { error: mlError.message });
                }
            }

            // Process each candidate
            for (const candidate of candidates) {
                const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });
                const candidateEducations = await SELECT.from(Educations).where({ candidate_ID: candidate.ID });
                const candidateCertifications = await SELECT.from(Certifications).where({ candidate_ID: candidate.ID });

                const ruleBasedResult = this._calculateMatchScore(candidate, jobPosting, candidateSkills, requiredSkills);

                const semanticData = semanticScores.get(candidate.ID);
                let semanticScore = null;

                // Dynamic ML weight from job posting (default 60%)
                const mlWeight = jobPosting.mlWeight || 0.6;
                const ruleWeight = 1 - mlWeight;

                if (semanticData && mlUsed) {
                    semanticScore = semanticData.combinedScore;
                }

                // Prepare candidate data for rule evaluation
                const candidateData = {
                    ...candidate,
                    overallScore: ruleBasedResult.overallScore,
                    skillScore: ruleBasedResult.skillScore,
                    experienceScore: ruleBasedResult.experienceScore,
                    educationScore: ruleBasedResult.educationScore,
                    locationScore: ruleBasedResult.locationScore,
                    semanticScore: semanticScore || 0,
                    skills: candidateSkills,
                    educations: candidateEducations,
                    certifications: candidateCertifications
                };

                // Evaluate scoring rules
                const ruleResult = await this.ruleEngine.evaluateRules(
                    candidate.ID,
                    jobPostingId,
                    candidateData,
                    jobPosting
                );

                // Skip if disqualified by rules
                if (ruleResult.disqualified) {
                    LOG.info('Candidate disqualified by rule', {
                        candidateId: candidate.ID,
                        rule: ruleResult.disqualificationReason
                    });
                    continue;
                }

                // Apply rule modifications to scores
                let finalScores = {
                    overall: ruleBasedResult.overallScore,
                    skill: ruleResult.categoryScores?.skill || ruleBasedResult.skillScore,
                    experience: ruleResult.categoryScores?.experience || ruleBasedResult.experienceScore,
                    education: ruleResult.categoryScores?.education || ruleBasedResult.educationScore,
                    location: ruleResult.categoryScores?.location || ruleBasedResult.locationScore
                };

                // Apply overall score from rules if modified
                if (ruleResult.finalScore !== null && ruleResult.finalScore !== ruleResult.originalScore) {
                    finalScores.overall = ruleResult.finalScore;
                }

                // Combine with ML score using dynamic weights
                let finalScore = finalScores.overall;
                if (semanticData && mlUsed) {
                    finalScore = (finalScores.overall * ruleWeight) + (semanticScore * mlWeight);
                }

                if (finalScore >= (minScore || 0)) {
                    const existingMatch = await SELECT.one.from(MatchResults)
                        .where({ candidate_ID: candidate.ID, jobPosting_ID: jobPostingId });

                    const matchData = {
                        overallScore: Math.round(finalScore * 100) / 100,
                        skillScore: finalScores.skill,
                        experienceScore: finalScores.experience,
                        educationScore: finalScores.education,
                        locationScore: finalScores.location,
                        semanticScore: semanticScore,
                        mlAnalysis: semanticData ? JSON.stringify({
                            cosineSimilarity: semanticData.cosineSimilarity,
                            matchedCriteria: semanticData.matchedCriteria,
                            missingCriteria: semanticData.missingCriteria
                        }) : null,
                        rulesApplied: ruleResult.auditTrail ? JSON.stringify(ruleResult.auditTrail) : null,
                        preFilterPassed: ruleResult.preFilterPassed,
                        disqualifiedBy: null
                    };

                    if (existingMatch) {
                        await UPDATE(MatchResults).where({ ID: existingMatch.ID }).set(matchData);
                    } else {
                        await INSERT.into(MatchResults).entries({
                            ID: uuidv4(),
                            candidate_ID: candidate.ID,
                            jobPosting_ID: jobPostingId,
                            ...matchData,
                            reviewStatus: 'pending'
                        });
                    }
                    matchesCreated++;
                    totalScore += finalScore;
                }
            }

            return {
                totalProcessed: candidates.length,
                matchesCreated,
                avgScore: matchesCreated > 0 ? Math.round((totalScore / matchesCreated) * 100) / 100 : 0,
                processingTime: Date.now() - startTime,
                mlUsed
            };
        });
        this.on('rankCandidates', (req) => this._delegateToJobModule(req, 'rankCandidates'));
        this.on('sortCandidates', (req) => this._delegateToJobModule(req, 'sortCandidates'));
        this.on('filterCandidates', (req) => this._delegateToJobModule(req, 'filterCandidates'));
        this.on('getMatchDistribution', (req) => this._delegateToJobModule(req, 'getMatchDistribution'));
        this.on('analyzeSkillGaps', (req) => this._delegateToJobModule(req, 'analyzeSkillGaps'));
        this.on('explainMatch', (req) => this._delegateToJobModule(req, 'explainMatch'));
        this.on('getJobStatistics', (req) => this._delegateToJobModule(req, 'getJobStatistics'));
        this.on('compareCandidates', (req) => this._delegateToJobModule(req, 'compareCandidates'));

        // Analytics
        this.on('getPipelineOverview', (req) => this._delegateToJobModule(req, 'getPipelineOverview'));
        this.on('getInterviewAnalytics', (req) => this._delegateToJobModule(req, 'getInterviewAnalytics'));
        this.on('getUpcomingInterviews', (req) => this._delegateToJobModule(req, 'getUpcomingInterviews'));
        this.on('getSkillAnalytics', (req) => this._delegateToJobModule(req, 'getSkillAnalytics'));
        this.on('getRecruiterMetrics', (req) => this._delegateToJobModule(req, 'getRecruiterMetrics'));
        this.on('getTrends', (req) => this._delegateToJobModule(req, 'getTrends'));

        // Notifications
        this.on('setThreshold', (req) => this._delegateToJobModule(req, 'setThreshold'));
        this.on('getThreshold', (req) => this._delegateToJobModule(req, 'getThreshold'));
        this.on('deleteThreshold', (req) => this._delegateToJobModule(req, 'deleteThreshold'));
        this.on('checkAndNotify', (req) => this._delegateToJobModule(req, 'checkAndNotify'));
        this.on('triggerNotification', (req) => this._delegateToJobModule(req, 'triggerNotification'));
        this.on('getNotificationHistory', (req) => this._delegateToJobModule(req, 'getNotificationHistory'));
        this.on('getLastNotificationTime', (req) => this._delegateToJobModule(req, 'getLastNotificationTime'));
        this.on('recordNotification', (req) => this._delegateToJobModule(req, 'recordNotification'));
        this.on('getActiveThresholds', (req) => this._delegateToJobModule(req, 'getActiveThresholds'));
        this.on('batchCheckThresholds', (req) => this._delegateToJobModule(req, 'batchCheckThresholds'));

        // Admin
        this.on('importSkills', (req) => this._delegateToJobModule(req, 'importSkills'));
        this.on('recalculateAllMatches', (req) => this._delegateToJobModule(req, 'recalculateAllMatches'));
        this.on('cleanupData', (req) => this._delegateToJobModule(req, 'cleanupData'));
        this.on('healthCheck', (req) => this._delegateToJobModule(req, 'healthCheck'));

        // ----- Scoring Rule Engine Handlers -----

        // Evaluate rules for a specific candidate-job pair
        this.on('evaluateRulesForJob', async (req) => {
            const { jobPostingId, candidateId, includeAuditTrail } = req.data;

            const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });

            if (!candidate || !jobPosting) {
                return { totalRulesEvaluated: 0, rulesMatched: 0, error: 'Candidate or job not found' };
            }

            const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
            const candidateEducations = await SELECT.from(Educations).where({ candidate_ID: candidateId });
            const candidateCertifications = await SELECT.from(Certifications).where({ candidate_ID: candidateId });

            const candidateData = {
                ...candidate,
                skills: candidateSkills,
                educations: candidateEducations,
                certifications: candidateCertifications
            };

            const result = await this.ruleEngine.evaluateRules(candidateId, jobPostingId, candidateData, jobPosting);

            return {
                totalRulesEvaluated: result.totalRulesEvaluated,
                rulesMatched: result.rulesMatched,
                preFilterPassed: result.preFilterPassed,
                disqualified: result.disqualified,
                disqualificationReason: result.disqualificationReason,
                originalScore: result.originalScore,
                finalScore: result.finalScore,
                auditTrail: includeAuditTrail ? result.auditTrail : undefined
            };
        });

        // Validate rule syntax
        this.on('validateRuleSyntax', async (req) => {
            const { conditions, actions } = req.data;
            return this.ruleEngine.validateRuleSyntax(conditions, actions);
        });

        // Apply template to job
        this.on('applyTemplateToJob', async (req) => {
            const { jobPostingId, templateId, replaceExisting } = req.data;

            const { ScoringRules, JobPostings } = cds.entities('cv.sorting');

            // Get template rules
            const templateRules = await SELECT.from(ScoringRules).where({ template_ID: templateId, isActive: true });

            if (replaceExisting) {
                // Delete existing custom rules
                await DELETE.from(ScoringRules).where({ jobPosting_ID: jobPostingId });
            }

            // Update job to use this template
            await UPDATE(JobPostings).where({ ID: jobPostingId }).set({ scoringTemplate_ID: templateId });

            return {
                success: true,
                rulesApplied: templateRules.length
            };
        });

        // Dry-run matching with test rules
        this.on('dryRunMatching', async (req) => {
            const { jobPostingId, candidateIds, testRules } = req.data;

            const candidates = candidateIds && candidateIds.length > 0
                ? await SELECT.from(Candidates).where({ ID: { in: candidateIds } })
                : await SELECT.from(Candidates).limit(10); // Test with first 10

            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });

            const results = [];

            for (const candidate of candidates) {
                const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });
                const candidateEducations = await SELECT.from(Educations).where({ candidate_ID: candidate.ID });
                const candidateCertifications = await SELECT.from(Certifications).where({ candidate_ID: candidate.ID });

                const ruleBasedResult = this._calculateMatchScore(candidate, jobPosting, candidateSkills, requiredSkills);

                const candidateData = {
                    ...candidate,
                    overallScore: ruleBasedResult.overallScore,
                    skills: candidateSkills,
                    educations: candidateEducations,
                    certifications: candidateCertifications
                };

                // Create temporary rule engine with test rules
                const tempRuleEngine = new RuleEngine(cds.db);

                // Override the loadApplicableRules method for dry-run
                const originalLoad = tempRuleEngine.loadApplicableRules;
                tempRuleEngine.loadApplicableRules = async () => {
                    return testRules.map(rule => ({
                        ...rule,
                        ID: uuidv4(),
                        isActive: true,
                        conditions: tempRuleEngine.parseJSON(rule.conditions),
                        actions: tempRuleEngine.parseJSON(rule.actions)
                    }));
                };

                const ruleResult = await tempRuleEngine.evaluateRules(
                    candidate.ID,
                    jobPostingId,
                    candidateData,
                    jobPosting
                );

                results.push({
                    candidateId: candidate.ID,
                    currentScore: ruleBasedResult.overallScore,
                    projectedScore: ruleResult.finalScore || ruleBasedResult.overallScore,
                    scoreDelta: (ruleResult.finalScore || ruleBasedResult.overallScore) - ruleBasedResult.overallScore,
                    rulesApplied: ruleResult.rulesMatched,
                    wouldBeDisqualified: ruleResult.disqualified
                });
            }

            return results;
        });

        // Create rule template
        this.on('createRuleTemplate', async (req) => {
            const { name, description, category, rules } = req.data;

            const { ScoringRuleTemplates, ScoringRules } = cds.entities('cv.sorting');

            const templateId = uuidv4();

            await INSERT.into(ScoringRuleTemplates).entries({
                ID: templateId,
                name,
                description,
                category,
                isGlobal: true,
                isActive: true
            });

            let rulesCreated = 0;
            for (const rule of rules) {
                await INSERT.into(ScoringRules).entries({
                    ID: uuidv4(),
                    template_ID: templateId,
                    name: rule.name,
                    description: rule.description,
                    ruleType: rule.ruleType,
                    priority: rule.priority || 50,
                    isActive: true,
                    conditions: rule.conditions,
                    actions: rule.actions,
                    stopOnMatch: false
                });
                rulesCreated++;
            }

            return {
                templateId,
                rulesCreated
            };
        });

        // Get rule templates
        this.on('getRuleTemplates', async (req) => {
            const { category, isGlobal } = req.data;

            const { ScoringRuleTemplates, ScoringRules } = cds.entities('cv.sorting');

            let query = SELECT.from(ScoringRuleTemplates);

            if (category) {
                query = query.where({ category });
            }

            if (isGlobal !== undefined) {
                query = query.where({ isGlobal });
            }

            const templates = await query;

            const results = [];
            for (const template of templates) {
                const rules = await SELECT.from(ScoringRules).where({ template_ID: template.ID });
                const jobs = await SELECT.from(JobPostings).where({ scoringTemplate_ID: template.ID });

                results.push({
                    templateId: template.ID,
                    name: template.name,
                    description: template.description,
                    category: template.category,
                    ruleCount: rules.length,
                    usageCount: jobs.length
                });
            }

            return results;
        });

        // ScoringRuleTemplates actions
        this.on('activate', 'ScoringRuleTemplates', async (req) => {
            const { ID } = req.params[0];
            await UPDATE('cv.sorting.ScoringRuleTemplates').where({ ID }).set({ isActive: true });
            return SELECT.one.from('cv.sorting.ScoringRuleTemplates').where({ ID });
        });

        this.on('deactivate', 'ScoringRuleTemplates', async (req) => {
            const { ID } = req.params[0];
            await UPDATE('cv.sorting.ScoringRuleTemplates').where({ ID }).set({ isActive: false });
            return SELECT.one.from('cv.sorting.ScoringRuleTemplates').where({ ID });
        });

        this.on('duplicate', 'ScoringRuleTemplates', async (req) => {
            const { ID } = req.params[0];
            const { newName } = req.data;

            const { ScoringRuleTemplates, ScoringRules } = cds.entities('cv.sorting');

            const original = await SELECT.one.from(ScoringRuleTemplates).where({ ID });
            const rules = await SELECT.from(ScoringRules).where({ template_ID: ID });

            const newTemplateId = uuidv4();

            await INSERT.into(ScoringRuleTemplates).entries({
                ID: newTemplateId,
                name: newName || `${original.name} (Copy)`,
                description: original.description,
                category: original.category,
                isGlobal: original.isGlobal,
                isActive: true
            });

            for (const rule of rules) {
                await INSERT.into(ScoringRules).entries({
                    ID: uuidv4(),
                    template_ID: newTemplateId,
                    name: rule.name,
                    description: rule.description,
                    ruleType: rule.ruleType,
                    priority: rule.priority,
                    isActive: rule.isActive,
                    conditions: rule.conditions,
                    actions: rule.actions,
                    executionOrder: rule.executionOrder,
                    stopOnMatch: rule.stopOnMatch
                });
            }

            return SELECT.one.from(ScoringRuleTemplates).where({ ID: newTemplateId });
        });

        // ScoringRules actions
        this.on('activate', 'ScoringRules', async (req) => {
            const { ID } = req.params[0];
            await UPDATE('cv.sorting.ScoringRules').where({ ID }).set({ isActive: true });
            return SELECT.one.from('cv.sorting.ScoringRules').where({ ID });
        });

        this.on('deactivate', 'ScoringRules', async (req) => {
            const { ID } = req.params[0];
            await UPDATE('cv.sorting.ScoringRules').where({ ID }).set({ isActive: false });
            return SELECT.one.from('cv.sorting.ScoringRules').where({ ID });
        });

        this.on('testRule', 'ScoringRules', async (req) => {
            const { ID } = req.params[0];
            const { candidateData, jobData } = req.data;

            const rule = await SELECT.one.from('cv.sorting.ScoringRules').where({ ID });

            const condObj = this.ruleEngine.parseJSON(rule.conditions);
            const actObj = this.ruleEngine.parseJSON(rule.actions);

            const candidateDataParsed = typeof candidateData === 'string' ? JSON.parse(candidateData) : candidateData;
            const jobDataParsed = typeof jobData === 'string' ? JSON.parse(jobData) : jobData;

            const wouldMatch = this.ruleEngine.evaluateConditions(condObj, candidateDataParsed, jobDataParsed);

            let actionResult = null;
            let beforeScore = candidateDataParsed.overallScore || 70;
            let afterScore = beforeScore;

            if (wouldMatch) {
                const scores = { overall: beforeScore };
                actionResult = this.ruleEngine.executeAction(actObj, scores, candidateDataParsed, jobDataParsed);

                if (actionResult.overallModifier) {
                    afterScore = this.ruleEngine.applyModifier(beforeScore, actionResult.overallModifier);
                }
            }

            return {
                wouldMatch,
                conditionResult: wouldMatch,
                actionResult: actionResult ? actionResult.description : 'No action (condition not met)',
                beforeScore,
                afterScore
            };
        });

        // Calculate virtual criticality fields
        this.after('READ', 'JobPostings', (jobs) => {
            if (!jobs) return;
            const jobList = Array.isArray(jobs) ? jobs : [jobs];
            jobList.forEach(job => {
                if (job.status) {
                    // Criticality: 1=negative(red), 2=critical(orange), 3=positive(green), 0=neutral(grey)
                    switch (job.status) {
                        case 'published':
                        case 'open':
                            job.statusCriticality = 3; // green
                            break;
                        case 'draft':
                            job.statusCriticality = 2; // orange
                            break;
                        case 'closed':
                            job.statusCriticality = 0; // grey
                            break;
                        default:
                            job.statusCriticality = 0;
                    }
                }
            });
        });

        this.after('READ', 'MatchResults', (matches) => {
            if (!matches) return;
            const matchList = Array.isArray(matches) ? matches : [matches];
            matchList.forEach(match => {
                // Calculate score criticality based on overallScore
                if (match.overallScore !== null && match.overallScore !== undefined) {
                    if (match.overallScore >= 80) {
                        match.scoreCriticality = 3; // green - excellent match
                    } else if (match.overallScore >= 60) {
                        match.scoreCriticality = 2; // orange - good match
                    } else if (match.overallScore >= 40) {
                        match.scoreCriticality = 0; // grey - mediocre match
                    } else {
                        match.scoreCriticality = 1; // red - poor match
                    }
                }

                // Calculate review status criticality
                if (match.reviewStatus) {
                    switch (match.reviewStatus) {
                        case 'approved':
                        case 'shortlisted':
                            match.reviewStatusCriticality = 3; // green
                            break;
                        case 'under_review':
                        case 'pending':
                            match.reviewStatusCriticality = 2; // orange
                            break;
                        case 'rejected':
                            match.reviewStatusCriticality = 1; // red
                            break;
                        default:
                            match.reviewStatusCriticality = 0; // grey
                    }
                }
            });
        });

        LOG.info('Job domain handlers registered');
    }

    // ================================================================
    // AI/ML DOMAIN REGISTRATION
    // ================================================================

    _registerAIHandlers(entities) {
        // All AI handlers delegated to AIHandlers module for full implementation

        // Joule chat
        this.on('chat', (req) => this._delegateToAIModule(req, 'handleChat'));
        this.on('searchWithNaturalLanguage', (req) => this._delegateToAIModule(req, 'handleNLSearch'));
        this.on('applyNaturalLanguageFilter', (req) => this._delegateToAIModule(req, 'handleNLFilter'));
        this.on('applyNaturalLanguageSort', (req) => this._delegateToAIModule(req, 'handleNLSort'));

        // Joule analysis
        this.on('generateCandidateSummary', (req) => this._delegateToAIModule(req, 'handleGenerateSummary'));
        this.on('analyzeJobFit', (req) => this._delegateToAIModule(req, 'handleAnalyzeJobFit'));
        this.on('generateInterviewQuestions', (req) => this._delegateToAIModule(req, 'handleGenerateQuestions'));
        this.on('analyzePool', (req) => this._delegateToAIModule(req, 'handleAnalyzePool'));
        this.on('compareWithInsights', (req) => this._delegateToAIModule(req, 'handleCompareWithInsights'));

        // Joule insights
        this.on('getProactiveInsights', (req) => this._delegateToAIModule(req, 'handleProactiveInsights'));
        this.on('getJobInsights', (req) => this._delegateToAIModule(req, 'handleJobInsights'));
        this.on('detectIssues', (req) => this._delegateToAIModule(req, 'handleDetectIssues'));

        // Joule feedback
        this.on('provideFeedback', (req) => this._delegateToAIModule(req, 'handleFeedback'));
        this.on('learnFromDecision', (req) => this._delegateToAIModule(req, 'handleLearnFromDecision'));

        // Joule utilities
        this.on('quickStat', (req) => this._delegateToAIModule(req, 'handleQuickStat'));
        this.on('getConversationHistory', (req) => this._delegateToAIModule(req, 'handleGetHistory'));
        this.on('getSuggestedQueries', (req) => this._delegateToAIModule(req, 'handleGetSuggestions'));

        // ML embeddings
        this.on('generateCandidateEmbedding', (req) => this._delegateToAIModule(req, 'handleGenerateCandidateEmbedding'));
        this.on('generateJobEmbedding', (req) => this._delegateToAIModule(req, 'handleGenerateJobEmbedding'));
        this.on('bulkGenerateEmbeddings', (req) => this._delegateToAIModule(req, 'handleBulkGenerateEmbeddings'));

        // ML semantic matching
        this.on('findSemanticMatches', (req) => this._delegateToAIModule(req, 'handleFindSemanticMatches'));
        this.on('calculateSingleMatch', (req) => this._delegateToAIModule(req, 'handleCalculateSingleMatch'));
        this.on('semanticSearch', (req) => this._delegateToAIModule(req, 'handleSemanticSearch'));

        // ML OCR
        this.on('processDocumentOCR', (req) => this._delegateToAIModule(req, 'handleProcessDocumentOCR'));

        // OCR Processing Actions
        const ocrHandler = require('./handlers/ocr-handler');
        this.on('uploadAndProcessCV', ocrHandler.uploadAndProcessCV);
        this.on('uploadBatchCVs', ocrHandler.uploadBatchCVs);
        this.on('getBatchProgress', ocrHandler.getBatchProgress);
        this.on('reviewAndCreateCandidate', ocrHandler.reviewAndCreateCandidate);

        // ML scoring criteria
        this.on('getScoringCriteria', (req) => this._delegateToAIModule(req, 'handleGetScoringCriteria'));
        this.on('setScoringCriteria', (req) => this._delegateToAIModule(req, 'handleSetScoringCriteria'));
        this.on('addCriterion', (req) => this._delegateToAIModule(req, 'handleAddCriterion'));
        this.on('deleteCriterion', (req) => this._delegateToAIModule(req, 'handleDeleteCriterion'));
        this.on('calculateCriteriaScore', (req) => this._delegateToAIModule(req, 'handleCalculateCriteriaScore'));
        this.on('getCriteriaTemplates', (req) => this._delegateToAIModule(req, 'handleGetCriteriaTemplates'));

        // ML health
        this.on('getMLServiceHealth', (req) => this._delegateToAIModule(req, 'handleGetMLServiceHealth'));

        LOG.info('AI domain handlers registered');
    }

    // ================================================================
    // EMAIL NOTIFICATION HANDLERS
    // ================================================================

    _registerEmailNotificationHandlers(entities) {
        const { Candidates, CandidateStatusHistory, EmailNotifications, CandidateStatuses } = entities;

        /**
         * Get candidates with pending status change notifications
         * Queries for status changes without corresponding sent email notifications
         */
        this.on('getPendingStatusNotifications', async (req) => {
            try {
                const db = cds.db;
                const { CandidateStatusHistory, Candidates, EmailNotifications } = db.entities('cv.sorting');

                // Get status changes from last 24 hours
                const windowHours = parseInt(process.env.NOTIFICATION_WINDOW_HOURS) || 24;
                const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);

                const statusChanges = await SELECT.from(CandidateStatusHistory)
                    .where`changedAt >= ${cutoffTime.toISOString()}`
                    .orderBy`changedAt desc`;

                if (!statusChanges || statusChanges.length === 0) {
                    LOG.info('No recent status changes found');
                    return [];
                }

                // Batch query 1: Get all status history IDs that already have sent notifications
                const statusHistoryIds = statusChanges.map(s => s.ID);
                const sentNotifications = await SELECT.from(EmailNotifications)
                    .columns('statusHistory_ID')
                    .where({
                        statusHistory_ID: { in: statusHistoryIds },
                        notificationType: 'status_changed',
                        deliveryStatus: 'sent'
                    });

                const sentStatusHistoryIds = new Set(
                    sentNotifications.map(n => n.statusHistory_ID).filter(Boolean)
                );

                // Filter out status changes that already have sent notifications
                const pendingStatusChanges = statusChanges.filter(
                    sc => !sentStatusHistoryIds.has(sc.ID)
                );

                if (pendingStatusChanges.length === 0) {
                    LOG.info('All status changes already have sent notifications');
                    return [];
                }

                // Batch query 2: Get candidate emails for all pending changes
                const candidateIds = [...new Set(pendingStatusChanges.map(sc => sc.candidate_ID))];
                const candidates = await SELECT.from(Candidates)
                    .columns(['ID', 'email'])
                    .where({ ID: { in: candidateIds } });

                const candidateMap = new Map(candidates.map(c => [c.ID, c]));

                // Build result with email validation
                const pendingNotifications = [];
                for (const statusChange of pendingStatusChanges) {
                    const candidate = candidateMap.get(statusChange.candidate_ID);

                    // Validate email exists and is not empty
                    if (candidate && candidate.email && candidate.email.trim() && candidate.email.includes('@')) {
                        pendingNotifications.push({
                            candidate_ID: statusChange.candidate_ID,
                            statusHistory_ID: statusChange.ID,
                            previousStatus: statusChange.previousStatus_code || null,
                            newStatus: statusChange.newStatus_code,
                            changedAt: statusChange.changedAt,
                            recipientEmail: candidate.email
                        });
                    }
                }

                LOG.info('Pending status notifications', {
                    total: statusChanges.length,
                    pending: pendingNotifications.length,
                    alreadySent: sentStatusHistoryIds.size
                });

                return pendingNotifications;

            } catch (error) {
                LOG.error('Error in getPendingStatusNotifications', { error: error.message });
                throw error;
            }
        });

        /**
         * Mark notification as sent after n8n successfully delivers email
         * Action is idempotent - can be called multiple times safely
         */
        this.on('markNotificationSent', async (req) => {
            try {
                const {
                    statusHistory_ID,
                    candidate_ID,
                    jobPosting_ID,
                    recipientEmail,
                    subject,
                    templateUsed,
                    n8nExecutionId
                } = req.data;

                // Validate required parameters
                if (!statusHistory_ID || !candidate_ID || !recipientEmail) {
                    LOG.warn('markNotificationSent: Missing required parameters');
                    return {
                        success: false,
                        notificationId: null,
                        error: 'Missing required parameters: statusHistory_ID, candidate_ID, and recipientEmail'
                    };
                }

                // Validate email format
                if (!recipientEmail.includes('@') || recipientEmail.trim().length < 5 || recipientEmail.length > 255) {
                    LOG.warn('markNotificationSent: Invalid email format', { recipientEmail });
                    return {
                        success: false,
                        notificationId: null,
                        error: 'Invalid email format or length'
                    };
                }

                // Validate UUID formats
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(statusHistory_ID) || !uuidRegex.test(candidate_ID)) {
                    LOG.warn('markNotificationSent: Invalid UUID format');
                    return {
                        success: false,
                        notificationId: null,
                        error: 'Invalid UUID format for statusHistory_ID or candidate_ID'
                    };
                }

                // Validate optional jobPosting_ID if provided
                if (jobPosting_ID && !uuidRegex.test(jobPosting_ID)) {
                    LOG.warn('markNotificationSent: Invalid jobPosting_ID UUID format');
                    return {
                        success: false,
                        notificationId: null,
                        error: 'Invalid UUID format for jobPosting_ID'
                    };
                }

                // Validate string lengths
                if (subject && subject.length > 500) {
                    LOG.warn('markNotificationSent: Subject too long', { length: subject.length });
                    return {
                        success: false,
                        notificationId: null,
                        error: 'Subject exceeds maximum length of 500 characters'
                    };
                }

                if (templateUsed && templateUsed.length > 100) {
                    LOG.warn('markNotificationSent: Template name too long');
                    return {
                        success: false,
                        notificationId: null,
                        error: 'Template name exceeds maximum length of 100 characters'
                    };
                }

                if (n8nExecutionId && n8nExecutionId.length > 100) {
                    LOG.warn('markNotificationSent: Execution ID too long');
                    return {
                        success: false,
                        notificationId: null,
                        error: 'Execution ID exceeds maximum length of 100 characters'
                    };
                }

                const db = cds.db;
                const { EmailNotifications } = db.entities('cv.sorting');

                // Check if notification already exists (idempotency)
                if (statusHistory_ID && n8nExecutionId) {
                    const existing = await SELECT.one.from(EmailNotifications)
                        .where({
                            statusHistory_ID: statusHistory_ID,
                            n8nExecutionId: n8nExecutionId,
                            deliveryStatus: 'sent'
                        });

                    if (existing) {
                        LOG.info('Notification already marked as sent (idempotent)', {
                            notificationId: existing.ID,
                            statusHistory_ID,
                            n8nExecutionId
                        });
                        return {
                            success: true,
                            notificationId: existing.ID
                        };
                    }
                }

                // Create new notification record
                const notificationId = uuidv4();
                const now = new Date();

                await INSERT.into(EmailNotifications).entries({
                    ID: notificationId,
                    candidate_ID: candidate_ID,
                    jobPosting_ID: jobPosting_ID || null,
                    statusHistory_ID: statusHistory_ID,
                    notificationType: 'status_changed',
                    recipientEmail: recipientEmail,
                    subject: subject || null,
                    templateUsed: templateUsed || null,
                    sentAt: now,
                    deliveryStatus: 'sent',
                    n8nExecutionId: n8nExecutionId || null
                });

                LOG.info('Email notification marked as sent', {
                    notificationId,
                    statusHistory_ID,
                    candidate_ID,
                    recipientEmail,
                    n8nExecutionId
                });

                return {
                    success: true,
                    notificationId: notificationId
                };

            } catch (error) {
                LOG.error('Error in markNotificationSent', {
                    error: error.message,
                    stack: error.stack,
                    data: req.data
                });

                // Return error response
                return {
                    success: false,
                    notificationId: null,
                    error: error.message
                };
            }
        });

        // Handler for n8n polling - get interviews needing reminders
        this.on('getPendingInterviewReminders', async (req) => {
            const { Interviews, Candidates, JobPostings } = this.entities;

            try {
                // Get interviews scheduled 24-48 hours from now that haven't had reminders sent
                const now = new Date();
                const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

                const interviews = await SELECT.from(Interviews)
                    .where({
                        scheduledAt: { '>=': in24Hours.toISOString(), '<=': in48Hours.toISOString() },
                        status_code: { in: ['scheduled', 'confirmed'] },
                        reminderSent: { '=': false, or: { '=': null } }
                    });

                // Expand with candidate and job details
                const results = [];
                for (const interview of interviews) {
                    const candidate = await SELECT.one.from(Candidates)
                        .where({ ID: interview.candidate_ID });

                    let jobTitle = null;
                    if (interview.jobPosting_ID) {
                        const job = await SELECT.one.from(JobPostings)
                            .columns('title')
                            .where({ ID: interview.jobPosting_ID });
                        jobTitle = job?.title;
                    }

                    if (candidate?.email) {
                        results.push({
                            interviewId: interview.ID,
                            candidateId: candidate.ID,
                            candidateEmail: candidate.email,
                            candidateName: `${candidate.firstName} ${candidate.lastName}`,
                            jobTitle: jobTitle,
                            scheduledAt: interview.scheduledAt,
                            interviewTitle: interview.title,
                            location: interview.location,
                            meetingLink: interview.meetingLink,
                            interviewerName: interview.interviewer,
                            interviewerEmail: interview.interviewerEmail
                        });
                    }
                }

                LOG.info(`Found ${results.length} interviews pending reminders`);
                return results;

            } catch (error) {
                LOG.error('Error in getPendingInterviewReminders:', error);
                throw error;
            }
        });

        // Handler for n8n callback - mark interview reminder as sent
        this.on('markInterviewReminderSent', async (req) => {
            const { interviewId } = req.data;
            const { Interviews } = this.entities;

            try {
                const result = await UPDATE(Interviews)
                    .where({ ID: interviewId })
                    .set({
                        reminderSent: true,
                        reminderSentAt: new Date().toISOString()
                    });

                if (result === 1) {
                    LOG.info('Interview reminder marked as sent', { interviewId });
                    return true;
                } else {
                    LOG.warn('Interview not found for reminder update', { interviewId });
                    return false;
                }
            } catch (error) {
                LOG.error('Error marking reminder sent:', { interviewId, error: error.message });
                throw error;
            }
        });

        // Handler for n8n callback - log email notification
        this.on('logEmailNotification', async (req) => {
            const { EmailNotifications } = this.entities;
            const {
                candidateId,
                jobPostingId,
                notificationType,
                recipientEmail,
                subject,
                templateUsed,
                deliveryStatus
            } = req.data;

            try {
                const notification = {
                    candidate_ID: candidateId,
                    jobPosting_ID: jobPostingId || null,
                    notificationType,
                    recipientEmail,
                    subject,
                    templateUsed,
                    sentAt: new Date().toISOString(),
                    deliveryStatus: deliveryStatus || 'sent'
                };

                const result = await INSERT.into(EmailNotifications).entries(notification);

                LOG.info('Email notification logged', {
                    notificationType,
                    recipientEmail,
                    deliveryStatus
                });

                return result.req.data.ID || notification.ID;
            } catch (error) {
                LOG.error('Error logging email notification:', error);
                throw error;
            }
        });

        LOG.info('Email notification handlers registered');
    }

    // ================================================================
    // DELEGATION HELPERS
    // ================================================================

    async _delegateToCandidateModule(req, handlerName) {
        const handler = CandidateHandlers.prototype[handlerName];
        if (handler) {
            return handler.call({ entities: this.entities, emit: this.emit.bind(this) }, req);
        }
        LOG.warn(`Candidate handler ${handlerName} not found`);
    }

    async _delegateToJobModule(req, handlerName) {
        const { Candidates, Interviews, CandidateSkills, Skills, JobPostings } = this.entities;

        // Implement analytics functions that were defined in job-service.js
        try {
            switch (handlerName) {
                case 'getPipelineOverview': {
                    const { fromDate, toDate } = req.data;

                    const totalResult = await SELECT.one`count(*) as count`.from(Candidates).where`isDeleted = false`;
                    const totalCandidates = totalResult?.count || 0;

                    const statusResults = await SELECT`status_code as status, count(*) as count`
                        .from(Candidates)
                        .where`isDeleted = false`
                        .groupBy`status_code`;

                    const byStatus = statusResults.map(row => ({
                        status: row.status || 'Unknown',
                        count: parseInt(row.count) || 0
                    }));

                    const sourceResults = await SELECT`source, count(*) as count`
                        .from(Candidates)
                        .where`isDeleted = false AND source IS NOT NULL`
                        .groupBy`source`;

                    const bySource = sourceResults.map(row => ({
                        source: row.source || 'Unknown',
                        count: parseInt(row.count) || 0
                    }));

                    const hiredCandidates = await SELECT`createdAt, modifiedAt`
                        .from(Candidates)
                        .where`status_code = 'hired' AND isDeleted = false`
                        .limit(100);

                    let avgTimeToHire = 0;
                    if (hiredCandidates.length > 0) {
                        const totalDays = hiredCandidates.reduce((sum, c) => {
                            if (c.createdAt && c.modifiedAt) {
                                const created = new Date(c.createdAt);
                                const modified = new Date(c.modifiedAt);
                                const diffDays = Math.ceil((modified - created) / (1000 * 60 * 60 * 24));
                                return sum + Math.max(diffDays, 1);
                            }
                            return sum + 14;
                        }, 0);
                        avgTimeToHire = Math.round(totalDays / hiredCandidates.length);
                    }

                    const statusOrder = ['new', 'screening', 'interviewing', 'shortlisted', 'offered', 'hired'];
                    const statusCounts = {};
                    byStatus.forEach(s => { statusCounts[s.status?.toLowerCase()] = s.count; });

                    const conversionRates = {};
                    for (let i = 0; i < statusOrder.length - 1; i++) {
                        const fromStatus = statusOrder[i];
                        const toStatus = statusOrder[i + 1];
                        const fromCount = statusCounts[fromStatus] || 0;
                        const toCount = statusCounts[toStatus] || 0;
                        if (fromCount > 0) {
                            conversionRates[`${fromStatus}_to_${toStatus}`] = Math.round((toCount / fromCount) * 100);
                        }
                    }

                    return {
                        totalCandidates: parseInt(totalCandidates),
                        byStatus,
                        bySource,
                        avgTimeToHire: parseFloat(avgTimeToHire.toFixed(2)),
                        conversionRates: JSON.stringify(conversionRates)
                    };
                }

                case 'getInterviewAnalytics': {
                    const { fromDate, toDate } = req.data;

                    try {
                        const interviews = await SELECT.from(Interviews);

                        const statusCounts = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
                        interviews.forEach(interview => {
                            const status = interview.status_code?.toLowerCase() || 'scheduled';
                            if (statusCounts.hasOwnProperty(status)) {
                                statusCounts[status]++;
                            }
                        });

                        let totalScheduled = statusCounts.scheduled + statusCounts.confirmed + statusCounts.completed;
                        let completed = statusCounts.completed;
                        let cancelled = statusCounts.cancelled;
                        let noShow = statusCounts.no_show;

                        let completionRate = 0;
                        if (totalScheduled > 0) {
                            completionRate = parseFloat(((completed / totalScheduled) * 100).toFixed(2));
                        }

                        const completedInterviews = interviews.filter(i => i.status_code === 'completed');
                        let avgOverallRating = 0;
                        let avgTechnicalRating = 0;
                        let avgCommunicationRating = 0;
                        let avgCultureFitRating = 0;

                        if (completedInterviews.length > 0) {
                            const sumOverall = completedInterviews.reduce((s, i) => s + (i.overallRating || 0), 0);
                            const sumTechnical = completedInterviews.reduce((s, i) => s + (i.technicalRating || 0), 0);
                            const sumCommunication = completedInterviews.reduce((s, i) => s + (i.communicationRating || 0), 0);
                            const sumCulture = completedInterviews.reduce((s, i) => s + (i.cultureFitRating || 0), 0);

                            avgOverallRating = parseFloat((sumOverall / completedInterviews.length).toFixed(2));
                            avgTechnicalRating = parseFloat((sumTechnical / completedInterviews.length).toFixed(2));
                            avgCommunicationRating = parseFloat((sumCommunication / completedInterviews.length).toFixed(2));
                            avgCultureFitRating = parseFloat((sumCulture / completedInterviews.length).toFixed(2));
                        }

                        const upcomingInterviews = interviews.filter(i => {
                            return (i.status_code === 'scheduled' || i.status_code === 'confirmed') &&
                                   i.scheduledAt && new Date(i.scheduledAt) > new Date();
                        });

                        return {
                            totalScheduled,
                            completed,
                            cancelled,
                            noShow,
                            avgOverallRating,
                            avgTechnicalRating,
                            avgCommunicationRating,
                            avgCultureFitRating,
                            ratingsByType: [],
                            upcomingCount: upcomingInterviews.length,
                            completionRate
                        };
                    } catch (error) {
                        LOG.error('Error in getInterviewAnalytics:', error);
                        return {
                            totalScheduled: 0, completed: 0, cancelled: 0, noShow: 0,
                            avgOverallRating: 0, avgTechnicalRating: 0, avgCommunicationRating: 0, avgCultureFitRating: 0,
                            ratingsByType: [], upcomingCount: 0, completionRate: 0
                        };
                    }
                }

                case 'getSkillAnalytics': {
                    const { topN = 10 } = req.data;

                    const candidateSkillCounts = await SELECT`skill_ID as skillId, count(*) as count`
                        .from(CandidateSkills).groupBy`skill_ID`.orderBy`count desc`.limit(topN);

                    const skillIds = candidateSkillCounts.map(s => s.skillId).filter(Boolean);

                    let skillNameMap = {};
                    if (skillIds.length > 0) {
                        const skillEntities = await SELECT.from(Skills).where({ ID: { in: skillIds } });
                        skillNameMap = Object.fromEntries(skillEntities.map(s => [s.ID, s.name]));
                    }

                    const topSkills = candidateSkillCounts.map(s => ({
                        skillName: skillNameMap[s.skillId] || 'Unknown Skill',
                        candidateCount: parseInt(s.count) || 0,
                        demandCount: 0,
                        supplyDemandRatio: 1.0
                    }));

                    return {
                        topSkills,
                        emergingSkills: [],
                        skillGaps: []
                    };
                }

                case 'getRecruiterMetrics': {
                    const { recruiterId, fromDate, toDate } = req.data;

                    let conditions = { isDeleted: false };
                    if (recruiterId) conditions.createdBy = recruiterId;

                    const candidatesResult = await SELECT.one`count(*) as count`.from(Candidates).where(conditions);
                    const candidatesProcessed = candidatesResult?.count || 0;

                    const hiredResult = await SELECT.one`count(*) as count`.from(Candidates)
                        .where({ ...conditions, status_code: 'hired' });
                    const hiredCount = hiredResult?.count || 0;

                    const hireRate = candidatesProcessed > 0 ?
                        parseFloat(((hiredCount / candidatesProcessed) * 100).toFixed(2)) : 0;

                    // Get job postings for recruiter metrics
                    const jobsResult = await SELECT.one`count(*) as total, count(CASE WHEN status = 'open' THEN 1 END) as active`
                        .from(JobPostings)
                        .where({ isDeleted: false });

                    return {
                        candidatesProcessed,
                        averageTimeInStage: '{"screening":5,"interviewing":10,"offered":3}',
                        hireRate,
                        qualityScore: 75.0,
                        totalJobPostings: jobsResult?.total || 0,
                        activeJobPostings: jobsResult?.active || 0
                    };
                }

                default:
                    LOG.warn(`Job handler ${handlerName} not implemented`);
                    return null;
            }
        } catch (error) {
            LOG.error(`Error in ${handlerName}:`, error);
            return null;
        }
    }

    async _delegateToAIModule(req, handlerName) {
        const handler = AIHandlers.prototype[handlerName];
        if (handler) {
            const context = {
                entities: this.entities,
                mlClient: this.mlClient,
                aiCore: this.aiCore,
                emit: this.emit.bind(this)
            };
            return handler.call(context, req);
        }
        LOG.warn(`AI handler ${handlerName} not found`);
    }

    // ================================================================
    // SHARED UTILITY METHODS (used across domains)
    // ================================================================

    _getValidStatusTransitions(currentStatus) {
        const transitions = {
            'new': ['screening', 'rejected', 'withdrawn'],
            'screening': ['interviewing', 'rejected', 'withdrawn'],
            'interviewing': ['shortlisted', 'rejected', 'withdrawn'],
            'shortlisted': ['offered', 'rejected', 'withdrawn'],
            'offered': ['hired', 'rejected', 'withdrawn'],
            'hired': [],
            'rejected': ['new'],
            'withdrawn': ['new']
        };
        return transitions[currentStatus] || [];
    }

    _calculateMatchScore(candidate, jobPosting, candidateSkills, requiredSkills) {
        const weights = {
            skill: jobPosting.skillWeight || 0.40,
            experience: jobPosting.experienceWeight || 0.30,
            education: jobPosting.educationWeight || 0.20,
            location: jobPosting.locationWeight || 0.10
        };

        const skillScore = this._calculateSkillScore(candidateSkills, requiredSkills);
        const experienceScore = this._calculateExperienceScore(
            candidate.totalExperienceYears, jobPosting.minimumExperience, jobPosting.preferredExperience);
        const educationScore = this._calculateEducationScore(candidate.educationLevel, jobPosting.requiredEducation_code);
        const locationScore = this._calculateLocationScore(candidate.city, jobPosting.location, jobPosting.locationType);

        const overallScore = (skillScore * weights.skill) + (experienceScore * weights.experience) +
                            (educationScore * weights.education) + (locationScore * weights.location);

        return {
            overallScore: Math.round(overallScore * 100) / 100,
            skillScore: Math.round(skillScore * 100) / 100,
            experienceScore: Math.round(experienceScore * 100) / 100,
            educationScore: Math.round(educationScore * 100) / 100,
            locationScore: Math.round(locationScore * 100) / 100
        };
    }

    _calculateSkillScore(candidateSkills, requiredSkills) {
        if (!requiredSkills?.length) return 100;
        if (!candidateSkills?.length) return 0;

        const candidateSkillIds = new Set(candidateSkills.map(s => s.skill_ID));
        let totalWeight = 0, matchedWeight = 0;

        for (const required of requiredSkills) {
            const weight = required.isRequired ? (required.weight || 1.0) * 2 : (required.weight || 1.0);
            totalWeight += weight;

            if (candidateSkillIds.has(required.skill_ID)) {
                const candidateSkill = candidateSkills.find(s => s.skill_ID === required.skill_ID);
                const proficiencyMultiplier = this._getProficiencyMultiplier(candidateSkill?.proficiencyLevel, required.minimumProficiency);
                matchedWeight += weight * proficiencyMultiplier;
            } else if (!required.isRequired) {
                matchedWeight += weight * 0.2;
            }
        }

        return totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 100;
    }

    _getProficiencyMultiplier(candidateLevel, requiredLevel) {
        const levels = { 'beginner': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
        const candidateNum = levels[candidateLevel] || 2;
        const requiredNum = levels[requiredLevel] || 2;
        if (candidateNum >= requiredNum) return 1.0;
        if (candidateNum === requiredNum - 1) return 0.7;
        return 0.4;
    }

    _calculateExperienceScore(candidateYears, minRequired, preferredYears) {
        candidateYears = candidateYears || 0;
        minRequired = minRequired || 0;
        preferredYears = preferredYears || minRequired;

        if (candidateYears >= preferredYears) return 100;
        if (candidateYears >= minRequired) {
            const range = preferredYears - minRequired;
            const progress = candidateYears - minRequired;
            return range > 0 ? 70 + (progress / range) * 30 : 100;
        }
        if (candidateYears >= minRequired * 0.7) return 50 + ((candidateYears / minRequired) * 20);
        return Math.max(0, (candidateYears / (minRequired || 1)) * 50);
    }

    _calculateEducationScore(candidateLevel, requiredLevel) {
        const levelRanks = { 'high_school': 1, 'associate': 2, 'bachelor': 3, 'master': 4, 'doctorate': 5 };
        const candidateRank = levelRanks[candidateLevel] || 0;
        const requiredRank = levelRanks[requiredLevel] || 0;

        if (!requiredLevel || requiredRank === 0) return 100;
        if (candidateRank >= requiredRank) return 100;
        if (candidateRank === requiredRank - 1) return 75;
        return Math.max(0, 50 - ((requiredRank - candidateRank - 1) * 25));
    }

    _calculateLocationScore(candidateLocation, jobLocation, locationType) {
        if (locationType === 'remote') return 100;
        if (!candidateLocation || !jobLocation) return 50;

        const candLower = candidateLocation.toLowerCase();
        const jobLower = jobLocation.toLowerCase();

        if (candLower === jobLower) return 100;
        if (candLower.includes(jobLower) || jobLower.includes(candLower)) return 90;
        if (locationType === 'hybrid') return 60;
        return 30;
    }

    _getFileTypeFromMime(mimeType) {
        const mimeMap = {
            'application/pdf': 'pdf',
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/tiff': 'tiff',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
        };
        return mimeMap[mimeType] || 'pdf';
    }

    async _autoExtractSkillsAndEmbedding(candidateId, extractedText) {
        const entities = cds.entities('cv.sorting');
        const { Skills, CandidateSkills } = entities;

        // Extract skills from text with caching
        const allSkills = await cache.getOrSet('all-skills', async () => {
            return await SELECT.from(Skills).columns('ID', 'name', 'normalizedName', 'aliases');
        }, 600); // Cache for 10 minutes
        const textLower = extractedText.toLowerCase();
        const foundSkillIds = new Set();

        for (const skill of allSkills) {
            const namesToCheck = [
                skill.name.toLowerCase(),
                skill.normalizedName?.toLowerCase()
            ].filter(Boolean);

            if (skill.aliases && Array.isArray(skill.aliases)) {
                namesToCheck.push(...skill.aliases.map(a => a.toLowerCase()));
            }

            for (const name of namesToCheck) {
                if (name && textLower.includes(name) && !foundSkillIds.has(skill.ID)) {
                    foundSkillIds.add(skill.ID);
                    break;
                }
            }
        }

        // Get existing skills
        const existingSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
        const existingSkillIds = new Set(existingSkills.map(s => s.skill_ID));

        // Link new skills
        let linkedCount = 0;
        for (const skillId of foundSkillIds) {
            if (!existingSkillIds.has(skillId)) {
                await INSERT.into(CandidateSkills).entries({
                    ID: uuidv4(),
                    candidate_ID: candidateId,
                    skill_ID: skillId,
                    source: 'ocr-extracted',
                    isVerified: false
                });
                linkedCount++;
            }
        }

        LOG.info('Auto-extracted skills from CV', { candidateId, foundSkills: foundSkillIds.size, newlyLinked: linkedCount });

        // Generate embedding for candidate
        await this._generateCandidateEmbeddingAsync(candidateId, entities);
    }
};
