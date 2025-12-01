const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

/**
 * Joule AI Copilot Service Implementation
 * Provides natural language interface for candidate search, analysis, and insights
 */
module.exports = class JouleService extends cds.ApplicationService {

    async init() {
        // Connect to Joule AI service (SAP AI Core)
        try {
            this.jouleAI = await cds.connect.to('joule-ai');
        } catch (e) {
            console.warn('Joule AI service not connected, using mock responses');
            this.jouleAI = null;
        }

        // Get reference to other services
        this.candidateService = await cds.connect.to('CandidateService');
        this.matchingService = await cds.connect.to('MatchingService');

        // Register action handlers
        this.on('chat', this.handleChat);
        this.on('searchWithNaturalLanguage', this.handleNLSearch);
        this.on('applyNaturalLanguageFilter', this.handleNLFilter);
        this.on('applyNaturalLanguageSort', this.handleNLSort);
        this.on('generateCandidateSummary', this.handleGenerateSummary);
        this.on('analyzeJobFit', this.handleAnalyzeJobFit);
        this.on('generateInterviewQuestions', this.handleGenerateQuestions);
        this.on('analyzePool', this.handleAnalyzePool);
        this.on('compareWithInsights', this.handleCompareWithInsights);
        this.on('getProactiveInsights', this.handleProactiveInsights);
        this.on('getJobInsights', this.handleJobInsights);
        this.on('detectIssues', this.handleDetectIssues);
        this.on('provideFeedback', this.handleFeedback);
        this.on('learnFromDecision', this.handleLearnFromDecision);

        // Register function handlers
        this.on('quickStat', this.handleQuickStat);
        this.on('getConversationHistory', this.handleGetHistory);
        this.on('getSuggestedQueries', this.handleGetSuggestions);

        await super.init();
    }

    // ==========================================
    // NATURAL LANGUAGE PROCESSING
    // ==========================================

    /**
     * Parse natural language query to structured search criteria
     */
    parseNaturalLanguageQuery(query) {
        const lowerQuery = query.toLowerCase();
        const criteria = {
            skills: [],
            minExperience: null,
            maxExperience: null,
            locations: [],
            statuses: [],
            sortBy: null,
            limit: 20
        };

        // Extract experience requirements
        const expPatterns = [
            /(\d+)\+?\s*years?\s*(?:of\s*)?experience/i,
            /at\s*least\s*(\d+)\s*years?/i,
            /minimum\s*(\d+)\s*years?/i,
            /(\d+)\s*to\s*(\d+)\s*years?/i
        ];

        for (const pattern of expPatterns) {
            const match = query.match(pattern);
            if (match) {
                if (match[2]) {
                    criteria.minExperience = parseInt(match[1]);
                    criteria.maxExperience = parseInt(match[2]);
                } else {
                    criteria.minExperience = parseInt(match[1]);
                }
                break;
            }
        }

        // Extract common skills
        const skillKeywords = {
            'java': 'Java',
            'javascript': 'JavaScript',
            'python': 'Python',
            'typescript': 'TypeScript',
            'react': 'React',
            'angular': 'Angular',
            'vue': 'Vue.js',
            'node': 'Node.js',
            'nodejs': 'Node.js',
            'aws': 'AWS',
            'azure': 'Azure',
            'gcp': 'Google Cloud',
            'docker': 'Docker',
            'kubernetes': 'Kubernetes',
            'k8s': 'Kubernetes',
            'sql': 'SQL',
            'nosql': 'NoSQL',
            'mongodb': 'MongoDB',
            'postgresql': 'PostgreSQL',
            'sap': 'SAP',
            'abap': 'ABAP',
            'fiori': 'SAP Fiori',
            'hana': 'SAP HANA',
            'cap': 'SAP CAP',
            'machine learning': 'Machine Learning',
            'ml': 'Machine Learning',
            'ai': 'Artificial Intelligence',
            'data science': 'Data Science'
        };

        for (const [keyword, skill] of Object.entries(skillKeywords)) {
            if (lowerQuery.includes(keyword)) {
                criteria.skills.push(skill);
            }
        }

        // Extract locations
        const locationPatterns = [
            /(?:in|from|based\s*in|located\s*in)\s+([A-Za-z\s,]+?)(?:\s+with|\s+who|\s+and|$)/i,
            /([A-Za-z]+)\s*(?:based|location)/i
        ];

        for (const pattern of locationPatterns) {
            const match = query.match(pattern);
            if (match && match[1]) {
                const location = match[1].trim();
                if (location.length > 2 && location.length < 50) {
                    criteria.locations.push(location);
                }
            }
        }

        // Extract status
        if (lowerQuery.includes('new candidate') || lowerQuery.includes('recently added')) {
            criteria.statuses.push('new');
        }
        if (lowerQuery.includes('shortlisted')) {
            criteria.statuses.push('shortlisted');
        }
        if (lowerQuery.includes('interviewing') || lowerQuery.includes('in interview')) {
            criteria.statuses.push('interviewing');
        }

        // Determine sorting
        if (lowerQuery.includes('most experienced') || lowerQuery.includes('highest experience')) {
            criteria.sortBy = 'experience_desc';
        } else if (lowerQuery.includes('recent') || lowerQuery.includes('newest')) {
            criteria.sortBy = 'date_desc';
        } else if (lowerQuery.includes('best match') || lowerQuery.includes('top match')) {
            criteria.sortBy = 'score_desc';
        }

        // Extract limit
        const limitMatch = query.match(/(?:top|first|show)\s*(\d+)/i);
        if (limitMatch) {
            criteria.limit = parseInt(limitMatch[1]);
        }

        return criteria;
    }

    /**
     * Generate human-readable interpretation of parsed query
     */
    generateInterpretation(criteria) {
        const parts = [];

        if (criteria.skills.length > 0) {
            parts.push(`skills: ${criteria.skills.join(', ')}`);
        }
        if (criteria.minExperience !== null) {
            if (criteria.maxExperience !== null) {
                parts.push(`${criteria.minExperience}-${criteria.maxExperience} years experience`);
            } else {
                parts.push(`${criteria.minExperience}+ years experience`);
            }
        }
        if (criteria.locations.length > 0) {
            parts.push(`location: ${criteria.locations.join(' or ')}`);
        }
        if (criteria.statuses.length > 0) {
            parts.push(`status: ${criteria.statuses.join(', ')}`);
        }

        return parts.length > 0
            ? `Searching for candidates with ${parts.join(', ')}`
            : 'Searching all candidates';
    }

    // ==========================================
    // CHAT HANDLERS
    // ==========================================

    /**
     * Main chat handler
     */
    async handleChat(req) {
        const { sessionId, message, context } = req.data;
        const { JouleConversations, JouleMessages } = this.entities;

        try {
            // Get or create conversation
            let conversation = await SELECT.one.from(JouleConversations)
                .where({ sessionId });

            if (!conversation) {
                const convId = uuidv4();
                await INSERT.into(JouleConversations).entries({
                    ID: convId,
                    sessionId,
                    userId: req.user?.id,
                    context: context || 'general'
                });
                conversation = { ID: convId };
            }

            // Save user message
            await INSERT.into(JouleMessages).entries({
                ID: uuidv4(),
                conversation_ID: conversation.ID,
                role: 'user',
                content: message
            });

            // Process the message
            const { response, actions, results } = await this._processMessage(message, context, req);

            // Save assistant response
            await INSERT.into(JouleMessages).entries({
                ID: uuidv4(),
                conversation_ID: conversation.ID,
                role: 'assistant',
                content: response,
                actionType: actions?.[0]?.type,
                actionPayload: actions ? JSON.stringify(actions) : null,
                actionResult: results ? JSON.stringify(results) : null
            });

            // Generate follow-up questions
            const followUps = this._generateFollowUpQuestions(message, context, results);

            return {
                response,
                actions: JSON.stringify(actions || []),
                results: results ? JSON.stringify(results) : null,
                followUpQuestions: followUps
            };

        } catch (error) {
            console.error('Chat error:', error);
            return {
                response: `I encountered an error: ${error.message}. Please try rephrasing your question.`,
                actions: '[]',
                results: null,
                followUpQuestions: ['Can you help me search for candidates?', 'What can you help me with?']
            };
        }
    }

    /**
     * Process chat message and determine action
     */
    async _processMessage(message, context, req) {
        const lowerMessage = message.toLowerCase();

        // Determine intent
        if (this._isSearchIntent(lowerMessage)) {
            return this._handleSearchIntent(message, req);
        } else if (this._isAnalysisIntent(lowerMessage)) {
            return this._handleAnalysisIntent(message, req);
        } else if (this._isStatIntent(lowerMessage)) {
            return this._handleStatIntent(message, req);
        } else if (this._isHelpIntent(lowerMessage)) {
            return this._handleHelpIntent();
        } else {
            return this._handleGeneralIntent(message);
        }
    }

    _isSearchIntent(msg) {
        const searchKeywords = ['find', 'search', 'look for', 'show me', 'get', 'list', 'who has', 'candidates with'];
        return searchKeywords.some(kw => msg.includes(kw));
    }

    _isAnalysisIntent(msg) {
        const analysisKeywords = ['analyze', 'compare', 'summarize', 'evaluate', 'assess', 'review'];
        return analysisKeywords.some(kw => msg.includes(kw));
    }

    _isStatIntent(msg) {
        const statKeywords = ['how many', 'count', 'total', 'statistics', 'stats', 'average', 'number of'];
        return statKeywords.some(kw => msg.includes(kw));
    }

    _isHelpIntent(msg) {
        const helpKeywords = ['help', 'what can you', 'how do i', 'guide', 'tutorial'];
        return helpKeywords.some(kw => msg.includes(kw));
    }

    async _handleSearchIntent(message, req) {
        const criteria = this.parseNaturalLanguageQuery(message);
        const interpretation = this.generateInterpretation(criteria);

        // Execute search
        const searchResult = await this.candidateService.searchCandidates({
            query: '',
            skills: [], // Would need to map skill names to IDs
            minExperience: criteria.minExperience,
            maxExperience: criteria.maxExperience,
            locations: criteria.locations,
            statuses: criteria.statuses,
            limit: criteria.limit,
            offset: 0
        });

        const candidates = JSON.parse(searchResult.candidates || '[]');
        const count = searchResult.totalCount;

        let response = `${interpretation}.\n\n`;
        response += `Found ${count} candidate${count !== 1 ? 's' : ''}.`;

        if (candidates.length > 0) {
            response += `\n\nTop results:\n`;
            candidates.slice(0, 5).forEach((c, i) => {
                response += `${i + 1}. ${c.firstName} ${c.lastName}`;
                if (c.headline) response += ` - ${c.headline}`;
                if (c.totalExperienceYears) response += ` (${c.totalExperienceYears} years)`;
                response += '\n';
            });
        }

        return {
            response,
            actions: [{ type: 'search', criteria }],
            results: { candidates: candidates.slice(0, 10), totalCount: count }
        };
    }

    async _handleAnalysisIntent(message, req) {
        return {
            response: 'I can help you analyze candidates. Please specify:\n' +
                '- "Compare [candidate names]" to compare candidates\n' +
                '- "Summarize [candidate name]" for a candidate summary\n' +
                '- "Analyze pool for [job title]" for pool analysis',
            actions: [],
            results: null
        };
    }

    async _handleStatIntent(message, req) {
        const { Candidates, JobPostings, MatchResults } = this.entities;

        const totalCandidates = await SELECT.from(Candidates).columns('count(*) as count');
        const totalJobs = await SELECT.from(JobPostings).columns('count(*) as count');
        const totalMatches = await SELECT.from(MatchResults).columns('count(*) as count');

        const response = `Here are the current statistics:\n\n` +
            `- Total Candidates: ${totalCandidates[0]?.count || 0}\n` +
            `- Active Job Postings: ${totalJobs[0]?.count || 0}\n` +
            `- Match Results: ${totalMatches[0]?.count || 0}`;

        return {
            response,
            actions: [{ type: 'stat' }],
            results: {
                candidates: totalCandidates[0]?.count,
                jobs: totalJobs[0]?.count,
                matches: totalMatches[0]?.count
            }
        };
    }

    _handleHelpIntent() {
        const response = `I'm Joule, your AI assistant for candidate management. I can help you with:\n\n` +
            `**Search & Filter**\n` +
            `- "Find candidates with Java and 5+ years experience"\n` +
            `- "Show me Python developers in Berlin"\n` +
            `- "List shortlisted candidates"\n\n` +
            `**Analysis**\n` +
            `- "Summarize candidate [name]"\n` +
            `- "Compare top 3 candidates for [job]"\n` +
            `- "Analyze candidate pool for Senior Developer"\n\n` +
            `**Insights**\n` +
            `- "What skills are we missing?"\n` +
            `- "Generate interview questions for [candidate]"\n` +
            `- "How many candidates do we have?"\n\n` +
            `Just ask naturally and I'll help!`;

        return { response, actions: [], results: null };
    }

    _handleGeneralIntent(message) {
        return {
            response: `I understand you're asking about "${message}". ` +
                `I'm specialized in helping with candidate search and analysis. ` +
                `Try asking me to find candidates, analyze matches, or get statistics.`,
            actions: [],
            results: null
        };
    }

    _generateFollowUpQuestions(message, context, results) {
        const suggestions = [];

        if (results?.candidates?.length > 0) {
            suggestions.push('Would you like me to summarize the top candidate?');
            suggestions.push('Should I compare these candidates?');
            suggestions.push('Want to filter these results further?');
        } else if (results?.totalCount === 0) {
            suggestions.push('Would you like to broaden the search criteria?');
            suggestions.push('Should I search with fewer requirements?');
        } else {
            suggestions.push('Would you like to search for candidates?');
            suggestions.push('Can I help you analyze a candidate?');
            suggestions.push('Would you like to see statistics?');
        }

        return suggestions.slice(0, 3);
    }

    // ==========================================
    // NATURAL LANGUAGE SEARCH/FILTER/SORT
    // ==========================================

    /**
     * Natural language search
     */
    async handleNLSearch(req) {
        const { query, sessionId } = req.data;

        const criteria = this.parseNaturalLanguageQuery(query);
        const interpretation = this.generateInterpretation(criteria);

        const searchResult = await this.candidateService.searchCandidates({
            query: '',
            minExperience: criteria.minExperience,
            maxExperience: criteria.maxExperience,
            locations: criteria.locations,
            statuses: criteria.statuses,
            limit: criteria.limit,
            offset: 0
        });

        const refinementSuggestions = [
            criteria.skills.length === 0 ? 'Add specific skills to narrow results' : null,
            criteria.locations.length === 0 ? 'Specify a location' : null,
            criteria.minExperience === null ? 'Add experience requirements' : null
        ].filter(Boolean);

        return {
            candidates: searchResult.candidates,
            totalCount: searchResult.totalCount,
            interpretation,
            refinementSuggestions
        };
    }

    /**
     * Natural language filter
     */
    async handleNLFilter(req) {
        const { query, currentResultIds, sessionId } = req.data;
        const { Candidates } = this.entities;

        const filterCriteria = this.parseNaturalLanguageQuery(query);

        // Get current candidates
        const candidates = currentResultIds?.length > 0
            ? await SELECT.from(Candidates).where({ ID: { in: currentResultIds } })
            : await SELECT.from(Candidates);

        // Apply filter
        const filtered = await this.matchingService.filterCandidatesWithCriteria(candidates, filterCriteria);

        return {
            filteredCandidates: JSON.stringify(filtered),
            appliedFilter: this.generateInterpretation(filterCriteria),
            removedCount: candidates.length - filtered.length
        };
    }

    /**
     * Natural language sort
     */
    async handleNLSort(req) {
        const { query, candidateIds, jobPostingId, sessionId } = req.data;

        const lowerQuery = query.toLowerCase();
        let sortingLogic = 'relevance';

        // Determine sorting intent
        const weights = {
            skillWeight: 0.35,
            experienceWeight: 0.25,
            educationWeight: 0.20,
            recencyWeight: 0.10,
            locationWeight: 0.10
        };

        if (lowerQuery.includes('experience') || lowerQuery.includes('senior')) {
            weights.experienceWeight = 0.50;
            weights.skillWeight = 0.25;
            sortingLogic = 'prioritizing experience';
        } else if (lowerQuery.includes('skill') || lowerQuery.includes('technical')) {
            weights.skillWeight = 0.50;
            weights.experienceWeight = 0.25;
            sortingLogic = 'prioritizing skills';
        } else if (lowerQuery.includes('recent') || lowerQuery.includes('new')) {
            weights.recencyWeight = 0.50;
            sortingLogic = 'most recently updated';
        } else if (lowerQuery.includes('education') || lowerQuery.includes('degree')) {
            weights.educationWeight = 0.50;
            sortingLogic = 'prioritizing education';
        }

        const result = await this.matchingService.sortCandidates({
            candidateIds,
            customWeights: JSON.stringify(weights)
        });

        return {
            sortedCandidates: result.sortedCandidates,
            sortingLogic: `Sorted by ${sortingLogic}`
        };
    }

    // ==========================================
    // ANALYSIS HANDLERS
    // ==========================================

    /**
     * Generate candidate summary
     */
    async handleGenerateSummary(req) {
        const { candidateId, style, forJobId } = req.data;
        const { Candidates, WorkExperiences, Educations, CandidateSkills, Skills, MatchResults } = this.entities;

        try {
            const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            if (!candidate) {
                return { summary: 'Candidate not found', keyStrengths: [], potentialConcerns: [], fitAssessment: null };
            }

            const experiences = await SELECT.from(WorkExperiences)
                .where({ candidate_ID: candidateId })
                .orderBy('startDate desc');

            const educations = await SELECT.from(Educations)
                .where({ candidate_ID: candidateId });

            const skills = await SELECT.from(CandidateSkills)
                .where({ candidate_ID: candidateId });

            // Build summary
            let summary = '';

            if (style === 'brief') {
                summary = `${candidate.firstName} ${candidate.lastName} is a professional with ` +
                    `${candidate.totalExperienceYears || 0} years of experience. ` +
                    `${skills.length} skills on profile.`;
            } else if (style === 'executive') {
                summary = `**Executive Summary: ${candidate.firstName} ${candidate.lastName}**\n\n` +
                    `${candidate.headline || 'Professional'}\n\n` +
                    `**Experience:** ${candidate.totalExperienceYears || 0} years\n` +
                    `**Location:** ${candidate.location || 'Not specified'}\n` +
                    `**Skills:** ${skills.length} documented\n` +
                    `**Status:** ${candidate.status_code}`;
            } else {
                // Detailed
                summary = `**${candidate.firstName} ${candidate.lastName}**\n` +
                    `${candidate.headline || ''}\n\n` +
                    `**Contact:** ${candidate.email}\n` +
                    `**Location:** ${candidate.location || 'Not specified'}\n` +
                    `**Experience:** ${candidate.totalExperienceYears || 0} years\n\n`;

                if (experiences.length > 0) {
                    summary += `**Work History:**\n`;
                    experiences.slice(0, 3).forEach(exp => {
                        summary += `- ${exp.jobTitle} at ${exp.companyName}`;
                        if (exp.startDate) summary += ` (${exp.startDate.substring(0, 4)})`;
                        summary += '\n';
                    });
                }

                if (educations.length > 0) {
                    summary += `\n**Education:**\n`;
                    educations.forEach(edu => {
                        summary += `- ${edu.degree || 'Degree'} from ${edu.institution}\n`;
                    });
                }
            }

            // Determine strengths and concerns
            const keyStrengths = [];
            const potentialConcerns = [];

            if ((candidate.totalExperienceYears || 0) >= 5) {
                keyStrengths.push('Solid experience level');
            }
            if (skills.length >= 10) {
                keyStrengths.push('Diverse skill set');
            }
            if (skills.filter(s => s.isVerified).length > 0) {
                keyStrengths.push('Has verified skills');
            }
            if (experiences.length >= 3) {
                keyStrengths.push('Rich work history');
            }

            if ((candidate.totalExperienceYears || 0) < 2) {
                potentialConcerns.push('Limited experience');
            }
            if (skills.length < 5) {
                potentialConcerns.push('Limited documented skills');
            }
            if (!candidate.linkedInUrl) {
                potentialConcerns.push('No LinkedIn profile linked');
            }

            // Job fit assessment if job specified
            let fitAssessment = null;
            if (forJobId) {
                const match = await SELECT.one.from(MatchResults)
                    .where({ candidate_ID: candidateId, jobPosting_ID: forJobId });

                if (match) {
                    fitAssessment = `Match score: ${match.overallScore}/100. ` +
                        `Skills: ${match.skillScore}/100, Experience: ${match.experienceScore}/100.`;
                }
            }

            return { summary, keyStrengths, potentialConcerns, fitAssessment };

        } catch (error) {
            return {
                summary: `Error generating summary: ${error.message}`,
                keyStrengths: [],
                potentialConcerns: [],
                fitAssessment: null
            };
        }
    }

    /**
     * Analyze job fit
     */
    async handleAnalyzeJobFit(req) {
        const { candidateId, jobPostingId } = req.data;

        const matchResult = await this.matchingService.calculateMatchScore({
            candidateId,
            jobPostingId,
            detailedBreakdown: true
        });

        const breakdown = matchResult.breakdown ? JSON.parse(matchResult.breakdown) : {};
        const strengths = [];
        const gaps = [];

        if (matchResult.skillScore >= 70) strengths.push('Strong skill match');
        else if (matchResult.skillScore < 50) gaps.push('Significant skill gaps');

        if (matchResult.experienceScore >= 70) strengths.push('Experience meets requirements');
        else if (matchResult.experienceScore < 50) gaps.push('Experience below requirements');

        if (breakdown.skillDetails?.missing?.length > 0) {
            gaps.push(`Missing ${breakdown.skillDetails.missing.length} required skills`);
        }

        const analysis = `Overall fit score: ${matchResult.overallScore}/100.\n\n` +
            `This candidate scores well in ${strengths.length > 0 ? strengths.join(', ') : 'limited areas'}, ` +
            `but may need development in ${gaps.length > 0 ? gaps.join(', ') : 'few areas'}.`;

        return {
            fitScore: matchResult.overallScore,
            analysis,
            strengths: JSON.stringify(strengths),
            gaps: JSON.stringify(gaps),
            recommendations: JSON.stringify(matchResult.recommendations ? JSON.parse(matchResult.recommendations) : [])
        };
    }

    /**
     * Generate interview questions
     */
    async handleGenerateQuestions(req) {
        const { candidateId, jobPostingId, focusAreas, questionCount } = req.data;
        const { Candidates, JobPostings, WorkExperiences, CandidateSkills, Skills } = this.entities;

        try {
            const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            const job = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            const experiences = await SELECT.from(WorkExperiences)
                .where({ candidate_ID: candidateId })
                .orderBy('startDate desc')
                .limit(3);
            const skills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });

            const questions = [];
            const areas = focusAreas || ['skills', 'experience', 'culture-fit'];
            const count = questionCount || 10;

            // Skills-based questions
            if (areas.includes('skills')) {
                questions.push({
                    category: 'Technical Skills',
                    question: `Can you describe a complex project where you applied ${skills[0]?.name || 'your key skills'}?`,
                    rationale: 'Assesses practical application of claimed skills'
                });
                questions.push({
                    category: 'Technical Skills',
                    question: 'How do you stay current with new technologies and industry trends?',
                    rationale: 'Evaluates learning mindset and growth potential'
                });
            }

            // Experience-based questions
            if (areas.includes('experience') && experiences.length > 0) {
                const latestExp = experiences[0];
                questions.push({
                    category: 'Experience',
                    question: `Tell me about your role at ${latestExp.companyName}. What were your main achievements?`,
                    rationale: 'Validates experience and measures impact'
                });
                questions.push({
                    category: 'Experience',
                    question: 'Describe a challenging situation you faced at work and how you resolved it.',
                    rationale: 'Assesses problem-solving and resilience'
                });
            }

            // Culture-fit questions
            if (areas.includes('culture-fit')) {
                questions.push({
                    category: 'Culture Fit',
                    question: 'What type of work environment helps you do your best work?',
                    rationale: 'Evaluates team and culture compatibility'
                });
                questions.push({
                    category: 'Culture Fit',
                    question: 'How do you handle feedback and criticism?',
                    rationale: 'Assesses emotional intelligence and growth mindset'
                });
            }

            // Job-specific questions
            if (job) {
                questions.push({
                    category: 'Role-Specific',
                    question: `What interests you most about the ${job.title} position?`,
                    rationale: 'Evaluates motivation and understanding of the role'
                });
            }

            // Behavioral questions
            questions.push({
                category: 'Behavioral',
                question: 'Tell me about a time you had to work with a difficult team member.',
                rationale: 'Assesses interpersonal skills and conflict resolution'
            });

            return {
                questions: JSON.stringify(questions.slice(0, count)),
                rationale: 'Questions generated based on candidate profile, job requirements, and specified focus areas.'
            };

        } catch (error) {
            return {
                questions: '[]',
                rationale: `Error: ${error.message}`
            };
        }
    }

    /**
     * Analyze candidate pool
     */
    async handleAnalyzePool(req) {
        const { jobPostingId } = req.data;
        const { MatchResults, JobPostings, JobRequiredSkills, Skills } = this.entities;

        try {
            const matches = await SELECT.from(MatchResults).where({ jobPosting_ID: jobPostingId });
            const job = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });

            const poolSize = matches.length;
            const avgScore = poolSize > 0
                ? matches.reduce((sum, m) => sum + (m.overallScore || 0), 0) / poolSize
                : 0;

            const qualityAssessment = avgScore >= 70
                ? 'Strong candidate pool with many qualified applicants'
                : avgScore >= 50
                    ? 'Moderate pool quality - some strong candidates available'
                    : 'Limited pool quality - consider expanding search criteria';

            const recommendations = [];
            if (poolSize < 10) {
                recommendations.push('Consider broadening job requirements to attract more candidates');
            }
            if (avgScore < 50) {
                recommendations.push('Review required skills - some may be too restrictive');
            }
            if (matches.filter(m => m.overallScore >= 80).length === 0) {
                recommendations.push('No excellent matches found - consider targeted sourcing');
            }

            return {
                poolSize,
                qualityAssessment,
                skillCoverage: JSON.stringify({ averageScore: Math.round(avgScore), requiredSkillsCount: requiredSkills.length }),
                recommendations: JSON.stringify(recommendations),
                marketInsights: 'Based on current data, the talent market shows moderate availability for this role type.'
            };

        } catch (error) {
            return {
                poolSize: 0,
                qualityAssessment: 'Unable to assess',
                skillCoverage: '{}',
                recommendations: '[]',
                marketInsights: ''
            };
        }
    }

    /**
     * Compare candidates with insights
     */
    async handleCompareWithInsights(req) {
        const { candidateIds, jobPostingId } = req.data;

        const comparisonResult = await this.matchingService.compareCandidates({
            candidateIds,
            jobPostingId,
            comparisonFactors: ['skills', 'experience', 'education']
        });

        const comparison = JSON.parse(comparisonResult.comparison || '[]');

        // Generate tradeoffs
        const tradeoffs = [];
        if (comparison.length >= 2) {
            const sorted = [...comparison].sort((a, b) => b.overallScore - a.overallScore);
            if (sorted[0].experience < sorted[1].experience) {
                tradeoffs.push(`${sorted[0].name} scores higher overall but ${sorted[1].name} has more experience`);
            }
            if (sorted[0].totalSkills < sorted[1].totalSkills) {
                tradeoffs.push(`${sorted[1].name} has a broader skill set`);
            }
        }

        return {
            comparison: comparisonResult.comparison,
            recommendation: comparisonResult.recommendation,
            tradeoffs: JSON.stringify(tradeoffs)
        };
    }

    // ==========================================
    // PROACTIVE INSIGHTS
    // ==========================================

    /**
     * Get proactive insights for candidate
     */
    async handleProactiveInsights(req) {
        const { candidateId } = req.data;
        const { Candidates, CandidateSkills, MatchResults } = this.entities;

        try {
            const candidate = await SELECT.one.from(Candidates).where({ ID: candidateId });
            const skills = await SELECT.from(CandidateSkills).where({ candidate_ID: candidateId });
            const matches = await SELECT.from(MatchResults).where({ candidate_ID: candidateId });

            const insights = [];
            const suggestedActions = [];

            // Profile completeness
            const profileFields = [candidate.email, candidate.phone, candidate.linkedInUrl, candidate.headline, candidate.summary];
            const completeness = profileFields.filter(Boolean).length / profileFields.length * 100;
            if (completeness < 80) {
                insights.push({
                    type: 'profile',
                    priority: 'medium',
                    message: `Profile is ${Math.round(completeness)}% complete. Missing information may affect matching.`
                });
                suggestedActions.push('Request candidate to complete their profile');
            }

            // Skill verification
            const unverifiedSkills = skills.filter(s => !s.isVerified).length;
            if (unverifiedSkills > 5) {
                insights.push({
                    type: 'skills',
                    priority: 'low',
                    message: `${unverifiedSkills} skills are unverified`
                });
                suggestedActions.push('Schedule technical assessment to verify skills');
            }

            // Match analysis
            const highMatches = matches.filter(m => m.overallScore >= 70);
            if (highMatches.length > 0) {
                insights.push({
                    type: 'matching',
                    priority: 'high',
                    message: `Candidate has ${highMatches.length} high-scoring job matches`
                });
                suggestedActions.push('Review top job matches for this candidate');
            }

            return {
                insights: JSON.stringify(insights),
                suggestedActions: JSON.stringify(suggestedActions)
            };

        } catch (error) {
            return { insights: '[]', suggestedActions: '[]' };
        }
    }

    /**
     * Get job posting insights
     */
    async handleJobInsights(req) {
        const { jobPostingId } = req.data;
        const { JobPostings, MatchResults, JobRequiredSkills } = this.entities;

        try {
            const job = await SELECT.one.from(JobPostings).where({ ID: jobPostingId });
            const matches = await SELECT.from(MatchResults).where({ jobPosting_ID: jobPostingId });
            const requiredSkills = await SELECT.from(JobRequiredSkills).where({ jobPosting_ID: jobPostingId });

            const insights = [];
            const suggestedChanges = [];

            // Match quality
            const avgScore = matches.length > 0
                ? matches.reduce((sum, m) => sum + (m.overallScore || 0), 0) / matches.length
                : 0;

            if (avgScore < 40) {
                insights.push({
                    type: 'matching',
                    priority: 'high',
                    message: 'Low average match score indicates requirements may be too restrictive'
                });
                suggestedChanges.push('Consider making some required skills optional');
            }

            // Required skills analysis
            if (requiredSkills.filter(s => s.isRequired).length > 10) {
                insights.push({
                    type: 'requirements',
                    priority: 'medium',
                    message: 'High number of required skills may limit candidate pool'
                });
                suggestedChanges.push('Prioritize 5-7 most critical skills as required');
            }

            return {
                insights: JSON.stringify(insights),
                marketAnalysis: `Based on ${matches.length} candidates matched to this position.`,
                suggestedChanges: JSON.stringify(suggestedChanges)
            };

        } catch (error) {
            return { insights: '[]', marketAnalysis: '', suggestedChanges: '[]' };
        }
    }

    /**
     * Detect issues
     */
    async handleDetectIssues(req) {
        const { entityType, entityId } = req.data;

        const issues = [];
        let severity = 'low';

        if (entityType === 'candidate') {
            const { Candidates, CVDocuments } = this.entities;
            const candidate = await SELECT.one.from(Candidates).where({ ID: entityId });
            const docs = await SELECT.from(CVDocuments).where({ candidate_ID: entityId });

            if (!candidate.email) {
                issues.push({ type: 'missing_data', field: 'email', severity: 'high' });
                severity = 'high';
            }
            if (docs.length === 0) {
                issues.push({ type: 'missing_data', field: 'cv_document', severity: 'medium' });
                if (severity !== 'high') severity = 'medium';
            }
            if (docs.some(d => d.processingStatus === 'failed')) {
                issues.push({ type: 'processing_error', field: 'document', severity: 'medium' });
            }
        }

        const resolutions = issues.map(issue => ({
            issue: issue.type,
            resolution: issue.type === 'missing_data'
                ? `Add ${issue.field} to complete the profile`
                : `Review and fix ${issue.field} processing`
        }));

        return {
            issues: JSON.stringify(issues),
            severity,
            resolutions: JSON.stringify(resolutions)
        };
    }

    // ==========================================
    // FEEDBACK & LEARNING
    // ==========================================

    async handleFeedback(req) {
        const { messageId, rating, feedbackText, wasHelpful } = req.data;
        // Store feedback for model improvement
        console.log('Feedback received:', { messageId, rating, feedbackText, wasHelpful });
        return { success: true, message: 'Thank you for your feedback!' };
    }

    async handleLearnFromDecision(req) {
        const { candidateId, jobPostingId, decision, decisionFactors } = req.data;
        // Store hiring decision for model improvement
        console.log('Learning from decision:', { candidateId, jobPostingId, decision, decisionFactors });
        return {
            acknowledged: true,
            modelImpact: 'Decision recorded for future matching improvements'
        };
    }

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    async handleQuickStat(req) {
        const { query } = req.data;
        const { Candidates, JobPostings, MatchResults } = this.entities;

        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes('candidate')) {
            const count = await SELECT.from(Candidates).columns('count(*) as count');
            return {
                answer: `There are ${count[0]?.count || 0} candidates in the system.`,
                value: String(count[0]?.count || 0),
                context: 'Total candidate count'
            };
        } else if (lowerQuery.includes('job')) {
            const count = await SELECT.from(JobPostings).columns('count(*) as count');
            return {
                answer: `There are ${count[0]?.count || 0} job postings.`,
                value: String(count[0]?.count || 0),
                context: 'Total job posting count'
            };
        }

        return {
            answer: 'I can help you with statistics about candidates, jobs, and matches.',
            value: '',
            context: 'General'
        };
    }

    async handleGetHistory(req) {
        const { sessionId, limit } = req.data;
        const { JouleMessages, JouleConversations } = this.entities;

        const conversation = await SELECT.one.from(JouleConversations).where({ sessionId });
        if (!conversation) {
            return { messages: '[]' };
        }

        const messages = await SELECT.from(JouleMessages)
            .where({ conversation_ID: conversation.ID })
            .orderBy('createdAt desc')
            .limit(limit || 20);

        return { messages: JSON.stringify(messages.reverse()) };
    }

    async handleGetSuggestions(req) {
        const { context, currentEntityType, currentEntityId } = req.data;

        const suggestions = {
            'candidate-search': [
                'Find candidates with React experience',
                'Show top 10 candidates by match score',
                'List candidates in screening stage'
            ],
            'job-matching': [
                'Find matches for this job',
                'Compare top candidates',
                'What skills are we missing?'
            ],
            'analytics': [
                'Show pipeline statistics',
                'What is the average match score?',
                'How many candidates per source?'
            ]
        };

        return { suggestions: suggestions[context] || suggestions['candidate-search'] };
    }
};
