sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/format/DateFormat"
], function(Controller, JSONModel, MessageToast, DateFormat) {
    "use strict";

    return Controller.extend("cv.sorting.analytics.controller.Trends", {

        onInit: function() {
            // Initialize trends model
            var oTrendsModel = new JSONModel({
                isLoading: true,
                selectedMetric: "candidates",
                selectedPeriod: "month",
                trendData: [],
                metrics: [
                    { key: "candidates", text: "Total Candidates" },
                    { key: "hires", text: "Hires" },
                    { key: "avgScore", text: "Average Match Score" }
                ],
                periods: [
                    { key: "week", text: "Weekly" },
                    { key: "month", text: "Monthly" },
                    { key: "quarter", text: "Quarterly" }
                ]
            });
            this.getView().setModel(oTrendsModel, "trends");

            // Load data when route is matched
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("trends").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function() {
            this._loadTrendsData();
        },

        /**
         * Loads trends data from the service
         */
        _loadTrendsData: function() {
            var that = this;
            var oTrendsModel = this.getView().getModel("trends");
            var sMetric = oTrendsModel.getProperty("/selectedMetric");
            var sPeriod = oTrendsModel.getProperty("/selectedPeriod");

            oTrendsModel.setProperty("/isLoading", true);

            this._callAnalyticsFunction("getTrends", {
                metric: sMetric,
                period: sPeriod
            })
                .then(function(aData) {
                    var oDateFormat = DateFormat.getDateInstance({ style: "medium" });

                    // Process trend data
                    var aTrendData = (aData || []).map(function(oPoint, iIndex) {
                        var dDate = new Date(oPoint.periodStart);
                        var sChangeIcon = "sap-icon://trend-up";
                        var sChangeState = "Success";

                        if (oPoint.change < 0) {
                            sChangeIcon = "sap-icon://trend-down";
                            sChangeState = "Error";
                        } else if (oPoint.change === 0) {
                            sChangeIcon = "sap-icon://less";
                            sChangeState = "None";
                        }

                        return {
                            periodStart: oPoint.periodStart,
                            periodLabel: oDateFormat.format(dDate),
                            value: oPoint.value,
                            valueText: that._formatValue(oPoint.value, sMetric),
                            change: oPoint.change,
                            changeText: (oPoint.change >= 0 ? "+" : "") + oPoint.change.toFixed(1) + "%",
                            changeIcon: sChangeIcon,
                            changeState: sChangeState,
                            index: iIndex
                        };
                    });

                    // Calculate summary statistics
                    var nTotal = aTrendData.reduce(function(sum, item) { return sum + item.value; }, 0);
                    var nAvg = aTrendData.length > 0 ? nTotal / aTrendData.length : 0;
                    var nMax = aTrendData.length > 0 ? Math.max.apply(null, aTrendData.map(function(item) { return item.value; })) : 0;
                    var nMin = aTrendData.length > 0 ? Math.min.apply(null, aTrendData.map(function(item) { return item.value; })) : 0;

                    // Calculate overall trend
                    var nOverallChange = 0;
                    if (aTrendData.length >= 2) {
                        var nFirst = aTrendData[0].value;
                        var nLast = aTrendData[aTrendData.length - 1].value;
                        nOverallChange = nFirst > 0 ? ((nLast - nFirst) / nFirst) * 100 : 0;
                    }

                    oTrendsModel.setProperty("/trendData", aTrendData);
                    oTrendsModel.setProperty("/summary", {
                        average: that._formatValue(nAvg, sMetric),
                        max: that._formatValue(nMax, sMetric),
                        min: that._formatValue(nMin, sMetric),
                        overallChange: (nOverallChange >= 0 ? "+" : "") + nOverallChange.toFixed(1) + "%",
                        overallTrend: nOverallChange >= 0 ? "Up" : "Down",
                        overallState: nOverallChange >= 0 ? "Success" : "Error"
                    });
                    oTrendsModel.setProperty("/isLoading", false);
                })
                .catch(function(oError) {
                    console.error("Failed to load trends data:", oError);
                    oTrendsModel.setProperty("/isLoading", false);
                    oTrendsModel.setProperty("/trendData", []);
                    var oBundle = that.getView().getModel("i18n").getResourceBundle();
                    MessageToast.show(oBundle.getText("msgFailedToLoad"));
                });
        },

        /**
         * Formats a value based on the metric type
         */
        _formatValue: function(nValue, sMetric) {
            if (sMetric === "avgScore") {
                return nValue.toFixed(1) + "%";
            }
            return Math.round(nValue).toLocaleString();
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
         * Handles metric selection change
         */
        onMetricChange: function(oEvent) {
            var sKey = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("trends").setProperty("/selectedMetric", sKey);
            this._loadTrendsData();
        },

        /**
         * Handles period selection change
         */
        onPeriodChange: function(oEvent) {
            var sKey = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("trends").setProperty("/selectedPeriod", sKey);
            this._loadTrendsData();
        },

        /**
         * Refreshes trends data
         */
        onRefresh: function() {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("msgRefreshing"));
            this._loadTrendsData();
        },

        /**
         * Exports trends data as CSV
         */
        onExport: function() {
            var oTrendsModel = this.getView().getModel("trends");
            var aTrendData = oTrendsModel.getProperty("/trendData");
            var sMetric = oTrendsModel.getProperty("/selectedMetric");

            var aLines = ["Period,Value,Change"];
            aTrendData.forEach(function(oPoint) {
                aLines.push(oPoint.periodLabel + "," + oPoint.value + "," + oPoint.change + "%");
            });

            var sContent = aLines.join("\n");
            var oBlob = new Blob([sContent], { type: "text/csv;charset=utf-8" });
            var sFilename = "trends_" + sMetric + "_" + new Date().toISOString().split("T")[0] + ".csv";

            var oLink = document.createElement("a");
            oLink.href = URL.createObjectURL(oBlob);
            oLink.download = sFilename;
            oLink.click();

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oBundle.getText("msgExported", [sFilename]));
        },

        /**
         * Navigates back to dashboard
         */
        onNavBack: function() {
            this.getOwnerComponent().getRouter().navTo("dashboard");
        }
    });
});
