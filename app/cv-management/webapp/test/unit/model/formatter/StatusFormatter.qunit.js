sap.ui.define([
    "cvmanagement/model/formatter/StatusFormatter"
], function (StatusFormatter) {
    "use strict";

    QUnit.module("StatusFormatter");

    QUnit.module("formatStatusState", {
        beforeEach: function () {
            this.formatter = StatusFormatter;
        }
    });

    QUnit.test("Should return 'Information' for 'new'", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("new"), "Information");
    });

    QUnit.test("Should return 'Warning' for 'screening'", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("screening"), "Warning");
    });

    QUnit.test("Should return 'Success' for 'interviewing'", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("interviewing"), "Success");
    });

    QUnit.test("Should return 'Success' for 'offered'", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("offered"), "Success");
    });

    QUnit.test("Should return 'Success' for 'hired'", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("hired"), "Success");
    });

    QUnit.test("Should return 'Error' for 'rejected'", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("rejected"), "Error");
    });

    QUnit.test("Should handle case insensitivity", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("NEW"), "Information");
        assert.strictEqual(this.formatter.formatStatusState("Hired"), "Success");
    });

    QUnit.test("Should return 'None' for unknown status", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState("unknown"), "None");
    });

    QUnit.test("Should return 'None' for null", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState(null), "None");
    });

    QUnit.test("Should return 'None' for undefined", function (assert) {
        assert.strictEqual(this.formatter.formatStatusState(undefined), "None");
    });


    QUnit.module("formatProficiencyState", {
        beforeEach: function () {
            this.formatter = StatusFormatter;
        }
    });

    QUnit.test("Should return 'Error' for 'beginner'", function (assert) {
        assert.strictEqual(this.formatter.formatProficiencyState("beginner"), "Error");
    });

    QUnit.test("Should return 'Warning' for 'intermediate'", function (assert) {
        assert.strictEqual(this.formatter.formatProficiencyState("intermediate"), "Warning");
    });

    QUnit.test("Should return 'Success' for 'advanced'", function (assert) {
        assert.strictEqual(this.formatter.formatProficiencyState("advanced"), "Success");
    });

    QUnit.test("Should return 'Success' for 'expert'", function (assert) {
        assert.strictEqual(this.formatter.formatProficiencyState("expert"), "Success");
    });

    QUnit.test("Should handle case insensitivity", function (assert) {
        assert.strictEqual(this.formatter.formatProficiencyState("EXPERT"), "Success");
    });

    QUnit.test("Should return 'None' for unknown proficiency", function (assert) {
        assert.strictEqual(this.formatter.formatProficiencyState("unknown"), "None");
    });


    QUnit.module("formatInterviewStatusState", {
        beforeEach: function () {
            this.formatter = StatusFormatter;
        }
    });

    QUnit.test("Should return 'Information' for 'scheduled'", function (assert) {
        assert.strictEqual(this.formatter.formatInterviewStatusState("scheduled"), "Information");
    });

    QUnit.test("Should return 'Success' for 'completed'", function (assert) {
        assert.strictEqual(this.formatter.formatInterviewStatusState("completed"), "Success");
    });

    QUnit.test("Should return 'Error' for 'cancelled'", function (assert) {
        assert.strictEqual(this.formatter.formatInterviewStatusState("cancelled"), "Error");
    });

    QUnit.test("Should return 'Warning' for 'rescheduled'", function (assert) {
        assert.strictEqual(this.formatter.formatInterviewStatusState("rescheduled"), "Warning");
    });

    QUnit.test("Should return 'None' for null", function (assert) {
        assert.strictEqual(this.formatter.formatInterviewStatusState(null), "None");
    });


    QUnit.module("formatJobStatusState", {
        beforeEach: function () {
            this.formatter = StatusFormatter;
        }
    });

    QUnit.test("Should return 'Warning' for 'draft'", function (assert) {
        assert.strictEqual(this.formatter.formatJobStatusState("draft"), "Warning");
    });

    QUnit.test("Should return 'Success' for 'published'", function (assert) {
        assert.strictEqual(this.formatter.formatJobStatusState("published"), "Success");
    });

    QUnit.test("Should return 'Success' for 'open'", function (assert) {
        assert.strictEqual(this.formatter.formatJobStatusState("open"), "Success");
    });

    QUnit.test("Should return 'Error' for 'closed'", function (assert) {
        assert.strictEqual(this.formatter.formatJobStatusState("closed"), "Error");
    });

    QUnit.test("Should return 'None' for unknown job status", function (assert) {
        assert.strictEqual(this.formatter.formatJobStatusState("unknown"), "None");
    });


    QUnit.module("formatScoreState", {
        beforeEach: function () {
            this.formatter = StatusFormatter;
        }
    });

    QUnit.test("Should return 'Success' for score >= 80", function (assert) {
        assert.strictEqual(this.formatter.formatScoreState(80), "Success");
        assert.strictEqual(this.formatter.formatScoreState(90), "Success");
        assert.strictEqual(this.formatter.formatScoreState(100), "Success");
    });

    QUnit.test("Should return 'Warning' for score >= 60 and < 80", function (assert) {
        assert.strictEqual(this.formatter.formatScoreState(60), "Warning");
        assert.strictEqual(this.formatter.formatScoreState(70), "Warning");
        assert.strictEqual(this.formatter.formatScoreState(79), "Warning");
    });

    QUnit.test("Should return 'Error' for score < 60", function (assert) {
        assert.strictEqual(this.formatter.formatScoreState(0), "Error");
        assert.strictEqual(this.formatter.formatScoreState(30), "Error");
        assert.strictEqual(this.formatter.formatScoreState(59), "Error");
    });

    QUnit.test("Should return 'None' for NaN", function (assert) {
        assert.strictEqual(this.formatter.formatScoreState("not a number"), "None");
    });

    QUnit.test("Should return 'None' for null", function (assert) {
        assert.strictEqual(this.formatter.formatScoreState(null), "None");
    });

    QUnit.test("Should return 'None' for undefined", function (assert) {
        assert.strictEqual(this.formatter.formatScoreState(undefined), "None");
    });
});
