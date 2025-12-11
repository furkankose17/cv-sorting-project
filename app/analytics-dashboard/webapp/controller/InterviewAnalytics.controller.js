sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("cv.sorting.analytics.controller.InterviewAnalytics", {

        onInit: function () {
            // Initialize interview data model
            var oInterviewModel = new JSONModel({
                totalScheduled: 0,
                completed: 0,
                cancelled: 0,
                noShow: 0,
                avgOverallRating: 0,
                avgTechnicalRating: 0,
                avgCommunicationRating: 0,
                avgCultureFitRating: 0,
                ratingsByType: [],
                upcomingCount: 0,
                completionRate: 0,
                upcomingInterviews: []
            });
            this.getView().setModel(oInterviewModel, "interviews");

            // Load data when view is displayed
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("interviews").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadInterviewAnalytics();
            this._loadUpcomingInterviews();
        },

        _loadInterviewAnalytics: function () {
            var oModel = this.getView().getModel();
            var oInterviewModel = this.getView().getModel("interviews");

            // Call the getInterviewAnalytics function
            var oContext = oModel.bindContext("/getInterviewAnalytics(...)");
            oContext.setParameter("fromDate", null);
            oContext.setParameter("toDate", null);

            oContext.execute().then(function () {
                var oResult = oContext.getBoundContext().getObject();
                if (oResult) {
                    oInterviewModel.setProperty("/totalScheduled", oResult.totalScheduled || 0);
                    oInterviewModel.setProperty("/completed", oResult.completed || 0);
                    oInterviewModel.setProperty("/cancelled", oResult.cancelled || 0);
                    oInterviewModel.setProperty("/noShow", oResult.noShow || 0);
                    oInterviewModel.setProperty("/avgOverallRating", oResult.avgOverallRating || 0);
                    oInterviewModel.setProperty("/avgTechnicalRating", oResult.avgTechnicalRating || 0);
                    oInterviewModel.setProperty("/avgCommunicationRating", oResult.avgCommunicationRating || 0);
                    oInterviewModel.setProperty("/avgCultureFitRating", oResult.avgCultureFitRating || 0);
                    oInterviewModel.setProperty("/ratingsByType", oResult.ratingsByType || []);
                    oInterviewModel.setProperty("/upcomingCount", oResult.upcomingCount || 0);
                    oInterviewModel.setProperty("/completionRate", oResult.completionRate || 0);
                }
            }.bind(this)).catch(function (oError) {
                console.error("Error loading interview analytics:", oError);
                MessageToast.show("Error loading interview analytics");
            });
        },

        _loadUpcomingInterviews: function () {
            var oModel = this.getView().getModel();
            var oInterviewModel = this.getView().getModel("interviews");

            // Call the getUpcomingInterviews function
            var oContext = oModel.bindContext("/getUpcomingInterviews(...)");
            oContext.setParameter("days", 14);
            oContext.setParameter("limit", 20);

            oContext.execute().then(function () {
                var oResult = oContext.getBoundContext().getObject();
                if (oResult && oResult.value) {
                    oInterviewModel.setProperty("/upcomingInterviews", oResult.value);
                } else if (Array.isArray(oResult)) {
                    oInterviewModel.setProperty("/upcomingInterviews", oResult);
                }
            }.bind(this)).catch(function (oError) {
                console.error("Error loading upcoming interviews:", oError);
            });
        },

        onRefresh: function () {
            this._loadInterviewAnalytics();
            this._loadUpcomingInterviews();
            MessageToast.show("Data refreshed");
        },

        onNavBack: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("dashboard");
        },

        onInterviewPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("interviews");
            if (oContext) {
                var sCandidateId = oContext.getProperty("candidateId");
                if (sCandidateId) {
                    // Navigate to candidate management app
                    var oCrossAppNav = sap.ushell && sap.ushell.Container &&
                        sap.ushell.Container.getService("CrossApplicationNavigation");
                    if (oCrossAppNav) {
                        oCrossAppNav.toExternal({
                            target: {
                                semanticObject: "Candidate",
                                action: "manage"
                            },
                            params: {
                                ID: sCandidateId
                            }
                        });
                    } else {
                        MessageToast.show("Candidate: " + oContext.getProperty("candidateName"));
                    }
                }
            }
        }
    });
});
