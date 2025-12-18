sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/ObjectStatus",
    "sap/m/Dialog",
    "sap/m/Input",
    "sap/m/Button"
], function (BaseController, JSONModel, MessageBox, MessageToast, ObjectStatus, Dialog, Input, Button) {
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
                tier2: {
                    workHistory: [],
                    education: [],
                    skills: []
                },
                rawSections: {
                    experience_section: "",
                    education_section: ""
                },
                ocrLines: [],  // Lines with bounding boxes for highlighting
                showHighlights: true,
                highlightedField: null,  // Currently highlighted field
                pdfDimensions: { width: 612, height: 792 },  // Default PDF dimensions (letter size)
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
                this.handleError("No document ID provided");
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
            const sServiceUrl = oModel.sServiceUrl;

            try {
                this.getView().setBusy(true);

                // Read document metadata with OData v4 API (including extractedData directly)
                const sPath = `/CVDocuments(ID=${sDocumentId},IsActiveEntity=true)`;
                const oBinding = oModel.bindContext(sPath, null, {
                    $select: "ID,fileName,mediaType,fileType,ocrConfidence,extractionMethod,processedAt,extractedData"
                });

                await oBinding.requestObject();
                const oDocument = oBinding.getBoundContext().getObject();

                if (!oDocument) {
                    throw new Error("Document not found");
                }

                // Parse extractedData from the document (stored as JSON string)
                const sBaseUrl = sServiceUrl.replace(/\/$/, '');
                let oExtractedData = {};
                try {
                    if (oDocument.extractedData) {
                        oExtractedData = typeof oDocument.extractedData === 'string'
                            ? JSON.parse(oDocument.extractedData)
                            : oDocument.extractedData;
                    }
                } catch (e) {
                    console.warn("Could not parse extractedData:", e);
                }

                // Build tier1 from flat extracted data or nested structure
                let oTier1 = {};
                if (oExtractedData.tier1) {
                    oTier1 = oExtractedData.tier1;
                } else {
                    // Flat structure from CSV - convert to tier1 format
                    oTier1 = {
                        firstName: { value: oExtractedData.firstName || "", confidence: 90 },
                        lastName: { value: oExtractedData.lastName || "", confidence: 90 },
                        email: { value: oExtractedData.email || "", confidence: 90 },
                        phone: { value: oExtractedData.phone || "", confidence: 85 },
                        location: { value: oExtractedData.location || "", confidence: 80 }
                    };
                }

                // Extract OCR lines with bounding boxes for highlighting
                const aOcrLines = oExtractedData.lines || [];

                // Extract preview image for highlighting overlay (from ML service)
                const sPreviewImageB64 = oExtractedData.preview_image || null;
                const oPreviewDimensions = oExtractedData.preview_dimensions || { width: 612, height: 792 };

                // Build raw sections from experiences and education arrays
                let sExperienceSection = "";
                let sEducationSection = "";
                if (oExtractedData.experiences && oExtractedData.experiences.length > 0) {
                    sExperienceSection = oExtractedData.experiences.map(exp =>
                        `${exp.jobTitle || ""} at ${exp.company || ""} (${exp.duration || ""})`
                    ).join("\n");
                }
                if (oExtractedData.education && oExtractedData.education.length > 0) {
                    sEducationSection = oExtractedData.education.map(edu =>
                        `${edu.degree || ""} - ${edu.institution || ""} (${edu.year || ""})`
                    ).join("\n");
                }
                const oRawSections = oExtractedData.raw_sections || {
                    experience_section: sExperienceSection,
                    education_section: sEducationSection
                };

                // Determine file type from mediaType or fileType field
                const sMediaType = oDocument.mediaType || oDocument.fileType || "";
                const sFileType = sMediaType.includes("pdf") ? "pdf" : "image";

                // Prepare preview content - use preview_image from ML service if available
                let sPreviewUrl = "";
                let sPdfContent = "";

                // If we have a preview image from OCR, use it (supports highlighting overlay)
                if (sPreviewImageB64) {
                    // Use the rendered page image for highlighting overlay
                    sPreviewUrl = `data:image/png;base64,${sPreviewImageB64}`;
                    sPdfContent = "";  // Don't use embed, use image for overlay support
                } else {
                    // Fallback: try to fetch fileContent
                    try {
                        const fileContentUrl = `${sBaseUrl}/CVDocuments(ID=${sDocumentId},IsActiveEntity=true)/fileContent`;
                        const fileContentResponse = await fetch(fileContentUrl);
                        // Check for actual content (not 204 No Content and has body)
                        if (fileContentResponse.ok && fileContentResponse.status !== 204) {
                            const fileBlob = await fileContentResponse.blob();
                            if (fileBlob.size > 0) {
                                const sBase64Content = await this._blobToBase64(fileBlob);

                                if (sFileType === "pdf") {
                                    // Create PDF embed for preview (no highlighting support)
                                    sPdfContent = `<embed src="data:application/pdf;base64,${sBase64Content}"
                                                    type="application/pdf"
                                                    width="100%"
                                                    height="800px"
                                                    style="border: none;" />`;
                                } else {
                                    // Create image preview
                                    sPreviewUrl = `data:${sMediaType};base64,${sBase64Content}`;
                                }
                            } else {
                                throw new Error("Empty file content");
                            }
                        } else {
                            throw new Error("No file content available");
                        }
                    } catch (e) {
                        console.warn("Could not fetch fileContent:", e.message);
                        // No file content available - show placeholder
                        sPdfContent = `<div style="padding: 40px; text-align: center; color: #666; background: #f5f5f5; border-radius: 8px; margin: 20px;">
                            <div style="font-size: 64px; margin-bottom: 16px;">📄</div>
                            <p style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">No CV File Available</p>
                            <p style="font-size: 13px; color: #999;">The original CV file is not available for preview.</p>
                            <p style="font-size: 12px; color: #bbb; margin-top: 12px;">Extracted data is shown on the right.</p>
                        </div>`;
                    }
                }

                // When we have preview_image, force fileType to "image" for proper display
                const sDisplayFileType = sPreviewImageB64 ? "image" : sFileType;

                // Extract tier2 structured data
                let oTier2 = oExtractedData.tier2 || {
                    workHistory: [],
                    education: [],
                    skills: []
                };

                // Ensure tier2 has proper structure
                if (!oTier2.workHistory) oTier2.workHistory = [];
                if (!oTier2.education) oTier2.education = [];
                if (!oTier2.skills) oTier2.skills = [];

                // Convert flat structure (from CSV/legacy data) to tier2 format if needed
                // Map 'experiences' array to 'workHistory' with proper structure
                if (oTier2.workHistory.length === 0 && oExtractedData.experiences && oExtractedData.experiences.length > 0) {
                    oTier2.workHistory = oExtractedData.experiences.map(exp => ({
                        jobTitle: { value: exp.jobTitle || exp.title || "", confidence: 85 },
                        company: { value: exp.company || exp.organization || "", confidence: 85 },
                        startDate: { value: exp.startDate || (exp.duration ? exp.duration.split("-")[0]?.trim() : "") || "", confidence: 80 },
                        endDate: { value: exp.endDate || (exp.duration ? exp.duration.split("-")[1]?.trim() : "") || "", confidence: 80 },
                        responsibilities: { value: exp.responsibilities || exp.description || "", confidence: 75 }
                    }));
                }

                // Map 'education' array to tier2.education with proper structure
                if (oTier2.education.length === 0 && oExtractedData.education && oExtractedData.education.length > 0) {
                    oTier2.education = oExtractedData.education.map(edu => ({
                        degree: { value: edu.degree || edu.qualification || "", confidence: 85 },
                        fieldOfStudy: { value: edu.fieldOfStudy || edu.field || edu.major || "", confidence: 80 },
                        institution: { value: edu.institution || edu.school || edu.university || "", confidence: 85 },
                        graduationYear: { value: edu.year || edu.graduationYear || "", confidence: 80 }
                    }));
                }

                // Map 'skills' array to tier2.skills with proper structure
                if (oTier2.skills.length === 0 && oExtractedData.skills && oExtractedData.skills.length > 0) {
                    oTier2.skills = oExtractedData.skills.map(skill => {
                        // Handle both string array and object array formats
                        const skillName = typeof skill === 'string' ? skill : (skill.name || skill.value || "");
                        return {
                            name: { value: skillName, confidence: 90 },
                            matchedSkillId: null
                        };
                    });
                }

                // Update review model
                oReviewModel.setData({
                    documentId: sDocumentId,
                    fileName: oDocument.fileName,
                    fileType: sDisplayFileType,  // Use image display when preview is available
                    previewUrl: sPreviewUrl,
                    pdfContent: sPdfContent,
                    confidence: oDocument.ocrConfidence || 0,
                    ocrMethod: oDocument.extractionMethod || "RapidOCR",
                    processedAt: oDocument.processedAt ? new Date(oDocument.processedAt).toLocaleString() : "",
                    tier1: {
                        firstName: oTier1.firstName || { value: "", confidence: 0 },
                        lastName: oTier1.lastName || { value: "", confidence: 0 },
                        email: oTier1.email || { value: "", confidence: 0 },
                        phone: oTier1.phone || { value: "", confidence: 0 },
                        location: oTier1.location || { value: "", confidence: 0 }
                    },
                    tier2: oTier2,
                    rawSections: {
                        experience_section: oRawSections.experience_section || "",
                        education_section: oRawSections.education_section || ""
                    },
                    ocrLines: aOcrLines,
                    showHighlights: true,
                    highlightedField: null,
                    pdfDimensions: oPreviewDimensions,  // Use actual dimensions from ML service
                    zoom: 100
                });

                // Render highlights after image loads (with delay for image to render)
                if (aOcrLines.length > 0 && sPreviewUrl) {
                    setTimeout(() => this._renderOcrHighlights(), 500);
                }

                // Render skill tags
                setTimeout(() => this._renderSkillTags(), 100);

            } catch (error) {
                console.error("Failed to load document:", error);
                this.handleError(error, "Failed to load document data");
                this.onNavBack();
            } finally {
                this.getView().setBusy(false);
            }
        },

        /**
         * Convert Blob to Base64
         * @param {Blob} blob Blob to convert
         * @returns {Promise<string>} Base64 string (without data URL prefix)
         * @private
         */
        _blobToBase64: function (blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    // Remove data URL prefix (e.g., "data:application/pdf;base64,")
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
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
                const sUrl = `${this.getModel().sServiceUrl}/CVDocuments(ID=${sDocumentId},IsActiveEntity=true)/fileContent`;

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
                this.handleError(error, "Failed to download file");
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
         * Render OCR highlights on CV preview image
         * @private
         */
        _renderOcrHighlights: function () {
            const oReviewModel = this.getModel("review");
            const aLines = oReviewModel.getProperty("/ocrLines") || [];
            const bShowHighlights = oReviewModel.getProperty("/showHighlights");
            const oPdfDimensions = oReviewModel.getProperty("/pdfDimensions") || { width: 1700, height: 2200 };

            if (!bShowHighlights || aLines.length === 0) {
                return;
            }

            // Find the preview image element using DOM query (more reliable than UI5 byId)
            const oImageDom = document.querySelector('img[src^="data:image/png"]');
            if (!oImageDom) {
                console.warn("Preview image not found in DOM");
                return;
            }

            // Get the image's parent element for positioning
            const oContainerDom = oImageDom.parentElement;
            if (!oContainerDom) {
                console.warn("Image parent not found");
                return;
            }

            // Remove existing highlight overlay from anywhere in the document
            document.querySelectorAll(".ocr-highlight-overlay").forEach(el => el.remove());

            // Create SVG overlay for highlights
            const overlay = document.createElement("div");
            overlay.className = "ocr-highlight-overlay";
            overlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: ${oImageDom.offsetWidth}px;
                height: ${oImageDom.offsetHeight}px;
                pointer-events: none;
                z-index: 10;
            `;

            // Create SVG element with viewBox matching the preview image dimensions
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.style.cssText = "width: 100%; height: 100%;";
            svg.setAttribute("viewBox", `0 0 ${oPdfDimensions.width} ${oPdfDimensions.height}`);
            svg.setAttribute("preserveAspectRatio", "xMidYMin meet");

            // Get tier1 values to find matching lines
            const tier1 = oReviewModel.getProperty("/tier1") || {};
            const highlightTerms = [
                tier1.firstName?.value,
                tier1.lastName?.value,
                tier1.email?.value,
                tier1.phone?.value,
                tier1.location?.value
            ].filter(Boolean).map(v => v.toLowerCase());

            // Add highlight rectangles for matching lines
            aLines.forEach((line, index) => {
                if (!line.bbox || !Array.isArray(line.bbox)) {
                    return;
                }

                const text = (line.text || "").toLowerCase();
                const isHighlighted = highlightTerms.some(term => text.includes(term));

                // bbox format: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                const bbox = line.bbox;
                let x, y, width, height;

                if (Array.isArray(bbox[0])) {
                    // Polygon format
                    x = Math.min(bbox[0][0], bbox[3][0]);
                    y = Math.min(bbox[0][1], bbox[1][1]);
                    width = Math.max(bbox[1][0], bbox[2][0]) - x;
                    height = Math.max(bbox[2][1], bbox[3][1]) - y;
                } else {
                    // Simple [x1, y1, x2, y2] format
                    x = bbox[0];
                    y = bbox[1];
                    width = bbox[2] - bbox[0];
                    height = bbox[3] - bbox[1];
                }

                // Create rectangle
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("x", x);
                rect.setAttribute("y", y);
                rect.setAttribute("width", width);
                rect.setAttribute("height", height);

                if (isHighlighted) {
                    // Highlighted field - yellow background
                    rect.setAttribute("fill", "rgba(255, 235, 59, 0.4)");
                    rect.setAttribute("stroke", "#FFC107");
                    rect.setAttribute("stroke-width", "1");
                } else {
                    // Regular OCR line - subtle blue outline
                    rect.setAttribute("fill", "rgba(33, 150, 243, 0.1)");
                    rect.setAttribute("stroke", "rgba(33, 150, 243, 0.3)");
                    rect.setAttribute("stroke-width", "0.5");
                }

                rect.setAttribute("rx", "2");
                svg.appendChild(rect);
            });

            overlay.appendChild(svg);

            // Make container relative for absolute overlay positioning
            oContainerDom.style.position = "relative";
            oContainerDom.appendChild(overlay);
        },

        /**
         * Toggle highlight visibility
         */
        onToggleHighlights: function () {
            const oReviewModel = this.getModel("review");
            const bCurrentState = oReviewModel.getProperty("/showHighlights");
            oReviewModel.setProperty("/showHighlights", !bCurrentState);

            if (!bCurrentState) {
                // Was false, now true - render highlights
                this._renderOcrHighlights();
            } else {
                // Was true, now false - remove overlays
                document.querySelectorAll(".ocr-highlight-overlay").forEach(el => el.remove());
            }
        },

        /**
         * Highlight specific field in PDF
         * @param {string} sFieldName Field name to highlight
         */
        highlightField: function (sFieldName) {
            const oReviewModel = this.getModel("review");
            oReviewModel.setProperty("/highlightedField", sFieldName);
            this._renderOcrHighlights();
        },

        /**
         * Helper to get i18n text
         * @param {string} sKey i18n key
         * @returns {string} Translated text
         * @private
         */
        _getI18nText: function (sKey) {
            return this.getView().getModel("i18n").getResourceBundle().getText(sKey);
        },

        /**
         * Add a new empty job entry
         */
        onAddJob: function () {
            const oModel = this.getView().getModel("review");
            const aWorkHistory = oModel.getProperty("/tier2/workHistory") || [];

            aWorkHistory.push({
                jobTitle: { value: "", confidence: 100 },
                company: { value: "", confidence: 100 },
                startDate: { value: "", confidence: 100 },
                endDate: { value: "", confidence: 100 },
                responsibilities: { value: "", confidence: 100 }
            });

            oModel.setProperty("/tier2/workHistory", aWorkHistory);
        },

        /**
         * Delete a job entry
         * @param {object} oEvent Button press event
         */
        onDeleteJob: function (oEvent) {
            const oSource = oEvent.getSource();
            const oContext = oSource.getBindingContext("review");
            const sPath = oContext.getPath();
            const iIndex = parseInt(sPath.split("/").pop(), 10);

            const oModel = this.getView().getModel("review");
            const aWorkHistory = oModel.getProperty("/tier2/workHistory");
            aWorkHistory.splice(iIndex, 1);
            oModel.setProperty("/tier2/workHistory", aWorkHistory);
        },

        /**
         * Add a new empty education entry
         */
        onAddEducation: function () {
            const oModel = this.getView().getModel("review");
            const aEducation = oModel.getProperty("/tier2/education") || [];

            aEducation.push({
                degree: { value: "", confidence: 100 },
                fieldOfStudy: { value: "", confidence: 100 },
                institution: { value: "", confidence: 100 },
                graduationYear: { value: "", confidence: 100 }
            });

            oModel.setProperty("/tier2/education", aEducation);
        },

        /**
         * Delete an education entry
         * @param {object} oEvent Button press event
         */
        onDeleteEducation: function (oEvent) {
            const oSource = oEvent.getSource();
            const oContext = oSource.getBindingContext("review");
            const sPath = oContext.getPath();
            const iIndex = parseInt(sPath.split("/").pop(), 10);

            const oModel = this.getView().getModel("review");
            const aEducation = oModel.getProperty("/tier2/education");
            aEducation.splice(iIndex, 1);
            oModel.setProperty("/tier2/education", aEducation);
        },

        /**
         * Render skill tags programmatically in the FlexBox container
         * @private
         */
        _renderSkillTags: function () {
            const oContainer = this.byId("skillsContainer");
            if (!oContainer) return;

            // Clear existing items
            oContainer.removeAllItems();

            const oModel = this.getView().getModel("review");
            const aSkills = oModel.getProperty("/tier2/skills") || [];

            const that = this;

            aSkills.forEach((skill, index) => {
                const oTag = new ObjectStatus({
                    text: skill.name.value,
                    state: skill.name.confidence >= 85 ? "Success" : "Information",
                    icon: skill.matchedSkillId ? "sap-icon://accept" : "",
                    inverted: true,
                    active: true,
                    press: function () {
                        that._onSkillTagPress(index, skill.name.value);
                    }
                });
                oTag.addStyleClass("sapUiTinyMarginEnd");
                oTag.addStyleClass("sapUiTinyMarginBottom");
                oContainer.addItem(oTag);
            });
        },

        /**
         * Handle skill tag press - show delete option
         * @param {number} iIndex Skill index
         * @param {string} sSkillName Skill name
         * @private
         */
        _onSkillTagPress: function (iIndex, sSkillName) {
            const that = this;

            MessageBox.confirm(
                `Delete skill "${sSkillName}"?`,
                {
                    title: this._getI18nText("deleteSkill") || "Delete Skill",
                    onClose: function (oAction) {
                        if (oAction === MessageBox.Action.OK) {
                            const oModel = that.getView().getModel("review");
                            const aSkills = oModel.getProperty("/tier2/skills");
                            aSkills.splice(iIndex, 1);
                            oModel.setProperty("/tier2/skills", aSkills);
                            that._renderSkillTags();
                        }
                    }
                }
            );
        },

        /**
         * Add a new skill
         */
        onAddSkill: function () {
            const that = this;

            // Simple input dialog for skill name
            if (!this._oAddSkillDialog) {
                this._oAddSkillDialog = new Dialog({
                    title: this._getI18nText("addSkill"),
                    content: [
                        new Input({
                            id: this.createId("newSkillInput"),
                            placeholder: "Enter skill name",
                            width: "100%"
                        })
                    ],
                    beginButton: new Button({
                        text: this._getI18nText("add"),
                        type: "Emphasized",
                        press: function () {
                            const oInput = that.byId("newSkillInput");
                            const sSkillName = oInput.getValue().trim();
                            if (sSkillName) {
                                const oModel = that.getView().getModel("review");
                                const aSkills = oModel.getProperty("/tier2/skills") || [];
                                aSkills.push({
                                    name: { value: sSkillName, confidence: 100 },
                                    matchedSkillId: null
                                });
                                oModel.setProperty("/tier2/skills", aSkills);
                                that._renderSkillTags();
                            }
                            oInput.setValue("");
                            that._oAddSkillDialog.close();
                        }
                    }),
                    endButton: new Button({
                        text: this._getI18nText("cancel"),
                        press: function () {
                            that.byId("newSkillInput").setValue("");
                            that._oAddSkillDialog.close();
                        }
                    })
                });
                this.getView().addDependent(this._oAddSkillDialog);
            }

            this._oAddSkillDialog.open();
        },

        /**
         * Handle skill tag press (for backward compatibility)
         * @param {object} oEvent ObjectStatus press event
         */
        onSkillPress: function (oEvent) {
            // This method is kept for backward compatibility
            // The actual handling is done in _onSkillTagPress
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
                this.handleError("First Name and Email are required");
                return;
            }

            try {
                this.getView().setBusy(true);

                // Prepare edited data with structured tier2
                const oEditedData = {
                    tier1: {
                        firstName: oReviewModel.getProperty("/tier1/firstName"),
                        lastName: oReviewModel.getProperty("/tier1/lastName"),
                        email: oReviewModel.getProperty("/tier1/email"),
                        phone: oReviewModel.getProperty("/tier1/phone"),
                        location: oReviewModel.getProperty("/tier1/location")
                    },
                    tier2: oReviewModel.getProperty("/tier2")
                };

                // Call reviewAndCreateCandidate action (OData v4)
                const sDocumentId = oReviewModel.getProperty("/documentId");
                const oAction = oModel.bindContext("/reviewAndCreateCandidate(...)");
                oAction.setParameter("documentId", sDocumentId);
                oAction.setParameter("editedData", JSON.stringify(oEditedData));

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
                this.handleError(error, "Failed to create candidate");
            } finally {
                this.getView().setBusy(false);
            }
        }
    });
});
