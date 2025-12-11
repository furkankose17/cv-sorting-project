sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Token"
], function (Controller, JSONModel, MessageBox, MessageToast, Token) {
    "use strict";

    return Controller.extend("cv.sorting.cvupload.controller.DocumentDetail", {

        onInit: function () {
            // Initialize extracted data model
            var oExtractedModel = new JSONModel({});
            this.getView().setModel(oExtractedModel, "extracted");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("documentDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var sDocumentId = oEvent.getParameter("arguments").documentId;
            this._loadDocument(sDocumentId);
        },

        _loadDocument: function (sDocumentId) {
            var oView = this.getView();
            var oModel = oView.getModel();

            // Bind the view to the document
            oView.bindElement({
                path: "/Documents(" + sDocumentId + ")",
                parameters: {
                    $expand: "candidate"
                },
                events: {
                    dataReceived: function (oEvent) {
                        var oData = oEvent.getParameter("data");
                        if (oData && oData.extractedData) {
                            this._parseExtractedData(oData.extractedData);
                        }
                    }.bind(this)
                }
            });
        },

        _parseExtractedData: function (sExtractedData) {
            try {
                var oExtractedData = JSON.parse(sExtractedData);
                var oExtractedModel = this.getView().getModel("extracted");
                oExtractedModel.setData(oExtractedData);

                // Render skills as tokens
                if (oExtractedData.skills && oExtractedData.skills.length > 0) {
                    this._renderSkills(oExtractedData.skills);
                }
            } catch (e) {
                console.error("Failed to parse extracted data:", e);
            }
        },

        _renderSkills: function (aSkills) {
            // Access skills box inside the fragment using fragment prefix
            var oSkillsBox = this.byId("idExtractedDataFragment--idSkillsHBox");
            if (oSkillsBox) {
                oSkillsBox.removeAllItems();
                aSkills.forEach(function (sSkill) {
                    oSkillsBox.addItem(new Token({
                        text: sSkill,
                        editable: false
                    }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom"));
                });
            }
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("documents");
        },

        onReprocessDocument: function () {
            var oContext = this.getView().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            var oModel = this.getView().getModel();

            MessageBox.confirm(this._getText("confirmReprocess"), {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        var oActionContext = oModel.bindContext("/Documents(" + sDocumentId + ")/CVProcessingService.reprocess(...)");
                        oActionContext.execute().then(function () {
                            MessageToast.show(this._getText("reprocessStarted"));
                            this._loadDocument(sDocumentId);
                        }.bind(this)).catch(function (oError) {
                            MessageBox.error(oError.message);
                        });
                    }
                }.bind(this)
            });
        },

        onDownloadDocument: function () {
            var oContext = this.getView().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            var sFileName = oContext.getProperty("fileName");

            // Get service URL from model metadata instead of hardcoding
            var sServiceUrl = this._getServiceUrl();
            var sUrl = sServiceUrl + "Documents(" + sDocumentId + ")/fileContent";

            var oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = sFileName;
            oLink.click();
        },

        onCreateCandidate: function () {
            var oContext = this.getView().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            var oModel = this.getView().getModel();

            MessageBox.confirm(this._getText("confirmCreateCandidate"), {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        var oActionContext = oModel.bindContext("/createCandidateFromDocument(...)");
                        oActionContext.setParameter("documentId", sDocumentId);
                        oActionContext.setParameter("autoLinkSkills", true);
                        oActionContext.execute().then(function () {
                            var oResult = oActionContext.getBoundContext().getObject();
                            MessageToast.show(this._getText("candidateCreated"));
                            // Refresh document to show linked candidate
                            this._loadDocument(sDocumentId);
                        }.bind(this)).catch(function (oError) {
                            MessageBox.error(oError.message);
                        });
                    }
                }.bind(this)
            });
        },

        onViewCandidate: function () {
            var oContext = this.getView().getBindingContext();
            var sCandidateId = oContext.getProperty("candidate_ID");

            if (sCandidateId) {
                // Try to use cross-application navigation if available (FLP)
                if (sap.ushell && sap.ushell.Container) {
                    var oCrossAppNav = sap.ushell.Container.getService("CrossApplicationNavigation");
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
                    // Fallback: Navigate to candidate-management app via relative URL
                    var sUrl = "/candidate-management/webapp/index.html#/Candidates(" + sCandidateId + ")";
                    window.open(sUrl, "_blank");
                }
            }
        },

        /**
         * Gets the service URL from the OData model
         * @returns {string} The service URL
         */
        _getServiceUrl: function () {
            var oModel = this.getView().getModel();
            if (oModel) {
                // For OData V4 model
                if (oModel.getServiceUrl) {
                    return oModel.getServiceUrl();
                }
                // Fallback: get from manifest
                var oComponent = this.getOwnerComponent();
                var oManifest = oComponent.getManifestEntry("sap.app");
                if (oManifest && oManifest.dataSources && oManifest.dataSources.cvService) {
                    return oManifest.dataSources.cvService.uri;
                }
            }
            // Last resort fallback
            return "/api/cv/";
        },

        _getText: function (sKey, aArgs) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            return oBundle.getText(sKey, aArgs);
        }
    });
});
