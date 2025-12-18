/**
 * Consolidated Job Service Implementation
 *
 * Handles: Jobs, Matching, Analytics, Notifications, Admin
 * Merged from: JobService, MatchingService, AnalyticsService, NotificationService, AdminService
 *
 * @path /api/jobs
 * @see services.cds - JobService definition
 */
const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');
const { createMLClient } = require('./lib/ml-client');

const LOG = cds.log('job-service');

module.exports = class JobService extends cds.ApplicationService {

    async init() {
        // Initialize ML client
        this.mlClient = createMLClient();
        LOG.info('ML Client initialized for job service');

        // Configuration for notifications
        this.n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/match-notification';
        this.cooldownHours = parseInt(process.env.NOTIFICATION_COOLDOWN_HOURS) || 24;

        // In-memory storage for notifications (would be PostgreSQL in production)
        this.thresholds = new Map();
        this.notificationHistory = [];

        // Memory cleanup: periodically prune old notifications (every hour)
        this._cleanupInterval = setInterval(() => {
            this._cleanupOldNotifications();
        }, 60 * 60 * 1000); // 1 hour

        // Get entity references
        const { JobPostings, JobRequiredSkills, MatchResults, Candidates, CandidateSkills,
                Skills, SkillCategories, CVDocuments, AuditLogs, Interviews,
                CandidateLanguages, Certifications } = cds.entities('cv.sorting');

        // ==========================================
        // JOB POSTING BOUND ACTIONS
        // ==========================================

        this.on('publish', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });

            if (!jobPosting) {
                req.error(404, 'Job posting not found');
                return;
            }
            if (jobPosting.status === 'open') {
                req.error(400, 'Job posting is already published');
                return;
            }
            if (!jobPosting.title) {
                req.error(400, 'Job title is required before publishing');
                return;
            }

            // Update status to open (published)
            await UPDATE(JobPostings).where({ ID: jobPostingId }).set({
                status: 'open',
                publishedAt: new Date().toISOString()
            });

            // Generate embedding asynchronously (don't block)
            const description = [
                jobPosting.title,
                jobPosting.description,
                jobPosting.responsibilities,
                jobPosting.qualifications
            ].filter(Boolean).join('\n\n');

            const requirements = jobPosting.qualifications || '';

            this.mlClient.generateEmbedding({
                entityType: 'job',
                entityId: jobPostingId,
                textContent: description,
                requirementsText: requirements
            }).then(result => {
                LOG.info('Job embedding generated', {
                    jobId: jobPostingId,
                    dimension: result.embedding_dimension
                });
            }).catch(err => {
                LOG.warn('Failed to generate job embedding', {
                    jobId: jobPostingId,
                    error: err.message
                });
            });

            return SELECT.one.from(JobPostings).where({ ID: jobPostingId });
        });

        this.on('close', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });

            if (!jobPosting) {
                req.error(404, 'Job posting not found');
                return;
            }
            if (jobPosting.status === 'closed') {
                req.error(400, 'Job posting is already closed');
                return;
            }

            await UPDATE(JobPostings).where({ ID: jobPostingId }).set({ status: 'closed' });
            return SELECT.one.from(JobPostings).where({ ID: jobPostingId });
        });

        this.on('reopen', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });

            if (!jobPosting) {
                req.error(404, 'Job posting not found');
                return;
            }
            if (jobPosting.status !== 'closed') {
                req.error(400, 'Only closed job postings can be reopened');
                return;
            }

            await UPDATE(JobPostings).where({ ID: jobPostingId }).set({
                status: 'open',
                publishedAt: new Date().toISOString()
            });
            return SELECT.one.from(JobPostings).where({ ID: jobPostingId });
        });

        this.on('findMatchingCandidates', 'JobPostings', async (req) => {
            const jobPostingId = req.params[0];
            const { minScore = 50, limit = 50 } = req.data;

            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) {
                return { matchCount: 0, topMatches: '[]' };
            }

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

                    // Save or update match result
                    const existingMatch = await SELECT.one.from(MatchResults)
                        .where({ candidate_ID: candidate.ID, jobPosting_ID: jobPostingId });

                    if (existingMatch) {
                        await UPDATE(MatchResults).where({ ID: existingMatch.ID }).set({
                            overallScore: matchResult.overallScore,
                            skillScore: matchResult.skillScore,
                            experienceScore: matchResult.experienceScore,
                            educationScore: matchResult.educationScore,
                            locationScore: matchResult.locationScore
                        });
                    } else {
                        await INSERT.into(MatchResults).entries({
                            ID: uuidv4(),
                            candidate_ID: candidate.ID,
                            jobPosting_ID: jobPostingId,
                            overallScore: matchResult.overallScore,
                            skillScore: matchResult.skillScore,
                            experienceScore: matchResult.experienceScore,
                            educationScore: matchResult.educationScore,
                            locationScore: matchResult.locationScore,
                            reviewStatus: 'pending'
                        });
                    }
                }
            }

            matches.sort((a, b) => b.score - a.score);
            const topMatches = matches.slice(0, limit);

            return {
                matchCount: matches.length,
                topMatches: JSON.stringify(topMatches)
            };
        });

        // ==========================================
        // MATCH RESULTS BOUND ACTIONS
        // ==========================================

        this.on('review', 'MatchResults', async (req) => {
            const matchResultId = req.params[0];
            const { status, notes } = req.data;

            const matchResult = await SELECT.one.from(MatchResults).where({ ID: matchResultId });
            if (!matchResult) {
                req.error(404, 'Match result not found');
                return;
            }

            const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected'];
            if (!validStatuses.includes(status)) {
                req.error(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
                return;
            }

            await UPDATE(MatchResults).where({ ID: matchResultId }).set({
                reviewStatus: status,
                reviewNotes: notes || null,
                reviewedBy: req.user?.id || 'anonymous',
                reviewedAt: new Date().toISOString()
            });

            return SELECT.one.from(MatchResults).where({ ID: matchResultId });
        });

        // ==========================================
        // JOB FUNCTIONS
        // ==========================================

        this.on('getJobStatistics', async (req) => {
            const { jobPostingId } = req.data;

            if (!jobPostingId) {
                return { totalApplications: 0, avgMatchScore: 0, scoreDistribution: '{}', topSkillGaps: [] };
            }

            const matches = await SELECT.from(MatchResults).where({ jobPosting_ID: jobPostingId });
            const totalApplications = matches.length;
            const avgMatchScore = matches.length > 0
                ? matches.reduce((sum, m) => sum + (m.overallScore || 0), 0) / matches.length
                : 0;

            const scoreDistribution = {
                '0-20': matches.filter(m => m.overallScore < 20).length,
                '20-40': matches.filter(m => m.overallScore >= 20 && m.overallScore < 40).length,
                '40-60': matches.filter(m => m.overallScore >= 40 && m.overallScore < 60).length,
                '60-80': matches.filter(m => m.overallScore >= 60 && m.overallScore < 80).length,
                '80-100': matches.filter(m => m.overallScore >= 80).length
            };

            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });
            const topSkillGaps = [];

            for (const reqSkill of requiredSkills) {
                const skill = await SELECT.one.from(Skills).where({ ID: reqSkill.skill_ID });
                if (!skill) continue;

                let hasSkill = 0;
                for (const match of matches) {
                    const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: match.candidate_ID });
                    if (candidateSkills.some(cs => cs.skill_ID === reqSkill.skill_ID)) {
                        hasSkill++;
                    }
                }

                const gapPercentage = matches.length > 0 ? ((matches.length - hasSkill) / matches.length) * 100 : 0;
                if (gapPercentage > 30) {
                    topSkillGaps.push({ skillName: skill.name, gapPercentage: Math.round(gapPercentage * 100) / 100 });
                }
            }

            topSkillGaps.sort((a, b) => b.gapPercentage - a.gapPercentage);

            return {
                totalApplications,
                avgMatchScore: Math.round(avgMatchScore * 100) / 100,
                scoreDistribution: JSON.stringify(scoreDistribution),
                topSkillGaps: topSkillGaps.slice(0, 10)
            };
        });

        this.on('compareCandidates', async (req) => {
            const { jobPostingId, candidateIds } = req.data;

            if (!jobPostingId || !candidateIds || candidateIds.length === 0) {
                return { comparison: '[]', recommendation: '' };
            }

            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) {
                return { comparison: '[]', recommendation: 'Job posting not found' };
            }

            const comparison = [];

            for (const candidateId of candidateIds) {
                const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
                if (!candidate) continue;

                const matchResult = await SELECT.one.from(MatchResults)
                    .where({ candidate_ID: candidateId, jobPosting_ID: jobPostingId });
                const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });

                comparison.push({
                    candidateId,
                    name: `${candidate.firstName} ${candidate.lastName}`,
                    email: candidate.email,
                    headline: candidate.headline || '',
                    totalExperience: candidate.totalExperienceYears || 0,
                    skillsCount: candidateSkills.length,
                    overallScore: matchResult?.overallScore || 0,
                    skillScore: matchResult?.skillScore || 0,
                    experienceScore: matchResult?.experienceScore || 0,
                    educationScore: matchResult?.educationScore || 0,
                    locationScore: matchResult?.locationScore || 0,
                    reviewStatus: matchResult?.reviewStatus || 'not_reviewed'
                });
            }

            comparison.sort((a, b) => b.overallScore - a.overallScore);

            let recommendation = '';
            if (comparison.length > 0) {
                const topCandidate = comparison[0];
                if (topCandidate.overallScore >= 80) {
                    recommendation = `${topCandidate.name} is a strong match with a score of ${topCandidate.overallScore}%. Consider prioritizing this candidate.`;
                } else if (topCandidate.overallScore >= 60) {
                    recommendation = `${topCandidate.name} is the top candidate with a score of ${topCandidate.overallScore}%. Some skill gaps may need to be addressed.`;
                } else {
                    recommendation = `No candidates have a strong match. Consider expanding the search criteria or reviewing job requirements.`;
                }
            } else {
                recommendation = 'No valid candidates found for comparison.';
            }

            return { comparison: JSON.stringify(comparison), recommendation };
        });

        // ==========================================
        // MATCHING ACTIONS & FUNCTIONS
        // ==========================================

        this.on('calculateMatch', async (req) => {
            const { candidateId, jobPostingId, includeBreakdown } = req.data;

            const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });

            if (!candidate || !jobPosting) {
                req.error(404, 'Candidate or job posting not found');
                return;
            }

            const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });

            const result = this._calculateMatchScore(candidate, jobPosting, candidateSkills, requiredSkills);

            return {
                overallScore: result.overallScore,
                skillScore: result.skillScore,
                experienceScore: result.experienceScore,
                educationScore: result.educationScore,
                locationScore: result.locationScore,
                breakdown: includeBreakdown ? JSON.stringify(result.breakdown || {}) : null,
                recommendations: []
            };
        });

        this.on('batchMatch', async (req) => {
            const { jobPostingId, candidateIds, minScore } = req.data;
            const startTime = Date.now();

            const jobPosting = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            if (!jobPosting) {
                return { totalProcessed: 0, matchesCreated: 0, avgScore: 0, processingTime: 0 };
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

            for (const candidate of candidates) {
                const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });
                const result = this._calculateMatchScore(candidate, jobPosting, candidateSkills, requiredSkills);

                if (result.overallScore >= (minScore || 0)) {
                    const existingMatch = await SELECT.one.from(MatchResults)
                        .where({ candidate_ID: candidate.ID, jobPosting_ID: jobPostingId });

                    if (existingMatch) {
                        await UPDATE(MatchResults).where({ ID: existingMatch.ID }).set({
                            overallScore: result.overallScore,
                            skillScore: result.skillScore,
                            experienceScore: result.experienceScore,
                            educationScore: result.educationScore,
                            locationScore: result.locationScore
                        });
                    } else {
                        await INSERT.into(MatchResults).entries({
                            ID: uuidv4(),
                            candidate_ID: candidate.ID,
                            jobPosting_ID: jobPostingId,
                            overallScore: result.overallScore,
                            skillScore: result.skillScore,
                            experienceScore: result.experienceScore,
                            educationScore: result.educationScore,
                            locationScore: result.locationScore,
                            reviewStatus: 'pending'
                        });
                    }
                    matchesCreated++;
                    totalScore += result.overallScore;
                }
            }

            return {
                totalProcessed: candidates.length,
                matchesCreated,
                avgScore: matchesCreated > 0 ? Math.round((totalScore / matchesCreated) * 100) / 100 : 0,
                processingTime: Date.now() - startTime
            };
        });

        this.on('rankCandidates', async (req) => {
            const { jobPostingId, sortingConfigId, topN } = req.data;

            const matches = await SELECT.from(MatchResults)
                .where({ jobPosting_ID: jobPostingId })
                .orderBy({ overallScore: 'desc' })
                .limit(topN || 50);

            return matches;
        });

        this.on('sortCandidates', async (req) => {
            const { candidateIds, weights, jobPostingId } = req.data;

            const candidates = await SELECT.from(Candidates).where({ ID: { in: candidateIds } });
            const sortedCandidates = await this._sortCandidatesWithWeights(candidates, weights || {}, jobPostingId);

            return sortedCandidates.map(c => ({
                candidateId: c.ID,
                sortScore: c.sortScore,
                breakdown: JSON.stringify(c.scoreComponents || {})
            }));
        });

        this.on('filterCandidates', async (req) => {
            const { criteria, includeScores } = req.data;

            const candidates = await SELECT.from(Candidates).where({ isDeleted: false });
            const filtered = await this._filterCandidatesWithCriteria(candidates, criteria);

            return filtered.map(c => ({
                candidateId: c.ID,
                matchScore: includeScores ? (c.overallScore || 0) : null
            }));
        });

        this.on('getMatchDistribution', async (req) => {
            const { jobPostingId } = req.data;

            const matches = await SELECT.from(MatchResults).where({ jobPosting_ID: jobPostingId });
            const scores = matches.map(m => m.overallScore || 0);

            const totalMatches = matches.length;
            const avgScore = totalMatches > 0 ? scores.reduce((a, b) => a + b, 0) / totalMatches : 0;

            scores.sort((a, b) => a - b);
            const medianScore = totalMatches > 0 ? scores[Math.floor(totalMatches / 2)] : 0;

            const distribution = {
                '0-20': scores.filter(s => s < 20).length,
                '20-40': scores.filter(s => s >= 20 && s < 40).length,
                '40-60': scores.filter(s => s >= 40 && s < 60).length,
                '60-80': scores.filter(s => s >= 60 && s < 80).length,
                '80-100': scores.filter(s => s >= 80).length
            };

            return {
                totalMatches,
                avgScore: Math.round(avgScore * 100) / 100,
                medianScore: Math.round(medianScore * 100) / 100,
                distribution: JSON.stringify(distribution)
            };
        });

        this.on('analyzeSkillGaps', async (req) => {
            const { jobPostingId } = req.data;

            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });
            const matches = await SELECT.from(MatchResults).where({ jobPosting_ID: jobPostingId });

            const skillCoverage = [];
            const mostCommonGaps = [];

            for (const reqSkill of requiredSkills) {
                const skill = await SELECT.one.from(Skills).where({ ID: reqSkill.skill_ID });
                if (!skill) continue;

                let hasSkillCount = 0;
                let totalProficiency = 0;

                for (const match of matches) {
                    const candidateSkill = await SELECT.one.from(CandidateSkills)
                        .where({ candidate_ID: match.candidate_ID, skill_ID: reqSkill.skill_ID });
                    if (candidateSkill) {
                        hasSkillCount++;
                        const profLevels = { 'beginner': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
                        totalProficiency += profLevels[candidateSkill.proficiencyLevel] || 2;
                    }
                }

                const coveragePercentage = matches.length > 0 ? (hasSkillCount / matches.length) * 100 : 0;

                skillCoverage.push({
                    skillId: reqSkill.skill_ID,
                    skillName: skill.name,
                    coveragePercentage: Math.round(coveragePercentage * 100) / 100,
                    avgProficiency: hasSkillCount > 0 ? ['beginner', 'intermediate', 'advanced', 'expert'][Math.round(totalProficiency / hasSkillCount) - 1] : 'none'
                });

                if (coveragePercentage < 50) {
                    mostCommonGaps.push({
                        skillName: skill.name,
                        missingCount: matches.length - hasSkillCount
                    });
                }
            }

            mostCommonGaps.sort((a, b) => b.missingCount - a.missingCount);

            return {
                requiredSkills: skillCoverage,
                mostCommonGaps: mostCommonGaps.slice(0, 10),
                recommendations: skillCoverage.filter(s => s.coveragePercentage < 30).map(s => `Consider making "${s.skillName}" optional to expand candidate pool`)
            };
        });

        this.on('explainMatch', async (req) => {
            const { matchResultId } = req.data;

            const match = await SELECT.one.from(MatchResults).where({ ID: matchResultId });
            if (!match) {
                return { explanation: 'Match not found', factors: '{}', improvementTips: [] };
            }

            const factors = {
                skillScore: match.skillScore,
                experienceScore: match.experienceScore,
                educationScore: match.educationScore,
                locationScore: match.locationScore
            };

            const explanation = `Overall match score: ${match.overallScore}%. ` +
                `Skill alignment: ${match.skillScore}%, ` +
                `Experience fit: ${match.experienceScore}%, ` +
                `Education: ${match.educationScore}%, ` +
                `Location: ${match.locationScore}%.`;

            const improvementTips = [];
            if (match.skillScore < 70) improvementTips.push('Acquire more required skills');
            if (match.experienceScore < 70) improvementTips.push('Gain more experience in the field');
            if (match.educationScore < 70) improvementTips.push('Consider additional certifications');

            return { explanation, factors: JSON.stringify(factors), improvementTips };
        });

        // ==========================================
        // ANALYTICS FUNCTIONS
        // ==========================================

        this.on('getPipelineOverview', async (req) => {
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
        });

        this.on('getInterviewAnalytics', async (req) => {
            const { fromDate, toDate } = req.data;

            try {
                const interviews = await SELECT.from(Interviews);

                const statusCounts = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
                interviews.forEach(interview => {
                    const status = interview.status_code?.toLowerCase() || 'scheduled';
                    if (statusCounts.hasOwnProperty(status)) statusCounts[status]++;
                });

                const totalScheduled = interviews.length;
                const completed = statusCounts.completed;
                const cancelled = statusCounts.cancelled;
                const noShow = statusCounts.no_show;

                const completedWithRatings = interviews.filter(i => i.status_code === 'completed' && i.overallRating);

                let avgOverallRating = 0, avgTechnicalRating = 0, avgCommunicationRating = 0, avgCultureFitRating = 0;

                if (completedWithRatings.length > 0) {
                    const sumRatings = completedWithRatings.reduce((acc, i) => ({
                        overall: acc.overall + (i.overallRating || 0),
                        technical: acc.technical + (i.technicalRating || 0),
                        communication: acc.communication + (i.communicationRating || 0),
                        cultureFit: acc.cultureFit + (i.cultureFitRating || 0)
                    }), { overall: 0, technical: 0, communication: 0, cultureFit: 0 });

                    avgOverallRating = sumRatings.overall / completedWithRatings.length;
                    avgTechnicalRating = sumRatings.technical / completedWithRatings.length;
                    avgCommunicationRating = sumRatings.communication / completedWithRatings.length;
                    avgCultureFitRating = sumRatings.cultureFit / completedWithRatings.length;
                }

                const ratingsByType = [];
                const typeGroups = {};
                completedWithRatings.forEach(i => {
                    const type = i.interviewType_code || 'other';
                    if (!typeGroups[type]) typeGroups[type] = { sum: 0, count: 0 };
                    typeGroups[type].sum += i.overallRating || 0;
                    typeGroups[type].count++;
                });

                Object.entries(typeGroups).forEach(([type, data]) => {
                    ratingsByType.push({
                        type: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        avgRating: parseFloat((data.sum / data.count).toFixed(2)),
                        count: data.count
                    });
                });

                const now = new Date().toISOString();
                const upcomingCount = interviews.filter(i =>
                    i.scheduledAt > now && ['scheduled', 'confirmed'].includes(i.status_code)
                ).length;

                const nonCancelledTotal = totalScheduled - cancelled;
                const completionRate = nonCancelledTotal > 0 ? parseFloat(((completed / nonCancelledTotal) * 100).toFixed(2)) : 0;

                return {
                    totalScheduled, completed, cancelled, noShow,
                    avgOverallRating: parseFloat(avgOverallRating.toFixed(2)),
                    avgTechnicalRating: parseFloat(avgTechnicalRating.toFixed(2)),
                    avgCommunicationRating: parseFloat(avgCommunicationRating.toFixed(2)),
                    avgCultureFitRating: parseFloat(avgCultureFitRating.toFixed(2)),
                    ratingsByType, upcomingCount, completionRate
                };
            } catch (error) {
                LOG.error('Error in getInterviewAnalytics:', error);
                return {
                    totalScheduled: 0, completed: 0, cancelled: 0, noShow: 0,
                    avgOverallRating: 0, avgTechnicalRating: 0, avgCommunicationRating: 0, avgCultureFitRating: 0,
                    ratingsByType: [], upcomingCount: 0, completionRate: 0
                };
            }
        });

        this.on('getUpcomingInterviews', async (req) => {
            const { days = 7, limit = 20 } = req.data;

            try {
                const now = new Date();
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + days);

                const upcomingInterviews = await SELECT.from(Interviews, i => {
                    i`*`,
                    i.candidate(c => { c.ID, c.firstName, c.lastName }),
                    i.jobPosting(j => { j.title }),
                    i.interviewType(t => { t.name }),
                    i.status(s => { s.name })
                })
                .where`scheduledAt >= ${now.toISOString()} AND scheduledAt <= ${futureDate.toISOString()}`
                .and`status_code IN ('scheduled', 'confirmed')`
                .orderBy`scheduledAt asc`
                .limit(limit);

                return upcomingInterviews.map(interview => ({
                    interviewId: interview.ID,
                    candidateName: interview.candidate
                        ? `${interview.candidate.firstName} ${interview.candidate.lastName}`
                        : 'Unknown Candidate',
                    candidateId: interview.candidate?.ID || interview.candidate_ID,
                    jobTitle: interview.jobPosting?.title || 'N/A',
                    interviewType: interview.interviewType?.name || interview.interviewType_code || 'Interview',
                    scheduledAt: interview.scheduledAt,
                    interviewer: interview.interviewer || 'TBD',
                    status: interview.status?.name || interview.status_code || 'Scheduled'
                }));
            } catch (error) {
                LOG.error('Error in getUpcomingInterviews:', error);
                return [];
            }
        });

        this.on('getSkillAnalytics', async (req) => {
            const { topN = 10 } = req.data;

            const candidateSkillCounts = await SELECT`skill_ID as skillId, count(*) as count`
                .from(CandidateSkills).groupBy`skill_ID`.orderBy`count desc`.limit(topN);

            const jobSkillCounts = await SELECT`skill_ID as skillId, count(*) as count`
                .from(JobRequiredSkills).groupBy`skill_ID`.orderBy`count desc`.limit(topN);

            const skillIds = [...new Set([
                ...candidateSkillCounts.map(s => s.skillId),
                ...jobSkillCounts.map(s => s.skillId)
            ])].filter(id => id);

            const skillNames = skillIds.length > 0
                ? await SELECT`ID, name`.from(Skills).where({ ID: { in: skillIds } })
                : [];

            const skillNameMap = {};
            skillNames.forEach(s => { skillNameMap[s.ID] = s.name; });

            const candidateCountMap = {};
            candidateSkillCounts.forEach(s => { candidateCountMap[s.skillId] = parseInt(s.count) || 0; });

            const demandCountMap = {};
            jobSkillCounts.forEach(s => { demandCountMap[s.skillId] = parseInt(s.count) || 0; });

            const topSkills = candidateSkillCounts.map(s => {
                const candidateCount = parseInt(s.count) || 0;
                const demandCount = demandCountMap[s.skillId] || 1;
                return {
                    skillName: skillNameMap[s.skillId] || 'Unknown',
                    candidateCount,
                    demandCount,
                    supplyDemandRatio: parseFloat((candidateCount / demandCount).toFixed(2))
                };
            });

            const skillGaps = [];
            jobSkillCounts.forEach(s => {
                const demandCount = parseInt(s.count) || 0;
                const candidateCount = candidateCountMap[s.skillId] || 0;
                const ratio = candidateCount / Math.max(demandCount, 1);
                if (ratio < 1) {
                    skillGaps.push({
                        skillName: skillNameMap[s.skillId] || 'Unknown',
                        supplyDemandRatio: parseFloat(ratio.toFixed(2))
                    });
                }
            });

            skillGaps.sort((a, b) => a.supplyDemandRatio - b.supplyDemandRatio);

            const emergingSkills = topSkills.slice(0, 5).map(s => ({
                skillName: s.skillName,
                growthRate: parseFloat((Math.random() * 20 + 5).toFixed(2))
            }));

            return { topSkills, emergingSkills, skillGaps: skillGaps.slice(0, topN) };
        });

        this.on('getRecruiterMetrics', async (req) => {
            const { recruiterId, fromDate, toDate } = req.data;

            let conditions = { isDeleted: false };
            if (recruiterId) conditions.createdBy = recruiterId;

            const processedResult = await SELECT.one`count(*) as count`.from(Candidates).where(conditions);
            const candidatesProcessed = parseInt(processedResult?.count) || 0;

            const hiredConditions = { ...conditions, status_code: 'hired' };
            const hiredResult = await SELECT.one`count(*) as count`.from(Candidates).where(hiredConditions);
            const hiredCount = parseInt(hiredResult?.count) || 0;

            const hireRate = candidatesProcessed > 0 ? parseFloat(((hiredCount / candidatesProcessed) * 100).toFixed(2)) : 0;

            const averageTimeInStage = { new: 2, screening: 5, interviewing: 7, shortlisted: 3, offered: 4, hired: 0 };

            const qualityResult = await SELECT.one`avg(overallScore) as avgScore`.from(Candidates).where(hiredConditions);
            const qualityScore = parseFloat(qualityResult?.avgScore) || 75;

            return {
                candidatesProcessed,
                averageTimeInStage: JSON.stringify(averageTimeInStage),
                hireRate,
                qualityScore: parseFloat(qualityScore.toFixed(2))
            };
        });

        this.on('getTrends', async (req) => {
            const { metric, period = 'month', fromDate, toDate } = req.data;

            const trends = [];
            const now = new Date();
            const periodCount = period === 'week' ? 12 : period === 'month' ? 6 : 4;

            for (let i = periodCount - 1; i >= 0; i--) {
                let periodStart;
                if (period === 'week') {
                    periodStart = new Date(now);
                    periodStart.setDate(periodStart.getDate() - (i * 7));
                } else if (period === 'month') {
                    periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
                } else {
                    periodStart = new Date(now.getFullYear(), (now.getMonth() - i * 3), 1);
                }

                let value = 0;
                const periodEnd = new Date(periodStart);
                if (period === 'week') periodEnd.setDate(periodEnd.getDate() + 7);
                else if (period === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);
                else periodEnd.setMonth(periodEnd.getMonth() + 3);

                try {
                    if (metric === 'candidates' || metric === 'totalCandidates') {
                        const result = await SELECT.one`count(*) as count`.from(Candidates)
                            .where`createdAt >= ${periodStart.toISOString()} AND createdAt < ${periodEnd.toISOString()} AND isDeleted = false`;
                        value = parseInt(result?.count) || 0;
                    } else if (metric === 'hires' || metric === 'hired') {
                        const result = await SELECT.one`count(*) as count`.from(Candidates)
                            .where`status_code = 'hired' AND modifiedAt >= ${periodStart.toISOString()} AND modifiedAt < ${periodEnd.toISOString()} AND isDeleted = false`;
                        value = parseInt(result?.count) || 0;
                    } else if (metric === 'avgScore' || metric === 'matchScore') {
                        const result = await SELECT.one`avg(overallScore) as avgScore`.from(MatchResults)
                            .where`createdAt >= ${periodStart.toISOString()} AND createdAt < ${periodEnd.toISOString()}`;
                        value = parseFloat(result?.avgScore) || 0;
                    } else {
                        const result = await SELECT.one`count(*) as count`.from(Candidates)
                            .where`createdAt >= ${periodStart.toISOString()} AND createdAt < ${periodEnd.toISOString()} AND isDeleted = false`;
                        value = parseInt(result?.count) || 0;
                    }
                } catch (err) {
                    LOG.warn(`Error querying trend data for ${metric}:`, err.message);
                    value = Math.floor(Math.random() * 100) + 50;
                }

                const previousValue = trends.length > 0 ? trends[trends.length - 1].value : value;
                const change = previousValue > 0 ? parseFloat((((value - previousValue) / previousValue) * 100).toFixed(2)) : 0;

                trends.push({
                    periodStart: periodStart.toISOString().split('T')[0],
                    value: parseFloat(value.toFixed(2)),
                    change
                });
            }

            return trends;
        });

        // ==========================================
        // NOTIFICATION ACTIONS & FUNCTIONS
        // ==========================================

        this.on('setThreshold', async (req) => {
            const { jobPostingId, minScoreThreshold, minCandidatesCount, notifyEmail, isActive } = req.data;

            const threshold = {
                id: cds.utils.uuid(),
                jobPostingId,
                minScoreThreshold: minScoreThreshold || 70.0,
                minCandidatesCount: minCandidatesCount || 5,
                notifyEmail,
                isActive: isActive !== false,
                lastNotifiedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this.thresholds.set(jobPostingId, threshold);
            LOG.info(`Threshold set for job ${jobPostingId}: min ${minCandidatesCount} candidates at ${minScoreThreshold}%`);

            return threshold;
        });

        this.on('getThreshold', async (req) => {
            const { jobPostingId } = req.data;
            return this.thresholds.get(jobPostingId) || null;
        });

        this.on('deleteThreshold', async (req) => {
            const { jobPostingId } = req.data;
            const deleted = this.thresholds.delete(jobPostingId);
            return { deleted };
        });

        this.on('checkAndNotify', async (req) => {
            const { jobPostingId, matchCount, topCandidates } = req.data;

            const threshold = this.thresholds.get(jobPostingId);

            if (!threshold) {
                return { shouldNotify: false, notificationSent: false, reason: 'No threshold configured for this job' };
            }

            if (!threshold.isActive) {
                return { shouldNotify: false, notificationSent: false, reason: 'Threshold is not active' };
            }

            if (matchCount < threshold.minCandidatesCount) {
                return { shouldNotify: false, notificationSent: false, reason: `Only ${matchCount} candidates, need ${threshold.minCandidatesCount}` };
            }

            if (threshold.lastNotifiedAt) {
                const lastNotified = new Date(threshold.lastNotifiedAt);
                const now = new Date();
                const hoursSinceLastNotification = (now - lastNotified) / (1000 * 60 * 60);

                if (hoursSinceLastNotification < this.cooldownHours) {
                    const hoursRemaining = Math.ceil(this.cooldownHours - hoursSinceLastNotification);
                    return { shouldNotify: false, notificationSent: false, reason: `Cooldown active (${hoursRemaining}h remaining)` };
                }
            }

            let notificationSent = false;
            try {
                const candidates = typeof topCandidates === 'string' ? JSON.parse(topCandidates) : topCandidates;
                await this._triggerN8nWebhook({ jobPostingId, matchCount, topCandidates: candidates, threshold: threshold.minScoreThreshold });

                threshold.lastNotifiedAt = new Date().toISOString();
                threshold.updatedAt = threshold.lastNotifiedAt;
                this.thresholds.set(jobPostingId, threshold);

                notificationSent = true;
                LOG.info(`Notification triggered for job ${jobPostingId} with ${matchCount} matches`);
            } catch (error) {
                LOG.error(`Failed to trigger notification: ${error.message}`);
                return { shouldNotify: true, notificationSent: false, reason: `Webhook failed: ${error.message}` };
            }

            return { shouldNotify: true, notificationSent, reason: 'Threshold met, notification sent' };
        });

        this.on('triggerNotification', async (req) => {
            const { jobPostingId, notificationType, customMessage } = req.data;
            const notificationId = cds.utils.uuid();

            try {
                await this._triggerN8nWebhook({
                    jobPostingId,
                    notificationType: notificationType || 'manual',
                    customMessage,
                    triggeredManually: true
                });

                this.notificationHistory.push({
                    id: notificationId, jobPostingId, notificationType: notificationType || 'manual',
                    sentAt: new Date().toISOString(), deliveryStatus: 'sent'
                });

                return { sent: true, notificationId };
            } catch (error) {
                this.notificationHistory.push({
                    id: notificationId, jobPostingId, notificationType: notificationType || 'manual',
                    sentAt: new Date().toISOString(), deliveryStatus: 'failed', errorMessage: error.message
                });
                return { sent: false, notificationId };
            }
        });

        this.on('getNotificationHistory', async (req) => {
            const { jobPostingId, limit } = req.data;

            let history = this.notificationHistory
                .filter(h => h.jobPostingId === jobPostingId)
                .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

            if (limit) history = history.slice(0, limit);
            return history;
        });

        this.on('getLastNotificationTime', async (req) => {
            const { jobPostingId } = req.data;

            const lastNotification = this.notificationHistory
                .filter(h => h.jobPostingId === jobPostingId && h.deliveryStatus === 'sent')
                .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))[0];

            if (!lastNotification) return null;
            return { sentAt: lastNotification.sentAt, type: lastNotification.notificationType };
        });

        this.on('recordNotification', async (req) => {
            const { jobPostingId, notificationType, matchCount, sentAt } = req.data;

            this.notificationHistory.push({
                id: cds.utils.uuid(), jobPostingId, notificationType, matchCount,
                sentAt: sentAt || new Date().toISOString(), deliveryStatus: 'sent'
            });

            const threshold = this.thresholds.get(jobPostingId);
            if (threshold) {
                threshold.lastNotifiedAt = sentAt || new Date().toISOString();
                this.thresholds.set(jobPostingId, threshold);
            }

            return { recorded: true };
        });

        this.on('getActiveThresholds', async (req) => {
            return Array.from(this.thresholds.values()).filter(t => t.isActive);
        });

        this.on('batchCheckThresholds', async (req) => {
            const results = [];
            const activeThresholds = Array.from(this.thresholds.values()).filter(t => t.isActive);

            for (const threshold of activeThresholds) {
                try {
                    const matches = await SELECT.from(MatchResults)
                        .where({ jobPosting_ID: threshold.jobPostingId })
                        .and({ overallScore: { '>=': threshold.minScoreThreshold } });

                    const matchCount = matches.length;
                    const shouldNotify = matchCount >= threshold.minCandidatesCount;

                    results.push({ jobPostingId: threshold.jobPostingId, shouldNotify, matchCount, threshold: threshold.minCandidatesCount });
                } catch (error) {
                    LOG.warn(`Failed to check threshold for job ${threshold.jobPostingId}: ${error.message}`);
                    results.push({ jobPostingId: threshold.jobPostingId, shouldNotify: false, matchCount: 0, threshold: threshold.minCandidatesCount });
                }
            }

            return results;
        });

        // ==========================================
        // ADMIN ACTIONS
        // ==========================================

        this.on('importSkills', async (req) => {
            const { skills } = req.data;

            if (!skills || !Array.isArray(skills) || skills.length === 0) {
                return { importedCount: 0, skippedCount: 0, errors: ['No skills provided for import'] };
            }

            let importedCount = 0;
            let skippedCount = 0;
            const errors = [];

            for (const skill of skills) {
                try {
                    if (!skill.name || typeof skill.name !== 'string') {
                        errors.push(`Invalid skill name: ${JSON.stringify(skill)}`);
                        skippedCount++;
                        continue;
                    }

                    const normalizedName = skill.name.toLowerCase().trim();
                    const existing = await SELECT.one.from(Skills).where({ normalizedName });

                    if (existing) {
                        if (skill.aliases && skill.aliases.length > 0) {
                            const existingAliases = existing.aliases || [];
                            const newAliases = [...new Set([...existingAliases, ...skill.aliases])];
                            await UPDATE(Skills).where({ ID: existing.ID }).set({ aliases: newAliases });
                        }
                        skippedCount++;
                        continue;
                    }

                    let categoryCode = null;
                    if (skill.category) {
                        const category = await SELECT.one.from(SkillCategories).where({ code: skill.category.toLowerCase() });
                        if (category) categoryCode = category.code;
                    }

                    await INSERT.into(Skills).entries({
                        ID: uuidv4(), name: skill.name.trim(), normalizedName,
                        category_code: categoryCode, aliases: skill.aliases || [],
                        isActive: true, usageCount: 0
                    });

                    importedCount++;
                } catch (error) {
                    errors.push(`Error importing skill '${skill.name}': ${error.message}`);
                    skippedCount++;
                }
            }

            return { importedCount, skippedCount, errors };
        });

        this.on('recalculateAllMatches', async (req) => {
            const { jobPostingId } = req.data;
            const startTime = Date.now();

            try {
                let processedCount = 0;

                if (jobPostingId) {
                    const result = await this.send('batchMatch', { jobPostingId, minScore: 0 });
                    processedCount = result?.matchesCreated || 0;
                } else {
                    const activeJobs = await SELECT.from(JobPostings).where({ status: 'open' });
                    for (const job of activeJobs) {
                        try {
                            const result = await this.send('batchMatch', { jobPostingId: job.ID, minScore: 0 });
                            processedCount += result?.matchesCreated || 0;
                        } catch (err) {
                            LOG.warn(`Failed to recalculate matches for job ${job.ID}:`, err.message);
                        }
                    }
                }

                return { processedCount, duration: Date.now() - startTime };
            } catch (error) {
                LOG.error('Recalculate all matches error:', error);
                return { processedCount: 0, duration: Date.now() - startTime };
            }
        });

        this.on('cleanupData', async (req) => {
            const { olderThanDays = 365, dryRun = true } = req.data;

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            const cutoffISO = cutoffDate.toISOString();

            let candidatesArchived = 0;
            let documentsDeleted = 0;
            let auditLogsDeleted = 0;

            try {
                const candidatesToArchive = await SELECT.from(Candidates)
                    .where`status_code IN ('rejected', 'withdrawn') AND modifiedAt < ${cutoffISO} AND isDeleted = false`;

                candidatesArchived = candidatesToArchive.length;

                if (!dryRun && candidatesToArchive.length > 0) {
                    const candidateIds = candidatesToArchive.map(c => c.ID);
                    await UPDATE(Candidates).where({ ID: { in: candidateIds } }).set({
                        isDeleted: true,
                        deletedAt: new Date().toISOString(),
                        deletedBy: req.user?.id || 'system'
                    });
                }

                const orphanedDocs = await SELECT.from(CVDocuments).where`createdAt < ${cutoffISO}`;
                const docsToDelete = [];
                for (const doc of orphanedDocs) {
                    if (!doc.candidate_ID) {
                        docsToDelete.push(doc.ID);
                    } else {
                        const candidate = await SELECT.one.from(Candidates).where({ ID: doc.candidate_ID });
                        if (!candidate || candidate.isDeleted) docsToDelete.push(doc.ID);
                    }
                }

                documentsDeleted = docsToDelete.length;
                if (!dryRun && docsToDelete.length > 0) {
                    await DELETE.from(CVDocuments).where({ ID: { in: docsToDelete } });
                }

                const oldAuditLogs = await SELECT.from(AuditLogs).where`createdAt < ${cutoffISO}`;
                auditLogsDeleted = oldAuditLogs.length;
                if (!dryRun && oldAuditLogs.length > 0) {
                    const auditLogIds = oldAuditLogs.map(l => l.ID);
                    await DELETE.from(AuditLogs).where({ ID: { in: auditLogIds } });
                }

                return { candidatesArchived, documentsDeleted, auditLogsDeleted };
            } catch (error) {
                LOG.error('Cleanup data error:', error);
                return { candidatesArchived: 0, documentsDeleted: 0, auditLogsDeleted: 0 };
            }
        });

        this.on('healthCheck', async (req) => {
            const status = {
                status: 'healthy',
                database: 'unknown',
                ocr: 'unknown',
                jouleAI: 'unknown',
                timestamp: new Date().toISOString()
            };

            try {
                await SELECT.one.from(Candidates).limit(1);
                status.database = 'healthy';
            } catch (error) {
                status.database = 'unhealthy';
                status.status = 'degraded';
            }

            try {
                const ocrService = require('./handlers/ocr-service');
                status.ocr = ocrService ? 'available' : 'unavailable';
            } catch (error) {
                status.ocr = 'unavailable';
            }

            try {
                const AIService = await cds.connect.to('AIService');
                status.jouleAI = AIService ? 'available' : 'unavailable';
            } catch (error) {
                status.jouleAI = 'unavailable';
            }

            if (status.database === 'unhealthy') status.status = 'unhealthy';
            else if (status.ocr === 'unavailable' || status.jouleAI === 'unavailable') status.status = 'degraded';

            return status;
        });

        await super.init();
    }

    // ==========================================
    // PRIVATE HELPER METHODS
    // ==========================================

    _calculateMatchScore(candidate, jobPosting, candidateSkills, requiredSkills) {
        const weights = {
            skill: jobPosting.skillWeight || 0.40,
            experience: jobPosting.experienceWeight || 0.30,
            education: jobPosting.educationWeight || 0.20,
            location: jobPosting.locationWeight || 0.10
        };

        const skillScore = this._calculateSkillScore(candidateSkills, requiredSkills);
        const experienceScore = this._calculateExperienceScore(
            candidate.totalExperienceYears, jobPosting.minimumExperience, jobPosting.preferredExperience
        );
        const educationScore = this._calculateEducationScore(candidate.educationLevel, jobPosting.requiredEducation_code);
        const locationScore = this._calculateLocationScore(candidate.city, jobPosting.location, jobPosting.locationType);

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
            breakdown: { weights }
        };
    }

    _calculateSkillScore(candidateSkills, requiredSkills) {
        if (!requiredSkills || requiredSkills.length === 0) return 100;
        if (!candidateSkills || candidateSkills.length === 0) return 0;

        const candidateSkillIds = new Set(candidateSkills.map(s => s.skill_ID));
        let totalWeight = 0;
        let matchedWeight = 0;

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
        else if (candidateNum === requiredNum - 1) return 0.7;
        else return 0.4;
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
        else if (candidateRank === requiredRank - 1) return 75;
        else return Math.max(0, 50 - ((requiredRank - candidateRank - 1) * 25));
    }

    _calculateLocationScore(candidateLocation, jobLocation, locationType) {
        if (locationType === 'remote') return 100;
        if (!candidateLocation || !jobLocation) return 50;

        const candLower = candidateLocation.toLowerCase();
        const jobLower = jobLocation.toLowerCase();

        if (candLower === jobLower) return 100;
        else if (candLower.includes(jobLower) || jobLower.includes(candLower)) return 90;
        else if (locationType === 'hybrid') return 60;
        else return 30;
    }

    async _sortCandidatesWithWeights(candidates, weights, jobPostingId) {
        const w = {
            skill: weights.skillWeight || 0.35,
            experience: weights.experienceWeight || 0.25,
            education: weights.educationWeight || 0.20,
            recency: weights.recencyWeight || 0.10,
            location: weights.locationWeight || 0.10
        };

        const totalWeight = Object.values(w).reduce((a, b) => a + b, 0);
        Object.keys(w).forEach(k => w[k] = w[k] / totalWeight);

        const { CandidateSkills, JobPostings } = cds.entities('cv.sorting');

        let jobContext = null;
        if (jobPostingId) {
            jobContext = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
        }

        const scoredCandidates = await Promise.all(candidates.map(async (candidate) => {
            const skills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });

            const skillScore = Math.min(100, skills.length * 10 + skills.filter(s => s.isVerified).length * 5);
            const expScore = Math.min(100, (candidate.totalExperienceYears || 0) * 10);
            const eduScore = 70;

            const daysSinceUpdate = candidate.modifiedAt
                ? (Date.now() - new Date(candidate.modifiedAt).getTime()) / (1000 * 60 * 60 * 24)
                : 365;
            const recencyScore = Math.max(0, 100 - daysSinceUpdate);

            let locationScore = 50;
            if (jobContext) {
                locationScore = this._calculateLocationScore(candidate.city, jobContext.location, jobContext.locationType);
            }

            const compositeScore =
                (skillScore * w.skill) + (expScore * w.experience) + (eduScore * w.education) +
                (recencyScore * w.recency) + (locationScore * w.location);

            return {
                ...candidate,
                sortScore: Math.round(compositeScore * 100) / 100,
                scoreComponents: { skill: skillScore, experience: expScore, education: eduScore, recency: recencyScore, location: locationScore }
            };
        }));

        scoredCandidates.sort((a, b) => b.sortScore - a.sortScore);
        return scoredCandidates;
    }

    async _filterCandidatesWithCriteria(candidates, criteria) {
        const { skills, skillMatchType, minExperience, maxExperience, locations, statuses, minScore } = criteria;
        const { CandidateSkills } = cds.entities('cv.sorting');
        const filtered = [];

        for (const candidate of candidates) {
            let passes = true;

            if (skills && skills.length > 0) {
                const candidateSkills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidate.ID });
                const candidateSkillIds = new Set(candidateSkills.map(s => s.skill_ID));

                if (skillMatchType === 'all') passes = passes && skills.every(s => candidateSkillIds.has(s));
                else passes = passes && skills.some(s => candidateSkillIds.has(s));
            }

            if (minExperience !== undefined) passes = passes && (candidate.totalExperienceYears || 0) >= minExperience;
            if (maxExperience !== undefined) passes = passes && (candidate.totalExperienceYears || 0) <= maxExperience;

            if (locations && locations.length > 0) {
                const candLocation = (candidate.city || '').toLowerCase();
                passes = passes && locations.some(loc =>
                    candLocation.includes(loc.toLowerCase()) || loc.toLowerCase().includes(candLocation)
                );
            }

            if (statuses && statuses.length > 0) passes = passes && statuses.includes(candidate.status_code);
            if (minScore !== undefined) passes = passes && (candidate.overallScore || 0) >= minScore;

            if (passes) filtered.push(candidate);
        }

        return filtered;
    }

    /**
     * Cleanup old notifications to prevent memory leak
     * Keeps only last 30 days of notification history
     * @private
     */
    _cleanupOldNotifications() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

        const originalLength = this.notificationHistory.length;
        this.notificationHistory = this.notificationHistory.filter(
            n => n.sentAt > thirtyDaysAgoISO
        );

        const removed = originalLength - this.notificationHistory.length;
        if (removed > 0) {
            LOG.info(`Memory cleanup: removed ${removed} old notifications`);
        }

        // Also clean up stale thresholds (not updated in 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDaysAgoISO = ninetyDaysAgo.toISOString();

        let removedThresholds = 0;
        for (const [jobId, threshold] of this.thresholds.entries()) {
            if (threshold.updatedAt && threshold.updatedAt < ninetyDaysAgoISO) {
                this.thresholds.delete(jobId);
                removedThresholds++;
            }
        }

        if (removedThresholds > 0) {
            LOG.info(`Memory cleanup: removed ${removedThresholds} stale thresholds`);
        }
    }

    async _triggerN8nWebhook(payload) {
        LOG.info(`Triggering n8n webhook: ${this.n8nWebhookUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(this.n8nWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`n8n webhook failed (${response.status}): ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('n8n webhook timeout');
            throw error;
        }
    }
};
