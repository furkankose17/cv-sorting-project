sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat"
], function(Controller, JSONModel, MessageToast, MessageBox, DateFormat) {
    "use strict";

    return Controller.extend("cv.sorting.analytics.controller.Dashboard", {

        onInit: function() {
            // Initialize dashboard model
            var oDashboardModel = new JSONModel({
                isLoading: true,
                pipelineData: {
                    totalCandidates: 0,
                    avgTimeToHire: 0,
                    byStatus: [],
                    bySource: []
                },
                skillsData: {
                    topSkills: []
                },
                jobsData: {
                    activeJobs: 0,
                    totalJobs: 0
                },
                matchingData: {
                    avgScore: 0,
                    totalMatches: 0
                },
                interviewData: {
                    totalScheduled: 0,
                    completed: 0,
                    upcomingCount: 0,
                    completionRate: 0,
                    avgOverallRating: 0
                },
                aiData: {
                    isLoading: false,
                    recommendations: [],
                    lastUpdated: null
                },
                dateFilter: {
                    fromDate: null,
                    toDate: null
                }
            });
            this.getView().setModel(oDashboardModel, "dashboard");

            // Load data from analytics service
            this._loadDashboardData();

            // Load AI insights after initial data load
            this._loadAIInsights();
        },

        /**
         * Loads all dashboard data from the analytics service
         */
        _loadDashboardData: function() {
            var that = this;
            var oDashboardModel = this.getView().getModel("dashboard");
            var oDateFilter = oDashboardModel.getProperty("/dateFilter");

            oDashboardModel.setProperty("/isLoading", true);

            // Build function parameters
            var sFromDate = oDateFilter.fromDate ? oDateFilter.fromDate.toISOString().split("T")[0] : null;
            var sToDate = oDateFilter.toDate ? oDateFilter.toDate.toISOString().split("T")[0] : null;

            // Load pipeline overview from analytics service
            this._callAnalyticsFunction("getPipelineOverview", {
                fromDate: sFromDate,
                toDate: sToDate
            }).then(function(oData) {
                that._processPipelineData(oData);
            }).catch(function(oError) {
                console.warn("Failed to load pipeline data, using fallback:", oError);
                that._loadFallbackPipelineData();
            });

            // Load skills analytics
            this._callAnalyticsFunction("getSkillAnalytics", {
                topN: 10
            }).then(function(oData) {
                that._processSkillsData(oData);
            }).catch(function(oError) {
                console.warn("Failed to load skills data, using fallback:", oError);
                that._loadFallbackSkillsData();
            });

            // Load matching data (from matching service if available)
            this._loadMatchingData();

            // Load interview analytics
            this._loadInterviewData();

            // Load jobs data
            this._loadJobsData();

            oDashboardModel.setProperty("/isLoading", false);
        },

        /**
         * Calls an analytics service function
         * @param {string} sFunctionName - The function name
         * @param {object} oParams - Function parameters
         * @returns {Promise} Promise resolving to function result
         */
        _callAnalyticsFunction: function(sFunctionName, oParams) {
            var that = this;
            return new Promise(function(resolve, reject) {
                var oModel = that.getView().getModel();
                if (!oModel) {
                    reject(new Error("Analytics model not available"));
                    return;
                }

                // Build parameter string
                var aParams = [];
                Object.keys(oParams || {}).forEach(function(sKey) {
                    var vValue = oParams[sKey];
                    if (vValue !== null && vValue !== undefined) {
                        if (typeof vValue === "string") {
                            aParams.push(sKey + "='" + vValue + "'");
                        } else {
                            aParams.push(sKey + "=" + vValue);
                        }
                    }
                });

                var sPath = "/" + sFunctionName + "(" + aParams.join(",") + ")";

                var oContextBinding = oModel.bindContext(sPath);
                oContextBinding.requestObject().then(function(oResult) {
                    resolve(oResult);
                }).catch(function(oError) {
                    reject(oError);
                });
            });
        },

        /**
         * Processes pipeline data from the service
         */
        _processPipelineData: function(oData) {
            var oDashboardModel = this.getView().getModel("dashboard");

            // Process byStatus array with state mapping
            var aByStatus = (oData.byStatus || []).map(function(oStatus) {
                var sState = "None";
                var sStatusLower = (oStatus.status || "").toLowerCase();
                if (sStatusLower === "new") sState = "Information";
                else if (sStatusLower === "screening") sState = "Warning";
                else if (["hired", "shortlisted", "offered"].includes(sStatusLower)) sState = "Success";
                else if (["rejected", "withdrawn"].includes(sStatusLower)) sState = "Error";

                return {
                    status: oStatus.status,
                    count: oStatus.count || 0,
                    percentage: Math.round((oStatus.count / (oData.totalCandidates || 1)) * 100),
                    state: sState
                };
            });

            oDashboardModel.setProperty("/pipelineData", {
                totalCandidates: oData.totalCandidates || 0,
                avgTimeToHire: oData.avgTimeToHire || 0,
                byStatus: aByStatus,
                bySource: oData.bySource || []
            });
        },

        /**
         * Processes skills data from the service
         */
        _processSkillsData: function(oData) {
            var oDashboardModel = this.getView().getModel("dashboard");

            var aTopSkills = (oData.topSkills || []).map(function(oSkill) {
                return {
                    skillName: oSkill.skillName || "Unknown",
                    candidateCount: oSkill.candidateCount || 0,
                    demandCount: oSkill.demandCount || 0,
                    ratio: (oSkill.supplyDemandRatio || 0).toFixed(2)
                };
            });

            oDashboardModel.setProperty("/skillsData", {
                topSkills: aTopSkills,
                emergingSkills: oData.emergingSkills || [],
                skillGaps: oData.skillGaps || []
            });
        },

        /**
         * Loads interview analytics data
         */
        _loadInterviewData: function() {
            var that = this;
            var oDashboardModel = this.getView().getModel("dashboard");

            this._callAnalyticsFunction("getInterviewAnalytics", {
                fromDate: null,
                toDate: null
            }).then(function(oData) {
                oDashboardModel.setProperty("/interviewData", {
                    totalScheduled: oData.totalScheduled || 0,
                    completed: oData.completed || 0,
                    upcomingCount: oData.upcomingCount || 0,
                    completionRate: oData.completionRate || 0,
                    avgOverallRating: oData.avgOverallRating || 0
                });
            }).catch(function(oError) {
                console.warn("Failed to load interview data:", oError);
                oDashboardModel.setProperty("/interviewData", {
                    totalScheduled: 0,
                    completed: 0,
                    upcomingCount: 0,
                    completionRate: 0,
                    avgOverallRating: 0
                });
            });
        },

        /**
         * Loads matching service data
         */
        _loadMatchingData: function() {
            var that = this;
            var oDashboardModel = this.getView().getModel("dashboard");
            var oMatchingModel = this.getView().getModel("matching");

            if (!oMatchingModel) {
                // Fallback if matching model not available
                oDashboardModel.setProperty("/matchingData", {
                    avgScore: 0,
                    totalMatches: 0
                });
                return;
            }

            // Try to get match statistics
            var oListBinding = oMatchingModel.bindList("/MatchResults");
            oListBinding.requestContexts(0, 1000).then(function(aContexts) {
                var nTotal = aContexts.length;
                var nTotalScore = 0;

                aContexts.forEach(function(oContext) {
                    nTotalScore += oContext.getProperty("overallScore") || 0;
                });

                oDashboardModel.setProperty("/matchingData", {
                    avgScore: nTotal > 0 ? Math.round(nTotalScore / nTotal) : 0,
                    totalMatches: nTotal
                });
            }).catch(function() {
                oDashboardModel.setProperty("/matchingData", {
                    avgScore: 0,
                    totalMatches: 0
                });
            });
        },

        /**
         * Loads jobs data from the candidate service
         */
        _loadJobsData: function() {
            var oDashboardModel = this.getView().getModel("dashboard");
            var oModel = this.getView().getModel();

            if (!oModel) {
                oDashboardModel.setProperty("/jobsData", {
                    activeJobs: 0,
                    totalJobs: 0
                });
                return;
            }

            // Try to load job postings data
            // First attempt: use analytics function if available
            this._callAnalyticsFunction("getRecruiterMetrics", {})
                .then(function(oData) {
                    oDashboardModel.setProperty("/jobsData", {
                        activeJobs: oData.activeJobPostings || 0,
                        totalJobs: oData.totalJobPostings || 0
                    });
                })
                .catch(function() {
                    // Fallback: try to count from JobPostings entity directly
                    var oListBinding = oModel.bindList("/JobPostings");
                    oListBinding.requestContexts(0, 1000).then(function(aContexts) {
                        var nTotal = aContexts.length;
                        var nActive = aContexts.filter(function(oCtx) {
                            var sStatus = oCtx.getProperty("status");
                            return sStatus === "published" || sStatus === "active";
                        }).length;

                        oDashboardModel.setProperty("/jobsData", {
                            activeJobs: nActive,
                            totalJobs: nTotal
                        });
                    }).catch(function() {
                        // Final fallback
                        oDashboardModel.setProperty("/jobsData", {
                            activeJobs: 0,
                            totalJobs: 0
                        });
                    });
                });
        },

        /**
         * Fallback pipeline data when service is unavailable
         */
        _loadFallbackPipelineData: function() {
            var oDashboardModel = this.getView().getModel("dashboard");
            oDashboardModel.setProperty("/pipelineData", {
                totalCandidates: 0,
                avgTimeToHire: 0,
                byStatus: [
                    { status: "New", count: 0, percentage: 0, state: "Information" },
                    { status: "Screening", count: 0, percentage: 0, state: "Warning" },
                    { status: "Interviewing", count: 0, percentage: 0, state: "None" },
                    { status: "Shortlisted", count: 0, percentage: 0, state: "Success" },
                    { status: "Offered", count: 0, percentage: 0, state: "Success" },
                    { status: "Hired", count: 0, percentage: 0, state: "Success" },
                    { status: "Rejected", count: 0, percentage: 0, state: "Error" }
                ],
                bySource: []
            });
        },

        /**
         * Fallback skills data when service is unavailable
         */
        _loadFallbackSkillsData: function() {
            var oDashboardModel = this.getView().getModel("dashboard");
            oDashboardModel.setProperty("/skillsData", {
                topSkills: [],
                emergingSkills: [],
                skillGaps: []
            });
        },

        /**
         * Handles refresh button click
         */
        onRefresh: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("msgRefreshing"));
            this._loadDashboardData();
        },

        /**
         * Exports dashboard data as CSV
         */
        onExportReport: function() {
            var oDashboardModel = this.getView().getModel("dashboard");
            var oPipelineData = oDashboardModel.getProperty("/pipelineData");
            var oSkillsData = oDashboardModel.getProperty("/skillsData");

            // Build CSV content
            var aLines = [];
            aLines.push("CV Sorting Analytics Report");
            aLines.push("Generated: " + new Date().toISOString());
            aLines.push("");

            // Pipeline summary
            aLines.push("PIPELINE SUMMARY");
            aLines.push("Total Candidates," + oPipelineData.totalCandidates);
            aLines.push("Average Time to Hire (days)," + oPipelineData.avgTimeToHire);
            aLines.push("");

            // Status breakdown
            aLines.push("STATUS BREAKDOWN");
            aLines.push("Status,Count,Percentage");
            (oPipelineData.byStatus || []).forEach(function(oStatus) {
                aLines.push(oStatus.status + "," + oStatus.count + "," + oStatus.percentage + "%");
            });
            aLines.push("");

            // Top skills
            aLines.push("TOP SKILLS");
            aLines.push("Skill,Candidates,Demand,Supply/Demand Ratio");
            (oSkillsData.topSkills || []).forEach(function(oSkill) {
                aLines.push(oSkill.skillName + "," + oSkill.candidateCount + "," + oSkill.demandCount + "," + oSkill.ratio);
            });

            // Create and download file
            var sContent = aLines.join("\n");
            var oBlob = new Blob([sContent], { type: "text/csv;charset=utf-8" });
            var sFilename = "analytics_report_" + new Date().toISOString().split("T")[0] + ".csv";

            // Trigger download
            var oLink = document.createElement("a");
            oLink.href = URL.createObjectURL(oBlob);
            oLink.download = sFilename;
            oLink.click();

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("msgReportExported", [sFilename]));
        },

        /**
         * Handles date range filter change
         */
        onDateRangeChange: function(oEvent) {
            var oDateRange = oEvent.getSource();
            var oFrom = oDateRange.getDateValue();
            var oTo = oDateRange.getSecondDateValue();

            var oDashboardModel = this.getView().getModel("dashboard");
            oDashboardModel.setProperty("/dateFilter/fromDate", oFrom);
            oDashboardModel.setProperty("/dateFilter/toDate", oTo);

            if (oFrom && oTo) {
                var oFormat = DateFormat.getDateInstance({ style: "medium" });
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                MessageToast.show(oBundle.getText("msgFiltering", [oFormat.format(oFrom), oFormat.format(oTo)]));
                this._loadDashboardData();
            } else if (!oFrom && !oTo) {
                // Cleared filter
                this._loadDashboardData();
            }
        },

        /**
         * Navigation handlers
         */
        onNavigateToSkills: function() {
            this.getOwnerComponent().getRouter().navTo("skills");
        },

        onNavigateToPipeline: function() {
            this.getOwnerComponent().getRouter().navTo("pipeline");
        },

        onNavigateToTrends: function() {
            this.getOwnerComponent().getRouter().navTo("trends");
        },

        onNavigateToInterviews: function() {
            this.getOwnerComponent().getRouter().navTo("interviews");
        },

        /**
         * Cross-app navigation to candidates filtered by status
         * @param {sap.ui.base.Event} oEvent - The press event
         */
        onStatusCardPress: function(oEvent) {
            var oSource = oEvent.getSource();
            var oBindingContext = oSource.getBindingContext("dashboard");
            var sStatus = oBindingContext ? oBindingContext.getProperty("status") : null;

            this._navigateToCandidates({ status: sStatus });
        },

        /**
         * Cross-app navigation to candidates (total count card)
         */
        onTotalCandidatesPress: function() {
            this._navigateToCandidates(null);
        },

        /**
         * Cross-app navigation to upload CV app
         */
        onUploadCVPress: function() {
            this._navigateToExternal("CVDocument", "upload", null);
        },

        /**
         * Navigate to candidate management app with optional filters
         * @param {object} oFilters - Filter parameters
         */
        _navigateToCandidates: function(oFilters) {
            var oParams = {};
            if (oFilters) {
                if (oFilters.status) {
                    oParams.status = oFilters.status;
                }
                if (oFilters.skill) {
                    oParams.skill = oFilters.skill;
                }
            }

            this._navigateToExternal("Candidate", "manage", oParams);
        },

        /**
         * Navigate to external app using CrossApplicationNavigation service
         * @param {string} sSemanticObject - The semantic object
         * @param {string} sAction - The action
         * @param {object} oParams - Navigation parameters
         */
        _navigateToExternal: function(sSemanticObject, sAction, oParams) {
            // Try to use FLP cross-app navigation
            if (sap.ushell && sap.ushell.Container) {
                var oCrossAppNav = sap.ushell.Container.getService("CrossApplicationNavigation");
                oCrossAppNav.toExternal({
                    target: {
                        semanticObject: sSemanticObject,
                        action: sAction
                    },
                    params: oParams || {}
                });
            } else {
                // Fallback for standalone mode - build URL based on semantic object
                var sUrl = this._buildFallbackUrl(sSemanticObject, sAction, oParams);
                if (sUrl) {
                    window.open(sUrl, "_blank");
                } else {
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                    MessageToast.show(oBundle.getText("msgNavNotAvailable"));
                }
            }
        },

        /**
         * Builds fallback URL for standalone navigation
         * @param {string} sSemanticObject - The semantic object
         * @param {string} sAction - The action
         * @param {object} oParams - Navigation parameters
         * @returns {string} The URL
         */
        _buildFallbackUrl: function(sSemanticObject, sAction, oParams) {
            var sBaseUrl = "";
            var sHash = "";

            // Map semantic objects to app URLs
            switch (sSemanticObject) {
                case "Candidate":
                    sBaseUrl = "/candidate-management/webapp/index.html";
                    if (oParams && oParams.status) {
                        sHash = "#?status=" + encodeURIComponent(oParams.status);
                    }
                    break;
                case "CVDocument":
                    sBaseUrl = "/cv-upload/webapp/index.html";
                    break;
                case "JobPosting":
                    sBaseUrl = "/job-postings/webapp/index.html";
                    break;
                default:
                    return null;
            }

            return sBaseUrl + sHash;
        },

        // ============================================
        // AI INSIGHTS FUNCTIONALITY
        // ============================================

        /**
         * Loads AI insights from the Joule service
         */
        _loadAIInsights: function() {
            var that = this;
            var oDashboardModel = this.getView().getModel("dashboard");
            var oJouleModel = this.getView().getModel("joule");

            oDashboardModel.setProperty("/aiData/isLoading", true);

            // If Joule model is not available, generate sample insights
            if (!oJouleModel) {
                this._generateSampleInsights();
                return;
            }

            // Call Joule service to get recommendations
            var oOperation = oJouleModel.bindContext("/getRecruitmentInsights(...)");
            oOperation.setParameter("context", "dashboard_overview");
            oOperation.setParameter("includeRecommendations", true);

            oOperation.execute().then(function() {
                var oResult = oOperation.getBoundContext().getObject();
                var aRecommendations = oResult.recommendations || [];

                oDashboardModel.setProperty("/aiData/recommendations", aRecommendations);
                oDashboardModel.setProperty("/aiData/lastUpdated", new Date());
                oDashboardModel.setProperty("/aiData/isLoading", false);
            }).catch(function(oError) {
                console.warn("Failed to load AI insights, using samples:", oError);
                that._generateSampleInsights();
            });
        },

        /**
         * Generates sample AI insights when service is unavailable
         */
        _generateSampleInsights: function() {
            var oDashboardModel = this.getView().getModel("dashboard");
            var oPipelineData = oDashboardModel.getProperty("/pipelineData") || {};
            var oSkillsData = oDashboardModel.getProperty("/skillsData") || {};

            var aRecommendations = [];

            // Generate insights based on current data
            if (oPipelineData.totalCandidates > 0) {
                var aByStatus = oPipelineData.byStatus || [];
                var oScreening = aByStatus.find(function(s) { return s.status === "Screening"; });
                var oNew = aByStatus.find(function(s) { return s.status === "New"; });

                if (oNew && oNew.count > 5) {
                    aRecommendations.push({
                        type: "pipeline",
                        title: "High volume of new candidates",
                        description: oNew.count + " candidates are awaiting initial screening. Consider prioritizing screening reviews to maintain pipeline velocity.",
                        priority: "Medium"
                    });
                }

                if (oScreening && oScreening.count > 10) {
                    aRecommendations.push({
                        type: "urgent",
                        title: "Screening backlog detected",
                        description: oScreening.count + " candidates in screening stage. Schedule batch review sessions to clear the backlog.",
                        priority: "High"
                    });
                }
            }

            // Skills-based recommendations
            if (oSkillsData.topSkills && oSkillsData.topSkills.length > 0) {
                var aHighDemand = oSkillsData.topSkills.filter(function(s) {
                    return s.ratio && s.ratio < 1;
                });

                if (aHighDemand.length > 0) {
                    aRecommendations.push({
                        type: "skill_gap",
                        title: "Skill gaps identified",
                        description: aHighDemand.length + " skills have more demand than supply. Consider expanding sourcing for: " +
                            aHighDemand.slice(0, 3).map(function(s) { return s.skillName; }).join(", "),
                        priority: "Medium"
                    });
                }
            }

            // Interview recommendations
            var oInterviewData = oDashboardModel.getProperty("/interviewData") || {};
            if (oInterviewData.upcomingCount > 5) {
                aRecommendations.push({
                    type: "candidate",
                    title: "Busy interview week ahead",
                    description: oInterviewData.upcomingCount + " interviews scheduled. Ensure all interviewers have received candidate profiles and evaluation criteria.",
                    priority: "Low"
                });
            }

            // Default recommendation if no insights generated
            if (aRecommendations.length === 0) {
                aRecommendations.push({
                    type: "pipeline",
                    title: "Pipeline health looks good",
                    description: "No immediate action items identified. Continue monitoring key metrics for any changes.",
                    priority: "Low"
                });
            }

            oDashboardModel.setProperty("/aiData/recommendations", aRecommendations);
            oDashboardModel.setProperty("/aiData/lastUpdated", new Date());
            oDashboardModel.setProperty("/aiData/isLoading", false);
        },

        /**
         * Refreshes AI insights
         */
        onRefreshAIInsights: function() {
            this._loadAIInsights();
        },

        /**
         * Opens Joule chat dialog for natural language queries
         */
        onAskJoule: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            // Simple implementation - could be extended with a proper chat dialog
            MessageBox.information(
                "Joule AI assistant is ready to help with recruitment insights.\n\n" +
                "Try asking questions like:\n" +
                "• 'What skills are most in demand?'\n" +
                "• 'Show me candidates for the Senior Developer role'\n" +
                "• 'What's causing delays in our hiring pipeline?'",
                {
                    title: oBundle.getText("askJoule"),
                    actions: [MessageBox.Action.OK],
                    emphasizedAction: MessageBox.Action.OK
                }
            );
        },

        /**
         * Generates new AI insights on demand
         */
        onGenerateAIInsights: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("msgRefreshing"));
            this._loadAIInsights();
        },

        /**
         * Handles click on AI recommendation item
         * @param {sap.ui.base.Event} oEvent - The press event
         */
        onAIRecommendationPress: function(oEvent) {
            var oSource = oEvent.getSource();
            var oBindingContext = oSource.getBindingContext("dashboard");
            var oRecommendation = oBindingContext ? oBindingContext.getObject() : null;

            if (!oRecommendation) {
                return;
            }

            // Navigate based on recommendation type
            switch (oRecommendation.type) {
                case "pipeline":
                    this.onNavigateToPipeline();
                    break;
                case "skill_gap":
                    this.onNavigateToSkills();
                    break;
                case "candidate":
                    this._navigateToCandidates(null);
                    break;
                case "urgent":
                    // Show details for urgent items
                    MessageBox.warning(oRecommendation.description, {
                        title: oRecommendation.title,
                        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                        emphasizedAction: MessageBox.Action.OK,
                        onClose: function(sAction) {
                            if (sAction === MessageBox.Action.OK) {
                                this.onNavigateToPipeline();
                            }
                        }.bind(this)
                    });
                    break;
                default:
                    MessageBox.information(oRecommendation.description, {
                        title: oRecommendation.title
                    });
            }
        }
    });
});
