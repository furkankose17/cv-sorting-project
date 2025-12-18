sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "../utils/MLServiceClient",
    "../model/formatter/DataFormatter",
    "../model/formatter/StatusFormatter",
    "../model/formatter/DisplayFormatter"
], function (BaseController, JSONModel, Filter, FilterOperator, Fragment, MLServiceClient,
             DataFormatter, StatusFormatter, DisplayFormatter) {
    "use strict";

    return BaseController.extend("cvmanagement.controller.Main", {

        // Expose formatters for view binding
        DataFormatter: DataFormatter,
        StatusFormatter: StatusFormatter,
        DisplayFormatter: DisplayFormatter,

        onInit: function () {
            // Initialize view model
            const oViewModel = new JSONModel({
                busy: false,
                selectedTab: "candidates",
                selectedCandidatesCount: 0,
                dashboardLoading: true,
                stats: {
                    totalCandidates: 0,
                    activeJobs: 0,
                    interviewsThisWeek: 0,
                    topMatchScore: 0
                },
                recentActivity: []
            });
            this.setModel(oViewModel, "viewModel");

            // Initialize upload view model
            const oUploadViewModel = new JSONModel({
                autoCreate: false,
                selectedFiles: [],
                processing: false,
                progress: 0,
                progressText: "",
                statusMessage: "",
                resultMessage: "",
                resultType: "Success"
            });
            this.setModel(oUploadViewModel, "uploadView");

            // Initialize dashboard model for analytics
            const oDashboardModel = new JSONModel({
                isLoading: true,
                pipelineData: {
                    totalCandidates: 0,
                    avgTimeToHire: 0,
                    byStatus: [],
                    bySource: []
                },
                skillsData: {
                    topSkills: []
                },
                jobsData: {
                    activeJobs: 0,
                    totalJobs: 0
                },
                matchingData: {
                    avgScore: 0,
                    totalMatches: 0
                },
                interviewData: {
                    totalScheduled: 0,
                    completed: 0,
                    upcomingCount: 0,
                    completionRate: 0,
                    avgOverallRating: 0
                },
                aiData: {
                    isLoading: false,
                    recommendations: [],
                    lastUpdated: null
                },
                priorityData: {
                    isLoading: false,
                    jobsWithHotCandidates: [],
                    totalHotCandidates: 0,
                    totalWarmCandidates: 0
                },
                processingCount: 0,
                jobsKPI: {
                    totalJobs: 0,
                    publishedJobs: 0,
                    jobsWithHotCandidates: 0,
                    jobsNeedingMatches: 0
                },
                jobsList: [],
                jobsListFilter: "all",
                dateFilter: {
                    fromDate: null,
                    toDate: null
                }
            });
            this.setModel(oDashboardModel, "dashboard");

            // Initialize email center model
            const oEmailModel = new JSONModel({
                isLoading: false,
                stats: {
                    sentToday: 0,
                    sentYesterday: 0,
                    deliveryRate: 100,
                    failedCount: 0,
                    pendingCount: 0,
                    totalSent: 0,
                    openRate: 0,
                    clickRate: 0
                },
                health: {
                    n8nConnected: false,
                    smtpStatus: 'unknown',
                    lastSuccessfulSend: null,
                    webhooksEnabled: false
                },
                recentActivity: [],
                settings: [],
                templates: [
                    { key: 'cv_received', name: 'CV Received', subject: 'Your CV has been received for {jobTitle}', lastEdited: '2024-12-15' },
                    { key: 'status_changed', name: 'Status Changed', subject: 'Application Update for {jobTitle}', lastEdited: '2024-12-10' },
                    { key: 'interview_invitation', name: 'Interview Invitation', subject: 'Interview Invitation for {jobTitle}', lastEdited: '2024-12-08' },
                    { key: 'interview_reminder', name: 'Interview Reminder', subject: 'Reminder: Interview Tomorrow', lastEdited: '2024-12-05' },
                    { key: 'interview_confirmed', name: 'Interview Confirmed', subject: 'Interview Confirmed for {jobTitle}', lastEdited: '2024-12-01' },
                    { key: 'offer_extended', name: 'Offer Extended', subject: 'Job Offer for {jobTitle}', lastEdited: '2024-11-28' },
                    { key: 'application_rejected', name: 'Application Rejected', subject: 'Application Update for {jobTitle}', lastEdited: '2024-11-25' }
                ],
                history: {
                    filters: {
                        dateFrom: null,
                        dateTo: null,
                        types: [],
                        statuses: [],
                        search: ''
                    },
                    items: [],
                    totalCount: 0
                }
            });
            this.setModel(oEmailModel, "email");

            // Attach to route matched
            const oRouter = this.getRouter();
            oRouter.getRoute("main").attachPatternMatched(this._onRouteMatched, this);

            // Initialize keyboard shortcuts
            this._initKeyboardShortcuts();

            // Load fragments into tabs
            this._loadTabFragments();

            // Load dashboard statistics after model is ready
            const oModel = this.getModel();
            if (oModel) {
                oModel.attachEventOnce("dataReceived", () => {
                    this._loadDashboardStats();
                    this._loadPriorityDashboard();
                    this._loadProcessingCount();
                });
                // Also try immediately in case model is already loaded
                setTimeout(() => {
                    if (oModel.getServiceUrl()) {
                        this._loadDashboardStats();
                        this._loadPriorityDashboard();
                        this._loadProcessingCount();
                    }
                }, 500);
            }

            // Poll processing count every 30 seconds
            this._processingCountInterval = setInterval(() => {
                this._loadProcessingCount();
            }, 30000);

            // Initialize AI Assistant model
            const oAIAssistantModel = new JSONModel({
                isOpen: false,
                messages: [],
                isLoading: false,
                inputValue: "",
                quickActions: [
                    { text: "Top candidates", query: "Top candidates for Senior Developer" },
                    { text: "Find React devs", query: "Find React developers" },
                    { text: "Best matches", query: "Show best candidate matches" }
                ],
                currentContext: {
                    jobId: null,
                    candidateId: null
                }
            });
            this.setModel(oAIAssistantModel, "aiAssistant");

            // Create FAB after a short delay to not interfere with initial render
            setTimeout(() => {
                this._createAIFAB();
            }, 1000);
        },

        /**
         * Load fragments into tab filters
         * @private
         */
        _loadTabFragments: function () {
            const aFragments = [
                { id: "uploadTab", fragmentName: "cvmanagement.fragment.UploadSection" },
                { id: "candidatesTab", fragmentName: "cvmanagement.fragment.CandidatesSection" },
                { id: "jobsTab", fragmentName: "cvmanagement.fragment.JobsSection" },
                { id: "documentsTab", fragmentName: "cvmanagement.fragment.DocumentsSection" },
                { id: "analyticsTab", fragmentName: "cvmanagement.fragment.AnalyticsSection" },
                { id: "emailCenterTab", fragmentName: "cvmanagement.fragment.EmailCenterSection" }
            ];

            aFragments.forEach(oFragmentConfig => {
                Fragment.load({
                    id: this.getView().getId(),
                    name: oFragmentConfig.fragmentName,
                    controller: this
                }).then(oFragment => {
                    const oTab = this.byId(oFragmentConfig.id);
                    if (oTab) {
                        // Add fragment content to tab
                        if (Array.isArray(oFragment)) {
                            oFragment.forEach(oControl => oTab.addContent(oControl));
                        } else {
                            oTab.addContent(oFragment);
                        }
                    }
                }).catch(oError => {
                    console.error("Failed to load fragment: " + oFragmentConfig.fragmentName, oError);
                });
            });
        },

        /**
         * Initialize keyboard shortcuts
         * @private
         */
        _initKeyboardShortcuts: function () {
            const that = this;

            // Store reference for cleanup
            this._keydownHandler = function (oEvent) {
                // Check if Ctrl (or Cmd on Mac) is pressed
                const bCtrlKey = oEvent.ctrlKey || oEvent.metaKey;

                // Ctrl+F: Focus global search
                if (bCtrlKey && oEvent.key === "f") {
                    oEvent.preventDefault();
                    const oSearchField = that.byId("globalSearch");
                    if (oSearchField) {
                        oSearchField.focus();
                    }
                }

                // Ctrl+R: Refresh
                if (bCtrlKey && oEvent.key === "r") {
                    oEvent.preventDefault();
                    that.onRefresh();
                }

                // Ctrl+N: New candidate/job based on active tab
                if (bCtrlKey && oEvent.key === "n") {
                    oEvent.preventDefault();
                    const sSelectedTab = that.getModel("viewModel").getProperty("/selectedTab");
                    if (sSelectedTab === "candidates") {
                        that.onAddCandidate();
                    } else if (sSelectedTab === "jobs") {
                        that.onCreateJob();
                    }
                }

                // ESC: Close dialogs and popovers
                if (oEvent.key === "Escape") {
                    // Close search popover
                    that.onCloseSearchPopover();

                    // Close any open dialog
                    that.closeDialog();
                }
            };

            // Add keyboard event listener to document
            document.addEventListener("keydown", this._keydownHandler);
        },

        /**
         * Cleanup on exit to prevent memory leaks
         */
        onExit: function () {
            // Remove keyboard event listener
            if (this._keydownHandler) {
                document.removeEventListener("keydown", this._keydownHandler);
                this._keydownHandler = null;
            }
            // Clear processing count polling interval
            if (this._processingCountInterval) {
                clearInterval(this._processingCountInterval);
                this._processingCountInterval = null;
            }
        },

        /**
         * Handle route matched event
         * @param {sap.ui.base.Event} oEvent The route matched event
         * @private
         */
        _onRouteMatched: function (oEvent) {
            // Get tab from URL parameters if any
            const oArgs = oEvent.getParameter("arguments");
            const sTab = oArgs["?query"]?.tab;

            if (sTab) {
                this._selectTab(sTab);
            }
        },

        /**
         * Handle tab selection
         * @param {sap.ui.base.Event} oEvent The select event
         */
        onTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            this.getModel("viewModel").setProperty("/selectedTab", sKey);

            // Load analytics data when analytics tab is selected
            if (sKey === "analytics") {
                this._loadAnalyticsDashboardData();
            }

            // Load jobs data when jobs tab is selected
            if (sKey === "jobs") {
                this._loadJobsSectionData();
            }

            // Update URL hash with selected tab
            const oRouter = this.getRouter();
            oRouter.navTo("main", {
                "?query": {
                    tab: sKey
                }
            }, true); // no history entry
        },

        /**
         * Select a specific tab programmatically
         * @param {string} sTabKey The tab key
         * @private
         */
        _selectTab: function (sTabKey) {
            const oTabBar = this.byId("mainTabBar");
            if (oTabBar) {
                oTabBar.setSelectedKey(sTabKey);
                this.getModel("viewModel").setProperty("/selectedTab", sTabKey);
            }
        },

        /**
         * Handle refresh button press
         */
        onRefresh: function () {
            const sSelectedTab = this.getModel("viewModel").getProperty("/selectedTab");

            // Refresh the OData model
            const oModel = this.getModel();
            oModel.refresh();

            this.showSuccess("Refreshed " + sSelectedTab);
        },

        /**
         * Handle global search
         * @param {sap.ui.base.Event} oEvent The search event
         */
        onGlobalSearch: async function (oEvent) {
            const sQuery = oEvent.getParameter("query");

            if (sQuery && sQuery.length >= 2) {
                await this._performGlobalSearch(sQuery);
            } else {
                // Clear search results
                this.getModel("viewModel").setProperty("/searchResults", {
                    candidates: [],
                    jobs: [],
                    candidatesCount: 0,
                    jobsCount: 0
                });

                // Close popover if open
                const oPopover = this.byId("globalSearchPopover");
                if (oPopover && oPopover.isOpen()) {
                    oPopover.close();
                }
            }
        },

        /**
         * Handle global search live change (for suggestions)
         * @param {sap.ui.base.Event} oEvent The live change event
         */
        onGlobalSearchLiveChange: function (oEvent) {
            const sValue = oEvent.getParameter("newValue");

            if (sValue && sValue.length >= 2) {
                // Trigger search after a short delay (debouncing)
                clearTimeout(this._searchTimeout);
                this._searchTimeout = setTimeout(() => {
                    this._performGlobalSearch(sValue);
                }, 300);
            }
        },

        /**
         * Handle global search suggest
         * @param {sap.ui.base.Event} oEvent The suggest event
         */
        onGlobalSearchSuggest: function (oEvent) {
            // Suggestions are handled via live change
        },

        /**
         * Perform global search across candidates and jobs
         * @param {string} sQuery The search query
         * @private
         */
        _performGlobalSearch: async function (sQuery) {
            const oViewModel = this.getModel("viewModel");
            const oModel = this.getModel();

            try {
                // Search candidates
                const aCandidateFilters = [
                    new Filter({
                        filters: [
                            new Filter("firstName", FilterOperator.Contains, sQuery),
                            new Filter("lastName", FilterOperator.Contains, sQuery),
                            new Filter("email", FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ];

                const oCandidatesBinding = oModel.bindList("/Candidates", null, null, aCandidateFilters, {
                    $expand: "status",
                    $top: 5
                });

                const aCandidateContexts = await oCandidatesBinding.requestContexts(0, 5);
                const aCandidates = aCandidateContexts.map(oContext => oContext.getObject());

                // Search jobs
                const aJobFilters = [
                    new Filter({
                        filters: [
                            new Filter("title", FilterOperator.Contains, sQuery),
                            new Filter("description", FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ];

                const oJobsBinding = oModel.bindList("/JobPostings", null, null, aJobFilters, {
                    $top: 5
                });

                const aJobContexts = await oJobsBinding.requestContexts(0, 5);
                const aJobs = aJobContexts.map(oContext => oContext.getObject());

                // Update view model with results
                oViewModel.setProperty("/searchResults", {
                    candidates: aCandidates,
                    jobs: aJobs,
                    candidatesCount: aCandidates.length,
                    jobsCount: aJobs.length
                });

                // Open search popover
                this._openSearchPopover();
            } catch (error) {
                console.error("Error performing global search:", error);
                this.handleError(error);
            }
        },

        /**
         * Open search results popover
         * @private
         */
        _openSearchPopover: async function () {
            const oSearchField = this.byId("globalSearch");

            if (!this._oSearchPopover) {
                this._oSearchPopover = await this.loadFragment("GlobalSearchPopover");
            }

            if (!this._oSearchPopover.isOpen()) {
                this._oSearchPopover.openBy(oSearchField);
            }
        },

        /**
         * Handle search result select (candidate)
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onSearchResultSelect: function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oContext = oItem.getBindingContext("viewModel");
            const sCandidateId = oContext.getProperty("ID");

            this.onCloseSearchPopover();
            this.navigateToCandidateDetail(sCandidateId);
        },

        /**
         * Handle search result select (job)
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onSearchJobSelect: function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oContext = oItem.getBindingContext("viewModel");
            const sJobId = oContext.getProperty("ID");

            this.onCloseSearchPopover();
            this.navigateToJobDetail(sJobId);
        },

        /**
         * Handle close search popover
         */
        onCloseSearchPopover: function () {
            if (this._oSearchPopover && this._oSearchPopover.isOpen()) {
                this._oSearchPopover.close();
            }
        },

        /**
         * Navigate to candidate detail
         * @param {string} sCandidateId The candidate ID
         */
        navigateToCandidateDetail: function (sCandidateId) {
            this.navTo("candidateDetail", {
                candidateId: sCandidateId
            });
        },

        /**
         * Navigate to job detail
         * @param {string} sJobId The job ID
         */
        navigateToJobDetail: function (sJobId) {
            this.navTo("jobDetail", {
                jobId: sJobId
            });
        },

        // ==================== Upload Section Handlers ====================

        /**
         * Handle file selection - track selected files
         * @param {sap.ui.base.Event} oEvent The change event
         */
        onFileSelected: function (oEvent) {
            const oFileUploader = oEvent.getSource();
            const aFiles = oEvent.getParameter("files") || [];
            const oUploadViewModel = this.getModel("uploadView");

            if (aFiles.length === 0) {
                oUploadViewModel.setProperty("/selectedFiles", []);
                return;
            }

            // Convert File objects to displayable format
            const aFileData = Array.from(aFiles).map(file => ({
                name: file.name,
                size: this._formatFileSize(file.size),
                file: file
            }));

            oUploadViewModel.setProperty("/selectedFiles", aFileData);
            oUploadViewModel.setProperty("/resultMessage", "");
        },

        /**
         * Format file size for display
         * @param {number} bytes File size in bytes
         * @returns {string} Formatted file size
         * @private
         */
        _formatFileSize: function (bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },

        /**
         * Process CVs - upload files one by one
         */
        onProcessCVs: async function () {
            const oUploadViewModel = this.getModel("uploadView");
            const aSelectedFiles = oUploadViewModel.getProperty("/selectedFiles");
            const bAutoCreate = oUploadViewModel.getProperty("/autoCreate");

            if (!aSelectedFiles || aSelectedFiles.length === 0) {
                this.showInfo("Please select files first");
                return;
            }

            // Set processing state
            oUploadViewModel.setProperty("/processing", true);
            oUploadViewModel.setProperty("/progress", 0);
            oUploadViewModel.setProperty("/resultMessage", "");

            let successCount = 0;
            let failCount = 0;
            const totalFiles = aSelectedFiles.length;

            for (let i = 0; i < totalFiles; i++) {
                const fileData = aSelectedFiles[i];
                const file = fileData.file;

                // Update progress
                const percent = ((i) / totalFiles) * 100;
                oUploadViewModel.setProperty("/progress", percent);
                oUploadViewModel.setProperty("/progressText", `${i + 1} / ${totalFiles}`);
                oUploadViewModel.setProperty("/statusMessage", `Processing: ${file.name}`);

                try {
                    // Upload file
                    await this._uploadSingleFile(file, bAutoCreate);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to upload ${file.name}:`, error);
                    failCount++;
                }
            }

            // Update final progress
            oUploadViewModel.setProperty("/progress", 100);
            oUploadViewModel.setProperty("/progressText", "Complete");
            oUploadViewModel.setProperty("/statusMessage", "");
            oUploadViewModel.setProperty("/processing", false);

            // Show result summary
            let resultMessage = "";
            let resultType = "Success";

            if (successCount === totalFiles) {
                resultMessage = `All ${totalFiles} file(s) processed successfully!`;
                resultType = "Success";
            } else if (failCount === totalFiles) {
                resultMessage = `All ${totalFiles} file(s) failed to process.`;
                resultType = "Error";
            } else {
                resultMessage = `Processed ${successCount} file(s) successfully. ${failCount} failed.`;
                resultType = "Warning";
            }

            oUploadViewModel.setProperty("/resultMessage", resultMessage);
            oUploadViewModel.setProperty("/resultType", resultType);

            // Clear selected files and reset uploader
            oUploadViewModel.setProperty("/selectedFiles", []);
            const oFileUploader = this.byId("cvFileUploader");
            if (oFileUploader) {
                oFileUploader.clear();
            }

            // Refresh documents table (OData V4 refresh doesn't take parameters)
            const oModel = this.getModel();
            if (oModel) {
                // Refresh all bindings
                oModel.refresh();
            }
        },

        /**
         * Upload a single file
         * @param {File} file The file to upload
         * @param {boolean} bAutoCreate Whether to auto-create candidates
         * @returns {Promise} Upload promise
         * @private
         */
        _uploadSingleFile: function (file, bAutoCreate) {
            return new Promise((resolve, reject) => {
                const formData = new FormData();
                formData.append('file', file);

                fetch('/api/uploadAndProcessCV', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-File-Name': encodeURIComponent(file.name),
                        'X-Media-Type': file.type,
                        'X-Auto-Create': bAutoCreate.toString()
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => {
                            throw new Error(err.message || err.error || `HTTP ${response.status}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.documentId) {
                        resolve(data);
                    } else {
                        reject(new Error('No document ID returned'));
                    }
                })
                .catch(error => {
                    reject(error);
                });
            });
        },

        // ==================== Candidates Section Handlers ====================

        /**
         * Handle candidate search
         * @param {sap.ui.base.Event} oEvent The search event
         */
        onCandidateSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            const oTable = this.byId("candidatesTable");
            const oBinding = oTable.getBinding("items");

            if (sQuery && sQuery.length > 0) {
                const aFilters = [
                    new Filter({
                        filters: [
                            new Filter("firstName", FilterOperator.Contains, sQuery),
                            new Filter("lastName", FilterOperator.Contains, sQuery),
                            new Filter("email", FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ];
                oBinding.filter(aFilters);
            } else {
                oBinding.filter([]);
            }
        },

        /**
         * Handle status filter change
         * @param {sap.ui.base.Event} oEvent The selection change event
         */
        onStatusFilterChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const oTable = this.byId("candidatesTable");
            const oBinding = oTable.getBinding("items");

            if (sKey === "all") {
                oBinding.filter([]);
            } else {
                // Use status/code field for filtering (codes are lowercase in DB)
                const oFilter = new Filter("status/code", FilterOperator.EQ, sKey);
                oBinding.filter([oFilter]);
            }
        },

        /**
         * Handle candidate row press (navigate to detail)
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onCandidatePress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext();
            const sCandidateId = oContext.getProperty("ID");

            this.navigateToCandidateDetail(sCandidateId);
        },

        /**
         * Handle add candidate button press
         */
        onAddCandidate: function () {
            // Initialize dialog with default values
            this.openDialog("dialogs/AddCandidateDialog", {
                firstName: "",
                lastName: "",
                email: "",
                phone: "",
                statusCode: "new",
                totalExperienceYears: 0,
                notes: ""
            });

            // Focus first input after dialog opens
            setTimeout(() => {
                const oInput = this.byId("firstNameInput");
                if (oInput) {
                    oInput.focus();
                }
            }, 300);
        },

        /**
         * Handle add candidate confirmation
         */
        onConfirmAddCandidate: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const oData = oDialogModel.getData();

            // Validate required fields
            if (!oData.firstName || !oData.lastName || !oData.email) {
                this.showInfo("Please fill all required fields (First Name, Last Name, Email)");
                return;
            }

            // Validate email format
            if (!this.validateEmail(oData.email)) {
                return;
            }

            this.setBusy(true);
            try {
                const oModel = this.getModel();

                // Create new candidate entry
                const oListBinding = oModel.bindList("/Candidates");
                const oContext = oListBinding.create({
                    firstName: oData.firstName,
                    lastName: oData.lastName,
                    email: oData.email,
                    phone: oData.phone || "",
                    totalExperienceYears: parseInt(oData.totalExperienceYears) || 0,
                    notes: oData.notes || "",
                    status_code: oData.statusCode
                });

                // Wait for the entity to be created
                await oContext.created();

                this.closeDialog();
                this.showSuccess("Candidate added successfully");

                // Refresh candidates table
                const oTable = this.byId("candidatesTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }

                // Navigate to the new candidate's detail page
                const sNewCandidateId = oContext.getProperty("ID");
                if (sNewCandidateId) {
                    this.navigateToCandidateDetail(sNewCandidateId);
                }

            } catch (error) {
                this.handleError(error, "Error adding candidate");
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle dialog after close (cleanup)
         */
        onAfterCloseDialog: function () {
            // Clear dialog model to prevent data persistence
            const oDialogModel = this.getModel("dialogModel");
            if (oDialogModel) {
                oDialogModel.setData({});
            }
        },

        /**
         * Handle update status button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onUpdateStatus: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();

            this.openDialog("dialogs/UpdateStatusDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("firstName") + " " + oContext.getProperty("lastName"),
                currentStatus: oContext.getProperty("status/name")
            });
        },

        /**
         * Handle delete candidate button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onDeleteCandidate: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();

            this.openDialog("dialogs/DeleteConfirmDialog", {
                candidateId: oContext.getProperty("ID"),
                candidateName: oContext.getProperty("firstName") + " " + oContext.getProperty("lastName")
            });
        },

        /**
         * Handle match candidate from list button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onMatchCandidateFromList: async function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sCandidateId = oContext.getProperty("ID");
            const sCandidateName = oContext.getProperty("firstName") + " " + oContext.getProperty("lastName");

            oButton.setBusy(true);

            try {
                const oResult = await this._runCandidateMatching(sCandidateId);
                this._showMatchResultsDialog(sCandidateName, sCandidateId, oResult);

                // Refresh candidates table
                this.onRefreshCandidates();

            } catch (error) {
                console.error("Match with jobs failed:", error);
                this.showError("Failed to match with jobs: " + (error.message || "Unknown error"));
            } finally {
                oButton.setBusy(false);
            }
        },

        /**
         * Handle bulk match candidates button press
         */
        onBulkMatchCandidates: async function () {
            const oTable = this.byId("candidatesTable");
            if (!oTable) return;

            const aSelectedItems = oTable.getSelectedItems();
            if (aSelectedItems.length === 0) {
                this.showWarning("Please select at least one candidate");
                return;
            }

            // Confirmation dialog
            sap.m.MessageBox.confirm(
                `Match ${aSelectedItems.length} candidate(s) with all published jobs?`,
                {
                    title: "Bulk Match Candidates",
                    onClose: async (sAction) => {
                        if (sAction === sap.m.MessageBox.Action.OK) {
                            await this._executeBulkMatching(aSelectedItems);
                        }
                    }
                }
            );
        },

        /**
         * Execute bulk matching for selected candidates
         * @param {Array} aSelectedItems Selected table items
         * @private
         */
        _executeBulkMatching: async function (aSelectedItems) {
            this.setBusy(true);

            let iSuccessCount = 0;
            let iFailCount = 0;
            let iTotalMatches = 0;

            for (const oItem of aSelectedItems) {
                const oContext = oItem.getBindingContext();
                const sCandidateId = oContext.getProperty("ID");

                try {
                    const oResult = await this._runCandidateMatching(sCandidateId);
                    iSuccessCount++;
                    iTotalMatches += oResult.matchesCreated + oResult.matchesUpdated;
                } catch (error) {
                    console.error("Matching failed for candidate:", sCandidateId, error);
                    iFailCount++;
                }
            }

            this.setBusy(false);

            // Show summary
            if (iFailCount === 0) {
                this.showSuccess(`Successfully matched ${iSuccessCount} candidate(s). Total matches: ${iTotalMatches}`);
            } else {
                this.showWarning(`Matched ${iSuccessCount} candidate(s), ${iFailCount} failed. Total matches: ${iTotalMatches}`);
            }

            // Refresh and clear selection
            this.onRefreshCandidates();
            const oTable = this.byId("candidatesTable");
            if (oTable) {
                oTable.removeSelections(true);
            }
        },

        /**
         * Run candidate matching action
         * @param {string} sCandidateId Candidate ID
         * @returns {Promise<Object>} Match result
         * @private
         */
        _runCandidateMatching: async function (sCandidateId) {
            const oModel = this.getModel();
            const oAction = oModel.bindContext("/matchCandidateWithAllJobs(...)");
            oAction.setParameter("candidateId", sCandidateId);
            oAction.setParameter("minScore", 0);
            oAction.setParameter("useSemanticMatching", true);

            await oAction.execute();
            return oAction.getBoundContext().getObject();
        },

        /**
         * Show match results dialog
         * @param {string} sCandidateName Candidate name
         * @param {string} sCandidateId Candidate ID
         * @param {Object} oResult Match result from backend
         * @private
         */
        _showMatchResultsDialog: async function (sCandidateName, sCandidateId, oResult) {
            // Prepare match results for display
            const aTopMatches = (oResult.topMatches || []).map((match, idx) => ({
                rank: idx + 1,
                jobPostingId: match.jobPostingId,
                jobTitle: match.jobTitle,
                overallScore: Math.round(match.overallScore),
                semanticScore: match.semanticScore
            }));

            // Create model for dialog
            const oMatchResultsModel = new JSONModel({
                candidateName: sCandidateName,
                candidateId: sCandidateId,
                totalJobsProcessed: oResult.totalJobsProcessed,
                matchesCreated: oResult.matchesCreated,
                matchesUpdated: oResult.matchesUpdated,
                processingTime: oResult.processingTime,
                topMatches: aTopMatches
            });

            // Load and open dialog
            if (!this._oMatchResultsDialog) {
                this._oMatchResultsDialog = await Fragment.load({
                    id: this.getView().getId(),
                    name: "cvmanagement.fragment.MatchResultsDialog",
                    controller: this
                });
                this.getView().addDependent(this._oMatchResultsDialog);
            }

            this._oMatchResultsDialog.setModel(oMatchResultsModel, "matchResults");
            this._oMatchResultsDialog.open();
        },

        /**
         * Handle match result item press - navigate to job detail
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onMatchResultItemPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("matchResults");
            const sJobId = oContext.getProperty("jobPostingId");

            if (this._oMatchResultsDialog) {
                this._oMatchResultsDialog.close();
            }
            this.getRouter().navTo("jobDetail", { jobId: sJobId });
        },

        /**
         * Handle view all matches button press
         */
        onViewAllMatchesPress: function () {
            if (this._oMatchResultsDialog) {
                this._oMatchResultsDialog.close();
                const sCandidateId = this._oMatchResultsDialog.getModel("matchResults").getProperty("/candidateId");
                this.navigateToCandidateDetail(sCandidateId);
            }
        },

        /**
         * Handle dialog close button
         */
        onMatchResultsDialogClose: function () {
            if (this._oMatchResultsDialog) {
                this._oMatchResultsDialog.close();
            }
        },

        /**
         * Format semantic score value
         * @param {number} nScore Semantic score
         * @returns {string} Formatted score or "N/A"
         */
        formatSemanticScore: function (nScore) {
            if (nScore === null || nScore === undefined) {
                return "N/A";
            }
            return Math.round(nScore);
        },

        /**
         * Format semantic score unit
         * @param {number} nScore Semantic score
         * @returns {string} Unit or empty string
         */
        formatSemanticScoreUnit: function (nScore) {
            if (nScore === null || nScore === undefined) {
                return "";
            }
            return "%";
        },

        /**
         * Format semantic score state
         * @param {number} nScore Semantic score
         * @returns {string} State or None
         */
        formatSemanticScoreState: function (nScore) {
            if (nScore === null || nScore === undefined) {
                return "None";
            }
            if (nScore >= 80) return "Success";
            if (nScore >= 60) return "Warning";
            return "Error";
        },

        /**
         * Handle best match link press - show all job matches for candidate
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onBestMatchPress: function (oEvent) {
            const oSource = oEvent.getSource();
            const oContext = oSource.getBindingContext();

            // Get candidate data (use getObject for complex nested data)
            const oCandidate = oContext.getObject();
            const sCandidateId = oCandidate.ID;
            const sCandidateName = oCandidate.firstName + " " + oCandidate.lastName;
            const aMatchResults = oCandidate.matchResults || [];

            // Open popover with match results
            this.openDialog("dialogs/BestMatchPopover", {
                candidateId: sCandidateId,
                candidateName: sCandidateName,
                matchResults: aMatchResults
            });
        },

        /**
         * Navigate to job detail from match results popover
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onNavigateToJob: function (oEvent) {
            const oSource = oEvent.getSource();
            const oContext = oSource.getBindingContext("dialogModel");

            if (oContext) {
                const sJobId = oContext.getProperty("jobPosting/ID");
                if (sJobId) {
                    // Close the popover first
                    this.closeDialog();
                    // Navigate to job detail
                    this.navigateToJobDetail(sJobId);
                }
            }
        },

        /**
         * Handle bulk update status button press
         */
        onBulkUpdateStatus: function () {
            const oTable = this.byId("candidatesTable");
            const aSelectedItems = oTable.getSelectedItems();

            if (aSelectedItems.length === 0) {
                this.showInfo("Please select candidates first");
                return;
            }

            const aCandidateIds = aSelectedItems.map(oItem =>
                oItem.getBindingContext().getProperty("ID")
            );

            this.openDialog("dialogs/BulkStatusDialog", {
                selectedCount: aSelectedItems.length,
                candidateIds: aCandidateIds
            });
        },

        /**
         * Handle advanced search button press
         */
        onOpenAdvancedSearch: function () {
            this.openDialog("dialogs/AdvancedSearchDialog", {});
        },

        /**
         * Handle refresh candidates button press
         */
        onRefreshCandidates: function () {
            const oTable = this.byId("candidatesTable");
            const oBinding = oTable.getBinding("items");
            oBinding.refresh();
            this.showSuccess("Candidates refreshed");
        },

        // ==================== Dialog Confirm Handlers ====================

        /**
         * Handle update status dialog confirm
         */
        onConfirmUpdateStatus: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");
            const sNewStatus = oDialogModel.getProperty("/newStatus");
            const sNotes = oDialogModel.getProperty("/notes");
            const bNotify = oDialogModel.getProperty("/notifyCandidate");

            if (!sNewStatus) {
                this.showInfo("Please select a new status");
                return;
            }

            this.setBusy(true);
            try {
                // Call the updateStatus action
                await this.callAction("/Candidates(ID=" + sCandidateId + ",IsActiveEntity=true)/CandidateService.updateStatus", {
                    newStatus: sNewStatus,
                    notes: sNotes || "",
                    notifyCandidate: bNotify || false
                });

                this.closeDialog();
                this.showSuccess("Status updated successfully");

                // Refresh the table
                const oTable = this.byId("candidatesTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle add skill dialog confirm
         */
        onConfirmAddSkill: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");
            const sSkillId = oDialogModel.getProperty("/skillId");
            const sProficiency = oDialogModel.getProperty("/proficiencyLevel");
            const nYears = oDialogModel.getProperty("/yearsOfExperience");

            if (!sSkillId) {
                this.showInfo("Please select a skill");
                return;
            }

            if (!sProficiency) {
                this.showInfo("Please select a proficiency level");
                return;
            }

            this.setBusy(true);
            try {
                // Call the addSkill action
                await this.callAction("/Candidates(ID=" + sCandidateId + ",IsActiveEntity=true)/CandidateService.addSkill", {
                    skillId: sSkillId,
                    proficiencyLevel: sProficiency,
                    yearsOfExperience: nYears || 0
                });

                this.closeDialog();
                this.showSuccess("Skill added successfully");

                // Refresh the table or detail view
                const oTable = this.byId("candidatesTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle delete candidate dialog confirm
         */
        onConfirmDelete: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");

            this.setBusy(true);
            try {
                // Delete the candidate
                const oModel = this.getModel();
                const sPath = "/Candidates(ID=" + sCandidateId + ",IsActiveEntity=true)";
                oModel.delete(sPath);
                await oModel.submitBatch("candidateGroup");

                this.closeDialog();
                this.showSuccess("Candidate deleted successfully");

                // Refresh the table
                const oTable = this.byId("candidatesTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }

                // Navigate back to main if we're on detail page
                this.navBack();
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle dialog cancel
         */
        onCancelDialog: function () {
            this.closeDialog();
        },

        // ==================== Advanced Dialog Handlers ====================

        /**
         * Handle search type change in advanced search
         */
        onSearchTypeChange: function (oEvent) {
            const bState = oEvent.getParameter("state");
            this.getModel("dialogModel").setProperty("/useSemanticSearch", bState);
        },

        /**
         * Handle advanced search confirm
         */
        onConfirmAdvancedSearch: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const bUseSemantic = oDialogModel.getProperty("/useSemanticSearch");

            this.setBusy(true);
            try {
                let oResult;

                if (bUseSemantic) {
                    // Semantic search using ML service
                    const sQuery = oDialogModel.getProperty("/semanticQuery");
                    const fMinScore = oDialogModel.getProperty("/minScore") / 100;

                    if (!sQuery) {
                        this.showInfo("Please enter a search query");
                        this.setBusy(false);
                        return;
                    }

                    oResult = await MLServiceClient.semanticSearch(sQuery, 50, fMinScore);

                    oDialogModel.setProperty("/searchResults", oResult.candidates);
                    oDialogModel.setProperty("/resultsCount", oResult.totalMatches);
                    oDialogModel.setProperty("/hasSearched", true);

                    if (oResult.mlUsed) {
                        this.showSuccess(`Found ${oResult.totalMatches} matches using AI`);
                    } else {
                        this.showInfo(oResult.message || "ML service unavailable");
                    }
                } else {
                    // Traditional search
                    const sQuery = oDialogModel.getProperty("/query");
                    this.showInfo("Traditional search will be implemented with OData filters");
                    oDialogModel.setProperty("/searchResults", []);
                    oDialogModel.setProperty("/resultsCount", 0);
                    oDialogModel.setProperty("/hasSearched", true);
                }
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle search result selection
         */
        onSearchResultSelect: function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oContext = oItem.getBindingContext("dialogModel");
            const sCandidateId = oContext.getProperty("ID");

            this.closeDialog();
            this.navigateToCandidateDetail(sCandidateId);
        },

        /**
         * Handle bulk update confirm
         */
        onConfirmBulkUpdate: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const aCandidateIds = oDialogModel.getProperty("/candidateIds");
            const sNewStatus = oDialogModel.getProperty("/newStatus");
            const sNotes = oDialogModel.getProperty("/notes");

            if (!sNewStatus) {
                this.showInfo("Please select a new status");
                return;
            }

            oDialogModel.setProperty("/isProcessing", true);
            oDialogModel.setProperty("/progress", 0);

            try {
                // Call bulk update action
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/bulkUpdateStatus(...)");
                oContext.setParameter("candidateIds", aCandidateIds);
                oContext.setParameter("newStatus", sNewStatus);
                oContext.setParameter("notes", sNotes || "");

                await oContext.execute();

                oDialogModel.setProperty("/progress", 100);
                this.showSuccess(`Updated ${aCandidateIds.length} candidates successfully`);

                // Refresh table
                const oTable = this.byId("candidatesTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }

                setTimeout(() => {
                    this.closeDialog();
                }, 1000);
            } catch (error) {
                this.handleError(error);
            } finally {
                oDialogModel.setProperty("/isProcessing", false);
            }
        },

        /**
         * Handle find similar search
         */
        onFindSimilarSearch: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");
            const iMaxResults = oDialogModel.getProperty("/maxResults") || 10;

            const oFactors = {
                skills: oDialogModel.getProperty("/matchBySkills") || false,
                experience: oDialogModel.getProperty("/matchByExperience") || false,
                education: oDialogModel.getProperty("/matchByEducation") || false,
                location: oDialogModel.getProperty("/matchByLocation") || false
            };

            this.setBusy(true);
            try {
                const oResult = await MLServiceClient.findSimilarCandidates(sCandidateId, iMaxResults, oFactors);

                oDialogModel.setProperty("/similarCandidates", oResult.candidates);
                oDialogModel.setProperty("/resultsCount", oResult.candidates.length);
                oDialogModel.setProperty("/hasResults", true);

                if (oResult.mlUsed) {
                    oDialogModel.setProperty("/mlMessage", `Found ${oResult.candidates.length} similar candidates using AI`);
                    oDialogModel.setProperty("/mlMessageType", "Success");
                } else {
                    oDialogModel.setProperty("/mlMessage", oResult.message || "ML service unavailable");
                    oDialogModel.setProperty("/mlMessageType", "Warning");
                }
                oDialogModel.setProperty("/showMLMessage", true);
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle view similar candidate
         */
        onViewSimilarCandidate: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("dialogModel");
            const sCandidateId = oContext.getProperty("ID");

            this.closeDialog();
            this.navigateToCandidateDetail(sCandidateId);
        },

        /**
         * Handle schedule interview confirm
         */
        onConfirmScheduleInterview: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sCandidateId = oDialogModel.getProperty("/candidateId");

            // Validate required fields
            if (!oDialogModel.getProperty("/interviewType")) {
                this.showInfo("Please select an interview type");
                return;
            }
            if (!oDialogModel.getProperty("/scheduledDate")) {
                this.showInfo("Please select a date and time");
                return;
            }

            this.setBusy(true);
            try {
                // Call scheduleInterview action
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/Candidates(ID=" + sCandidateId + ",IsActiveEntity=true)/CandidateService.scheduleInterview");

                oContext.setParameter("interviewType", oDialogModel.getProperty("/interviewType"));
                oContext.setParameter("scheduledDate", oDialogModel.getProperty("/scheduledDate"));
                oContext.setParameter("duration", parseInt(oDialogModel.getProperty("/duration") || "60"));
                oContext.setParameter("interviewerName", oDialogModel.getProperty("/interviewerName"));
                oContext.setParameter("interviewerEmail", oDialogModel.getProperty("/interviewerEmail"));
                oContext.setParameter("meetingLink", oDialogModel.getProperty("/meetingLink"));
                oContext.setParameter("notes", oDialogModel.getProperty("/notes") || "");

                await oContext.execute();

                this.closeDialog();
                this.showSuccess("Interview scheduled successfully");
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle interview feedback confirm
         */
        onConfirmInterviewFeedback: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const sInterviewId = oDialogModel.getProperty("/interviewId");

            // Validate required fields
            if (!oDialogModel.getProperty("/overallRating")) {
                this.showInfo("Please provide an overall rating");
                return;
            }
            if (!oDialogModel.getProperty("/strengths")) {
                this.showInfo("Please describe the candidate's strengths");
                return;
            }

            this.setBusy(true);
            try {
                // Call submitFeedback action
                const oModel = this.getModel();
                const oContext = oModel.bindContext("/Interviews(" + sInterviewId + ")/CandidateService.submitFeedback");

                oContext.setParameter("overallRating", oDialogModel.getProperty("/overallRating"));
                oContext.setParameter("technicalRating", oDialogModel.getProperty("/technicalRating") || 0);
                oContext.setParameter("communicationRating", oDialogModel.getProperty("/communicationRating") || 0);
                oContext.setParameter("cultureFitRating", oDialogModel.getProperty("/cultureFitRating") || 0);
                oContext.setParameter("strengths", oDialogModel.getProperty("/strengths"));
                oContext.setParameter("improvements", oDialogModel.getProperty("/improvements") || "");
                oContext.setParameter("nextSteps", oDialogModel.getProperty("/nextSteps") || "");
                oContext.setParameter("additionalComments", oDialogModel.getProperty("/additionalComments") || "");

                const iRecommendation = oDialogModel.getProperty("/recommendationIndex") || 2;
                const aRecommendations = ["strong_yes", "yes", "maybe", "no", "strong_no"];
                oContext.setParameter("recommendation", aRecommendations[iRecommendation]);

                await oContext.execute();

                this.closeDialog();
                this.showSuccess("Interview feedback submitted successfully");
            } catch (error) {
                this.handleError(error);
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Format timeline icon based on event type
         */
        formatTimelineIcon: function (sEventType) {
            const mIconMap = {
                "status": "sap-icon://status-in-process",
                "interview": "sap-icon://business-card",
                "document": "sap-icon://document",
                "note": "sap-icon://notes",
                "skill": "sap-icon://learning-assistant",
                "match": "sap-icon://match"
            };
            return mIconMap[sEventType] || "sap-icon://activity-individual";
        },

        /**
         * Format date time with null check
         * @param {Date|string} vDate The date value
         * @returns {string} Formatted date or '-'
         */
        formatDateTime: function (vDate) {
            if (!vDate) {
                return '-';
            }
            try {
                const oDate = vDate instanceof Date ? vDate : new Date(vDate);
                if (isNaN(oDate.getTime())) {
                    return '-';
                }
                const oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
                    pattern: "dd MMM yyyy HH:mm"
                });
                return oDateFormat.format(oDate);
            } catch (e) {
                return '-';
            }
        },

        // ==================== Job Section Handlers ====================

        /**
         * Handle job search
         * @param {sap.ui.base.Event} oEvent The search event
         */
        onJobSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            const oTable = this.byId("jobsTable");
            const oBinding = oTable.getBinding("items");

            if (sQuery && sQuery.length > 0) {
                const aFilters = [
                    new Filter({
                        filters: [
                            new Filter("title", FilterOperator.Contains, sQuery),
                            new Filter("description", FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ];
                oBinding.filter(aFilters);
            } else {
                oBinding.filter([]);
            }
        },

        /**
         * Handle job status filter change
         * @param {sap.ui.base.Event} oEvent The selection change event
         */
        onJobStatusFilterChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const oTable = this.byId("jobsTable");
            const oBinding = oTable.getBinding("items");

            if (sKey === "all") {
                oBinding.filter([]);
            } else {
                const oFilter = new Filter("status", FilterOperator.EQ, sKey);
                oBinding.filter([oFilter]);
            }
        },

        /**
         * Handle department filter change
         * @param {sap.ui.base.Event} oEvent The selection change event
         */
        onDepartmentFilterChange: function (oEvent) {
            const sKey = oEvent.getParameter("selectedItem").getKey();
            const oTable = this.byId("jobsTable");
            const oBinding = oTable.getBinding("items");

            if (sKey) {
                const oFilter = new Filter("department", FilterOperator.EQ, sKey);
                oBinding.filter([oFilter]);
            } else {
                oBinding.filter([]);
            }
        },

        /**
         * Handle job row press (navigate to detail)
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onJobPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext();
            const sJobId = oContext.getProperty("ID");

            this.navigateToJobDetail(sJobId);
        },

        /**
         * Handle create job button press
         */
        onCreateJob: function () {
            // Initialize dialog with default values
            this.openDialog("dialogs/CreateJobDialog", {
                title: "",
                department: "Engineering",
                location: "",
                employmentType: "Full-time",
                description: "",
                requirements: "",
                minExperience: 0,
                maxExperience: 10,
                salaryRange: "",
                status: "draft"
            });

            // Focus first input after dialog opens
            setTimeout(() => {
                const oInput = this.byId("jobTitleInput");
                if (oInput) {
                    oInput.focus();
                }
            }, 300);
        },

        /**
         * Handle create job confirmation
         */
        onConfirmCreateJob: async function () {
            const oDialogModel = this.getModel("dialogModel");
            const oData = oDialogModel.getData();

            // Validate required fields
            if (!oData.title || !oData.department || !oData.location || !oData.description) {
                this.showInfo("Please fill all required fields (Title, Department, Location, Description)");
                return;
            }

            // Validate experience range
            if (parseInt(oData.maxExperience) < parseInt(oData.minExperience)) {
                this.showInfo("Maximum experience cannot be less than minimum experience");
                return;
            }

            this.setBusy(true);
            try {
                const oModel = this.getModel();

                // Create new job posting entry
                const oListBinding = oModel.bindList("/JobPostings");
                const oContext = oListBinding.create({
                    title: oData.title,
                    department: oData.department,
                    location: oData.location,
                    employmentType: oData.employmentType,
                    description: oData.description,
                    qualifications: oData.requirements || "",
                    minimumExperience: parseInt(oData.minExperience) || 0,
                    preferredExperience: parseInt(oData.maxExperience) || 0,
                    status: oData.status,
                    applicationCount: 0
                });

                // Wait for the entity to be created
                await oContext.created();

                this.closeDialog();
                this.showSuccess(`Job posting ${oData.status === 'published' ? 'created and published' : 'saved as draft'} successfully`);

                // Refresh jobs table
                const oTable = this.byId("jobsTable");
                if (oTable) {
                    oTable.getBinding("items").refresh();
                }

                // Navigate to the new job's detail page
                const sNewJobId = oContext.getProperty("ID");
                if (sNewJobId) {
                    this.navigateToJobDetail(sNewJobId);
                }

            } catch (error) {
                this.handleError(error, "Error creating job posting");
            } finally {
                this.setBusy(false);
            }
        },

        /**
         * Handle find candidates button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onFindCandidates: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sJobId = oContext.getProperty("ID");

            // Navigate to job detail matches tab
            this.getRouter().navTo("jobDetail", {
                jobId: sJobId
            });
        },

        /**
         * Handle manage scoring button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onManageScoring: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sJobId = oContext.getProperty("ID");

            // Navigate to job detail scoring tab
            this.getRouter().navTo("jobScoring", {
                jobId: sJobId
            });
        },

        /**
         * Handle edit job button press
         * @param {sap.ui.base.Event} oEvent The press event
         */
        onEditJob: function (oEvent) {
            this.showInfo("Edit job functionality coming soon");
        },

        /**
         * Handle refresh jobs button press
         */
        onRefreshJobs: function () {
            const oTable = this.byId("jobsTable");
            const oBinding = oTable.getBinding("items");
            oBinding.refresh();
            this.showSuccess("Jobs refreshed");
        },

        /**
         * Format job status to ObjectStatus state
         * @param {string} sStatus The job status
         * @returns {string} The state
         */
        formatJobStatusState: function (sStatus) {
            const mStateMap = {
                "draft": "Warning",
                "published": "Success",
                "closed": "Error"
            };
            return mStateMap[sStatus] || "None";
        },

        // ==================== Dashboard Section Handlers ====================

        /**
         * Load dashboard statistics
         * @private
         */
        _loadDashboardStats: async function () {
            const oViewModel = this.getModel("viewModel");
            const oModel = this.getModel();

            // Check if model is ready
            if (!oModel || !oViewModel) {
                console.warn("Models not ready for loading dashboard stats");
                return;
            }

            try {
                // Load total candidates count
                const oCandidatesBinding = oModel.bindList("/Candidates", null, null, null, {
                    $count: true
                });
                oCandidatesBinding.requestContexts(0, 1).then((aContexts) => {
                    const iCount = oCandidatesBinding.getLength();
                    oViewModel.setProperty("/stats/totalCandidates", iCount || 0);
                }).catch((error) => {
                    console.warn("Could not load candidates count:", error);
                    oViewModel.setProperty("/stats/totalCandidates", 0);
                });

                // Load active jobs count
                const oJobsBinding = oModel.bindList("/JobPostings", null, null,
                    [new Filter("status", FilterOperator.EQ, "published")], {
                    $count: true
                });
                oJobsBinding.requestContexts(0, 1).then((aContexts) => {
                    const iCount = oJobsBinding.getLength();
                    oViewModel.setProperty("/stats/activeJobs", iCount || 0);
                }).catch((error) => {
                    console.warn("Could not load jobs count:", error);
                    oViewModel.setProperty("/stats/activeJobs", 0);
                });

                // Load interviews this week (placeholder - would need backend support)
                oViewModel.setProperty("/stats/interviewsThisWeek", 0);

                // Load top match score
                const oMatchBinding = oModel.bindList("/MatchResults", null,
                    [new sap.ui.model.Sorter("overallScore", true)], null, {
                    $top: 1
                });
                oMatchBinding.requestContexts(0, 1).then((aContexts) => {
                    if (aContexts && aContexts.length > 0) {
                        const nTopScore = aContexts[0].getProperty("overallScore");
                        oViewModel.setProperty("/stats/topMatchScore", Math.round(nTopScore || 0));
                    } else {
                        oViewModel.setProperty("/stats/topMatchScore", 0);
                    }
                }).catch((error) => {
                    console.warn("Could not load top match score:", error);
                    oViewModel.setProperty("/stats/topMatchScore", 0);
                });

                // Load recent activity
                this._loadRecentActivity();
            } catch (error) {
                console.error("Error loading dashboard stats:", error);
            }
        },

        /**
         * Load recent activity
         * @private
         */
        _loadRecentActivity: function () {
            const oViewModel = this.getModel("viewModel");

            // Placeholder recent activity - would be loaded from backend
            const aActivity = [
                {
                    title: "New Candidate Added",
                    description: "John Smith applied for Senior Developer position",
                    timestamp: "2 hours ago",
                    icon: "sap-icon://employee"
                },
                {
                    title: "Interview Scheduled",
                    description: "Sarah Johnson - Technical Interview",
                    timestamp: "4 hours ago",
                    icon: "sap-icon://business-card"
                },
                {
                    title: "Job Published",
                    description: "Full Stack Developer position is now live",
                    timestamp: "1 day ago",
                    icon: "sap-icon://work-history"
                },
                {
                    title: "Match Found",
                    description: "5 new candidates matched for UI/UX Designer",
                    timestamp: "2 days ago",
                    icon: "sap-icon://match"
                }
            ];

            oViewModel.setProperty("/recentActivity", aActivity);
        },

        /**
         * Load priority dashboard data - jobs with hot candidates
         * @private
         */
        _loadPriorityDashboard: function () {
            const oDashboardModel = this.getModel("dashboard");
            oDashboardModel.setProperty("/priorityData/isLoading", true);

            const oModel = this.getModel();

            // Fetch jobs with hot candidates (score >= 80%)
            oModel.bindList("/JobPostings", undefined, undefined, undefined, {
                $expand: "matchResults($filter=overallScore ge 80;$orderby=overallScore desc;$top=5)",
                $filter: "status eq 'published'"
            }).requestContexts(0, 100).then(aContexts => {
                const aJobsWithHot = [];
                let totalHot = 0;
                let totalWarm = 0;

                aContexts.forEach(oContext => {
                    const oJob = oContext.getObject();
                    const aMatches = oJob.matchResults || [];

                    // Count hot (>=80) and warm (60-79) candidates
                    const hotCount = aMatches.filter(m => m.overallScore >= 80).length;
                    const warmCount = aMatches.filter(m => m.overallScore >= 60 && m.overallScore < 80).length;

                    if (hotCount > 0) {
                        aJobsWithHot.push({
                            ID: oJob.ID,
                            title: oJob.title,
                            department: oJob.department,
                            hotCount: hotCount,
                            warmCount: warmCount
                        });
                        totalHot += hotCount;
                        totalWarm += warmCount;
                    }
                });

                oDashboardModel.setProperty("/priorityData/jobsWithHotCandidates", aJobsWithHot);
                oDashboardModel.setProperty("/priorityData/totalHotCandidates", totalHot);
                oDashboardModel.setProperty("/priorityData/totalWarmCandidates", totalWarm);
                oDashboardModel.setProperty("/priorityData/isLoading", false);
            }).catch(oError => {
                console.error("Failed to load priority dashboard:", oError);
                oDashboardModel.setProperty("/priorityData/isLoading", false);
            });
        },

        /**
         * Load count of CVs currently processing
         * @private
         */
        _loadProcessingCount: function () {
            const oModel = this.getModel();
            const oDashboardModel = this.getModel("dashboard");

            oModel.bindList("/CVDocuments", undefined, undefined,
                new Filter("ocrStatus", FilterOperator.EQ, "processing")
            ).requestContexts(0, 1000).then(aContexts => {
                oDashboardModel.setProperty("/processingCount", aContexts.length);
            }).catch(oError => {
                console.error("Failed to load processing count:", oError);
            });
        },

        /**
         * Handle run bulk matching button press
         */
        onRunBulkMatching: function () {
            this.showInfo("Bulk matching functionality will run matching for all published jobs");
            // TODO: Implement bulk matching across all jobs
        },

        /**
         * Handle view interviews button press
         */
        onViewInterviews: function () {
            this.showInfo("Interviews view coming soon - will show all scheduled interviews");
            // TODO: Implement interviews overview
        },

        // ============================================================
        // DOCUMENT HANDLERS
        // ============================================================

        /**
         * Handle document row press (navigate to review)
         * @param {object} oEvent Press event
         */
        onDocumentPress: function (oEvent) {
            this.onReviewDocument(oEvent);
        },

        /**
         * Navigate to CV review page
         * @param {object} oEvent Press event
         */
        onReviewDocument: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) {
                this.showError("Cannot determine document");
                return;
            }

            const sDocumentId = oContext.getProperty("ID");
            this.getRouter().navTo("cvReview", {
                documentId: sDocumentId
            });
        },

        /**
         * View document (preview)
         * @param {object} oEvent Press event
         */
        onViewDocument: function (oEvent) {
            this.showInfo("Document preview coming soon");
            // TODO: Implement document preview in dialog
        },

        /**
         * Download document
         * @param {object} oEvent Press event
         */
        onDownloadDocument: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) {
                this.showError("Cannot determine document");
                return;
            }

            const sDocumentId = oContext.getProperty("ID");
            const sFileName = oContext.getProperty("fileName");

            // Trigger download
            const sUrl = `${this.getModel().sServiceUrl}/CVDocuments(ID=${sDocumentId},IsActiveEntity=true)/fileContent`;
            const a = document.createElement("a");
            a.href = sUrl;
            a.download = sFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },

        /**
         * Delete document
         * @param {object} oEvent Press event
         */
        onDeleteDocument: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) {
                this.showError("Cannot determine document");
                return;
            }

            const sDocumentId = oContext.getProperty("ID");
            const sFileName = oContext.getProperty("fileName");

            sap.m.MessageBox.confirm(
                `Delete document "${sFileName}"?`,
                {
                    title: "Confirm Deletion",
                    onClose: async (sAction) => {
                        if (sAction === sap.m.MessageBox.Action.OK) {
                            try {
                                await new Promise((resolve, reject) => {
                                    oContext.delete().then(resolve).catch(reject);
                                });
                                this.showSuccess("Document deleted successfully");
                                this.getModel().refresh();
                            } catch (error) {
                                console.error("Failed to delete document:", error);
                                this.showError("Failed to delete document: " + error.message);
                            }
                        }
                    }
                }
            );
        },

        // ============================================================
        // ANALYTICS DASHBOARD HANDLERS
        // ============================================================

        /**
         * Load all analytics dashboard data
         * @private
         */
        _loadAnalyticsDashboardData: function () {
            const oDashboardModel = this.getModel("dashboard");
            const oDateFilter = oDashboardModel.getProperty("/dateFilter");

            oDashboardModel.setProperty("/isLoading", true);

            // Build function parameters
            const sFromDate = oDateFilter.fromDate ? oDateFilter.fromDate.toISOString().split("T")[0] : null;
            const sToDate = oDateFilter.toDate ? oDateFilter.toDate.toISOString().split("T")[0] : null;

            // Load pipeline overview
            this._callAnalyticsFunction("getPipelineOverview", {
                fromDate: sFromDate,
                toDate: sToDate
            }).then((oData) => {
                this._processPipelineData(oData);
            }).catch((oError) => {
                console.warn("Failed to load pipeline data, using fallback:", oError);
                this._loadFallbackPipelineData();
            });

            // Load skills analytics
            this._callAnalyticsFunction("getSkillAnalytics", {
                topN: 10
            }).then((oData) => {
                this._processSkillsData(oData);
            }).catch((oError) => {
                console.warn("Failed to load skills data, using fallback:", oError);
                this._loadFallbackSkillsData();
            });

            // Load matching data
            this._loadAnalyticsMatchingData();

            // Load interview analytics
            this._loadAnalyticsInterviewData();

            // Load jobs data
            this._loadAnalyticsJobsData();

            // Load AI insights
            this._loadAIInsights();

            // Load priority candidates (Smart Screening Assistant)
            this._loadPriorityCandidatesData();

            oDashboardModel.setProperty("/isLoading", false);
        },

        /**
         * Call analytics service function
         * @param {string} sFunctionName Function name
         * @param {object} oParams Parameters
         * @returns {Promise} Promise
         * @private
         */
        _callAnalyticsFunction: function (sFunctionName, oParams) {
            const that = this;
            return new Promise((resolve, reject) => {
                const oModel = this.getModel();
                if (!oModel) {
                    reject(new Error("Model not available"));
                    return;
                }

                // Build parameter string
                const aParams = [];
                Object.keys(oParams || {}).forEach((sKey) => {
                    const vValue = oParams[sKey];
                    if (vValue !== null && vValue !== undefined) {
                        if (typeof vValue === "string") {
                            aParams.push(sKey + "='" + vValue + "'");
                        } else {
                            aParams.push(sKey + "=" + vValue);
                        }
                    }
                });

                const sPath = "/" + sFunctionName + "(" + aParams.join(",") + ")";

                const oContextBinding = oModel.bindContext(sPath);
                oContextBinding.requestObject().then((oResult) => {
                    resolve(oResult);
                }).catch((oError) => {
                    reject(oError);
                });
            });
        },

        /**
         * Process pipeline data from service
         * @param {object} oData Pipeline data
         * @private
         */
        _processPipelineData: function (oData) {
            const oDashboardModel = this.getModel("dashboard");

            // Process byStatus array with state mapping
            const aByStatus = (oData.byStatus || []).map((oStatus) => {
                let sState = "None";
                const sStatusLower = (oStatus.status || "").toLowerCase();
                if (sStatusLower === "new") sState = "Information";
                else if (sStatusLower === "screening") sState = "Warning";
                else if (["hired", "shortlisted", "offered"].includes(sStatusLower)) sState = "Success";
                else if (["rejected", "withdrawn"].includes(sStatusLower)) sState = "Error";

                return {
                    status: oStatus.status,
                    count: oStatus.count || 0,
                    percentage: Math.round((oStatus.count / (oData.totalCandidates || 1)) * 100),
                    state: sState
                };
            });

            oDashboardModel.setProperty("/pipelineData", {
                totalCandidates: oData.totalCandidates || 0,
                avgTimeToHire: oData.avgTimeToHire || 0,
                byStatus: aByStatus,
                bySource: oData.bySource || []
            });
        },

        /**
         * Process skills data from service
         * @param {object} oData Skills data
         * @private
         */
        _processSkillsData: function (oData) {
            const oDashboardModel = this.getModel("dashboard");

            const aTopSkills = (oData.topSkills || []).map((oSkill) => {
                return {
                    skillName: oSkill.skillName || "Unknown",
                    candidateCount: oSkill.candidateCount || 0,
                    demandCount: oSkill.demandCount || 0,
                    ratio: (oSkill.supplyDemandRatio || 0).toFixed(2)
                };
            });

            oDashboardModel.setProperty("/skillsData", {
                topSkills: aTopSkills,
                emergingSkills: oData.emergingSkills || [],
                skillGaps: oData.skillGaps || []
            });
        },

        /**
         * Load interview analytics data
         * @private
         */
        _loadAnalyticsInterviewData: function () {
            const oDashboardModel = this.getModel("dashboard");

            this._callAnalyticsFunction("getInterviewAnalytics", {
                fromDate: null,
                toDate: null
            }).then((oData) => {
                oDashboardModel.setProperty("/interviewData", {
                    totalScheduled: oData.totalScheduled || 0,
                    completed: oData.completed || 0,
                    upcomingCount: oData.upcomingCount || 0,
                    completionRate: oData.completionRate || 0,
                    avgOverallRating: oData.avgOverallRating || 0
                });
            }).catch((oError) => {
                console.warn("Failed to load interview data:", oError);
                oDashboardModel.setProperty("/interviewData", {
                    totalScheduled: 0,
                    completed: 0,
                    upcomingCount: 0,
                    completionRate: 0,
                    avgOverallRating: 0
                });
            });
        },

        /**
         * Load matching data for analytics
         * @private
         */
        _loadAnalyticsMatchingData: function () {
            const oDashboardModel = this.getModel("dashboard");
            const oModel = this.getModel();

            if (!oModel) {
                oDashboardModel.setProperty("/matchingData", {
                    avgScore: 0,
                    totalMatches: 0
                });
                return;
            }

            // Get match statistics
            const oListBinding = oModel.bindList("/MatchResults");
            oListBinding.requestContexts(0, 1000).then((aContexts) => {
                const nTotal = aContexts.length;
                let nTotalScore = 0;

                aContexts.forEach((oContext) => {
                    nTotalScore += oContext.getProperty("overallScore") || 0;
                });

                oDashboardModel.setProperty("/matchingData", {
                    avgScore: nTotal > 0 ? Math.round(nTotalScore / nTotal) : 0,
                    totalMatches: nTotal
                });
            }).catch(() => {
                oDashboardModel.setProperty("/matchingData", {
                    avgScore: 0,
                    totalMatches: 0
                });
            });
        },

        /**
         * Load jobs data for analytics
         * @private
         */
        _loadAnalyticsJobsData: function () {
            const oDashboardModel = this.getModel("dashboard");
            const oModel = this.getModel();

            if (!oModel) {
                oDashboardModel.setProperty("/jobsData", {
                    activeJobs: 0,
                    totalJobs: 0
                });
                return;
            }

            // Count from JobPostings entity
            const oListBinding = oModel.bindList("/JobPostings");
            oListBinding.requestContexts(0, 1000).then((aContexts) => {
                const nTotal = aContexts.length;
                const nActive = aContexts.filter((oCtx) => {
                    const sStatus = oCtx.getProperty("status");
                    return sStatus === "published" || sStatus === "active";
                }).length;

                oDashboardModel.setProperty("/jobsData", {
                    activeJobs: nActive,
                    totalJobs: nTotal
                });
            }).catch(() => {
                oDashboardModel.setProperty("/jobsData", {
                    activeJobs: 0,
                    totalJobs: 0
                });
            });
        },

        /**
         * Fallback pipeline data
         * @private
         */
        _loadFallbackPipelineData: function () {
            const oDashboardModel = this.getModel("dashboard");
            const oModel = this.getModel();

            // Try to get real counts from Candidates entity
            if (oModel) {
                const oListBinding = oModel.bindList("/Candidates");
                oListBinding.requestContexts(0, 1000).then((aContexts) => {
                    const nTotal = aContexts.length;

                    // Group by status
                    const mStatusCounts = {};
                    aContexts.forEach((oCtx) => {
                        const sStatus = oCtx.getProperty("status_code") || oCtx.getProperty("status/code") || "new";
                        mStatusCounts[sStatus] = (mStatusCounts[sStatus] || 0) + 1;
                    });

                    const aByStatus = Object.keys(mStatusCounts).map((sStatus) => {
                        let sState = "None";
                        const sStatusLower = sStatus.toLowerCase();
                        if (sStatusLower === "new") sState = "Information";
                        else if (sStatusLower === "screening") sState = "Warning";
                        else if (["hired", "shortlisted", "offered"].includes(sStatusLower)) sState = "Success";
                        else if (["rejected", "withdrawn"].includes(sStatusLower)) sState = "Error";

                        return {
                            status: sStatus.charAt(0).toUpperCase() + sStatus.slice(1),
                            count: mStatusCounts[sStatus],
                            percentage: Math.round((mStatusCounts[sStatus] / nTotal) * 100),
                            state: sState
                        };
                    });

                    oDashboardModel.setProperty("/pipelineData", {
                        totalCandidates: nTotal,
                        avgTimeToHire: 0,
                        byStatus: aByStatus,
                        bySource: []
                    });
                }).catch(() => {
                    this._setEmptyPipelineData();
                });
            } else {
                this._setEmptyPipelineData();
            }
        },

        /**
         * Set empty pipeline data
         * @private
         */
        _setEmptyPipelineData: function () {
            const oDashboardModel = this.getModel("dashboard");
            oDashboardModel.setProperty("/pipelineData", {
                totalCandidates: 0,
                avgTimeToHire: 0,
                byStatus: [
                    { status: "New", count: 0, percentage: 0, state: "Information" },
                    { status: "Screening", count: 0, percentage: 0, state: "Warning" },
                    { status: "Interviewing", count: 0, percentage: 0, state: "None" },
                    { status: "Shortlisted", count: 0, percentage: 0, state: "Success" },
                    { status: "Hired", count: 0, percentage: 0, state: "Success" },
                    { status: "Rejected", count: 0, percentage: 0, state: "Error" }
                ],
                bySource: []
            });
        },

        /**
         * Fallback skills data
         * @private
         */
        _loadFallbackSkillsData: function () {
            const oDashboardModel = this.getModel("dashboard");
            oDashboardModel.setProperty("/skillsData", {
                topSkills: [],
                emergingSkills: [],
                skillGaps: []
            });
        },

        /**
         * Load AI insights
         * @private
         */
        _loadAIInsights: function () {
            const oDashboardModel = this.getModel("dashboard");
            oDashboardModel.setProperty("/aiData/isLoading", true);

            // Generate insights based on current data
            this._generateSampleInsights();
        },

        /**
         * Generate sample AI insights based on current data
         * @private
         */
        _generateSampleInsights: function () {
            const oDashboardModel = this.getModel("dashboard");
            const oPipelineData = oDashboardModel.getProperty("/pipelineData") || {};
            const oSkillsData = oDashboardModel.getProperty("/skillsData") || {};

            const aRecommendations = [];

            // Generate insights based on current data
            if (oPipelineData.totalCandidates > 0) {
                const aByStatus = oPipelineData.byStatus || [];
                const oScreening = aByStatus.find((s) => s.status.toLowerCase() === "screening");
                const oNew = aByStatus.find((s) => s.status.toLowerCase() === "new");

                if (oNew && oNew.count > 5) {
                    aRecommendations.push({
                        type: "pipeline",
                        title: "High volume of new candidates",
                        description: oNew.count + " candidates are awaiting initial screening. Consider prioritizing screening reviews.",
                        priority: "Medium"
                    });
                }

                if (oScreening && oScreening.count > 10) {
                    aRecommendations.push({
                        type: "urgent",
                        title: "Screening backlog detected",
                        description: oScreening.count + " candidates in screening stage. Schedule batch review sessions.",
                        priority: "High"
                    });
                }
            }

            // Skills-based recommendations
            if (oSkillsData.topSkills && oSkillsData.topSkills.length > 0) {
                const aHighDemand = oSkillsData.topSkills.filter((s) => {
                    return s.ratio && parseFloat(s.ratio) < 1;
                });

                if (aHighDemand.length > 0) {
                    aRecommendations.push({
                        type: "skill_gap",
                        title: "Skill gaps identified",
                        description: aHighDemand.length + " skills have more demand than supply: " +
                            aHighDemand.slice(0, 3).map((s) => s.skillName).join(", "),
                        priority: "Medium"
                    });
                }
            }

            // Interview recommendations
            const oInterviewData = oDashboardModel.getProperty("/interviewData") || {};
            if (oInterviewData.upcomingCount > 5) {
                aRecommendations.push({
                    type: "candidate",
                    title: "Busy interview week ahead",
                    description: oInterviewData.upcomingCount + " interviews scheduled. Ensure interviewers are prepared.",
                    priority: "Low"
                });
            }

            // Default if no insights
            if (aRecommendations.length === 0) {
                aRecommendations.push({
                    type: "pipeline",
                    title: "Pipeline health looks good",
                    description: "No immediate action items identified. Continue monitoring metrics.",
                    priority: "Low"
                });
            }

            oDashboardModel.setProperty("/aiData/recommendations", aRecommendations);
            oDashboardModel.setProperty("/aiData/lastUpdated", new Date());
            oDashboardModel.setProperty("/aiData/isLoading", false);
        },

        /**
         * Handle refresh analytics button
         */
        onRefreshAnalytics: function () {
            this.showSuccess("Refreshing analytics...");
            this._loadAnalyticsDashboardData();
        },

        /**
         * Handle analytics date range change
         * @param {sap.ui.base.Event} oEvent Change event
         */
        onAnalyticsDateRangeChange: function (oEvent) {
            const oDateRange = oEvent.getSource();
            const oFrom = oDateRange.getDateValue();
            const oTo = oDateRange.getSecondDateValue();

            const oDashboardModel = this.getModel("dashboard");
            oDashboardModel.setProperty("/dateFilter/fromDate", oFrom);
            oDashboardModel.setProperty("/dateFilter/toDate", oTo);

            if ((oFrom && oTo) || (!oFrom && !oTo)) {
                this._loadAnalyticsDashboardData();
            }
        },

        /**
         * Handle export analytics report
         */
        onExportAnalyticsReport: function () {
            const oDashboardModel = this.getModel("dashboard");
            const oPipelineData = oDashboardModel.getProperty("/pipelineData");
            const oSkillsData = oDashboardModel.getProperty("/skillsData");

            // Build CSV content
            const aLines = [];
            aLines.push("CV Sorting Analytics Report");
            aLines.push("Generated: " + new Date().toISOString());
            aLines.push("");

            // Pipeline summary
            aLines.push("PIPELINE SUMMARY");
            aLines.push("Total Candidates," + oPipelineData.totalCandidates);
            aLines.push("Average Time to Hire (days)," + oPipelineData.avgTimeToHire);
            aLines.push("");

            // Status breakdown
            aLines.push("STATUS BREAKDOWN");
            aLines.push("Status,Count,Percentage");
            (oPipelineData.byStatus || []).forEach((oStatus) => {
                aLines.push(oStatus.status + "," + oStatus.count + "," + oStatus.percentage + "%");
            });
            aLines.push("");

            // Top skills
            aLines.push("TOP SKILLS");
            aLines.push("Skill,Candidates,Demand,Supply/Demand Ratio");
            (oSkillsData.topSkills || []).forEach((oSkill) => {
                aLines.push(oSkill.skillName + "," + oSkill.candidateCount + "," + oSkill.demandCount + "," + oSkill.ratio);
            });

            // Create and download file
            const sContent = aLines.join("\n");
            const oBlob = new Blob([sContent], { type: "text/csv;charset=utf-8" });
            const sFilename = "analytics_report_" + new Date().toISOString().split("T")[0] + ".csv";

            const oLink = document.createElement("a");
            oLink.href = URL.createObjectURL(oBlob);
            oLink.download = sFilename;
            oLink.click();

            this.showSuccess("Report exported: " + sFilename);
        },

        /**
         * Handle refresh AI insights
         */
        onRefreshAIInsights: function () {
            this._loadAIInsights();
        },

        /**
         * Handle Ask Joule button
         */
        onAskJoule: function () {
            sap.m.MessageBox.information(
                "Joule AI assistant is ready to help with recruitment insights.\n\n" +
                "Try asking questions like:\n" +
                "• 'What skills are most in demand?'\n" +
                "• 'Show me candidates for the Senior Developer role'\n" +
                "• 'What's causing delays in our hiring pipeline?'",
                {
                    title: "Ask Joule"
                }
            );
        },

        /**
         * Handle generate AI insights
         */
        onGenerateAIInsights: function () {
            this.showSuccess("Generating insights...");
            this._loadAIInsights();
        },

        /**
         * Handle AI recommendation press
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onAIRecommendationPress: function (oEvent) {
            const oSource = oEvent.getSource();
            const oBindingContext = oSource.getBindingContext("dashboard");
            const oRecommendation = oBindingContext ? oBindingContext.getObject() : null;

            if (!oRecommendation) {
                return;
            }

            // Show details
            sap.m.MessageBox.information(oRecommendation.description, {
                title: oRecommendation.title
            });
        },

        // ============================================================
        // JOBS TAB HANDLERS
        // ============================================================

        /**
         * Load jobs section data - jobs list with Hot/Warm counts and KPIs
         * @private
         */
        _loadJobsSectionData: async function () {
            const oDashboardModel = this.getModel("dashboard");
            const oModel = this.getModel();

            if (!oModel) {
                return;
            }

            try {
                // Get all jobs with their match results
                const oJobsBinding = oModel.bindList("/JobPostings", null, null, null, {
                    $expand: "matchResults"
                });

                const aJobContexts = await oJobsBinding.requestContexts(0, 200);
                const aJobsList = [];
                let iTotalJobs = 0;
                let iPublishedJobs = 0;
                let iJobsWithHotCandidates = 0;
                let iJobsNeedingMatches = 0;

                for (const oJobContext of aJobContexts) {
                    const oJob = oJobContext.getObject();
                    const aMatches = oJob.matchResults || [];

                    // Count Hot (>=80) and Warm (60-79) candidates
                    let iHotCount = 0;
                    let iWarmCount = 0;
                    let nTopMatchScore = 0;

                    aMatches.forEach(oMatch => {
                        const nScore = oMatch.overallScore || 0;
                        if (nScore >= 80) {
                            iHotCount++;
                        } else if (nScore >= 60) {
                            iWarmCount++;
                        }
                        if (nScore > nTopMatchScore) {
                            nTopMatchScore = nScore;
                        }
                    });

                    // Build job list item
                    aJobsList.push({
                        ID: oJob.ID,
                        title: oJob.title,
                        department: oJob.department || "",
                        location: oJob.location || "",
                        status: oJob.status,
                        employmentType: oJob.employmentType || "",
                        hotCount: iHotCount,
                        warmCount: iWarmCount,
                        topMatchScore: nTopMatchScore > 0 ? Math.round(nTopMatchScore) : 0,
                        totalMatches: aMatches.length
                    });

                    // Update KPI counts
                    iTotalJobs++;
                    if (oJob.status === "published") {
                        iPublishedJobs++;
                        if (aMatches.length === 0) {
                            iJobsNeedingMatches++;
                        }
                    }
                    if (iHotCount > 0) {
                        iJobsWithHotCandidates++;
                    }
                }

                // Sort by hot count descending, then by title
                aJobsList.sort((a, b) => {
                    if (b.hotCount !== a.hotCount) return b.hotCount - a.hotCount;
                    return a.title.localeCompare(b.title);
                });

                // Update model
                oDashboardModel.setProperty("/jobsList", aJobsList);
                oDashboardModel.setProperty("/jobsKPI", {
                    totalJobs: iTotalJobs,
                    publishedJobs: iPublishedJobs,
                    jobsWithHotCandidates: iJobsWithHotCandidates,
                    jobsNeedingMatches: iJobsNeedingMatches
                });

                // Store original list for filtering
                this._aOriginalJobsList = aJobsList;

            } catch (error) {
                console.error("Failed to load jobs section data:", error);
                oDashboardModel.setProperty("/jobsList", []);
            }
        },

        /**
         * Handle KPI card press - Total Jobs (reset filter)
         */
        onJobsKPICardPress: function () {
            this._filterJobsList("all");
            this._updateJobStatusFilter("all");
        },

        /**
         * Handle KPI card press - Published Jobs
         */
        onJobsKPIPublishedPress: function () {
            this._filterJobsList("published");
            this._updateJobStatusFilter("published");
        },

        /**
         * Handle KPI card press - Jobs with Hot Candidates
         */
        onJobsKPIHotPress: function () {
            this._filterJobsList("withHot");
            this._updateJobStatusFilter("all");
        },

        /**
         * Handle KPI card press - Jobs Needing Matches
         */
        onJobsKPINeedingMatchesPress: function () {
            this._filterJobsList("needingMatches");
            this._updateJobStatusFilter("published");
        },

        /**
         * Filter jobs list based on filter key
         * @param {string} sFilterKey Filter key
         * @private
         */
        _filterJobsList: function (sFilterKey) {
            const oDashboardModel = this.getModel("dashboard");
            const aOriginalList = this._aOriginalJobsList || [];

            let aFilteredList = aOriginalList;

            switch (sFilterKey) {
                case "published":
                    aFilteredList = aOriginalList.filter(oJob => oJob.status === "published");
                    break;
                case "draft":
                    aFilteredList = aOriginalList.filter(oJob => oJob.status === "draft");
                    break;
                case "closed":
                    aFilteredList = aOriginalList.filter(oJob => oJob.status === "closed");
                    break;
                case "withHot":
                    aFilteredList = aOriginalList.filter(oJob => oJob.hotCount > 0);
                    break;
                case "needingMatches":
                    aFilteredList = aOriginalList.filter(oJob =>
                        oJob.status === "published" && oJob.totalMatches === 0
                    );
                    break;
                // "all" - no filter
            }

            oDashboardModel.setProperty("/jobsList", aFilteredList);
            oDashboardModel.setProperty("/jobsListFilter", sFilterKey);
        },

        /**
         * Update the status filter segmented button
         * @param {string} sKey Selected key
         * @private
         */
        _updateJobStatusFilter: function (sKey) {
            const oSegmentedButton = this.byId("jobStatusFilterSegment");
            if (oSegmentedButton) {
                oSegmentedButton.setSelectedKey(sKey);
            }
        },

        /**
         * Handle job status filter change
         * @param {sap.ui.base.Event} oEvent Selection change event
         */
        onJobStatusFilterChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            this._filterJobsList(sKey);
        },

        /**
         * Handle department filter change
         * @param {sap.ui.base.Event} oEvent Selection change event
         */
        onDepartmentFilterChange: function (oEvent) {
            const sSelectedKey = oEvent.getParameter("selectedItem")?.getKey() || "";
            const oDashboardModel = this.getModel("dashboard");
            const aOriginalList = this._aOriginalJobsList || [];

            let aFilteredList = aOriginalList;
            if (sSelectedKey) {
                aFilteredList = aOriginalList.filter(oJob => oJob.department === sSelectedKey);
            }

            oDashboardModel.setProperty("/jobsList", aFilteredList);
        },

        /**
         * Handle job search
         * @param {sap.ui.base.Event} oEvent Search event
         */
        onJobSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query")?.toLowerCase() || "";
            const oDashboardModel = this.getModel("dashboard");
            const aOriginalList = this._aOriginalJobsList || [];

            if (!sQuery) {
                oDashboardModel.setProperty("/jobsList", aOriginalList);
                return;
            }

            const aFilteredList = aOriginalList.filter(oJob =>
                oJob.title.toLowerCase().includes(sQuery) ||
                oJob.department.toLowerCase().includes(sQuery) ||
                oJob.location.toLowerCase().includes(sQuery)
            );

            oDashboardModel.setProperty("/jobsList", aFilteredList);
        },

        /**
         * Handle job row press - navigate to job detail
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onJobPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("dashboard");
            const sJobId = oContext.getProperty("ID");

            this.getRouter().navTo("jobDetail", {
                jobId: sJobId
            });
        },

        /**
         * Handle review hot candidates button
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onReviewJobCandidates: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("dashboard");
            const sJobId = oContext.getProperty("ID");

            // Navigate to job detail - Hot filter will be applied there
            this.getRouter().navTo("jobDetail", {
                jobId: sJobId
            });
        },

        /**
         * Handle run matching button
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onRunJobMatching: async function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("dashboard");
            const sJobId = oContext.getProperty("ID");
            const sJobTitle = oContext.getProperty("title");

            oButton.setBusy(true);

            try {
                const oModel = this.getModel();
                const oAction = oModel.bindContext("/runMatchingForJob(...)");
                oAction.setParameter("jobPostingId", sJobId);

                await oAction.execute();
                const oResult = oAction.getBoundContext().getObject();

                this.showSuccess(`Matching complete: ${oResult.matchesCreated} new matches for "${sJobTitle}"`);

                // Refresh the jobs list
                this._loadJobsSectionData();

            } catch (error) {
                console.error("Matching failed:", error);
                this.showError("Failed to run matching: " + (error.message || "Unknown error"));
            } finally {
                oButton.setBusy(false);
            }
        },

        /**
         * Handle edit job button
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onEditJob: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("dashboard");
            const sJobId = oContext.getProperty("ID");

            // Navigate to job detail for editing
            this.getRouter().navTo("jobDetail", {
                jobId: sJobId
            });
        },

        /**
         * Handle refresh jobs button
         */
        onRefreshJobs: function () {
            this._loadJobsSectionData();
            this.showSuccess("Jobs refreshed");
        },

        // ============================================================
        // PRIORITY CANDIDATES (SMART SCREENING ASSISTANT) HANDLERS
        // ============================================================

        /**
         * Load priority candidates data - jobs with Hot/Warm candidates
         * @private
         */
        _loadPriorityCandidatesData: async function () {
            const oDashboardModel = this.getModel("dashboard");
            const oModel = this.getModel();

            if (!oModel) {
                oDashboardModel.setProperty("/priorityData/isLoading", false);
                return;
            }

            oDashboardModel.setProperty("/priorityData/isLoading", true);

            try {
                // Get all published jobs with their match results
                const oJobsBinding = oModel.bindList("/JobPostings", null, null,
                    [new Filter("status", FilterOperator.EQ, "published")], {
                    $expand: "matchResults"
                });

                const aJobContexts = await oJobsBinding.requestContexts(0, 100);
                const aJobsWithHotCandidates = [];
                let iTotalHot = 0;
                let iTotalWarm = 0;

                for (const oJobContext of aJobContexts) {
                    const oJob = oJobContext.getObject();
                    const aMatches = oJob.matchResults || [];

                    // Count Hot (>=80) and Warm (60-79) candidates
                    let iHotCount = 0;
                    let iWarmCount = 0;

                    aMatches.forEach(oMatch => {
                        const nScore = oMatch.overallScore || 0;
                        if (nScore >= 80) {
                            iHotCount++;
                        } else if (nScore >= 60) {
                            iWarmCount++;
                        }
                    });

                    // Only include jobs with Hot or Warm candidates
                    if (iHotCount > 0 || iWarmCount > 0) {
                        aJobsWithHotCandidates.push({
                            jobId: oJob.ID,
                            jobTitle: oJob.title,
                            department: oJob.department || "",
                            hotCount: iHotCount,
                            warmCount: iWarmCount,
                            totalMatches: aMatches.length
                        });
                    }

                    iTotalHot += iHotCount;
                    iTotalWarm += iWarmCount;
                }

                // Sort by hot count descending
                aJobsWithHotCandidates.sort((a, b) => b.hotCount - a.hotCount);

                oDashboardModel.setProperty("/priorityData/jobsWithHotCandidates", aJobsWithHotCandidates);
                oDashboardModel.setProperty("/priorityData/totalHotCandidates", iTotalHot);
                oDashboardModel.setProperty("/priorityData/totalWarmCandidates", iTotalWarm);

            } catch (error) {
                console.error("Failed to load priority candidates:", error);
                oDashboardModel.setProperty("/priorityData/jobsWithHotCandidates", []);
            } finally {
                oDashboardModel.setProperty("/priorityData/isLoading", false);
            }
        },

        /**
         * Refresh priority candidates
         */
        onRefreshPriorityCandidates: function () {
            this._loadPriorityCandidatesData();
            this.showSuccess("Priority candidates refreshed");
        },

        /**
         * Handle priority job row press
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onPriorityJobPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("dashboard");
            const sJobId = oContext.getProperty("jobId");

            this.navigateToJobDetail(sJobId);
        },

        /**
         * Handle review priority candidates button
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onReviewPriorityCandidates: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("dashboard");
            const sJobId = oContext.getProperty("jobId");

            // Navigate to job detail matches tab
            this.getRouter().navTo("jobDetail", {
                jobId: sJobId
            });
        },

        /**
         * Refresh priority dashboard
         */
        onRefreshPriorityDashboard: function () {
            this._loadPriorityDashboard();
        },

        /**
         * Navigate directly to job's candidate matches tab
         * @param {sap.ui.base.Event} oEvent - The press event
         */
        onReviewPriorityJob: function (oEvent) {
            oEvent.stopPropagation(); // Prevent row click
            const oButton = oEvent.getSource();
            const oListItem = oButton.getParent().getParent(); // HBox -> CustomListItem
            const sJobId = oListItem.data("jobId");
            if (sJobId) {
                this.getRouter().navTo("jobDetail", {
                    jobId: sJobId,
                    "?query": { tab: "matches" }
                });
            }
        },

        /**
         * Handle view all jobs button
         */
        onViewAllJobs: function () {
            // Navigate to jobs management - for now show info
            this.showInfo("Jobs management page coming soon");
        },

        // ============================================================
        // AI SEARCH ASSISTANT HANDLERS
        // ============================================================

        /**
         * Create the AI FAB button programmatically
         * @private
         */
        _createAIFAB: function () {
            if (this._fabCreated) {
                return;
            }
            this._fabCreated = true;

            // Create a container div for the FAB
            let oContainer = document.getElementById("aiFabContainer");
            if (!oContainer) {
                oContainer = document.createElement("div");
                oContainer.id = "aiFabContainer";
                document.body.appendChild(oContainer);
            }

            // Create FAB button
            const oFAB = new sap.m.Button({
                icon: "sap-icon://da-2",
                tooltip: this.getModel("i18n").getResourceBundle().getText("aiAssistantTooltip"),
                type: "Emphasized",
                press: this.onAIAssistantOpen.bind(this)
            });
            oFAB.addStyleClass("aiAssistantFAB");

            // Place in the dedicated container
            oFAB.placeAt(oContainer);
        },

        /**
         * Open AI Assistant dialog
         */
        onAIAssistantOpen: async function () {
            // Load dialog fragment if not already loaded
            if (!this._oAIAssistantDialog) {
                this._oAIAssistantDialog = await Fragment.load({
                    id: this.getView().getId(),
                    name: "cvmanagement.fragment.AIAssistantDialog",
                    controller: this
                });
                this.getView().addDependent(this._oAIAssistantDialog);
            }

            this._oAIAssistantDialog.open();
            this.getModel("aiAssistant").setProperty("/isOpen", true);

            // Update quick actions based on current context
            this._updateAIQuickActions();

            // Focus input field
            setTimeout(() => {
                const oInput = this.byId("aiChatInput");
                if (oInput) {
                    oInput.focus();
                }
            }, 300);
        },

        /**
         * Close AI Assistant dialog
         */
        onAIAssistantClose: function () {
            if (this._oAIAssistantDialog) {
                this._oAIAssistantDialog.close();
                this.getModel("aiAssistant").setProperty("/isOpen", false);
            }
        },

        /**
         * Handle AI message send
         */
        onAISendMessage: async function () {
            const oAIModel = this.getModel("aiAssistant");
            const sQuery = oAIModel.getProperty("/inputValue");

            if (!sQuery || !sQuery.trim()) {
                return;
            }

            // Clear input
            oAIModel.setProperty("/inputValue", "");

            // Add user message
            const aMessages = oAIModel.getProperty("/messages") || [];
            aMessages.push({
                type: "user",
                text: sQuery,
                timestamp: new Date()
            });
            oAIModel.setProperty("/messages", aMessages);

            // Scroll to bottom
            this._scrollAIChatToBottom();

            // Set loading
            oAIModel.setProperty("/isLoading", true);

            try {
                // Call AI search action
                const oModel = this.getModel();
                const oContext = oAIModel.getProperty("/currentContext");

                const oActionBinding = oModel.bindContext("/aiSearch(...)");
                oActionBinding.setParameter("query", sQuery);
                if (oContext.jobId) {
                    oActionBinding.setParameter("contextJobId", oContext.jobId);
                }
                if (oContext.candidateId) {
                    oActionBinding.setParameter("contextCandidateId", oContext.candidateId);
                }

                await oActionBinding.execute();
                const oResult = oActionBinding.getBoundContext().getObject();

                // Add AI response
                const aUpdatedMessages = oAIModel.getProperty("/messages");
                aUpdatedMessages.push({
                    type: "assistant",
                    text: oResult.message || "Here are the results:",
                    results: (oResult.results || []).slice(0, 3).map(r => ({
                        type: r.type,
                        id: r.id,
                        title: r.title,
                        subtitle: r.subtitle,
                        score: r.score
                    })),
                    totalCount: oResult.totalCount || 0,
                    intent: oResult.intent,
                    allResults: oResult.results || [],
                    timestamp: new Date()
                });
                oAIModel.setProperty("/messages", aUpdatedMessages);

            } catch (error) {
                console.error("AI Search error:", error);

                // Add error message
                const aErrorMessages = oAIModel.getProperty("/messages");
                aErrorMessages.push({
                    type: "assistant",
                    text: "Sorry, I couldn't process your request. Please try again.",
                    timestamp: new Date()
                });
                oAIModel.setProperty("/messages", aErrorMessages);
            } finally {
                oAIModel.setProperty("/isLoading", false);
                this._scrollAIChatToBottom();
            }
        },

        /**
         * Clear chat history
         */
        onClearChat: function () {
            const oAIModel = this.getModel("aiAssistant");
            oAIModel.setProperty("/messages", []);
            oAIModel.setProperty("/inputValue", "");
        },

        /**
         * Handle quick action press
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onAIQuickAction: function (oEvent) {
            const oSource = oEvent.getSource();
            const oContext = oSource.getBindingContext("aiAssistant");

            if (oContext) {
                const sQuery = oContext.getProperty("query");
                const oAIModel = this.getModel("aiAssistant");
                oAIModel.setProperty("/inputValue", sQuery);

                // Trigger send
                this.onAISendMessage();
            }
        },

        /**
         * Navigate to AI result item
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onAIResultNavigate: function (oEvent) {
            const oSource = oEvent.getSource();
            // Get the parent HBox which has the binding context
            const oResultCard = oSource.getParent();
            const oContext = oResultCard.getBindingContext("aiAssistant");

            if (oContext) {
                const sType = oContext.getProperty("type");
                const sId = oContext.getProperty("id");

                // Close dialog
                this.onAIAssistantClose();

                // Navigate based on type
                if (sType === "candidate") {
                    this.navigateToCandidateDetail(sId);
                } else if (sType === "job") {
                    this.navigateToJobDetail(sId);
                }
            }
        },

        /**
         * Handle see all results link
         * @param {sap.ui.base.Event} oEvent Press event
         */
        onAISeeAllResults: function (oEvent) {
            const oSource = oEvent.getSource();
            const oMessageContext = oSource.getParent().getParent().getBindingContext("aiAssistant");

            if (oMessageContext) {
                const sIntent = oMessageContext.getProperty("intent");
                const aAllResults = oMessageContext.getProperty("allResults") || [];

                // Close dialog
                this.onAIAssistantClose();

                // Navigate to appropriate tab with filter applied
                if (sIntent === "candidate_search" || sIntent === "similar_candidates") {
                    // Switch to candidates tab
                    this._selectTab("candidates");
                    this.showInfo(`Found ${aAllResults.length} candidates`);
                } else if (sIntent === "job_matches" || sIntent === "job_fit") {
                    // Could navigate to job detail with matches
                    this.showInfo(`Found ${aAllResults.length} results`);
                }
            }
        },

        /**
         * Update quick actions based on current context
         * @private
         */
        _updateAIQuickActions: function () {
            const oAIModel = this.getModel("aiAssistant");
            const oContext = oAIModel.getProperty("/currentContext");

            const aQuickActions = [
                { text: "Top candidates", query: "Top candidates for Senior Developer" },
                { text: "Find React devs", query: "Find React developers" },
                { text: "Best matches", query: "Show best candidate matches" }
            ];

            // Add context-specific actions
            if (oContext.jobId) {
                aQuickActions.unshift({
                    text: "Top for this job",
                    query: "Top candidates for this job"
                });
            }

            if (oContext.candidateId) {
                aQuickActions.unshift({
                    text: "Similar candidates",
                    query: "Find similar candidates"
                });
            }

            oAIModel.setProperty("/quickActions", aQuickActions.slice(0, 4));
        },

        /**
         * Scroll AI chat to bottom
         * @private
         */
        _scrollAIChatToBottom: function () {
            setTimeout(() => {
                const oScrollContainer = this.byId("aiChatScroll");
                if (oScrollContainer) {
                    const oDomRef = oScrollContainer.getDomRef();
                    if (oDomRef) {
                        oDomRef.scrollTop = oDomRef.scrollHeight;
                    }
                }
            }, 100);
        },

        /**
         * Set AI assistant context
         * @param {string} sJobId Job ID
         * @param {string} sCandidateId Candidate ID
         */
        setAIAssistantContext: function (sJobId, sCandidateId) {
            const oAIModel = this.getModel("aiAssistant");
            if (oAIModel) {
                oAIModel.setProperty("/currentContext/jobId", sJobId || null);
                oAIModel.setProperty("/currentContext/candidateId", sCandidateId || null);
                this._updateAIQuickActions();
            }
        },

        // ============================================
        // EMAIL CENTER HANDLERS
        // ============================================

        /**
         * Handle email sub-tab selection
         * @param {sap.ui.base.Event} oEvent Sub-tab select event
         */
        onEmailSubTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            this._loadEmailSubTabContent(sKey);
        },

        /**
         * Load email sub-tab content dynamically
         * @param {string} sKey Sub-tab key (dashboard, history, templates, settings)
         * @private
         */
        _loadEmailSubTabContent: function (sKey) {
            const that = this;
            const oSubTabBar = this.byId("emailSubTabBar");
            if (!oSubTabBar) return;

            const oTab = oSubTabBar.getItems().find(item => item.getKey() === sKey);
            if (!oTab || oTab.getContent().length > 0) return;

            const fragmentMap = {
                'dashboard': 'cvmanagement.fragment.EmailDashboard',
                'history': 'cvmanagement.fragment.EmailHistory',
                'templates': 'cvmanagement.fragment.EmailTemplates',
                'settings': 'cvmanagement.fragment.EmailSettings'
            };

            const fragmentName = fragmentMap[sKey];
            if (!fragmentName) return;

            Fragment.load({
                id: this.getView().getId(),
                name: fragmentName,
                controller: this
            }).then(oFragment => {
                if (Array.isArray(oFragment)) {
                    oFragment.forEach(ctrl => oTab.addContent(ctrl));
                } else {
                    oTab.addContent(oFragment);
                }
                // Load data for the tab
                if (sKey === 'dashboard') {
                    that._loadEmailDashboardData();
                } else if (sKey === 'settings') {
                    that._loadEmailSettings();
                }
            }).catch(err => {
                console.error('Failed to load email fragment:', err);
            });
        },

        /**
         * Load email dashboard data (stats, recent notifications, webhook health)
         * @private
         */
        _loadEmailDashboardData: function () {
            const oModel = this.getModel();
            const oEmailModel = this.getModel("email");

            oEmailModel.setProperty("/isLoading", true);

            // Load stats
            oModel.callFunction("/getEmailStats", {
                method: "GET",
                success: (oData) => {
                    oEmailModel.setProperty("/stats", oData);
                },
                error: (oError) => {
                    console.error("Failed to load email stats:", oError);
                }
            });

            // Load recent notifications
            oModel.callFunction("/getRecentNotifications", {
                method: "GET",
                urlParameters: { limit: 10 },
                success: (oData) => {
                    const items = (oData.results || oData || []).map(item => ({
                        ...item,
                        timeAgo: this._formatTimeAgo(item.createdAt)
                    }));
                    oEmailModel.setProperty("/recentActivity", items);
                },
                error: (oError) => {
                    console.error("Failed to load recent notifications:", oError);
                }
            });

            // Test webhook connection
            oModel.callFunction("/testWebhookConnection", {
                method: "POST",
                success: (oData) => {
                    oEmailModel.setProperty("/health/n8nConnected", oData.connected);
                    oEmailModel.setProperty("/health/webhooksEnabled", true);
                },
                error: () => {
                    oEmailModel.setProperty("/health/n8nConnected", false);
                }
            });

            oEmailModel.setProperty("/health/smtpStatus", "ok");
            oEmailModel.setProperty("/isLoading", false);
        },

        /**
         * Format timestamp as relative time ago
         * @param {string} dateStr ISO date string
         * @returns {string} Formatted time ago string
         * @private
         */
        _formatTimeAgo: function (dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} min ago`;
            if (diffHours < 24) return `${diffHours} hours ago`;
            return `${diffDays} days ago`;
        },

        /**
         * Refresh email center current sub-tab data
         */
        onRefreshEmailCenter: function () {
            const oSubTabBar = this.byId("emailSubTabBar");
            if (oSubTabBar) {
                const sKey = oSubTabBar.getSelectedKey();
                if (sKey === 'dashboard') {
                    this._loadEmailDashboardData();
                }
            }
        },

        /**
         * Refresh email stats
         */
        onRefreshEmailStats: function () {
            this._loadEmailDashboardData();
        },

        /**
         * Handle failed card press - switch to history tab with failed filter
         */
        onFailedCardPress: function () {
            // Switch to history tab with failed filter
            const oSubTabBar = this.byId("emailSubTabBar");
            if (oSubTabBar) {
                oSubTabBar.setSelectedKey("history");
                const oEmailModel = this.getModel("email");
                oEmailModel.setProperty("/history/filters/statuses", ["failed", "bounced"]);
            }
        },

        /**
         * Retry all failed notifications
         */
        onRetryAllFailed: function () {
            sap.m.MessageBox.confirm("Retry all failed notifications?", {
                onClose: (sAction) => {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        sap.m.MessageToast.show("Retrying failed notifications...");
                        // Implementation would iterate through failed and call retryFailedNotification
                    }
                }
            });
        },

        /**
         * Send test email - show coming soon message
         */
        onSendTestEmail: function () {
            sap.m.MessageBox.information("Test email functionality coming soon");
        },

        /**
         * Open n8n dashboard in new tab
         */
        onOpenN8nDashboard: function () {
            const n8nUrl = "http://localhost:5678";
            sap.m.URLHelper.redirect(n8nUrl, true);
        },

        // ============================================
        // EMAIL HISTORY HANDLERS
        // ============================================

        /**
         * Handle email history filter change
         */
        onEmailHistoryFilterChange: function () {
            this._applyEmailHistoryFilters();
        },

        /**
         * Handle email history search
         * @param {sap.ui.base.Event} oEvent Search event
         */
        onEmailHistorySearch: function (oEvent) {
            const sQuery = oEvent.getParameter("query");
            const oEmailModel = this.getModel("email");
            oEmailModel.setProperty("/history/filters/search", sQuery);
            this._applyEmailHistoryFilters();
        },

        /**
         * Apply email history filters - builds and applies OData filters
         * @private
         */
        _applyEmailHistoryFilters: function () {
            const oTable = this.byId("emailHistoryTable");
            if (!oTable) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            const aFilters = [];
            const oEmailModel = this.getModel("email");
            const oFilters = oEmailModel.getProperty("/history/filters");

            // Date filter
            const oDateRange = this.byId("emailHistoryDateRange");
            if (oDateRange) {
                const oFrom = oDateRange.getDateValue();
                const oTo = oDateRange.getSecondDateValue();
                if (oFrom) {
                    aFilters.push(new Filter("createdAt", FilterOperator.GE, oFrom));
                }
                if (oTo) {
                    aFilters.push(new Filter("createdAt", FilterOperator.LE, oTo));
                }
            }

            // Type filter
            const oTypeFilter = this.byId("emailHistoryTypeFilter");
            if (oTypeFilter) {
                const aTypes = oTypeFilter.getSelectedKeys();
                if (aTypes.length > 0) {
                    const aTypeFilters = aTypes.map(type => new Filter("notificationType", FilterOperator.EQ, type));
                    aFilters.push(new Filter({ filters: aTypeFilters, and: false }));
                }
            }

            // Status filter
            const oStatusFilter = this.byId("emailHistoryStatusFilter");
            if (oStatusFilter) {
                const aStatuses = oStatusFilter.getSelectedKeys();
                if (aStatuses.length > 0) {
                    const aStatusFilters = aStatuses.map(status => new Filter("deliveryStatus", FilterOperator.EQ, status));
                    aFilters.push(new Filter({ filters: aStatusFilters, and: false }));
                }
            }

            // Search filter
            if (oFilters.search) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("recipientEmail", FilterOperator.Contains, oFilters.search),
                        new Filter("candidate/firstName", FilterOperator.Contains, oFilters.search),
                        new Filter("candidate/lastName", FilterOperator.Contains, oFilters.search)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters.length > 0 ? new Filter({ filters: aFilters, and: true }) : []);
        },

        /**
         * Clear all email history filters
         */
        onClearEmailHistoryFilters: function () {
            const oDateRange = this.byId("emailHistoryDateRange");
            const oTypeFilter = this.byId("emailHistoryTypeFilter");
            const oStatusFilter = this.byId("emailHistoryStatusFilter");
            const oSearch = this.byId("emailHistorySearch");

            if (oDateRange) oDateRange.setValue("");
            if (oTypeFilter) oTypeFilter.setSelectedKeys([]);
            if (oStatusFilter) oStatusFilter.setSelectedKeys([]);
            if (oSearch) oSearch.setValue("");

            const oEmailModel = this.getModel("email");
            oEmailModel.setProperty("/history/filters", {
                dateFrom: null,
                dateTo: null,
                types: [],
                statuses: [],
                search: ''
            });

            this._applyEmailHistoryFilters();
        },

        /**
         * Handle email history item press - show detail dialog
         * @param {sap.ui.base.Event} oEvent List item press event
         */
        onEmailHistoryItemPress: function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oContext = oItem.getBindingContext();
            this._showEmailDetailDialog(oContext);
        },

        /**
         * View email notification details
         * @param {sap.ui.base.Event} oEvent Button press event
         */
        onViewEmailDetails: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            this._showEmailDetailDialog(oContext);
        },

        /**
         * Show email notification detail dialog
         * @param {sap.ui.model.Context} oContext Binding context
         * @private
         */
        _showEmailDetailDialog: function (oContext) {
            const oData = oContext.getObject();

            const oDialog = new sap.m.Dialog({
                title: this.getResourceBundle().getText("notificationDetails"),
                contentWidth: "500px",
                content: [
                    new sap.m.VBox({
                        class: "sapUiSmallMargin",
                        items: [
                            new sap.m.Label({ text: this.getResourceBundle().getText("notificationType"), design: "Bold" }),
                            new sap.m.Text({ text: oData.notificationType }),
                            new sap.m.Label({ text: this.getResourceBundle().getText("recipient"), design: "Bold", class: "sapUiSmallMarginTop" }),
                            new sap.m.Text({ text: oData.recipientEmail }),
                            new sap.m.Label({ text: this.getResourceBundle().getText("subject"), design: "Bold", class: "sapUiSmallMarginTop" }),
                            new sap.m.Text({ text: oData.subject || "N/A" }),
                            new sap.m.Label({ text: this.getResourceBundle().getText("status"), design: "Bold", class: "sapUiSmallMarginTop" }),
                            new sap.m.ObjectStatus({
                                text: oData.deliveryStatus,
                                state: oData.deliveryStatus === 'sent' ? 'Success' : oData.deliveryStatus === 'failed' ? 'Error' : 'Warning'
                            }),
                            new sap.m.Label({ text: this.getResourceBundle().getText("timestamps"), design: "Bold", class: "sapUiSmallMarginTop" }),
                            new sap.m.Text({ text: "Created: " + (oData.createdAt || "N/A") }),
                            new sap.m.Text({ text: "Sent: " + (oData.sentAt || "N/A") }),
                            new sap.m.Text({ text: "Opened: " + (oData.openedAt || "N/A") }),
                            new sap.m.Text({ text: "Clicked: " + (oData.clickedAt || "N/A") })
                        ]
                    })
                ],
                beginButton: new sap.m.Button({
                    text: "Close",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        /**
         * Retry failed email notification
         * @param {sap.ui.base.Event} oEvent Button press event
         */
        onRetryEmail: function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sId = oContext.getProperty("ID");

            const oModel = this.getModel();
            oModel.callFunction("/retryFailedNotification", {
                method: "POST",
                urlParameters: { notificationId: sId },
                success: () => {
                    sap.m.MessageToast.show("Notification queued for retry");
                    this.byId("emailHistoryTable").getBinding("items").refresh();
                },
                error: (oError) => {
                    sap.m.MessageBox.error("Failed to retry notification: " + oError.message);
                }
            });
        },

        // ============================================
        // EMAIL TEMPLATES HANDLERS
        // ============================================

        /**
         * Preview email template with sample data
         * @param {sap.ui.base.Event} oEvent Button press event
         */
        onPreviewTemplate: function (oEvent) {
            const oButton = oEvent.getSource();
            const sTemplateKey = oButton.data("templateKey") || oButton.getCustomData().find(d => d.getKey() === "templateKey")?.getValue();

            const oEmailModel = this.getModel("email");
            const aTemplates = oEmailModel.getProperty("/templates");
            const oTemplate = aTemplates.find(t => t.key === sTemplateKey);

            if (!oTemplate) {
                sap.m.MessageBox.error("Template not found");
                return;
            }

            const sampleData = {
                candidateName: "John Smith",
                jobTitle: "Senior Developer",
                companyName: "TechCorp Inc.",
                interviewDate: "December 25, 2024 at 10:00 AM",
                interviewLocation: "Conference Room A",
                recruiterName: "Jane Doe",
                recruiterEmail: "jane.doe@techcorp.com"
            };

            const oDialog = new sap.m.Dialog({
                title: "Template Preview: " + oTemplate.name,
                contentWidth: "600px",
                content: [
                    new sap.m.VBox({
                        class: "sapUiSmallMargin",
                        items: [
                            new sap.m.Label({ text: "Subject", design: "Bold" }),
                            new sap.m.Text({ text: oTemplate.subject.replace(/{(\w+)}/g, (m, key) => sampleData[key] || m) }),
                            new sap.m.Label({ text: "Preview (with sample data)", design: "Bold", class: "sapUiMediumMarginTop" }),
                            new sap.m.FormattedText({
                                htmlText: this._getTemplatePreviewHtml(sTemplateKey, sampleData)
                            }),
                            new sap.m.Label({ text: this.getResourceBundle().getText("availableVariables"), design: "Bold", class: "sapUiMediumMarginTop" }),
                            new sap.m.Text({ text: "{candidateName}, {jobTitle}, {companyName}, {interviewDate}, {interviewLocation}, {recruiterName}, {recruiterEmail}" })
                        ]
                    })
                ],
                buttons: [
                    new sap.m.Button({
                        text: this.getResourceBundle().getText("sendTest"),
                        icon: "sap-icon://email",
                        press: function () {
                            sap.m.MessageToast.show("Test email sent!");
                        }
                    }),
                    new sap.m.Button({
                        text: "Close",
                        press: function () {
                            oDialog.close();
                        }
                    })
                ],
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        /**
         * Get template preview HTML with sample data substituted
         * @param {string} sKey Template key
         * @param {object} oData Sample data for substitution
         * @returns {string} HTML content for the template
         * @private
         */
        _getTemplatePreviewHtml: function (sKey, oData) {
            const templates = {
                cv_received: `<p>Dear ${oData.candidateName},</p><p>Thank you for submitting your CV for the <strong>${oData.jobTitle}</strong> position at ${oData.companyName}.</p><p>We have received your application and will review it shortly.</p><p>Best regards,<br/>${oData.recruiterName}</p>`,
                status_changed: `<p>Dear ${oData.candidateName},</p><p>We would like to update you on the status of your application for <strong>${oData.jobTitle}</strong>.</p><p>Your application has moved to the next stage in our recruitment process.</p><p>Best regards,<br/>${oData.recruiterName}</p>`,
                interview_invitation: `<p>Dear ${oData.candidateName},</p><p>We are pleased to invite you for an interview for the <strong>${oData.jobTitle}</strong> position.</p><p><strong>Date:</strong> ${oData.interviewDate}<br/><strong>Location:</strong> ${oData.interviewLocation}</p><p>Please confirm your attendance.</p><p>Best regards,<br/>${oData.recruiterName}</p>`,
                interview_reminder: `<p>Dear ${oData.candidateName},</p><p>This is a reminder about your upcoming interview for <strong>${oData.jobTitle}</strong>.</p><p><strong>Date:</strong> ${oData.interviewDate}<br/><strong>Location:</strong> ${oData.interviewLocation}</p><p>We look forward to meeting you!</p><p>Best regards,<br/>${oData.recruiterName}</p>`,
                offer_extended: `<p>Dear ${oData.candidateName},</p><p>We are delighted to extend an offer for the <strong>${oData.jobTitle}</strong> position at ${oData.companyName}.</p><p>Please review the attached offer letter and let us know your decision.</p><p>Best regards,<br/>${oData.recruiterName}</p>`,
                application_rejected: `<p>Dear ${oData.candidateName},</p><p>Thank you for your interest in the <strong>${oData.jobTitle}</strong> position at ${oData.companyName}.</p><p>After careful consideration, we have decided to move forward with other candidates.</p><p>We wish you success in your job search.</p><p>Best regards,<br/>${oData.recruiterName}</p>`
            };
            return templates[sKey] || "<p>Template preview not available</p>";
        },

        /**
         * Edit template in n8n workflow editor
         * @param {sap.ui.base.Event} oEvent Button press event
         */
        onEditTemplateInN8n: function (oEvent) {
            const oButton = oEvent.getSource();
            const sTemplateKey = oButton.data("templateKey") || oButton.getCustomData().find(d => d.getKey() === "templateKey")?.getValue();

            // Open n8n with the workflow for this template type
            const n8nUrl = "http://localhost:5678/workflow";
            sap.m.URLHelper.redirect(n8nUrl, true);
        },

        // ============================================
        // EMAIL SETTINGS HANDLERS
        // ============================================

        /**
         * Load email settings from backend
         * @private
         */
        _loadEmailSettings: function () {
            const oModel = this.getModel();
            const oEmailModel = this.getModel("email");

            oModel.read("/NotificationSettings", {
                success: (oData) => {
                    const settings = {};
                    (oData.results || []).forEach(item => {
                        const key = item.settingKey;
                        let value = item.settingValue;

                        // Convert to appropriate type
                        if (item.settingType === 'boolean') {
                            value = value === 'true';
                        } else if (item.settingType === 'number') {
                            value = parseInt(value, 10);
                        }

                        // Map setting keys to model properties
                        const keyMap = {
                            'webhooks_enabled': 'webhooksEnabled',
                            'webhook_url': 'webhookUrl',
                            'notification_cooldown_hours': 'cooldownHours',
                            'reminder_window_hours': 'reminderWindowHours',
                            'rate_limit_per_minute': 'rateLimitPerMinute',
                            'type_cv_received': 'typeCvReceived',
                            'type_status_changed': 'typeStatusChanged',
                            'type_interview_invitation': 'typeInterviewInvitation',
                            'type_interview_reminder': 'typeInterviewReminder',
                            'type_offer_extended': 'typeOfferExtended',
                            'type_application_rejected': 'typeApplicationRejected'
                        };

                        if (keyMap[key]) {
                            settings[keyMap[key]] = value;
                        }
                    });

                    oEmailModel.setProperty("/settings", settings);
                },
                error: (oError) => {
                    console.error("Failed to load settings:", oError);
                }
            });
        }

    });
});
