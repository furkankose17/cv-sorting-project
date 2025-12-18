import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Required skill data
 */
export interface RequiredSkill {
  name: string;
  proficiency: string;
  weight: number;
}

/**
 * Match candidate data
 */
export interface MatchCandidate {
  rank: number;
  name: string;
  email: string;
  status: string;
  overallScore: number;
  triage: string;
  skillScore: number;
  semanticScore?: number;
}

/**
 * Job Detail page object
 */
export class JobDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ==================== Navigation ====================

  /**
   * Navigate to job detail page
   */
  async navigate(jobId: string): Promise<void> {
    await this.page.goto(`http://localhost:4004/cv-management/webapp/index.html#/job/${jobId}`);
    await this.waitForPageLoad();
  }

  /**
   * Navigate back
   */
  async goBack(): Promise<void> {
    await this.page.locator('.sapMPageHeader button[icon="sap-icon://nav-back"], .sapMNavBtn').click();
    await this.waitForBusyEnd();
  }

  // ==================== Page Header ====================

  /**
   * Get job title
   */
  async getJobTitle(): Promise<string> {
    const title = await this.page.locator('[id$="jobDetailPage"] .sapMPageTitle').textContent();
    return title?.trim() ?? '';
  }

  /**
   * Get job status
   */
  async getJobStatus(): Promise<string> {
    const status = await this.page.locator('[id$="jobDetailPage"] .sapMPageHeader .sapMObjStatus').textContent();
    return status?.trim() ?? '';
  }

  // ==================== Tab Navigation ====================

  /**
   * Switch to Overview tab
   */
  async switchToOverviewTab(): Promise<void> {
    await this.page.locator('[id$="overviewTab"]').click();
    await this.waitForBusyEnd();
  }

  /**
   * Switch to Scoring Criteria tab
   */
  async switchToScoringTab(): Promise<void> {
    await this.page.locator('[id$="scoringTab"]').click();
    await this.waitForBusyEnd();
  }

  /**
   * Switch to Candidate Matches tab
   */
  async switchToMatchesTab(): Promise<void> {
    await this.page.locator('[id$="matchesTab"]').click();
    await this.waitForBusyEnd();
  }

  /**
   * Get current tab key
   */
  async getCurrentTab(): Promise<string> {
    const selectedTab = this.page.locator('.sapMITBSelected, [aria-selected="true"]');
    return (await selectedTab.getAttribute('data-key')) ?? 'overview';
  }

  // ==================== Overview Tab ====================

  /**
   * Get job department
   */
  async getDepartment(): Promise<string> {
    const text = await this.page.locator(':has-text("Department") + .sapMText').textContent();
    return text?.trim() ?? '';
  }

  /**
   * Get job location
   */
  async getLocation(): Promise<string> {
    const text = await this.page.locator(':has-text("Location") + .sapMText').first().textContent();
    return text?.trim() ?? '';
  }

  /**
   * Get employment type
   */
  async getEmploymentType(): Promise<string> {
    const text = await this.page.locator(':has-text("Employment Type") + .sapMText').textContent();
    return text?.trim() ?? '';
  }

  /**
   * Get job description
   */
  async getDescription(): Promise<string> {
    const panel = this.page.locator('panel:has-text("Job Description"), [headerText="Job Description"]');
    const text = await panel.locator('.sapMText').textContent();
    return text?.trim() ?? '';
  }

  /**
   * Get required skills
   */
  async getRequiredSkills(): Promise<RequiredSkill[]> {
    const skills: RequiredSkill[] = [];
    const rows = await this.page.locator('[id$="requiredSkillsTable"] tbody tr').all();

    for (const row of rows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 3) {
        skills.push({
          name: (await cells[0].textContent()) ?? '',
          proficiency: (await cells[1].textContent()) ?? '',
          weight: parseFloat((await cells[2].textContent())?.replace(/[^0-9.]/g, '') || '1'),
        });
      }
    }

    return skills;
  }

  // ==================== Overview Actions ====================

  /**
   * Click Publish Job
   */
  async clickPublishJob(): Promise<void> {
    await this.page.locator('button:has-text("Publish Job")').click();
    await this.waitForBusyEnd();
  }

  /**
   * Click Close Job
   */
  async clickCloseJob(): Promise<void> {
    await this.page.locator('button:has-text("Close Job")').click();
    await this.waitForBusyEnd();
  }

  /**
   * Click Edit Job
   */
  async clickEditJob(): Promise<void> {
    await this.page.locator('button:has-text("Edit Job")').click();
    await this.waitForBusyEnd();
  }

  // ==================== Matches Tab ====================

  /**
   * Set triage filter
   */
  async setTriageFilter(filter: 'all' | 'top10' | 'hot' | 'warm'): Promise<void> {
    await this.switchToMatchesTab();
    await this.page.locator(`[id$="triageFilter"] [data-key="${filter}"], [id$="triageFilter"] [id*="${filter}"]`).click();
    await this.waitForBusyEnd();
  }

  /**
   * Click Run Matching
   */
  async clickRunMatching(): Promise<void> {
    await this.switchToMatchesTab();
    await this.page.locator('button:has-text("Run Matching")').click();
    await this.waitForBusyEnd();
  }

  /**
   * Click Refresh Matches
   */
  async clickRefreshMatches(): Promise<void> {
    await this.page.locator('button[icon="sap-icon://refresh"][tooltip="Refresh Matches"]').click();
    await this.waitForBusyEnd();
  }

  /**
   * Get match candidates
   */
  async getMatchCandidates(): Promise<MatchCandidate[]> {
    await this.switchToMatchesTab();
    const candidates: MatchCandidate[] = [];
    const rows = await this.page.locator('[id$="matchResultsTable"] tbody tr').all();

    for (const row of rows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 8) {
        const nameCell = cells[1];
        const name = (await nameCell.locator('.sapMText').first().textContent()) ?? '';
        const email = (await nameCell.locator('.sapMText').nth(1).textContent()) ?? '';

        candidates.push({
          rank: parseInt((await cells[0].textContent())?.replace(/[^0-9]/g, '') || '0'),
          name,
          email,
          status: (await cells[2].textContent()) ?? '',
          overallScore: parseInt((await cells[3].textContent())?.replace(/[^0-9]/g, '') || '0'),
          triage: (await cells[4].textContent()) ?? '',
          skillScore: parseInt((await cells[5].textContent())?.replace(/[^0-9]/g, '') || '0'),
          semanticScore: parseInt((await cells[6].textContent())?.replace(/[^0-9]/g, '') || '0') || undefined,
        });
      }
    }

    return candidates;
  }

  /**
   * Get match count
   */
  async getMatchCount(): Promise<number> {
    await this.switchToMatchesTab();
    return await this.page.locator('[id$="matchResultsTable"] tbody tr').count();
  }

  /**
   * Click on match row
   */
  async clickMatchRow(index: number): Promise<void> {
    const row = this.page.locator('[id$="matchResultsTable"] tbody tr').nth(index);
    await row.click();
    await this.waitForBusyEnd();
  }

  /**
   * Give positive feedback
   */
  async giveFeedback(matchIndex: number, positive: boolean): Promise<void> {
    const row = this.page.locator('[id$="matchResultsTable"] tbody tr').nth(matchIndex);
    const icon = positive ? 'sap-icon://thumb-up' : 'sap-icon://thumb-down';
    await row.locator(`button[icon="${icon}"]`).click();
    await this.waitForBusyEnd();
  }

  /**
   * Click View Candidate
   */
  async clickViewCandidate(matchIndex: number): Promise<void> {
    const row = this.page.locator('[id$="matchResultsTable"] tbody tr').nth(matchIndex);
    await row.locator('button:has-text("View")').click();
    await this.waitForBusyEnd();
  }

  /**
   * Click View Match Details
   */
  async clickViewMatchDetails(matchIndex: number): Promise<void> {
    const row = this.page.locator('[id$="matchResultsTable"] tbody tr').nth(matchIndex);
    await row.locator('button[icon="sap-icon://detail-view"]').click();
    await this.page.waitForSelector('.sapMDialog', { state: 'visible' });
  }

  // ==================== Hot/Warm/Cold Filtering ====================

  /**
   * Get hot candidates count
   */
  async getHotCandidatesCount(): Promise<number> {
    await this.setTriageFilter('hot');
    return await this.getMatchCount();
  }

  /**
   * Get warm candidates count
   */
  async getWarmCandidatesCount(): Promise<number> {
    await this.setTriageFilter('warm');
    return await this.getMatchCount();
  }

  /**
   * Get top 10 candidates
   */
  async getTop10Candidates(): Promise<MatchCandidate[]> {
    await this.setTriageFilter('top10');
    return await this.getMatchCandidates();
  }

  // ==================== Assertions ====================

  /**
   * Assert page is loaded
   */
  async assertPageLoaded(): Promise<void> {
    await this.page.waitForSelector('[id$="jobDetailPage"]', { state: 'visible' });
  }

  /**
   * Assert job has required skills
   */
  async assertHasRequiredSkills(): Promise<void> {
    await this.assertTableHasRows('requiredSkillsTable');
  }

  /**
   * Assert job has match results
   */
  async assertHasMatchResults(): Promise<void> {
    await this.switchToMatchesTab();
    await this.assertTableHasRows('matchResultsTable');
  }

  /**
   * Assert tab is active
   */
  async assertTabActive(tab: 'overview' | 'scoring' | 'matches'): Promise<void> {
    const currentTab = await this.getCurrentTab();
    if (currentTab !== tab) {
      throw new Error(`Expected tab ${tab} to be active, but got ${currentTab}`);
    }
  }

  // ==================== Quick Rank ====================

  /**
   * Click the Quick Rank Top 10 button
   */
  async clickQuickRank(): Promise<void> {
    await this.switchToMatchesTab();
    const button = this.page.getByRole('button', { name: /Quick Rank/i });
    await button.click();
    await this.waitForBusyEnd();
  }

  /**
   * Get selected triage filter key
   */
  async getSelectedTriageFilter(): Promise<string> {
    const selected = this.page.locator('[class*="sapMSegBBtnSel"]');
    return await selected.textContent() || '';
  }

  /**
   * Check if Quick Rank button is visible
   */
  async isQuickRankButtonVisible(): Promise<boolean> {
    await this.switchToMatchesTab();
    const button = this.page.getByRole('button', { name: /Quick Rank/i });
    return button.isVisible().catch(() => false);
  }
}
