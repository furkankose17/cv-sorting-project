const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

/**
 * Job Matching Service Implementation
 * Implements CV sorting, filtering, and matching algorithms
 */
module.exports = class MatchingService extends cds.ApplicationService {

    async init() {
        // Register action handlers
        this.on('findMatches', this.handleFindMatches);
        this.on('recalculateMatches', this.handleRecalculateMatches);
        this.on('calculateMatchScore', this.handleCalculateMatchScore);
        this.on('batchMatch', this.handleBatchMatch);
        this.on('sortCandidates', this.handleSortCandidates);
        this.on('filterCandidates', this.handleFilterCandidates);
        this.on('rankCandidates', this.handleRankCandidates);
        this.on('reviewMatch', this.handleReviewMatch);
        this.on('bulkReviewMatches', this.handleBulkReviewMatches);
        this.on('shortlistTopCandidates', this.handleShortlistTop);

        // Register function handlers
        this.on('getMatchDistribution', this.handleGetDistribution);
        this.on('getSkillGapAnalysis', this.handleSkillGapAnalysis);
        this.on('compareCandidates', this.handleCompareCandidates);
        this.on('explainMatch', this.handleExplainMatch);

        await super.init();
    }

    // ==========================================
    // MATCHING ALGORITHM
    // ==========================================

    /**
     * Core matching algorithm
     * Calculates match score between a candidate and job posting
     */
    async calculateMatch(candidate, jobPosting, candidateSkills, jobRequiredSkills) {
        const weights = {
            skill: jobPosting.skillWeight || 0.40,
            experience: jobPosting.experienceWeight || 0.30,
            education: jobPosting.educationWeight || 0.20,
            location: jobPosting.locationWeight || 0.10
        };

        // Calculate skill score
        const skillScore = this._calculateSkillScore(candidateSkills, jobRequiredSkills);

        // Calculate experience score
        const experienceScore = this._calculateExperienceScore(
            candidate.totalExperienceYears,
            jobPosting.minimumExperience,
            jobPosting.preferredExperience
        );

        // Calculate education score
        const educationScore = this._calculateEducationScore(
            candidate.educationLevel,
            jobPosting.requiredEducation_code
        );

        // Calculate location score
        const locationScore = this._calculateLocationScore(
            candidate.location,
            jobPosting.location,
            jobPosting.locationType
        );

        // Weighted overall score
        const overallScore =
            (skillScore * weights.skill) +
            (experienceScore * weights.experience) +
            (educationScore * weights.education) +
            (locationScore * weights.location);

        return {
            overallScore: Math.round(overallScore * 100) / 100,
            skillScore: Math.round(skillScore * 100) / 100,
            experienceScore: Math.round(experienceScore * 100) / 100,
            educationScore: Math.round(educationScore * 100) / 100,
            locationScore: Math.round(locationScore * 100) / 100,
            breakdown: {
                weights,
                skillDetails: this._getSkillMatchDetails(candidateSkills, jobRequiredSkills),
                experienceDetails: {
                    candidateYears: candidate.totalExperienceYears,
                    requiredMin: jobPosting.minimumExperience,
                    requiredPreferred: jobPosting.preferredExperience
                },
                locationDetails: {
                    candidateLocation: candidate.location,
                    jobLocation: jobPosting.location,
                    locationType: jobPosting.locationType
                }
            }
        };
    }

    /**
     * Calculate skill match score (0-100)
     */
    _calculateSkillScore(candidateSkills, jobRequiredSkills) {
        if (!jobRequiredSkills || jobRequiredSkills.length === 0) {
            return 100; // No skills required = full match
        }

        const candidateSkillIds = new Set(candidateSkills.map(s => s.skill_ID));
        let totalWeight = 0;
        let matchedWeight = 0;

        for (const required of jobRequiredSkills) {
            const weight = required.isRequired ? (required.weight || 1.0) * 2 : (required.weight || 1.0);
            totalWeight += weight;

            if (candidateSkillIds.has(required.skill_ID)) {
                // Check proficiency level match
                const candidateSkill = candidateSkills.find(s => s.skill_ID === required.skill_ID);
                const proficiencyMultiplier = this._getProficiencyMultiplier(
                    candidateSkill?.proficiencyLevel,
                    required.minimumProficiency
                );
                matchedWeight += weight * proficiencyMultiplier;
            } else if (!required.isRequired) {
                // Nice-to-have skills don't penalize as much
                matchedWeight += weight * 0.2;
            }
        }

        return totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 100;
    }

    /**
     * Get proficiency level multiplier
     */
    _getProficiencyMultiplier(candidateLevel, requiredLevel) {
        const levels = { 'beginner': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
        const candidateNum = levels[candidateLevel] || 2;
        const requiredNum = levels[requiredLevel] || 2;

        if (candidateNum >= requiredNum) {
            return 1.0;
        } else if (candidateNum === requiredNum - 1) {
            return 0.7;
        } else {
            return 0.4;
        }
    }

    /**
     * Get detailed skill match information
     */
    _getSkillMatchDetails(candidateSkills, jobRequiredSkills) {
        const candidateSkillIds = new Set(candidateSkills.map(s => s.skill_ID));
        const matched = [];
        const missing = [];
        const extra = [];

        const requiredSkillIds = new Set(jobRequiredSkills.map(s => s.skill_ID));

        for (const required of jobRequiredSkills) {
            if (candidateSkillIds.has(required.skill_ID)) {
                matched.push({
                    skillId: required.skill_ID,
                    isRequired: required.isRequired,
                    candidateLevel: candidateSkills.find(s => s.skill_ID === required.skill_ID)?.proficiencyLevel
                });
            } else {
                missing.push({
                    skillId: required.skill_ID,
                    isRequired: required.isRequired
                });
            }
        }

        for (const skill of candidateSkills) {
            if (!requiredSkillIds.has(skill.skill_ID)) {
                extra.push({
                    skillId: skill.skill_ID,
                    level: skill.proficiencyLevel
                });
            }
        }

        return { matched, missing, extra };
    }

    /**
     * Calculate experience score (0-100)
     */
    _calculateExperienceScore(candidateYears, minRequired, preferredYears) {
        candidateYears = candidateYears || 0;
        minRequired = minRequired || 0;
        preferredYears = preferredYears || minRequired;

        if (candidateYears >= preferredYears) {
            return 100;
        } else if (candidateYears >= minRequired) {
            // Linear interpolation between min and preferred
            const range = preferredYears - minRequired;
            const progress = candidateYears - minRequired;
            return 70 + (progress / range) * 30;
        } else if (candidateYears >= minRequired * 0.7) {
            // Close to minimum
            return 50 + ((candidateYears / minRequired) * 20);
        } else {
            // Below minimum
            return Math.max(0, (candidateYears / minRequired) * 50);
        }
    }

    /**
     * Calculate education score (0-100)
     */
    _calculateEducationScore(candidateLevel, requiredLevel) {
        const levelRanks = {
            'high_school': 1,
            'associate': 2,
            'bachelor': 3,
            'master': 4,
            'doctorate': 5
        };

        const candidateRank = levelRanks[candidateLevel] || 0;
        const requiredRank = levelRanks[requiredLevel] || 0;

        if (!requiredLevel || requiredRank === 0) {
            return 100; // No requirement
        }

        if (candidateRank >= requiredRank) {
            return 100;
        } else if (candidateRank === requiredRank - 1) {
            return 75;
        } else {
            return Math.max(0, 50 - ((requiredRank - candidateRank - 1) * 25));
        }
    }

    /**
     * Calculate location score (0-100)
     */
    _calculateLocationScore(candidateLocation, jobLocation, locationType) {
        if (locationType === 'remote') {
            return 100; // Remote jobs match everyone
        }

        if (!candidateLocation || !jobLocation) {
            return 50; // Unknown locations get neutral score
        }

        // Simple location matching (would use geocoding in production)
        const candLower = candidateLocation.toLowerCase();
        const jobLower = jobLocation.toLowerCase();

        if (candLower === jobLower) {
            return 100;
        } else if (candLower.includes(jobLower) || jobLower.includes(candLower)) {
            return 90;
        } else if (locationType === 'hybrid') {
            return 60; // Hybrid might work for nearby locations
        } else {
            return 30; // Different locations for on-site jobs
        }
    }

    // ==========================================
    // SORTING ALGORITHM
    // ==========================================

    /**
     * Sort candidates based on weighted criteria
     */
    async sortCandidatesWithWeights(candidates, weights, jobContext = null) {
        // Default weights
        const w = {
            skill: weights.skillWeight || 0.35,
            experience: weights.experienceWeight || 0.25,
            education: weights.educationWeight || 0.20,
            recency: weights.recencyWeight || 0.10,
            location: weights.locationWeight || 0.10
        };

        // Normalize weights
        const totalWeight = Object.values(w).reduce((a, b) => a + b, 0);
        Object.keys(w).forEach(k => w[k] = w[k] / totalWeight);

        const { CandidateSkills } = this.entities;

        // Calculate composite scores
        const scoredCandidates = await Promise.all(candidates.map(async (candidate) => {
            const skills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });

            // Skill score (based on total skills and verified skills)
            const skillScore = Math.min(100, skills.length * 10 + skills.filter(s => s.isVerified).length * 5);

            // Experience score
            const expScore = Math.min(100, (candidate.totalExperienceYears || 0) * 10);

            // Education score (would need education level in production)
            const eduScore = 70; // Default

            // Recency score (based on last update)
            const daysSinceUpdate = candidate.modifiedAt
                ? (Date.now() - new Date(candidate.modifiedAt).getTime()) / (1000 * 60 * 60 * 24)
                : 365;
            const recencyScore = Math.max(0, 100 - daysSinceUpdate);

            // Location score (if job context provided)
            let locationScore = 50;
            if (jobContext) {
                locationScore = this._calculateLocationScore(
                    candidate.location,
                    jobContext.location,
                    jobContext.locationType
                );
            }

            // Composite score
            const compositeScore =
                (skillScore * w.skill) +
                (expScore * w.experience) +
                (eduScore * w.education) +
                (recencyScore * w.recency) +
                (locationScore * w.location);

            return {
                ...candidate,
                sortScore: Math.round(compositeScore * 100) / 100,
                scoreComponents: {
                    skill: skillScore,
                    experience: expScore,
                    education: eduScore,
                    recency: recencyScore,
                    location: locationScore
                }
            };
        }));

        // Sort by composite score descending
        scoredCandidates.sort((a, b) => b.sortScore - a.sortScore);

        return scoredCandidates;
    }

    // ==========================================
    // FILTERING ALGORITHM
    // ==========================================

    /**
     * Filter candidates based on criteria
     */
    async filterCandidatesWithCriteria(candidates, criteria) {
        const {
            skills,              // Array of required skill IDs
            skillMatchType,      // 'all' | 'any' - must have all or any of the skills
            minExperience,       // Minimum years of experience
            maxExperience,       // Maximum years of experience
            locations,           // Array of acceptable locations
            statuses,            // Array of acceptable statuses
            educationLevels,     // Array of acceptable education levels
            minScore,            // Minimum match score
            languages,           // Required languages
            certifications,      // Required certifications (name patterns)
            availableFrom,       // Available from date
            salaryMax,           // Maximum salary expectation
            tags                 // Required tags
        } = criteria;

        const { CandidateSkills, CandidateLanguages, Certifications } = this.entities;

        const filtered = [];

        for (const candidate of candidates) {
            let passes = true;

            // Skill filter
            if (skills && skills.length > 0) {
                const candidateSkills = await SELECT.from(CandidateSkills)
                    .where({ candidate_ID: candidate.ID });
                const candidateSkillIds = new Set(candidateSkills.map(s => s.skill_ID));

                if (skillMatchType === 'all') {
                    passes = passes && skills.every(s => candidateSkillIds.has(s));
                } else {
                    passes = passes && skills.some(s => candidateSkillIds.has(s));
                }
            }

            // Experience filter
            if (minExperience !== undefined) {
                passes = passes && (candidate.totalExperienceYears || 0) >= minExperience;
            }
            if (maxExperience !== undefined) {
                passes = passes && (candidate.totalExperienceYears || 0) <= maxExperience;
            }

            // Location filter
            if (locations && locations.length > 0) {
                const candLocation = (candidate.location || '').toLowerCase();
                passes = passes && locations.some(loc =>
                    candLocation.includes(loc.toLowerCase()) ||
                    loc.toLowerCase().includes(candLocation)
                );
            }

            // Status filter
            if (statuses && statuses.length > 0) {
                passes = passes && statuses.includes(candidate.status_code);
            }

            // Score filter
            if (minScore !== undefined) {
                passes = passes && (candidate.overallScore || 0) >= minScore;
            }

            // Language filter
            if (languages && languages.length > 0) {
                const candidateLanguages = await SELECT.from(CandidateLanguages)
                    .where({ candidate_ID: candidate.ID });
                const candLangs = candidateLanguages.map(l => l.language.toLowerCase());
                passes = passes && languages.some(lang =>
                    candLangs.includes(lang.toLowerCase())
                );
            }

            // Certification filter
            if (certifications && certifications.length > 0) {
                const candidateCerts = await SELECT.from(Certifications)
                    .where({ candidate_ID: candidate.ID });
                const certNames = candidateCerts.map(c => c.name.toLowerCase());
                passes = passes && certifications.some(cert =>
                    certNames.some(name => name.includes(cert.toLowerCase()))
                );
            }

            // Tags filter
            if (tags && tags.length > 0 && candidate.tags) {
                passes = passes && tags.some(tag => candidate.tags.includes(tag));
            }

            if (passes) {
                filtered.push(candidate);
            }
        }

        return filtered;
    }

    // ==========================================
    // ACTION HANDLERS
    // ==========================================

    /**
     * Find matches for a job posting
     */
    async handleFindMatches(req) {
        const { jobPostingId, options } = req.data;
        const { JobPostings, JobRequiredSkills, Candidates, CandidateSkills, MatchResults } = this.entities;
        const startTime = Date.now();

        try {
            const parsedOptions = options ? JSON.parse(options) : {};

            // Get job posting with requirements
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) {
                return { matchCount: 0, topMatches: '[]', processingTime: 0, message: 'Job posting not found' };
            }

            const jobRequiredSkills = await SELECT.from(JobRequiredSkills)
                .where({ jobPosting_ID: jobPostingId });

            // Get candidates to match
            let candidates = await SELECT.from(Candidates)
                .where({ status_code: { 'not in': ['archived', 'merged', 'rejected'] } });

            // Apply pre-filters if specified
            if (parsedOptions.filters) {
                candidates = await this.filterCandidatesWithCriteria(candidates, parsedOptions.filters);
            }

            // Calculate matches
            const matches = [];
            for (const candidate of candidates) {
                const candidateSkills = await SELECT.from(CandidateSkills)
                    .where({ candidate_ID: candidate.ID });

                const matchResult = await this.calculateMatch(
                    candidate, jobPosting, candidateSkills, jobRequiredSkills
                );

                // Only include matches above threshold
                const threshold = parsedOptions.minScore || 30;
                if (matchResult.overallScore >= threshold) {
                    matches.push({
                        candidate,
                        ...matchResult
                    });
                }
            }

            // Sort by score
            matches.sort((a, b) => b.overallScore - a.overallScore);

            // Save match results
            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];

                // Check if match already exists
                const existing = await SELECT.one.from(MatchResults)
                    .where({ candidate_ID: match.candidate.ID, jobPosting_ID: jobPostingId });

                const matchData = {
                    candidate_ID: match.candidate.ID,
                    jobPosting_ID: jobPostingId,
                    overallScore: match.overallScore,
                    skillScore: match.skillScore,
                    experienceScore: match.experienceScore,
                    educationScore: match.educationScore,
                    locationScore: match.locationScore,
                    scoreBreakdown: JSON.stringify(match.breakdown),
                    rank: i + 1
                };

                if (existing) {
                    await UPDATE(MatchResults).where({ ID: existing.ID }).set(matchData);
                } else {
                    await INSERT.into(MatchResults).entries({ ID: uuidv4(), ...matchData });
                }
            }

            // Emit event
            await this.emit('MatchesCalculated', {
                jobPostingId,
                matchCount: matches.length,
                topScore: matches[0]?.overallScore || 0,
                timestamp: new Date()
            });

            return {
                matchCount: matches.length,
                topMatches: JSON.stringify(matches.slice(0, 10).map(m => ({
                    candidateId: m.candidate.ID,
                    name: `${m.candidate.firstName} ${m.candidate.lastName}`,
                    score: m.overallScore
                }))),
                processingTime: Date.now() - startTime,
                message: `Found ${matches.length} matching candidates`
            };

        } catch (error) {
            console.error('Find matches error:', error);
            return {
                matchCount: 0,
                topMatches: '[]',
                processingTime: Date.now() - startTime,
                message: error.message
            };
        }
    }

    /**
     * Calculate match score for specific pair
     */
    async handleCalculateMatchScore(req) {
        const { candidateId, jobPostingId, detailedBreakdown } = req.data;
        const { JobPostings, JobRequiredSkills, Candidates, CandidateSkills } = this.entities;

        try {
            const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });

            if (!candidate || !jobPosting) {
                return { overallScore: 0, skillScore: 0, experienceScore: 0, educationScore: 0, locationScore: 0 };
            }

            const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
            const jobRequiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });

            const result = await this.calculateMatch(candidate, jobPosting, candidateSkills, jobRequiredSkills);

            return {
                ...result,
                breakdown: detailedBreakdown ? JSON.stringify(result.breakdown) : null,
                recommendations: JSON.stringify(this._generateRecommendations(result.breakdown))
            };

        } catch (error) {
            return { overallScore: 0, skillScore: 0, experienceScore: 0, educationScore: 0, locationScore: 0 };
        }
    }

    /**
     * Generate improvement recommendations
     */
    _generateRecommendations(breakdown) {
        const recommendations = [];

        if (breakdown.skillDetails?.missing?.length > 0) {
            const required = breakdown.skillDetails.missing.filter(s => s.isRequired);
            if (required.length > 0) {
                recommendations.push({
                    type: 'skill',
                    priority: 'high',
                    message: `Missing ${required.length} required skills`
                });
            }
        }

        if (breakdown.experienceDetails) {
            const { candidateYears, requiredMin } = breakdown.experienceDetails;
            if (candidateYears < requiredMin) {
                recommendations.push({
                    type: 'experience',
                    priority: 'medium',
                    message: `Experience gap: ${requiredMin - candidateYears} years below minimum`
                });
            }
        }

        return recommendations;
    }

    /**
     * Sort candidates
     */
    async handleSortCandidates(req) {
        const { candidateIds, sortingConfigId, customWeights, filters } = req.data;
        const { Candidates, SortingConfigurations, JobPostings } = this.entities;

        try {
            // Get candidates
            let candidates;
            if (candidateIds && candidateIds.length > 0) {
                candidates = await SELECT.from(Candidates).where({ ID: { in: candidateIds } });
            } else {
                candidates = await SELECT.from(Candidates).limit(500);
            }

            // Get weights
            let weights = { skillWeight: 0.35, experienceWeight: 0.25, educationWeight: 0.20, recencyWeight: 0.10, locationWeight: 0.10 };

            if (sortingConfigId) {
                const config = await SELECT.one.from(SortingConfigurations).where({ ID: sortingConfigId });
                if (config) {
                    weights = {
                        skillWeight: config.skillWeight,
                        experienceWeight: config.experienceWeight,
                        educationWeight: config.educationWeight,
                        recencyWeight: config.recencyWeight,
                        locationWeight: config.locationWeight
                    };
                }
            } else if (customWeights) {
                weights = { ...weights, ...JSON.parse(customWeights) };
            }

            // Apply filters first
            if (filters) {
                candidates = await this.filterCandidatesWithCriteria(candidates, JSON.parse(filters));
            }

            // Sort candidates
            const sorted = await this.sortCandidatesWithWeights(candidates, weights);

            return {
                sortedCandidates: JSON.stringify(sorted),
                appliedWeights: JSON.stringify(weights)
            };

        } catch (error) {
            console.error('Sort candidates error:', error);
            return { sortedCandidates: '[]', appliedWeights: '{}' };
        }
    }

    /**
     * Filter candidates
     */
    async handleFilterCandidates(req) {
        const { filterId, customCriteria, includeScores } = req.data;
        const { Candidates, SavedFilters } = this.entities;

        try {
            let criteria = {};

            if (filterId) {
                const filter = await SELECT.one.from(SavedFilters).where({ ID: filterId });
                if (filter) {
                    criteria = JSON.parse(filter.filterCriteria);
                }
            } else if (customCriteria) {
                criteria = JSON.parse(customCriteria);
            }

            // Get all candidates
            const candidates = await SELECT.from(Candidates);

            // Apply filters
            const filtered = await this.filterCandidatesWithCriteria(candidates, criteria);

            return {
                candidates: JSON.stringify(filtered),
                totalCount: filtered.length,
                appliedFilters: JSON.stringify(criteria)
            };

        } catch (error) {
            return { candidates: '[]', totalCount: 0, appliedFilters: '{}' };
        }
    }

    /**
     * Rank candidates for a position
     */
    async handleRankCandidates(req) {
        const { jobPostingId, rankingMethod, topN } = req.data;
        const { MatchResults, Candidates } = this.entities;

        try {
            // Get matches for this job
            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId })
                .orderBy('overallScore desc')
                .limit(topN || 50);

            // Enrich with candidate info
            const rankedCandidates = await Promise.all(matches.map(async (match, index) => {
                const candidate = await SELECT.one.from(Candidates).where({ ID: match.candidate_ID });
                return {
                    rank: index + 1,
                    candidateId: match.candidate_ID,
                    name: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown',
                    score: match.overallScore,
                    skillScore: match.skillScore,
                    experienceScore: match.experienceScore
                };
            }));

            return {
                rankedCandidates: JSON.stringify(rankedCandidates),
                rankingDetails: JSON.stringify({ method: rankingMethod || 'score', count: rankedCandidates.length })
            };

        } catch (error) {
            return { rankedCandidates: '[]', rankingDetails: '{}' };
        }
    }

    /**
     * Review match
     */
    async handleReviewMatch(req) {
        const { matchResultId, reviewStatus, notes } = req.data;
        const { MatchResults } = this.entities;

        try {
            await UPDATE(MatchResults).where({ ID: matchResultId }).set({
                reviewStatus,
                reviewNotes: notes,
                reviewedBy: req.user?.id || 'anonymous',
                reviewedAt: new Date()
            });

            await this.emit('MatchReviewed', {
                matchResultId,
                reviewStatus,
                reviewedBy: req.user?.id,
                timestamp: new Date()
            });

            return { success: true, message: 'Match reviewed' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Bulk review matches
     */
    async handleBulkReviewMatches(req) {
        const { matchResultIds, reviewStatus, notes } = req.data;
        let updated = 0;
        let failed = 0;

        for (const id of matchResultIds) {
            const result = await this.handleReviewMatch({
                data: { matchResultId: id, reviewStatus, notes },
                user: req.user
            });
            if (result.success) updated++;
            else failed++;
        }

        return { updated, failed };
    }

    /**
     * Shortlist top candidates
     */
    async handleShortlistTop(req) {
        const { jobPostingId, count, minScore, notifyRecruiter } = req.data;
        const { MatchResults, Candidates } = this.entities;

        try {
            // Get top matches
            let query = SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId, reviewStatus: 'pending' })
                .orderBy('overallScore desc')
                .limit(count || 10);

            if (minScore) {
                query = query.and({ overallScore: { '>=': minScore } });
            }

            const topMatches = await query;

            // Update to shortlisted
            const candidateIds = [];
            for (const match of topMatches) {
                await UPDATE(MatchResults).where({ ID: match.ID }).set({
                    reviewStatus: 'shortlisted',
                    reviewedBy: req.user?.id || 'system',
                    reviewedAt: new Date()
                });
                candidateIds.push(match.candidate_ID);

                await this.emit('CandidateShortlisted', {
                    candidateId: match.candidate_ID,
                    jobPostingId,
                    score: match.overallScore,
                    shortlistedBy: req.user?.id,
                    timestamp: new Date()
                });
            }

            return {
                shortlisted: topMatches.length,
                candidateIds
            };

        } catch (error) {
            return { shortlisted: 0, candidateIds: [] };
        }
    }

    /**
     * Recalculate all matches
     */
    async handleRecalculateMatches(req) {
        const { jobPostingId, includeArchived } = req.data;

        // Trigger find matches with no threshold
        return this.handleFindMatches({
            data: {
                jobPostingId,
                options: JSON.stringify({ minScore: 0 })
            },
            user: req.user
        });
    }

    /**
     * Batch match
     */
    async handleBatchMatch(req) {
        const { candidateIds, jobPostingIds } = req.data;
        const startTime = Date.now();
        let totalMatches = 0;

        for (const jobId of jobPostingIds) {
            const result = await this.handleFindMatches({
                data: { jobPostingId: jobId },
                user: req.user
            });
            totalMatches += result.matchCount;
        }

        return {
            totalMatches,
            processingTime: Date.now() - startTime,
            summary: JSON.stringify({ jobs: jobPostingIds.length, candidates: candidateIds?.length || 'all' })
        };
    }

    /**
     * Get match distribution
     */
    async handleGetDistribution(req) {
        const { jobPostingId } = req.data;
        const { MatchResults } = this.entities;

        try {
            const matches = await SELECT.from(MatchResults).where({ jobPosting_ID: jobPostingId });

            const scores = matches.map(m => m.overallScore || 0);
            const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            const sorted = [...scores].sort((a, b) => a - b);
            const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

            // Distribution buckets
            const distribution = {
                '0-20': scores.filter(s => s < 20).length,
                '20-40': scores.filter(s => s >= 20 && s < 40).length,
                '40-60': scores.filter(s => s >= 40 && s < 60).length,
                '60-80': scores.filter(s => s >= 60 && s < 80).length,
                '80-100': scores.filter(s => s >= 80).length
            };

            return {
                distribution: JSON.stringify(distribution),
                avgScore: Math.round(avg * 100) / 100,
                medianScore: median,
                topPercentile: JSON.stringify(matches.filter(m => m.overallScore >= 80).slice(0, 10))
            };

        } catch (error) {
            return { distribution: '{}', avgScore: 0, medianScore: 0, topPercentile: '[]' };
        }
    }

    /**
     * Skill gap analysis
     */
    async handleSkillGapAnalysis(req) {
        const { jobPostingId } = req.data;
        const { JobRequiredSkills, MatchResults, CandidateSkills, Skills } = this.entities;

        try {
            const requiredSkills = await SELECT.from(JobRequiredSkills)
                .where({ jobPosting_ID: jobPostingId });

            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId });

            // Analyze skill coverage
            const skillCoverage = {};
            const skillGaps = {};

            for (const required of requiredSkills) {
                const skill = await SELECT.one.from(Skills).where({ ID: required.skill_ID });
                if (!skill) continue;

                let hasSkill = 0;
                for (const match of matches) {
                    const candidateSkills = await SELECT.from(CandidateSkills)
                        .where({ candidate_ID: match.candidate_ID });
                    if (candidateSkills.some(s => s.skill_ID === required.skill_ID)) {
                        hasSkill++;
                    }
                }

                const coverage = matches.length > 0 ? (hasSkill / matches.length) * 100 : 0;
                skillCoverage[skill.name] = Math.round(coverage);

                if (coverage < 50) {
                    skillGaps[skill.name] = {
                        coverage,
                        isRequired: required.isRequired
                    };
                }
            }

            return {
                requiredSkills: JSON.stringify(skillCoverage),
                commonGaps: JSON.stringify(skillGaps),
                recommendations: JSON.stringify([
                    { type: 'hiring', message: 'Consider candidates with transferable skills' },
                    { type: 'training', message: 'Plan onboarding for skill gaps' }
                ])
            };

        } catch (error) {
            return { requiredSkills: '{}', commonGaps: '{}', recommendations: '[]' };
        }
    }

    /**
     * Compare candidates
     */
    async handleCompareCandidates(req) {
        const { candidateIds, jobPostingId, comparisonFactors } = req.data;
        const { Candidates, MatchResults, CandidateSkills } = this.entities;

        try {
            const comparison = [];

            for (const candidateId of candidateIds) {
                const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
                const match = await SELECT.one.from(MatchResults)
                    .where({ candidate_ID: candidateId, jobPosting_ID: jobPostingId });
                const skills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });

                comparison.push({
                    candidateId,
                    name: `${candidate.firstName} ${candidate.lastName}`,
                    overallScore: match?.overallScore || 0,
                    skillScore: match?.skillScore || 0,
                    experienceScore: match?.experienceScore || 0,
                    totalSkills: skills.length,
                    experience: candidate.totalExperienceYears
                });
            }

            // Generate recommendation
            const sorted = [...comparison].sort((a, b) => b.overallScore - a.overallScore);
            const recommendation = sorted.length > 0
                ? `Based on overall match scores, ${sorted[0].name} appears to be the strongest candidate.`
                : 'Unable to generate recommendation.';

            return {
                comparison: JSON.stringify(comparison),
                recommendation: JSON.stringify({ message: recommendation, topCandidate: sorted[0]?.candidateId })
            };

        } catch (error) {
            return { comparison: '[]', recommendation: '{}' };
        }
    }

    /**
     * Explain match
     */
    async handleExplainMatch(req) {
        const { matchResultId } = req.data;
        const { MatchResults, Candidates, JobPostings, Skills, JobRequiredSkills } = this.entities;

        try {
            const match = await SELECT.one.from(MatchResults).where({ ID: matchResultId });
            if (!match) {
                return { explanation: 'Match not found', factors: '{}', improvementTips: '[]' };
            }

            const candidate = await SELECT.one.from(Candidates).where({ ID: match.candidate_ID });
            const job = await SELECT.one.from(JobPostings).where({ ID: match.jobPosting_ID });
            const breakdown = match.scoreBreakdown ? JSON.parse(match.scoreBreakdown) : {};

            const explanation = `
${candidate.firstName} ${candidate.lastName} scored ${match.overallScore}/100 for the ${job.title} position.

Score Breakdown:
- Skills: ${match.skillScore}/100 (${breakdown.weights?.skill * 100 || 40}% weight)
- Experience: ${match.experienceScore}/100 (${breakdown.weights?.experience * 100 || 30}% weight)
- Education: ${match.educationScore}/100 (${breakdown.weights?.education * 100 || 20}% weight)
- Location: ${match.locationScore}/100 (${breakdown.weights?.location * 100 || 10}% weight)

${breakdown.skillDetails?.matched?.length > 0 ? `Matched Skills: ${breakdown.skillDetails.matched.length}` : ''}
${breakdown.skillDetails?.missing?.length > 0 ? `Missing Skills: ${breakdown.skillDetails.missing.length}` : ''}
            `.trim();

            const tips = [];
            if (match.skillScore < 70) {
                tips.push('Consider acquiring skills that are commonly required for this role');
            }
            if (match.experienceScore < 70) {
                tips.push('Gain more relevant experience in similar positions');
            }

            return {
                explanation,
                factors: JSON.stringify(breakdown),
                improvementTips: JSON.stringify(tips)
            };

        } catch (error) {
            return { explanation: 'Error generating explanation', factors: '{}', improvementTips: '[]' };
        }
    }
};
