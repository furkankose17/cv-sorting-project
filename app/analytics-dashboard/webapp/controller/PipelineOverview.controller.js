sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function(Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("cv.sorting.analytics.controller.PipelineOverview", {

        onInit: function() {
            // Initialize pipeline model
            var oPipelineModel = new JSONModel({
                isLoading: true,
                totalCandidates: 0,
                avgTimeToHire: 0,
                stages: [],
                bySource: [],
                conversionRates: {}
            });
            this.getView().setModel(oPipelineModel, "pipeline");

            // Load data when route is matched
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("pipeline").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function() {
            this._loadPipelineData();
        },

        /**
         * Loads pipeline overview data from the service
         */
        _loadPipelineData: function() {
            var that = this;
            var oPipelineModel = this.getView().getModel("pipeline");
            oPipelineModel.setProperty("/isLoading", true);

            this._callAnalyticsFunction("getPipelineOverview", {})
                .then(function(oData) {
                    // Process stages with visual properties
                    var aStages = (oData.byStatus || []).map(function(oStatus, iIndex) {
                        var sState = "None";
                        var sIcon = "sap-icon://workflow-tasks";
                        var sStatusLower = (oStatus.status || "").toLowerCase();

                        if (sStatusLower === "new") {
                            sState = "Information";
                            sIcon = "sap-icon://add-employee";
                        } else if (sStatusLower === "screening") {
                            sState = "Warning";
                            sIcon = "sap-icon://search";
                        } else if (sStatusLower === "interviewing") {
                            sState = "None";
                            sIcon = "sap-icon://discussion";
                        } else if (sStatusLower === "shortlisted") {
                            sState = "Success";
                            sIcon = "sap-icon://accept";
                        } else if (sStatusLower === "offered") {
                            sState = "Success";
                            sIcon = "sap-icon://document";
                        } else if (sStatusLower === "hired") {
                            sState = "Success";
                            sIcon = "sap-icon://employee-approvals";
                        } else if (sStatusLower === "rejected" || sStatusLower === "withdrawn") {
                            sState = "Error";
                            sIcon = "sap-icon://decline";
                        }

                        return {
                            status: oStatus.status,
                            count: oStatus.count || 0,
                            percentage: Math.round((oStatus.count / (oData.totalCandidates || 1)) * 100),
                            state: sState,
                            icon: sIcon,
                            order: iIndex
                        };
                    });

                    // Parse conversion rates
                    var oConversionRates = {};
                    try {
                        oConversionRates = JSON.parse(oData.conversionRates || "{}");
                    } catch (e) {
                        oConversionRates = oData.conversionRates || {};
                    }

                    // Build conversion rates array for display
                    var aConversionRates = Object.keys(oConversionRates).map(function(sKey) {
                        var aParts = sKey.split("_to_");
                        return {
                            from: aParts[0] ? aParts[0].charAt(0).toUpperCase() + aParts[0].slice(1) : "",
                            to: aParts[1] ? aParts[1].charAt(0).toUpperCase() + aParts[1].slice(1) : "",
                            rate: oConversionRates[sKey],
                            rateText: oConversionRates[sKey] + "%"
                        };
                    });

                    // Process source data
                    var aBySource = (oData.bySource || []).map(function(oSource) {
                        return {
                            source: oSource.source,
                            count: oSource.count,
                            percentage: Math.round((oSource.count / (oData.totalCandidates || 1)) * 100)
                        };
                    });

                    oPipelineModel.setData({
                        isLoading: false,
                        totalCandidates: oData.totalCandidates || 0,
                        avgTimeToHire: oData.avgTimeToHire || 0,
                        stages: aStages,
                        bySource: aBySource,
                        conversionRates: aConversionRates
                    });
                })
                .catch(function(oError) {
                    console.error("Failed to load pipeline data:", oError);
                    oPipelineModel.setProperty("/isLoading", false);
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
         * Handles stage item press - navigates to filtered candidate list
         */
        onStagePress: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("pipeline");
            if (oContext) {
                var sStatus = oContext.getProperty("status");
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                MessageToast.show(oBundle.getText("msgNavigateToStatus", [sStatus]));
            }
        },

        /**
         * Refreshes pipeline data
         */
        onRefresh: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("msgRefreshing"));
            this._loadPipelineData();
        },

        /**
         * Navigates back to dashboard
         */
        onNavBack: function() {
            this.getOwnerComponent().getRouter().navTo("dashboard");
        }
    });
});
