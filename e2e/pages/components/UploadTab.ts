import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import path from 'path';

/**
 * Processing result data
 */
export interface ProcessingResult {
  status: 'completed' | 'failed' | 'processing' | 'pending';
  confidence: number;
  message?: string;
}

/**
 * Recent upload row data
 */
export interface RecentUploadRow {
  fileName: string;
  uploadDate: string;
  status: string;
  confidence: number;
  candidate: string;
}

/**
 * Upload tab component
 */
export class UploadTab extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ==================== File Selection ====================

  /**
   * Get the upload form
   */
  getUploadForm() {
    return this.page.getByRole('form', { name: 'Upload CV Documents' });
  }

  /**
   * Get the file input button
   */
  getSelectFilesButton() {
    return this.page.getByRole('button', { name: 'Select CV Files...' });
  }

  /**
   * Select a file for upload using file chooser
   */
  async selectFile(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), 'e2e', 'test-data', filePath);

    // Click the select files button and wait for file chooser
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.getSelectFilesButton().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(absolutePath);
    await this.wait(500);
  }

  /**
   * Select multiple files for upload
   */
  async selectFiles(filePaths: string[]): Promise<void> {
    const absolutePaths = filePaths.map(fp =>
      path.isAbsolute(fp) ? fp : path.join(process.cwd(), 'e2e', 'test-data', fp)
    );

    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.getSelectFilesButton().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(absolutePaths);
    await this.wait(500);
  }

  /**
   * Get the file name from the textbox (shows selected file name)
   */
  async getSelectedFileName(): Promise<string> {
    const fileNameBox = this.page.getByRole('textbox', { name: 'File Name' });
    return (await fileNameBox.inputValue()) || '';
  }

  /**
   * Get selected files as an array
   */
  async getSelectedFiles(): Promise<string[]> {
    const fileName = await this.getSelectedFileName();
    if (!fileName) {
      return [];
    }
    // If multiple files, they may be comma-separated or shown differently
    // For now, return as single item array
    return [fileName];
  }

  /**
   * Check if files are selected (Process CVs button becomes enabled)
   */
  async hasSelectedFiles(): Promise<boolean> {
    const processButton = this.page.getByRole('button', { name: 'Process CVs' });
    const isDisabled = await processButton.isDisabled();
    return !isDisabled;
  }

  /**
   * Clear selected files by clicking the clear button
   */
  async clearSelectedFiles(): Promise<void> {
    // Look for the clear button next to the file input
    const clearButton = this.getUploadForm().getByRole('button').filter({ hasNotText: 'Select CV Files' }).filter({ hasNotText: 'Process CVs' });
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await this.wait(300);
    }
  }

  // ==================== Upload Settings ====================

  /**
   * Get auto-create switch
   */
  getAutoCreateSwitch() {
    return this.page.getByRole('switch');
  }

  /**
   * Check if auto-create is enabled
   */
  async isAutoCreateEnabled(): Promise<boolean> {
    const switchEl = this.getAutoCreateSwitch();
    const label = await switchEl.textContent();
    return label?.includes('Yes') || false;
  }

  /**
   * Set auto-create enabled/disabled
   */
  async setAutoCreateEnabled(enabled: boolean): Promise<void> {
    const isCurrentlyEnabled = await this.isAutoCreateEnabled();
    if (enabled !== isCurrentlyEnabled) {
      await this.getAutoCreateSwitch().click();
      await this.wait(300);
    }
  }

  /**
   * Toggle auto-create switch
   */
  async toggleAutoCreate(): Promise<void> {
    await this.getAutoCreateSwitch().click();
    await this.wait(300);
  }

  /**
   * Toggle batch mode (alias for toggleAutoCreate for now, as UI may use same control)
   */
  async toggleBatchMode(): Promise<void> {
    // In UI5, batch mode may be controlled via the same auto-create switch
    // or may be a separate control - check UI
    await this.toggleAutoCreate();
  }

  /**
   * Set auto-create threshold value
   */
  async setAutoCreateThreshold(threshold: number): Promise<void> {
    // Look for a slider or spinbutton for threshold
    const thresholdInput = this.page.getByRole('spinbutton', { name: /threshold/i });
    if (await thresholdInput.isVisible()) {
      await thresholdInput.clear();
      await thresholdInput.fill(threshold.toString());
      await thresholdInput.press('Tab');
    } else {
      // Try slider
      const slider = this.page.getByRole('slider', { name: /threshold/i });
      if (await slider.isVisible()) {
        await slider.fill(threshold.toString());
      }
    }
    await this.wait(300);
  }

  // ==================== Processing ====================

  /**
   * Get Process CVs button
   */
  getProcessButton() {
    return this.page.getByRole('button', { name: 'Process CVs' });
  }

  /**
   * Click process CVs button
   */
  async clickProcessCVs(): Promise<void> {
    await this.getProcessButton().click();
    await this.waitForBusyEnd();
  }

  /**
   * Check if Process CVs button is enabled
   */
  async isProcessButtonEnabled(): Promise<boolean> {
    return !(await this.getProcessButton().isDisabled());
  }

  /**
   * Wait for processing to complete
   */
  async waitForProcessingComplete(timeout = 60000): Promise<void> {
    // Wait for progress indicator to appear
    await this.page.waitForSelector('.sapMPI, [role="progressbar"]', {
      state: 'visible',
      timeout: 5000,
    }).catch(() => {});

    // Wait for progress indicator to disappear or reach 100%
    await this.page.waitForFunction(
      () => {
        const progress = document.querySelector('.sapMPI, [role="progressbar"]');
        if (!progress) return true;
        const value = progress.getAttribute('aria-valuenow');
        return value === '100' || !(progress as HTMLElement).offsetParent;
      },
      { timeout }
    );

    await this.waitForBusyEnd();
  }

  /**
   * Wait for batch processing to complete
   */
  async waitForBatchComplete(timeout = 120000): Promise<void> {
    await this.waitForProcessingComplete(timeout);
  }

  /**
   * Get processing result after processing completes
   */
  async getProcessingResult(): Promise<ProcessingResult> {
    // Check for success/error messages or status indicators
    const successMsg = this.page.locator('.sapMMessageStrip.sapMMessageStripSuccess, [class*="Success"]');
    const errorMsg = this.page.locator('.sapMMessageStrip.sapMMessageStripError, [class*="Error"]');
    const processingIndicator = this.page.locator('.sapMPI, [role="progressbar"]');

    if (await processingIndicator.isVisible()) {
      return { status: 'processing', confidence: 0 };
    }

    if (await errorMsg.isVisible()) {
      const message = await errorMsg.textContent();
      return { status: 'failed', confidence: 0, message: message || 'Processing failed' };
    }

    if (await successMsg.isVisible()) {
      const confidence = await this.getConfidenceScore();
      return { status: 'completed', confidence };
    }

    // Check recent uploads for latest status
    const uploads = await this.getRecentUploads();
    if (uploads.length > 0) {
      const latest = uploads[0];
      return {
        status: latest.status.toLowerCase().includes('complet') ? 'completed' : 'processing',
        confidence: latest.confidence,
      };
    }

    return { status: 'pending', confidence: 0 };
  }

  /**
   * Assert that processing is in progress
   */
  async assertProcessingInProgress(): Promise<void> {
    // Look for busy indicator or progress bar
    const processingIndicator = this.page.locator('.sapMPI, [role="progressbar"], .sapMBusyIndicator, .sapUiLocalBusyIndicator');
    await processingIndicator.first().waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Get confidence score from processing result
   */
  async getConfidenceScore(): Promise<number> {
    // Look for confidence display in recent uploads or result area
    const confidenceText = this.page.locator('[class*="confidence"], [class*="Confidence"]');
    if (await confidenceText.isVisible()) {
      const text = await confidenceText.textContent();
      const match = text?.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    // Try recent uploads
    const uploads = await this.getRecentUploads();
    if (uploads.length > 0) {
      return uploads[0].confidence;
    }

    return 0;
  }

  // ==================== Recent Uploads ====================

  /**
   * Get recent uploads form/section
   */
  getRecentUploadsSection() {
    return this.page.getByRole('form', { name: 'Recent Uploads' });
  }

  /**
   * Get recent uploads table
   */
  getRecentUploadsTable() {
    return this.getRecentUploadsSection().getByRole('grid');
  }

  /**
   * Get recent uploads data
   */
  async getRecentUploads(): Promise<RecentUploadRow[]> {
    const uploads: RecentUploadRow[] = [];
    const grid = this.getRecentUploadsTable();
    const rows = await grid.getByRole('row').all();

    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = await row.getByRole('gridcell').all();
      if (cells.length >= 5) {
        uploads.push({
          fileName: (await cells[0].textContent())?.trim() ?? '',
          uploadDate: (await cells[1].textContent())?.trim() ?? '',
          status: (await cells[2].textContent())?.replace(/Object Status.*/, '').trim() ?? '',
          confidence: parseFloat((await cells[3].textContent())?.replace(/[^0-9.]/g, '') || '0'),
          candidate: (await cells[4].textContent())?.trim() ?? '',
        });
      }
    }

    return uploads;
  }

  /**
   * Get recent uploads count
   */
  async getRecentUploadsCount(): Promise<number> {
    const grid = this.getRecentUploadsTable();
    const rows = await grid.getByRole('row').count();
    return Math.max(0, rows - 1); // Subtract header row
  }

  /**
   * Click a recent upload row
   */
  async clickRecentUpload(index: number): Promise<void> {
    const grid = this.getRecentUploadsTable();
    const rows = grid.getByRole('row');
    await rows.nth(index + 1).click();
    await this.waitForBusyEnd();
  }

  /**
   * Click a recent upload by file name
   */
  async clickRecentUploadByName(fileName: string): Promise<void> {
    const grid = this.getRecentUploadsTable();
    const row = grid.getByRole('row').filter({ hasText: fileName });
    await row.click();
    await this.waitForBusyEnd();
  }

  /**
   * Click More button to load more uploads
   */
  async clickMoreUploads(): Promise<void> {
    const moreButton = this.page.getByRole('button', { name: 'More' });
    if (await moreButton.isVisible()) {
      await moreButton.click();
      await this.waitForBusyEnd();
    }
  }

  // ==================== Assertions ====================

  /**
   * Assert upload form is visible
   */
  async assertUploadFormVisible(): Promise<void> {
    await this.getUploadForm().waitFor({ state: 'visible' });
  }

  /**
   * Assert upload area is visible (alias)
   */
  async assertUploadAreaVisible(): Promise<void> {
    await this.assertUploadFormVisible();
  }

  /**
   * Assert has selected files
   */
  async assertHasSelectedFiles(): Promise<void> {
    const hasFiles = await this.hasSelectedFiles();
    if (!hasFiles) {
      throw new Error('Expected selected files but found none');
    }
  }

  /**
   * Assert recent uploads section is visible
   */
  async assertRecentUploadsVisible(): Promise<void> {
    await this.getRecentUploadsSection().waitFor({ state: 'visible' });
  }

  /**
   * Assert recent uploads has data
   */
  async assertHasRecentUploads(): Promise<void> {
    const count = await this.getRecentUploadsCount();
    if (count === 0) {
      throw new Error('Expected recent uploads but found none');
    }
  }

  /**
   * Assert message strip is visible
   */
  async assertMessageStripVisible(): Promise<void> {
    await this.page.getByRole('note').waitFor({ state: 'visible' });
  }

  // ==================== Priority Dashboard ====================

  /**
   * Check if priority dashboard is visible
   */
  async isPriorityDashboardVisible(): Promise<boolean> {
    const panel = this.page.locator('section:has-text("Today\'s Priority Candidates")');
    return panel.isVisible().catch(() => false);
  }

  /**
   * Get jobs with hot candidates from priority dashboard
   */
  async getPriorityJobs(): Promise<Array<{ title: string; hotCount: number; warmCount: number }>> {
    const items = this.page.locator('[class*="sapMListItems"] [class*="sapMCLI"]');
    const count = await items.count();
    const jobs: Array<{ title: string; hotCount: number; warmCount: number }> = [];

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const title = await item.locator('span.sapMText').first().textContent() || '';
      const hotText = await item.locator('[class*="sapMObjStatusSuccess"]').textContent() || '0';
      const hotCount = parseInt(hotText.match(/\d+/)?.[0] || '0');
      const warmText = await item.locator('[class*="sapMObjStatusWarning"]').textContent() || '0';
      const warmCount = parseInt(warmText.match(/\d+/)?.[0] || '0');

      jobs.push({ title, hotCount, warmCount });
    }

    return jobs;
  }

  /**
   * Click Review Now button for a priority job
   */
  async clickReviewNow(index: number): Promise<void> {
    const buttons = this.page.locator('button:has-text("Review Now")');
    await buttons.nth(index).click();
  }

  /**
   * Get processing count from status indicator
   */
  async getProcessingCount(): Promise<number> {
    const strip = this.page.locator('[class*="sapMMsgStrip"]:has-text("processing"), [class*="sapMMsgStrip"]:has-text("processed")');
    const text = await strip.textContent() || '';
    const match = text.match(/(\d+) CVs/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Click refresh button on priority dashboard
   */
  async refreshPriorityDashboard(): Promise<void> {
    const refreshButton = this.page.locator('section:has-text("Today\'s Priority Candidates") button[icon="sap-icon://refresh"]');
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      await this.waitForBusyEnd();
    }
  }
}
