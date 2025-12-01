sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("cv.sorting.cvupload.controller.Upload", {

        /**
         * Controller initialization
         */
        onInit: function () {
            // Initialize upload model
            var oUploadModel = new JSONModel({
                files: [],
                uploadProgress: 0,
                isProcessing: false
            });
            this.getView().setModel(oUploadModel, "upload");

            // Setup drag and drop
            this._setupDragAndDrop();
        },

        /**
         * Setup drag and drop functionality
         */
        _setupDragAndDrop: function () {
            var oDropZone = this.byId("dropZone");
            if (oDropZone) {
                var oDomRef = oDropZone.getDomRef();
                if (oDomRef) {
                    oDomRef.addEventListener("dragover", this._onDragOver.bind(this));
                    oDomRef.addEventListener("dragleave", this._onDragLeave.bind(this));
                    oDomRef.addEventListener("drop", this._onDrop.bind(this));
                }
            }
        },

        _onDragOver: function (oEvent) {
            oEvent.preventDefault();
            oEvent.stopPropagation();
            this.byId("dropZone").addStyleClass("dropZoneHighlight");
        },

        _onDragLeave: function (oEvent) {
            oEvent.preventDefault();
            oEvent.stopPropagation();
            this.byId("dropZone").removeStyleClass("dropZoneHighlight");
        },

        _onDrop: function (oEvent) {
            oEvent.preventDefault();
            oEvent.stopPropagation();
            this.byId("dropZone").removeStyleClass("dropZoneHighlight");

            var aFiles = oEvent.dataTransfer.files;
            this._addFiles(aFiles);
        },

        /**
         * Handle file selection change
         */
        onFileChange: function (oEvent) {
            var aFiles = oEvent.getParameter("files");
            this._addFiles(aFiles);
        },

        /**
         * Add files to the upload queue
         */
        _addFiles: function (aFiles) {
            var oUploadModel = this.getView().getModel("upload");
            var aCurrentFiles = oUploadModel.getProperty("/files");
            var aAllowedTypes = ["application/pdf", "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "image/png", "image/jpeg"];

            for (var i = 0; i < aFiles.length; i++) {
                var oFile = aFiles[i];

                // Validate file type
                if (!aAllowedTypes.includes(oFile.type)) {
                    MessageToast.show(this._getText("unsupportedFileType", [oFile.name]));
                    continue;
                }

                // Validate file size (max 10MB)
                if (oFile.size > 10 * 1024 * 1024) {
                    MessageToast.show(this._getText("fileTooLarge", [oFile.name]));
                    continue;
                }

                // Check for duplicates
                var bExists = aCurrentFiles.some(function (f) {
                    return f.name === oFile.name;
                });

                if (!bExists) {
                    aCurrentFiles.push({
                        name: oFile.name,
                        size: oFile.size,
                        formattedSize: this._formatFileSize(oFile.size),
                        type: oFile.type,
                        file: oFile,
                        icon: this._getFileIcon(oFile.type),
                        status: "Pending",
                        infoState: "None"
                    });
                }
            }

            oUploadModel.setProperty("/files", aCurrentFiles);
        },

        /**
         * Remove file from queue
         */
        onRemoveFile: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("upload");
            var sPath = oContext.getPath();
            var iIndex = parseInt(sPath.split("/").pop());

            var oUploadModel = this.getView().getModel("upload");
            var aFiles = oUploadModel.getProperty("/files");
            aFiles.splice(iIndex, 1);
            oUploadModel.setProperty("/files", aFiles);
        },

        /**
         * Handle upload button press
         */
        onUploadPress: function () {
            var oUploadModel = this.getView().getModel("upload");
            var aFiles = oUploadModel.getProperty("/files");

            if (aFiles.length === 0) {
                MessageToast.show(this._getText("noFilesSelected"));
                return;
            }

            // Start processing
            oUploadModel.setProperty("/isProcessing", true);
            oUploadModel.setProperty("/uploadProgress", 0);

            this._uploadFiles(aFiles);
        },

        /**
         * Upload files sequentially
         */
        _uploadFiles: async function (aFiles) {
            var oUploadModel = this.getView().getModel("upload");
            var oModel = this.getView().getModel();
            var iTotal = aFiles.length;
            var iProcessed = 0;
            var aResults = [];

            for (var i = 0; i < aFiles.length; i++) {
                var oFileData = aFiles[i];

                try {
                    // Update status
                    oFileData.status = "Uploading...";
                    oFileData.infoState = "Information";
                    oUploadModel.refresh();

                    // Read file as base64
                    var sBase64 = await this._readFileAsBase64(oFileData.file);

                    // Call upload action
                    var oActionContext = oModel.bindContext("/uploadDocument(...)");
                    oActionContext.setParameter("fileName", oFileData.name);
                    oActionContext.setParameter("fileContent", sBase64);
                    oActionContext.setParameter("fileType", oFileData.type);

                    await oActionContext.execute();
                    var oResult = oActionContext.getBoundContext().getObject();

                    if (oResult.status === "uploaded") {
                        // Trigger processing
                        oFileData.status = "Processing...";
                        oUploadModel.refresh();

                        var oProcessContext = oModel.bindContext("/processDocument(...)");
                        oProcessContext.setParameter("documentId", oResult.documentId);
                        await oProcessContext.execute();

                        oFileData.status = "Completed";
                        oFileData.infoState = "Success";
                        oFileData.documentId = oResult.documentId;
                        aResults.push({ success: true, file: oFileData.name });
                    } else {
                        oFileData.status = "Failed";
                        oFileData.infoState = "Error";
                        aResults.push({ success: false, file: oFileData.name, error: oResult.message });
                    }

                } catch (oError) {
                    oFileData.status = "Failed";
                    oFileData.infoState = "Error";
                    aResults.push({ success: false, file: oFileData.name, error: oError.message });
                }

                iProcessed++;
                oUploadModel.setProperty("/uploadProgress", Math.round((iProcessed / iTotal) * 100));
                oUploadModel.refresh();
            }

            // Processing complete
            oUploadModel.setProperty("/isProcessing", false);
            this._showUploadSummary(aResults);

            // Refresh documents list
            this.byId("recentUploadsTable").getBinding("items").refresh();
        },

        /**
         * Read file as base64
         */
        _readFileAsBase64: function (oFile) {
            return new Promise(function (resolve, reject) {
                var oReader = new FileReader();
                oReader.onload = function () {
                    var sBase64 = oReader.result.split(",")[1];
                    resolve(sBase64);
                };
                oReader.onerror = function (oError) {
                    reject(oError);
                };
                oReader.readAsDataURL(oFile);
            });
        },

        /**
         * Show upload summary dialog
         */
        _showUploadSummary: function (aResults) {
            var iSuccess = aResults.filter(function (r) { return r.success; }).length;
            var iFailed = aResults.filter(function (r) { return !r.success; }).length;

            var sMessage = this._getText("uploadSummary", [iSuccess, iFailed]);

            if (iFailed > 0) {
                var aErrors = aResults.filter(function (r) { return !r.success; });
                sMessage += "\n\n" + this._getText("failedFiles") + ":\n";
                aErrors.forEach(function (r) {
                    sMessage += "- " + r.file + ": " + r.error + "\n";
                });
            }

            MessageBox.information(sMessage, {
                title: this._getText("uploadComplete")
            });
        },

        /**
         * Navigate to documents list
         */
        onNavigateToDocuments: function () {
            this.getOwnerComponent().getRouter().navTo("documents");
        },

        /**
         * Handle document row press
         */
        onDocumentPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("documentDetail", {
                documentId: sDocumentId
            });
        },

        /**
         * Reprocess failed document
         */
        onReprocessDocument: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            var oModel = this.getView().getModel();

            MessageBox.confirm(this._getText("confirmReprocess"), {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        var oActionContext = oModel.bindContext("/reprocessDocument(...)");
                        oActionContext.setParameter("documentId", sDocumentId);
                        oActionContext.execute().then(function () {
                            MessageToast.show(this._getText("reprocessStarted"));
                            this.byId("recentUploadsTable").getBinding("items").refresh();
                        }.bind(this));
                    }
                }.bind(this)
            });
        },

        /**
         * View document details
         */
        onViewDocument: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sDocumentId = oContext.getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("documentDetail", {
                documentId: sDocumentId
            });
        },

        /**
         * Handle upload complete event
         */
        onUploadComplete: function (oEvent) {
            var sResponse = oEvent.getParameter("response");
            MessageToast.show("Upload complete: " + sResponse);
        },

        // Helper functions
        _getText: function (sKey, aArgs) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            return oBundle.getText(sKey, aArgs);
        },

        _formatFileSize: function (iBytes) {
            if (iBytes < 1024) return iBytes + " B";
            if (iBytes < 1024 * 1024) return (iBytes / 1024).toFixed(1) + " KB";
            return (iBytes / (1024 * 1024)).toFixed(1) + " MB";
        },

        _getFileIcon: function (sType) {
            switch (sType) {
                case "application/pdf":
                    return "sap-icon://pdf-attachment";
                case "application/msword":
                case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                    return "sap-icon://doc-attachment";
                case "image/png":
                case "image/jpeg":
                    return "sap-icon://picture";
                default:
                    return "sap-icon://document";
            }
        }
    });
});
