/**
 * Advanced Scoring Rule Engine
 *
 * Evaluates complex scoring rules with full boolean logic, pattern matching,
 * and dynamic score adjustments for candidate-job matching.
 */

class RuleEngine {
    constructor(db) {
        this.db = db;
    }

    /**
     * Evaluate all applicable rules for a candidate-job pair
     */
    async evaluateRules(candidateId, jobPostingId, candidateData, jobData) {
        // Load all applicable rules (global → template → job-specific)
        const rules = await this.loadApplicableRules(jobPostingId);

        if (!rules || rules.length === 0) {
            return {
                totalRulesEvaluated: 0,
                rulesMatched: 0,
                preFilterPassed: true,
                disqualified: false,
                originalScore: null,
                finalScore: null,
                auditTrail: []
            };
        }

        // Sort rules by priority (higher priority first)
        const sortedRules = this.sortRulesByStrategy(rules, jobData.scoringStrategy || 'PRIORITY');

        const audit = [];
        let disqualified = false;
        let disqualificationReason = null;
        let currentScores = {
            overall: candidateData.overallScore || 0,
            skill: candidateData.skillScore || 0,
            experience: candidateData.experienceScore || 0,
            education: candidateData.educationScore || 0,
            location: candidateData.locationScore || 0,
            semantic: candidateData.semanticScore || 0
        };

        const originalScore = { ...currentScores };
        let rulesMatched = 0;

        // Phase 1: Pre-filter rules (disqualification)
        for (const rule of sortedRules) {
            if (rule.ruleType !== 'PRE_FILTER' && rule.ruleType !== 'DISQUALIFY') continue;
            if (!rule.isActive) continue;

            const matched = this.evaluateConditions(rule.conditions, candidateData, jobData);

            if (matched) {
                rulesMatched++;
                const action = this.executeAction(rule.actions, currentScores, candidateData, jobData);

                audit.push({
                    ruleId: rule.ID,
                    ruleName: rule.name,
                    ruleType: rule.ruleType,
                    matched: true,
                    actionTaken: action.description,
                    scoreImpact: action.scoreImpact || 0
                });

                if (action.disqualify) {
                    disqualified = true;
                    disqualificationReason = rule.name;
                    break; // Stop processing if disqualified
                }

                if (rule.stopOnMatch) break;
            }
        }

        // Phase 2: Category boosts and modifiers (only if not disqualified)
        if (!disqualified) {
            for (const rule of sortedRules) {
                if (rule.ruleType === 'PRE_FILTER' || rule.ruleType === 'DISQUALIFY') continue;
                if (!rule.isActive) continue;

                const matched = this.evaluateConditions(rule.conditions, candidateData, jobData);

                if (matched) {
                    rulesMatched++;
                    const action = this.executeAction(rule.actions, currentScores, candidateData, jobData);

                    // Apply score modifications
                    if (action.categoryBoosts) {
                        for (const [category, boost] of Object.entries(action.categoryBoosts)) {
                            const oldScore = currentScores[category] || 0;
                            currentScores[category] = this.applyModifier(oldScore, boost);
                        }
                    }

                    if (action.overallModifier) {
                        const oldScore = currentScores.overall;
                        currentScores.overall = this.applyModifier(oldScore, action.overallModifier);
                    }

                    audit.push({
                        ruleId: rule.ID,
                        ruleName: rule.name,
                        ruleType: rule.ruleType,
                        matched: true,
                        actionTaken: action.description,
                        scoreImpact: action.scoreImpact || 0
                    });

                    if (rule.stopOnMatch) break;
                }
            }
        }

        return {
            totalRulesEvaluated: sortedRules.length,
            rulesMatched,
            preFilterPassed: !disqualified,
            disqualified,
            disqualificationReason,
            originalScore: originalScore.overall,
            finalScore: currentScores.overall,
            categoryScores: currentScores,
            auditTrail: audit
        };
    }

    /**
     * Load all rules applicable to a job posting
     */
    async loadApplicableRules(jobPostingId) {
        const { ScoringRules, JobPostings } = this.db.entities('cv.sorting');

        // Get job posting to find template
        const job = await SELECT.one.from(JobPostings)
            .columns('scoringTemplate_ID')
            .where({ ID: jobPostingId });

        const rules = [];

        // 1. Load global rules
        const globalRules = await SELECT.from(ScoringRules)
            .where({ isGlobal: true, isActive: true });
        rules.push(...globalRules);

        // 2. Load template rules (if template is assigned)
        if (job?.scoringTemplate_ID) {
            const templateRules = await SELECT.from(ScoringRules)
                .where({ template_ID: job.scoringTemplate_ID, isActive: true });
            rules.push(...templateRules);
        }

        // 3. Load job-specific rules
        const jobRules = await SELECT.from(ScoringRules)
            .where({ jobPosting_ID: jobPostingId, isActive: true });
        rules.push(...jobRules);

        // Parse JSON fields
        return rules.map(rule => ({
            ...rule,
            conditions: this.parseJSON(rule.conditions),
            actions: this.parseJSON(rule.actions)
        }));
    }

    /**
     * Sort rules based on strategy
     */
    sortRulesByStrategy(rules, strategy) {
        switch (strategy) {
            case 'PRIORITY':
                return rules.sort((a, b) => (b.priority || 50) - (a.priority || 50));

            case 'SEQUENTIAL':
                return rules.sort((a, b) => (a.executionOrder || 0) - (b.executionOrder || 0));

            case 'GROUPED':
                // Group by rule type in fixed order
                const typeOrder = { 'DISQUALIFY': 1, 'PRE_FILTER': 2, 'CATEGORY_BOOST': 3, 'OVERALL_MODIFIER': 4, 'WEIGHT_ADJUSTER': 5 };
                return rules.sort((a, b) => {
                    const orderDiff = (typeOrder[a.ruleType] || 99) - (typeOrder[b.ruleType] || 99);
                    if (orderDiff !== 0) return orderDiff;
                    return (b.priority || 50) - (a.priority || 50); // Within group, sort by priority
                });

            default:
                return rules.sort((a, b) => (b.priority || 50) - (a.priority || 50));
        }
    }

    /**
     * Evaluate rule conditions (supports AND, OR, NOT, comparisons, pattern matching)
     */
    evaluateConditions(conditions, candidateData, jobData) {
        if (!conditions || typeof conditions !== 'object') return false;

        const operator = conditions.operator?.toUpperCase();

        // Logical operators
        if (operator === 'AND') {
            return conditions.conditions.every(c => this.evaluateConditions(c, candidateData, jobData));
        }

        if (operator === 'OR') {
            return conditions.conditions.some(c => this.evaluateConditions(c, candidateData, jobData));
        }

        if (operator === 'NOT') {
            return !this.evaluateConditions(conditions.conditions[0], candidateData, jobData);
        }

        // Leaf condition - evaluate comparison
        const field = conditions.field;
        const op = conditions.operator;
        const value = conditions.value;

        const actualValue = this.getFieldValue(field, candidateData, jobData);

        return this.compareValues(actualValue, op, value);
    }

    /**
     * Get field value from candidate or job data
     */
    getFieldValue(field, candidateData, jobData) {
        // Support nested fields like "status.name" or "skills.length"
        const parts = field.split('.');

        // Try candidate data first
        let value = candidateData;
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                break;
            }
        }

        if (value !== candidateData) return value;

        // Try job data
        value = jobData;
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                break;
            }
        }

        return value;
    }

    /**
     * Compare values using various operators
     */
    compareValues(actual, operator, expected) {
        if (actual === null || actual === undefined) return false;

        switch (operator?.toUpperCase()) {
            case '>':
                return Number(actual) > Number(expected);
            case '<':
                return Number(actual) < Number(expected);
            case '>=':
                return Number(actual) >= Number(expected);
            case '<=':
                return Number(actual) <= Number(expected);
            case '==':
            case '===':
                return actual == expected;
            case '!=':
            case '!==':
                return actual != expected;
            case 'CONTAINS':
                return String(actual).toLowerCase().includes(String(expected).toLowerCase());
            case 'MATCHES':
                // Regex pattern matching
                try {
                    const regex = new RegExp(expected, 'i');
                    return regex.test(String(actual));
                } catch (e) {
                    return false;
                }
            case 'IN':
                return Array.isArray(expected) && expected.includes(actual);
            case 'HAS':
                // Check if array contains value
                return Array.isArray(actual) && actual.some(item =>
                    typeof item === 'object' ? item.name === expected || item.ID === expected : item === expected
                );
            case 'STARTS_WITH':
                return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());
            case 'ENDS_WITH':
                return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());
            default:
                return false;
        }
    }

    /**
     * Execute rule action and return result
     */
    executeAction(actions, currentScores, candidateData, jobData) {
        if (!actions || typeof actions !== 'object') {
            return { description: 'No action', scoreImpact: 0 };
        }

        const result = {
            description: '',
            scoreImpact: 0,
            categoryBoosts: {},
            overallModifier: null,
            disqualify: false
        };

        const actionType = actions.type;
        const message = actions.message || '';

        switch (actionType) {
            case 'DISQUALIFY':
                result.disqualify = true;
                result.description = `Disqualified: ${message}`;
                break;

            case 'BOOST_CATEGORY':
                const category = actions.category; // 'skills', 'experience', 'education', etc.
                const modifier = actions.modifier;
                result.categoryBoosts[category] = modifier;
                result.description = `Boost ${category} score: ${this.describeModifier(modifier)}. ${message}`;
                result.scoreImpact = this.calculateImpact(currentScores[category] || 0, modifier);
                break;

            case 'MODIFY_OVERALL':
                result.overallModifier = actions.modifier;
                result.description = `Modify overall score: ${this.describeModifier(actions.modifier)}. ${message}`;
                result.scoreImpact = this.calculateImpact(currentScores.overall || 0, actions.modifier);
                break;

            case 'ADJUST_WEIGHTS':
                // Dynamic weight adjustment - will be handled in matching service
                result.description = `Adjust scoring weights. ${message}`;
                result.weightAdjustments = actions.weights;
                break;

            default:
                result.description = `Unknown action: ${actionType}`;
        }

        return result;
    }

    /**
     * Apply a modifier to a score
     */
    applyModifier(score, modifier) {
        if (!modifier || typeof modifier !== 'object') return score;

        const { type, value } = modifier;

        switch (type?.toUpperCase()) {
            case 'PERCENTAGE':
                // Boost/reduce by percentage
                return score * (1 + value / 100);

            case 'ABSOLUTE':
                // Add/subtract absolute points
                return Math.max(0, Math.min(100, score + value));

            case 'MULTIPLIER':
                // Multiply score
                return Math.max(0, Math.min(100, score * value));

            case 'SET':
                // Set to specific value
                return Math.max(0, Math.min(100, value));

            default:
                return score;
        }
    }

    /**
     * Calculate score impact of a modifier
     */
    calculateImpact(score, modifier) {
        if (!modifier) return 0;
        const newScore = this.applyModifier(score, modifier);
        return newScore - score;
    }

    /**
     * Describe a modifier in human-readable form
     */
    describeModifier(modifier) {
        if (!modifier || typeof modifier !== 'object') return '';

        const { type, value } = modifier;

        switch (type?.toUpperCase()) {
            case 'PERCENTAGE':
                return `${value > 0 ? '+' : ''}${value}%`;
            case 'ABSOLUTE':
                return `${value > 0 ? '+' : ''}${value} points`;
            case 'MULTIPLIER':
                return `×${value}`;
            case 'SET':
                return `set to ${value}`;
            default:
                return '';
        }
    }

    /**
     * Validate rule syntax
     */
    validateRuleSyntax(conditions, actions) {
        const errors = [];
        const warnings = [];

        // Validate conditions
        try {
            const condObj = this.parseJSON(conditions);
            this.validateConditionStructure(condObj, errors, warnings);
        } catch (e) {
            errors.push(`Invalid conditions JSON: ${e.message}`);
        }

        // Validate actions
        try {
            const actObj = this.parseJSON(actions);
            this.validateActionStructure(actObj, errors, warnings);
        } catch (e) {
            errors.push(`Invalid actions JSON: ${e.message}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate condition structure recursively
     */
    validateConditionStructure(cond, errors, warnings, path = 'root') {
        if (!cond || typeof cond !== 'object') {
            errors.push(`${path}: Condition must be an object`);
            return;
        }

        const operator = cond.operator?.toUpperCase();
        const logicalOps = ['AND', 'OR', 'NOT'];
        const comparisonOps = ['>', '<', '>=', '<=', '==', '===', '!=', '!==', 'CONTAINS', 'MATCHES', 'IN', 'HAS', 'STARTS_WITH', 'ENDS_WITH'];

        if (logicalOps.includes(operator)) {
            if (!Array.isArray(cond.conditions)) {
                errors.push(`${path}: Logical operator '${operator}' requires 'conditions' array`);
            } else {
                cond.conditions.forEach((c, i) => {
                    this.validateConditionStructure(c, errors, warnings, `${path}.conditions[${i}]`);
                });
            }
        } else if (cond.field && cond.operator) {
            // Leaf condition
            if (!comparisonOps.includes(cond.operator.toUpperCase())) {
                warnings.push(`${path}: Unknown comparison operator '${cond.operator}'`);
            }
            if (cond.value === undefined) {
                warnings.push(`${path}: Comparison value is undefined`);
            }
        } else {
            errors.push(`${path}: Invalid condition structure - must have either 'operator' with 'conditions' or 'field' with 'operator' and 'value'`);
        }
    }

    /**
     * Validate action structure
     */
    validateActionStructure(action, errors, warnings) {
        if (!action || typeof action !== 'object') {
            errors.push('Action must be an object');
            return;
        }

        const validTypes = ['DISQUALIFY', 'BOOST_CATEGORY', 'MODIFY_OVERALL', 'ADJUST_WEIGHTS'];
        if (!action.type || !validTypes.includes(action.type.toUpperCase())) {
            errors.push(`Invalid action type: ${action.type}. Must be one of: ${validTypes.join(', ')}`);
        }

        if (action.type === 'BOOST_CATEGORY' && !action.category) {
            errors.push('BOOST_CATEGORY action requires "category" field');
        }

        if ((action.type === 'BOOST_CATEGORY' || action.type === 'MODIFY_OVERALL') && !action.modifier) {
            errors.push(`${action.type} action requires "modifier" object`);
        } else if (action.modifier) {
            const validModifierTypes = ['PERCENTAGE', 'ABSOLUTE', 'MULTIPLIER', 'SET'];
            if (!validModifierTypes.includes(action.modifier.type?.toUpperCase())) {
                errors.push(`Invalid modifier type: ${action.modifier.type}. Must be one of: ${validModifierTypes.join(', ')}`);
            }
            if (action.modifier.value === undefined || action.modifier.value === null) {
                errors.push('Modifier requires "value" field');
            }
        }
    }

    /**
     * Parse JSON safely
     */
    parseJSON(str) {
        if (typeof str === 'object') return str;
        if (!str) return null;
        try {
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    }
}

module.exports = RuleEngine;
