sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function(Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("cv.sorting.analytics.controller.SkillsAnalytics", {

        onInit: function() {
            // Initialize skills model
            var oSkillsModel = new JSONModel({
                isLoading: true,
                topSkills: [],
                emergingSkills: [],
                skillGaps: [],
                selectedView: "topSkills"
            });
            this.getView().setModel(oSkillsModel, "skills");

            // Load data when route is matched
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("skills").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function() {
            this._loadSkillsData();
        },

        /**
         * Loads skills analytics data from the service
         */
        _loadSkillsData: function() {
            var that = this;
            var oSkillsModel = this.getView().getModel("skills");
            oSkillsModel.setProperty("/isLoading", true);

            this._callAnalyticsFunction("getSkillAnalytics", { topN: 20 })
                .then(function(oData) {
                    // Process top skills with additional display properties
                    var aTopSkills = (oData.topSkills || []).map(function(oSkill, iIndex) {
                        var nRatio = oSkill.supplyDemandRatio || 0;
                        var sRatioState = "None";
                        if (nRatio > 1.5) sRatioState = "Success";
                        else if (nRatio < 0.8) sRatioState = "Error";
                        else if (nRatio < 1) sRatioState = "Warning";

                        return {
                            rank: iIndex + 1,
                            skillName: oSkill.skillName,
                            candidateCount: oSkill.candidateCount,
                            demandCount: oSkill.demandCount,
                            supplyDemandRatio: nRatio.toFixed(2),
                            ratioState: sRatioState,
                            ratioPercent: Math.min(nRatio * 50, 100)
                        };
                    });

                    // Process skill gaps
                    var aSkillGaps = (oData.skillGaps || []).map(function(oSkill) {
                        return {
                            skillName: oSkill.skillName,
                            supplyDemandRatio: oSkill.supplyDemandRatio.toFixed(2),
                            gapSeverity: oSkill.supplyDemandRatio < 0.5 ? "High" : "Medium",
                            gapState: oSkill.supplyDemandRatio < 0.5 ? "Error" : "Warning"
                        };
                    });

                    // Process emerging skills
                    var aEmergingSkills = (oData.emergingSkills || []).map(function(oSkill) {
                        return {
                            skillName: oSkill.skillName,
                            growthRate: oSkill.growthRate.toFixed(1) + "%",
                            trend: oSkill.growthRate > 10 ? "Up" : "Stable"
                        };
                    });

                    oSkillsModel.setData({
                        isLoading: false,
                        topSkills: aTopSkills,
                        emergingSkills: aEmergingSkills,
                        skillGaps: aSkillGaps,
                        selectedView: oSkillsModel.getProperty("/selectedView"),
                        summary: {
                            totalSkillsTracked: aTopSkills.length,
                            skillsInDemand: aSkillGaps.length,
                            emergingCount: aEmergingSkills.length
                        }
                    });
                })
                .catch(function(oError) {
                    console.error("Failed to load skills data:", oError);
                    oSkillsModel.setProperty("/isLoading", false);
                    var oBundle = that.getView().getModel("i18n").getResourceBundle();
                    MessageToast.show(oBundle.getText("msgFailedToLoad"));
                });
        },

        /**
         * Calls an analytics service function
         */
        _callAnalyticsFunction: function(sFunctionName, oParams) {
            var that = this;
            return new Promise(function(resolve, reject) {
                var oModel = that.getView().getModel();
                if (!oModel) {
                    reject(new Error("Analytics model not available"));
                    return;
                }

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
                oContextBinding.requestObject().then(resolve).catch(reject);
            });
        },

        /**
         * Handles view segment selection
         */
        onViewSelect: function(oEvent) {
            var sKey = oEvent.getParameter("key");
            this.getView().getModel("skills").setProperty("/selectedView", sKey);
        },

        /**
         * Refreshes skills data
         */
        onRefresh: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("msgRefreshing"));
            this._loadSkillsData();
        },

        /**
         * Navigates back to dashboard
         */
        onNavBack: function() {
            this.getOwnerComponent().getRouter().navTo("dashboard");
        }
    });
});
