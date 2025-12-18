sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("mlshowcase.controller.Main", {

        onInit: function () {
            // Get app model
            this.oAppModel = this.getOwnerComponent().getModel("app");

            // Check health on init
            this.onCheckHealth();
        },

        /**
         * Get ML service base URL
         */
        _getMLServiceUrl: function () {
            return this.oAppModel.getProperty("/mlServiceUrl");
        },

        /**
         * Update endpoint status
         */
        _updateEndpointStatus: function (sEndpoint, sStatus, sResponse) {
            this.oAppModel.setProperty("/endpoints/" + sEndpoint + "/status", sStatus);
            if (sResponse) {
                this.oAppModel.setProperty("/endpoints/" + sEndpoint + "/response",
                    typeof sResponse === "string" ? sResponse : JSON.stringify(sResponse, null, 2));
            }
        },

        /**
         * Call ML service endpoint
         */
        _callMLService: async function (sMethod, sEndpoint, oPayload) {
            const sUrl = this._getMLServiceUrl() + sEndpoint;

            try {
                const oOptions = {
                    method: sMethod,
                    headers: {
                        "Content-Type": "application/json"
                    }
                };

                if (oPayload && sMethod !== "GET") {
                    oOptions.body = JSON.stringify(oPayload);
                }

                const oResponse = await fetch(sUrl, oOptions);

                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status + ": " + oResponse.statusText);
                }

                const oData = await oResponse.json();
                return {
                    success: true,
                    data: oData
                };
            } catch (oError) {
                console.error("ML Service Error:", oError);
                return {
                    success: false,
                    error: oError.message
                };
            }
        },

        // ==================== Health Check ====================

        onCheckHealth: async function () {
            this._updateEndpointStatus("health", "loading", null);
            MessageToast.show("Checking ML service health...");

            const oResult = await this._callMLService("GET", "/health/ready", null);

            if (oResult.success) {
                this._updateEndpointStatus("health", "success", oResult.data);
                this.oAppModel.setProperty("/serviceStatus", "healthy");
                this.oAppModel.setProperty("/lastChecked", new Date().toLocaleTimeString());
                MessageToast.show("ML Service is operational");
            } else {
                this._updateEndpointStatus("health", "error", { error: oResult.error });
                this.oAppModel.setProperty("/serviceStatus", "degraded");
                MessageBox.error("ML Service health check failed: " + oResult.error);
            }
        },

        // ==================== Embeddings Generator ====================

        onGenerateEmbedding: async function () {
            const sText = this.byId("embeddingInput").getValue();

            if (!sText || sText.trim() === "") {
                MessageBox.warning("Please enter text to generate embeddings");
                return;
            }

            this._updateEndpointStatus("embeddings", "loading", null);
            MessageToast.show("Generating embedding vector...");

            // Generate a random UUID for demo purposes
            const sDemoId = "demo-" + Date.now();

            const oResult = await this._callMLService("POST", "/api/embeddings/generate", {
                entity_type: "candidate",
                entity_id: sDemoId,
                text_content: sText,
                store: false  // Don't store demo embeddings
            });

            if (oResult.success) {
                this._updateEndpointStatus("embeddings", "success", {
                    entity_id: oResult.data.entity_id,
                    entity_type: oResult.data.entity_type,
                    embedding_dimension: oResult.data.embedding_dimension,
                    stored: oResult.data.stored,
                    content_hash: oResult.data.content_hash?.substring(0, 16) + "..."
                });
                MessageToast.show("Embedding generated successfully (" +
                    oResult.data.embedding_dimension + " dimensions)");
            } else {
                this._updateEndpointStatus("embeddings", "error", { error: oResult.error });
                MessageBox.error("Failed to generate embedding: " + oResult.error);
            }
        },

        // ==================== Semantic Search ====================

        onSemanticSearch: async function () {
            const sQuery = this.byId("searchQuery").getValue();
            const fMinScore = parseFloat(this.byId("searchMinScore").getValue()) || 0.3;
            const iLimit = parseInt(this.byId("searchLimit").getValue()) || 10;

            if (!sQuery || sQuery.trim() === "") {
                MessageBox.warning("Please enter a search query");
                return;
            }

            this._updateEndpointStatus("search", "loading", null);
            MessageToast.show("Searching candidates...");

            const oResult = await this._callMLService("POST", "/api/matching/search", {
                query: sQuery,
                min_similarity: fMinScore,
                limit: iLimit
            });

            if (oResult.success) {
                const aCandidates = oResult.data.results || oResult.data.candidates || [];
                const iTotalMatches = oResult.data.total_results || oResult.data.total_matches || aCandidates.length;
                this._updateEndpointStatus("search", "success", {
                    query: sQuery,
                    total_matches: iTotalMatches,
                    results: aCandidates.slice(0, 5).map(c => ({
                        candidate_id: c.candidate_id || c.id,
                        similarity: c.similarity || c.similarity_score || c.score || 0
                    }))
                });
                MessageToast.show("Found " + iTotalMatches + " matching candidates");
            } else {
                this._updateEndpointStatus("search", "error", { error: oResult.error });
                MessageBox.error("Search failed: " + oResult.error);
            }
        },

        // ==================== Similar Candidates ====================

        onFindSimilar: async function () {
            const sCandidateId = this.byId("similarCandidateId").getValue();
            const iLimit = parseInt(this.byId("similarLimit").getValue()) || 10;

            if (!sCandidateId || sCandidateId.trim() === "") {
                MessageBox.warning("Please enter a candidate ID");
                return;
            }

            this._updateEndpointStatus("similar", "loading", null);
            MessageToast.show("Finding similar candidates...");

            const oResult = await this._callMLService("POST", "/api/matching/similar-candidates", {
                candidate_id: sCandidateId,
                limit: iLimit,
                min_similarity: 0.3
            });

            if (oResult.success) {
                const aSimilar = oResult.data.matches || oResult.data.results || [];
                const iTotalResults = oResult.data.total_results || aSimilar.length;
                this._updateEndpointStatus("similar", "success", {
                    reference_candidate_id: oResult.data.reference_candidate_id || sCandidateId,
                    total_results: iTotalResults,
                    matches: aSimilar.slice(0, 5).map(c => ({
                        candidate_id: c.candidate_id || c.id,
                        similarity: c.similarity || c.similarity_score || c.score || 0
                    }))
                });
                MessageToast.show("Found " + iTotalResults + " similar candidates");
            } else {
                this._updateEndpointStatus("similar", "error", { error: oResult.error });
                MessageBox.error("Failed to find similar candidates: " + oResult.error);
            }
        },

        // ==================== Job Matching ====================

        onJobMatching: async function () {
            const sJobId = this.byId("matchJobId").getValue();
            const fMinScore = parseFloat(this.byId("matchMinScore").getValue()) || 0.5;
            const iLimit = parseInt(this.byId("matchLimit").getValue()) || 20;

            if (!sJobId || sJobId.trim() === "") {
                MessageBox.warning("Please enter a job posting ID");
                return;
            }

            this._updateEndpointStatus("matching", "loading", null);
            MessageToast.show("Finding matching candidates...");

            const oResult = await this._callMLService("POST", "/api/matching/semantic", {
                job_posting_id: sJobId,
                min_score: fMinScore,
                limit: iLimit,
                include_breakdown: true
            });

            if (oResult.success) {
                const aMatches = oResult.data.matches || oResult.data.results || [];
                this._updateEndpointStatus("matching", "success", {
                    job_posting_id: sJobId,
                    total_matches: aMatches.length,
                    matches: aMatches.slice(0, 5).map(m => ({
                        candidate_id: m.candidate_id,
                        candidate_name: m.candidate_name || m.name || "Unknown",
                        overall_score: m.overall_score || m.score || 0,
                        skill_score: m.skill_score || 0,
                        experience_score: m.experience_score || 0,
                        semantic_score: m.semantic_score || 0
                    }))
                });
                MessageToast.show("Found " + aMatches.length + " matching candidates");
            } else {
                this._updateEndpointStatus("matching", "error", { error: oResult.error });
                MessageBox.error("Job matching failed: " + oResult.error);
            }
        },

        // ==================== OCR Extraction ====================

        onExtractOCR: async function () {
            this._updateEndpointStatus("ocr", "loading", null);
            MessageToast.show("Testing OCR with sample document...");

            // Use a sample test to verify OCR is working
            // In production, this would handle file uploads
            const oResult = await this._callMLService("GET", "/api/ocr/health", null);

            if (oResult.success) {
                const oEngineInfo = oResult.data.engine_info || {};
                this._updateEndpointStatus("ocr", "success", {
                    engine: oEngineInfo.engine || "rapidocr",
                    backend: oEngineInfo.backend || "ONNX Runtime",
                    supported_languages: oEngineInfo.supported_languages?.length || 0,
                    status: "OCR service is operational with RapidOCR",
                    note: "File upload feature available via /api/ocr/process endpoint"
                });
                MessageToast.show("OCR service is ready (RapidOCR)");
            } else {
                this._updateEndpointStatus("ocr", "error", {
                    error: oResult.error,
                    note: "OCR service may not be initialized"
                });
                MessageBox.error("OCR health check failed: " + oResult.error);
            }
        }

    });
});
