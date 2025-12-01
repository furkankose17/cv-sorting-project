const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

/**
 * Candidate Management Service Implementation
 * Handles candidate CRUD, status management, searches, and skill management
 */
module.exports = class CandidateService extends cds.ApplicationService {

    async init() {
        const { Candidates, CandidateSkills, Skills } = this.entities;

        // Register action handlers
        this.on('updateStatus', this.handleUpdateStatus);
        this.on('bulkUpdateStatus', this.handleBulkUpdateStatus);
        this.on('archiveCandidate', this.handleArchive);
        this.on('mergeCandidates', this.handleMerge);
        this.on('addSkill', this.handleAddSkill);
        this.on('autoLinkSkills', this.handleAutoLinkSkills);
        this.on('verifySkill', this.handleVerifySkill);

        // Register function handlers
        this.on('searchCandidates', this.handleSearch);
        this.on('findSimilarCandidates', this.handleFindSimilar);
        this.on('getCandidateTimeline', this.handleGetTimeline);
        this.on('getCandidateStats', this.handleGetStats);

        await super.init();
    }

    /**
     * Update candidate status
     */
    async handleUpdateStatus(req) {
        const { candidateId, newStatus, notes, notifyCandidate } = req.data;
        const { Candidates, CandidateNotes } = this.entities;

        try {
            // Get current status
            const candidate = await SELECT.one.from(Candidates)
                .columns('status_code', 'email', 'firstName')
                .where({ ID: candidateId });

            if (!candidate) {
                return {
                    success: false,
                    previousStatus: null,
                    currentStatus: null,
                    message: 'Candidate not found'
                };
            }

            const previousStatus = candidate.status_code;

            // Validate status transition
            const validTransitions = this._getValidTransitions(previousStatus);
            if (!validTransitions.includes(newStatus)) {
                return {
                    success: false,
                    previousStatus,
                    currentStatus: previousStatus,
                    message: `Invalid status transition from ${previousStatus} to ${newStatus}`
                };
            }

            // Update status
            await UPDATE(Candidates).where({ ID: candidateId }).set({
                status_code: newStatus
            });

            // Add note if provided
            if (notes) {
                await INSERT.into(CandidateNotes).entries({
                    ID: uuidv4(),
                    candidate_ID: candidateId,
                    noteText: `Status changed from ${previousStatus} to ${newStatus}: ${notes}`,
                    noteType: 'status-change'
                });
            }

            // Emit event
            await this.emit('CandidateStatusChanged', {
                candidateId,
                previousStatus,
                newStatus,
                changedBy: req.user?.id || 'system',
                timestamp: new Date()
            });

            // Send notification if requested
            if (notifyCandidate && candidate.email) {
                await this._sendStatusNotification(candidate, newStatus);
            }

            return {
                success: true,
                previousStatus,
                currentStatus: newStatus,
                message: 'Status updated successfully'
            };

        } catch (error) {
            console.error('Update status error:', error);
            return {
                success: false,
                previousStatus: null,
                currentStatus: null,
                message: error.message
            };
        }
    }

    /**
     * Get valid status transitions
     */
    _getValidTransitions(currentStatus) {
        const transitions = {
            'new': ['screening', 'rejected', 'withdrawn'],
            'screening': ['interviewing', 'rejected', 'withdrawn'],
            'interviewing': ['shortlisted', 'rejected', 'withdrawn'],
            'shortlisted': ['offered', 'rejected', 'withdrawn'],
            'offered': ['hired', 'rejected', 'withdrawn'],
            'hired': [],
            'rejected': ['new'], // Can reactivate
            'withdrawn': ['new'] // Can reactivate
        };
        return transitions[currentStatus] || [];
    }

    /**
     * Send status notification (placeholder)
     */
    async _sendStatusNotification(candidate, newStatus) {
        // Would integrate with notification service or email service
        console.log(`Notification sent to ${candidate.email} about status: ${newStatus}`);
    }

    /**
     * Bulk update status
     */
    async handleBulkUpdateStatus(req) {
        const { candidateIds, newStatus, notes } = req.data;
        let updated = 0;
        let failed = 0;
        const results = [];

        for (const candidateId of candidateIds) {
            const result = await this.handleUpdateStatus({
                data: { candidateId, newStatus, notes, notifyCandidate: false },
                user: req.user
            });

            if (result.success) {
                updated++;
            } else {
                failed++;
            }
            results.push({ candidateId, ...result });
        }

        return {
            updated,
            failed,
            results: JSON.stringify(results)
        };
    }

    /**
     * Archive candidate
     */
    async handleArchive(req) {
        const { candidateId, reason } = req.data;
        const { Candidates, CandidateNotes } = this.entities;

        try {
            await UPDATE(Candidates).where({ ID: candidateId }).set({
                status_code: 'archived'
            });

            await INSERT.into(CandidateNotes).entries({
                ID: uuidv4(),
                candidate_ID: candidateId,
                noteText: `Archived: ${reason}`,
                noteType: 'system'
            });

            return { success: true, message: 'Candidate archived' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Merge duplicate candidates
     */
    async handleMerge(req) {
        const { primaryId, duplicateIds, mergeStrategy } = req.data;
        const { Candidates, CVDocuments, WorkExperiences, Educations, CandidateSkills } = this.entities;

        try {
            // Move all documents from duplicates to primary
            for (const dupId of duplicateIds) {
                await UPDATE(CVDocuments).where({ candidate_ID: dupId }).set({
                    candidate_ID: primaryId
                });

                if (mergeStrategy === 'merge-all') {
                    // Move experiences
                    await UPDATE(WorkExperiences).where({ candidate_ID: dupId }).set({
                        candidate_ID: primaryId
                    });

                    // Move education
                    await UPDATE(Educations).where({ candidate_ID: dupId }).set({
                        candidate_ID: primaryId
                    });

                    // Move skills (avoiding duplicates)
                    const dupSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: dupId });
                    const primarySkills = await SELECT.from(CandidateSkills).where({ candidate_ID: primaryId });
                    const primarySkillIds = new Set(primarySkills.map(s => s.skill_ID));

                    for (const skill of dupSkills) {
                        if (!primarySkillIds.has(skill.skill_ID)) {
                            await UPDATE(CandidateSkills).where({ ID: skill.ID }).set({
                                candidate_ID: primaryId
                            });
                        }
                    }
                }

                // Archive duplicate
                await UPDATE(Candidates).where({ ID: dupId }).set({
                    status_code: 'merged'
                });
            }

            return {
                success: true,
                mergedId: primaryId,
                message: `Merged ${duplicateIds.length} candidates into primary`
            };

        } catch (error) {
            return { success: false, mergedId: null, message: error.message };
        }
    }

    /**
     * Add skill to candidate
     */
    async handleAddSkill(req) {
        const { candidateId, skillId, proficiencyLevel, yearsOfExperience } = req.data;
        const { CandidateSkills } = this.entities;

        try {
            const id = uuidv4();
            await INSERT.into(CandidateSkills).entries({
                ID: id,
                candidate_ID: candidateId,
                skill_ID: skillId,
                proficiencyLevel: proficiencyLevel || 'intermediate',
                yearsOfExperience: yearsOfExperience || 0,
                source: 'manual',
                isVerified: false
            });

            return { success: true, candidateSkillId: id };
        } catch (error) {
            return { success: false, candidateSkillId: null };
        }
    }

    /**
     * Auto-link skills from text using NLP
     */
    async handleAutoLinkSkills(req) {
        const { candidateId, sourceText } = req.data;
        const { CandidateSkills, Skills } = this.entities;

        try {
            // Get all skills from catalog
            const allSkills = await SELECT.from(Skills).columns('ID', 'name', 'aliases');

            // Simple skill extraction (would use NLP library in production)
            const textLower = sourceText.toLowerCase();
            const foundSkills = [];
            const suggestedSkills = [];

            for (const skill of allSkills) {
                const names = [skill.name.toLowerCase(), ...(skill.aliases || []).map(a => a.toLowerCase())];

                for (const name of names) {
                    if (textLower.includes(name)) {
                        foundSkills.push(skill);
                        break;
                    }
                }
            }

            // Link found skills
            const existingSkills = await SELECT.from(CandidateSkills)
                .where({ candidate_ID: candidateId });
            const existingSkillIds = new Set(existingSkills.map(s => s.skill_ID));

            let linkedCount = 0;
            for (const skill of foundSkills) {
                if (!existingSkillIds.has(skill.ID)) {
                    await INSERT.into(CandidateSkills).entries({
                        ID: uuidv4(),
                        candidate_ID: candidateId,
                        skill_ID: skill.ID,
                        source: 'inferred',
                        isVerified: false
                    });
                    linkedCount++;
                }
            }

            return {
                linkedSkills: linkedCount,
                suggestedSkills: JSON.stringify(suggestedSkills)
            };

        } catch (error) {
            console.error('Auto-link skills error:', error);
            return { linkedSkills: 0, suggestedSkills: '[]' };
        }
    }

    /**
     * Verify candidate skill
     */
    async handleVerifySkill(req) {
        const { candidateSkillId, isVerified, actualProficiency, notes } = req.data;
        const { CandidateSkills } = this.entities;

        try {
            const updateData = { isVerified };
            if (actualProficiency) {
                updateData.proficiencyLevel = actualProficiency;
            }

            await UPDATE(CandidateSkills).where({ ID: candidateSkillId }).set(updateData);

            // Get candidate ID for event
            const skill = await SELECT.one.from(CandidateSkills)
                .columns('candidate_ID', 'skill_ID')
                .where({ ID: candidateSkillId });

            if (skill) {
                await this.emit('CandidateSkillVerified', {
                    candidateId: skill.candidate_ID,
                    skillId: skill.skill_ID,
                    verifiedBy: req.user?.id || 'system',
                    timestamp: new Date()
                });
            }

            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    /**
     * Advanced candidate search
     */
    async handleSearch(req) {
        const {
            query, skills, minExperience, maxExperience,
            locations, statuses, educationLevel,
            sortBy, sortOrder, limit, offset
        } = req.data;

        const { Candidates, CandidateSkills } = this.entities;

        try {
            // Build query
            let cqnQuery = SELECT.from(Candidates);
            const conditions = [];

            // Free text search
            if (query) {
                conditions.push({
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
                conditions.push({ totalExperienceYears: { '>=': minExperience } });
            }
            if (maxExperience !== undefined) {
                conditions.push({ totalExperienceYears: { '<=': maxExperience } });
            }

            // Location filter
            if (locations && locations.length > 0) {
                conditions.push({ location: { in: locations } });
            }

            // Status filter
            if (statuses && statuses.length > 0) {
                conditions.push({ status_code: { in: statuses } });
            }

            // Apply conditions
            if (conditions.length > 0) {
                cqnQuery = cqnQuery.where(conditions);
            }

            // Sorting
            const orderBy = sortBy || 'createdAt';
            const order = sortOrder === 'asc' ? 'asc' : 'desc';
            cqnQuery = cqnQuery.orderBy(`${orderBy} ${order}`);

            // Pagination
            cqnQuery = cqnQuery.limit(limit || 50, offset || 0);

            // Execute query
            const candidates = await cqnQuery;

            // If skill filter, post-filter (would optimize with JOIN in production)
            let filteredCandidates = candidates;
            if (skills && skills.length > 0) {
                const candidatesWithSkills = [];
                for (const candidate of candidates) {
                    const candidateSkills = await SELECT.from(CandidateSkills)
                        .where({ candidate_ID: candidate.ID });
                    const candidateSkillIds = candidateSkills.map(s => s.skill_ID);

                    if (skills.every(s => candidateSkillIds.includes(s))) {
                        candidatesWithSkills.push(candidate);
                    }
                }
                filteredCandidates = candidatesWithSkills;
            }

            // Get total count
            const countResult = await SELECT.from(Candidates).columns('count(*) as count');
            const totalCount = countResult[0]?.count || 0;

            // Build facets
            const facets = await this._buildSearchFacets();

            return {
                candidates: JSON.stringify(filteredCandidates),
                totalCount,
                facets: JSON.stringify(facets)
            };

        } catch (error) {
            console.error('Search error:', error);
            return { candidates: '[]', totalCount: 0, facets: '{}' };
        }
    }

    /**
     * Build search facets for filtering UI
     */
    async _buildSearchFacets() {
        const { Candidates, CandidateStatuses, Skills } = this.entities;

        // Get status counts
        const statusCounts = await SELECT.from(Candidates)
            .columns('status_code', 'count(*) as count')
            .groupBy('status_code');

        // Get location counts
        const locationCounts = await SELECT.from(Candidates)
            .columns('location', 'count(*) as count')
            .groupBy('location')
            .limit(20);

        return {
            statuses: statusCounts,
            locations: locationCounts
        };
    }

    /**
     * Find similar candidates
     */
    async handleFindSimilar(req) {
        const { candidateId, similarityFactors, limit } = req.data;
        const { Candidates, CandidateSkills, WorkExperiences } = this.entities;

        try {
            // Get reference candidate
            const refCandidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            if (!refCandidate) {
                return { candidates: '[]' };
            }

            // Get reference skills
            const refSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
            const refSkillIds = new Set(refSkills.map(s => s.skill_ID));

            // Get all other candidates
            const allCandidates = await SELECT.from(Candidates)
                .where({ ID: { '!=': candidateId } })
                .limit(500);

            // Calculate similarity scores
            const similarCandidates = [];
            for (const candidate of allCandidates) {
                let similarity = 0;
                let factors = 0;

                // Skill similarity
                if (!similarityFactors || similarityFactors.includes('skills')) {
                    const skills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });
                    const skillIds = new Set(skills.map(s => s.skill_ID));
                    const intersection = [...refSkillIds].filter(id => skillIds.has(id));
                    const union = new Set([...refSkillIds, ...skillIds]);
                    similarity += (intersection.length / union.size) * 100;
                    factors++;
                }

                // Experience similarity
                if (!similarityFactors || similarityFactors.includes('experience')) {
                    const expDiff = Math.abs(
                        (refCandidate.totalExperienceYears || 0) -
                        (candidate.totalExperienceYears || 0)
                    );
                    similarity += Math.max(0, 100 - (expDiff * 10));
                    factors++;
                }

                if (factors > 0) {
                    candidate.similarityScore = similarity / factors;
                    similarCandidates.push(candidate);
                }
            }

            // Sort by similarity and limit
            similarCandidates.sort((a, b) => b.similarityScore - a.similarityScore);
            const topSimilar = similarCandidates.slice(0, limit || 10);

            return { candidates: JSON.stringify(topSimilar) };

        } catch (error) {
            console.error('Find similar error:', error);
            return { candidates: '[]' };
        }
    }

    /**
     * Get candidate timeline
     */
    async handleGetTimeline(req) {
        const { candidateId } = req.data;
        const { CandidateNotes, CVDocuments } = this.entities;

        try {
            const timeline = [];

            // Get notes
            const notes = await SELECT.from(CandidateNotes)
                .where({ candidate_ID: candidateId })
                .orderBy('createdAt desc');

            for (const note of notes) {
                timeline.push({
                    type: 'note',
                    date: note.createdAt,
                    title: note.noteType,
                    description: note.noteText
                });
            }

            // Get document uploads
            const docs = await SELECT.from(CVDocuments)
                .where({ candidate_ID: candidateId })
                .orderBy('createdAt desc');

            for (const doc of docs) {
                timeline.push({
                    type: 'document',
                    date: doc.createdAt,
                    title: 'Document uploaded',
                    description: doc.fileName
                });
            }

            // Sort by date
            timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

            return { timeline: JSON.stringify(timeline) };

        } catch (error) {
            return { timeline: '[]' };
        }
    }

    /**
     * Get candidate statistics
     */
    async handleGetStats(req) {
        const { candidateId } = req.data;
        const { MatchResults } = this.entities;

        try {
            const matches = await SELECT.from(MatchResults)
                .where({ candidate_ID: candidateId });

            const avgScore = matches.length > 0
                ? matches.reduce((sum, m) => sum + (m.overallScore || 0), 0) / matches.length
                : 0;

            // Get top matching jobs
            const topMatches = matches
                .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))
                .slice(0, 5);

            return {
                applicationsCount: matches.length,
                matchesCount: matches.filter(m => m.overallScore >= 50).length,
                avgMatchScore: avgScore,
                topMatchingJobs: JSON.stringify(topMatches)
            };

        } catch (error) {
            return {
                applicationsCount: 0,
                matchesCount: 0,
                avgMatchScore: 0,
                topMatchingJobs: '[]'
            };
        }
    }
};
