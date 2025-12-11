sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, MessageBox, MessageToast, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("cv.sorting.cvupload.controller.Documents", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("documents").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._refreshList();
        },

        _refreshList: function () {
            var oTable = this.byId("idDocumentsTable");
            if (oTable) {
                var oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.refresh();
                }
            }
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("upload");
        },

        onNavigateToUpload: function () {
            this.getOwnerComponent().getRouter().navTo("upload");
        },

        onRefresh: function () {
            this._refreshList();
            MessageToast.show(this._getText("listRefreshed"));
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            var oTable = this.byId("idDocumentsTable");
            var oBinding = oTable.getBinding("items");
            var aFilters = [];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("fileName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            // Combine with status filter if active
            var sStatusKey = this.byId("idStatusFilter").getSelectedKey();
            if (sStatusKey && sStatusKey !== "all") {
                aFilters.push(new Filter("processingStatus", FilterOperator.EQ, sStatusKey));
            }

            oBinding.filter(aFilters);
        },

        onStatusFilterChange: function (oEvent) {
            var sKey = oEvent.getParameter("selectedItem").getKey();
            var oTable = this.byId("idDocumentsTable");
            var oBinding = oTable.getBinding("items");
            var aFilters = [];

            if (sKey && sKey !== "all") {
                aFilters.push(new Filter("processingStatus", FilterOperator.EQ, sKey));
            }

            // Combine with search filter if active
            var sSearchQuery = this.byId("idDocumentsSearch").getValue();
            if (sSearchQuery) {
                aFilters.push(new Filter("fileName", FilterOperator.Contains, sSearchQuery));
            }

            oBinding.filter(aFilters);
        },

        onDocumentSelect: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            if (oSelectedItem) {
                var oContext = oSelectedItem.getBindingContext();
                var sDocumentId = oContext.getProperty("ID");
                this.getOwnerComponent().getRouter().navTo("documentDetail", {
                    documentId: sDocumentId
                });
            }
        },

        onDocumentPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("documentDetail", {
                documentId: sDocumentId
            });
        },

        onReprocessDocument: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            var oModel = this.getView().getModel();

            MessageBox.confirm(this._getText("confirmReprocess"), {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        var oActionContext = oModel.bindContext("/Documents(" + sDocumentId + ")/CVProcessingService.reprocess(...)");
                        oActionContext.execute().then(function () {
                            MessageToast.show(this._getText("reprocessStarted"));
                            this._refreshList();
                        }.bind(this)).catch(function (oError) {
                            MessageBox.error(oError.message);
                        });
                    }
                }.bind(this)
            });
        },

        onDownloadDocument: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            var sFileName = oContext.getProperty("fileName");

            // Download via backend URL
            var sUrl = "/api/cv/Documents(" + sDocumentId + ")/fileContent";
            var oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = sFileName;
            oLink.click();
        },

        onDeleteDocument: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sFileName = oContext.getProperty("fileName");

            MessageBox.confirm(this._getText("confirmDelete", [sFileName]), {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        oContext.delete().then(function () {
                            MessageToast.show(this._getText("documentDeleted"));
                            this._refreshList();
                        }.bind(this)).catch(function (oError) {
                            MessageBox.error(oError.message);
                        });
                    }
                }.bind(this)
            });
        },

        _getText: function (sKey, aArgs) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            return oBundle.getText(sKey, aArgs);
        }
    });
});
