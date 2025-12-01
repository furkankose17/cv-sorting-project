/**
 * Candidate Service Handler
 * Following SAP CAP Best Practices
 *
 * @see https://cap.cloud.sap/docs/node.js/services
 */
'use strict';

const cds = require('@sap/cds');
const { createLogger, startTimer } = require('../lib/logger');
const { ValidationError, NotFoundError, BusinessRuleError, ConflictError } = require('../lib/errors');
const { validateCandidate, validateUUID, validateEnum } = require('../lib/validators');

const LOG = createLogger('candidate-service');

/**
 * Status transition rules
 */
const STATUS_TRANSITIONS = {
    'new': ['screening', 'rejected', 'withdrawn'],
    'screening': ['interviewing', 'rejected', 'withdrawn'],
    'interviewing': ['shortlisted', 'rejected', 'withdrawn'],
    'shortlisted': ['offered', 'rejected', 'withdrawn'],
    'offered': ['hired', 'rejected', 'withdrawn'],
    'hired': [],
    'rejected': ['new'], // Can reactivate
    'withdrawn': ['new']
};

module.exports = class CandidateService extends cds.ApplicationService {

    async init() {
        const { Candidates, CandidateSkills, CandidateNotes, CVDocuments } = this.entities;

        // ===========================================
        // BEFORE Handlers - Validation
        // ===========================================

        this.before('CREATE', 'Candidates', async (req) => {
            LOG.debug('Creating candidate', { email: req.data.email });

            // Validate input
            validateCandidate(req.data);

            // Check for duplicate email
            const existing = await SELECT.one.from(Candidates)
                .where({ email: req.data.email, isDeleted: false });

            if (existing) {
                throw new ConflictError(
                    `A candidate with email '${req.data.email}' already exists`,
                    { existingId: existing.ID }
                );
            }

            // Set defaults
            req.data.status_code = req.data.status_code || 'new';
            req.data.isDeleted = false;

            LOG.audit('CREATE', 'Candidate', null, req.user.id, { email: req.data.email });
        });

        this.before('UPDATE', 'Candidates', async (req) => {
            if (req.data.email) {
                // Check for duplicate email (excluding current record)
                const existing = await SELECT.one.from(Candidates)
                    .where({ email: req.data.email, isDeleted: false })
                    .and({ ID: { '!=': req.params[0] } });

                if (existing) {
                    throw new ConflictError(`Email '${req.data.email}' is already in use`);
                }
            }
        });

        this.before('DELETE', 'Candidates', async (req) => {
            // Soft delete instead of hard delete
            const candidateId = req.params[0];

            LOG.info('Soft deleting candidate', { id: candidateId });

            await UPDATE(Candidates)
                .where({ ID: candidateId })
                .set({
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: req.user.id
                });

            LOG.audit('DELETE', 'Candidate', candidateId, req.user.id);

            // Prevent actual deletion
            req.reject(204);
        });

        // ===========================================
        // AFTER Handlers
        // ===========================================

        this.after('READ', 'Candidates', (results, req) => {
            // Filter out soft-deleted records for non-admin users
            if (!req.user.is('CVAdmin')) {
                if (Array.isArray(results)) {
                    return results.filter(r => !r.isDeleted);
                } else if (results && results.isDeleted) {
                    return null;
                }
            }
            return results;
        });

        // ===========================================
        // Bound Actions
        // ===========================================

        this.on('updateStatus', 'Candidates', async (req) => {
            const timer = startTimer('updateStatus', LOG);
            const { newStatus, notes, notifyCandidate } = req.data;
            const candidateId = req.params[0];

            LOG.info('Updating candidate status', { candidateId, newStatus });

            try {
                // Validate inputs
                validateUUID(candidateId, 'candidateId');
                validateEnum(newStatus, 'newStatus', Object.keys(STATUS_TRANSITIONS));

                // Get current candidate
                const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
                if (!candidate) {
                    throw new NotFoundError('Candidate', candidateId);
                }

                const currentStatus = candidate.status_code;

                // Validate transition
                const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
                if (!allowedTransitions.includes(newStatus)) {
                    throw new BusinessRuleError(
                        `Cannot transition from '${currentStatus}' to '${newStatus}'`,
                        'STATUS_TRANSITION',
                        { currentStatus, newStatus, allowedTransitions }
                    );
                }

                // Update status
                await UPDATE(Candidates)
                    .where({ ID: candidateId })
                    .set({ status_code: newStatus });

                // Add note if provided
                if (notes) {
                    await INSERT.into(CandidateNotes).entries({
                        candidate_ID: candidateId,
                        noteText: `Status changed from '${currentStatus}' to '${newStatus}': ${notes}`,
                        noteType: 'status_change',
                        isPrivate: false
                    });
                }

                // Emit event for workflow/notification
                await this.emit('CandidateStatusChanged', {
                    candidateId,
                    previousStatus: currentStatus,
                    newStatus,
                    userId: req.user.id,
                    timestamp: new Date().toISOString(),
                    notifyCandidate
                });

                LOG.audit('STATUS_CHANGE', 'Candidate', candidateId, req.user.id, {
                    previousStatus: currentStatus,
                    newStatus
                });

                timer.stop({ candidateId, newStatus });

                // Return updated candidate
                return SELECT.one.from(Candidates).where({ ID: candidateId });

            } catch (error) {
                LOG.error('Failed to update status', error, { candidateId, newStatus });
                throw error;
            }
        });

        this.on('addSkill', 'Candidates', async (req) => {
            const { skillId, proficiencyLevel, yearsOfExperience } = req.data;
            const candidateId = req.params[0];

            LOG.debug('Adding skill to candidate', { candidateId, skillId });

            // Check if skill already exists
            const existing = await SELECT.one.from(CandidateSkills)
                .where({ candidate_ID: candidateId, skill_ID: skillId });

            if (existing) {
                // Update existing skill
                await UPDATE(CandidateSkills)
                    .where({ ID: existing.ID })
                    .set({
                        proficiencyLevel: proficiencyLevel || existing.proficiencyLevel,
                        yearsOfExperience: yearsOfExperience || existing.yearsOfExperience,
                        source: 'manual'
                    });

                return SELECT.one.from(CandidateSkills).where({ ID: existing.ID });
            }

            // Create new skill entry
            const newSkill = await INSERT.into(CandidateSkills).entries({
                candidate_ID: candidateId,
                skill_ID: skillId,
                proficiencyLevel: proficiencyLevel || 'intermediate',
                yearsOfExperience: yearsOfExperience || 0,
                source: 'manual',
                isVerified: false
            });

            LOG.audit('ADD_SKILL', 'Candidate', candidateId, req.user.id, { skillId });

            return SELECT.one.from(CandidateSkills).where({ ID: newSkill.ID });
        });

        this.on('markAsDuplicate', 'Candidates', async (req) => {
            const { primaryCandidateId, mergeStrategy } = req.data;
            const duplicateId = req.params[0];

            LOG.info('Marking candidate as duplicate', { duplicateId, primaryCandidateId });

            // Validate both candidates exist
            const [duplicate, primary] = await Promise.all([
                SELECT.one.from(Candidates).where({ ID: duplicateId }),
                SELECT.one.from(Candidates).where({ ID: primaryCandidateId })
            ]);

            if (!duplicate) throw new NotFoundError('Candidate', duplicateId);
            if (!primary) throw new NotFoundError('Primary Candidate', primaryCandidateId);

            // Move documents to primary candidate
            await UPDATE(CVDocuments)
                .where({ candidate_ID: duplicateId })
                .set({ candidate_ID: primaryCandidateId });

            // Soft delete the duplicate
            await UPDATE(Candidates)
                .where({ ID: duplicateId })
                .set({
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: req.user.id
                });

            LOG.audit('MARK_DUPLICATE', 'Candidate', duplicateId, req.user.id, { primaryCandidateId });

            return true;
        });

        // ===========================================
        // Unbound Actions
        // ===========================================

        this.on('bulkUpdateStatus', async (req) => {
            const timer = startTimer('bulkUpdateStatus', LOG);
            const { candidateIds, newStatus, notes } = req.data;

            LOG.info('Bulk updating candidate statuses', { count: candidateIds.length, newStatus });

            const results = {
                successCount: 0,
                failedCount: 0,
                errors: []
            };

            for (const candidateId of candidateIds) {
                try {
                    await this.updateStatus({ params: [candidateId], data: { newStatus, notes, notifyCandidate: false }, user: req.user });
                    results.successCount++;
                } catch (error) {
                    results.failedCount++;
                    results.errors.push({
                        candidateId,
                        error: error.message
                    });
                }
            }

            timer.stop({ total: candidateIds.length, success: results.successCount });

            return results;
        });

        this.on('mergeCandidates', async (req) => {
            const timer = startTimer('mergeCandidates', LOG);
            const { primaryId, duplicateIds, mergeStrategy } = req.data;

            LOG.info('Merging candidates', { primaryId, duplicateIds, mergeStrategy });

            try {
                validateUUID(primaryId, 'primaryId');
                duplicateIds.forEach((id, i) => validateUUID(id, `duplicateIds[${i}]`));

                // Verify primary exists
                const primary = await SELECT.one.from(Candidates).where({ ID: primaryId });
                if (!primary) throw new NotFoundError('Primary Candidate', primaryId);

                let mergedRecordsCount = 0;

                for (const duplicateId of duplicateIds) {
                    if (duplicateId === primaryId) continue;

                    // Move documents
                    const movedDocs = await UPDATE(CVDocuments)
                        .where({ candidate_ID: duplicateId })
                        .set({ candidate_ID: primaryId });

                    // Move skills (avoiding duplicates)
                    if (mergeStrategy === 'merge_all' || mergeStrategy === 'select_best') {
                        const dupSkills = await SELECT.from(CandidateSkills)
                            .where({ candidate_ID: duplicateId });
                        const primarySkills = await SELECT.from(CandidateSkills)
                            .where({ candidate_ID: primaryId });
                        const primarySkillIds = new Set(primarySkills.map(s => s.skill_ID));

                        for (const skill of dupSkills) {
                            if (!primarySkillIds.has(skill.skill_ID)) {
                                await UPDATE(CandidateSkills)
                                    .where({ ID: skill.ID })
                                    .set({ candidate_ID: primaryId });
                                mergedRecordsCount++;
                            }
                        }
                    }

                    // Soft delete duplicate
                    await UPDATE(Candidates)
                        .where({ ID: duplicateId })
                        .set({
                            isDeleted: true,
                            deletedAt: new Date(),
                            deletedBy: req.user.id
                        });

                    mergedRecordsCount++;
                }

                LOG.audit('MERGE', 'Candidate', primaryId, req.user.id, {
                    mergedFrom: duplicateIds,
                    strategy: mergeStrategy
                });

                timer.stop({ primaryId, mergedCount: mergedRecordsCount });

                return {
                    success: true,
                    mergedCandidateId: primaryId,
                    mergedRecordsCount
                };

            } catch (error) {
                LOG.error('Merge failed', error, { primaryId, duplicateIds });
                throw error;
            }
        });

        this.on('extractSkillsFromText', async (req) => {
            const { candidateId, sourceText } = req.data;
            const { Skills, CandidateSkills } = this.entities;

            LOG.debug('Extracting skills from text', { candidateId, textLength: sourceText.length });

            // Get all skills from catalog
            const allSkills = await SELECT.from(Skills)
                .columns(['ID', 'name', 'normalizedName', 'aliases']);

            const textLower = sourceText.toLowerCase();
            const extractedSkills = [];
            const existingSkills = await SELECT.from(CandidateSkills)
                .where({ candidate_ID: candidateId });
            const existingSkillIds = new Set(existingSkills.map(s => s.skill_ID));

            // Simple skill matching
            for (const skill of allSkills) {
                const searchTerms = [
                    skill.normalizedName || skill.name.toLowerCase(),
                    ...(skill.aliases || []).map(a => a.toLowerCase())
                ];

                for (const term of searchTerms) {
                    if (textLower.includes(term)) {
                        // Calculate confidence based on match quality
                        const confidence = textLower.includes(` ${term} `) ? 0.9 :
                            textLower.startsWith(`${term} `) ? 0.85 :
                                textLower.endsWith(` ${term}`) ? 0.85 : 0.7;

                        extractedSkills.push({
                            skillId: skill.ID,
                            skillName: skill.name,
                            confidence
                        });
                        break;
                    }
                }
            }

            // Link new skills
            let linkedCount = 0;
            for (const extracted of extractedSkills) {
                if (!existingSkillIds.has(extracted.skillId)) {
                    await INSERT.into(CandidateSkills).entries({
                        candidate_ID: candidateId,
                        skill_ID: extracted.skillId,
                        source: 'extracted',
                        confidenceScore: extracted.confidence * 100,
                        isVerified: false
                    });
                    linkedCount++;
                }
            }

            LOG.info('Skills extracted', { candidateId, found: extractedSkills.length, linked: linkedCount });

            return {
                extractedSkills,
                linkedCount
            };
        });

        // ===========================================
        // Functions
        // ===========================================

        this.on('searchCandidates', async (req) => {
            const timer = startTimer('searchCandidates', LOG);
            const {
                query, skills, minExperience, maxExperience,
                locations, statuses, sortBy, sortOrder, top, skip
            } = req.data;

            LOG.debug('Searching candidates', { query, skills, statuses });

            let cqn = SELECT.from(Candidates).where({ isDeleted: false });

            // Text search
            if (query) {
                cqn = cqn.and({
                    or: [
                        { firstName: { like: `%${query}%` } },
                        { lastName: { like: `%${query}%` } },
                        { email: { like: `%${query}%` } },
                        { headline: { like: `%${query}%` } }
                    ]
                });
            }

            // Experience filter
            if (minExperience !== undefined) {
                cqn = cqn.and({ totalExperienceYears: { '>=': minExperience } });
            }
            if (maxExperience !== undefined) {
                cqn = cqn.and({ totalExperienceYears: { '<=': maxExperience } });
            }

            // Location filter
            if (locations && locations.length > 0) {
                cqn = cqn.and({ city: { in: locations } });
            }

            // Status filter
            if (statuses && statuses.length > 0) {
                cqn = cqn.and({ status_code: { in: statuses } });
            }

            // Sorting
            const orderColumn = sortBy || 'modifiedAt';
            const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';
            cqn = cqn.orderBy(`${orderColumn} ${orderDir}`);

            // Pagination
            cqn = cqn.limit(top || 50, skip || 0);

            const results = await cqn;

            timer.stop({ resultCount: results.length });

            return results;
        });

        this.on('findSimilarCandidates', async (req) => {
            const { candidateId, similarityFactors, limit } = req.data;

            LOG.debug('Finding similar candidates', { candidateId, factors: similarityFactors });

            const reference = await SELECT.one.from(Candidates).where({ ID: candidateId });
            if (!reference) throw new NotFoundError('Candidate', candidateId);

            const refSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
            const refSkillIds = new Set(refSkills.map(s => s.skill_ID));

            // Get potential similar candidates
            const candidates = await SELECT.from(Candidates)
                .where({ ID: { '!=': candidateId }, isDeleted: false })
                .limit(200);

            const similarities = [];

            for (const candidate of candidates) {
                let score = 0;
                const matchingFactors = [];

                // Skill similarity
                if (!similarityFactors || similarityFactors.includes('skills')) {
                    const candSkills = await SELECT.from(CandidateSkills)
                        .where({ candidate_ID: candidate.ID });
                    const candSkillIds = new Set(candSkills.map(s => s.skill_ID));

                    const intersection = [...refSkillIds].filter(id => candSkillIds.has(id));
                    const union = new Set([...refSkillIds, ...candSkillIds]);

                    if (union.size > 0) {
                        const skillScore = (intersection.length / union.size) * 100;
                        score += skillScore;
                        if (skillScore > 30) matchingFactors.push('skills');
                    }
                }

                // Experience similarity
                if (!similarityFactors || similarityFactors.includes('experience')) {
                    const refExp = reference.totalExperienceYears || 0;
                    const candExp = candidate.totalExperienceYears || 0;
                    const expDiff = Math.abs(refExp - candExp);
                    const expScore = Math.max(0, 100 - (expDiff * 15));
                    score += expScore;
                    if (expScore > 50) matchingFactors.push('experience');
                }

                // Location similarity
                if (!similarityFactors || similarityFactors.includes('location')) {
                    if (reference.city && candidate.city &&
                        reference.city.toLowerCase() === candidate.city.toLowerCase()) {
                        score += 100;
                        matchingFactors.push('location');
                    }
                }

                const factorCount = similarityFactors ? similarityFactors.length : 3;
                const avgScore = score / factorCount;

                if (avgScore > 20) {
                    similarities.push({
                        candidate,
                        similarityScore: Math.round(avgScore * 100) / 100,
                        matchingFactors
                    });
                }
            }

            // Sort by similarity and limit
            similarities.sort((a, b) => b.similarityScore - a.similarityScore);

            return similarities.slice(0, limit || 10);
        });

        this.on('getCandidateTimeline', async (req) => {
            const { candidateId } = req.data;

            const [notes, documents] = await Promise.all([
                SELECT.from(CandidateNotes)
                    .where({ candidate_ID: candidateId })
                    .orderBy('createdAt desc'),
                SELECT.from(CVDocuments)
                    .where({ candidate_ID: candidateId })
                    .orderBy('createdAt desc')
            ]);

            const timeline = [];

            for (const note of notes) {
                timeline.push({
                    timestamp: note.createdAt,
                    eventType: 'note',
                    description: note.noteType === 'status_change' ? note.noteText : `Note added: ${note.noteType}`,
                    userId: note.createdBy,
                    details: JSON.stringify({ noteId: note.ID, noteType: note.noteType })
                });
            }

            for (const doc of documents) {
                timeline.push({
                    timestamp: doc.createdAt,
                    eventType: 'document',
                    description: `Document uploaded: ${doc.fileName}`,
                    userId: doc.createdBy,
                    details: JSON.stringify({
                        documentId: doc.ID,
                        fileName: doc.fileName,
                        status: doc.processingStatus
                    })
                });
            }

            // Sort by timestamp descending
            timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return timeline;
        });

        await super.init();
    }
};
