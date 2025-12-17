sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "../utils/MLServiceClient",
    "../model/formatter/DataFormatter",
    "../model/formatter/StatusFormatter",
    "../model/formatter/DisplayFormatter"
], function (BaseController, JSONModel, MLServiceClient,
             DataFormatter, StatusFormatter, DisplayFormatter) {
    "use strict";

    return BaseController.extend("cvmanagement.controller.CandidateDetail", {

        // Expose formatters for view binding
        DataFormatter: DataFormatter,
        StatusFormatter: StatusFormatter,
        DisplayFormatter: DisplayFormatter,

        onInit: function () {
            const oRouter = this.getRouter();
            oRouter.getRoute("candidateDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        /**
         * Handle route matched event
         * @param {sap.ui.base.Event} oEvent The route matched event
         * @private
         */
        _onRouteMatched: function (oEvent) {
            const sCandidateId = oEvent.getParameter("arguments").candidateId;

            // Bind the view to the candidate (using composite key for draft-enabled entity)
            this.getView().bindElement({
                path: "/Candidates(ID='" + sCandidateId + "',IsActiveEntity=true)",
                parameters: {
                    $expand: "status,country,skills($expand=skill),educations,experiences,interviews,matchResults($expand=jobPosting)"
                }
            });
        },

        /**
         * Navigate back to the main view
         */
        onNavBack: function () {
            this.navBack();
        },

        // ==================== Action Handlers ====================

        /**
         * Handle update status button press
         */
        onUpdateStatus: function () {
            const oContext = this.getView().getBindingContext();

            this.openDialog("dialogs/UpdateStatusDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("firstName") + " " + oContext.getProperty("lastName"),
                currentStatus: oContext.getProperty("status/name")
            });
        },

        /**
         * Handle add skill button press
         */
        onAddSkill: function () {
            const oContext = this.getView().getBindingContext();

            this.openDialog("dialogs/AddSkillDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("firstName") + " " + oContext.getProperty("lastName")
            });
        },

        /**
         * Handle show timeline button press
         */
        onShowTimeline: function () {
            const oContext = this.getView().getBindingContext();

            this.openDialog("dialogs/TimelineDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("firstName") + " " + oContext.getProperty("lastName")
            });
        },

        /**
         * Handle find similar button press
         */
        onFindSimilar: function () {
            const oContext = this.getView().getBindingContext();
            const sFirstName = oContext.getProperty("firstName");
            const sLastName = oContext.getProperty("lastName");

            this.openDialog("dialogs/FindSimilarDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: sFirstName + " " + sLastName,
                candidateInitials: this.formatInitials(sFirstName, sLastName),
                email: oContext.getProperty("email"),
                yearsOfExperience: oContext.getProperty("totalExperienceYears")
            });
        },

        /**
         * Handle delete candidate button press
         */
        onDeleteCandidate: function () {
            const oContext = this.getView().getBindingContext();

            this.openDialog("dialogs/DeleteConfirmDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("firstName") + " " + oContext.getProperty("lastName")
            });
        },

        /**
         * Handle remove skill button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onRemoveSkill: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sSkillId = oContext.getProperty("ID");

            this.confirmAction("Are you sure you want to remove this skill?").then(async (bConfirmed) => {
                if (bConfirmed) {
                    this.setBusy(true);
                    try {
                        // Delete the skill association
                        const oModel = this.getModel();
                        oModel.delete(oContext.getPath());
                        await oModel.submitBatch("candidateGroup");

                        this.showSuccess("Skill removed successfully");
                        this.getView().getBindingContext().refresh();
                    } catch (error) {
                        this.handleError(error);
                    } finally {
                        this.setBusy(false);
                    }
                }
            });
        },

        /**
         * Handle schedule interview button press
         */
        onScheduleInterview: function () {
            const oContext = this.getView().getBindingContext();

            this.openDialog("dialogs/ScheduleInterviewDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("firstName") + " " + oContext.getProperty("lastName")
            });
        },

        /**
         * Handle add interview feedback button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onAddInterviewFeedback: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();

            this.openDialog("dialogs/InterviewFeedbackDialog", {
                interviewId: oContext.getProperty("ID"),
                candidateId: this.getView().getBindingContext().getProperty("ID"),
                interviewType: oContext.getProperty("interviewType"),
                scheduledDate: oContext.getProperty("scheduledDate")
            });
        },

        /**
         * Handle match result press (navigate to job detail)
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onMatchResultPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext();
            const sJobId = oContext.getProperty("jobPosting/ID");

            this.getRouter().navTo("jobDetail", {
                jobId: sJobId
            });
        },

        /**
         * Handle view job button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onViewJob: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sJobId = oContext.getProperty("jobPosting/ID");

            this.getRouter().navTo("jobDetail", {
                jobId: sJobId
            });
        },

        // ==================== Dialog Confirm Handlers ====================

        /**
         * Handle update status dialog confirm
         */
        onConfirmUpdateStatus: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");
            const sNewStatus = oDialogModel.getProperty("/newStatus");
            const sNotes = oDialogModel.getProperty("/notes");
            const bNotify = oDialogModel.getProperty("/notifyCandidate");

            if (!sNewStatus) {
                this.showInfo("Please select a new status");
                return;
            }

            this.setBusy(true);
            try {
                // Call the updateStatus action
                await this.callAction("/Candidates(ID='" + sCandidateId + "',IsActiveEntity=true)/CVSortingService.updateStatus", {
                    newStatus: sNewStatus,
                    notes: sNotes || "",
                    notifyCandidate: bNotify || false
                });

                this.closeDialog();
                this.showSuccess("Status updated successfully");

                // Refresh the detail view
                this.getView().getBindingContext().refresh();
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle add skill dialog confirm
         */
        onConfirmAddSkill: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");
            const sSkillId = oDialogModel.getProperty("/skillId");
            const sProficiency = oDialogModel.getProperty("/proficiencyLevel");
            const nYears = oDialogModel.getProperty("/yearsOfExperience");

            if (!sSkillId) {
                this.showInfo("Please select a skill");
                return;
            }

            if (!sProficiency) {
                this.showInfo("Please select a proficiency level");
                return;
            }

            this.setBusy(true);
            try {
                // Call the addSkill action
                await this.callAction("/Candidates(ID='" + sCandidateId + "',IsActiveEntity=true)/CVSortingService.addSkill", {
                    skillId: sSkillId,
                    proficiencyLevel: sProficiency,
                    yearsOfExperience: nYears || 0
                });

                this.closeDialog();
                this.showSuccess("Skill added successfully");

                // Refresh the detail view
                this.getView().getBindingContext().refresh();
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle delete candidate dialog confirm
         */
        onConfirmDelete: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");

            this.setBusy(true);
            try {
                // Delete the candidate
                const oModel = this.getModel();
                const sPath = "/Candidates(ID='" + sCandidateId + "',IsActiveEntity=true)";
                oModel.delete(sPath);
                await oModel.submitBatch("candidateGroup");

                this.closeDialog();
                this.showSuccess("Candidate deleted successfully");

                // Navigate back to main
                this.navBack();
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle dialog cancel
         */
        onCancelDialog: function () {
            this.closeDialog();
        },

        // ==================== Advanced Dialog Handlers ====================

        /**
         * Handle find similar search
         */
        onFindSimilarSearch: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");
            const iMaxResults = oDialogModel.getProperty("/maxResults") || 10;

            const oFactors = {
                skills: oDialogModel.getProperty("/matchBySkills") || false,
                experience: oDialogModel.getProperty("/matchByExperience") || false,
                education: oDialogModel.getProperty("/matchByEducation") || false,
                location: oDialogModel.getProperty("/matchByLocation") || false
            };

            this.setBusy(true);
            try {
                const oResult = await MLServiceClient.findSimilarCandidates(sCandidateId, iMaxResults, oFactors);

                oDialogModel.setProperty("/similarCandidates", oResult.candidates);
                oDialogModel.setProperty("/resultsCount", oResult.candidates.length);
                oDialogModel.setProperty("/hasResults", true);

                if (oResult.mlUsed) {
                    oDialogModel.setProperty("/mlMessage", `Found ${oResult.candidates.length} similar candidates using AI`);
                    oDialogModel.setProperty("/mlMessageType", "Success");
                } else {
                    oDialogModel.setProperty("/mlMessage", oResult.message || "ML service unavailable");
                    oDialogModel.setProperty("/mlMessageType", "Warning");
                }
                oDialogModel.setProperty("/showMLMessage", true);
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle view similar candidate
         */
        onViewSimilarCandidate: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("dialogModel");
            const sCandidateId = oContext.getProperty("ID");

            this.closeDialog();
            this.getRouter().navTo("candidateDetail", {
                candidateId: sCandidateId
            });
        },

        /**
         * Handle schedule interview confirm
         */
        onConfirmScheduleInterview: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");

            // Validate required fields
            if (!oDialogModel.getProperty("/interviewType")) {
                this.showInfo("Please select an interview type");
                return;
            }
            if (!oDialogModel.getProperty("/scheduledDate")) {
                this.showInfo("Please select a date and time");
                return;
            }

            this.setBusy(true);
            try {
                // Call scheduleInterview action
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/Candidates(ID='" + sCandidateId + "',IsActiveEntity=true)/CVSortingService.scheduleInterview");

                oContext.setParameter("interviewType", oDialogModel.getProperty("/interviewType"));
                oContext.setParameter("scheduledDate", oDialogModel.getProperty("/scheduledDate"));
                oContext.setParameter("duration", parseInt(oDialogModel.getProperty("/duration") || "60"));
                oContext.setParameter("interviewerName", oDialogModel.getProperty("/interviewerName"));
                oContext.setParameter("interviewerEmail", oDialogModel.getProperty("/interviewerEmail"));
                oContext.setParameter("meetingLink", oDialogModel.getProperty("/meetingLink"));
                oContext.setParameter("notes", oDialogModel.getProperty("/notes") || "");

                await oContext.execute();

                this.closeDialog();
                this.showSuccess("Interview scheduled successfully");

                // Refresh the detail view
                this.getView().getBindingContext().refresh();
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle interview feedback confirm
         */
        onConfirmInterviewFeedback: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sInterviewId = oDialogModel.getProperty("/interviewId");

            // Validate required fields
            if (!oDialogModel.getProperty("/overallRating")) {
                this.showInfo("Please provide an overall rating");
                return;
            }
            if (!oDialogModel.getProperty("/strengths")) {
                this.showInfo("Please describe the candidate's strengths");
                return;
            }

            this.setBusy(true);
            try {
                // Call submitFeedback action
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/Interviews(" + sInterviewId + ")/CandidateService.submitFeedback");

                oContext.setParameter("overallRating", oDialogModel.getProperty("/overallRating"));
                oContext.setParameter("technicalRating", oDialogModel.getProperty("/technicalRating") || 0);
                oContext.setParameter("communicationRating", oDialogModel.getProperty("/communicationRating") || 0);
                oContext.setParameter("cultureFitRating", oDialogModel.getProperty("/cultureFitRating") || 0);
                oContext.setParameter("strengths", oDialogModel.getProperty("/strengths"));
                oContext.setParameter("improvements", oDialogModel.getProperty("/improvements") || "");
                oContext.setParameter("nextSteps", oDialogModel.getProperty("/nextSteps") || "");
                oContext.setParameter("additionalComments", oDialogModel.getProperty("/additionalComments") || "");

                const iRecommendation = oDialogModel.getProperty("/recommendationIndex") || 2;
                const aRecommendations = ["strong_yes", "yes", "maybe", "no", "strong_no"];
                oContext.setParameter("recommendation", aRecommendations[iRecommendation]);

                await oContext.execute();

                this.closeDialog();
                this.showSuccess("Interview feedback submitted successfully");

                // Refresh the detail view
                this.getView().getBindingContext().refresh();
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Load timeline events
         */
        onRefreshTimeline: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");

            oDialogModel.setProperty("/isLoading", true);

            try {
                // Call getCandidateTimeline function
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/getCandidateTimeline(...)");
                oContext.setParameter("candidateId", sCandidateId);

                await oContext.execute();
                const oResult = oContext.getBoundContext().getObject();

                oDialogModel.setProperty("/timelineEvents", oResult.value || []);
            } catch (error) {
                this.handleError(error);
                oDialogModel.setProperty("/timelineEvents", []);
            } finally {
                oDialogModel.setProperty("/isLoading", false);
            }
        },

        /**
         * Handle timeline filter change
         */
        onTimelineFilterChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            this.getModel("dialogModel").setProperty("/selectedFilter", sKey);
        },

        /**
         * Handle timeline event details
         */
        onTimelineEventDetails: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("dialogModel");
            const sDetails = oContext.getProperty("details");

            sap.m.MessageBox.information(sDetails);
        },

        /**
         * Format timeline icon based on event type
         */
        formatTimelineIcon: function (sEventType) {
            const mIconMap = {
                "status": "sap-icon://status-in-process",
                "interview": "sap-icon://business-card",
                "document": "sap-icon://document",
                "note": "sap-icon://notes",
                "skill": "sap-icon://learning-assistant",
                "match": "sap-icon://match"
            };
            return mIconMap[sEventType] || "sap-icon://activity-individual";
        },

        /**
         * Format years of experience from work experience dates
         * @param {Date} startDate Start date
         * @param {Date} endDate End date
         * @param {boolean} isCurrent Is current job
         * @returns {string} Years of experience
         */
        formatYearsOfExperience: function (startDate, endDate, isCurrent) {
            if (!startDate) return "-";

            const start = new Date(startDate);
            const end = isCurrent ? new Date() : (endDate ? new Date(endDate) : new Date());

            const diffYears = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
            const years = Math.floor(diffYears);

            if (years < 1) {
                const months = Math.floor(diffYears * 12);
                return months + " months";
            }

            return years + " years";
        }

    });
});
