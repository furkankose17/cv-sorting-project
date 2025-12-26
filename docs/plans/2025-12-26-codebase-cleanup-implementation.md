# Codebase Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 41 issues across service layer, UI controllers, Python ML service, and code quality.

**Architecture:** File-by-file cleanup to minimize context switching. Each phase completes one file before moving to the next.

**Tech Stack:** SAP CAP (Node.js), SAPUI5/OpenUI5, Python FastAPI, SQLite/PostgreSQL

---

## Phase 1: Service Layer Cleanup

### Task 1.1: Fix Hardcoded n8n Webhook URL

**Files:**
- Modify: `srv/cv-sorting-service.js:65`

**Step 1: Update the hardcoded URL**

Change line 65 from:
```javascript
this.n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/match-notification';
```

To (remove hardcoded fallback, require explicit config):
```javascript
this.n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
if (!this.n8nWebhookUrl) {
    LOG.warn('N8N_WEBHOOK_URL not configured - webhook notifications disabled');
}
```

**Step 2: Run tests**

```bash
cd /Users/furkankose/cv-sorting-app/cv-sorting-project/.worktrees/codebase-cleanup
npm test -- --testPathPattern="cv-sorting" --no-coverage
```

Expected: Tests pass (webhook functionality gracefully degrades)

**Step 3: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "fix: remove hardcoded localhost fallback for n8n webhook URL"
```

---

### Task 1.2: Fix Placeholder Email Domain

**Files:**
- Modify: `srv/cv-sorting-service.js:676`

**Step 1: Update placeholder email generation**

Change line 676 from:
```javascript
email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@cv-upload.placeholder`,
```

To:
```javascript
email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${process.env.DEFAULT_EMAIL_DOMAIN || 'pending-verification.local'}`,
```

**Step 2: Run tests**

```bash
npm test -- --testPathPattern="cv-sorting" --no-coverage
```

**Step 3: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "fix: use configurable email domain for CV upload candidates"
```

---

### Task 1.3: Fix Handler Delegation Error Handling

**Files:**
- Modify: `srv/cv-sorting-service.js:2747-2749`

**Step 1: Replace silent null return with proper error**

Change lines 2747-2749 from:
```javascript
default:
    LOG.warn(`Job handler ${handlerName} not implemented`);
    return null;
```

To:
```javascript
default:
    const error = new Error(`Job handler '${handlerName}' not implemented`);
    error.code = 'NOT_IMPLEMENTED';
    LOG.error(error.message);
    throw error;
```

**Step 2: Run tests**

```bash
npm test -- --testPathPattern="cv-sorting" --no-coverage
```

**Step 3: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "fix: throw error instead of returning null for unimplemented handlers"
```

---

## Phase 2: Main Controller Features

### Task 2.1: Create EditJobDialog Fragment

**Files:**
- Create: `app/cv-management/webapp/fragment/EditJobDialog.fragment.xml`

**Step 1: Create the dialog fragment**

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:form="sap.ui.layout.form">

    <Dialog
        id="editJobDialog"
        title="{i18n>editJob}"
        contentWidth="600px"
        escapeHandler=".onEditJobDialogEscape">

        <content>
            <form:SimpleForm
                editable="true"
                layout="ResponsiveGridLayout"
                labelSpanXL="4"
                labelSpanL="4"
                labelSpanM="4"
                labelSpanS="12"
                emptySpanXL="0"
                emptySpanL="0"
                emptySpanM="0"
                emptySpanS="0"
                columnsXL="1"
                columnsL="1"
                columnsM="1">

                <form:content>
                    <Label text="{i18n>jobTitle}" required="true" />
                    <Input
                        id="editJobTitle"
                        value="{editJob>/title}"
                        placeholder="{i18n>enterJobTitle}"
                        maxLength="200" />

                    <Label text="{i18n>department}" />
                    <Input
                        id="editJobDepartment"
                        value="{editJob>/department}"
                        placeholder="{i18n>enterDepartment}"
                        maxLength="100" />

                    <Label text="{i18n>location}" />
                    <Input
                        id="editJobLocation"
                        value="{editJob>/location}"
                        placeholder="{i18n>enterLocation}"
                        maxLength="200" />

                    <Label text="{i18n>employmentType}" />
                    <Select
                        id="editJobEmploymentType"
                        selectedKey="{editJob>/employmentType}">
                        <items>
                            <core:Item key="full-time" text="{i18n>fullTime}" />
                            <core:Item key="part-time" text="{i18n>partTime}" />
                            <core:Item key="contract" text="{i18n>contract}" />
                            <core:Item key="internship" text="{i18n>internship}" />
                        </items>
                    </Select>

                    <Label text="{i18n>status}" />
                    <Select
                        id="editJobStatus"
                        selectedKey="{editJob>/status_code}">
                        <items>
                            <core:Item key="draft" text="{i18n>draft}" />
                            <core:Item key="published" text="{i18n>published}" />
                            <core:Item key="closed" text="{i18n>closed}" />
                        </items>
                    </Select>

                    <Label text="{i18n>description}" />
                    <TextArea
                        id="editJobDescription"
                        value="{editJob>/description}"
                        rows="5"
                        width="100%"
                        placeholder="{i18n>enterDescription}" />

                    <Label text="{i18n>requirements}" />
                    <TextArea
                        id="editJobRequirements"
                        value="{editJob>/requirements}"
                        rows="4"
                        width="100%"
                        placeholder="{i18n>enterRequirements}" />
                </form:content>
            </form:SimpleForm>
        </content>

        <beginButton>
            <Button
                text="{i18n>save}"
                type="Emphasized"
                press=".onSaveEditJob" />
        </beginButton>
        <endButton>
            <Button
                text="{i18n>cancel}"
                press=".onCancelEditJob" />
        </endButton>
    </Dialog>
</core:FragmentDefinition>
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/fragment/EditJobDialog.fragment.xml
git commit -m "feat: add EditJobDialog fragment for job editing"
```

---

### Task 2.2: Implement onEditJob in Main.controller.js

**Files:**
- Modify: `app/cv-management/webapp/controller/Main.controller.js:1844-1846`

**Step 1: Replace placeholder with implementation**

Replace lines 1844-1846:
```javascript
onEditJob: function (oEvent) {
    this.showInfo("Edit job functionality coming soon");
},
```

With:
```javascript
onEditJob: function (oEvent) {
    const oSource = oEvent.getSource();
    const oContext = oSource.getBindingContext();

    if (!oContext) {
        this.showError("No job selected");
        return;
    }

    const oJobData = oContext.getObject();

    // Create edit model with job data
    const oEditModel = new JSONModel({
        ID: oJobData.ID,
        title: oJobData.title,
        department: oJobData.department,
        location: oJobData.location,
        employmentType: oJobData.employmentType,
        status_code: oJobData.status_code,
        description: oJobData.description,
        requirements: oJobData.requirements
    });
    this.setModel(oEditModel, "editJob");

    // Open dialog
    if (!this._oEditJobDialog) {
        Fragment.load({
            id: this.getView().getId(),
            name: "cvmanagement.fragment.EditJobDialog",
            controller: this
        }).then(function (oDialog) {
            this._oEditJobDialog = oDialog;
            this.getView().addDependent(oDialog);
            oDialog.open();
        }.bind(this));
    } else {
        this._oEditJobDialog.open();
    }
},

onSaveEditJob: async function () {
    const oEditModel = this.getModel("editJob");
    const oJobData = oEditModel.getData();
    const sJobId = oJobData.ID;

    try {
        this.setBusy(true);

        const oModel = this.getModel();
        const oContext = oModel.bindContext(`/JobPostings(${sJobId})`);
        await oContext.requestObject();

        // Update properties
        oContext.setProperty("title", oJobData.title);
        oContext.setProperty("department", oJobData.department);
        oContext.setProperty("location", oJobData.location);
        oContext.setProperty("employmentType", oJobData.employmentType);
        oContext.setProperty("status_code", oJobData.status_code);
        oContext.setProperty("description", oJobData.description);
        oContext.setProperty("requirements", oJobData.requirements);

        await oModel.submitBatch("updateGroup");

        this._oEditJobDialog.close();
        this.showSuccess("Job updated successfully");

        // Refresh jobs table
        this.onRefreshJobs();
    } catch (oError) {
        this.handleError(oError);
    } finally {
        this.setBusy(false);
    }
},

onCancelEditJob: function () {
    this._oEditJobDialog.close();
},

onEditJobDialogEscape: function (oPromise) {
    oPromise.resolve();
    this._oEditJobDialog.close();
},
```

**Step 2: Run syntax check**

```bash
node -c app/cv-management/webapp/controller/Main.controller.js
```

**Step 3: Commit**

```bash
git add app/cv-management/webapp/controller/Main.controller.js
git commit -m "feat: implement Edit Job dialog functionality"
```

---

### Task 2.3: Implement Bulk Matching

**Files:**
- Modify: `app/cv-management/webapp/controller/Main.controller.js:2049-2052`

**Step 1: Replace placeholder with implementation**

Replace lines 2049-2052:
```javascript
onRunBulkMatching: function () {
    this.showInfo("Bulk matching functionality will run matching for all published jobs");
    // TODO: Implement bulk matching across all jobs
},
```

With:
```javascript
onRunBulkMatching: async function () {
    try {
        this.setBusy(true);

        const oModel = this.getModel();

        // Get all published jobs
        const oJobsBinding = oModel.bindList("/JobPostings", null, null,
            new Filter("status_code", FilterOperator.EQ, "published"));
        const aJobContexts = await oJobsBinding.requestContexts();

        if (aJobContexts.length === 0) {
            this.showInfo("No published jobs to match");
            return;
        }

        let successCount = 0;
        let failCount = 0;

        // Run matching for each job
        for (const oJobContext of aJobContexts) {
            const sJobId = oJobContext.getProperty("ID");
            try {
                const oAction = oModel.bindContext("/runMatching(...)");
                oAction.setParameter("jobPostingId", sJobId);
                await oAction.execute();
                successCount++;
            } catch (error) {
                console.error(`Matching failed for job ${sJobId}:`, error);
                failCount++;
            }
        }

        if (failCount === 0) {
            this.showSuccess(`Bulk matching completed for ${successCount} jobs`);
        } else {
            this.showWarning(`Matching completed: ${successCount} succeeded, ${failCount} failed`);
        }

        // Refresh dashboard
        this._loadDashboardData();
    } catch (oError) {
        this.handleError(oError);
    } finally {
        this.setBusy(false);
    }
},
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/controller/Main.controller.js
git commit -m "feat: implement bulk matching for all published jobs"
```

---

### Task 2.4: Implement View Interviews

**Files:**
- Modify: `app/cv-management/webapp/controller/Main.controller.js:2057-2060`

**Step 1: Replace placeholder with implementation**

Replace lines 2057-2060:
```javascript
onViewInterviews: function () {
    this.showInfo("Interviews view coming soon - will show all scheduled interviews");
    // TODO: Implement interviews overview
},
```

With:
```javascript
onViewInterviews: async function () {
    try {
        this.setBusy(true);

        const oModel = this.getModel();

        // Get match results with interview status
        const oBinding = oModel.bindList("/MatchResults", null, null,
            new Filter("status_code", FilterOperator.EQ, "interview"));
        const aContexts = await oBinding.requestContexts(0, 50);

        if (aContexts.length === 0) {
            this.showInfo("No interviews scheduled");
            return;
        }

        // Create interviews model
        const aInterviews = aContexts.map(ctx => ({
            candidateName: ctx.getProperty("candidate/firstName") + " " + ctx.getProperty("candidate/lastName"),
            jobTitle: ctx.getProperty("jobPosting/title"),
            matchScore: ctx.getProperty("overallScore"),
            status: ctx.getProperty("status_code"),
            matchedAt: ctx.getProperty("matchedAt")
        }));

        const oInterviewsModel = new JSONModel({ interviews: aInterviews });
        this.setModel(oInterviewsModel, "interviewsView");

        // Show in message toast for now (dialog can be added later)
        this.showSuccess(`Found ${aInterviews.length} scheduled interviews`);

    } catch (oError) {
        this.handleError(oError);
    } finally {
        this.setBusy(false);
    }
},
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/controller/Main.controller.js
git commit -m "feat: implement view interviews functionality"
```

---

### Task 2.5: Implement Document Preview

**Files:**
- Modify: `app/cv-management/webapp/controller/Main.controller.js:2095-2098`

**Step 1: Replace placeholder with implementation**

Replace lines 2095-2098:
```javascript
onViewDocument: function (oEvent) {
    this.showInfo("Document preview coming soon");
    // TODO: Implement document preview in dialog
},
```

With:
```javascript
onViewDocument: function (oEvent) {
    const oContext = oEvent.getSource().getBindingContext();
    if (!oContext) {
        this.showError("Cannot determine document");
        return;
    }

    const sDocumentId = oContext.getProperty("ID");
    const sFileName = oContext.getProperty("fileName");
    const sMediaType = oContext.getProperty("mediaType");

    // For PDF files, open in new tab with preview
    if (sMediaType === "application/pdf") {
        const sServiceUrl = this.getModel().sServiceUrl;
        const sUrl = `${sServiceUrl}/CVDocuments(${sDocumentId})/fileContent`;
        window.open(sUrl, "_blank");
    } else {
        // For other files, trigger download
        this.onDownloadDocument(oEvent);
    }
},
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/controller/Main.controller.js
git commit -m "feat: implement document preview for PDF files"
```

---

### Task 2.6: Fix Hardcoded URLs in Main.controller.js

**Files:**
- Modify: `app/cv-management/webapp/controller/Main.controller.js:128`

**Step 1: Move webhook URL to manifest.json config**

First, check if manifest.json has a config section, then update line 128.

Replace:
```javascript
webhookUrl: 'http://localhost:5678/webhook',
```

With:
```javascript
webhookUrl: this.getOwnerComponent().getManifestEntry("/sap.app/config/n8nWebhookUrl") || '',
```

**Step 2: Update manifest.json**

Add to manifest.json under sap.app:
```json
"config": {
    "n8nWebhookUrl": ""
}
```

**Step 3: Commit**

```bash
git add app/cv-management/webapp/controller/Main.controller.js app/cv-management/webapp/manifest.json
git commit -m "fix: move hardcoded webhook URL to manifest config"
```

---

## Phase 3: Job Detail & Rule Builder

### Task 3.1: Implement Edit Job in JobDetail.controller.js

**Files:**
- Modify: `app/cv-management/webapp/controller/JobDetail.controller.js:173-175`

**Step 1: Replace placeholder with implementation**

Replace lines 173-175:
```javascript
onEditJob: function () {
    this.showInfo("Edit job functionality coming soon");
},
```

With:
```javascript
onEditJob: function () {
    const oContext = this.getView().getBindingContext();
    if (!oContext) {
        this.showError("Job not loaded");
        return;
    }

    const oJobData = oContext.getObject();

    // Create edit model with job data
    const oEditModel = new sap.ui.model.json.JSONModel({
        ID: oJobData.ID,
        title: oJobData.title,
        department: oJobData.department,
        location: oJobData.location,
        employmentType: oJobData.employmentType,
        status_code: oJobData.status_code,
        description: oJobData.description,
        requirements: oJobData.requirements
    });
    this.setModel(oEditModel, "editJob");

    // Open dialog (reuse from Main controller)
    if (!this._oEditJobDialog) {
        sap.ui.core.Fragment.load({
            id: this.getView().getId(),
            name: "cvmanagement.fragment.EditJobDialog",
            controller: this
        }).then(function (oDialog) {
            this._oEditJobDialog = oDialog;
            this.getView().addDependent(oDialog);
            oDialog.open();
        }.bind(this));
    } else {
        this._oEditJobDialog.open();
    }
},

onSaveEditJob: async function () {
    const oEditModel = this.getModel("editJob");
    const oJobData = oEditModel.getData();

    try {
        this.setBusy(true);

        const oContext = this.getView().getBindingContext();

        // Update properties
        oContext.setProperty("title", oJobData.title);
        oContext.setProperty("department", oJobData.department);
        oContext.setProperty("location", oJobData.location);
        oContext.setProperty("employmentType", oJobData.employmentType);
        oContext.setProperty("status_code", oJobData.status_code);
        oContext.setProperty("description", oJobData.description);
        oContext.setProperty("requirements", oJobData.requirements);

        await this.getModel().submitBatch("updateGroup");

        this._oEditJobDialog.close();
        this.showSuccess("Job updated successfully");
    } catch (oError) {
        this.handleError(oError);
    } finally {
        this.setBusy(false);
    }
},

onCancelEditJob: function () {
    this._oEditJobDialog.close();
},

onEditJobDialogEscape: function (oPromise) {
    oPromise.resolve();
    this._oEditJobDialog.close();
},
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/controller/JobDetail.controller.js
git commit -m "feat: implement Edit Job in JobDetail controller"
```

---

### Task 3.2: Create RuleBuilderDialog Fragment

**Files:**
- Create: `app/cv-management/webapp/fragment/RuleBuilderDialog.fragment.xml`

**Step 1: Create the dialog**

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:form="sap.ui.layout.form">

    <Dialog
        id="ruleBuilderDialog"
        title="{= ${ruleBuilder>/isEdit} ? ${i18n>editRule} : ${i18n>addRule}}"
        contentWidth="500px">

        <content>
            <form:SimpleForm
                editable="true"
                layout="ResponsiveGridLayout"
                labelSpanL="4"
                labelSpanM="4"
                labelSpanS="12">

                <form:content>
                    <Label text="{i18n>ruleName}" required="true" />
                    <Input
                        id="ruleName"
                        value="{ruleBuilder>/name}"
                        placeholder="{i18n>enterRuleName}"
                        maxLength="100" />

                    <Label text="{i18n>ruleField}" required="true" />
                    <Select
                        id="ruleField"
                        selectedKey="{ruleBuilder>/field}"
                        change=".onRuleFieldChange">
                        <items>
                            <core:Item key="skills" text="{i18n>skills}" />
                            <core:Item key="experience" text="{i18n>yearsExperience}" />
                            <core:Item key="education" text="{i18n>education}" />
                            <core:Item key="location" text="{i18n>location}" />
                            <core:Item key="languages" text="{i18n>languages}" />
                        </items>
                    </Select>

                    <Label text="{i18n>operator}" required="true" />
                    <Select
                        id="ruleOperator"
                        selectedKey="{ruleBuilder>/operator}">
                        <items>
                            <core:Item key="contains" text="{i18n>contains}" />
                            <core:Item key="equals" text="{i18n>equals}" />
                            <core:Item key="greaterThan" text="{i18n>greaterThan}" />
                            <core:Item key="lessThan" text="{i18n>lessThan}" />
                            <core:Item key="between" text="{i18n>between}" />
                        </items>
                    </Select>

                    <Label text="{i18n>value}" required="true" />
                    <Input
                        id="ruleValue"
                        value="{ruleBuilder>/value}"
                        placeholder="{i18n>enterValue}" />

                    <Label text="{i18n>weight}" />
                    <Slider
                        id="ruleWeight"
                        value="{ruleBuilder>/weight}"
                        min="0"
                        max="100"
                        enableTickmarks="true"
                        showAdvancedTooltip="true" />

                    <Label text="{i18n>description}" />
                    <TextArea
                        id="ruleDescription"
                        value="{ruleBuilder>/description}"
                        rows="3"
                        width="100%" />
                </form:content>
            </form:SimpleForm>
        </content>

        <beginButton>
            <Button
                text="{i18n>save}"
                type="Emphasized"
                press=".onSaveRule" />
        </beginButton>
        <endButton>
            <Button
                text="{i18n>cancel}"
                press=".onCancelRule" />
        </endButton>
    </Dialog>
</core:FragmentDefinition>
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/fragment/RuleBuilderDialog.fragment.xml
git commit -m "feat: add RuleBuilderDialog fragment"
```

---

### Task 3.3: Implement Rule Builder Methods in JobDetail.controller.js

**Files:**
- Modify: `app/cv-management/webapp/controller/JobDetail.controller.js:956-959`

**Step 1: Replace placeholder with implementation**

Replace lines 956-959:
```javascript
onAddScoringRule: function () {
    this.showInfo("Scoring rule builder coming soon");
    // TODO: Open RuleBuilderDialog
},
```

With:
```javascript
onAddScoringRule: function () {
    // Create rule builder model
    const oRuleModel = new sap.ui.model.json.JSONModel({
        isEdit: false,
        name: "",
        field: "skills",
        operator: "contains",
        value: "",
        weight: 50,
        description: ""
    });
    this.setModel(oRuleModel, "ruleBuilder");

    this._openRuleBuilderDialog();
},

_openRuleBuilderDialog: function () {
    if (!this._oRuleBuilderDialog) {
        sap.ui.core.Fragment.load({
            id: this.getView().getId(),
            name: "cvmanagement.fragment.RuleBuilderDialog",
            controller: this
        }).then(function (oDialog) {
            this._oRuleBuilderDialog = oDialog;
            this.getView().addDependent(oDialog);
            oDialog.open();
        }.bind(this));
    } else {
        this._oRuleBuilderDialog.open();
    }
},

onSaveRule: async function () {
    const oRuleModel = this.getModel("ruleBuilder");
    const oRuleData = oRuleModel.getData();
    const sJobId = this.getView().getBindingContext().getProperty("ID");

    if (!oRuleData.name || !oRuleData.value) {
        this.showError("Please fill in required fields");
        return;
    }

    try {
        this.setBusy(true);

        const oModel = this.getModel();
        const oBinding = oModel.bindList("/ScoringRules");

        oBinding.create({
            jobPosting_ID: sJobId,
            name: oRuleData.name,
            field: oRuleData.field,
            operator: oRuleData.operator,
            value: oRuleData.value,
            weight: oRuleData.weight,
            description: oRuleData.description,
            isActive: true
        });

        await oModel.submitBatch("updateGroup");

        this._oRuleBuilderDialog.close();
        this.showSuccess("Rule created successfully");

        // Refresh rules table
        const oTable = this.byId("scoringRulesTable");
        if (oTable) {
            oTable.getBinding("items").refresh();
        }
    } catch (oError) {
        this.handleError(oError);
    } finally {
        this.setBusy(false);
    }
},

onCancelRule: function () {
    this._oRuleBuilderDialog.close();
},
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/controller/JobDetail.controller.js
git commit -m "feat: implement scoring rule builder functionality"
```

---

### Task 3.4: Implement Export/Import Rules

**Files:**
- Modify: `app/cv-management/webapp/controller/JobDetail.controller.js:1174-1183`

**Step 1: Replace placeholders with implementations**

Replace lines 1174-1183:
```javascript
onExportRules: function () {
    this.showInfo("Export functionality coming soon");
},

onImportRules: function () {
    this.showInfo("Import functionality coming soon");
},
```

With:
```javascript
onExportRules: async function () {
    try {
        const sJobId = this.getView().getBindingContext().getProperty("ID");
        const oModel = this.getModel();

        // Get all rules for this job
        const oBinding = oModel.bindList("/ScoringRules", null, null,
            new sap.ui.model.Filter("jobPosting_ID", sap.ui.model.FilterOperator.EQ, sJobId));
        const aContexts = await oBinding.requestContexts();

        const aRules = aContexts.map(ctx => ({
            name: ctx.getProperty("name"),
            field: ctx.getProperty("field"),
            operator: ctx.getProperty("operator"),
            value: ctx.getProperty("value"),
            weight: ctx.getProperty("weight"),
            description: ctx.getProperty("description"),
            isActive: ctx.getProperty("isActive")
        }));

        // Create and download JSON file
        const sContent = JSON.stringify({ rules: aRules, exportedAt: new Date().toISOString() }, null, 2);
        const oBlob = new Blob([sContent], { type: "application/json" });
        const sUrl = URL.createObjectURL(oBlob);

        const oLink = document.createElement("a");
        oLink.href = sUrl;
        oLink.download = `scoring-rules-${sJobId}.json`;
        oLink.click();

        URL.revokeObjectURL(sUrl);
        this.showSuccess(`Exported ${aRules.length} rules`);
    } catch (oError) {
        this.handleError(oError);
    }
},

onImportRules: function () {
    // Create file input
    const oFileInput = document.createElement("input");
    oFileInput.type = "file";
    oFileInput.accept = ".json";

    oFileInput.onchange = async (oEvent) => {
        const oFile = oEvent.target.files[0];
        if (!oFile) return;

        try {
            const sContent = await oFile.text();
            const oData = JSON.parse(sContent);

            if (!oData.rules || !Array.isArray(oData.rules)) {
                this.showError("Invalid rules file format");
                return;
            }

            const sJobId = this.getView().getBindingContext().getProperty("ID");
            const oModel = this.getModel();
            const oBinding = oModel.bindList("/ScoringRules");

            let importCount = 0;
            for (const oRule of oData.rules) {
                oBinding.create({
                    jobPosting_ID: sJobId,
                    name: oRule.name,
                    field: oRule.field,
                    operator: oRule.operator,
                    value: oRule.value,
                    weight: oRule.weight || 50,
                    description: oRule.description || "",
                    isActive: oRule.isActive !== false
                });
                importCount++;
            }

            await oModel.submitBatch("updateGroup");
            this.showSuccess(`Imported ${importCount} rules`);

            // Refresh rules table
            const oTable = this.byId("scoringRulesTable");
            if (oTable) {
                oTable.getBinding("items").refresh();
            }
        } catch (oError) {
            this.showError("Failed to import rules: " + oError.message);
        }
    };

    oFileInput.click();
},
```

**Step 2: Commit**

```bash
git add app/cv-management/webapp/controller/JobDetail.controller.js
git commit -m "feat: implement scoring rules export/import"
```

---

## Phase 4: Python ML Service

### Task 4.1: Implement CAP Service Integration

**Files:**
- Modify: `python-ml-service/app/services/matching_service.py:373-394`

**Step 1: Replace placeholder with implementation**

Replace lines 373-394:
```python
async def _get_candidate_data(self, candidate_id: str) -> Optional[Dict[str, Any]]:
    """
    Get candidate data for criteria scoring.
    This would ideally call CAP service or have a local cache.
    """
    # TODO: Implement CAP service integration
    # For now, return placeholder based on embeddings metadata
    # In production, this should call the CAP CandidateService API

    # Example: could store basic candidate data in PostgreSQL
    # or call CAP service: GET /api/candidates/Candidates('{candidate_id}')?$expand=skills,languages,certifications

    logger.debug(f"Getting candidate data for {candidate_id}")

    # Placeholder - in real implementation, call CAP API
    return {
        'skills': [],
        'languages': {},
        'certifications': [],
        'totalExperienceYears': 0,
        'educationLevel': ''
    }
```

With:
```python
async def _get_candidate_data(self, candidate_id: str) -> Optional[Dict[str, Any]]:
    """
    Get candidate data from CAP service for criteria scoring.
    """
    import httpx

    cap_url = os.getenv('CAP_SERVICE_URL', 'http://localhost:4004')

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{cap_url}/api/Candidates({candidate_id})",
                params={"$expand": "skills,workHistory,education"},
                headers={"Accept": "application/json"}
            )

            if response.status_code == 404:
                logger.warning(f"Candidate {candidate_id} not found in CAP service")
                return None

            response.raise_for_status()
            data = response.json()

            # Transform CAP response to expected format
            return self._transform_candidate_response(data)

    except httpx.TimeoutException:
        logger.error(f"Timeout getting candidate data for {candidate_id}")
        return None
    except httpx.HTTPError as e:
        logger.error(f"HTTP error getting candidate data: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to get candidate data for {candidate_id}: {e}")
        return None

def _transform_candidate_response(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """Transform CAP candidate response to matching service format."""
    skills = data.get('skills', [])
    work_history = data.get('workHistory', [])
    education = data.get('education', [])

    # Calculate total experience years
    total_years = 0
    for job in work_history:
        if job.get('startDate') and job.get('endDate'):
            try:
                from datetime import datetime
                start = datetime.fromisoformat(job['startDate'].replace('Z', '+00:00'))
                end_str = job['endDate']
                if end_str.lower() == 'present':
                    end = datetime.now()
                else:
                    end = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
                total_years += (end - start).days / 365
            except:
                pass

    # Determine education level
    education_levels = {'phd': 5, 'doctorate': 5, 'master': 4, 'mba': 4, 'bachelor': 3, 'associate': 2}
    highest_level = ''
    highest_rank = 0
    for edu in education:
        degree = (edu.get('degree') or '').lower()
        for level, rank in education_levels.items():
            if level in degree and rank > highest_rank:
                highest_rank = rank
                highest_level = level.title()

    return {
        'skills': [s.get('name', s) if isinstance(s, dict) else s for s in skills],
        'languages': data.get('languages', {}),
        'certifications': data.get('certifications', []),
        'totalExperienceYears': round(total_years, 1),
        'educationLevel': highest_level
    }
```

**Step 2: Add httpx to requirements if not present**

```bash
grep -q "httpx" python-ml-service/requirements.txt || echo "httpx>=0.25.0" >> python-ml-service/requirements.txt
```

**Step 3: Commit**

```bash
git add python-ml-service/app/services/matching_service.py python-ml-service/requirements.txt
git commit -m "feat: implement CAP service integration for candidate data"
```

---

## Phase 5: Code Quality Fixes

### Task 5.1: Fix Regex Infinite Loop Potential

**Files:**
- Modify: `srv/handlers/ocr-service.js:549,572`

**Step 1: Replace exec loops with matchAll**

Replace the pattern at line 549:
```javascript
let match;
while ((match = jobPattern.exec(experienceSection)) !== null) {
```

With:
```javascript
const matches = experienceSection.matchAll(jobPattern);
for (const match of matches) {
```

Do the same for line 572 with `eduPattern`.

**Step 2: Commit**

```bash
git add srv/handlers/ocr-service.js
git commit -m "fix: replace exec loops with matchAll to prevent infinite loops"
```

---

### Task 5.2: Fix Virtual fullName Field

**Files:**
- Modify: `db/schema.cds:93`

**Step 1: Update virtual field definition**

The virtual field needs to be computed in the service layer since CDS virtual fields don't support expressions.

Add to `srv/cv-sorting-service.js` after entity handlers:
```javascript
// Compute virtual fullName field
this.after('READ', 'Candidates', (data) => {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
        if (item && !item.fullName) {
            item.fullName = [item.firstName, item.lastName].filter(Boolean).join(' ');
        }
    }
});
```

**Step 2: Commit**

```bash
git add srv/cv-sorting-service.js
git commit -m "fix: compute virtual fullName field in service layer"
```

---

### Task 5.3: Replace Notification Placeholder

**Files:**
- Modify: `srv/candidate-service.js:134-139`

**Step 1: Replace console.log with actual implementation**

Replace:
```javascript
async _sendStatusNotification(candidate, newStatus) {
    // Would integrate with notification service or email service
    console.log(`Notification sent to ${candidate.email} about status: ${newStatus}`);
}
```

With:
```javascript
async _sendStatusNotification(candidate, newStatus) {
    const LOG = cds.log('candidate-service');

    if (!candidate.email) {
        LOG.warn('Cannot send notification - candidate has no email', { candidateId: candidate.ID });
        return;
    }

    try {
        // Emit event for email service to handle
        await this.emit('statusNotification', {
            candidateId: candidate.ID,
            email: candidate.email,
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            newStatus: newStatus,
            timestamp: new Date().toISOString()
        });

        LOG.info('Status notification event emitted', {
            candidateId: candidate.ID,
            status: newStatus
        });
    } catch (error) {
        LOG.error('Failed to emit status notification', {
            candidateId: candidate.ID,
            error: error.message
        });
    }
}
```

**Step 2: Commit**

```bash
git add srv/candidate-service.js
git commit -m "fix: replace notification placeholder with event emission"
```

---

### Task 5.4: Run Full Test Suite

**Step 1: Run all tests**

```bash
cd /Users/furkankose/cv-sorting-app/cv-sorting-project/.worktrees/codebase-cleanup
npm test -- --no-coverage
```

**Step 2: Fix any failing tests**

Address test failures as they arise.

**Step 3: Final commit**

```bash
git add -A
git commit -m "test: ensure all tests pass after codebase cleanup"
```

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. Service Layer | 3 tasks | Pending |
| 2. Main Controller | 6 tasks | Pending |
| 3. Job Detail | 4 tasks | Pending |
| 4. Python ML | 1 task | Pending |
| 5. Code Quality | 4 tasks | Pending |
| **Total** | **18 tasks** | |

---

## Verification Checklist

After completing all tasks:

- [ ] All tests pass (`npm test`)
- [ ] No hardcoded localhost URLs remain
- [ ] Edit Job dialog works in both Main and JobDetail views
- [ ] Bulk matching runs for all published jobs
- [ ] Document preview opens PDFs
- [ ] Rule Builder creates rules correctly
- [ ] Export/Import rules works
- [ ] Python ML service fetches candidate data from CAP
- [ ] No console.log placeholders remain
- [ ] Regex patterns use matchAll instead of exec loops
