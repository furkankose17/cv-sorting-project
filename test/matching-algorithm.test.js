/**
 * Matching Algorithm Tests
 * Tests for CV-Job matching, scoring, and ranking algorithms
 */
'use strict';

const MatchingService = require('../srv/matching-service');

describe('Matching Algorithm', () => {

    let matchingService;

    beforeEach(() => {
        // Create instance of matching service
        matchingService = new MatchingService();
    });

    // ==========================================
    // SKILL SCORE CALCULATION
    // ==========================================

    describe('_calculateSkillScore', () => {

        it('should return 100 when no skills are required', () => {
            const candidateSkills = [{ skill_ID: '1' }, { skill_ID: '2' }];
            const jobRequiredSkills = [];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            expect(score).toBe(100);
        });

        it('should return 0 when candidate has no skills but job requires them', () => {
            const candidateSkills = [];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0 },
                { skill_ID: '2', isRequired: true, weight: 1.0 }
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            expect(score).toBe(0);
        });

        it('should return 100 when candidate has all required skills', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' },
                { skill_ID: '2', proficiencyLevel: 'advanced' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0, minimumProficiency: 'intermediate' },
                { skill_ID: '2', isRequired: true, weight: 1.0, minimumProficiency: 'intermediate' }
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            expect(score).toBe(100);
        });

        it('should penalize missing required skills', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0 },
                { skill_ID: '2', isRequired: true, weight: 1.0 }
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            expect(score).toBeLessThan(60); // Should be significantly penalized
        });

        it('should be lenient with nice-to-have skills', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0 },
                { skill_ID: '2', isRequired: false, weight: 1.0 } // Nice-to-have
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            expect(score).toBeGreaterThan(50); // Should not be heavily penalized
        });

        it('should weight required skills more heavily', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0 },
                { skill_ID: '2', isRequired: false, weight: 1.0 }
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);

            // Required skill is weighted 2x, so having 1 of 1 required should score well
            expect(score).toBeGreaterThan(60);
        });

        it('should handle custom weights', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' },
                { skill_ID: '2', proficiencyLevel: 'advanced' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 3.0 }, // High weight
                { skill_ID: '2', isRequired: true, weight: 1.0 },
                { skill_ID: '3', isRequired: true, weight: 1.0 }
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            // Should be fairly high since the high-weight skill is matched
            expect(score).toBeGreaterThan(60);
        });

        it('should handle null candidate skills gracefully', () => {
            const score = matchingService._calculateSkillScore(null, [
                { skill_ID: '1', isRequired: true, weight: 1.0 }
            ]);
            expect(score).toBe(0);
        });

        it('should handle null job skills gracefully', () => {
            const score = matchingService._calculateSkillScore([
                { skill_ID: '1', proficiencyLevel: 'advanced' }
            ], null);
            expect(score).toBe(100);
        });

        it('should handle undefined proficiency levels', () => {
            const candidateSkills = [
                { skill_ID: '1' } // No proficiency level
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0, minimumProficiency: 'intermediate' }
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            // Should still match but with reduced score
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThan(100);
        });
    });

    // ==========================================
    // PROFICIENCY MULTIPLIER
    // ==========================================

    describe('_getProficiencyMultiplier', () => {

        it('should return 1.0 when candidate meets or exceeds requirement', () => {
            expect(matchingService._getProficiencyMultiplier('advanced', 'intermediate')).toBe(1.0);
            expect(matchingService._getProficiencyMultiplier('expert', 'advanced')).toBe(1.0);
            expect(matchingService._getProficiencyMultiplier('advanced', 'advanced')).toBe(1.0);
        });

        it('should return 0.7 when candidate is one level below', () => {
            expect(matchingService._getProficiencyMultiplier('intermediate', 'advanced')).toBe(0.7);
            expect(matchingService._getProficiencyMultiplier('advanced', 'expert')).toBe(0.7);
        });

        it('should return 0.4 when candidate is multiple levels below', () => {
            expect(matchingService._getProficiencyMultiplier('beginner', 'advanced')).toBe(0.4);
            expect(matchingService._getProficiencyMultiplier('beginner', 'expert')).toBe(0.4);
        });

        it('should handle undefined levels with default intermediate', () => {
            expect(matchingService._getProficiencyMultiplier(undefined, undefined)).toBe(1.0);
            expect(matchingService._getProficiencyMultiplier('advanced', undefined)).toBe(1.0);
        });

        it('should handle invalid level strings', () => {
            const result = matchingService._getProficiencyMultiplier('invalid', 'intermediate');
            expect(result).toBeGreaterThanOrEqual(0.4);
            expect(result).toBeLessThanOrEqual(1.0);
        });
    });

    // ==========================================
    // SKILL MATCH DETAILS
    // ==========================================

    describe('_getSkillMatchDetails', () => {

        it('should identify matched skills', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' },
                { skill_ID: '2', proficiencyLevel: 'intermediate' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true },
                { skill_ID: '2', isRequired: true }
            ];

            const details = matchingService._getSkillMatchDetails(candidateSkills, jobRequiredSkills);

            expect(details.matched.length).toBe(2);
            expect(details.missing.length).toBe(0);
            expect(details.extra.length).toBe(0);
        });

        it('should identify missing skills', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true },
                { skill_ID: '2', isRequired: true },
                { skill_ID: '3', isRequired: false }
            ];

            const details = matchingService._getSkillMatchDetails(candidateSkills, jobRequiredSkills);

            expect(details.matched.length).toBe(1);
            expect(details.missing.length).toBe(2);
            expect(details.missing).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ skillId: '2', isRequired: true }),
                    expect.objectContaining({ skillId: '3', isRequired: false })
                ])
            );
        });

        it('should identify extra skills', () => {
            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' },
                { skill_ID: '2', proficiencyLevel: 'intermediate' },
                { skill_ID: '99', proficiencyLevel: 'expert' }
            ];
            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true }
            ];

            const details = matchingService._getSkillMatchDetails(candidateSkills, jobRequiredSkills);

            expect(details.matched.length).toBe(1);
            expect(details.extra.length).toBe(2);
            expect(details.extra).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ skillId: '2' }),
                    expect.objectContaining({ skillId: '99' })
                ])
            );
        });

        it('should handle empty arrays', () => {
            const details = matchingService._getSkillMatchDetails([], []);

            expect(details.matched.length).toBe(0);
            expect(details.missing.length).toBe(0);
            expect(details.extra.length).toBe(0);
        });
    });

    // ==========================================
    // EXPERIENCE SCORE CALCULATION
    // ==========================================

    describe('_calculateExperienceScore', () => {

        it('should return 100 when candidate meets or exceeds preferred experience', () => {
            expect(matchingService._calculateExperienceScore(10, 3, 8)).toBe(100);
            expect(matchingService._calculateExperienceScore(8, 3, 8)).toBe(100);
        });

        it('should return score between 70-100 when between min and preferred', () => {
            const score = matchingService._calculateExperienceScore(5, 3, 8);
            expect(score).toBeGreaterThan(70);
            expect(score).toBeLessThan(100);
        });

        it('should return score around 70 when at minimum experience', () => {
            const score = matchingService._calculateExperienceScore(3, 3, 8);
            expect(score).toBeCloseTo(70, 0);
        });

        it('should return score between 50-70 when slightly below minimum', () => {
            const score = matchingService._calculateExperienceScore(2, 3, 8);
            expect(score).toBeGreaterThan(50);
            expect(score).toBeLessThan(70);
        });

        it('should return low score when well below minimum', () => {
            const score = matchingService._calculateExperienceScore(1, 5, 10);
            expect(score).toBeLessThan(30);
        });

        it('should return 0 when candidate has no experience', () => {
            const score = matchingService._calculateExperienceScore(0, 3, 8);
            expect(score).toBe(0);
        });

        it('should handle null/undefined values', () => {
            expect(matchingService._calculateExperienceScore(null, null, null)).toBe(100);
            expect(matchingService._calculateExperienceScore(undefined, undefined, undefined)).toBe(100);
        });

        it('should treat missing preferred as same as minimum', () => {
            const score = matchingService._calculateExperienceScore(5, 5, null);
            expect(score).toBe(100);
        });

        it('should return 100 when no experience required', () => {
            const score = matchingService._calculateExperienceScore(3, 0, 0);
            expect(score).toBe(100);
        });
    });

    // ==========================================
    // EDUCATION SCORE CALCULATION
    // ==========================================

    describe('_calculateEducationScore', () => {

        it('should return 100 when candidate meets or exceeds requirement', () => {
            expect(matchingService._calculateEducationScore('bachelor', 'bachelor')).toBe(100);
            expect(matchingService._calculateEducationScore('master', 'bachelor')).toBe(100);
            expect(matchingService._calculateEducationScore('doctorate', 'bachelor')).toBe(100);
        });

        it('should return 75 when candidate is one level below', () => {
            expect(matchingService._calculateEducationScore('bachelor', 'master')).toBe(75);
            expect(matchingService._calculateEducationScore('associate', 'bachelor')).toBe(75);
        });

        it('should return lower score when multiple levels below', () => {
            const score = matchingService._calculateEducationScore('high_school', 'bachelor');
            expect(score).toBeLessThan(50);
        });

        it('should return 100 when no education required', () => {
            expect(matchingService._calculateEducationScore('high_school', null)).toBe(100);
            expect(matchingService._calculateEducationScore('bachelor', '')).toBe(100);
        });

        it('should handle null candidate level', () => {
            const score = matchingService._calculateEducationScore(null, 'bachelor');
            expect(score).toBeGreaterThanOrEqual(0);
        });

        it('should handle education level ranking correctly', () => {
            // Verify the hierarchy
            expect(matchingService._calculateEducationScore('high_school', 'high_school')).toBe(100);
            expect(matchingService._calculateEducationScore('associate', 'associate')).toBe(100);
            expect(matchingService._calculateEducationScore('bachelor', 'bachelor')).toBe(100);
            expect(matchingService._calculateEducationScore('master', 'master')).toBe(100);
            expect(matchingService._calculateEducationScore('doctorate', 'doctorate')).toBe(100);
        });

        it('should penalize significant education gaps', () => {
            const score = matchingService._calculateEducationScore('high_school', 'doctorate');
            expect(score).toBe(0);
        });
    });

    // ==========================================
    // LOCATION SCORE CALCULATION
    // ==========================================

    describe('_calculateLocationScore', () => {

        it('should return 100 for remote jobs', () => {
            expect(matchingService._calculateLocationScore('New York', 'San Francisco', 'remote')).toBe(100);
            expect(matchingService._calculateLocationScore('Paris', 'London', 'remote')).toBe(100);
        });

        it('should return 100 for exact location match', () => {
            expect(matchingService._calculateLocationScore('New York', 'New York', 'onsite')).toBe(100);
            expect(matchingService._calculateLocationScore('London', 'London', 'onsite')).toBe(100);
        });

        it('should return 90 for partial location match', () => {
            expect(matchingService._calculateLocationScore('New York, NY', 'New York', 'onsite')).toBe(90);
            expect(matchingService._calculateLocationScore('San Francisco', 'San Francisco, CA', 'onsite')).toBe(90);
        });

        it('should return 50 for unknown locations', () => {
            expect(matchingService._calculateLocationScore(null, 'New York', 'onsite')).toBe(50);
            expect(matchingService._calculateLocationScore('New York', null, 'onsite')).toBe(50);
        });

        it('should return 60 for hybrid jobs with different locations', () => {
            expect(matchingService._calculateLocationScore('New York', 'San Francisco', 'hybrid')).toBe(60);
        });

        it('should return 30 for different locations in onsite jobs', () => {
            expect(matchingService._calculateLocationScore('New York', 'San Francisco', 'onsite')).toBe(30);
        });

        it('should be case-insensitive', () => {
            expect(matchingService._calculateLocationScore('new york', 'NEW YORK', 'onsite')).toBe(100);
            expect(matchingService._calculateLocationScore('London', 'london', 'onsite')).toBe(100);
        });

        it('should handle empty strings', () => {
            expect(matchingService._calculateLocationScore('', '', 'onsite')).toBe(50);
        });
    });

    // ==========================================
    // OVERALL MATCH CALCULATION
    // ==========================================

    describe('calculateMatch', () => {

        it('should calculate overall match with default weights', async () => {
            const candidate = {
                totalExperienceYears: 5,
                educationLevel: 'bachelor',
                location: 'New York'
            };

            const jobPosting = {
                minimumExperience: 3,
                preferredExperience: 7,
                requiredEducation_code: 'bachelor',
                location: 'New York',
                locationType: 'onsite',
                skillWeight: 0.40,
                experienceWeight: 0.30,
                educationWeight: 0.20,
                locationWeight: 0.10
            };

            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'advanced' },
                { skill_ID: '2', proficiencyLevel: 'intermediate' }
            ];

            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0, minimumProficiency: 'intermediate' },
                { skill_ID: '2', isRequired: true, weight: 1.0, minimumProficiency: 'beginner' }
            ];

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, candidateSkills, jobRequiredSkills
            );

            expect(result).toHaveProperty('overallScore');
            expect(result).toHaveProperty('skillScore');
            expect(result).toHaveProperty('experienceScore');
            expect(result).toHaveProperty('educationScore');
            expect(result).toHaveProperty('locationScore');
            expect(result).toHaveProperty('breakdown');

            expect(result.overallScore).toBeGreaterThan(80); // Should be high match
            expect(result.skillScore).toBe(100); // All skills matched
            expect(result.educationScore).toBe(100); // Education matches
            expect(result.locationScore).toBe(100); // Location matches
        });

        it('should apply custom weights correctly', async () => {
            const candidate = {
                totalExperienceYears: 1,
                educationLevel: 'bachelor',
                location: 'New York'
            };

            const jobPosting = {
                minimumExperience: 5,
                preferredExperience: 10,
                requiredEducation_code: 'bachelor',
                location: 'New York',
                locationType: 'onsite',
                skillWeight: 0.80, // High skill weight
                experienceWeight: 0.05,
                educationWeight: 0.05,
                locationWeight: 0.10
            };

            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'expert' }
            ];

            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0 }
            ];

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, candidateSkills, jobRequiredSkills
            );

            // Should score well despite low experience because skill weight is high
            expect(result.overallScore).toBeGreaterThan(70);
        });

        it('should include detailed breakdown', async () => {
            const candidate = {
                totalExperienceYears: 5,
                educationLevel: 'bachelor',
                location: 'New York'
            };

            const jobPosting = {
                minimumExperience: 3,
                preferredExperience: 7,
                requiredEducation_code: 'bachelor',
                location: 'New York',
                locationType: 'onsite'
            };

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, [], []
            );

            expect(result.breakdown).toBeDefined();
            expect(result.breakdown.weights).toBeDefined();
            expect(result.breakdown.skillDetails).toBeDefined();
            expect(result.breakdown.experienceDetails).toBeDefined();
            expect(result.breakdown.locationDetails).toBeDefined();
        });

        it('should round scores to 2 decimal places', async () => {
            const candidate = {
                totalExperienceYears: 4,
                educationLevel: 'bachelor',
                location: 'New York'
            };

            const jobPosting = {
                minimumExperience: 3,
                preferredExperience: 7,
                requiredEducation_code: 'bachelor',
                location: 'New York',
                locationType: 'onsite'
            };

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, [], []
            );

            expect(result.overallScore).toEqual(Number(result.overallScore.toFixed(2)));
            expect(result.skillScore).toEqual(Number(result.skillScore.toFixed(2)));
        });

        it('should handle edge case with all zeros', async () => {
            const candidate = {
                totalExperienceYears: 0,
                educationLevel: null,
                location: null
            };

            const jobPosting = {
                minimumExperience: 0,
                preferredExperience: 0,
                requiredEducation_code: null,
                location: null,
                locationType: 'remote'
            };

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, [], []
            );

            expect(result.overallScore).toBe(100); // No requirements = perfect match
        });
    });

    // ==========================================
    // EDGE CASES & ERROR HANDLING
    // ==========================================

    describe('Edge Cases', () => {

        it('should handle missing weights in job posting', async () => {
            const candidate = {
                totalExperienceYears: 5,
                educationLevel: 'bachelor',
                location: 'New York'
            };

            const jobPosting = {
                // No weights specified - should use defaults
                minimumExperience: 3,
                preferredExperience: 7,
                requiredEducation_code: 'bachelor',
                location: 'New York',
                locationType: 'onsite'
            };

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, [], []
            );

            expect(result.breakdown.weights.skill).toBe(0.40); // Default
            expect(result.breakdown.weights.experience).toBe(0.30);
        });

        it('should handle extreme skill count differences', () => {
            const candidateSkills = Array.from({ length: 50 }, (_, i) => ({
                skill_ID: `skill-${i}`,
                proficiencyLevel: 'advanced'
            }));

            const jobRequiredSkills = [
                { skill_ID: 'skill-0', isRequired: true, weight: 1.0 }
            ];

            const score = matchingService._calculateSkillScore(candidateSkills, jobRequiredSkills);
            expect(score).toBe(100); // Has the one required skill
        });

        it('should handle very high experience years', () => {
            const score = matchingService._calculateExperienceScore(50, 5, 10);
            expect(score).toBe(100);
        });

        it('should handle negative experience values', () => {
            const score = matchingService._calculateExperienceScore(-1, 3, 8);
            expect(score).toBe(0);
        });

        it('should handle special characters in location', () => {
            const score = matchingService._calculateLocationScore(
                'São Paulo',
                'São Paulo',
                'onsite'
            );
            expect(score).toBe(100);
        });
    });

    // ==========================================
    // RECOMMENDATION GENERATION
    // ==========================================

    describe('_generateRecommendations', () => {

        it('should recommend acquiring missing required skills', () => {
            const breakdown = {
                skillDetails: {
                    missing: [
                        { skillId: '1', isRequired: true },
                        { skillId: '2', isRequired: true }
                    ]
                }
            };

            const recommendations = matchingService._generateRecommendations(breakdown);

            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0].type).toBe('skill');
            expect(recommendations[0].priority).toBe('high');
        });

        it('should recommend gaining experience when below minimum', () => {
            const breakdown = {
                experienceDetails: {
                    candidateYears: 2,
                    requiredMin: 5
                }
            };

            const recommendations = matchingService._generateRecommendations(breakdown);

            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations.some(r => r.type === 'experience')).toBe(true);
        });

        it('should not recommend experience when at minimum', () => {
            const breakdown = {
                experienceDetails: {
                    candidateYears: 5,
                    requiredMin: 5
                }
            };

            const recommendations = matchingService._generateRecommendations(breakdown);

            expect(recommendations.some(r => r.type === 'experience')).toBe(false);
        });

        it('should handle breakdown with no issues', () => {
            const breakdown = {
                skillDetails: { missing: [] },
                experienceDetails: { candidateYears: 10, requiredMin: 5 }
            };

            const recommendations = matchingService._generateRecommendations(breakdown);
            expect(recommendations.length).toBe(0);
        });

        it('should prioritize required skills over nice-to-have', () => {
            const breakdown = {
                skillDetails: {
                    missing: [
                        { skillId: '1', isRequired: true },
                        { skillId: '2', isRequired: false }
                    ]
                }
            };

            const recommendations = matchingService._generateRecommendations(breakdown);
            expect(recommendations[0].priority).toBe('high');
        });
    });

    // ==========================================
    // INTEGRATION SCENARIOS
    // ==========================================

    describe('Integration Scenarios', () => {

        it('should score junior candidate appropriately for junior role', async () => {
            const candidate = {
                totalExperienceYears: 1,
                educationLevel: 'bachelor',
                location: 'Berlin'
            };

            const jobPosting = {
                minimumExperience: 0,
                preferredExperience: 2,
                requiredEducation_code: 'bachelor',
                location: 'Berlin',
                locationType: 'onsite'
            };

            const candidateSkills = [
                { skill_ID: 'javascript', proficiencyLevel: 'intermediate' },
                { skill_ID: 'react', proficiencyLevel: 'beginner' }
            ];

            const jobRequiredSkills = [
                { skill_ID: 'javascript', isRequired: true, weight: 1.0, minimumProficiency: 'beginner' },
                { skill_ID: 'react', isRequired: false, weight: 1.0, minimumProficiency: 'beginner' }
            ];

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, candidateSkills, jobRequiredSkills
            );

            expect(result.overallScore).toBeGreaterThan(85); // Strong match for junior role
        });

        it('should score senior candidate appropriately for senior role', async () => {
            const candidate = {
                totalExperienceYears: 12,
                educationLevel: 'master',
                location: 'San Francisco'
            };

            const jobPosting = {
                minimumExperience: 8,
                preferredExperience: 10,
                requiredEducation_code: 'bachelor',
                location: 'San Francisco',
                locationType: 'hybrid'
            };

            const candidateSkills = [
                { skill_ID: 'python', proficiencyLevel: 'expert' },
                { skill_ID: 'aws', proficiencyLevel: 'expert' },
                { skill_ID: 'kubernetes', proficiencyLevel: 'advanced' },
                { skill_ID: 'leadership', proficiencyLevel: 'advanced' }
            ];

            const jobRequiredSkills = [
                { skill_ID: 'python', isRequired: true, weight: 2.0, minimumProficiency: 'advanced' },
                { skill_ID: 'aws', isRequired: true, weight: 2.0, minimumProficiency: 'advanced' },
                { skill_ID: 'kubernetes', isRequired: false, weight: 1.0, minimumProficiency: 'intermediate' }
            ];

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, candidateSkills, jobRequiredSkills
            );

            expect(result.overallScore).toBeGreaterThan(90); // Excellent match for senior role
        });

        it('should handle career changer with transferable skills', async () => {
            const candidate = {
                totalExperienceYears: 5,
                educationLevel: 'bachelor',
                location: 'Remote'
            };

            const jobPosting = {
                minimumExperience: 3,
                preferredExperience: 5,
                requiredEducation_code: 'bachelor',
                location: 'Anywhere',
                locationType: 'remote'
            };

            const candidateSkills = [
                { skill_ID: 'java', proficiencyLevel: 'expert' } // Has Java but job wants JavaScript
            ];

            const jobRequiredSkills = [
                { skill_ID: 'javascript', isRequired: true, weight: 1.0 },
                { skill_ID: 'nodejs', isRequired: true, weight: 1.0 }
            ];

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, candidateSkills, jobRequiredSkills
            );

            // Should score poorly on skills but okay overall
            expect(result.skillScore).toBeLessThan(30);
            expect(result.overallScore).toBeLessThan(70); // Not a strong match
        });

        it('should handle overqualified candidate', async () => {
            const candidate = {
                totalExperienceYears: 15,
                educationLevel: 'doctorate',
                location: 'New York'
            };

            const jobPosting = {
                minimumExperience: 2,
                preferredExperience: 5,
                requiredEducation_code: 'bachelor',
                location: 'New York',
                locationType: 'onsite'
            };

            const candidateSkills = [
                { skill_ID: '1', proficiencyLevel: 'expert' }
            ];

            const jobRequiredSkills = [
                { skill_ID: '1', isRequired: true, weight: 1.0, minimumProficiency: 'intermediate' }
            ];

            const result = await matchingService.calculateMatch(
                candidate, jobPosting, candidateSkills, jobRequiredSkills
            );

            // Should score perfectly - overqualification is still a match
            expect(result.overallScore).toBeGreaterThan(95);
        });
    });
});
