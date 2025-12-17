#!/usr/bin/env python3
"""
Master test runner for cv-management UI5 fixes validation
Runs all test suites and generates comprehensive report
"""

import sys
import subprocess
import time
from datetime import datetime
import json

def run_test_suite(test_file: str, name: str) -> dict:
    """Run a test suite and capture results"""
    print(f"\n{'=' * 70}")
    print(f"Running: {name}")
    print(f"{'=' * 70}")

    start_time = time.time()

    try:
        result = subprocess.run(
            [sys.executable, test_file],
            capture_output=True,
            text=True,
            cwd='/Users/furkankose/cv-sorting-app/cv-sorting-project/app/cv-management/webapp/test/e2e'
        )

        duration = time.time() - start_time

        # Print output
        if result.stdout:
            print(result.stdout)

        if result.stderr and result.returncode != 0:
            print("STDERR:", result.stderr)

        return {
            "name": name,
            "file": test_file,
            "exit_code": result.returncode,
            "duration": round(duration, 2),
            "passed": result.returncode == 0,
            "output": result.stdout,
            "stderr": result.stderr
        }

    except Exception as e:
        duration = time.time() - start_time
        print(f"✗ Error running {name}: {e}")

        return {
            "name": name,
            "file": test_file,
            "exit_code": -1,
            "duration": round(duration, 2),
            "passed": False,
            "error": str(e)
        }


def generate_report(results: list) -> str:
    """Generate comprehensive test report"""
    report = []
    report.append("=" * 70)
    report.append("CV MANAGEMENT - UI5 FIXES VALIDATION REPORT")
    report.append("=" * 70)
    report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append("")

    total_suites = len(results)
    passed_suites = sum(1 for r in results if r['passed'])
    failed_suites = total_suites - passed_suites

    report.append(f"Test Suites: {passed_suites} passed, {failed_suites} failed, {total_suites} total")
    report.append(f"Total Duration: {sum(r['duration'] for r in results):.2f}s")
    report.append("")

    # Individual suite results
    report.append("=" * 70)
    report.append("SUITE DETAILS")
    report.append("=" * 70)

    for result in results:
        status = "✓ PASS" if result['passed'] else "✗ FAIL"
        report.append(f"\n{status} {result['name']}")
        report.append(f"  File: {result['file']}")
        report.append(f"  Duration: {result['duration']}s")
        report.append(f"  Exit Code: {result['exit_code']}")

        if not result['passed'] and 'error' in result:
            report.append(f"  Error: {result['error']}")

    # Overall status
    report.append("\n" + "=" * 70)
    if passed_suites == total_suites:
        report.append("✓ ALL TESTS PASSED - UI5 FIXES VALIDATED")
    else:
        report.append(f"✗ {failed_suites} TEST SUITE(S) FAILED")
    report.append("=" * 70)

    return "\n".join(report)


def main():
    """Run all test suites"""
    print("=" * 70)
    print("CV MANAGEMENT - UI5 FIXES VALIDATION")
    print("Starting comprehensive test suite...")
    print("=" * 70)

    # Define test suites
    test_suites = [
        ("test_console_errors.py", "Console Error Detection"),
        ("test_formatters.py", "Formatter Validation"),
        ("test_navigation.py", "Navigation & User Flows")
    ]

    # Run all test suites
    results = []
    for test_file, name in test_suites:
        result = run_test_suite(test_file, name)
        results.append(result)

    # Generate and print report
    report = generate_report(results)
    print("\n" + report)

    # Save report to file
    report_file = "/tmp/cv-management-test-report.txt"
    with open(report_file, 'w') as f:
        f.write(report)
    print(f"\n→ Full report saved to {report_file}")

    # Save JSON results
    json_file = "/tmp/cv-management-test-results.json"
    with open(json_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"→ JSON results saved to {json_file}")

    # Screenshots reminder
    print("\n→ Screenshots saved to:")
    print("  - /tmp/cv-management-main.png")
    print("  - /tmp/cv-management-detail.png")
    print("  - /tmp/cv-management-formatters.png")

    # Exit with appropriate code
    all_passed = all(r['passed'] for r in results)
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
