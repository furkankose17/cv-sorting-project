sap.ui.define([
    "cvmanagement/model/formatter/DisplayFormatter"
], function (DisplayFormatter) {
    "use strict";

    QUnit.module("DisplayFormatter");

    QUnit.module("formatInitials", {
        beforeEach: function () {
            this.formatter = DisplayFormatter;
        }
    });

    QUnit.test("Should return initials from first and last name", function (assert) {
        assert.strictEqual(this.formatter.formatInitials("John", "Doe"), "JD");
    });

    QUnit.test("Should handle lowercase names", function (assert) {
        assert.strictEqual(this.formatter.formatInitials("john", "doe"), "JD");
    });

    QUnit.test("Should return only first initial if no last name", function (assert) {
        assert.strictEqual(this.formatter.formatInitials("John", null), "J");
    });

    QUnit.test("Should return only last initial if no first name", function (assert) {
        assert.strictEqual(this.formatter.formatInitials(null, "Doe"), "D");
    });

    QUnit.test("Should return '?' if both names are null", function (assert) {
        assert.strictEqual(this.formatter.formatInitials(null, null), "?");
    });

    QUnit.test("Should return '?' if both names are undefined", function (assert) {
        assert.strictEqual(this.formatter.formatInitials(undefined, undefined), "?");
    });

    QUnit.test("Should return '?' if both names are empty strings", function (assert) {
        assert.strictEqual(this.formatter.formatInitials("", ""), "?");
    });


    QUnit.module("formatDateRange", {
        beforeEach: function () {
            this.formatter = DisplayFormatter;
        }
    });

    QUnit.test("Should format date range with start and end dates", function (assert) {
        const result = this.formatter.formatDateRange("2020-01-15", "2022-12-31", false);
        assert.strictEqual(result, "Jan 2020 - Dec 2022");
    });

    QUnit.test("Should show 'Present' for current position", function (assert) {
        const result = this.formatter.formatDateRange("2020-01-15", null, true);
        assert.strictEqual(result, "Jan 2020 - Present");
    });

    QUnit.test("Should show 'N/A' for no end date and not current", function (assert) {
        const result = this.formatter.formatDateRange("2020-01-15", null, false);
        assert.strictEqual(result, "Jan 2020 - N/A");
    });

    QUnit.test("Should return 'N/A' for no start date", function (assert) {
        const result = this.formatter.formatDateRange(null, "2022-12-31", false);
        assert.strictEqual(result, "N/A");
    });

    QUnit.test("Should handle undefined dates", function (assert) {
        const result = this.formatter.formatDateRange(undefined, undefined, false);
        assert.strictEqual(result, "N/A");
    });


    QUnit.module("formatEducation", {
        beforeEach: function () {
            this.formatter = DisplayFormatter;
        }
    });

    QUnit.test("Should format education with start and end years", function (assert) {
        const result = this.formatter.formatEducation("MIT", "2018-09-01", "2022-05-31", false);
        assert.strictEqual(result, "MIT (2018 - 2022)");
    });

    QUnit.test("Should show 'Present' for ongoing education", function (assert) {
        const result = this.formatter.formatEducation("MIT", "2020-09-01", null, true);
        assert.strictEqual(result, "MIT (2020 - Present)");
    });

    QUnit.test("Should show 'N/A' for no end date and not ongoing", function (assert) {
        const result = this.formatter.formatEducation("MIT", "2018-09-01", null, false);
        assert.strictEqual(result, "MIT (2018 - N/A)");
    });

    QUnit.test("Should return institution only if no start date", function (assert) {
        const result = this.formatter.formatEducation("MIT", null, "2022-05-31", false);
        assert.strictEqual(result, "MIT");
    });

    QUnit.test("Should return 'N/A' for null institution", function (assert) {
        const result = this.formatter.formatEducation(null, "2018-09-01", "2022-05-31", false);
        assert.strictEqual(result, "N/A");
    });

    QUnit.test("Should return 'N/A' for undefined institution", function (assert) {
        const result = this.formatter.formatEducation(undefined, "2018-09-01", "2022-05-31", false);
        assert.strictEqual(result, "N/A");
    });

    QUnit.test("Should return 'N/A' for empty institution", function (assert) {
        const result = this.formatter.formatEducation("", "2018-09-01", "2022-05-31", false);
        assert.strictEqual(result, "N/A");
    });
});
