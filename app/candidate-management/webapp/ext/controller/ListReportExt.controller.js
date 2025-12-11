sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (ControllerExtension, Fragment, JSONModel, MessageBox, MessageToast) {
    "use strict";

    return ControllerExtension.extend("cv.sorting.candidatemanagement.ext.controller.ListReportExt", {

        // Private properties - Dialog instances
        _oStatusChangeDialog: null,
        _oDeleteConfirmDialog: null,
        _oAddSkillDialog: null,
        _oBulkStatusDialog: null,
        _oSimilarCandidatesDialog: null,
        _oAdvancedSearchDialog: null,
        _oScheduleInterviewDialog: null,
        _oInterviewFeedbackDialog: null,
        _oCandidateTimelineDialog: null,

        // Private properties - State
        _oDialogModel: null,
        _oSelectedContext: null,
        _aSelectedContexts: [],

        override: {
            /**
             * Called when the controller is instantiated
             */
            onInit: function () {
                // Initialize dialog model with default state
                this._oDialogModel = new JSONModel({
                    // Status change dialog
                    currentStatusCode: "",
                    currentStatusName: "",
                    newStatusCode: "",
                    reason: "",
                    candidateName: "",
                    deleteMessage: "",
                    CandidateStatuses: [],
                    isLoading: false,

                    // Add skill dialog
                    Skills: [],
                    selectedSkillId: "",
                    proficiencyLevel: "Intermediate",
                    yearsOfExperience: 0,

                    // Bulk status dialog
                    selectedCount: 0,
                    progress: 0,
                    progressText: "",
                    showProgress: false,

                    // Similar candidates dialog
                    similarCandidates: [],
                    selectedSimilarCount: 0,

                    // Advanced search dialog
                    query: "",
                    minExperience: null,
                    maxExperience: null,
                    location: "",
                    selectedStatuses: [],
                    selectedSkills: [],

                    // Schedule interview dialog
                    interviewTypes: [],
                    selectedInterviewType: "",
                    scheduledDate: null,
                    scheduledTime: null,
                    interviewerName: "",
                    interviewerEmail: "",
                    meetingLink: "",
                    interviewLocation: "",
                    interviewNotes: "",

                    // Interview feedback dialog
                    selectedInterviewId: "",
                    overallRating: 3,
                    technicalRating: 3,
                    communicationRating: 3,
                    cultureFitRating: 3,
                    feedback: "",
                    recommendation: "consider",
                    interviewCandidate: "",

                    // Candidate timeline dialog
                    timelineEvents: []
                });
            }
        },

        // ============================================
        // STATUS CHANGE FUNCTIONALITY
        // ============================================

        /**
         * Opens the status change dialog for single candidate
         * Called from annotation action
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onUpdateStatus: function (oEvent) {
            var oContext = this._getSelectedContext(oEvent);
            if (!oContext) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._oSelectedContext = oContext;
            var oCandidate = oContext.getObject();

            // Update dialog model with candidate data
            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                currentStatusCode: oCandidate.status_code || "",
                currentStatusName: oCandidate.status ? oCandidate.status.name : (oCandidate.status_code || ""),
                newStatusCode: "",
                reason: "",
                isLoading: true
            }));

            // Load statuses and open dialog
            this._loadCandidateStatuses().then(function () {
                this._loadDialog("StatusChangeDialog", "_oStatusChangeDialog").then(function (oDialog) {
                    oDialog.open();
                });
            }.bind(this));
        },

        /**
         * Confirms status change using bound action
         */
        onConfirmStatusChange: function () {
            var oData = this._oDialogModel.getData();
            var sNewStatus = oData.newStatusCode;
            var sCurrentStatus = oData.currentStatusCode;
            var sReason = oData.reason || "";

            // Validate new status is selected
            if (!sNewStatus) {
                MessageBox.warning(this._getText("dialogNewStatus") + " " + this._getText("RequiredField"));
                return;
            }

            // Validate status is different
            if (sNewStatus === sCurrentStatus) {
                MessageBox.warning(this._getText("msgStatusSameAsCurrent"));
                return;
            }

            // Set loading state
            this._oDialogModel.setProperty("/isLoading", true);

            // Call the bound action updateStatus
            var oModel = this.base.getView().getModel();
            var oOperation = oModel.bindContext("CandidateService.updateStatus(...)", this._oSelectedContext);
            oOperation.setParameter("newStatus", sNewStatus);
            oOperation.setParameter("notes", sReason);
            oOperation.setParameter("notifyCandidate", false);

            oOperation.execute().then(function () {
                MessageToast.show(this._getText("msgStatusChangeSuccess"));
                this._oDialogModel.setProperty("/isLoading", false);
                if (this._oStatusChangeDialog) {
                    this._oStatusChangeDialog.close();
                }
                // Refresh the context
                this._oSelectedContext.refresh();
            }.bind(this)).catch(function (oError) {
                console.error("Status change failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgStatusChangeError"));
            }.bind(this));
        },

        /**
         * Cancels status change dialog
         */
        onCancelStatusChange: function () {
            if (this._oStatusChangeDialog) {
                this._oStatusChangeDialog.close();
            }
        },

        // ============================================
        // ADD SKILL FUNCTIONALITY
        // ============================================

        /**
         * Opens the add skill dialog
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onAddSkill: function (oEvent) {
            var oContext = this._getSelectedContext(oEvent);
            if (!oContext) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._oSelectedContext = oContext;

            // Reset skill form
            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                selectedSkillId: "",
                proficiencyLevel: "Intermediate",
                yearsOfExperience: 0,
                isLoading: true
            }));

            // Load skills and open dialog
            this._loadSkills().then(function () {
                this._loadDialog("AddSkillDialog", "_oAddSkillDialog").then(function (oDialog) {
                    oDialog.open();
                });
            }.bind(this));
        },

        /**
         * Confirms adding skill using bound action
         */
        onConfirmAddSkill: function () {
            var oData = this._oDialogModel.getData();
            var sSkillId = oData.selectedSkillId;

            if (!sSkillId) {
                MessageBox.warning(this._getText("Skill") + " " + this._getText("RequiredField"));
                return;
            }

            this._oDialogModel.setProperty("/isLoading", true);

            // Call the bound action addSkill
            var oModel = this.base.getView().getModel();
            var oOperation = oModel.bindContext("CandidateService.addSkill(...)", this._oSelectedContext);
            oOperation.setParameter("skillId", sSkillId);
            oOperation.setParameter("proficiencyLevel", oData.proficiencyLevel);
            oOperation.setParameter("yearsOfExperience", parseFloat(oData.yearsOfExperience) || 0);

            oOperation.execute().then(function () {
                MessageToast.show(this._getText("msgSkillAdded"));
                this._oDialogModel.setProperty("/isLoading", false);
                if (this._oAddSkillDialog) {
                    this._oAddSkillDialog.close();
                }
                this._oSelectedContext.refresh();
            }.bind(this)).catch(function (oError) {
                console.error("Add skill failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgSkillAddError"));
            }.bind(this));
        },

        /**
         * Cancels add skill dialog
         */
        onCancelAddSkill: function () {
            if (this._oAddSkillDialog) {
                this._oAddSkillDialog.close();
            }
        },

        // ============================================
        // BULK STATUS CHANGE FUNCTIONALITY
        // ============================================

        /**
         * Opens bulk status change dialog
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onBulkStatusChange: function (oEvent) {
            var aContexts = this._getSelectedContexts(oEvent);
            if (!aContexts || aContexts.length === 0) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._aSelectedContexts = aContexts;

            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                selectedCount: aContexts.length,
                newStatusCode: "",
                reason: "",
                progress: 0,
                progressText: "",
                showProgress: false,
                isLoading: true
            }));

            this._loadCandidateStatuses().then(function () {
                this._loadDialog("BulkStatusDialog", "_oBulkStatusDialog").then(function (oDialog) {
                    oDialog.open();
                });
            }.bind(this));
        },

        /**
         * Confirms bulk status change using unbound action
         */
        onConfirmBulkStatusChange: function () {
            var oData = this._oDialogModel.getData();
            var sNewStatus = oData.newStatusCode;

            if (!sNewStatus) {
                MessageBox.warning(this._getText("dialogNewStatus") + " " + this._getText("RequiredField"));
                return;
            }

            this._oDialogModel.setProperty("/isLoading", true);
            this._oDialogModel.setProperty("/showProgress", true);

            // Get candidate IDs
            var aCandidateIds = this._aSelectedContexts.map(function (oCtx) {
                return oCtx.getObject().ID;
            });

            // Call the unbound action bulkUpdateStatus
            var oModel = this.base.getView().getModel();
            var oOperation = oModel.bindContext("/bulkUpdateStatus(...)");
            oOperation.setParameter("candidateIds", aCandidateIds);
            oOperation.setParameter("newStatus", sNewStatus);
            oOperation.setParameter("notes", oData.reason || "");

            oOperation.execute().then(function () {
                var oResultData = oOperation.getBoundContext().getObject();
                var iSuccess = oResultData.successCount || 0;
                var iFailed = oResultData.failedCount || 0;

                this._oDialogModel.setProperty("/isLoading", false);
                this._oDialogModel.setProperty("/showProgress", false);

                if (iFailed === 0) {
                    MessageToast.show(this._getText("msgBulkStatusSuccess", [iSuccess]));
                } else {
                    MessageBox.warning(this._getText("msgBulkStatusPartial", [iSuccess, iFailed]));
                }

                if (this._oBulkStatusDialog) {
                    this._oBulkStatusDialog.close();
                }

                // Refresh the model
                oModel.refresh();
            }.bind(this)).catch(function (oError) {
                console.error("Bulk status change failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                this._oDialogModel.setProperty("/showProgress", false);
                MessageBox.error(this._getText("msgBulkStatusError"));
            }.bind(this));
        },

        /**
         * Cancels bulk status dialog
         */
        onCancelBulkStatusChange: function () {
            if (this._oBulkStatusDialog) {
                this._oBulkStatusDialog.close();
            }
        },

        // ============================================
        // FIND SIMILAR CANDIDATES FUNCTIONALITY
        // ============================================

        /**
         * Opens the find similar candidates dialog
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onFindSimilar: function (oEvent) {
            var oContext = this._getSelectedContext(oEvent);
            if (!oContext) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._oSelectedContext = oContext;

            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                similarCandidates: [],
                selectedSimilarCount: 0,
                isLoading: true
            }));

            this._loadDialog("SimilarCandidatesDialog", "_oSimilarCandidatesDialog").then(function (oDialog) {
                oDialog.open();
                this._loadSimilarCandidates();
            }.bind(this));
        },

        /**
         * Loads similar candidates using function
         */
        _loadSimilarCandidates: function () {
            var sCandidateId = this._oSelectedContext.getObject().ID;
            var oModel = this.base.getView().getModel();

            var oOperation = oModel.bindContext("/findSimilarCandidates(...)");
            oOperation.setParameter("candidateId", sCandidateId);
            oOperation.setParameter("similarityFactors", ["skills", "experience", "location"]);
            oOperation.setParameter("limit", 10);

            oOperation.execute().then(function () {
                var aResults = oOperation.getBoundContext().getObject().value || [];
                this._oDialogModel.setProperty("/similarCandidates", aResults);
                this._oDialogModel.setProperty("/isLoading", false);
            }.bind(this)).catch(function (oError) {
                console.error("Find similar failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgFindSimilarError"));
            }.bind(this));
        },

        /**
         * Merges selected candidates
         */
        onMergeCandidates: function () {
            var oTable = this.base.getView().byId(this.base.getView().getId() + "--similarcandidatesdialog--similarCandidatesTable");
            if (!oTable) {
                return;
            }

            var aSelectedItems = oTable.getSelectedItems();
            if (aSelectedItems.length === 0) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            var sPrimaryId = this._oSelectedContext.getObject().ID;
            var aDuplicateIds = aSelectedItems.map(function (oItem) {
                return oItem.getBindingContext("dialog").getObject().candidateId;
            });

            this._oDialogModel.setProperty("/isLoading", true);

            var oModel = this.base.getView().getModel();
            var oOperation = oModel.bindContext("/mergeCandidates(...)");
            oOperation.setParameter("primaryId", sPrimaryId);
            oOperation.setParameter("duplicateIds", aDuplicateIds);
            oOperation.setParameter("mergeStrategy", "keep_primary");

            oOperation.execute().then(function () {
                MessageToast.show(this._getText("msgMergeSuccess"));
                this._oDialogModel.setProperty("/isLoading", false);
                if (this._oSimilarCandidatesDialog) {
                    this._oSimilarCandidatesDialog.close();
                }
                oModel.refresh();
            }.bind(this)).catch(function (oError) {
                console.error("Merge failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgMergeError"));
            }.bind(this));
        },

        /**
         * Closes similar candidates dialog
         */
        onCloseSimilarDialog: function () {
            if (this._oSimilarCandidatesDialog) {
                this._oSimilarCandidatesDialog.close();
            }
        },

        // ============================================
        // ADVANCED SEARCH FUNCTIONALITY
        // ============================================

        /**
         * Opens advanced search dialog
         */
        onAdvancedSearch: function () {
            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                query: "",
                minExperience: null,
                maxExperience: null,
                location: "",
                selectedStatuses: [],
                selectedSkills: [],
                isLoading: true
            }));

            Promise.all([
                this._loadCandidateStatuses(),
                this._loadSkills()
            ]).then(function () {
                this._loadDialog("AdvancedSearchDialog", "_oAdvancedSearchDialog").then(function (oDialog) {
                    oDialog.open();
                });
            }.bind(this));
        },

        /**
         * Executes advanced search
         */
        onExecuteAdvancedSearch: function () {
            var oData = this._oDialogModel.getData();
            this._oDialogModel.setProperty("/isLoading", true);

            var oModel = this.base.getView().getModel();
            var oOperation = oModel.bindContext("/searchCandidates(...)");

            if (oData.query) {
                oOperation.setParameter("query", oData.query);
            }
            if (oData.selectedSkills && oData.selectedSkills.length > 0) {
                oOperation.setParameter("skills", oData.selectedSkills);
            }
            if (oData.minExperience !== null && oData.minExperience !== "") {
                oOperation.setParameter("minExperience", parseFloat(oData.minExperience));
            }
            if (oData.maxExperience !== null && oData.maxExperience !== "") {
                oOperation.setParameter("maxExperience", parseFloat(oData.maxExperience));
            }
            if (oData.location) {
                oOperation.setParameter("locations", [oData.location]);
            }
            if (oData.selectedStatuses && oData.selectedStatuses.length > 0) {
                oOperation.setParameter("statuses", oData.selectedStatuses);
            }
            oOperation.setParameter("top", 100);
            oOperation.setParameter("skip", 0);

            oOperation.execute().then(function () {
                var aResults = oOperation.getBoundContext().getObject().value || [];
                this._oDialogModel.setProperty("/isLoading", false);
                MessageToast.show(this._getText("msgSearchComplete", [aResults.length]));

                // Close dialog - results shown in list
                if (this._oAdvancedSearchDialog) {
                    this._oAdvancedSearchDialog.close();
                }

                // Refresh model to show results
                oModel.refresh();
            }.bind(this)).catch(function (oError) {
                console.error("Search failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgSearchError"));
            }.bind(this));
        },

        /**
         * Clears advanced search form
         */
        onClearAdvancedSearch: function () {
            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                query: "",
                minExperience: null,
                maxExperience: null,
                location: "",
                selectedStatuses: [],
                selectedSkills: []
            }));
        },

        /**
         * Closes advanced search dialog
         */
        onCloseAdvancedSearch: function () {
            if (this._oAdvancedSearchDialog) {
                this._oAdvancedSearchDialog.close();
            }
        },

        // ============================================
        // DELETE FUNCTIONALITY
        // ============================================

        /**
         * Opens delete confirmation dialog
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onDeleteCandidate: function (oEvent) {
            var oContext = this._getSelectedContext(oEvent);
            if (!oContext) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._oSelectedContext = oContext;
            var oCandidate = oContext.getObject();

            var sCandidateName = oCandidate.fullName ||
                ((oCandidate.firstName || "") + " " + (oCandidate.lastName || "")).trim() ||
                this._getText("unknownCandidate");

            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                candidateName: sCandidateName,
                deleteMessage: this._getText("dialogDeleteMessage", [sCandidateName]),
                isLoading: false
            }));

            this._loadDialog("DeleteConfirmDialog", "_oDeleteConfirmDialog").then(function (oDialog) {
                oDialog.open();
            });
        },

        /**
         * Confirms deletion
         */
        onConfirmDelete: function () {
            if (!this._oSelectedContext) {
                return;
            }

            this._oDialogModel.setProperty("/isLoading", true);

            this._oSelectedContext.delete().then(function () {
                MessageToast.show(this._getText("msgDeleteSuccess"));
                this._oDialogModel.setProperty("/isLoading", false);
                if (this._oDeleteConfirmDialog) {
                    this._oDeleteConfirmDialog.close();
                }
            }.bind(this)).catch(function (oError) {
                console.error("Delete failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgDeleteError"));
            }.bind(this));
        },

        /**
         * Cancels delete dialog
         */
        onCancelDelete: function () {
            if (this._oDeleteConfirmDialog) {
                this._oDeleteConfirmDialog.close();
            }
        },

        // ============================================
        // INTERVIEW SCHEDULING FUNCTIONALITY
        // ============================================

        /**
         * Opens the schedule interview dialog
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onScheduleInterview: function (oEvent) {
            var oContext = this._getSelectedContext(oEvent);
            if (!oContext) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._oSelectedContext = oContext;
            var oCandidate = oContext.getObject();
            var sCandidateName = oCandidate.fullName ||
                ((oCandidate.firstName || "") + " " + (oCandidate.lastName || "")).trim();

            // Reset interview form - properties match ScheduleInterviewDialog.fragment.xml
            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                candidateName: sCandidateName,
                title: "",
                interviewTypeCode: "",
                InterviewTypes: [],
                scheduledAt: null,
                duration: 60,
                timezone: "UTC",
                interviewer: "",
                interviewerEmail: "",
                location: "",
                meetingLink: "",
                isLoading: true
            }));

            // Load interview types and open dialog
            this._loadInterviewTypes().then(function () {
                this._loadDialog("ScheduleInterviewDialog", "_oScheduleInterviewDialog").then(function (oDialog) {
                    oDialog.open();
                });
            }.bind(this));
        },

        /**
         * Handles interview type selection change
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onInterviewTypeChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                this._oDialogModel.setProperty("/interviewTypeCode", oSelectedItem.getKey());
            }
        },

        /**
         * Confirms scheduling interview
         */
        onConfirmScheduleInterview: function () {
            var oData = this._oDialogModel.getData();

            // Validate required fields
            if (!oData.title) {
                MessageBox.warning(this._getText("InterviewTitle") + " " + this._getText("RequiredField"));
                return;
            }
            if (!oData.interviewTypeCode) {
                MessageBox.warning(this._getText("InterviewType") + " " + this._getText("RequiredField"));
                return;
            }
            if (!oData.scheduledAt) {
                MessageBox.warning(this._getText("ScheduledAt") + " " + this._getText("RequiredField"));
                return;
            }
            if (!oData.interviewer) {
                MessageBox.warning(this._getText("Interviewer") + " " + this._getText("RequiredField"));
                return;
            }

            this._oDialogModel.setProperty("/isLoading", true);

            // Call the bound action scheduleInterview
            var oModel = this.base.getView().getModel();
            var oOperation = oModel.bindContext("CandidateService.scheduleInterview(...)", this._oSelectedContext);
            oOperation.setParameter("title", oData.title || "");
            oOperation.setParameter("interviewType", oData.interviewTypeCode);
            oOperation.setParameter("scheduledAt", oData.scheduledAt);
            oOperation.setParameter("duration", parseInt(oData.duration, 10) || 60);
            oOperation.setParameter("timezone", oData.timezone || "UTC");
            oOperation.setParameter("interviewer", oData.interviewer || "");
            oOperation.setParameter("interviewerEmail", oData.interviewerEmail || "");
            oOperation.setParameter("location", oData.location || "");
            oOperation.setParameter("meetingLink", oData.meetingLink || "");

            oOperation.execute().then(function () {
                MessageToast.show(this._getText("msgInterviewScheduled"));
                this._oDialogModel.setProperty("/isLoading", false);
                if (this._oScheduleInterviewDialog) {
                    this._oScheduleInterviewDialog.close();
                }
                this._oSelectedContext.refresh();
            }.bind(this)).catch(function (oError) {
                console.error("Schedule interview failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgInterviewScheduleError"));
            }.bind(this));
        },

        /**
         * Cancels schedule interview dialog
         */
        onCancelScheduleInterview: function () {
            if (this._oScheduleInterviewDialog) {
                this._oScheduleInterviewDialog.close();
            }
        },

        // ============================================
        // INTERVIEW FEEDBACK FUNCTIONALITY
        // ============================================

        /**
         * Opens the interview feedback dialog
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onSubmitFeedback: function (oEvent) {
            var oContext = this._getSelectedContext(oEvent);
            if (!oContext) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._oSelectedContext = oContext;
            var oCandidate = oContext.getObject();
            var sCandidateName = oCandidate.fullName ||
                ((oCandidate.firstName || "") + " " + (oCandidate.lastName || "")).trim();

            // Reset feedback form - properties match InterviewFeedbackDialog.fragment.xml
            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                interviewTitle: sCandidateName + " - Interview",
                candidateName: sCandidateName,
                selectedInterviewId: "",
                overallRating: 3,
                technicalRating: 3,
                communicationRating: 3,
                cultureFitRating: 3,
                feedback: "",
                strengths: "",
                areasOfImprovement: "",
                recommendation: "MAYBE",
                nextSteps: "",
                isLoading: true,
                candidateInterviews: []
            }));

            // Load candidate's interviews
            this._loadCandidateInterviews(oCandidate.ID).then(function () {
                this._loadDialog("InterviewFeedbackDialog", "_oInterviewFeedbackDialog").then(function (oDialog) {
                    oDialog.open();
                });
            }.bind(this));
        },

        /**
         * Loads interviews for a specific candidate
         * @param {string} sCandidateId - The candidate ID
         * @returns {Promise} Promise resolving when interviews are loaded
         */
        _loadCandidateInterviews: function (sCandidateId) {
            var that = this;
            var oModel = this.base.getView().getModel();

            return new Promise(function (resolve) {
                var sPath = "/Candidates(" + sCandidateId + ")/interviews";
                var oListBinding = oModel.bindList(sPath);

                oListBinding.requestContexts(0, 100).then(function (aContexts) {
                    var aInterviews = aContexts.map(function (oCtx) {
                        var oInterview = oCtx.getObject();
                        return {
                            ID: oInterview.ID,
                            type: oInterview.interviewType_code || "Interview",
                            scheduledAt: oInterview.scheduledAt,
                            status: oInterview.status_code || "scheduled",
                            displayText: (oInterview.interviewType_code || "Interview") + " - " +
                                new Date(oInterview.scheduledAt).toLocaleDateString()
                        };
                    }).filter(function (oInt) {
                        // Only show interviews that can receive feedback (completed or confirmed)
                        return ["confirmed", "completed"].indexOf(oInt.status) >= 0;
                    });

                    that._oDialogModel.setProperty("/candidateInterviews", aInterviews);
                    that._oDialogModel.setProperty("/isLoading", false);
                    resolve(aInterviews);
                }).catch(function (oError) {
                    console.error("Failed to load interviews:", oError);
                    that._oDialogModel.setProperty("/isLoading", false);
                    that._oDialogModel.setProperty("/candidateInterviews", []);
                    resolve([]);
                });
            });
        },

        /**
         * Confirms submitting interview feedback
         */
        onConfirmSubmitFeedback: function () {
            var oData = this._oDialogModel.getData();

            // Validate required fields
            if (!oData.selectedInterviewId || !oData.feedback) {
                MessageBox.warning(this._getText("msgFeedbackFieldsRequired"));
                return;
            }

            this._oDialogModel.setProperty("/isLoading", true);

            // Call the bound action submitFeedback
            var oModel = this.base.getView().getModel();
            var sInterviewPath = "/Interviews(" + oData.selectedInterviewId + ")";
            var oInterviewContext = oModel.bindContext(sInterviewPath).getBoundContext();

            var oOperation = oModel.bindContext("CandidateService.submitFeedback(...)", oInterviewContext);
            oOperation.setParameter("overallRating", parseInt(oData.overallRating, 10));
            oOperation.setParameter("technicalRating", parseInt(oData.technicalRating, 10));
            oOperation.setParameter("communicationRating", parseInt(oData.communicationRating, 10));
            oOperation.setParameter("cultureFitRating", parseInt(oData.cultureFitRating, 10));
            oOperation.setParameter("feedback", oData.feedback);
            oOperation.setParameter("recommendation", oData.recommendation);

            oOperation.execute().then(function () {
                MessageToast.show(this._getText("msgFeedbackSubmitted"));
                this._oDialogModel.setProperty("/isLoading", false);
                if (this._oInterviewFeedbackDialog) {
                    this._oInterviewFeedbackDialog.close();
                }
                this._oSelectedContext.refresh();
            }.bind(this)).catch(function (oError) {
                console.error("Submit feedback failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgFeedbackSubmitError"));
            }.bind(this));
        },

        /**
         * Cancels feedback dialog
         */
        onCancelFeedback: function () {
            if (this._oInterviewFeedbackDialog) {
                this._oInterviewFeedbackDialog.close();
            }
        },

        /**
         * Alias for onCancelFeedback (matches fragment button press handler)
         */
        onCancelSubmitFeedback: function () {
            this.onCancelFeedback();
        },

        // ============================================
        // CANDIDATE TIMELINE FUNCTIONALITY
        // ============================================

        /**
         * Shows candidate timeline
         * @param {sap.ui.base.Event} oEvent - The event object
         */
        onShowTimeline: function (oEvent) {
            var oContext = this._getSelectedContext(oEvent);
            if (!oContext) {
                MessageToast.show(this._getText("msgNoSelection"));
                return;
            }

            this._oSelectedContext = oContext;
            var oCandidate = oContext.getObject();
            var sCandidateName = oCandidate.fullName ||
                ((oCandidate.firstName || "") + " " + (oCandidate.lastName || "")).trim();

            // Properties match CandidateTimeline.fragment.xml
            this._oDialogModel.setData(Object.assign({}, this._oDialogModel.getData(), {
                candidateName: sCandidateName,
                timelineItems: [],
                isLoading: true
            }));

            this._loadDialog("CandidateTimeline", "_oCandidateTimelineDialog").then(function (oDialog) {
                oDialog.open();
                this._loadCandidateTimeline(oCandidate.ID);
            }.bind(this));
        },

        /**
         * Loads candidate timeline using function
         * @param {string} sCandidateId - The candidate ID
         */
        _loadCandidateTimeline: function (sCandidateId) {
            var oModel = this.base.getView().getModel();

            var oOperation = oModel.bindContext("/getCandidateTimeline(...)");
            oOperation.setParameter("candidateId", sCandidateId);
            oOperation.setParameter("includeNotes", true);
            oOperation.setParameter("includeInterviews", true);

            oOperation.execute().then(function () {
                var aEvents = oOperation.getBoundContext().getObject().value || [];

                // Map events to timeline format matching fragment bindings
                var aTimelineItems = aEvents.map(function (oEvent) {
                    return {
                        timestamp: oEvent.dateTime || oEvent.timestamp,
                        title: oEvent.title || oEvent.eventType,
                        description: oEvent.description || oEvent.details,
                        performedBy: oEvent.performedBy || "",
                        type: oEvent.eventType
                    };
                }.bind(this));

                // Set with name matching fragment binding {dialog>/timelineItems}
                this._oDialogModel.setProperty("/timelineItems", aTimelineItems);
                this._oDialogModel.setProperty("/isLoading", false);
            }.bind(this)).catch(function (oError) {
                console.error("Load timeline failed:", oError);
                this._oDialogModel.setProperty("/isLoading", false);
                MessageBox.error(this._getText("msgTimelineLoadError"));
            }.bind(this));
        },

        /**
         * Gets icon for timeline event type
         * @param {string} sEventType - The event type
         * @returns {string} The icon URI
         */
        _getTimelineIcon: function (sEventType) {
            var mIcons = {
                "status_change": "sap-icon://status-positive",
                "interview_scheduled": "sap-icon://appointment",
                "interview_completed": "sap-icon://complete",
                "note_added": "sap-icon://notes",
                "document_uploaded": "sap-icon://document",
                "skill_added": "sap-icon://add-product",
                "created": "sap-icon://create"
            };
            return mIcons[sEventType] || "sap-icon://activity-items";
        },

        /**
         * Closes timeline dialog
         */
        onCloseTimeline: function () {
            if (this._oCandidateTimelineDialog) {
                this._oCandidateTimelineDialog.close();
            }
        },

        /**
         * Alias for onCloseTimeline (matches fragment button press handler)
         */
        onCloseTimelineDialog: function () {
            this.onCloseTimeline();
        },

        // ============================================
        // HELPER METHODS
        // ============================================

        /**
         * Loads CandidateStatuses from the backend
         * @returns {Promise} Promise that resolves when statuses are loaded
         */
        _loadCandidateStatuses: function () {
            var that = this;
            var oModel = this.base.getView().getModel();

            return new Promise(function (resolve) {
                if (!oModel) {
                    that._oDialogModel.setProperty("/isLoading", false);
                    resolve([]);
                    return;
                }

                var oListBinding = oModel.bindList("/CandidateStatuses");
                oListBinding.requestContexts(0, 100).then(function (aContexts) {
                    var aStatuses = aContexts.map(function (oCtx) {
                        return oCtx.getObject();
                    });
                    that._oDialogModel.setProperty("/CandidateStatuses", aStatuses);
                    that._oDialogModel.setProperty("/isLoading", false);
                    resolve(aStatuses);
                }).catch(function (oError) {
                    console.error("Failed to load CandidateStatuses:", oError);
                    that._oDialogModel.setProperty("/isLoading", false);
                    // Use fallback statuses
                    that._oDialogModel.setProperty("/CandidateStatuses", [
                        { code: "NEW", name: "New" },
                        { code: "SCREENING", name: "Screening" },
                        { code: "INTERVIEWING", name: "Interviewing" },
                        { code: "SHORTLISTED", name: "Shortlisted" },
                        { code: "OFFERED", name: "Offered" },
                        { code: "HIRED", name: "Hired" },
                        { code: "REJECTED", name: "Rejected" },
                        { code: "WITHDRAWN", name: "Withdrawn" }
                    ]);
                    resolve([]);
                });
            });
        },

        /**
         * Loads InterviewTypes from the backend
         * @returns {Promise} Promise that resolves when types are loaded
         */
        _loadInterviewTypes: function () {
            var that = this;
            var oModel = this.base.getView().getModel();

            return new Promise(function (resolve) {
                if (!oModel) {
                    that._oDialogModel.setProperty("/isLoading", false);
                    resolve([]);
                    return;
                }

                var oListBinding = oModel.bindList("/InterviewTypes");
                oListBinding.requestContexts(0, 100).then(function (aContexts) {
                    var aTypes = aContexts.map(function (oCtx) {
                        return oCtx.getObject();
                    });
                    // Set with capital I to match fragment binding {dialog>/InterviewTypes}
                    that._oDialogModel.setProperty("/InterviewTypes", aTypes);
                    that._oDialogModel.setProperty("/isLoading", false);
                    resolve(aTypes);
                }).catch(function (oError) {
                    console.error("Failed to load InterviewTypes:", oError);
                    that._oDialogModel.setProperty("/isLoading", false);
                    // Use fallback types (capital I to match fragment)
                    that._oDialogModel.setProperty("/InterviewTypes", [
                        { code: "phone_screen", name: "Phone Screen" },
                        { code: "technical", name: "Technical Interview" },
                        { code: "behavioral", name: "Behavioral Interview" },
                        { code: "cultural_fit", name: "Cultural Fit" },
                        { code: "final_round", name: "Final Round" },
                        { code: "hr_interview", name: "HR Interview" }
                    ]);
                    resolve([]);
                });
            });
        },

        /**
         * Loads Skills from the backend
         * @returns {Promise} Promise that resolves when skills are loaded
         */
        _loadSkills: function () {
            var that = this;
            var oModel = this.base.getView().getModel();

            return new Promise(function (resolve) {
                if (!oModel) {
                    that._oDialogModel.setProperty("/isLoading", false);
                    resolve([]);
                    return;
                }

                var oListBinding = oModel.bindList("/Skills");
                oListBinding.requestContexts(0, 500).then(function (aContexts) {
                    var aSkills = aContexts.map(function (oCtx) {
                        return oCtx.getObject();
                    });
                    that._oDialogModel.setProperty("/Skills", aSkills);
                    that._oDialogModel.setProperty("/isLoading", false);
                    resolve(aSkills);
                }).catch(function (oError) {
                    console.error("Failed to load Skills:", oError);
                    that._oDialogModel.setProperty("/isLoading", false);
                    that._oDialogModel.setProperty("/Skills", []);
                    resolve([]);
                });
            });
        },

        /**
         * Generic dialog loader
         * @param {string} sFragmentName - The fragment name
         * @param {string} sDialogProp - The property name for the dialog instance
         * @returns {Promise} Promise resolving to the dialog
         */
        _loadDialog: function (sFragmentName, sDialogProp) {
            var oView = this.base.getView();
            var that = this;

            if (!this[sDialogProp]) {
                return Fragment.load({
                    id: oView.getId() + "--" + sFragmentName.toLowerCase(),
                    name: "cv.sorting.candidatemanagement.fragment." + sFragmentName,
                    controller: this
                }).then(function (oDialog) {
                    that[sDialogProp] = oDialog;
                    oView.addDependent(oDialog);
                    oDialog.setModel(that._oDialogModel, "dialog");
                    return oDialog;
                }).catch(function (oError) {
                    console.error("Failed to load " + sFragmentName + ":", oError);
                    MessageBox.error("Failed to load dialog. Please refresh the page.");
                    return Promise.reject(oError);
                });
            }

            return Promise.resolve(this[sDialogProp]);
        },

        /**
         * Gets the selected context from event or table selection
         * @param {sap.ui.base.Event} oEvent - The event object
         * @returns {sap.ui.model.odata.v4.Context} The selected context
         */
        _getSelectedContext: function (oEvent) {
            // Try to get context from event parameter (Fiori Elements action)
            if (oEvent && oEvent.getParameter) {
                var aContexts = oEvent.getParameter("contexts");
                if (aContexts && aContexts.length > 0) {
                    return aContexts[0];
                }
            }

            // Try to get from source binding context
            if (oEvent && oEvent.getSource) {
                var oSource = oEvent.getSource();
                if (oSource.getBindingContext) {
                    return oSource.getBindingContext();
                }
            }

            return null;
        },

        /**
         * Gets all selected contexts from table
         * @param {sap.ui.base.Event} oEvent - The event object
         * @returns {Array} Array of selected contexts
         */
        _getSelectedContexts: function (oEvent) {
            // Try to get contexts from event parameter
            if (oEvent && oEvent.getParameter) {
                var aContexts = oEvent.getParameter("contexts");
                if (aContexts && aContexts.length > 0) {
                    return aContexts;
                }
            }

            // Try to get from table selection
            var oTable = this._getTable();
            if (oTable) {
                return oTable.getSelectedContexts();
            }

            return [];
        },

        /**
         * Gets the main table control
         * @returns {sap.ui.table.Table|sap.m.Table} The table control
         */
        _getTable: function () {
            // Try standard Fiori Elements table ID pattern
            var oView = this.base.getView();
            var sTableId = oView.getId() + "--fe::table::Candidates::LineItem-innerTable";
            var oTable = oView.byId(sTableId);

            if (!oTable) {
                // Try alternative ID
                sTableId = oView.getId() + "--fe::table::Candidates::LineItem";
                oTable = oView.byId(sTableId);
            }

            return oTable;
        },

        /**
         * Gets text from i18n resource bundle
         * @param {string} sKey - The i18n key
         * @param {Array} [aArgs] - Optional arguments for formatting
         * @returns {string} The translated text
         */
        _getText: function (sKey, aArgs) {
            var oI18nModel = this.base.getView().getModel("i18n");
            if (!oI18nModel) {
                return sKey;
            }
            var oResourceBundle = oI18nModel.getResourceBundle();
            return oResourceBundle.getText(sKey, aArgs);
        }
    });
});
