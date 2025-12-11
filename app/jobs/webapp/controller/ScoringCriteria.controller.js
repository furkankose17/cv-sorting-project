sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function (Controller, JSONModel, MessageBox, MessageToast, Fragment) {
    "use strict";

    return Controller.extend("cv.sorting.jobs.controller.ScoringCriteria", {

        onInit: function () {
            // Initialize view model
            var oViewModel = new JSONModel({
                jobPostingId: null,
                skillsCriteria: [],
                experienceCriteria: [],
                languageCriteria: [],
                educationCriteria: [],
                certificationCriteria: [],
                skillsCriteriaCount: 0,
                experienceCriteriaCount: 0,
                languageCriteriaCount: 0,
                educationCriteriaCount: 0,
                certificationCriteriaCount: 0,
                totalMaxPoints: 0,
                requiredCriteriaCount: 0,
                semanticWeight: 40,
                criteriaWeight: 60,
                hasChanges: false,
                templates: [
                    { name: "Software Developer", key: "software_developer", description: "Python, JavaScript, Git, experience, education" },
                    { name: "SAP Consultant", key: "sap_consultant", description: "SAP, ABAP, Fiori, HANA, certifications" },
                    { name: "Data Scientist", key: "data_scientist", description: "Python, ML, SQL, TensorFlow, PyTorch" },
                    { name: "Project Manager", key: "project_manager", description: "PMP, Scrum Master, Agile, JIRA" }
                ]
            });
            this.getView().setModel(oViewModel, "view");

            // Get router and attach route matched event
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("ScoringCriteria").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var sJobPostingId = oEvent.getParameter("arguments").jobPostingId;
            this.getView().getModel("view").setProperty("/jobPostingId", sJobPostingId);
            this._loadCriteria(sJobPostingId);
        },

        _loadCriteria: function (sJobPostingId) {
            var that = this;
            var sUrl = "/api/ml/getScoringCriteria";

            // Call ML Integration Service
            $.ajax({
                url: sUrl,
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({ jobPostingId: sJobPostingId }),
                success: function (oData) {
                    that._processLoadedCriteria(oData.value || oData);
                },
                error: function (oError) {
                    MessageBox.error("Failed to load scoring criteria");
                    console.error("Load criteria error:", oError);
                }
            });
        },

        _processLoadedCriteria: function (aCriteria) {
            var oViewModel = this.getView().getModel("view");

            // Group by type
            var oGrouped = {
                skill: [],
                experience: [],
                language: [],
                education: [],
                certification: []
            };

            aCriteria.forEach(function (criterion) {
                var sType = criterion.criteriaType.toLowerCase();
                if (oGrouped[sType]) {
                    oGrouped[sType].push(criterion);
                }
            });

            // Update model
            oViewModel.setProperty("/skillsCriteria", oGrouped.skill);
            oViewModel.setProperty("/experienceCriteria", oGrouped.experience);
            oViewModel.setProperty("/languageCriteria", oGrouped.language);
            oViewModel.setProperty("/educationCriteria", oGrouped.education);
            oViewModel.setProperty("/certificationCriteria", oGrouped.certification);

            // Update counts
            oViewModel.setProperty("/skillsCriteriaCount", oGrouped.skill.length);
            oViewModel.setProperty("/experienceCriteriaCount", oGrouped.experience.length);
            oViewModel.setProperty("/languageCriteriaCount", oGrouped.language.length);
            oViewModel.setProperty("/educationCriteriaCount", oGrouped.education.length);
            oViewModel.setProperty("/certificationCriteriaCount", oGrouped.certification.length);

            this._calculateTotals();
        },

        _calculateTotals: function () {
            var oViewModel = this.getView().getModel("view");
            var nTotalPoints = 0;
            var nRequiredCount = 0;

            ["skillsCriteria", "experienceCriteria", "languageCriteria", "educationCriteria", "certificationCriteria"]
                .forEach(function (sProperty) {
                    var aCriteria = oViewModel.getProperty("/" + sProperty) || [];
                    aCriteria.forEach(function (c) {
                        nTotalPoints += (c.points || 0) * (c.weight || 1);
                        if (c.isRequired) {
                            nRequiredCount++;
                        }
                    });
                });

            oViewModel.setProperty("/totalMaxPoints", Math.round(nTotalPoints));
            oViewModel.setProperty("/requiredCriteriaCount", nRequiredCount);
        },

        onNavBack: function () {
            var oHistory = sap.ui.core.routing.History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("JobPostingsList");
            }
        },

        onRefresh: function () {
            var sJobPostingId = this.getView().getModel("view").getProperty("/jobPostingId");
            this._loadCriteria(sJobPostingId);
            MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("refreshed"));
        },

        onSave: function () {
            var that = this;
            var oViewModel = this.getView().getModel("view");
            var sJobPostingId = oViewModel.getProperty("/jobPostingId");

            // Collect all criteria
            var aCriteria = [];
            var nSortOrder = 0;

            ["skillsCriteria", "experienceCriteria", "languageCriteria", "educationCriteria", "certificationCriteria"]
                .forEach(function (sProperty) {
                    var sType = sProperty.replace("Criteria", "").replace("s", "");
                    var aTypeCriteria = oViewModel.getProperty("/" + sProperty) || [];
                    aTypeCriteria.forEach(function (c) {
                        aCriteria.push({
                            criteriaType: sType,
                            criteriaValue: c.criteriaValue,
                            points: parseInt(c.points) || 0,
                            isRequired: c.isRequired || false,
                            weight: parseFloat(c.weight) || 1.0,
                            minValue: c.minValue ? parseInt(c.minValue) : null,
                            perUnitPoints: c.perUnitPoints ? parseFloat(c.perUnitPoints) : null,
                            maxPoints: c.maxPoints ? parseInt(c.maxPoints) : null,
                            sortOrder: nSortOrder++
                        });
                    });
                });

            // Call ML Integration Service
            $.ajax({
                url: "/api/ml/setScoringCriteria",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({
                    jobPostingId: sJobPostingId,
                    criteria: aCriteria,
                    replaceExisting: true
                }),
                success: function (oData) {
                    MessageToast.show("Scoring criteria saved successfully");
                    oViewModel.setProperty("/hasChanges", false);
                },
                error: function (oError) {
                    MessageBox.error("Failed to save scoring criteria");
                    console.error("Save criteria error:", oError);
                }
            });
        },

        onAddSkillCriterion: function () {
            this._openAddDialog("skill");
        },

        onAddExperienceCriterion: function () {
            var oViewModel = this.getView().getModel("view");
            var aCriteria = oViewModel.getProperty("/experienceCriteria") || [];
            aCriteria.push({
                criteriaType: "experience",
                criteriaValue: "0",
                points: 10,
                isRequired: false,
                weight: 1.0,
                minValue: 0,
                perUnitPoints: 2,
                maxPoints: 20
            });
            oViewModel.setProperty("/experienceCriteria", aCriteria);
            oViewModel.setProperty("/experienceCriteriaCount", aCriteria.length);
            oViewModel.setProperty("/hasChanges", true);
            this._calculateTotals();
        },

        onAddLanguageCriterion: function () {
            this._openAddDialog("language");
        },

        onAddEducationCriterion: function () {
            var oViewModel = this.getView().getModel("view");
            var aCriteria = oViewModel.getProperty("/educationCriteria") || [];
            aCriteria.push({
                criteriaType: "education",
                criteriaValue: "bachelor",
                points: 5,
                isRequired: false,
                weight: 1.0
            });
            oViewModel.setProperty("/educationCriteria", aCriteria);
            oViewModel.setProperty("/educationCriteriaCount", aCriteria.length);
            oViewModel.setProperty("/hasChanges", true);
            this._calculateTotals();
        },

        onAddCertificationCriterion: function () {
            this._openAddDialog("certification");
        },

        _openAddDialog: function (sType) {
            var that = this;
            var oView = this.getView();

            if (!this._oAddDialog) {
                Fragment.load({
                    id: oView.getId(),
                    name: "cv.sorting.jobs.fragment.AddCriterionDialog",
                    controller: this
                }).then(function (oDialog) {
                    that._oAddDialog = oDialog;
                    oView.addDependent(oDialog);
                    that._oAddDialog.getModel("dialog").setProperty("/criteriaType", sType);
                    that._oAddDialog.open();
                });
            } else {
                this._oAddDialog.getModel("dialog").setProperty("/criteriaType", sType);
                this._oAddDialog.open();
            }
        },

        onDeleteCriterion: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("view");
            var sPath = oContext.getPath();

            // Get the array path and index
            var aPathParts = sPath.split("/");
            var nIndex = parseInt(aPathParts.pop());
            var sArrayPath = aPathParts.join("/");

            var oViewModel = this.getView().getModel("view");
            var aCriteria = oViewModel.getProperty(sArrayPath);
            aCriteria.splice(nIndex, 1);
            oViewModel.setProperty(sArrayPath, aCriteria);
            oViewModel.setProperty("/hasChanges", true);

            // Update count
            var sCountPath = sArrayPath + "Count";
            oViewModel.setProperty(sCountPath, aCriteria.length);

            this._calculateTotals();
        },

        onCriteriaChange: function () {
            this.getView().getModel("view").setProperty("/hasChanges", true);
            this._calculateTotals();
        },

        onTemplateSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var sKey = oItem.getBindingContext("view").getProperty("key");
            this.getView().getModel("view").setProperty("/selectedTemplate", sKey);
        },

        onApplyTemplate: function () {
            var that = this;
            var oViewModel = this.getView().getModel("view");
            var sTemplate = oViewModel.getProperty("/selectedTemplate");

            if (!sTemplate) {
                MessageToast.show("Please select a template first");
                return;
            }

            MessageBox.confirm("This will replace all current criteria. Continue?", {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        that._loadTemplate(sTemplate);
                    }
                }
            });
        },

        _loadTemplate: function (sTemplate) {
            var that = this;

            $.ajax({
                url: "/api/ml/getCriteriaTemplates",
                method: "GET",
                success: function (oData) {
                    var oTemplates = typeof oData === "string" ? JSON.parse(oData) : oData;
                    var aTemplateCriteria = oTemplates[sTemplate];

                    if (aTemplateCriteria) {
                        that._applyTemplateCriteria(aTemplateCriteria);
                        MessageToast.show("Template applied successfully");
                    }
                },
                error: function (oError) {
                    MessageBox.error("Failed to load template");
                }
            });
        },

        _applyTemplateCriteria: function (aCriteria) {
            var oViewModel = this.getView().getModel("view");

            // Clear existing
            oViewModel.setProperty("/skillsCriteria", []);
            oViewModel.setProperty("/experienceCriteria", []);
            oViewModel.setProperty("/languageCriteria", []);
            oViewModel.setProperty("/educationCriteria", []);
            oViewModel.setProperty("/certificationCriteria", []);

            // Group and add
            var oGrouped = { skill: [], experience: [], language: [], education: [], certification: [] };

            aCriteria.forEach(function (c) {
                var oCriterion = {
                    criteriaType: c.criteria_type,
                    criteriaValue: c.criteria_value,
                    points: c.points,
                    isRequired: c.is_required || false,
                    weight: c.weight || 1.0,
                    minValue: c.min_value,
                    perUnitPoints: c.per_unit_points,
                    maxPoints: c.max_points
                };
                if (oGrouped[c.criteria_type]) {
                    oGrouped[c.criteria_type].push(oCriterion);
                }
            });

            oViewModel.setProperty("/skillsCriteria", oGrouped.skill);
            oViewModel.setProperty("/experienceCriteria", oGrouped.experience);
            oViewModel.setProperty("/languageCriteria", oGrouped.language);
            oViewModel.setProperty("/educationCriteria", oGrouped.education);
            oViewModel.setProperty("/certificationCriteria", oGrouped.certification);

            // Update counts
            oViewModel.setProperty("/skillsCriteriaCount", oGrouped.skill.length);
            oViewModel.setProperty("/experienceCriteriaCount", oGrouped.experience.length);
            oViewModel.setProperty("/languageCriteriaCount", oGrouped.language.length);
            oViewModel.setProperty("/educationCriteriaCount", oGrouped.education.length);
            oViewModel.setProperty("/certificationCriteriaCount", oGrouped.certification.length);

            oViewModel.setProperty("/hasChanges", true);
            this._calculateTotals();
        },

        onSearchSkills: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            var oTable = this.byId("skillsCriteriaTable");
            var oBinding = oTable.getBinding("items");

            var aFilters = [];
            if (sQuery) {
                aFilters.push(new sap.ui.model.Filter("criteriaValue", sap.ui.model.FilterOperator.Contains, sQuery));
            }
            oBinding.filter(aFilters);
        },

        onEditCriterion: function (oEvent) {
            // For editing specific criterion details
            MessageToast.show("Edit functionality - modify inline fields");
        }
    });
});
