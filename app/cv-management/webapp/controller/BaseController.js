sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, Fragment, JSONModel, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("cvmanagement.controller.BaseController", {

        /**
         * Get the router instance
         * @returns {sap.ui.core.routing.Router} The router
         */
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        /**
         * Get a model by name
         * @param {string} sName The model name
         * @returns {sap.ui.model.Model} The model
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Set a model on the view
         * @param {sap.ui.model.Model} oModel The model
         * @param {string} sName The model name
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Get the resource bundle
         * @returns {sap.ui.model.resource.ResourceModel} The resource bundle
         */
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        /**
         * Navigate to a route
         * @param {string} sRouteName The route name
         * @param {object} oParameters The route parameters
         */
        navTo: function (sRouteName, oParameters) {
            this.getRouter().navTo(sRouteName, oParameters);
        },

        /**
         * Navigate back
         */
        navBack: function () {
            window.history.go(-1);
        },

        // ==================== Dialog Management ====================

        _mFragments: {},

        /**
         * Load and cache a fragment
         * @param {string} sFragmentName The fragment name (e.g., "dialogs/UpdateStatusDialog")
         * @returns {Promise<sap.ui.core.Fragment>} The loaded fragment
         */
        loadFragment: async function (sFragmentName) {
            if (!this._mFragments[sFragmentName]) {
                this._mFragments[sFragmentName] = await Fragment.load({
                    id: this.getView().getId(),
                    name: "cvmanagement.fragment." + sFragmentName,
                    controller: this
                });
                this.getView().addDependent(this._mFragments[sFragmentName]);
            }
            return this._mFragments[sFragmentName];
        },

        /**
         * Open a dialog with data
         * @param {string} sFragmentName The fragment name
         * @param {object} oData The data to set in the dialog model
         * @returns {Promise<void>}
         */
        openDialog: async function (sFragmentName, oData) {
            const oDialog = await this.loadFragment(sFragmentName);

            // Create or update dialog model
            let oDialogModel = this.getModel("dialogModel");
            if (!oDialogModel) {
                oDialogModel = new JSONModel();
                this.setModel(oDialogModel, "dialogModel");
            }
            oDialogModel.setData(oData || {});

            oDialog.open();
        },

        /**
         * Close a dialog
         * @param {sap.m.Dialog} oDialog The dialog to close (optional, will find it if not provided)
         */
        closeDialog: function (oDialog) {
            if (!oDialog) {
                // Try to find the open dialog
                const aContent = this.getView().getDependents();
                for (let i = 0; i < aContent.length; i++) {
                    if (aContent[i].isA("sap.m.Dialog") && aContent[i].isOpen()) {
                        oDialog = aContent[i];
                        break;
                    }
                }
            }
            if (oDialog) {
                oDialog.close();
            }
        },

        // ==================== OData Operations ====================

        /**
         * Call an OData bound action
         * @param {string} sActionPath The action path (e.g., "/Candidates(...)/updateStatus")
         * @param {object} oPayload The action parameters
         * @returns {Promise<object>} The action result
         */
        callAction: function (sActionPath, oPayload) {
            return new Promise((resolve, reject) => {
                const oModel = this.getModel();
                const oContext = oModel.bindContext(sActionPath);

                oContext.setParameter("newStatus", oPayload.newStatus);
                if (oPayload.notes) {
                    oContext.setParameter("notes", oPayload.notes);
                }
                if (oPayload.notifyCandidate !== undefined) {
                    oContext.setParameter("notifyCandidate", oPayload.notifyCandidate);
                }

                oContext.execute().then(() => {
                    resolve(oContext.getBoundContext().getObject());
                }).catch((oError) => {
                    reject(oError);
                });
            });
        },

        /**
         * Call an OData function import
         * @param {string} sFunctionPath The function path (e.g., "/searchCandidates(...)")
         * @param {object} mParameters The function parameters
         * @returns {Promise<object>} The function result
         */
        callFunction: function (sFunctionPath, mParameters) {
            return new Promise((resolve, reject) => {
                const oModel = this.getModel();
                const oContext = oModel.bindContext(sFunctionPath);

                // Set all parameters
                for (const sKey in mParameters) {
                    if (mParameters.hasOwnProperty(sKey)) {
                        oContext.setParameter(sKey, mParameters[sKey]);
                    }
                }

                oContext.execute().then(() => {
                    resolve(oContext.getBoundContext().getObject());
                }).catch((oError) => {
                    reject(oError);
                });
            });
        },

        // ==================== ML Service Integration ====================

        /**
         * Call the ML service
         * @param {string} sEndpoint The endpoint (e.g., "matching/semantic")
         * @param {object} oPayload The request payload
         * @param {boolean} bUseFallback Whether to use OData fallback on error
         * @returns {Promise<object>} The ML service response
         */
        callMLService: async function (sEndpoint, oPayload, bUseFallback = true) {
            try {
                // Use localhost:8000 in development, /ml-api/api in production
                const baseURL = window.location.hostname === "localhost" ? "http://localhost:8000/api" : "/ml-api/api";
                const response = await fetch(baseURL + "/" + sEndpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(oPayload)
                });

                if (!response.ok) {
                    throw new Error("ML service returned " + response.status);
                }

                const data = await response.json();
                return {
                    success: true,
                    data: data,
                    mlUsed: true
                };
            } catch (error) {
                console.error("ML service error:", error);

                if (bUseFallback) {
                    return await this._mlFallback(sEndpoint, oPayload);
                } else {
                    throw error;
                }
            }
        },

        /**
         * Fallback to OData when ML service is unavailable
         * @param {string} sEndpoint The ML endpoint
         * @param {object} oPayload The payload
         * @returns {Promise<object>} The fallback result
         * @private
         */
        _mlFallback: async function (sEndpoint, oPayload) {
            // Map ML endpoints to OData functions
            const mFallbackMap = {
                "matching/semantic": {
                    function: "/semanticSearch",
                    params: {
                        query: oPayload.query,
                        limit: oPayload.limit || 50,
                        minScore: oPayload.min_score || 0.3
                    }
                },
                "matching/search": {
                    function: "/searchCandidates",
                    params: {
                        query: oPayload.query,
                        top: oPayload.limit || 50,
                        skip: oPayload.offset || 0
                    }
                },
                "matching/similar-candidates": {
                    function: "/findSimilarCandidates",
                    params: {
                        candidateId: oPayload.candidate_id,
                        limit: oPayload.limit || 10
                    }
                }
            };

            const oFallback = mFallbackMap[sEndpoint];
            if (oFallback) {
                const result = await this.callFunction(oFallback.function + "(...)", oFallback.params);
                return {
                    success: true,
                    data: result,
                    mlUsed: false
                };
            } else {
                throw new Error("No fallback available for " + sEndpoint);
            }
        },

        // ==================== Error Handling & Messages ====================

        /**
         * Handle an error with user-friendly message
         * @param {Error|object} oError The error
         * @param {string} sContext Optional context for the error (e.g., "loading candidates")
         */
        handleError: function (oError, sContext) {
            let sMessage = this.getResourceBundle().getText("msgError");
            let sTitle = this.getResourceBundle().getText("error");

            // Parse error details
            if (oError) {
                if (oError.message) {
                    sMessage = oError.message;
                } else if (oError.error && oError.error.message) {
                    sMessage = oError.error.message;
                } else if (typeof oError === "string") {
                    sMessage = oError;
                }

                // Check for specific error types
                if (oError.status === 404 || sMessage.includes("not found")) {
                    sMessage = this.getResourceBundle().getText("errorNotFound");
                } else if (oError.status === 403 || sMessage.includes("permission") || sMessage.includes("forbidden")) {
                    sMessage = this.getResourceBundle().getText("errorPermission");
                } else if (oError.status === 500 || oError.status === 503) {
                    sMessage = this.getResourceBundle().getText("msgServiceUnavailable");
                } else if (oError.name === "TypeError" && sMessage.includes("fetch")) {
                    sMessage = this.getResourceBundle().getText("errorNetwork");
                }
            }

            // Add context if provided
            if (sContext) {
                sMessage = sContext + ": " + sMessage;
            }

            // Log error for debugging
            console.error("Error:", oError);

            // Show error to user
            MessageBox.error(sMessage, {
                title: sTitle,
                actions: [MessageBox.Action.CLOSE],
                emphasizedAction: MessageBox.Action.CLOSE
            });
        },

        /**
         * Show a success message
         * @param {string} sMessage The message
         */
        showSuccess: function (sMessage) {
            MessageToast.show(sMessage);
        },

        /**
         * Show an info message
         * @param {string} sMessage The message
         */
        showInfo: function (sMessage) {
            MessageToast.show(sMessage);
        },

        /**
         * Set busy state on the view
         * @param {boolean} bBusy Whether the view should be busy
         */
        setBusy: function (bBusy) {
            this.getView().setBusy(bBusy);
        },

        /**
         * Confirm an action with the user
         * @param {string} sMessage The confirmation message
         * @param {string} sTitle Optional title
         * @returns {Promise<boolean>} True if confirmed
         */
        confirmAction: function (sMessage, sTitle) {
            return new Promise((resolve) => {
                MessageBox.confirm(sMessage, {
                    title: sTitle || this.getResourceBundle().getText("confirmAction"),
                    onClose: function (oAction) {
                        resolve(oAction === MessageBox.Action.OK);
                    }
                });
            });
        },

        // ==================== Loading States ====================

        /**
         * Show loading indicator on a control
         * @param {sap.ui.core.Control} oControl The control
         * @param {boolean} bBusy Whether to show busy indicator
         */
        setControlBusy: function (oControl, bBusy) {
            if (oControl && oControl.setBusy) {
                oControl.setBusy(bBusy);
            }
        },

        /**
         * Show a loading message toast
         * @param {string} sMessage The loading message
         * @returns {object} Toast instance (can be used to close it)
         */
        showLoadingToast: function (sMessage) {
            return MessageToast.show(sMessage || this.getResourceBundle().getText("loading"), {
                duration: 10000,
                closeOnBrowserNavigation: true
            });
        },

        /**
         * Execute an async operation with loading state
         * @param {Function} fnOperation The async operation
         * @param {string} sLoadingMessage Optional loading message
         * @param {string} sSuccessMessage Optional success message
         * @returns {Promise<any>} The operation result
         */
        executeWithLoading: async function (fnOperation, sLoadingMessage, sSuccessMessage) {
            this.setBusy(true);
            if (sLoadingMessage) {
                this.showLoadingToast(sLoadingMessage);
            }

            try {
                const result = await fnOperation();

                if (sSuccessMessage) {
                    this.showSuccess(sSuccessMessage);
                }

                return result;
            } catch (error) {
                this.handleError(error);
                throw error;
            } finally {
                this.setBusy(false);
            }
        },

        // ==================== Validation ====================

        /**
         * Validate required fields in a dialog model
         * @param {object} oData The data object
         * @param {Array<string>} aRequiredFields Array of required field names
         * @returns {boolean} True if all required fields are filled
         */
        validateRequiredFields: function (oData, aRequiredFields) {
            for (let i = 0; i < aRequiredFields.length; i++) {
                const sField = aRequiredFields[i];
                const value = oData[sField];

                if (value === null || value === undefined || value === "") {
                    const sMessage = this.getResourceBundle().getText("validationRequired");
                    this.showInfo(sMessage + ": " + sField);
                    return false;
                }
            }
            return true;
        },

        /**
         * Validate email address
         * @param {string} sEmail The email to validate
         * @returns {boolean} True if valid
         */
        validateEmail: function (sEmail) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(sEmail)) {
                this.showInfo(this.getResourceBundle().getText("validationEmail"));
                return false;
            }
            return true;
        },

        /**
         * Validate number
         * @param {any} value The value to validate
         * @param {number} min Optional minimum value
         * @param {number} max Optional maximum value
         * @returns {boolean} True if valid
         */
        validateNumber: function (value, min, max) {
            const num = parseFloat(value);

            if (isNaN(num)) {
                this.showInfo(this.getResourceBundle().getText("validationNumber"));
                return false;
            }

            if (min !== undefined && num < min) {
                this.showInfo("Value must be at least " + min);
                return false;
            }

            if (max !== undefined && num > max) {
                this.showInfo("Value must be at most " + max);
                return false;
            }

            return true;
        },

        // ==================== Utilities ====================

        /**
         * Format a date for display
         * @param {Date|string} date The date
         * @param {string} sPattern The pattern (default: "MMM dd, yyyy")
         * @returns {string} Formatted date
         */
        formatDate: function (date, sPattern) {
            if (!date) return "";

            const oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({
                pattern: sPattern || "MMM dd, yyyy"
            });

            return oDateFormat.format(new Date(date));
        },

        /**
         * Debounce a function
         * @param {Function} fn The function to debounce
         * @param {number} delay The delay in milliseconds
         * @returns {Function} The debounced function
         */
        debounce: function (fn, delay) {
            let timeoutId;
            return function (...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn.apply(this, args), delay);
            };
        }

    });
});
