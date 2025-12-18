import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CreateJobDialog } from './dialogs/CreateJobDialog';

/**
 * Job row data
 */
export interface JobRow {
  title: string;
  department: string;
  location: string;
  status: string;
  hotCount: number;
  warmCount: number;
  topMatch: string;
}

/**
 * Jobs tab component
 */
export class JobsTab extends BasePage {
  readonly createJobDialog: CreateJobDialog;

  private tableId = 'jobsTable';

  constructor(page: Page) {
    super(page);
    this.createJobDialog = new CreateJobDialog(page);
  }

  // ==================== Search & Filter ====================

  /**
   * Search jobs by text
   */
  async searchJobs(query: string): Promise<void> {
    const searchBox = this.page.getByRole('searchbox', { name: 'Search jobs...' });
    await searchBox.fill(query);
    await this.page.keyboard.press('Enter');
    await this.waitForBusyEnd();
  }

  /**
   * Clear search
   */
  async clearSearch(): Promise<void> {
    const searchBox = this.page.getByRole('searchbox', { name: 'Search jobs...' });
    await searchBox.fill('');
    await this.page.keyboard.press('Enter');
    await this.waitForBusyEnd();
  }

  /**
   * Filter by status using the listbox
   */
  async filterByStatus(status: 'All' | 'Draft' | 'Published' | 'Closed'): Promise<void> {
    const option = this.page.getByRole('option', { name: status, exact: true });
    await option.click();
    await this.waitForBusyEnd();
  }

  /**
   * Filter by department using the combobox
   */
  async filterByDepartment(department: string): Promise<void> {
    const combobox = this.page.getByRole('combobox', { name: /All Departments|Department/i });
    await combobox.click();
    // Select from dropdown
    await this.page.getByRole('option', { name: department }).click();
    await this.waitForBusyEnd();
  }

  // ==================== KPI Cards ====================

  /**
   * Get total jobs count from the KPI card
   */
  async getTotalJobsCount(): Promise<number> {
    const card = this.page.getByRole('region', { name: 'Total Jobs' });
    const valueImg = card.getByRole('img');
    const text = await valueImg.getAttribute('aria-label');
    // Format: "5 Neutral" - extract the number
    return parseInt(text?.split(' ')[0] || '0');
  }

  /**
   * Get published jobs count from the KPI card
   */
  async getPublishedJobsCount(): Promise<number> {
    const card = this.page.getByRole('region', { name: 'Published Jobs' });
    const valueImg = card.getByRole('img');
    const text = await valueImg.getAttribute('aria-label');
    return parseInt(text?.split(' ')[0] || '0');
  }

  /**
   * Get hot candidates jobs count from the KPI card
   */
  async getHotCandidatesJobsCount(): Promise<number> {
    const card = this.page.getByRole('region', { name: 'Jobs with Hot Candidates' });
    const valueImg = card.getByRole('img');
    const text = await valueImg.getAttribute('aria-label');
    return parseInt(text?.split(' ')[0] || '0');
  }

  /**
   * Get jobs needing matches count from the KPI card
   */
  async getJobsNeedingMatchesCount(): Promise<number> {
    const card = this.page.getByRole('region', { name: 'Jobs Needing Matches' });
    const valueImg = card.getByRole('img');
    const text = await valueImg.getAttribute('aria-label');
    return parseInt(text?.split(' ')[0] || '0');
  }

  // ==================== Table Operations ====================

  /**
   * Get the jobs table grid locator
   */
  getTable() {
    return this.page.getByRole('grid', { name: 'Job Postings' });
  }

  /**
   * Get table rows data
   */
  async getTableRows(): Promise<JobRow[]> {
    const rows: JobRow[] = [];
    const grid = this.getTable();
    const rowElements = await grid.getByRole('row').all();

    // Skip header row (index 0)
    for (let i = 1; i < rowElements.length; i++) {
      const row = rowElements[i];
      const cells = await row.getByRole('gridcell').all();
      if (cells.length >= 7) {
        rows.push({
          title: (await cells[0].textContent()) ?? '',
          department: (await cells[1].textContent()) ?? '',
          location: (await cells[2].textContent()) ?? '',
          status: (await cells[3].textContent()) ?? '',
          hotCount: parseInt((await cells[4].textContent())?.replace(/[^0-9]/g, '') || '0'),
          warmCount: parseInt((await cells[5].textContent())?.replace(/[^0-9]/g, '') || '0'),
          topMatch: (await cells[6].textContent()) ?? '',
        });
      }
    }

    return rows;
  }

  /**
   * Get row count (excluding header)
   */
  async getRowCount(): Promise<number> {
    const grid = this.getTable();
    const rows = await grid.getByRole('row').count();
    return Math.max(0, rows - 1); // Subtract header row
  }

  /**
   * Click a job row to navigate to detail
   */
  async clickJobRow(index: number): Promise<void> {
    const grid = this.getTable();
    const rows = grid.getByRole('row');
    // Skip header row
    await rows.nth(index + 1).click();
    await this.waitForBusyEnd();
  }

  /**
   * Click job by title
   */
  async clickJobByTitle(title: string): Promise<void> {
    const grid = this.getTable();
    const row = grid.getByRole('row').filter({ hasText: title });
    await row.click();
    await this.waitForBusyEnd();
  }

  // ==================== Actions ====================

  /**
   * Click Create Job Posting button
   */
  async clickCreateJob(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create Job Posting' }).click();
    await this.createJobDialog.waitForOpen();
  }

  /**
   * Click refresh button in the Job Postings section
   */
  async refreshJobs(): Promise<void> {
    // The Refresh button is next to the "Job Postings" heading
    const refreshButton = this.page.getByRole('heading', { name: 'Job Postings', level: 3 })
      .locator('..').getByRole('button', { name: 'Refresh' });
    await refreshButton.click();
    await this.waitForBusyEnd();
  }

  /**
   * Click Review action for a row
   */
  async clickReview(rowIndex: number): Promise<void> {
    const grid = this.getTable();
    const rows = grid.getByRole('row');
    const row = rows.nth(rowIndex + 1);
    await row.getByRole('button', { name: 'Review' }).click();
    await this.waitForBusyEnd();
  }

  /**
   * Click Run Matching action for a row
   */
  async clickRunMatching(rowIndex: number): Promise<void> {
    const grid = this.getTable();
    const rows = grid.getByRole('row');
    const row = rows.nth(rowIndex + 1);
    await row.getByRole('button', { name: 'Run Matching' }).click();
    await this.waitForBusyEnd();
  }

  /**
   * Click Edit Job action for a row
   */
  async clickEditJob(rowIndex: number): Promise<void> {
    const grid = this.getTable();
    const rows = grid.getByRole('row');
    const row = rows.nth(rowIndex + 1);
    await row.getByRole('button', { name: 'Edit Job' }).click();
    await this.waitForBusyEnd();
  }

  // ==================== Assertions ====================

  /**
   * Assert table has jobs
   */
  async assertHasJobs(): Promise<void> {
    const grid = this.getTable();
    const rows = grid.getByRole('row');
    // Expect more than just the header row
    await rows.nth(1).waitFor({ state: 'visible' });
  }

  /**
   * Assert table is empty
   */
  async assertNoJobs(): Promise<void> {
    const grid = this.getTable();
    const rows = grid.getByRole('row');
    // Should only have header row, or have "No data" message
    const count = await rows.count();
    if (count > 1) {
      const firstDataRow = rows.nth(1);
      const text = await firstDataRow.textContent();
      if (!text?.includes('No data')) {
        throw new Error('Table is not empty');
      }
    }
  }

  /**
   * Assert job with title exists
   */
  async assertJobExists(title: string): Promise<void> {
    const grid = this.getTable();
    const row = grid.getByRole('row').filter({ hasText: title });
    await row.waitFor({ state: 'visible' });
  }

  /**
   * Assert KPI cards are visible
   */
  async assertKPICardsVisible(): Promise<void> {
    await this.page.getByRole('region', { name: 'Total Jobs' }).waitFor({ state: 'visible' });
    await this.page.getByRole('region', { name: 'Published Jobs' }).waitFor({ state: 'visible' });
    await this.page.getByRole('region', { name: 'Jobs with Hot Candidates' }).waitFor({ state: 'visible' });
    await this.page.getByRole('region', { name: 'Jobs Needing Matches' }).waitFor({ state: 'visible' });
  }

  // ==================== Hot Candidates Badge ====================

  /**
   * Get hot candidates badge count from Jobs tab
   */
  async getHotCandidatesBadge(): Promise<number> {
    // Navigate back to main if needed
    const tabBar = this.page.locator('#mainTabBar, [id*="TabBar"]');
    const jobsTab = tabBar.locator('[id*="jobsTab"]');
    const countBadge = jobsTab.locator('[class*="sapMITBCount"]');

    if (await countBadge.isVisible()) {
      const text = await countBadge.textContent() || '0';
      return parseInt(text);
    }
    return 0;
  }

  /**
   * Check if Jobs tab badge is visible
   */
  async isJobsTabBadgeVisible(): Promise<boolean> {
    const tabBar = this.page.locator('#mainTabBar, [id*="TabBar"]');
    const jobsTab = tabBar.locator('[id*="jobsTab"]');
    const countBadge = jobsTab.locator('[class*="sapMITBCount"]');
    return countBadge.isVisible().catch(() => false);
  }

  /**
   * Get Jobs tab badge color/design
   */
  async getJobsTabBadgeDesign(): Promise<string> {
    const tabBar = this.page.locator('#mainTabBar, [id*="TabBar"]');
    const jobsTab = tabBar.locator('[id*="jobsTab"]');
    const countBadge = jobsTab.locator('[class*="sapMITBCount"]');

    if (await countBadge.isVisible()) {
      const classList = await countBadge.getAttribute('class') || '';
      if (classList.includes('Positive') || classList.includes('Success')) {
        return 'positive';
      }
      if (classList.includes('Critical') || classList.includes('Warning')) {
        return 'critical';
      }
      return 'neutral';
    }
    return 'none';
  }
}
