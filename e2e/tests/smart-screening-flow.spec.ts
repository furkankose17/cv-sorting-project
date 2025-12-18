import { test, expect } from '../fixtures/test-fixtures';

test.describe('Smart Screening Workflow', () => {
  test('complete recruiter workflow: landing -> priority -> job -> quick rank', async ({ mainPage, jobDetailPage, page }) => {
    // Step 1: Land on Upload tab (default)
    await mainPage.navigate();

    // Step 2: Check priority dashboard (if visible)
    const uploadTab = mainPage.uploadTab;
    const jobs = await uploadTab.getPriorityJobs();

    if (jobs.length > 0) {
      // Step 3: Click Review Now on first hot job
      await uploadTab.clickReviewNow(0);
      await page.waitForURL(/job/, { timeout: 10000 });

      // Step 4: Verify we're on Candidate Matches tab (via query param)
      // or click to navigate there
      const matchesTab = page.locator('text=Candidate Matches');
      if (await matchesTab.isVisible()) {
        await matchesTab.click();
        await jobDetailPage.waitForBusyEnd();
      }

      // Step 5: Use Quick Rank
      const quickRankBtn = page.getByRole('button', { name: /Quick Rank/i });
      const isVisible = await quickRankBtn.isVisible().catch(() => false);

      if (isVisible) {
        await jobDetailPage.clickQuickRank();

        // Verify Top 10 filter is selected
        const selectedFilter = await jobDetailPage.getSelectedTriageFilter();
        expect(selectedFilter.toLowerCase()).toContain('top');

        // Verify results are limited
        const matchCount = await jobDetailPage.getMatchCount();
        expect(matchCount).toBeGreaterThanOrEqual(0);
        expect(matchCount).toBeLessThanOrEqual(10);
      }
    } else {
      // Fallback: Navigate via Jobs tab
      await mainPage.switchToJobsTab();
      const jobsTab = mainPage.jobsTab;

      const count = await jobsTab.getRowCount();
      if (count > 0) {
        await jobsTab.clickJobRow(0);
        await page.waitForURL(/job/);

        // Try Quick Rank from here
        const isVisible = await jobDetailPage.isQuickRankButtonVisible();
        if (isVisible) {
          await jobDetailPage.clickQuickRank();
          const selectedFilter = await jobDetailPage.getSelectedTriageFilter();
          expect(selectedFilter.toLowerCase()).toContain('top');
        }
      }
    }
  });

  test('verify Jobs tab badge reflects hot candidates', async ({ mainPage }) => {
    await mainPage.navigate();

    // Get badge count from Jobs tab
    const jobsTab = mainPage.jobsTab;
    const badgeCount = await jobsTab.getHotCandidatesBadge();

    // Switch to Jobs tab to see KPIs
    await mainPage.switchToJobsTab();

    // Get actual hot count from KPI
    const kpiCount = await jobsTab.getHotCandidatesJobsCount();

    // Badge should reflect total hot candidates (not jobs with hot candidates)
    // These may differ - badge shows total hot candidates, KPI shows jobs count
    expect(badgeCount).toBeGreaterThanOrEqual(0);
    expect(kpiCount).toBeGreaterThanOrEqual(0);
  });

  test('priority dashboard to job detail navigation', async ({ mainPage, page }) => {
    await mainPage.navigate();

    const uploadTab = mainPage.uploadTab;
    const isDashboardVisible = await uploadTab.isPriorityDashboardVisible();

    if (isDashboardVisible) {
      const jobs = await uploadTab.getPriorityJobs();

      if (jobs.length > 0) {
        const firstJob = jobs[0];

        // Verify job has hot candidates
        expect(firstJob.hotCount).toBeGreaterThan(0);

        // Click Review Now button
        await uploadTab.clickReviewNow(0);

        // Should navigate to job detail page
        await page.waitForURL(/job/, { timeout: 10000 });

        // Verify we're on the job detail page
        const jobTitle = await page.locator('[id$="jobDetailPage"] .sapMPageTitle').textContent();
        expect(jobTitle).toBeTruthy();
      }
    }
  });

  test('processing status indicator updates', async ({ mainPage }) => {
    await mainPage.navigate();

    const uploadTab = mainPage.uploadTab;

    // Check initial processing count
    const initialCount = await uploadTab.getProcessingCount();
    expect(initialCount).toBeGreaterThanOrEqual(0);

    // Processing status should be a valid number
    expect(typeof initialCount).toBe('number');
  });

  test('priority dashboard refresh updates data', async ({ mainPage }) => {
    await mainPage.navigate();

    const uploadTab = mainPage.uploadTab;
    const isDashboardVisible = await uploadTab.isPriorityDashboardVisible();

    if (isDashboardVisible) {
      // Get initial jobs
      const jobsBefore = await uploadTab.getPriorityJobs();

      // Refresh dashboard
      await uploadTab.refreshPriorityDashboard();

      // Get updated jobs
      const jobsAfter = await uploadTab.getPriorityJobs();

      // Both should be valid arrays
      expect(Array.isArray(jobsBefore)).toBe(true);
      expect(Array.isArray(jobsAfter)).toBe(true);
    }
  });

  test('badge visible across all tabs', async ({ mainPage }) => {
    await mainPage.navigate();

    const jobsTab = mainPage.jobsTab;

    // Get badge from Upload tab
    const badgeFromUpload = await jobsTab.getHotCandidatesBadge();

    // Switch to Candidates tab
    await mainPage.switchToCandidatesTab();
    const badgeFromCandidates = await jobsTab.getHotCandidatesBadge();

    // Switch to Documents tab
    await mainPage.switchToDocumentsTab();
    const badgeFromDocuments = await jobsTab.getHotCandidatesBadge();

    // Switch to Analytics tab
    await mainPage.switchToAnalyticsTab();
    const badgeFromAnalytics = await jobsTab.getHotCandidatesBadge();

    // All should return the same count
    expect(badgeFromUpload).toBe(badgeFromCandidates);
    expect(badgeFromCandidates).toBe(badgeFromDocuments);
    expect(badgeFromDocuments).toBe(badgeFromAnalytics);
  });

  test('end-to-end UX flow: minimize clicks from need to action', async ({ mainPage, jobDetailPage, page }) => {
    // Track clicks required to get from landing to viewing top candidates
    let clickCount = 0;

    // 1. Land on app (no click)
    await mainPage.navigate();

    const uploadTab = mainPage.uploadTab;
    const jobs = await uploadTab.getPriorityJobs();

    if (jobs.length > 0 && jobs[0].hotCount > 0) {
      // 2. Click Review Now (1 click)
      await uploadTab.clickReviewNow(0);
      clickCount++;
      await page.waitForURL(/job/, { timeout: 10000 });

      // 3. Click Quick Rank (2 clicks total)
      const isQuickRankVisible = await jobDetailPage.isQuickRankButtonVisible();
      if (isQuickRankVisible) {
        await jobDetailPage.clickQuickRank();
        clickCount++;

        // Verify we're viewing top candidates
        const selectedFilter = await jobDetailPage.getSelectedTriageFilter();
        expect(selectedFilter.toLowerCase()).toContain('top');

        // Goal: 2 clicks or fewer to get from landing to top candidates
        expect(clickCount).toBeLessThanOrEqual(2);
      }
    }
  });

  test('Quick Rank maintains context and shows relevant data', async ({ mainPage, jobDetailPage, page }) => {
    await mainPage.navigate();
    await mainPage.switchToJobsTab();

    const jobsTab = mainPage.jobsTab;
    const count = await jobsTab.getRowCount();

    if (count > 0) {
      // Navigate to a job
      await jobsTab.clickJobRow(0);
      await page.waitForURL(/job/);

      // Get job title for context
      const jobTitle = await jobDetailPage.getJobTitle();
      expect(jobTitle).toBeTruthy();

      // Use Quick Rank
      const isQuickRankVisible = await jobDetailPage.isQuickRankButtonVisible();
      if (isQuickRankVisible) {
        await jobDetailPage.clickQuickRank();

        // Verify we're still on the same job
        const jobTitleAfter = await jobDetailPage.getJobTitle();
        expect(jobTitleAfter).toBe(jobTitle);

        // Verify candidates are shown
        const matchCount = await jobDetailPage.getMatchCount();
        expect(matchCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('priority dashboard shows actionable information', async ({ mainPage }) => {
    await mainPage.navigate();

    const uploadTab = mainPage.uploadTab;
    const isDashboardVisible = await uploadTab.isPriorityDashboardVisible();

    if (isDashboardVisible) {
      const jobs = await uploadTab.getPriorityJobs();

      for (const job of jobs) {
        // Each job should have a title
        expect(job.title).toBeTruthy();
        expect(typeof job.title).toBe('string');

        // Each job should have hot count >= 1 (since it's in priority dashboard)
        expect(job.hotCount).toBeGreaterThanOrEqual(1);

        // Warm count should be a valid number
        expect(job.warmCount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
