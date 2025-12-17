/**
 * Matching Service Handler
 * Implements candidate-job matching algorithms following SAP CAP Best Practices
 */
'use strict';

const cds = require('@sap/cds');
const { createLogger, startTimer } = require('../lib/logger');
const { ValidationError, NotFoundError, BusinessRuleError } = require('../lib/errors');
const { validateUUID, validateRange } = require('../lib/validators');
const { createMLClient } = require('../lib/ml-client');

const LOG = createLogger('matching-service');

/**
 * Proficiency level weights for scoring
 */
const PROFICIENCY_WEIGHTS = {
    'beginner': 0.4,
    'intermediate': 0.7,
    'advanced': 0.9,
    'expert': 1.0
};

/**
 * Degree level rankings for comparison
 */
const DEGREE_RANKS = {
    'high_school': 1,
    'associate': 2,
    'bachelor': 3,
    'master': 4,
    'doctorate': 5
};

module.exports = class MatchingService extends cds.ApplicationService {

    async init() {
        const {
            MatchResults,
            Candidates,
            JobPostings,
            CandidateSkills,
            JobRequiredSkills,
            SortingConfigurations,
            SavedFilters
        } = this.entities;

        // Initialize ML client
        this.mlClient = createMLClient();
        LOG.info('ML Client initialized', { baseUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000' });

        // ===========================================
        // Matching Algorithm Core
        // ===========================================

        /**
         * Calculate match score between candidate and job
         */
        this.calculateMatchScore = async (candidate, jobPosting, candidateSkills, jobRequiredSkills) => {
            const weights = {
                skill: Number(jobPosting.skillWeight) || 0.40,
                experience: Number(jobPosting.experienceWeight) || 0.30,
                education: Number(jobPosting.educationWeight) || 0.20,
                location: Number(jobPosting.locationWeight) || 0.10
            };

            // Calculate individual scores
            const skillScore = this._calculateSkillScore(candidateSkills, jobRequiredSkills);
            const experienceScore = this._calculateExperienceScore(
                candidate.totalExperienceYears,
                jobPosting.minimumExperience,
                jobPosting.preferredExperience
            );
            const educationScore = this._calculateEducationScore(
                candidate.highestDegreeLevel,
                jobPosting.requiredEducation_code
            );
            const locationScore = this._calculateLocationScore(
                candidate.city,
                candidate.country_code,
                jobPosting.location,
                jobPosting.country_code,
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
                    skillDetails: this._getSkillMatchDetails(candidateSkills, jobRequiredSkills)
                }
            };
        };

        /**
         * Calculate skill match score (0-100)
         */
        this._calculateSkillScore = (candidateSkills, requiredSkills) => {
            if (!requiredSkills || requiredSkills.length === 0) return 100;
            if (!candidateSkills || candidateSkills.length === 0) {
                // No candidate skills but job requires them
                return 0;
            }

            const candidateSkillMap = new Map(
                candidateSkills.map(s => [s.skill_ID, s])
            );

            let totalWeight = 0;
            let matchedWeight = 0;

            for (const required of requiredSkills) {
                const weight = required.isRequired
                    ? (Number(required.weight) || 1.0) * 1.5  // Required skills weighted more
                    : (Number(required.weight) || 1.0);
                totalWeight += weight;

                const candidateSkill = candidateSkillMap.get(required.skill_ID);
                if (candidateSkill) {
                    // Check proficiency match
                    const requiredProf = PROFICIENCY_WEIGHTS[required.minimumProficiency] || 0.5;
                    const candidateProf = PROFICIENCY_WEIGHTS[candidateSkill.proficiencyLevel] || 0.5;

                    const proficiencyMultiplier = candidateProf >= requiredProf
                        ? 1.0
                        : candidateProf / requiredProf;

                    matchedWeight += weight * proficiencyMultiplier;
                } else if (!required.isRequired) {
                    // Nice-to-have skills don't fully penalize
                    matchedWeight += weight * 0.3;
                }
            }

            return totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 100;
        };

        /**
         * Calculate experience score (0-100)
         */
        this._calculateExperienceScore = (candidateYears, minRequired, preferredYears) => {
            candidateYears = Number(candidateYears) || 0;
            minRequired = Number(minRequired) || 0;
            preferredYears = Number(preferredYears) || minRequired;

            if (minRequired === 0) return 100;

            if (candidateYears >= preferredYears) {
                return 100;
            } else if (candidateYears >= minRequired) {
                const range = preferredYears - minRequired;
                const progress = candidateYears - minRequired;
                return 70 + (range > 0 ? (progress / range) * 30 : 30);
            } else if (candidateYears >= minRequired * 0.7) {
                return 50 + ((candidateYears / minRequired) * 20);
            } else {
                return Math.max(0, (candidateYears / minRequired) * 50);
            }
        };

        /**
         * Calculate education score (0-100)
         */
        this._calculateEducationScore = (candidateLevel, requiredLevel) => {
            if (!requiredLevel) return 100;

            const candidateRank = DEGREE_RANKS[candidateLevel] || 0;
            const requiredRank = DEGREE_RANKS[requiredLevel] || 0;

            if (candidateRank >= requiredRank) {
                return 100;
            } else if (candidateRank === requiredRank - 1) {
                return 75;
            } else {
                return Math.max(0, 50 - ((requiredRank - candidateRank - 1) * 25));
            }
        };

        /**
         * Calculate location score (0-100)
         */
        this._calculateLocationScore = (candCity, candCountry, jobLocation, jobCountry, locationType) => {
            if (locationType === 'remote') return 100;

            if (!candCity && !candCountry) return 50;
            if (!jobLocation && !jobCountry) return 50;

            // Exact city match
            if (candCity && jobLocation &&
                candCity.toLowerCase() === jobLocation.toLowerCase()) {
                return 100;
            }

            // Same country
            if (candCountry && jobCountry && candCountry === jobCountry) {
                return locationType === 'hybrid' ? 80 : 60;
            }

            // Different location for onsite
            return locationType === 'onsite' ? 20 : 50;
        };

        /**
         * Get detailed skill match information
         */
        this._getSkillMatchDetails = (candidateSkills, requiredSkills) => {
            const candidateSkillIds = new Set(candidateSkills.map(s => s.skill_ID));
            const requiredSkillIds = new Set(requiredSkills.map(s => s.skill_ID));

            const matched = [];
            const missing = [];
            const extra = [];

            for (const req of requiredSkills) {
                if (candidateSkillIds.has(req.skill_ID)) {
                    const candSkill = candidateSkills.find(s => s.skill_ID === req.skill_ID);
                    matched.push({
                        skillId: req.skill_ID,
                        isRequired: req.isRequired,
                        requiredProficiency: req.minimumProficiency,
                        candidateProficiency: candSkill?.proficiencyLevel
                    });
                } else {
                    missing.push({
                        skillId: req.skill_ID,
                        isRequired: req.isRequired,
                        requiredProficiency: req.minimumProficiency
                    });
                }
            }

            for (const skill of candidateSkills) {
                if (!requiredSkillIds.has(skill.skill_ID)) {
                    extra.push({
                        skillId: skill.skill_ID,
                        proficiency: skill.proficiencyLevel
                    });
                }
            }

            return { matched, missing, extra };
        };

        // ===========================================
        // Action Handlers
        // ===========================================

        this.on('calculateMatch', async (req) => {
            const timer = startTimer('calculateMatch', LOG);
            const { candidateId, jobPostingId, includeBreakdown } = req.data;

            LOG.debug('Calculating match', { candidateId, jobPostingId });

            try {
                validateUUID(candidateId, 'candidateId');
                validateUUID(jobPostingId, 'jobPostingId');

                const [candidate, jobPosting, candidateSkills, jobRequiredSkills] = await Promise.all([
                    SELECT.one.from(Candidates).where({ ID: candidateId }),
                    SELECT.one.from(JobPostings).where({ ID: jobPostingId }),
                    SELECT.from(CandidateSkills).where({ candidate_ID: candidateId }),
                    SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId })
                ]);

                if (!candidate) throw new NotFoundError('Candidate', candidateId);
                if (!jobPosting) throw new NotFoundError('JobPosting', jobPostingId);

                const result = await this.calculateMatchScore(
                    candidate,
                    jobPosting,
                    candidateSkills,
                    jobRequiredSkills
                );

                timer.stop({ candidateId, jobPostingId, score: result.overallScore });

                return {
                    overallScore: result.overallScore,
                    skillScore: result.skillScore,
                    experienceScore: result.experienceScore,
                    educationScore: result.educationScore,
                    locationScore: result.locationScore,
                    breakdown: includeBreakdown ? JSON.stringify(result.breakdown) : null,
                    recommendations: this._generateRecommendations(result.breakdown)
                };

            } catch (error) {
                LOG.error('Calculate match failed', error, { candidateId, jobPostingId });
                throw error;
            }
        });

        this.on('batchMatch', async (req) => {
            const timer = startTimer('batchMatch', LOG);
            const { jobPostingId, candidateIds, minScore } = req.data;

            LOG.info('Batch matching candidates', { jobPostingId, candidateCount: candidateIds?.length });

            try {
                validateUUID(jobPostingId, 'jobPostingId');

                const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
                if (!jobPosting) throw new NotFoundError('JobPosting', jobPostingId);

                const threshold = Number(minScore) || 0;
                let matchesCreated = 0;
                let totalScore = 0;
                let usedSemanticMatching = false;

                // Try ML semantic matching first
                try {
                    LOG.info('Attempting ML semantic matching', { jobPostingId });
                    const mlResult = await this.mlClient.findSemanticMatches({
                        jobPostingId,
                        minScore: threshold,
                        limit: 100,
                        includeBreakdown: true,
                        excludeDisqualified: false
                    });

                    if (mlResult && mlResult.matches && mlResult.matches.length > 0) {
                        usedSemanticMatching = true;
                        LOG.info('ML semantic matching succeeded', { matchCount: mlResult.matches.length });

                        // Filter ML results by candidateIds if provided
                        let filteredMatches = mlResult.matches;
                        if (candidateIds && candidateIds.length > 0) {
                            const candidateIdSet = new Set(candidateIds);
                            filteredMatches = mlResult.matches.filter(match =>
                                match.candidate_id && candidateIdSet.has(match.candidate_id)
                            );
                            LOG.info('Filtered ML results by candidateIds', {
                                original: mlResult.matches.length,
                                filtered: filteredMatches.length
                            });
                        }

                        // Store ML results in HANA
                        for (const match of filteredMatches) {
                            // Defensive null checks - skip matches missing required fields
                            if (!match.candidate_id || match.combined_score === null || match.combined_score === undefined) {
                                LOG.warn('Skipping ML match with missing required fields', { match });
                                continue;
                            }

                            const existing = await SELECT.one.from(MatchResults)
                                .where({ candidate_ID: match.candidate_id, jobPosting_ID: jobPostingId });

                            const matchData = {
                                candidate_ID: match.candidate_id,
                                jobPosting_ID: jobPostingId,
                                overallScore: match.combined_score,
                                skillScore: match.criteria_score || 0,
                                experienceScore: 0,
                                educationScore: 0,
                                locationScore: 0,
                                scoreBreakdown: JSON.stringify(match.score_breakdown || {}),
                                matchedSkills: JSON.stringify(match.matched_criteria || []),
                                missingSkills: JSON.stringify(match.missing_criteria || []),
                                aiRecommendation: `Semantic similarity: ${((match.cosine_similarity || 0) * 100).toFixed(1)}%`,
                                reviewStatus: 'pending'
                            };

                            if (existing) {
                                await UPDATE(MatchResults).where({ ID: existing.ID }).set(matchData);
                            } else {
                                await INSERT.into(MatchResults).entries(matchData);
                            }

                            matchesCreated++;
                            totalScore += match.combined_score;
                        }

                        // Update rankings
                        await this._updateRankings(jobPostingId);
                    }
                } catch (mlError) {
                    LOG.warn('ML semantic matching failed, falling back to local', { error: mlError.message });
                }

                // Fallback to local matching if ML didn't work
                if (!usedSemanticMatching) {
                    LOG.info('Using local matching algorithm');
                    const jobRequiredSkills = await SELECT.from(JobRequiredSkills)
                        .where({ jobPosting_ID: jobPostingId });

                    let candidates;
                    if (candidateIds && candidateIds.length > 0) {
                        candidates = await SELECT.from(Candidates)
                            .where({ ID: { in: candidateIds }, isDeleted: false });
                    } else {
                        candidates = await SELECT.from(Candidates)
                            .where({ isDeleted: false })
                            .limit(1000);
                    }

                    for (const candidate of candidates) {
                        const candidateSkills = await SELECT.from(CandidateSkills)
                            .where({ candidate_ID: candidate.ID });

                        const result = await this.calculateMatchScore(
                            candidate,
                            jobPosting,
                            candidateSkills,
                            jobRequiredSkills
                        );

                        if (result.overallScore >= threshold) {
                            const existing = await SELECT.one.from(MatchResults)
                                .where({ candidate_ID: candidate.ID, jobPosting_ID: jobPostingId });

                            const matchData = {
                                candidate_ID: candidate.ID,
                                jobPosting_ID: jobPostingId,
                                overallScore: result.overallScore,
                                skillScore: result.skillScore,
                                experienceScore: result.experienceScore,
                                educationScore: result.educationScore,
                                locationScore: result.locationScore,
                                scoreBreakdown: JSON.stringify(result.breakdown),
                                matchedSkills: JSON.stringify(result.breakdown.skillDetails.matched),
                                missingSkills: JSON.stringify(result.breakdown.skillDetails.missing),
                                reviewStatus: 'pending'
                            };

                            if (existing) {
                                await UPDATE(MatchResults).where({ ID: existing.ID }).set(matchData);
                            } else {
                                await INSERT.into(MatchResults).entries(matchData);
                            }

                            matchesCreated++;
                            totalScore += result.overallScore;
                        }
                    }

                    await this._updateRankings(jobPostingId);
                }

                const duration = timer.stop({ jobPostingId, matched: matchesCreated, semantic: usedSemanticMatching });

                return {
                    totalProcessed: matchesCreated,
                    matchesCreated,
                    avgScore: matchesCreated > 0 ? Math.round((totalScore / matchesCreated) * 100) / 100 : 0,
                    processingTime: duration
                };

            } catch (error) {
                LOG.error('Batch match failed', error, { jobPostingId });
                throw error;
            }
        });

        this.on('rankCandidates', async (req) => {
            const { jobPostingId, sortingConfigId, topN } = req.data;

            LOG.debug('Ranking candidates', { jobPostingId, topN });

            let weights = null;
            if (sortingConfigId) {
                const config = await SELECT.one.from(SortingConfigurations)
                    .where({ ID: sortingConfigId });
                if (config) {
                    weights = {
                        skillWeight: config.skillWeight,
                        experienceWeight: config.experienceWeight,
                        educationWeight: config.educationWeight,
                        locationWeight: config.locationWeight
                    };
                }
            }

            // Get matches ordered by score
            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId })
                .orderBy('overallScore desc')
                .limit(topN || 50);

            return matches;
        });


        this.on('sortCandidates', async (req) => {
            const { candidateIds, weights, jobPostingId } = req.data;

            LOG.debug('Sorting candidates', { count: candidateIds.length });

            const candidates = await SELECT.from(Candidates)
                .where({ ID: { in: candidateIds } });

            const results = [];

            for (const candidate of candidates) {
                const candidateSkills = await SELECT.from(CandidateSkills)
                    .where({ candidate_ID: candidate.ID });

                // Calculate component scores
                const skillScore = candidateSkills.length * 5; // Simple skill count
                const expScore = Math.min(100, (candidate.totalExperienceYears || 0) * 10);
                const eduScore = 70; // Default

                // Apply weights
                const w = weights || {
                    skillWeight: 0.35,
                    experienceWeight: 0.35,
                    educationWeight: 0.15,
                    locationWeight: 0.15
                };

                const sortScore =
                    (skillScore * (Number(w.skillWeight) || 0.35)) +
                    (expScore * (Number(w.experienceWeight) || 0.35)) +
                    (eduScore * (Number(w.educationWeight) || 0.15)) +
                    (50 * (Number(w.locationWeight) || 0.15));

                results.push({
                    candidateId: candidate.ID,
                    sortScore: Math.round(sortScore * 100) / 100,
                    breakdown: JSON.stringify({ skillScore, expScore, eduScore })
                });
            }

            // Sort by score descending
            results.sort((a, b) => b.sortScore - a.sortScore);

            return results;
        });

        this.on('filterCandidates', async (req) => {
            const { criteria, includeScores } = req.data;

            LOG.debug('Filtering candidates', { criteria });

            let query = SELECT.from(Candidates).where({ isDeleted: false });

            // Apply experience filters
            if (criteria.minExperience !== undefined) {
                query = query.and({ totalExperienceYears: { '>=': criteria.minExperience } });
            }
            if (criteria.maxExperience !== undefined) {
                query = query.and({ totalExperienceYears: { '<=': criteria.maxExperience } });
            }

            // Apply location filter
            if (criteria.locations && criteria.locations.length > 0) {
                query = query.and({ city: { in: criteria.locations } });
            }

            // Apply status filter
            if (criteria.statuses && criteria.statuses.length > 0) {
                query = query.and({ status_code: { in: criteria.statuses } });
            }

            // Apply score filter
            if (criteria.minScore !== undefined) {
                query = query.and({ overallScore: { '>=': criteria.minScore } });
            }

            const candidates = await query.limit(500);

            // Skill filtering (post-query)
            let filtered = candidates;
            if (criteria.skills && criteria.skills.length > 0) {
                const candidatesWithSkills = [];

                for (const candidate of candidates) {
                    const candSkills = await SELECT.from(CandidateSkills)
                        .where({ candidate_ID: candidate.ID });
                    const candSkillIds = new Set(candSkills.map(s => s.skill_ID));

                    const matchType = criteria.skillMatchType || 'any';
                    const matches = matchType === 'all'
                        ? criteria.skills.every(s => candSkillIds.has(s))
                        : criteria.skills.some(s => candSkillIds.has(s));

                    if (matches) {
                        candidatesWithSkills.push(candidate);
                    }
                }

                filtered = candidatesWithSkills;
            }

            return filtered.map(c => ({
                candidateId: c.ID,
                matchScore: includeScores ? c.overallScore : null
            }));
        });

        // ===========================================
        // Functions
        // ===========================================

        this.on('getMatchDistribution', async (req) => {
            const { jobPostingId } = req.data;

            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId });

            if (matches.length === 0) {
                return {
                    totalMatches: 0,
                    avgScore: 0,
                    medianScore: 0,
                    distribution: JSON.stringify({})
                };
            }

            const scores = matches.map(m => Number(m.overallScore) || 0);
            const sorted = [...scores].sort((a, b) => a - b);

            const distribution = {
                '0-20': scores.filter(s => s < 20).length,
                '20-40': scores.filter(s => s >= 20 && s < 40).length,
                '40-60': scores.filter(s => s >= 40 && s < 60).length,
                '60-80': scores.filter(s => s >= 60 && s < 80).length,
                '80-100': scores.filter(s => s >= 80).length
            };

            return {
                totalMatches: matches.length,
                avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
                medianScore: sorted[Math.floor(sorted.length / 2)],
                distribution: JSON.stringify(distribution)
            };
        });

        this.on('analyzeSkillGaps', async (req) => {
            const { jobPostingId } = req.data;

            const requiredSkills = await SELECT.from(JobRequiredSkills)
                .where({ jobPosting_ID: jobPostingId });

            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId });

            const skillAnalysis = [];
            const gapCounts = {};

            for (const required of requiredSkills) {
                let hasSkillCount = 0;

                for (const match of matches) {
                    const missingSkills = JSON.parse(match.missingSkills || '[]');
                    const isMissing = missingSkills.some(s => s.skillId === required.skill_ID);

                    if (!isMissing) {
                        hasSkillCount++;
                    } else {
                        gapCounts[required.skill_ID] = (gapCounts[required.skill_ID] || 0) + 1;
                    }
                }

                skillAnalysis.push({
                    skillId: required.skill_ID,
                    skillName: required.skill?.name || 'Unknown',
                    coveragePercentage: matches.length > 0
                        ? Math.round((hasSkillCount / matches.length) * 100)
                        : 0,
                    avgProficiency: 'intermediate' // Would need to calculate
                });
            }

            // Top gaps
            const mostCommonGaps = Object.entries(gapCounts)
                .map(([skillId, count]) => ({ skillId, missingCount: count }))
                .sort((a, b) => b.missingCount - a.missingCount)
                .slice(0, 5);

            return {
                requiredSkills: skillAnalysis,
                mostCommonGaps,
                recommendations: [
                    skillAnalysis.some(s => s.coveragePercentage < 30)
                        ? 'Consider sourcing from different channels to find candidates with rare skills'
                        : 'Skill coverage is adequate',
                    mostCommonGaps.length > 0
                        ? `Focus training programs on: ${mostCommonGaps.map(g => g.skillId).join(', ')}`
                        : 'No significant skill gaps identified'
                ]
            };
        });

        this.on('explainMatch', async (req) => {
            const { matchResultId } = req.data;

            const match = await SELECT.one.from(MatchResults).where({ ID: matchResultId });
            if (!match) throw new NotFoundError('MatchResult', matchResultId);

            const [candidate, job] = await Promise.all([
                SELECT.one.from(Candidates).where({ ID: match.candidate_ID }),
                SELECT.one.from(JobPostings).where({ ID: match.jobPosting_ID })
            ]);

            const breakdown = JSON.parse(match.scoreBreakdown || '{}');

            const explanation =
                `${candidate?.firstName} ${candidate?.lastName} scored ${match.overallScore}/100 for ${job?.title}.\n\n` +
                `Score Breakdown:\n` +
                `- Skills: ${match.skillScore}/100 (${(breakdown.weights?.skill || 0.4) * 100}% weight)\n` +
                `- Experience: ${match.experienceScore}/100 (${(breakdown.weights?.experience || 0.3) * 100}% weight)\n` +
                `- Education: ${match.educationScore}/100 (${(breakdown.weights?.education || 0.2) * 100}% weight)\n` +
                `- Location: ${match.locationScore}/100 (${(breakdown.weights?.location || 0.1) * 100}% weight)`;

            const tips = [];
            if (match.skillScore < 70) tips.push('Candidate should develop more required skills');
            if (match.experienceScore < 70) tips.push('More industry experience would strengthen this match');
            if (match.locationScore < 70) tips.push('Location may require relocation discussion');

            return {
                explanation,
                factors: match.scoreBreakdown,
                improvementTips: tips
            };
        });

        // ===========================================
        // Helper Methods
        // ===========================================

        this._updateRankings = async (jobPostingId) => {
            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId })
                .orderBy('overallScore desc');

            for (let i = 0; i < matches.length; i++) {
                await UPDATE(MatchResults)
                    .where({ ID: matches[i].ID })
                    .set({ rank: i + 1 });
            }
        };

        this._generateRecommendations = (breakdown) => {
            const recommendations = [];

            if (breakdown?.skillDetails?.missing?.length > 0) {
                const requiredMissing = breakdown.skillDetails.missing.filter(s => s.isRequired);
                if (requiredMissing.length > 0) {
                    recommendations.push(`Missing ${requiredMissing.length} required skills`);
                }
            }

            return recommendations;
        };

        await super.init();
    }
};
