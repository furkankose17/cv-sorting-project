sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "../utils/MLServiceClient",
    "../model/formatter/DataFormatter",
    "../model/formatter/StatusFormatter",
    "../model/formatter/DisplayFormatter"
], function (BaseController, JSONModel, Filter, FilterOperator, MLServiceClient,
             DataFormatter, StatusFormatter, DisplayFormatter) {
    "use strict";

    return BaseController.extend("cvmanagement.controller.JobDetail", {

        // Expose formatters for view binding
        DataFormatter: DataFormatter,
        StatusFormatter: StatusFormatter,
        DisplayFormatter: DisplayFormatter,

        onInit: function () {
            const oRouter = this.getRouter();
            oRouter.getRoute("jobDetail").attachPatternMatched(this._onRouteMatched, this);
            oRouter.getRoute("jobScoring").attachPatternMatched(this._onScoringRouteMatched, this);

            // Initialize view model
            const oViewModel = new JSONModel({
                selectedTab: "overview",
                isLoadingCriteria: false,
                scoringCriteria: {
                    skills: [],
                    experience: [],
                    languages: [],
                    education: [],
                    certifications: []
                },
                totalMaxPoints: 0,
                requiredCriteriaCount: 0,
                semanticWeight: 50,
                criteriaWeight: 50
            });
            this.setModel(oViewModel, "viewModel");
        },

        /**
         * Handle route matched event
         * @param {sap.ui.base.Event} oEvent The route matched event
         * @private
         */
        _onRouteMatched: function (oEvent) {
            const sJobId = oEvent.getParameter("arguments").jobId;

            // Bind the view to the job posting (using draft entity syntax)
            this.getView().bindElement({
                path: "/JobPostings(ID=" + sJobId + ",IsActiveEntity=true)",
                parameters: {
                    $expand: "requiredSkills($expand=skill),matchResults($expand=candidate($expand=status)),customRules"
                }
            });

            // Set selected tab
            this.getModel("viewModel").setProperty("/selectedTab", "overview");
        },

        /**
         * Handle scoring route matched (navigate directly to scoring tab)
         * @param {sap.ui.base.Event} oEvent The route matched event
         * @private
         */
        _onScoringRouteMatched: function (oEvent) {
            const sJobId = oEvent.getParameter("arguments").jobId;

            // Bind the view (using draft entity syntax)
            this.getView().bindElement({
                path: "/JobPostings(ID=" + sJobId + ",IsActiveEntity=true)",
                parameters: {
                    $expand: "requiredSkills($expand=skill),matchResults($expand=candidate),customRules"
                }
            });

            // Set selected tab to scoring
            this.getModel("viewModel").setProperty("/selectedTab", "scoring");
            const oTabBar = this.byId("jobDetailTabBar");
            if (oTabBar) {
                oTabBar.setSelectedKey("scoring");
            }

            // Load scoring criteria
            this._loadScoringCriteria(sJobId);
        },

        /**
         * Navigate back
         */
        onNavBack: function () {
            this.navBack();
        },

        /**
         * Handle tab selection
         * @param {sap.ui.base.Event} oEvent The select event
         */
        onTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            this.getModel("viewModel").setProperty("/selectedTab", sKey);

            // Load scoring criteria when switching to scoring tab
            if (sKey === "scoring") {
                const oContext = this.getView().getBindingContext();
                if (oContext) {
                    const sJobId = oContext.getProperty("ID");
                    this._loadScoringCriteria(sJobId);
                }
            }
        },

        // ==================== Job Actions ====================

        /**
         * Handle publish job button press
         */
        onPublishJob: async function () {
            const oContext = this.getView().getBindingContext();
            const sJobId = oContext.getProperty("ID");

            const bConfirmed = await this.confirmAction("Are you sure you want to publish this job? This will make it visible to candidates and generate an embedding for semantic matching.");

            if (bConfirmed) {
                this.setBusy(true);
                try {
                    // Call publish action (auto-generates embedding)
                    const oModel = this.getModel();
                    const oActionContext = oModel.bindContext("/JobPostings(ID=" + sJobId + ",IsActiveEntity=true)/CVSortingService.publish");
                    await oActionContext.execute();

                    this.showSuccess("Job published successfully and embedding generated");
                    oContext.refresh();
                } catch (error) {
                    this.handleError(error);
                } finally {
                    this.setBusy(false);
                }
            }
        },

        /**
         * Handle close job button press
         */
        onCloseJob: async function () {
            const oContext = this.getView().getBindingContext();

            const bConfirmed = await this.confirmAction("Are you sure you want to close this job posting? No new applications will be accepted.");

            if (bConfirmed) {
                this.setBusy(true);
                try {
                    oContext.setProperty("status", "closed");
                    await this.getModel().submitBatch("jobGroup");

                    this.showSuccess("Job closed successfully");
                    oContext.refresh();
                } catch (error) {
                    this.handleError(error);
                } finally {
                    this.setBusy(false);
                }
            }
        },

        /**
         * Handle edit job button press
         */
        onEditJob: function () {
            const oContext = this.getView().getBindingContext();
            if (!oContext) {
                this.showError("Job not loaded");
                return;
            }

            const oJobData = oContext.getObject();

            // Create edit model with job data
            const oEditModel = new sap.ui.model.json.JSONModel({
                ID: oJobData.ID,
                title: oJobData.title,
                department: oJobData.department,
                location: oJobData.location,
                employmentType: oJobData.employmentType,
                status_code: oJobData.status_code,
                description: oJobData.description,
                requirements: oJobData.requirements
            });
            this.setModel(oEditModel, "editJob");

            // Open dialog (reuse from Main controller)
            if (!this._oEditJobDialog) {
                sap.ui.core.Fragment.load({
                    id: this.getView().getId(),
                    name: "cvmanagement.fragment.EditJobDialog",
                    controller: this
                }).then(function (oDialog) {
                    this._oEditJobDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                }.bind(this));
            } else {
                this._oEditJobDialog.open();
            }
        },

        onSaveEditJob: async function () {
            const oEditModel = this.getModel("editJob");
            const oJobData = oEditModel.getData();

            try {
                this.setBusy(true);

                const oContext = this.getView().getBindingContext();

                // Update properties
                oContext.setProperty("title", oJobData.title);
                oContext.setProperty("department", oJobData.department);
                oContext.setProperty("location", oJobData.location);
                oContext.setProperty("employmentType", oJobData.employmentType);
                oContext.setProperty("status_code", oJobData.status_code);
                oContext.setProperty("description", oJobData.description);
                oContext.setProperty("requirements", oJobData.requirements);

                await this.getModel().submitBatch("updateGroup");

                this._oEditJobDialog.close();
                this.showSuccess("Job updated successfully");
            } catch (oError) {
                this.handleError(oError);
            } finally {
                this.setBusy(false);
            }
        },

        onCancelEditJob: function () {
            this._oEditJobDialog.close();
        },

        onEditJobDialogEscape: function (oPromise) {
            oPromise.resolve();
            this._oEditJobDialog.close();
        },

        // ==================== Matching Actions ====================

        /**
         * Handle run matching button press
         */
        onRunMatching: async function () {
            const oContext = this.getView().getBindingContext();
            if (!oContext) {
                this.showError("Job details not loaded. Please try again.");
                return;
            }

            const sJobId = oContext.getProperty("ID");
            if (!sJobId) {
                this.showError("Job ID not found. Please refresh the page and try again.");
                return;
            }

            // Open matching progress dialog
            await this.openDialog("dialogs/RunMatchingDialog", {
                matchingSteps: [
                    { step: "1. Loading Candidates", description: "Fetching active candidates from database", status: "pending" },
                    { step: "2. Generating Embeddings", description: "Creating AI embeddings for candidates", status: "pending" },
                    { step: "3. Calculating Similarity", description: "Computing semantic similarity scores", status: "pending" },
                    { step: "4. Applying Scoring Criteria", description: "Evaluating against job requirements", status: "pending" },
                    { step: "5. Storing Results", description: "Saving match results to database", status: "pending" }
                ],
                progress: 0,
                progressText: "Initializing...",
                showResults: false,
                totalMatches: 0,
                topMatchScore: 0,
                averageScore: 0
            });

            const oDialogModel = this.getModel("dialogModel");

            try {
                // Simulate progress steps
                for (let i = 0; i < 5; i++) {
                    const aSteps = oDialogModel.getProperty("/matchingSteps");
                    aSteps[i].status = "running";
                    oDialogModel.setProperty("/matchingSteps", aSteps);
                    oDialogModel.setProperty("/progress", (i + 1) * 20 - 10);
                    oDialogModel.setProperty("/progressText", aSteps[i].step);

                    // Wait a bit for UX
                    await new Promise(resolve => setTimeout(resolve, 500));

                    aSteps[i].status = "completed";
                    oDialogModel.setProperty("/matchingSteps", aSteps);
                    oDialogModel.setProperty("/progress", (i + 1) * 20);
                }

                // Use ML service for semantic matching
                const oResult = await MLServiceClient.findSemanticMatches(sJobId, 0.5, 50, true);

                // Show results
                oDialogModel.setProperty("/showResults", true);
                oDialogModel.setProperty("/totalMatches", oResult.totalMatches);

                if (oResult.matches && oResult.matches.length > 0) {
                    const aScores = oResult.matches.map(m => m.overallScore || 0);
                    const fTopScore = Math.max(...aScores);
                    const fAvgScore = aScores.reduce((a, b) => a + b, 0) / aScores.length;

                    oDialogModel.setProperty("/topMatchScore", fTopScore);
                    oDialogModel.setProperty("/averageScore", fAvgScore);
                }

                if (oResult.mlUsed) {
                    this.showSuccess(`Found ${oResult.totalMatches} matching candidates using AI`);
                } else {
                    this.showInfo(oResult.message || "Using traditional matching");
                }

                // Refresh match results
                oContext.refresh();
                const oTable = this.byId("matchResultsTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }
            } catch (error) {
                this.handleError(error);
                this.closeDialog();
            }
        },

        /**
         * Handle refresh matches button press
         */
        onRefreshMatches: function () {
            const oTable = this.byId("matchResultsTable");
            if (oTable) {
                oTable.getBinding("items").refresh();
            }
            this.showSuccess("Matches refreshed");
        },

        /**
         * Quick rank - instantly filter and show top 10 candidates by score
         */
        onQuickRankTop10: function () {
            // Set filter to Top 10
            const oSegmentedButton = this.byId("triageFilter");
            if (oSegmentedButton) {
                oSegmentedButton.setSelectedKey("top10");
            }

            // Trigger the filter change programmatically
            this._applyTriageFilter("top10");

            // Show message
            sap.m.MessageToast.show(this.getResourceBundle().getText("quickRankRunning"));
        },

        /**
         * Apply triage filter programmatically
         * @param {string} sKey The filter key
         * @private
         */
        _applyTriageFilter: function (sKey) {
            const oTable = this.byId("matchResultsTable");
            if (!oTable) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            const aFilters = [];

            switch (sKey) {
                case "top10":
                    aFilters.push(new sap.ui.model.Filter("rank", sap.ui.model.FilterOperator.LE, 10));
                    break;
                case "hot":
                    aFilters.push(new sap.ui.model.Filter("overallScore", sap.ui.model.FilterOperator.GE, 80));
                    break;
                case "warm":
                    aFilters.push(new sap.ui.model.Filter([
                        new sap.ui.model.Filter("overallScore", sap.ui.model.FilterOperator.GE, 60),
                        new sap.ui.model.Filter("overallScore", sap.ui.model.FilterOperator.LT, 80)
                    ], true));
                    break;
                default:
                    // No filter for "all"
                    break;
            }

            oBinding.filter(aFilters);
        },

        /**
         * Handle triage filter change (All/Top 10/Hot/Warm)
         * @param {sap.ui.base.Event} oEvent The selection change event
         */
        onTriageFilterChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const oTable = this.byId("matchResultsTable");
            if (!oTable) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            // Build filters based on selection
            const aFilters = [];

            switch (sKey) {
                case "top10":
                    // Filter by rank <= 10
                    aFilters.push(new Filter("rank", FilterOperator.LE, 10));
                    break;
                case "hot":
                    // Filter by score >= 80
                    aFilters.push(new Filter("overallScore", FilterOperator.GE, 80));
                    break;
                case "warm":
                    // Filter by score >= 60 and < 80
                    aFilters.push(new Filter({
                        filters: [
                            new Filter("overallScore", FilterOperator.GE, 60),
                            new Filter("overallScore", FilterOperator.LT, 80)
                        ],
                        and: true
                    }));
                    break;
                // "all" - no filters
            }

            oBinding.filter(aFilters);
        },

        // ==================== Feedback Actions ====================

        /**
         * Handle positive feedback (thumbs up) button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onFeedbackPositive: async function (oEvent) {
            await this._submitFeedback(oEvent, "positive");
        },

        /**
         * Handle negative feedback (thumbs down) button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onFeedbackNegative: async function (oEvent) {
            await this._submitFeedback(oEvent, "negative");
        },

        /**
         * Submit feedback for a match result
         * @param {sap.ui.base.Event} oEvent The press event
         * @param {string} sFeedbackType 'positive' or 'negative'
         * @private
         */
        _submitFeedback: async function (oEvent, sFeedbackType) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sMatchResultId = oContext.getProperty("ID");

            // Prevent event propagation to avoid navigation
            oEvent.preventDefault && oEvent.preventDefault();

            this.setBusy(true);
            try {
                const oModel = this.getModel();
                const oActionContext = oModel.bindContext("/submitMatchFeedback(...)");
                oActionContext.setParameter("matchResultId", sMatchResultId);
                oActionContext.setParameter("feedbackType", sFeedbackType);
                oActionContext.setParameter("notes", null);

                await oActionContext.execute();
                const oResult = oActionContext.getBoundContext().getObject();

                if (oResult.success) {
                    const sMessage = oResult.feedbackId ?
                        `Feedback recorded (multiplier: ${oResult.newMultiplier}x)` :
                        "Feedback removed";
                    this.showSuccess(sMessage);

                    // Refresh the view context to show updated state
                    const oViewContext = this.getView().getBindingContext();
                    if (oViewContext) {
                        oViewContext.refresh();
                    }
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle match result press (navigate to candidate detail)
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onMatchPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext();
            const sCandidateId = oContext.getProperty("candidate/ID");

            this.getRouter().navTo("candidateDetail", {
                candidateId: sCandidateId
            });
        },

        /**
         * Handle view candidate button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onViewCandidate: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sCandidateId = oContext.getProperty("candidate/ID");

            this.getRouter().navTo("candidateDetail", {
                candidateId: sCandidateId
            });
        },

        /**
         * Handle view match details button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onViewMatchDetails: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();

            const oJobContext = this.getView().getBindingContext();

            const oMatchData = {
                matchResultId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("candidate/firstName") + " " + oContext.getProperty("candidate/lastName"),
                candidateId: oContext.getProperty("candidate/ID"),
                jobTitle: oJobContext.getProperty("title"),
                overallScore: oContext.getProperty("overallScore") || 0,
                skillScore: oContext.getProperty("skillScore") || 0,
                semanticScore: oContext.getProperty("semanticScore") || 0,
                matchedAt: oContext.getProperty("matchedAt"),
                scoreBreakdown: [
                    { category: "Technical Skills", description: "Programming languages and frameworks", score: 85, points: 25 },
                    { category: "Experience Level", description: "Years of relevant experience", score: 90, points: 20 },
                    { category: "Education", description: "Degree and certifications", score: 75, points: 15 },
                    { category: "Soft Skills", description: "Communication and teamwork", score: 80, points: 10 }
                ],
                matchedSkills: [
                    { skillName: "JavaScript", requiredLevel: "Advanced", candidateLevel: "Expert", isMatch: true },
                    { skillName: "React", requiredLevel: "Advanced", candidateLevel: "Advanced", isMatch: true },
                    { skillName: "Node.js", requiredLevel: "Intermediate", candidateLevel: "Advanced", isMatch: true },
                    { skillName: "Python", requiredLevel: "Intermediate", candidateLevel: "Beginner", isMatch: false }
                ],
                requiredExperience: oJobContext.getProperty("minYearsExperience") || 5,
                candidateExperience: oContext.getProperty("candidate/yearsOfExperience") || 0,
                experienceFit: "Good Match",
                experienceFitScore: 85,
                aiExplanation: "This candidate has strong technical skills in JavaScript and React, with " +
                    oContext.getProperty("candidate/yearsOfExperience") + " years of experience. " +
                    "The semantic analysis shows high alignment with the job requirements."
            };

            this.openDialog("dialogs/MatchDetailsDialog", oMatchData);
        },

        /**
         * Handle get match explanation
         */
        onGetMatchExplanation: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sMatchResultId = oDialogModel.getProperty("/matchResultId");

            this.setBusy(true);
            try {
                // Call explainMatch function
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/explainMatch(...)");
                oContext.setParameter("matchResultId", sMatchResultId);

                await oContext.execute();
                const oResult = oContext.getBoundContext().getObject();

                if (oResult && oResult.explanation) {
                    oDialogModel.setProperty("/aiExplanation", oResult.explanation);
                    this.showSuccess("Detailed explanation generated");
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle open match review from details dialog
         */
        onOpenMatchReview: function () {
            const oDialogModel = this.getModel("dialogModel");

            // Copy match data to review dialog
            const oReviewData = {
                matchResultId: oDialogModel.getProperty("/matchResultId"),
                candidateId: oDialogModel.getProperty("/candidateId"),
                candidateName: oDialogModel.getProperty("/candidateName"),
                jobTitle: oDialogModel.getProperty("/jobTitle"),
                overallScore: oDialogModel.getProperty("/overallScore"),
                skillScore: oDialogModel.getProperty("/skillScore"),
                semanticScore: oDialogModel.getProperty("/semanticScore"),
                matchedAt: oDialogModel.getProperty("/matchedAt"),
                reviewStatus: "pending",
                reviewNotes: "",
                contactCandidate: false
            };

            this.closeDialog();
            this.openDialog("dialogs/MatchReviewDialog", oReviewData);
        },

        /**
         * Handle view candidate from match details
         */
        onViewCandidateFromMatch: function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");

            this.closeDialog();
            this.getRouter().navTo("candidateDetail", {
                candidateId: sCandidateId
            });
        },

        /**
         * Handle confirm match review
         */
        onConfirmMatchReview: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sMatchResultId = oDialogModel.getProperty("/matchResultId");
            const sReviewStatus = oDialogModel.getProperty("/reviewStatus");
            const sReviewNotes = oDialogModel.getProperty("/reviewNotes");

            if (!sReviewStatus) {
                this.showInfo("Please select a review status");
                return;
            }

            this.setBusy(true);
            try {
                // Call review action
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/MatchResults(" + sMatchResultId + ")/MatchService.review");
                oContext.setParameter("status", sReviewStatus);
                oContext.setParameter("notes", sReviewNotes || "");

                await oContext.execute();

                this.closeDialog();
                this.showSuccess("Match reviewed successfully");

                // Refresh matches table
                const oTable = this.byId("matchResultsTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        // ==================== Scoring Criteria ====================

        /**
         * Load scoring criteria from ML service
         * @param {string} sJobId The job posting ID
         * @private
         */
        _loadScoringCriteria: async function (sJobId) {
            const oViewModel = this.getModel("viewModel");
            oViewModel.setProperty("/isLoadingCriteria", true);

            try {
                const oResult = await MLServiceClient.loadScoringCriteria(sJobId);

                if (oResult.success) {
                    // Organize criteria by type
                    const oCriteria = {
                        skills: [],
                        experience: [],
                        languages: [],
                        education: [],
                        certifications: []
                    };

                    (oResult.criteria || []).forEach(oCriterion => {
                        const sType = oCriterion.type || "skills";
                        if (oCriteria[sType]) {
                            oCriteria[sType].push(oCriterion);
                        }
                    });

                    oViewModel.setProperty("/scoringCriteria", oCriteria);

                    // Calculate totals
                    this._calculateScoringTotals(oResult.criteria);
                }
            } catch (error) {
                console.error("Failed to load scoring criteria:", error);
            } finally {
                oViewModel.setProperty("/isLoadingCriteria", false);
            }
        },

        /**
         * Calculate scoring totals
         * @param {Array} aCriteria The criteria array
         * @private
         */
        _calculateScoringTotals: function (aCriteria) {
            const oViewModel = this.getModel("viewModel");
            let iTotalPoints = 0;
            let iRequiredCount = 0;

            (aCriteria || []).forEach(oCriterion => {
                iTotalPoints += (oCriterion.points || 0);
                if (oCriterion.required) {
                    iRequiredCount++;
                }
            });

            oViewModel.setProperty("/totalMaxPoints", iTotalPoints);
            oViewModel.setProperty("/requiredCriteriaCount", iRequiredCount);
        },

        // ==================== Dialog-Specific Formatters ====================

        /**
         * Format priority to ObjectStatus state
         * @param {string} sPriority The priority
         * @returns {string} The state
         */
        formatPriorityState: function (sPriority) {
            const mStateMap = {
                "required": "Error",
                "preferred": "Warning",
                "nice_to_have": "Success"
            };
            return mStateMap[sPriority] || "None";
        },

        /**
         * Format step icon based on status
         * @param {string} sStatus The step status
         * @returns {string} The icon
         */
        formatStepIcon: function (sStatus) {
            const mIconMap = {
                "pending": "sap-icon://pending",
                "running": "sap-icon://synchronize",
                "completed": "sap-icon://accept",
                "error": "sap-icon://error"
            };
            return mIconMap[sStatus] || "sap-icon://question-mark";
        },

        /**
         * Format step icon color based on status
         * @param {string} sStatus The step status
         * @returns {string} The color
         */
        formatStepIconColor: function (sStatus) {
            const mColorMap = {
                "pending": "#6a6d70",
                "running": "#0854a0",
                "completed": "#2b7c2b",
                "error": "#bb0000"
            };
            return mColorMap[sStatus] || "#6a6d70";
        },

        /**
         * Format match state for skills
         * @param {boolean} bIsMatch Whether skills match
         * @returns {string} The state
         */
        formatMatchState: function (bIsMatch) {
            return bIsMatch ? "Success" : "Error";
        },

        /**
         * Format match icon
         * @param {boolean} bIsMatch Whether skills match
         * @returns {string} The icon
         */
        formatMatchIcon: function (bIsMatch) {
            return bIsMatch ? "sap-icon://accept" : "sap-icon://decline";
        },

        /**
         * Format match icon color
         * @param {boolean} bIsMatch Whether skills match
         * @returns {string} The color
         */
        formatMatchIconColor: function (bIsMatch) {
            return bIsMatch ? "Success" : "Error";
        },

        // ==================== Scoring Criteria Handlers ====================

        /**
         * Handle add criterion button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onAddCriterion: function (oEvent) {
            const oButton = oEvent.getSource();
            const sCriterionType = oButton.data("criterionType");

            this.openDialog("dialogs/AddCriterionDialog", {
                criterionType: sCriterionType,
                value: "",
                points: 10,
                weight: 1.0,
                required: false,
                notes: ""
            });
        },

        /**
         * Handle confirm add criterion
         */
        onConfirmAddCriterion: function () {
            const oDialogModel = this.getModel("dialogModel");
            const oViewModel = this.getModel("viewModel");

            const sType = oDialogModel.getProperty("/criterionType");
            const oCriterion = {
                type: sType,
                value: oDialogModel.getProperty("/value"),
                points: oDialogModel.getProperty("/points"),
                weight: oDialogModel.getProperty("/weight"),
                required: oDialogModel.getProperty("/required"),
                notes: oDialogModel.getProperty("/notes")
            };

            if (!oCriterion.value) {
                this.showInfo("Please enter a value");
                return;
            }

            // Add to the appropriate criteria array
            const aCriteria = oViewModel.getProperty("/scoringCriteria/" + sType) || [];
            aCriteria.push(oCriterion);
            oViewModel.setProperty("/scoringCriteria/" + sType, aCriteria);

            // Recalculate totals
            this._calculateScoringTotals(this._getAllCriteria());

            this.closeDialog();
            this.showSuccess("Criterion added successfully");
        },

        /**
         * Handle delete criterion button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onDeleteCriterion: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("viewModel");
            const sPath = oContext.getPath();

            // Extract the type and index from the path
            // Path format: /scoringCriteria/skills/0
            const aPathParts = sPath.split("/");
            const sType = aPathParts[2];
            const iIndex = parseInt(aPathParts[3]);

            const oViewModel = this.getModel("viewModel");
            const aCriteria = oViewModel.getProperty("/scoringCriteria/" + sType);

            // Remove the criterion
            aCriteria.splice(iIndex, 1);
            oViewModel.setProperty("/scoringCriteria/" + sType, aCriteria);

            // Recalculate totals
            this._calculateScoringTotals(this._getAllCriteria());

            this.showSuccess("Criterion deleted");
        },

        /**
         * Handle save scoring criteria button press
         */
        onSaveScoringCriteria: async function () {
            const oContext = this.getView().getBindingContext();
            const sJobId = oContext.getProperty("ID");

            const aCriteria = this._getAllCriteria();

            this.setBusy(true);
            try {
                const oResult = await MLServiceClient.saveScoringCriteria(sJobId, aCriteria);

                if (oResult.success) {
                    this.showSuccess("Scoring criteria saved successfully");
                } else {
                    this.showInfo(oResult.error || "Failed to save criteria");
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle refresh scoring criteria button press
         */
        onRefreshScoringCriteria: function () {
            const oContext = this.getView().getBindingContext();
            if (oContext) {
                const sJobId = oContext.getProperty("ID");
                this._loadScoringCriteria(sJobId);
            }
        },

        /**
         * Handle load template button press
         */
        onLoadTemplate: async function () {
            const oViewModel = this.getModel("viewModel");

            this.setBusy(true);
            try {
                const oResult = await MLServiceClient.loadScoringTemplates();

                if (oResult.success) {
                    oViewModel.setProperty("/scoringTemplates", oResult.templates);
                    this.showSuccess("Templates loaded successfully");

                    // Switch to templates tab
                    const oTabBar = this.byId("criteriaTabBar");
                    if (oTabBar) {
                        oTabBar.setSelectedKey("templates");
                    }
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle template selection
         * @param {sap.ui.base.Event} oEvent The selection change event
         */
        onTemplateSelect: function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oContext = oItem.getBindingContext("viewModel");
            const oTemplate = oContext.getObject();

            // Apply template criteria
            const oViewModel = this.getModel("viewModel");
            const oCriteria = {
                skills: [],
                experience: [],
                languages: [],
                education: [],
                certifications: []
            };

            // Organize template criteria by type
            (oTemplate.criteria || []).forEach(oCriterion => {
                const sType = oCriterion.type || "skills";
                if (oCriteria[sType]) {
                    oCriteria[sType].push(oCriterion);
                }
            });

            oViewModel.setProperty("/scoringCriteria", oCriteria);
            this._calculateScoringTotals(oTemplate.criteria);

            this.showSuccess("Template applied: " + oTemplate.name);

            // Switch back to first tab
            const oTabBar = this.byId("criteriaTabBar");
            if (oTabBar) {
                oTabBar.setSelectedKey("skills");
            }
        },

        /**
         * Get all criteria from all types
         * @returns {Array} All criteria
         * @private
         */
        _getAllCriteria: function () {
            const oViewModel = this.getModel("viewModel");
            const oCriteria = oViewModel.getProperty("/scoringCriteria");

            const aAllCriteria = [];
            ["skills", "experience", "languages", "education", "certifications"].forEach(sType => {
                if (oCriteria[sType]) {
                    oCriteria[sType].forEach(oCriterion => {
                        aAllCriteria.push({
                            ...oCriterion,
                            type: sType
                        });
                    });
                }
            });

            return aAllCriteria;
        },

        // ==================== Scoring Rules Methods ====================

        /**
         * Handle add scoring rule
         */
        onAddScoringRule: function () {
            // Create rule builder model
            const oRuleModel = new sap.ui.model.json.JSONModel({
                isEdit: false,
                name: "",
                field: "skills",
                operator: "contains",
                value: "",
                weight: 50,
                description: ""
            });
            this.setModel(oRuleModel, "ruleBuilder");

            this._openRuleBuilderDialog();
        },

        _openRuleBuilderDialog: function () {
            if (!this._oRuleBuilderDialog) {
                sap.ui.core.Fragment.load({
                    id: this.getView().getId(),
                    name: "cvmanagement.fragment.RuleBuilderDialog",
                    controller: this
                }).then(function (oDialog) {
                    this._oRuleBuilderDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                }.bind(this));
            } else {
                this._oRuleBuilderDialog.open();
            }
        },

        onSaveRule: async function () {
            const oRuleModel = this.getModel("ruleBuilder");
            const oRuleData = oRuleModel.getData();
            const sJobId = this.getView().getBindingContext().getProperty("ID");

            if (!oRuleData.name || !oRuleData.value) {
                this.showError("Please fill in required fields");
                return;
            }

            try {
                this.setBusy(true);

                const oModel = this.getModel();

                if (oRuleData.isEdit && oRuleData.ruleId) {
                    // Update existing rule
                    const oContext = oModel.bindContext(`/ScoringRules(${oRuleData.ruleId})`);
                    await oContext.requestObject();

                    oContext.setProperty("name", oRuleData.name);
                    oContext.setProperty("field", oRuleData.field);
                    oContext.setProperty("operator", oRuleData.operator);
                    oContext.setProperty("value", oRuleData.value);
                    oContext.setProperty("weight", oRuleData.weight);
                    oContext.setProperty("description", oRuleData.description);

                    await oModel.submitBatch("updateGroup");

                    this._oRuleBuilderDialog.close();
                    this.showSuccess("Rule updated successfully");
                } else {
                    // Create new rule
                    const oBinding = oModel.bindList("/ScoringRules");

                    oBinding.create({
                        jobPosting_ID: sJobId,
                        name: oRuleData.name,
                        field: oRuleData.field,
                        operator: oRuleData.operator,
                        value: oRuleData.value,
                        weight: oRuleData.weight,
                        description: oRuleData.description,
                        isActive: true
                    });

                    await oModel.submitBatch("updateGroup");

                    this._oRuleBuilderDialog.close();
                    this.showSuccess("Rule created successfully");
                }

                // Refresh rules table
                const oTable = this.byId("scoringRulesTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }
            } catch (oError) {
                this.handleError(oError);
            } finally {
                this.setBusy(false);
            }
        },

        onCancelRule: function () {
            this._oRuleBuilderDialog.close();
        },

        /**
         * Handle load rule template
         */
        onLoadRuleTemplate: async function () {
            try {
                const oModel = this.getModel();
                const oBinding = oModel.bindList("/getRuleTemplates(...)");
                oBinding.setParameter("category", null);
                oBinding.setParameter("isGlobal", true);

                const aTemplates = await oBinding.requestContexts();
                const aTemplateData = aTemplates.map(ctx => ctx.getObject());

                if (aTemplateData.length === 0) {
                    this.showInfo("No templates available");
                    return;
                }

                // Show template selection dialog (simplified for now)
                this.showInfo(`Found ${aTemplateData.length} templates`);
                // TODO: Show template selection dialog
            } catch (error) {
                this.handleError(error);
            }
        },

        /**
         * Handle strategy change
         */
        onStrategyChange: async function (oEvent) {
            const sStrategy = oEvent.getParameter("item").getKey();
            const oContext = this.getView().getBindingContext();

            try {
                // Update the property directly on the context
                oContext.setProperty("scoringStrategy", sStrategy);

                // Submit the changes
                await this.getModel().submitBatch("updateGroup");

                this.showSuccess("Execution strategy updated");
            } catch (error) {
                this.handleError(error);
            }
        },

        /**
         * Handle ML weight change
         */
        onMLWeightChange: async function (oEvent) {
            const fValue = oEvent.getParameter("value");
            const oContext = this.getView().getBindingContext();

            try {
                // Update the property directly on the context
                oContext.setProperty("mlWeight", fValue / 100); // Convert percentage to decimal

                // Submit the changes
                await this.getModel().submitBatch("updateGroup");

                this.showSuccess(`ML weight set to ${fValue}%`);
            } catch (error) {
                this.handleError(error);
            }
        },

        /**
         * Handle toggle rule active status
         */
        onToggleRuleActive: async function (oEvent) {
            const bActive = oEvent.getParameter("state");
            const oItem = oEvent.getSource().getParent();
            const oContext = oItem.getBindingContext();
            const sRuleId = oContext.getProperty("ID");

            try {
                const oModel = this.getModel();
                const sAction = bActive ? "activate" : "deactivate";
                const oActionContext = oModel.bindContext(`/ScoringRules(${sRuleId})/${sAction}(...)`);

                await oActionContext.execute();

                this.showSuccess(`Rule ${bActive ? "activated" : "deactivated"}`);

                // Refresh rules table
                oContext.getBinding().refresh();
            } catch (error) {
                this.handleError(error);
            }
        },

        /**
         * Handle delete rule
         */
        onDeleteRule: async function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oContext = oItem.getBindingContext();
            const sRuleId = oContext.getProperty("ID");

            try {
                await oContext.delete();
                this.showSuccess("Rule deleted");
            } catch (error) {
                this.handleError(error);
            }
        },

        /**
         * Handle edit rule
         */
        onEditRule: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) {
                this.showError("No rule selected");
                return;
            }

            const oRuleData = oContext.getObject();

            // Create rule builder model with existing data
            const oRuleModel = new sap.ui.model.json.JSONModel({
                isEdit: true,
                ruleId: oRuleData.ID,
                name: oRuleData.name,
                field: oRuleData.field,
                operator: oRuleData.operator,
                value: oRuleData.value,
                weight: oRuleData.weight,
                description: oRuleData.description
            });
            this.setModel(oRuleModel, "ruleBuilder");

            this._openRuleBuilderDialog();
        },

        /**
         * Handle test rule
         */
        onTestRule: async function (oEvent) {
            const oItem = oEvent.getSource().getParent();
            const oContext = oItem.getBindingContext();
            const sRuleId = oContext.getProperty("ID");

            try {
                const oModel = this.getModel();
                const sJobId = this.getView().getBindingContext().getProperty("ID");

                // Get first candidate for testing
                const oCandidatesBinding = oModel.bindList("/Candidates", null, null, null, {
                    $top: 1
                });
                const aCandidates = await oCandidatesBinding.requestContexts();

                if (aCandidates.length === 0) {
                    this.showInfo("No candidates available for testing");
                    return;
                }

                const oCandidate = aCandidates[0].getObject();

                // Call testRule action
                const oActionContext = oModel.bindContext(`/ScoringRules(${sRuleId})/testRule(...)`);
                oActionContext.setParameter("candidateData", JSON.stringify(oCandidate));
                oActionContext.setParameter("jobData", JSON.stringify(this.getView().getBindingContext().getObject()));

                const oResult = await oActionContext.execute();
                const oResultData = oResult.getObject();

                this.showSuccess(
                    `Test Result:\n` +
                    `Would Match: ${oResultData.wouldMatch}\n` +
                    `Before Score: ${oResultData.beforeScore}\n` +
                    `After Score: ${oResultData.afterScore}\n` +
                    `Action: ${oResultData.actionResult}`
                );
            } catch (error) {
                this.handleError(error);
            }
        },

        /**
         * Handle dry-run matching
         */
        onDryRunMatching: async function () {
            const sJobId = this.getView().getBindingContext().getProperty("ID");

            this.setBusy(true, "Running dry-run matching...");
            try {
                const oModel = this.getModel();
                const oBinding = oModel.bindList("/dryRunMatching(...)");
                oBinding.setParameter("jobPostingId", sJobId);
                oBinding.setParameter("candidateIds", null);
                oBinding.setParameter("testRules", []);

                const aResults = await oBinding.requestContexts();
                const aResultData = aResults.map(ctx => ctx.getObject());

                this.showSuccess(`Dry-run completed with ${aResultData.length} candidates tested`);
                // TODO: Show detailed results dialog
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle search rules
         */
        onSearchRules: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            const oTable = this.byId("scoringRulesTable");
            const oBinding = oTable.getBinding("items");

            if (!oBinding) return;

            const aFilters = [];
            if (sQuery) {
                aFilters.push(new sap.ui.model.Filter({
                    filters: [
                        new sap.ui.model.Filter("name", sap.ui.model.FilterOperator.Contains, sQuery),
                        new sap.ui.model.Filter("description", sap.ui.model.FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },

        /**
         * Handle export rules
         */
        onExportRules: async function () {
            try {
                const sJobId = this.getView().getBindingContext().getProperty("ID");
                const oModel = this.getModel();

                // Get all rules for this job
                const oBinding = oModel.bindList("/ScoringRules", null, null,
                    new sap.ui.model.Filter("jobPosting_ID", sap.ui.model.FilterOperator.EQ, sJobId));
                const aContexts = await oBinding.requestContexts();

                const aRules = aContexts.map(ctx => ({
                    name: ctx.getProperty("name"),
                    field: ctx.getProperty("field"),
                    operator: ctx.getProperty("operator"),
                    value: ctx.getProperty("value"),
                    weight: ctx.getProperty("weight"),
                    description: ctx.getProperty("description"),
                    isActive: ctx.getProperty("isActive")
                }));

                // Create and download JSON file
                const sContent = JSON.stringify({ rules: aRules, exportedAt: new Date().toISOString() }, null, 2);
                const oBlob = new Blob([sContent], { type: "application/json" });
                const sUrl = URL.createObjectURL(oBlob);

                const oLink = document.createElement("a");
                oLink.href = sUrl;
                oLink.download = `scoring-rules-${sJobId}.json`;
                oLink.click();

                URL.revokeObjectURL(sUrl);
                this.showSuccess(`Exported ${aRules.length} rules`);
            } catch (oError) {
                this.handleError(oError);
            }
        },

        /**
         * Handle import rules
         */
        onImportRules: function () {
            // Create file input
            const oFileInput = document.createElement("input");
            oFileInput.type = "file";
            oFileInput.accept = ".json";

            oFileInput.onchange = async (oEvent) => {
                const oFile = oEvent.target.files[0];
                if (!oFile) return;

                try {
                    const sContent = await oFile.text();
                    const oData = JSON.parse(sContent);

                    if (!oData.rules || !Array.isArray(oData.rules)) {
                        this.showError("Invalid rules file format");
                        return;
                    }

                    const sJobId = this.getView().getBindingContext().getProperty("ID");
                    const oModel = this.getModel();
                    const oBinding = oModel.bindList("/ScoringRules");

                    let importCount = 0;
                    for (const oRule of oData.rules) {
                        oBinding.create({
                            jobPosting_ID: sJobId,
                            name: oRule.name,
                            field: oRule.field,
                            operator: oRule.operator,
                            value: oRule.value,
                            weight: oRule.weight || 50,
                            description: oRule.description || "",
                            isActive: oRule.isActive !== false
                        });
                        importCount++;
                    }

                    await oModel.submitBatch("updateGroup");
                    this.showSuccess(`Imported ${importCount} rules`);

                    // Refresh rules table
                    const oTable = this.byId("scoringRulesTable");
                    if (oTable) {
                        oTable.getBinding("items").refresh();
                    }
                } catch (oError) {
                    this.showError("Failed to import rules: " + oError.message);
                }
            };

            oFileInput.click();
        },

        /**
         * Handle reset to default
         */
        onResetToDefault: async function () {
            const sJobId = this.getView().getBindingContext().getProperty("ID");

            try {
                const oModel = this.getModel();

                // Delete all custom rules
                const oRulesBinding = oModel.bindList("/ScoringRules", null, null,
                    new sap.ui.model.Filter("jobPosting_ID", sap.ui.model.FilterOperator.EQ, sJobId));

                const aRules = await oRulesBinding.requestContexts();

                for (const oContext of aRules) {
                    await oContext.delete();
                }

                // Reset scoring strategy and ML weight
                const oJobContext = this.getView().getBindingContext();
                oJobContext.setProperty("scoringTemplate_ID", null);
                oJobContext.setProperty("scoringStrategy", "PRIORITY");
                oJobContext.setProperty("mlWeight", 0.6);

                // Submit the changes
                await oModel.submitBatch("updateGroup");

                this.showSuccess("Scoring rules reset to default");
                this.getView().getModel().refresh();
            } catch (error) {
                this.handleError(error);
            }
        },

        /**
         * Format rule type to display state
         */
        formatRuleTypeState: function (sRuleType) {
            switch (sRuleType) {
                case "DISQUALIFY":
                case "PRE_FILTER":
                    return "Error";
                case "CATEGORY_BOOST":
                    return "Success";
                case "OVERALL_MODIFIER":
                    return "Warning";
                default:
                    return "None";
            }
        },

        /**
         * Format condition summary for display
         */
        formatConditionSummary: function (sConditions) {
            try {
                const oConditions = typeof sConditions === 'string' ? JSON.parse(sConditions) : sConditions;
                if (oConditions.field) {
                    return `${oConditions.field} ${oConditions.operator} ${oConditions.value}`;
                }
                return `${oConditions.operator} (${oConditions.conditions?.length || 0} conditions)`;
            } catch (e) {
                return "Invalid condition";
            }
        },

        /**
         * Format action summary for display
         */
        formatActionSummary: function (sActions) {
            try {
                const oActions = typeof sActions === 'string' ? JSON.parse(sActions) : sActions;
                if (oActions.type === "BOOST_CATEGORY") {
                    return `Boost ${oActions.category} by ${oActions.modifier?.value}${oActions.modifier?.type === 'PERCENTAGE' ? '%' : ' pts'}`;
                }
                if (oActions.type === "MODIFY_OVERALL") {
                    return `Modify overall by ${oActions.modifier?.value}${oActions.modifier?.type === 'PERCENTAGE' ? '%' : ' pts'}`;
                }
                return oActions.type;
            } catch (e) {
                return "Invalid action";
            }
        },

        /**
         * Format ML weight to percentage for display
         */
        formatMLWeightToPercent: function (fWeight) {
            return Math.round((fWeight || 0.6) * 100);
        }

    });
});
