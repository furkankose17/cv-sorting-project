sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
    "use strict";

    return BaseController.extend("cvmanagement.controller.CVReview", {

        onInit: function () {
            // Initialize review model
            const oReviewModel = new JSONModel({
                documentId: null,
                fileName: "",
                fileType: "",
                previewUrl: "",
                pdfContent: "",
                confidence: 0,
                ocrMethod: "",
                processedAt: "",
                tier1: {
                    firstName: { value: "", confidence: 0 },
                    lastName: { value: "", confidence: 0 },
                    email: { value: "", confidence: 0 },
                    phone: { value: "", confidence: 0 },
                    location: { value: "", confidence: 0 }
                },
                rawSections: {
                    experience_section: "",
                    education_section: ""
                },
                zoom: 100
            });
            this.setModel(oReviewModel, "review");

            // Attach to route
            const oRouter = this.getRouter();
            oRouter.getRoute("cvReview").attachPatternMatched(this._onRouteMatched, this);
        },

        /**
         * Route matched handler
         * @param {object} oEvent Route matched event
         * @private
         */
        _onRouteMatched: async function (oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            const sDocumentId = oArgs.documentId;

            if (!sDocumentId) {
                this.showError("No document ID provided");
                this.onNavBack();
                return;
            }

            await this._loadDocumentData(sDocumentId);
        },

        /**
         * Load document and extracted data
         * @param {string} sDocumentId Document ID
         * @private
         */
        _loadDocumentData: async function (sDocumentId) {
            const oReviewModel = this.getModel("review");
            const oModel = this.getModel();

            try {
                this.getView().setBusy(true);

                // Read document with OData v4 API (GUID keys don't use quotes in v4)
                const sPath = `/CVDocuments(${sDocumentId})`;
                const oBinding = oModel.bindContext(sPath, null, {
                    $select: "ID,fileName,mediaType,fileContent,ocrConfidence,ocrMethod,ocrProcessedAt,structuredData,extractedText"
                });

                await oBinding.getBoundContext().requestObject();
                const oDocument = oBinding.getBoundContext().getObject();

                if (!oDocument) {
                    throw new Error("Document not found");
                }

                // Parse structured data
                const oStructuredData = oDocument.structuredData ? JSON.parse(oDocument.structuredData) : {};
                const oTier1 = oStructuredData.tier1 || {};
                const oRawSections = oStructuredData.raw_sections || {};

                // Determine file type
                const sMediaType = oDocument.mediaType || "";
                const sFileType = sMediaType.includes("pdf") ? "pdf" : "image";

                // Prepare preview content
                let sPreviewUrl = "";
                let sPdfContent = "";

                if (oDocument.fileContent) {
                    const sBase64Content = this._arrayBufferToBase64(oDocument.fileContent);

                    if (sFileType === "pdf") {
                        // Create PDF embed for preview
                        sPdfContent = `<embed src="data:application/pdf;base64,${sBase64Content}"
                                        type="application/pdf"
                                        width="100%"
                                        height="800px"
                                        style="border: none;" />`;
                    } else {
                        // Create image preview
                        sPreviewUrl = `data:${sMediaType};base64,${sBase64Content}`;
                    }
                }

                // Update review model
                oReviewModel.setData({
                    documentId: sDocumentId,
                    fileName: oDocument.fileName,
                    fileType: sFileType,
                    previewUrl: sPreviewUrl,
                    pdfContent: sPdfContent,
                    confidence: oDocument.ocrConfidence || 0,
                    ocrMethod: oDocument.ocrMethod || "RapidOCR",
                    processedAt: oDocument.ocrProcessedAt ? new Date(oDocument.ocrProcessedAt).toLocaleString() : "",
                    tier1: {
                        firstName: oTier1.firstName || { value: "", confidence: 0 },
                        lastName: oTier1.lastName || { value: "", confidence: 0 },
                        email: oTier1.email || { value: "", confidence: 0 },
                        phone: oTier1.phone || { value: "", confidence: 0 },
                        location: oTier1.location || { value: "", confidence: 0 }
                    },
                    rawSections: {
                        experience_section: oRawSections.experience_section || "",
                        education_section: oRawSections.education_section || ""
                    },
                    zoom: 100
                });

            } catch (error) {
                console.error("Failed to load document:", error);
                this.showError("Failed to load document data: " + error.message);
                this.onNavBack();
            } finally {
                this.getView().setBusy(false);
            }
        },

        /**
         * Convert ArrayBuffer to Base64
         * @param {ArrayBuffer} buffer Array buffer
         * @returns {string} Base64 string
         * @private
         */
        _arrayBufferToBase64: function (buffer) {
            let binary = '';
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        },

        /**
         * Navigate back
         */
        onNavBack: function () {
            this.getRouter().navTo("main", {}, true);
        },

        /**
         * Zoom in CV preview
         */
        onZoomIn: function () {
            const oReviewModel = this.getModel("review");
            const iCurrentZoom = oReviewModel.getProperty("/zoom");
            oReviewModel.setProperty("/zoom", Math.min(iCurrentZoom + 10, 200));
            this._applyZoom();
        },

        /**
         * Zoom out CV preview
         */
        onZoomOut: function () {
            const oReviewModel = this.getModel("review");
            const iCurrentZoom = oReviewModel.getProperty("/zoom");
            oReviewModel.setProperty("/zoom", Math.max(iCurrentZoom - 10, 50));
            this._applyZoom();
        },

        /**
         * Apply zoom to preview
         * @private
         */
        _applyZoom: function () {
            const oReviewModel = this.getModel("review");
            const iZoom = oReviewModel.getProperty("/zoom");
            const oImage = this.byId("cvPreviewImage");
            const oPdfScroll = this.byId("pdfPreviewScroll");

            if (oImage) {
                oImage.$().css("transform", `scale(${iZoom / 100})`);
            }
            if (oPdfScroll) {
                oPdfScroll.$().find("embed").css("transform", `scale(${iZoom / 100})`);
            }
        },

        /**
         * Download CV file
         */
        onDownloadCV: async function () {
            const oReviewModel = this.getModel("review");
            const sDocumentId = oReviewModel.getProperty("/documentId");
            const sFileName = oReviewModel.getProperty("/fileName");

            try {
                // Call backend to download file
                const sUrl = `${this.getModel().sServiceUrl}/CVDocuments('${sDocumentId}')/fileContent`;

                const oResponse = await fetch(sUrl, {
                    headers: {
                        "Accept": "application/octet-stream"
                    }
                });

                if (!oResponse.ok) {
                    throw new Error("Failed to download file");
                }

                const blob = await oResponse.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = sFileName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                MessageToast.show("File downloaded successfully");
            } catch (error) {
                console.error("Download failed:", error);
                this.showError("Failed to download file: " + error.message);
            }
        },

        /**
         * Discard and close
         */
        onDiscard: function () {
            MessageBox.confirm(
                "Are you sure you want to discard this review? No candidate will be created.",
                {
                    title: "Discard Review",
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this.onNavBack();
                        }
                    }
                }
            );
        },

        /**
         * Create candidate from reviewed data
         */
        onCreateCandidate: async function () {
            const oReviewModel = this.getModel("review");
            const oModel = this.getModel();

            // Validate required fields
            const sFirstName = oReviewModel.getProperty("/tier1/firstName/value");
            const sEmail = oReviewModel.getProperty("/tier1/email/value");

            if (!sFirstName || !sEmail) {
                this.showError("First Name and Email are required");
                return;
            }

            try {
                this.getView().setBusy(true);

                // Prepare edited data
                const oEditedData = {
                    tier1: {
                        firstName: oReviewModel.getProperty("/tier1/firstName"),
                        lastName: oReviewModel.getProperty("/tier1/lastName"),
                        email: oReviewModel.getProperty("/tier1/email"),
                        phone: oReviewModel.getProperty("/tier1/phone"),
                        location: oReviewModel.getProperty("/tier1/location")
                    },
                    tier2: {
                        workHistory: oReviewModel.getProperty("/rawSections/experience_section") ?
                            [{ description: oReviewModel.getProperty("/rawSections/experience_section") }] : [],
                        education: oReviewModel.getProperty("/rawSections/education_section") ?
                            [{ description: oReviewModel.getProperty("/rawSections/education_section") }] : []
                    }
                };

                // Call reviewAndCreateCandidate action (OData v4)
                const sDocumentId = oReviewModel.getProperty("/documentId");
                const oAction = oModel.bindContext(`/reviewAndCreateCandidate(...)`, null, {
                    documentId: sDocumentId,
                    editedData: JSON.stringify(oEditedData)
                });

                await oAction.execute();
                const oResult = oAction.getBoundContext().getObject();

                MessageBox.success(
                    `Candidate created successfully!\n\nLinked Skills: ${oResult.linkedSkillsCount}\nEmbedding Generated: ${oResult.embeddingGenerated ? 'Yes' : 'No'}`,
                    {
                        title: "Success",
                        onClose: () => {
                            // Navigate to candidate detail
                            this.getRouter().navTo("main", {}, true);
                        }
                    }
                );

            } catch (error) {
                console.error("Failed to create candidate:", error);
                this.showError("Failed to create candidate: " + (error.message || "Unknown error"));
            } finally {
                this.getView().setBusy(false);
            }
        }
    });
});
