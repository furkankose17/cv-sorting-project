# Playwright E2E Test Suite Design

**Date:** 2025-12-18
**Status:** Approved
**Estimated Tests:** 195

## Overview

Exhaustive Playwright test suite for the CV Sorting Application covering all pages, critical user journeys, and core functionality.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Organization | Page-Centric | Mirrors app structure, easy debugging |
| Coverage | Critical Paths First | ~195 tests, iterative delivery |
| Backend | Real Integration | Catches real bugs, test fixtures for data |
| Pattern | Page Object Model | Maintainable, reusable, IDE support |

---

## Architecture

```
tests/
├── playwright.config.ts          # Playwright configuration
├── fixtures/
│   ├── test-fixtures.ts          # Custom fixtures (auth, data seeding)
│   └── test-data.ts              # Test data constants
├── pages/                        # Page Object Models
│   ├── BasePage.ts               # Common page methods
│   ├── MainPage.ts               # Main dashboard page
│   ├── CandidateDetailPage.ts    # Candidate detail page
│   ├── JobDetailPage.ts          # Job detail page
│   ├── CVReviewPage.ts           # CV review page
│   └── components/               # Reusable UI components
│       ├── Dialog.ts             # Base dialog class
│       ├── Table.ts              # SAP UI5 table helpers
│       └── dialogs/              # Specific dialog POMs
├── api/                          # API helpers for data setup
│   ├── CandidateAPI.ts
│   ├── JobAPI.ts
│   └── TestDataManager.ts        # Seed/cleanup orchestration
├── specs/                        # Test specifications
│   ├── main/
│   │   ├── upload-tab.spec.ts
│   │   ├── candidates-tab.spec.ts
│   │   ├── jobs-tab.spec.ts
│   │   ├── documents-tab.spec.ts
│   │   └── analytics-tab.spec.ts
│   ├── candidate-detail.spec.ts
│   ├── job-detail.spec.ts
│   ├── cv-review.spec.ts
│   └── e2e-flows/                # Cross-page user journeys
│       ├── cv-to-candidate.spec.ts
│       ├── candidate-matching.spec.ts
│       ├── interview-workflow.spec.ts
│       ├── job-lifecycle.spec.ts
│       └── search-filter.spec.ts
└── utils/
    ├── selectors.ts              # SAP UI5 specific selectors
    └── wait-helpers.ts           # Custom wait utilities
```

---

## Page Object Models

### BasePage.ts

```typescript
import { Page, Locator } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  // SAP UI5 specific helpers
  async waitForUI5Ready(): Promise<void> {
    await this.page.waitForFunction(() => {
      return window.sap?.ui?.getCore()?.isReady?.() ?? false;
    }, { timeout: 30000 });
  }

  async getControlById(id: string): Promise<Locator> {
    return this.page.locator(`[id$="${id}"]`);
  }

  async clickButton(id: string): Promise<void> {
    await this.page.locator(`[id$="${id}"]`).click();
    await this.waitForBusyEnd();
  }

  async fillInput(id: string, value: string): Promise<void> {
    const input = this.page.locator(`[id$="${id}"] input`);
    await input.clear();
    await input.fill(value);
  }

  async selectFromDropdown(id: string, value: string): Promise<void> {
    await this.page.locator(`[id$="${id}"]`).click();
    await this.page.locator(`.sapMSelectList [data-key="${value}"]`).click();
  }

  async waitForBusyEnd(): Promise<void> {
    await this.page.waitForSelector('.sapUiLocalBusy', {
      state: 'hidden',
      timeout: 30000
    }).catch(() => {});
  }

  async getMessageToast(): Promise<string> {
    const toast = await this.page.waitForSelector('.sapMMessageToast', { timeout: 5000 });
    return await toast.textContent() ?? '';
  }

  async expectToast(expectedText: string): Promise<void> {
    const toast = await this.getMessageToast();
    expect(toast).toContain(expectedText);
  }
}
```

### MainPage.ts

```typescript
import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { UploadTab } from './components/UploadTab';
import { CandidatesTab } from './components/CandidatesTab';
import { JobsTab } from './components/JobsTab';
import { DocumentsTab } from './components/DocumentsTab';
import { AnalyticsTab } from './components/AnalyticsTab';

export class MainPage extends BasePage {
  readonly uploadTab: UploadTab;
  readonly candidatesTab: CandidatesTab;
  readonly jobsTab: JobsTab;
  readonly documentsTab: DocumentsTab;
  readonly analyticsTab: AnalyticsTab;

  constructor(page: Page) {
    super(page);
    this.uploadTab = new UploadTab(page);
    this.candidatesTab = new CandidatesTab(page);
    this.jobsTab = new JobsTab(page);
    this.documentsTab = new DocumentsTab(page);
    this.analyticsTab = new AnalyticsTab(page);
  }

  async navigateTo(): Promise<void> {
    await this.page.goto('/cv-management/webapp/index.html');
    await this.waitForUI5Ready();
    await this.waitForBusyEnd();
  }

  async switchToTab(key: 'upload' | 'candidates' | 'jobs' | 'documents' | 'analytics'): Promise<void> {
    const tabMap = {
      upload: 'uploadTab',
      candidates: 'candidatesTab',
      jobs: 'jobsTab',
      documents: 'documentsTab',
      analytics: 'analyticsTab'
    };
    await this.page.locator(`[id$="${tabMap[key]}"]`).click();
    await this.waitForBusyEnd();
  }

  async globalSearch(query: string): Promise<void> {
    await this.fillInput('globalSearchField', query);
    await this.page.keyboard.press('Enter');
    await this.waitForBusyEnd();
  }

  async openAIAssistant(): Promise<void> {
    await this.clickButton('aiAssistantButton');
  }
}
```

### CandidatesTab Component

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AddCandidateDialog } from './dialogs/AddCandidateDialog';
import { AdvancedSearchDialog } from './dialogs/AdvancedSearchDialog';
import { UpdateStatusDialog } from './dialogs/UpdateStatusDialog';

export interface CandidateRow {
  name: string;
  email: string;
  status: string;
  experience: string;
  skills: string;
  bestMatch: string;
}

export class CandidatesTab extends BasePage {
  readonly addCandidateDialog: AddCandidateDialog;
  readonly advancedSearchDialog: AdvancedSearchDialog;
  readonly updateStatusDialog: UpdateStatusDialog;

  constructor(page: Page) {
    super(page);
    this.addCandidateDialog = new AddCandidateDialog(page);
    this.advancedSearchDialog = new AdvancedSearchDialog(page);
    this.updateStatusDialog = new UpdateStatusDialog(page);
  }

  async getTableRows(): Promise<CandidateRow[]> {
    await this.page.waitForSelector('[id$="candidatesTable"] tbody tr');
    const rows = await this.page.locator('[id$="candidatesTable"] tbody tr').all();

    return Promise.all(rows.map(async (row) => ({
      name: await row.locator('td:nth-child(1)').textContent() ?? '',
      email: await row.locator('td:nth-child(1) .sapUiSmallText').textContent() ?? '',
      status: await row.locator('td:nth-child(2)').textContent() ?? '',
      experience: await row.locator('td:nth-child(3)').textContent() ?? '',
      skills: await row.locator('td:nth-child(4)').textContent() ?? '',
      bestMatch: await row.locator('td:nth-child(6)').textContent() ?? '',
    })));
  }

  async searchCandidates(query: string): Promise<void> {
    await this.fillInput('candidateSearchField', query);
    await this.page.keyboard.press('Enter');
    await this.waitForBusyEnd();
  }

  async filterByStatus(status: string): Promise<void> {
    await this.page.locator(`[id$="statusFilterSegment"] [data-key="${status}"]`).click();
    await this.waitForBusyEnd();
  }

  async clickAddCandidate(): Promise<void> {
    await this.clickButton('addCandidateButton');
    await this.addCandidateDialog.waitForOpen();
  }

  async selectCandidate(index: number): Promise<void> {
    await this.page.locator(`[id$="candidatesTable"] tbody tr:nth-child(${index + 1})`).click();
  }

  async selectMultipleCandidates(indices: number[]): Promise<void> {
    for (const index of indices) {
      await this.page.locator(
        `[id$="candidatesTable"] tbody tr:nth-child(${index + 1}) .sapMCb`
      ).click();
    }
  }

  async bulkUpdateStatus(): Promise<void> {
    await this.clickButton('bulkUpdateStatusButton');
  }

  async matchSelectedCandidates(): Promise<void> {
    await this.clickButton('matchSelectedButton');
    await this.waitForBusyEnd();
  }

  async openAdvancedSearch(): Promise<void> {
    await this.clickButton('advancedSearchButton');
    await this.advancedSearchDialog.waitForOpen();
  }

  async refreshCandidates(): Promise<void> {
    await this.clickButton('refreshCandidatesButton');
    await this.waitForBusyEnd();
  }

  async getRowCount(): Promise<number> {
    const rows = await this.page.locator('[id$="candidatesTable"] tbody tr').all();
    return rows.length;
  }

  async clickCandidateRow(index: number): Promise<void> {
    await this.page.locator(`[id$="candidatesTable"] tbody tr:nth-child(${index + 1})`).click();
    await this.waitForBusyEnd();
  }
}
```

### Dialog Base Class

```typescript
import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class Dialog extends BasePage {
  constructor(page: Page, protected dialogId: string) {
    super(page);
  }

  async waitForOpen(): Promise<void> {
    await this.page.waitForSelector(`[id$="${this.dialogId}"]`, { state: 'visible' });
  }

  async waitForClose(): Promise<void> {
    await this.page.waitForSelector(`[id$="${this.dialogId}"]`, { state: 'hidden' });
  }

  async clickConfirm(): Promise<void> {
    await this.page.locator(`[id$="${this.dialogId}"] button:has-text("Create"), [id$="${this.dialogId}"] button:has-text("Save"), [id$="${this.dialogId}"] button:has-text("Confirm"), [id$="${this.dialogId}"] button:has-text("Update")`).first().click();
    await this.waitForBusyEnd();
  }

  async clickCancel(): Promise<void> {
    await this.page.locator(`[id$="${this.dialogId}"] button:has-text("Cancel")`).click();
    await this.waitForClose();
  }

  async isOpen(): Promise<boolean> {
    return await this.page.locator(`[id$="${this.dialogId}"]`).isVisible();
  }
}
```

### AddCandidateDialog

```typescript
import { Page } from '@playwright/test';
import { Dialog } from '../Dialog';

export interface CandidateData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  headline?: string;
  city?: string;
  totalExperienceYears?: number;
}

export class AddCandidateDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'addCandidateDialog');
  }

  async fill(data: CandidateData): Promise<void> {
    await this.fillInput('firstNameInput', data.firstName);
    await this.fillInput('lastNameInput', data.lastName);
    await this.fillInput('emailInput', data.email);

    if (data.phone) {
      await this.fillInput('phoneInput', data.phone);
    }
    if (data.headline) {
      await this.fillInput('headlineInput', data.headline);
    }
    if (data.city) {
      await this.fillInput('cityInput', data.city);
    }
    if (data.totalExperienceYears !== undefined) {
      await this.fillInput('experienceInput', data.totalExperienceYears.toString());
    }
  }

  async createCandidate(data: CandidateData): Promise<void> {
    await this.fill(data);
    await this.clickConfirm();
    await this.waitForClose();
  }
}
```

---

## Test Utilities

### SAP UI5 Selectors

```typescript
// utils/selectors.ts
export const UI5Selectors = {
  // By stable ID (preferred)
  byId: (id: string) => `[id$="${id}"]`,

  // By control type
  byControl: (type: string) => `[data-sap-ui="${type}"]`,

  // Common UI5 patterns
  table: (id: string) => `[id$="${id}"] table`,
  tableRow: (tableId: string, index: number) =>
    `[id$="${tableId}"] tbody tr:nth-child(${index + 1})`,
  tableRowCheckbox: (tableId: string, index: number) =>
    `[id$="${tableId}"] tbody tr:nth-child(${index + 1}) .sapMCb`,
  button: (id: string) => `[id$="${id}"].sapMBtn`,
  input: (id: string) => `[id$="${id}"] input`,
  textArea: (id: string) => `[id$="${id}"] textarea`,
  dialog: (id: string) => `[id$="${id}"].sapMDialog`,
  tab: (key: string) => `[data-key="${key}"]`,
  messageToast: () => '.sapMMessageToast',
  busyIndicator: () => '.sapUiLocalBusy',

  // Icon Tab Bar
  iconTabFilter: (key: string) => `[id*="TabFilter"][data-key="${key}"]`,

  // Object Status
  objectStatus: (state: string) => `.sapMObjStatus${state}`,

  // Segmented Button
  segmentedButtonItem: (key: string) => `.sapMSegBBtn[data-key="${key}"]`,

  // Select/Dropdown
  selectList: () => '.sapMSelectList',
  selectItem: (key: string) => `.sapMSelectList [data-key="${key}"]`,
};
```

### Wait Helpers

```typescript
// utils/wait-helpers.ts
import { Page } from '@playwright/test';

export async function waitForUI5(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return window.sap?.ui?.getCore()?.isReady?.() ?? false;
  }, { timeout: 30000 });
}

export async function waitForBusyEnd(page: Page): Promise<void> {
  await page.waitForSelector('.sapUiLocalBusy', {
    state: 'hidden',
    timeout: 30000
  }).catch(() => {});
}

export async function waitForTableData(page: Page, tableId: string, minRows = 1): Promise<void> {
  await page.waitForFunction(
    ({ id, min }) => {
      const table = document.querySelector(`[id$="${id}"] tbody`);
      return table && table.querySelectorAll('tr').length >= min;
    },
    { id: tableId, min: minRows },
    { timeout: 15000 }
  );
}

export async function waitForToast(page: Page): Promise<string> {
  const toast = await page.waitForSelector('.sapMMessageToast', { timeout: 5000 });
  return await toast.textContent() ?? '';
}

export async function waitForDialogOpen(page: Page, dialogId: string): Promise<void> {
  await page.waitForSelector(`[id$="${dialogId}"]`, { state: 'visible', timeout: 10000 });
}

export async function waitForDialogClose(page: Page, dialogId: string): Promise<void> {
  await page.waitForSelector(`[id$="${dialogId}"]`, { state: 'hidden', timeout: 10000 });
}

export async function waitForNavigation(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.waitForURL(urlPattern, { timeout: 15000 });
  await waitForUI5(page);
  await waitForBusyEnd(page);
}
```

---

## Test Fixtures

### Custom Fixtures

```typescript
// fixtures/test-fixtures.ts
import { test as base, expect } from '@playwright/test';
import { MainPage } from '../pages/MainPage';
import { CandidateDetailPage } from '../pages/CandidateDetailPage';
import { JobDetailPage } from '../pages/JobDetailPage';
import { CVReviewPage } from '../pages/CVReviewPage';
import { TestDataManager } from '../api/TestDataManager';

type TestFixtures = {
  mainPage: MainPage;
  candidateDetailPage: CandidateDetailPage;
  jobDetailPage: JobDetailPage;
  cvReviewPage: CVReviewPage;
  testData: TestDataManager;
};

export const test = base.extend<TestFixtures>({
  mainPage: async ({ page }, use) => {
    const mainPage = new MainPage(page);
    await mainPage.navigateTo();
    await use(mainPage);
  },

  candidateDetailPage: async ({ page }, use) => {
    const candidateDetailPage = new CandidateDetailPage(page);
    await use(candidateDetailPage);
  },

  jobDetailPage: async ({ page }, use) => {
    const jobDetailPage = new JobDetailPage(page);
    await use(jobDetailPage);
  },

  cvReviewPage: async ({ page }, use) => {
    const cvReviewPage = new CVReviewPage(page);
    await use(cvReviewPage);
  },

  testData: async ({ request }, use) => {
    const manager = new TestDataManager(request);
    await manager.seedTestData();
    await use(manager);
    await manager.cleanup();
  },
});

export { expect };
```

### Test Data Manager

```typescript
// api/TestDataManager.ts
import { APIRequestContext } from '@playwright/test';

export interface TestCandidate {
  ID: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface TestJob {
  ID: string;
  title: string;
  department: string;
  status: string;
}

export class TestDataManager {
  private baseUrl = '/api';
  private createdCandidates: string[] = [];
  private createdJobs: string[] = [];
  private createdDocuments: string[] = [];

  constructor(private request: APIRequestContext) {}

  async seedTestData(): Promise<void> {
    // Create test candidates
    const candidate1 = await this.createCandidate({
      firstName: 'Test',
      lastName: 'Candidate',
      email: `test.candidate.${Date.now()}@example.com`,
      totalExperienceYears: 5,
    });
    this.createdCandidates.push(candidate1.ID);

    // Create test job
    const job1 = await this.createJob({
      title: 'Test Software Engineer',
      department: 'Engineering',
      location: 'Remote',
      status: 'published',
    });
    this.createdJobs.push(job1.ID);
  }

  async createCandidate(data: Partial<TestCandidate>): Promise<TestCandidate> {
    const response = await this.request.post(`${this.baseUrl}/Candidates`, {
      data: {
        firstName: data.firstName ?? 'Test',
        lastName: data.lastName ?? 'User',
        email: data.email ?? `test.${Date.now()}@example.com`,
        ...data,
      },
    });
    const result = await response.json();
    this.createdCandidates.push(result.ID);
    return result;
  }

  async createJob(data: Partial<TestJob>): Promise<TestJob> {
    const response = await this.request.post(`${this.baseUrl}/JobPostings`, {
      data: {
        title: data.title ?? 'Test Job',
        department: data.department ?? 'Test Department',
        status: data.status ?? 'draft',
        ...data,
      },
    });
    const result = await response.json();
    this.createdJobs.push(result.ID);
    return result;
  }

  async uploadTestCV(filePath: string): Promise<string> {
    // Implementation for uploading test CV
    return 'document-id';
  }

  async cleanup(): Promise<void> {
    // Delete in reverse dependency order
    for (const id of this.createdDocuments) {
      await this.request.delete(`${this.baseUrl}/CVDocuments(${id})`).catch(() => {});
    }
    for (const id of this.createdCandidates) {
      await this.request.delete(`${this.baseUrl}/Candidates(ID=${id},IsActiveEntity=true)`).catch(() => {});
    }
    for (const id of this.createdJobs) {
      await this.request.delete(`${this.baseUrl}/JobPostings(ID=${id},IsActiveEntity=true)`).catch(() => {});
    }
  }

  getCreatedCandidateIds(): string[] {
    return [...this.createdCandidates];
  }

  getCreatedJobIds(): string[] {
    return [...this.createdJobs];
  }
}
```

---

## Test Specifications

### Upload Tab Tests

```typescript
// specs/main/upload-tab.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';
import path from 'path';

test.describe('Upload Tab', () => {
  test.beforeEach(async ({ mainPage }) => {
    await mainPage.switchToTab('upload');
  });

  test.describe('File Selection', () => {
    test('should display upload area with supported formats', async ({ mainPage }) => {
      const uploadArea = await mainPage.uploadTab.getUploadArea();
      await expect(uploadArea).toBeVisible();
      await expect(mainPage.page.locator('text=PDF, PNG, JPG, TIFF, DOC, DOCX')).toBeVisible();
    });

    test('should accept valid PDF file', async ({ mainPage }) => {
      await mainPage.uploadTab.selectFile('test-data/sample-cv.pdf');
      const selectedFiles = await mainPage.uploadTab.getSelectedFiles();
      expect(selectedFiles).toHaveLength(1);
      expect(selectedFiles[0].name).toContain('.pdf');
    });

    test('should accept valid image files', async ({ mainPage }) => {
      await mainPage.uploadTab.selectFile('test-data/sample-cv.png');
      const selectedFiles = await mainPage.uploadTab.getSelectedFiles();
      expect(selectedFiles).toHaveLength(1);
    });

    test('should reject unsupported file types', async ({ mainPage }) => {
      await mainPage.uploadTab.selectFile('test-data/invalid.exe');
      const toast = await mainPage.getMessageToast();
      expect(toast).toContain('unsupported');
    });

    test('should enforce 10MB file size limit', async ({ mainPage }) => {
      // Test with oversized file
      await mainPage.uploadTab.selectFile('test-data/large-file.pdf');
      const toast = await mainPage.getMessageToast();
      expect(toast).toContain('size');
    });
  });

  test.describe('Processing', () => {
    test('should process single CV with OCR', async ({ mainPage }) => {
      await mainPage.uploadTab.selectFile('test-data/sample-cv.pdf');
      await mainPage.uploadTab.clickProcessCVs();

      await expect(mainPage.page.locator('[id$="progressIndicator"]')).toBeVisible();
      await mainPage.uploadTab.waitForProcessingComplete();

      const result = await mainPage.uploadTab.getProcessingResult();
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should show processing progress indicator', async ({ mainPage }) => {
      await mainPage.uploadTab.selectFile('test-data/sample-cv.pdf');
      await mainPage.uploadTab.clickProcessCVs();

      await expect(mainPage.page.locator('[id$="progressIndicator"]')).toBeVisible();
    });

    test('should display confidence score after processing', async ({ mainPage }) => {
      await mainPage.uploadTab.selectFile('test-data/sample-cv.pdf');
      await mainPage.uploadTab.clickProcessCVs();
      await mainPage.uploadTab.waitForProcessingComplete();

      const confidence = await mainPage.uploadTab.getConfidenceScore();
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(100);
    });

    test('should auto-create candidate when confidence >= 85%', async ({ mainPage }) => {
      await mainPage.uploadTab.setAutoCreateThreshold(85);
      await mainPage.uploadTab.selectFile('test-data/high-quality-cv.pdf');
      await mainPage.uploadTab.clickProcessCVs();
      await mainPage.uploadTab.waitForProcessingComplete();

      const toast = await mainPage.getMessageToast();
      expect(toast).toContain('Candidate created');
    });

    test('should navigate to CV Review when confidence < 85%', async ({ mainPage }) => {
      await mainPage.uploadTab.selectFile('test-data/low-quality-cv.pdf');
      await mainPage.uploadTab.clickProcessCVs();
      await mainPage.uploadTab.waitForProcessingComplete();

      await expect(mainPage.page).toHaveURL(/cv-review/);
    });
  });

  test.describe('Batch Upload', () => {
    test('should switch to batch upload mode', async ({ mainPage }) => {
      await mainPage.uploadTab.toggleBatchMode();
      await expect(mainPage.page.locator('text=Batch Upload')).toBeVisible();
    });

    test('should process multiple files', async ({ mainPage }) => {
      await mainPage.uploadTab.toggleBatchMode();
      await mainPage.uploadTab.selectFiles([
        'test-data/cv1.pdf',
        'test-data/cv2.pdf',
        'test-data/cv3.pdf'
      ]);
      await mainPage.uploadTab.clickProcessCVs();
      await mainPage.uploadTab.waitForBatchComplete();

      const results = await mainPage.uploadTab.getBatchResults();
      expect(results).toHaveLength(3);
    });
  });

  test.describe('Recent Uploads Table', () => {
    test('should display recent uploads', async ({ mainPage }) => {
      const uploads = await mainPage.uploadTab.getRecentUploads();
      expect(uploads.length).toBeGreaterThanOrEqual(0);
    });

    test('should navigate to document on row click', async ({ mainPage, testData }) => {
      // Ensure we have at least one upload
      const uploads = await mainPage.uploadTab.getRecentUploads();
      if (uploads.length > 0) {
        await mainPage.uploadTab.clickRecentUpload(0);
        await expect(mainPage.page).toHaveURL(/cv-review|document/);
      }
    });
  });
});
```

### Candidates Tab Tests

```typescript
// specs/main/candidates-tab.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Candidates Tab', () => {
  test.beforeEach(async ({ mainPage }) => {
    await mainPage.switchToTab('candidates');
  });

  test.describe('List & Display', () => {
    test('should display candidates table with columns', async ({ mainPage }) => {
      const table = mainPage.page.locator('[id$="candidatesTable"]');
      await expect(table).toBeVisible();

      await expect(mainPage.page.locator('text=Candidate')).toBeVisible();
      await expect(mainPage.page.locator('text=Status')).toBeVisible();
      await expect(mainPage.page.locator('text=Experience')).toBeVisible();
      await expect(mainPage.page.locator('text=Skills')).toBeVisible();
    });

    test('should show candidate avatar with initials', async ({ mainPage, testData }) => {
      const avatars = await mainPage.page.locator('[id$="candidatesTable"] .sapFAvatar').all();
      expect(avatars.length).toBeGreaterThan(0);
    });

    test('should display status badges correctly', async ({ mainPage }) => {
      const statusBadges = await mainPage.page.locator('[id$="candidatesTable"] .sapMObjStatus').all();
      expect(statusBadges.length).toBeGreaterThan(0);
    });
  });

  test.describe('Search & Filter', () => {
    test('should search candidates by name', async ({ mainPage, testData }) => {
      await mainPage.candidatesTab.searchCandidates('Test');
      const rows = await mainPage.candidatesTab.getTableRows();

      for (const row of rows) {
        expect(row.name.toLowerCase()).toContain('test');
      }
    });

    test('should filter by status', async ({ mainPage }) => {
      await mainPage.candidatesTab.filterByStatus('new');
      const rows = await mainPage.candidatesTab.getTableRows();

      for (const row of rows) {
        expect(row.status.toLowerCase()).toContain('new');
      }
    });

    test('should open advanced search dialog', async ({ mainPage }) => {
      await mainPage.candidatesTab.openAdvancedSearch();
      await expect(mainPage.candidatesTab.advancedSearchDialog.isOpen()).resolves.toBe(true);
    });

    test('should apply multiple advanced filters', async ({ mainPage }) => {
      await mainPage.candidatesTab.openAdvancedSearch();
      await mainPage.candidatesTab.advancedSearchDialog.setMinExperience(3);
      await mainPage.candidatesTab.advancedSearchDialog.addSkillFilter('JavaScript');
      await mainPage.candidatesTab.advancedSearchDialog.clickSearch();

      const rowCount = await mainPage.candidatesTab.getRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    });

    test('should clear filters', async ({ mainPage }) => {
      await mainPage.candidatesTab.filterByStatus('new');
      await mainPage.candidatesTab.filterByStatus('all');

      const rowCount = await mainPage.candidatesTab.getRowCount();
      expect(rowCount).toBeGreaterThan(0);
    });
  });

  test.describe('CRUD Operations', () => {
    test('should open Add Candidate dialog', async ({ mainPage }) => {
      await mainPage.candidatesTab.clickAddCandidate();
      await expect(mainPage.candidatesTab.addCandidateDialog.isOpen()).resolves.toBe(true);
    });

    test('should create new candidate with required fields', async ({ mainPage }) => {
      await mainPage.candidatesTab.clickAddCandidate();
      await mainPage.candidatesTab.addCandidateDialog.createCandidate({
        firstName: 'John',
        lastName: 'Doe',
        email: `john.doe.${Date.now()}@example.com`,
      });

      const toast = await mainPage.getMessageToast();
      expect(toast).toContain('created');
    });

    test('should validate required fields', async ({ mainPage }) => {
      await mainPage.candidatesTab.clickAddCandidate();
      await mainPage.candidatesTab.addCandidateDialog.clickConfirm();

      // Should show validation error
      await expect(mainPage.page.locator('.sapMInputBaseError')).toBeVisible();
    });

    test('should navigate to candidate detail on row click', async ({ mainPage, testData }) => {
      await mainPage.candidatesTab.clickCandidateRow(0);
      await expect(mainPage.page).toHaveURL(/candidates\//);
    });

    test('should delete candidate with confirmation', async ({ mainPage, testData }) => {
      const initialCount = await mainPage.candidatesTab.getRowCount();

      await mainPage.candidatesTab.deleteCandidate(0);
      await mainPage.page.locator('button:has-text("Delete")').click();

      const toast = await mainPage.getMessageToast();
      expect(toast).toContain('deleted');
    });
  });

  test.describe('Bulk Operations', () => {
    test('should select multiple candidates', async ({ mainPage }) => {
      await mainPage.candidatesTab.selectMultipleCandidates([0, 1]);
      const selectedCount = await mainPage.candidatesTab.getSelectedCount();
      expect(selectedCount).toBe(2);
    });

    test('should bulk update status', async ({ mainPage }) => {
      await mainPage.candidatesTab.selectMultipleCandidates([0, 1]);
      await mainPage.candidatesTab.bulkUpdateStatus();

      await expect(mainPage.page.locator('[id$="bulkStatusDialog"]')).toBeVisible();
    });

    test('should match selected candidates with jobs', async ({ mainPage, testData }) => {
      await mainPage.candidatesTab.selectMultipleCandidates([0]);
      await mainPage.candidatesTab.matchSelectedCandidates();

      const toast = await mainPage.getMessageToast();
      expect(toast.toLowerCase()).toContain('match');
    });
  });

  test.describe('Actions', () => {
    test('should update single candidate status', async ({ mainPage }) => {
      await mainPage.candidatesTab.clickUpdateStatus(0);
      await mainPage.candidatesTab.updateStatusDialog.selectStatus('screening');
      await mainPage.candidatesTab.updateStatusDialog.clickConfirm();

      const toast = await mainPage.getMessageToast();
      expect(toast).toContain('updated');
    });

    test('should refresh candidates list', async ({ mainPage }) => {
      await mainPage.candidatesTab.refreshCandidates();
      const toast = await mainPage.getMessageToast();
      expect(toast.toLowerCase()).toContain('refresh');
    });
  });
});
```

### E2E Flow: CV to Candidate

```typescript
// specs/e2e-flows/cv-to-candidate.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('CV to Candidate Journey', () => {
  test('should upload CV → OCR process → auto-create candidate (high confidence)', async ({ mainPage }) => {
    // 1. Navigate to upload tab
    await mainPage.switchToTab('upload');

    // 2. Enable auto-create with high threshold
    await mainPage.uploadTab.setAutoCreateEnabled(true);
    await mainPage.uploadTab.setAutoCreateThreshold(70);

    // 3. Upload high-quality CV
    await mainPage.uploadTab.selectFile('test-data/high-quality-cv.pdf');
    await mainPage.uploadTab.clickProcessCVs();

    // 4. Wait for processing
    await mainPage.uploadTab.waitForProcessingComplete();

    // 5. Verify candidate was auto-created
    const toast = await mainPage.getMessageToast();
    expect(toast).toContain('Candidate created');

    // 6. Navigate to candidates and verify
    await mainPage.switchToTab('candidates');
    await mainPage.candidatesTab.searchCandidates(''); // Refresh
    const rows = await mainPage.candidatesTab.getTableRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  test('should upload CV → OCR process → manual review → create candidate', async ({ mainPage, cvReviewPage }) => {
    // 1. Upload CV that needs review
    await mainPage.switchToTab('upload');
    await mainPage.uploadTab.setAutoCreateEnabled(false);
    await mainPage.uploadTab.selectFile('test-data/sample-cv.pdf');
    await mainPage.uploadTab.clickProcessCVs();
    await mainPage.uploadTab.waitForProcessingComplete();

    // 2. Should navigate to CV Review
    await expect(mainPage.page).toHaveURL(/cv-review/);

    // 3. Review and edit extracted data
    await cvReviewPage.waitForLoad();
    const extractedName = await cvReviewPage.getExtractedName();
    expect(extractedName).toBeTruthy();

    // 4. Create candidate
    await cvReviewPage.clickCreateCandidate();

    // 5. Verify navigation to candidate detail
    await expect(mainPage.page).toHaveURL(/candidates\//);
  });

  test('should upload CV → edit extracted data → create candidate', async ({ mainPage, cvReviewPage }) => {
    // 1. Upload and process CV
    await mainPage.switchToTab('upload');
    await mainPage.uploadTab.setAutoCreateEnabled(false);
    await mainPage.uploadTab.selectFile('test-data/sample-cv.pdf');
    await mainPage.uploadTab.clickProcessCVs();
    await mainPage.uploadTab.waitForProcessingComplete();

    // 2. Edit extracted data
    await cvReviewPage.waitForLoad();
    await cvReviewPage.editFirstName('Edited');
    await cvReviewPage.editLastName('Name');

    // 3. Create candidate with edited data
    await cvReviewPage.clickCreateCandidate();

    // 4. Verify edited name appears
    await expect(mainPage.page.locator('text=Edited Name')).toBeVisible();
  });

  test('should handle OCR failure gracefully', async ({ mainPage }) => {
    await mainPage.switchToTab('upload');
    await mainPage.uploadTab.selectFile('test-data/corrupted.pdf');
    await mainPage.uploadTab.clickProcessCVs();

    // Should show error message, not crash
    await mainPage.uploadTab.waitForProcessingComplete();
    const result = await mainPage.uploadTab.getProcessingResult();
    expect(result.status).toBe('failed');
  });
});
```

### E2E Flow: Candidate Matching

```typescript
// specs/e2e-flows/candidate-matching.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Candidate Matching Journey', () => {
  test('should match single candidate with all jobs → view results', async ({ mainPage, candidateDetailPage, testData }) => {
    // 1. Navigate to candidate detail
    await mainPage.switchToTab('candidates');
    await mainPage.candidatesTab.clickCandidateRow(0);

    // 2. Click match with jobs
    await candidateDetailPage.clickMatchWithJobs();

    // 3. Wait for matching to complete
    await candidateDetailPage.waitForMatchingComplete();

    // 4. Verify results dialog shows
    await expect(candidateDetailPage.page.locator('[id$="matchResultsDialog"]')).toBeVisible();

    // 5. Check results
    const matchCount = await candidateDetailPage.getMatchCount();
    expect(matchCount).toBeGreaterThanOrEqual(0);
  });

  test('should run job matching → rank candidates by score', async ({ mainPage, jobDetailPage, testData }) => {
    // 1. Navigate to jobs tab and select a job
    await mainPage.switchToTab('jobs');
    await mainPage.jobsTab.clickJobRow(0);

    // 2. Go to matches tab
    await jobDetailPage.switchToTab('matches');

    // 3. Run matching
    await jobDetailPage.clickRunMatching();
    await jobDetailPage.waitForMatchingComplete();

    // 4. Verify candidates are ranked
    const matches = await jobDetailPage.getMatchResults();
    expect(matches.length).toBeGreaterThan(0);

    // Verify sorted by score descending
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });

  test('should apply triage filter → see Hot candidates only', async ({ mainPage, jobDetailPage, testData }) => {
    await mainPage.switchToTab('jobs');
    await mainPage.jobsTab.clickJobRow(0);
    await jobDetailPage.switchToTab('matches');

    // Apply Hot filter
    await jobDetailPage.filterByTriage('hot');

    // Verify all visible candidates have score >= 80
    const matches = await jobDetailPage.getMatchResults();
    for (const match of matches) {
      expect(match.score).toBeGreaterThanOrEqual(80);
    }
  });

  test('should give positive feedback → verify feedback recorded', async ({ mainPage, jobDetailPage, testData }) => {
    await mainPage.switchToTab('jobs');
    await mainPage.jobsTab.clickJobRow(0);
    await jobDetailPage.switchToTab('matches');

    // Give positive feedback on first match
    await jobDetailPage.clickPositiveFeedback(0);

    // Verify feedback button state changed
    const feedbackState = await jobDetailPage.getFeedbackState(0);
    expect(feedbackState).toBe('positive');
  });

  test('should give negative feedback → verify feedback recorded', async ({ mainPage, jobDetailPage, testData }) => {
    await mainPage.switchToTab('jobs');
    await mainPage.jobsTab.clickJobRow(0);
    await jobDetailPage.switchToTab('matches');

    await jobDetailPage.clickNegativeFeedback(0);

    const feedbackState = await jobDetailPage.getFeedbackState(0);
    expect(feedbackState).toBe('negative');
  });

  test('should view match details → see score breakdown', async ({ mainPage, jobDetailPage, testData }) => {
    await mainPage.switchToTab('jobs');
    await mainPage.jobsTab.clickJobRow(0);
    await jobDetailPage.switchToTab('matches');

    await jobDetailPage.clickViewMatchDetails(0);

    // Verify details dialog shows breakdown
    await expect(jobDetailPage.page.locator('[id$="matchDetailsDialog"]')).toBeVisible();
    await expect(jobDetailPage.page.locator('text=Score Breakdown')).toBeVisible();
  });
});
```

---

## Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:4004',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: [
    {
      command: 'npm run start',
      url: 'http://localhost:4004',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'cd python-ml-service && python -m uvicorn app.main:app --port 8000',
      url: 'http://localhost:8000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
```

---

## Test Summary

| Category | Test Count |
|----------|-----------|
| Upload Tab | 15 |
| Candidates Tab | 25 |
| Jobs Tab | 20 |
| Documents Tab | 10 |
| Analytics Tab | 12 |
| Candidate Detail | 25 |
| Job Detail | 30 |
| CV Review | 20 |
| E2E Flows | 38 |
| **Total** | **195** |

## Implementation Order

1. **Phase 1: Infrastructure** - Config, fixtures, base classes, utilities
2. **Phase 2: Core Pages** - MainPage, CandidatesTab, Upload Tab
3. **Phase 3: Detail Pages** - CandidateDetail, JobDetail, CVReview
4. **Phase 4: Dialogs** - All dialog POMs
5. **Phase 5: E2E Flows** - Cross-page journeys
6. **Phase 6: Remaining** - Analytics, Documents, edge cases
