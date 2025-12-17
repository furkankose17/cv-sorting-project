#!/usr/bin/env python3
"""
Test for console errors and UI5 binding errors
Validates that the UI5 fixes eliminated all binding errors
"""

from playwright.sync_api import sync_playwright, Page
import sys
import re

BASE_URL = "http://localhost:4004"

def analyze_console_messages(messages: list) -> dict:
    """Analyze console messages for specific error patterns"""
    results = {
        "test_name": "Console Error Analysis",
        "tests": [],
        "passed": 0,
        "failed": 0,
        "errors": []
    }

    # Error patterns we're checking for
    error_patterns = {
        "primitive_errors": re.compile(r"Accessed value is not primitive", re.IGNORECASE),
        "format_exceptions": re.compile(r"FormatException.*Type.*Raw.*does not support formatting", re.IGNORECASE),
        "boolean_conversion": re.compile(r"(San Francisco|Berlin|London|Paris|New York) is not a valid boolean value", re.IGNORECASE),
        "interview_expand": re.compile(r"interview.*auto.*expand.*fail", re.IGNORECASE),
        "i18n_locale": re.compile(r"i18n.*locale.*warn", re.IGNORECASE)
    }

    errors = [msg for msg in messages if msg['type'] == 'error']
    warnings = [msg for msg in messages if msg['type'] == 'warning']

    print("\n→ Analyzing console messages...")
    print(f"  Total errors: {len(errors)}")
    print(f"  Total warnings: {len(warnings)}")

    # Check for specific error patterns
    for pattern_name, pattern in error_patterns.items():
        print(f"\n→ Checking for {pattern_name}...")

        matching_errors = [msg for msg in errors if pattern.search(msg['text'])]
        matching_warnings = [msg for msg in warnings if pattern.search(msg['text'])]

        total_matches = len(matching_errors) + len(matching_warnings)

        if total_matches == 0:
            test = {
                "name": f"No {pattern_name.replace('_', ' ')} errors",
                "status": "PASS"
            }
            results["passed"] += 1
            print(f"  ✓ No {pattern_name} errors found")
        else:
            test = {
                "name": f"No {pattern_name.replace('_', ' ')} errors",
                "status": "FAIL",
                "error": f"Found {total_matches} occurrences"
            }
            results["failed"] += 1
            print(f"  ✗ Found {total_matches} {pattern_name} errors")

            # Show examples
            for msg in (matching_errors + matching_warnings)[:3]:
                print(f"     - {msg['text'][:150]}")

        results["tests"].append(test)

    # General error count check
    print("\n→ Checking general error count...")
    if len(errors) == 0:
        test = {"name": "No console errors", "status": "PASS"}
        results["passed"] += 1
        print("  ✓ No console errors")
    else:
        test = {
            "name": "No console errors",
            "status": "FAIL",
            "error": f"Found {len(errors)} errors"
        }
        results["failed"] += 1
        print(f"  ✗ Found {len(errors)} console errors:")
        for err in errors[:5]:
            print(f"     - {err['text'][:150]}")

    results["tests"].append(test)

    # Warning count check (allow some warnings, but report them)
    print("\n→ Checking warning count...")
    if len(warnings) == 0:
        test = {"name": "No console warnings", "status": "PASS"}
        results["passed"] += 1
        print("  ✓ No console warnings")
    elif len(warnings) <= 5:
        test = {
            "name": "Minimal console warnings",
            "status": "PASS",
            "info": f"Found {len(warnings)} warnings (acceptable)"
        }
        results["passed"] += 1
        print(f"  ✓ Found {len(warnings)} warnings (acceptable threshold)")
    else:
        test = {
            "name": "Minimal console warnings",
            "status": "FAIL",
            "error": f"Found {len(warnings)} warnings (threshold: 5)"
        }
        results["failed"] += 1
        print(f"  ✗ Found {len(warnings)} warnings (exceeds threshold):")
        for warn in warnings[:5]:
            print(f"     - {warn['text'][:150]}")

    results["tests"].append(test)

    return results


def test_main_page_console(page: Page) -> list:
    """Test main candidates page for console errors"""
    print("\n→ Testing main candidates page...")

    console_messages = []
    page.on('console', lambda msg: console_messages.append({
        'type': msg.type,
        'text': msg.text
    }))

    try:
        page.goto(f"{BASE_URL}/cvmanagement/index.html")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(3000)  # Wait for UI5 to fully initialize

        print(f"  → Page loaded, captured {len(console_messages)} console messages")

    except Exception as e:
        print(f"  ✗ Error loading page: {e}")

    return console_messages


def test_candidate_detail_console(page: Page) -> list:
    """Test candidate detail page for console errors"""
    print("\n→ Testing candidate detail page...")

    console_messages = []
    page.on('console', lambda msg: console_messages.append({
        'type': msg.type,
        'text': msg.text
    }))

    try:
        page.goto(f"{BASE_URL}/cvmanagement/index.html#/candidates/cand-001")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(3000)

        print(f"  → Page loaded, captured {len(console_messages)} console messages")

    except Exception as e:
        print(f"  ✗ Error loading page: {e}")

    return console_messages


def test_job_detail_console(page: Page) -> list:
    """Test job detail page for console errors"""
    print("\n→ Testing job detail page...")

    console_messages = []
    page.on('console', lambda msg: console_messages.append({
        'type': msg.type,
        'text': msg.text
    }))

    try:
        page.goto(f"{BASE_URL}/cvmanagement/index.html#/jobs/job-001")
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(3000)

        print(f"  → Page loaded, captured {len(console_messages)} console messages")

    except Exception as e:
        print(f"  ✗ Error loading page: {e}")

    return console_messages


def run_console_error_tests():
    """Run all console error detection tests"""
    print("=" * 70)
    print("CV MANAGEMENT - CONSOLE ERROR DETECTION TESTS")
    print("=" * 70)

    all_messages = []
    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Test main page
        page = browser.new_page()
        all_messages.extend(test_main_page_console(page))
        page.close()

        # Test candidate detail
        page = browser.new_page()
        all_messages.extend(test_candidate_detail_console(page))
        page.close()

        # Test job detail
        page = browser.new_page()
        all_messages.extend(test_job_detail_console(page))
        page.close()

        browser.close()

    # Analyze all collected messages
    print("\n" + "=" * 70)
    print("ANALYZING ALL CONSOLE MESSAGES")
    print("=" * 70)

    results = analyze_console_messages(all_messages)
    all_results.append(results)

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

    # Return exit code
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_console_error_tests())
