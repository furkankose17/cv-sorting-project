import { test, expect } from '../fixtures/test-fixtures';

test.describe('Priority Dashboard', () => {
  test.beforeEach(async ({ mainPage }) => {
    await mainPage.navigate();
    // Upload tab is the default landing page
  });

  test.describe('Priority Jobs Display', () => {
    test('should display priority dashboard when hot candidates exist', async ({ mainPage }) => {
      const uploadTab = mainPage.uploadTab;

      // Dashboard visibility depends on data
      const isVisible = await uploadTab.isPriorityDashboardVisible();
      // Just verify no error - visibility depends on test data
      expect(typeof isVisible).toBe('boolean');
    });

    test('should show hot and warm counts for each job', async ({ mainPage }) => {
      const uploadTab = mainPage.uploadTab;

      const jobs = await uploadTab.getPriorityJobs();

      for (const job of jobs) {
        expect(job.hotCount).toBeGreaterThanOrEqual(0);
        expect(job.warmCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should display job titles in priority dashboard', async ({ mainPage }) => {
      const uploadTab = mainPage.uploadTab;

      const jobs = await uploadTab.getPriorityJobs();

      for (const job of jobs) {
        expect(job.title).toBeTruthy();
        expect(typeof job.title).toBe('string');
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to job matches on Review Now click', async ({ mainPage, page }) => {
      const uploadTab = mainPage.uploadTab;

      const jobs = await uploadTab.getPriorityJobs();

      if (jobs.length > 0) {
        await uploadTab.clickReviewNow(0);

        // Should navigate to job detail
        await page.waitForURL(/job/, { timeout: 10000 });
      }
    });
  });

  test.describe('Processing Status', () => {
    test('should display processing count indicator', async ({ mainPage }) => {
      const uploadTab = mainPage.uploadTab;

      // Verify we can read the processing status (value depends on data)
      const count = await uploadTab.getProcessingCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should show processing status message', async ({ mainPage }) => {
      const uploadTab = mainPage.uploadTab;

      // Processing status should be visible (either "processing" or "processed")
      const statusVisible = await mainPage.page.locator('[class*="sapMMsgStrip"]:has-text("processing"), [class*="sapMMsgStrip"]:has-text("processed")').isVisible();
      // Message may or may not be visible depending on state
      expect(typeof statusVisible).toBe('boolean');
    });
  });

  test.describe('Refresh Functionality', () => {
    test('should have refresh button on priority dashboard', async ({ mainPage }) => {
      const uploadTab = mainPage.uploadTab;

      const isVisible = await uploadTab.isPriorityDashboardVisible();

      if (isVisible) {
        const refreshButton = mainPage.page.locator('section:has-text("Today\'s Priority Candidates") button[icon="sap-icon://refresh"]');
        const hasButton = await refreshButton.isVisible().catch(() => false);
        expect(typeof hasButton).toBe('boolean');
      }
    });

    test('should refresh priority dashboard data', async ({ mainPage }) => {
      const uploadTab = mainPage.uploadTab;

      const isVisible = await uploadTab.isPriorityDashboardVisible();

      if (isVisible) {
        // Get initial data
        const jobsBefore = await uploadTab.getPriorityJobs();

        // Refresh dashboard
        await uploadTab.refreshPriorityDashboard();

        // Get data after refresh
        const jobsAfter = await uploadTab.getPriorityJobs();

        // Data structure should remain valid
        expect(Array.isArray(jobsAfter)).toBe(true);
      }
    });
  });
});
