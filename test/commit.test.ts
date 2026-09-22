import { describe, expect, it } from "bun:test";
import { validateCommitMessage } from "../scripts/check-commit.js";

describe("conventional commit messages", () => {
	it.each([
		"chore: initialize project",
		"fix(parser): handle empty lines",
		"feat(api)!: change report shape\n\nBREAKING CHANGE: report fields were renamed.",
		"refactor!: simplify exports\r\n\r\nDetails.",
	])("accepts %s", (message) => {
		expect(() => validateCommitMessage(message)).not.toThrow();
	});

	it.each([
		"",
		"update parser",
		"Fix: handle empty lines",
		"fix(): handle empty lines",
		"fix: ",
		"fix: trailing space ",
		`fix: ${"x".repeat(96)}`,
	])("rejects invalid subject %s", (message) => {
		expect(() => validateCommitMessage(message)).toThrow("Conventional Commit");
	});
});
