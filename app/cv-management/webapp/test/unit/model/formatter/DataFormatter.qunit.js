sap.ui.define([
    "cvmanagement/model/formatter/DataFormatter"
], function (DataFormatter) {
    "use strict";

    QUnit.module("DataFormatter");

    QUnit.module("formatSkillsList", {
        beforeEach: function () {
            this.formatter = DataFormatter;
        }
    });

    QUnit.test("Should return 'No skills' for empty array", function (assert) {
        assert.strictEqual(this.formatter.formatSkillsList([]), "No skills");
    });

    QUnit.test("Should return 'No skills' for null", function (assert) {
        assert.strictEqual(this.formatter.formatSkillsList(null), "No skills");
    });

    QUnit.test("Should return 'No skills' for undefined", function (assert) {
        assert.strictEqual(this.formatter.formatSkillsList(undefined), "No skills");
    });

    QUnit.test("Should return 'No skills' for non-array", function (assert) {
        assert.strictEqual(this.formatter.formatSkillsList("not an array"), "No skills");
    });

    QUnit.test("Should format single skill with expanded property", function (assert) {
        const aSkills = [
            { skill: { name: "JavaScript" } }
        ];
        assert.strictEqual(this.formatter.formatSkillsList(aSkills), "JavaScript");
    });

    QUnit.test("Should format multiple skills (up to 3)", function (assert) {
        const aSkills = [
            { skill: { name: "JavaScript" } },
            { skill: { name: "TypeScript" } },
            { skill: { name: "React" } }
        ];
        assert.strictEqual(this.formatter.formatSkillsList(aSkills), "JavaScript, TypeScript, React");
    });

    QUnit.test("Should truncate after 3 skills with ellipsis", function (assert) {
        const aSkills = [
            { skill: { name: "JavaScript" } },
            { skill: { name: "TypeScript" } },
            { skill: { name: "React" } },
            { skill: { name: "Vue" } },
            { skill: { name: "Angular" } }
        ];
        assert.strictEqual(this.formatter.formatSkillsList(aSkills), "JavaScript, TypeScript, React...");
    });

    QUnit.test("Should handle skill with skillName property fallback", function (assert) {
        const aSkills = [
            { skillName: "Python" }
        ];
        assert.strictEqual(this.formatter.formatSkillsList(aSkills), "Python");
    });

    QUnit.test("Should filter out Unknown skills", function (assert) {
        const aSkills = [
            { skill: { name: "JavaScript" } },
            { skill: null },
            { skill: { name: "TypeScript" } }
        ];
        assert.strictEqual(this.formatter.formatSkillsList(aSkills), "JavaScript, TypeScript");
    });


    QUnit.module("formatScore", {
        beforeEach: function () {
            this.formatter = DataFormatter;
        }
    });

    QUnit.test("Should format number to 1 decimal place", function (assert) {
        assert.strictEqual(this.formatter.formatScore(85.67), "85.7");
    });

    QUnit.test("Should format integer to 1 decimal place", function (assert) {
        assert.strictEqual(this.formatter.formatScore(90), "90.0");
    });

    QUnit.test("Should return '0.0' for null", function (assert) {
        assert.strictEqual(this.formatter.formatScore(null), "0.0");
    });

    QUnit.test("Should return '0.0' for undefined", function (assert) {
        assert.strictEqual(this.formatter.formatScore(undefined), "0.0");
    });

    QUnit.test("Should return '0.0' for empty string", function (assert) {
        assert.strictEqual(this.formatter.formatScore(""), "0.0");
    });

    QUnit.test("Should parse string number", function (assert) {
        assert.strictEqual(this.formatter.formatScore("75.5"), "75.5");
    });

    QUnit.test("Should return '0.0' for NaN", function (assert) {
        assert.strictEqual(this.formatter.formatScore("not a number"), "0.0");
    });

    QUnit.test("Should handle zero", function (assert) {
        assert.strictEqual(this.formatter.formatScore(0), "0.0");
    });


    QUnit.module("formatLocation", {
        beforeEach: function () {
            this.formatter = DataFormatter;
        }
    });

    QUnit.test("Should format city and country", function (assert) {
        assert.strictEqual(this.formatter.formatLocation("Berlin", "Germany"), "Berlin, Germany");
    });

    QUnit.test("Should handle country object with name property", function (assert) {
        const oCountry = { name: "Germany" };
        assert.strictEqual(this.formatter.formatLocation("Berlin", oCountry), "Berlin, Germany");
    });

    QUnit.test("Should handle country object with countryName property", function (assert) {
        const oCountry = { countryName: "France" };
        assert.strictEqual(this.formatter.formatLocation("Paris", oCountry), "Paris, France");
    });

    QUnit.test("Should return city only if no country", function (assert) {
        assert.strictEqual(this.formatter.formatLocation("Berlin", null), "Berlin");
    });

    QUnit.test("Should return country only if no city", function (assert) {
        assert.strictEqual(this.formatter.formatLocation(null, "Germany"), "Germany");
    });

    QUnit.test("Should return 'N/A' if neither city nor country", function (assert) {
        assert.strictEqual(this.formatter.formatLocation(null, null), "N/A");
    });

    QUnit.test("Should return 'N/A' for empty strings", function (assert) {
        assert.strictEqual(this.formatter.formatLocation("", ""), "N/A");
    });


    QUnit.module("hasValue", {
        beforeEach: function () {
            this.formatter = DataFormatter;
        }
    });

    QUnit.test("Should return true for string value", function (assert) {
        assert.strictEqual(this.formatter.hasValue("some value"), true);
    });

    QUnit.test("Should return true for number value", function (assert) {
        assert.strictEqual(this.formatter.hasValue(42), true);
    });

    QUnit.test("Should return true for zero", function (assert) {
        assert.strictEqual(this.formatter.hasValue(0), true);
    });

    QUnit.test("Should return true for boolean false", function (assert) {
        assert.strictEqual(this.formatter.hasValue(false), true);
    });

    QUnit.test("Should return false for null", function (assert) {
        assert.strictEqual(this.formatter.hasValue(null), false);
    });

    QUnit.test("Should return false for undefined", function (assert) {
        assert.strictEqual(this.formatter.hasValue(undefined), false);
    });

    QUnit.test("Should return false for empty string", function (assert) {
        assert.strictEqual(this.formatter.hasValue(""), false);
    });

    QUnit.test("Should return true for object", function (assert) {
        assert.strictEqual(this.formatter.hasValue({}), true);
    });

    QUnit.test("Should return true for array", function (assert) {
        assert.strictEqual(this.formatter.hasValue([]), true);
    });
});
