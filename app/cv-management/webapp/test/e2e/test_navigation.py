#!/usr/bin/env python3
"""
Test navigation and user flows in cv-management app
Validates that key user journeys work correctly
"""

from playwright.sync_api import sync_playwright, Page
import sys

BASE_URL = "http://localhost:4004"

def test_app_loads(page: Page) -> dict:
    """Test that the app loads successfully"""
    results = {
        "test_name": "App Loading",
        "tests": [],
        "passed": 0,
        "failed": 0
    }

    print("\n→ Testing app loads...")

    try:
        page.goto(f"{BASE_URL}/cvmanagement/index.html", timeout=30000)
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        # Check if main elements are present
        if page.locator('text=Candidates').count() > 0 or page.locator('text=Dashboard').count() > 0:
            test = {"name": "App loads successfully", "status": "PASS"}
            results["passed"] += 1
            print("  ✓ App loaded successfully")
        else:
            test = {"name": "App loads successfully", "status": "FAIL", "error": "Main elements not found"}
            results["failed"] += 1
            print("  ✗ App loaded but main elements not found")

    except Exception as e:
        test = {"name": "App loads successfully", "status": "FAIL", "error": str(e)}
        results["failed"] += 1
        print(f"  ✗ App failed to load: {e}")

    results["tests"].append(test)
    return results


def test_candidates_section(page: Page) -> dict:
    """Test candidates section navigation and display"""
    results = {
        "test_name": "Candidates Section",
        "tests": [],
        "passed": 0,
        "failed": 0
    }

    print("\n→ Testing candidates section...")

    try:
        page.goto(f"{BASE_URL}/cvmanagement/index.html")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        # Click on Candidates tab/section
        try:
            candidates_button = page.locator('text=Candidates').first
            if candidates_button.is_visible(timeout=5000):
                candidates_button.click()
                page.wait_for_timeout(1000)

                test = {"name": "Navigate to Candidates section", "status": "PASS"}
                results["passed"] += 1
                print("  ✓ Navigated to Candidates section")
            else:
                test = {"name": "Navigate to Candidates section", "status": "SKIP", "error": "Candidates button not visible"}
                print("  ⊘ Candidates button not visible")
        except Exception as e:
            test = {"name": "Navigate to Candidates section", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Failed to navigate: {e}")

        results["tests"].append(test)

        # Check if candidate table is visible
        print("\n→ Checking candidate table...")
        try:
            table = page.locator('table, .sapMTable, .sapUiTable').first
            if table.is_visible(timeout=5000):
                test = {"name": "Candidate table displays", "status": "PASS"}
                results["passed"] += 1
                print("  ✓ Candidate table is visible")

                # Check for candidate rows
                rows = page.locator('tr, .sapMLIB').count()
                if rows > 0:
                    test = {"name": "Candidate rows display", "status": "PASS", "count": rows}
                    results["passed"] += 1
                    print(f"  ✓ Found {rows} candidate rows")
                else:
                    test = {"name": "Candidate rows display", "status": "FAIL", "error": "No rows found"}
                    results["failed"] += 1
                    print("  ✗ No candidate rows found")
                results["tests"].append(test)

            else:
                test = {"name": "Candidate table displays", "status": "FAIL", "error": "Table not visible"}
                results["failed"] += 1
                print("  ✗ Candidate table not visible")
        except Exception as e:
            test = {"name": "Candidate table displays", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error checking table: {e}")

        results["tests"].append(test)

    except Exception as e:
        results["errors"] = [str(e)]
        print(f"  ✗ Fatal error: {e}")

    return results


def test_candidate_detail_navigation(page: Page) -> dict:
    """Test navigation to candidate detail page"""
    results = {
        "test_name": "Candidate Detail Navigation",
        "tests": [],
        "passed": 0,
        "failed": 0
    }

    print("\n→ Testing candidate detail navigation...")

    try:
        # Navigate directly to a candidate detail page
        page.goto(f"{BASE_URL}/cvmanagement/index.html#/candidates/cand-001", timeout=30000)
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        # Check if candidate name is visible
        print("\n→ Checking candidate detail page elements...")
        try:
            # Look for name, email, or other candidate details
            has_content = (
                page.locator('text=/[A-Z][a-z]+ [A-Z][a-z]+/').count() > 0 or  # Name pattern
                page.locator('text=/@[a-z0-9]/i').count() > 0 or  # Email pattern
                page.locator('.sapUxAPObjectPageHeaderTitle').count() > 0  # UI5 header
            )

            if has_content:
                test = {"name": "Candidate detail page loads", "status": "PASS"}
                results["passed"] += 1
                print("  ✓ Candidate detail page loaded")
            else:
                test = {"name": "Candidate detail page loads", "status": "FAIL", "error": "No content visible"}
                results["failed"] += 1
                print("  ✗ Candidate detail page has no content")

        except Exception as e:
            test = {"name": "Candidate detail page loads", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")

        results["tests"].append(test)

        # Check for sections (Skills, Education, Experience)
        print("\n→ Checking candidate detail sections...")
        sections = ["Skills", "Education", "Experience", "Summary"]
        found_sections = 0

        for section in sections:
            if page.locator(f'text={section}').count() > 0:
                found_sections += 1

        if found_sections >= 2:
            test = {"name": "Candidate sections display", "status": "PASS", "count": found_sections}
            results["passed"] += 1
            print(f"  ✓ Found {found_sections} sections")
        else:
            test = {"name": "Candidate sections display", "status": "FAIL", "error": f"Only {found_sections} sections found"}
            results["failed"] += 1
            print(f"  ✗ Only found {found_sections} sections")

        results["tests"].append(test)

    except Exception as e:
        results["errors"] = [str(e)]
        print(f"  ✗ Fatal error: {e}")

    return results


def test_jobs_section(page: Page) -> dict:
    """Test jobs section navigation"""
    results = {
        "test_name": "Jobs Section",
        "tests": [],
        "passed": 0,
        "failed": 0
    }

    print("\n→ Testing jobs section...")

    try:
        page.goto(f"{BASE_URL}/cvmanagement/index.html")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        # Click on Jobs tab/section
        try:
            jobs_button = page.locator('text=Jobs').first
            if jobs_button.is_visible(timeout=5000):
                jobs_button.click()
                page.wait_for_timeout(1000)

                test = {"name": "Navigate to Jobs section", "status": "PASS"}
                results["passed"] += 1
                print("  ✓ Navigated to Jobs section")
            else:
                test = {"name": "Navigate to Jobs section", "status": "SKIP", "error": "Jobs button not visible"}
                print("  ⊘ Jobs button not visible")
        except Exception as e:
            test = {"name": "Navigate to Jobs section", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Failed to navigate: {e}")

        results["tests"].append(test)

    except Exception as e:
        results["errors"] = [str(e)]
        print(f"  ✗ Fatal error: {e}")

    return results


def run_navigation_tests():
    """Run all navigation tests"""
    print("=" * 70)
    print("CV MANAGEMENT - NAVIGATION TESTS")
    print("=" * 70)

    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Run tests
        page = browser.new_page()
        all_results.append(test_app_loads(page))
        page.close()

        page = browser.new_page()
        all_results.append(test_candidates_section(page))
        page.close()

        page = browser.new_page()
        all_results.append(test_candidate_detail_navigation(page))
        page.close()

        page = browser.new_page()
        all_results.append(test_jobs_section(page))
        page.close()

        # Take screenshots
        page = browser.new_page()
        page.goto(f"{BASE_URL}/cvmanagement/index.html")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)
        page.screenshot(path='/tmp/cv-management-main.png', full_page=True)
        print("\n→ Screenshot saved to /tmp/cv-management-main.png")

        page.goto(f"{BASE_URL}/cvmanagement/index.html#/candidates/cand-001")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)
        page.screenshot(path='/tmp/cv-management-detail.png', full_page=True)
        print("→ Screenshot saved to /tmp/cv-management-detail.png")

        page.close()
        browser.close()

    # Print summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)

    total_passed = sum(r['passed'] for r in all_results)
    total_failed = sum(r['failed'] for r in all_results)
    total_tests = total_passed + total_failed

    for result in all_results:
        print(f"\n{result['test_name']}:")
        print(f"  Passed: {result['passed']}")
        print(f"  Failed: {result['failed']}")

    print(f"\n{'=' * 70}")
    print(f"TOTAL: {total_passed}/{total_tests} tests passed")
    print(f"{'=' * 70}")

    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_navigation_tests())
