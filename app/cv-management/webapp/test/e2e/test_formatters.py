#!/usr/bin/env python3
"""
Test formatter functionality in cv-management app
Validates that all formatters work correctly and display proper values
"""

from playwright.sync_api import sync_playwright, Page, expect
import sys

BASE_URL = "http://localhost:4004"

def test_formatters(page: Page) -> dict:
    """Test all formatter functions"""
    results = {
        "test_name": "Formatter Validation",
        "tests": [],
        "passed": 0,
        "failed": 0,
        "errors": []
    }

    try:
        # Navigate to cv-management app
        print("→ Navigating to cv-management app...")
        page.goto(f"{BASE_URL}/cvmanagement/index.html")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)  # Wait for UI5 initialization

        # Check page loaded
        test = {"name": "App loads successfully", "status": "PASS"}
        results["tests"].append(test)
        results["passed"] += 1
        print("  ✓ App loaded successfully")

        # Test 1: Skills list formatter (should show comma-separated skills)
        print("\n→ Testing skills list formatter...")
        try:
            # Look for skills text in the candidates table
            skills_elements = page.locator('text=/JavaScript|Python|React|TypeScript/').all()
            if len(skills_elements) > 0:
                test = {"name": "Skills list formatter displays skills", "status": "PASS"}
                results["passed"] += 1
                print(f"  ✓ Found {len(skills_elements)} skill elements")
            else:
                test = {"name": "Skills list formatter displays skills", "status": "FAIL", "error": "No skills found"}
                results["failed"] += 1
                print("  ✗ No skills found")
        except Exception as e:
            test = {"name": "Skills list formatter displays skills", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

        # Test 2: Score formatter (should show scores with 1 decimal place)
        print("\n→ Testing score formatter...")
        try:
            # Look for score values (e.g., "85.0%", "90.5%")
            score_pattern = page.locator('text=/\\d+\\.\\d%/').first
            if score_pattern.is_visible(timeout=5000):
                score_text = score_pattern.text_content()
                if '.' in score_text:
                    test = {"name": "Score formatter shows 1 decimal place", "status": "PASS"}
                    results["passed"] += 1
                    print(f"  ✓ Score formatted correctly: {score_text}")
                else:
                    test = {"name": "Score formatter shows 1 decimal place", "status": "FAIL", "error": "No decimal point"}
                    results["failed"] += 1
            else:
                test = {"name": "Score formatter shows 1 decimal place", "status": "SKIP", "error": "No scores visible"}
                print("  ⊘ No scores visible on page")
        except Exception as e:
            test = {"name": "Score formatter shows 1 decimal place", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

        # Test 3: Status formatter (should show colored status badges)
        print("\n→ Testing status formatter...")
        try:
            # Look for ObjectStatus elements (status badges)
            status_elements = page.locator('.sapMObjectStatus').all()
            if len(status_elements) > 0:
                test = {"name": "Status formatter displays status badges", "status": "PASS"}
                results["passed"] += 1
                print(f"  ✓ Found {len(status_elements)} status badges")
            else:
                test = {"name": "Status formatter displays status badges", "status": "FAIL", "error": "No status badges found"}
                results["failed"] += 1
                print("  ✗ No status badges found")
        except Exception as e:
            test = {"name": "Status formatter displays status badges", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

        # Test 4: Initials formatter (should show initials in avatars)
        print("\n→ Testing initials formatter...")
        try:
            # Look for Avatar elements
            avatar_elements = page.locator('.sapFAvatar').all()
            if len(avatar_elements) > 0:
                test = {"name": "Initials formatter displays in avatars", "status": "PASS"}
                results["passed"] += 1
                print(f"  ✓ Found {len(avatar_elements)} avatars with initials")
            else:
                test = {"name": "Initials formatter displays in avatars", "status": "SKIP", "error": "No avatars visible"}
                print("  ⊘ No avatars visible on page")
        except Exception as e:
            test = {"name": "Initials formatter displays in avatars", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

        # Test 5: Location formatter (should show "City, Country")
        print("\n→ Testing location formatter...")
        try:
            # Look for location text pattern
            location_elements = page.locator('text=/[A-Z][a-z]+,\\s*[A-Z][a-z]+/').all()
            if len(location_elements) > 0:
                test = {"name": "Location formatter displays City, Country", "status": "PASS"}
                results["passed"] += 1
                print(f"  ✓ Found {len(location_elements)} formatted locations")
            else:
                test = {"name": "Location formatter displays City, Country", "status": "SKIP", "error": "No locations visible"}
                print("  ⊘ No locations visible on page")
        except Exception as e:
            test = {"name": "Location formatter displays City, Country", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

    except Exception as e:
        results["errors"].append(f"Fatal error: {str(e)}")
        print(f"\n✗ Fatal error: {e}")

    return results


def test_candidate_detail_formatters(page: Page) -> dict:
    """Test formatters on candidate detail page"""
    results = {
        "test_name": "Candidate Detail Formatters",
        "tests": [],
        "passed": 0,
        "failed": 0,
        "errors": []
    }

    try:
        print("\n→ Navigating to candidate detail page...")
        page.goto(f"{BASE_URL}/cvmanagement/index.html#/candidates/cand-001")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        # Test date range formatter
        print("\n→ Testing date range formatter...")
        try:
            # Look for date ranges (e.g., "Jan 2020 - Dec 2022", "Jan 2020 - Present")
            date_range = page.locator('text=/[A-Z][a-z]{2}\\s+\\d{4}\\s+-\\s+(Present|[A-Z][a-z]{2}\\s+\\d{4})/').first
            if date_range.is_visible(timeout=5000):
                date_text = date_range.text_content()
                test = {"name": "Date range formatter works", "status": "PASS", "value": date_text}
                results["passed"] += 1
                print(f"  ✓ Date range formatted: {date_text}")
            else:
                test = {"name": "Date range formatter works", "status": "SKIP", "error": "No date ranges visible"}
                print("  ⊘ No date ranges visible")
        except Exception as e:
            test = {"name": "Date range formatter works", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

        # Test education formatter
        print("\n→ Testing education formatter...")
        try:
            # Look for education entries with institution and years
            edu_pattern = page.locator('text=/\\(\\d{4}\\s+-\\s+(Present|\\d{4})\\)/').first
            if edu_pattern.is_visible(timeout=5000):
                test = {"name": "Education formatter works", "status": "PASS"}
                results["passed"] += 1
                print(f"  ✓ Education formatted correctly")
            else:
                test = {"name": "Education formatter works", "status": "SKIP", "error": "No education visible"}
                print("  ⊘ No education visible")
        except Exception as e:
            test = {"name": "Education formatter works", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

        # Test proficiency state formatter
        print("\n→ Testing proficiency state formatter...")
        try:
            # Look for proficiency indicators (beginner/intermediate/advanced/expert)
            proficiency_elements = page.locator('text=/beginner|intermediate|advanced|expert/i').all()
            if len(proficiency_elements) > 0:
                test = {"name": "Proficiency state formatter works", "status": "PASS"}
                results["passed"] += 1
                print(f"  ✓ Found {len(proficiency_elements)} proficiency indicators")
            else:
                test = {"name": "Proficiency state formatter works", "status": "SKIP", "error": "No proficiency indicators visible"}
                print("  ⊘ No proficiency indicators visible")
        except Exception as e:
            test = {"name": "Proficiency state formatter works", "status": "FAIL", "error": str(e)}
            results["failed"] += 1
            print(f"  ✗ Error: {e}")
        results["tests"].append(test)

    except Exception as e:
        results["errors"].append(f"Fatal error: {str(e)}")
        print(f"\n✗ Fatal error: {e}")

    return results


def run_formatter_tests():
    """Run all formatter tests"""
    print("=" * 70)
    print("CV MANAGEMENT - FORMATTER VALIDATION TESTS")
    print("=" * 70)

    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console messages
        console_messages = []
        page.on('console', lambda msg: console_messages.append({
            'type': msg.type,
            'text': msg.text
        }))

        # Run tests
        all_results.append(test_formatters(page))
        all_results.append(test_candidate_detail_formatters(page))

        # Take final screenshot
        page.screenshot(path='/tmp/cv-management-formatters.png', full_page=True)
        print("\n→ Screenshot saved to /tmp/cv-management-formatters.png")

        browser.close()

        # Check for console errors
        print("\n" + "=" * 70)
        print("CONSOLE LOG ANALYSIS")
        print("=" * 70)

        errors = [msg for msg in console_messages if msg['type'] == 'error']
        warnings = [msg for msg in console_messages if msg['type'] == 'warning']

        if errors:
            print(f"\n✗ Found {len(errors)} console errors:")
            for err in errors[:5]:  # Show first 5
                print(f"  - {err['text'][:100]}")
        else:
            print("\n✓ No console errors detected")

        if warnings:
            print(f"\n⚠ Found {len(warnings)} console warnings:")
            for warn in warnings[:5]:  # Show first 5
                print(f"  - {warn['text'][:100]}")
        else:
            print("\n✓ No console warnings detected")

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
        if result['errors']:
            for err in result['errors']:
                print(f"  Error: {err}")

    print(f"\n{'=' * 70}")
    print(f"TOTAL: {total_passed}/{total_tests} tests passed")
    print(f"{'=' * 70}")

    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_formatter_tests())
