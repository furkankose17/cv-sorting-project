sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("cvmanagement.controller.Upload", {

        onInit: function () {
            const viewModel = new JSONModel({
                uploadMode: "single",
                autoCreateThreshold: 85,
                documentLoaded: false,
                previewUrl: null,
                fileType: null,
                confidence: 0,
                tier1: {},
                tier2: {},
                batchFiles: [],
                batchStatus: "idle",
                batchTotal: 0,
                batchProcessed: 0,
                batchAutoCreated: 0,
                batchReviewRequired: 0,
                batchFailed: 0,
                currentQueueId: null
            });
            this.getView().setModel(viewModel, "view");
        },

        onFileChange: function (oEvent) {
            const file = oEvent.getParameter("files")[0];
            if (!file) return;

            MessageToast.show("Processing CV with OCR...");
            this._processFile(file);
        },

        _processFile: async function (file) {
            const viewModel = this.getView().getModel("view");

            try {
                // Read file as base64
                const fileContent = await this._readFileAsBase64(file);

                // Show preview
                if (file.type.startsWith("image/")) {
                    viewModel.setProperty("/previewUrl", URL.createObjectURL(file));
                    viewModel.setProperty("/fileType", "image");
                } else {
                    viewModel.setProperty("/fileType", "pdf");
                }

                // Call uploadAndProcessCV action
                const oModel = this.getView().getModel();
                const result = await this._callAction(oModel, "/uploadAndProcessCV", {
                    fileName: file.name,
                    fileContent: fileContent,
                    mediaType: file.type,
                    autoCreate: false
                });

                // Parse extracted data
                const extractedData = JSON.parse(result.extractedData);

                viewModel.setProperty("/documentLoaded", true);
                viewModel.setProperty("/confidence", result.confidence);
                viewModel.setProperty("/tier1", extractedData.tier1 || {});
                viewModel.setProperty("/tier2", extractedData.tier2 || {});
                viewModel.setProperty("/documentId", result.documentId);

                MessageToast.show(`OCR completed with ${result.confidence}% confidence`);

            } catch (error) {
                MessageBox.error("Failed to process CV: " + error.message);
            }
        },

        _readFileAsBase64: function (file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        },

        _callAction: function (oModel, sActionPath, oParameters) {
            return new Promise((resolve, reject) => {
                const oContext = oModel.bindContext(sActionPath);
                oContext.setParameter("fileName", oParameters.fileName);
                oContext.setParameter("fileContent", oParameters.fileContent);
                oContext.setParameter("mediaType", oParameters.mediaType);
                oContext.setParameter("autoCreate", oParameters.autoCreate);

                oContext.execute().then(function () {
                    const oResult = oContext.getBoundContext().getObject();
                    resolve(oResult);
                }).catch(function (oError) {
                    reject(oError);
                });
            });
        },

        _callBatchAction: function (oModel, sActionPath, oParameters) {
            return new Promise((resolve, reject) => {
                const oContext = oModel.bindContext(sActionPath);
                oContext.setParameter("files", oParameters.files);
                oContext.setParameter("autoCreateThreshold", oParameters.autoCreateThreshold);

                oContext.execute().then(function () {
                    const oResult = oContext.getBoundContext().getObject();
                    resolve(oResult);
                }).catch(function (oError) {
                    reject(oError);
                });
            });
        },

        _callFunction: function (oModel, sFunctionPath, oParameters) {
            return new Promise((resolve, reject) => {
                const oContext = oModel.bindContext(sFunctionPath);
                oContext.setParameter("queueId", oParameters.queueId);

                oContext.execute().then(function () {
                    const oResult = oContext.getBoundContext().getObject();
                    resolve(oResult);
                }).catch(function (oError) {
                    reject(oError);
                });
            });
        },

        onCreateCandidate: async function () {
            const viewModel = this.getView().getModel("view");
            const tier1 = viewModel.getProperty("/tier1");
            const documentId = viewModel.getProperty("/documentId");

            try {
                const oModel = this.getView().getModel();
                const oContext = oModel.bindContext("/reviewAndCreateCandidate");
                oContext.setParameter("documentId", documentId);
                oContext.setParameter("editedData", JSON.stringify({ tier1, tier2: {} }));

                await oContext.execute();
                const result = oContext.getBoundContext().getObject();

                MessageBox.success(
                    `Candidate created successfully! ID: ${result.candidateId}`,
                    {
                        onClose: () => {
                            this.onCancelUpload();
                        }
                    }
                );

            } catch (error) {
                MessageBox.error("Failed to create candidate: " + error.message);
            }
        },

        onCancelUpload: function () {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/documentLoaded", false);
            viewModel.setProperty("/tier1", {});
            viewModel.setProperty("/confidence", 0);

            const fileUploader = this.byId("fileUploader");
            if (fileUploader) {
                fileUploader.clear();
            }
        },

        onStartBatch: async function () {
            const viewModel = this.getView().getModel("view");
            const uploadSet = this.byId("batchUploadSet");
            const items = uploadSet.getItems();

            if (items.length === 0) {
                MessageBox.warning("Please select files to upload");
                return;
            }

            // Prepare files array
            const files = [];
            for (const item of items) {
                const file = item.getFileObject();
                const fileContent = await this._readFileAsBase64(file);
                files.push({
                    fileName: file.name,
                    fileContent: fileContent,
                    mediaType: file.type
                });
            }

            try {
                const oModel = this.getView().getModel();
                const result = await this._callBatchAction(oModel, "/uploadBatchCVs", {
                    files: files,
                    autoCreateThreshold: viewModel.getProperty("/autoCreateThreshold")
                });

                viewModel.setProperty("/batchStatus", "processing");
                viewModel.setProperty("/batchTotal", result.totalFiles);
                viewModel.setProperty("/currentQueueId", result.queueId);

                MessageToast.show(`Batch processing started (${result.totalFiles} files)`);

                // Start polling for progress
                this._pollBatchProgress(result.queueId);

            } catch (error) {
                MessageBox.error("Failed to start batch: " + error.message);
            }
        },

        _pollBatchProgress: function (queueId) {
            const viewModel = this.getView().getModel("view");

            this._pollInterval = setInterval(async () => {
                try {
                    const oModel = this.getView().getModel();
                    const progress = await this._callFunction(oModel, "/getBatchProgress", {
                        queueId: queueId
                    });

                    viewModel.setProperty("/batchProcessed", progress.processed);
                    viewModel.setProperty("/batchAutoCreated", progress.autoCreated);
                    viewModel.setProperty("/batchReviewRequired", progress.reviewRequired);
                    viewModel.setProperty("/batchFailed", progress.failed);

                    if (progress.status === "completed") {
                        clearInterval(this._pollInterval);
                        viewModel.setProperty("/batchStatus", "completed");
                        MessageToast.show("Batch processing completed!");
                    }
                } catch (error) {
                    clearInterval(this._pollInterval);
                    MessageBox.error("Failed to get progress: " + error.message);
                }
            }, 2000); // Poll every 2 seconds
        },

        onExit: function () {
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
            }
        }
    });
});
