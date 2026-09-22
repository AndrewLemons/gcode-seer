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

describe("pull request title CLI", () => {
	it.each([
		["feat(parser): support a new command", 0],
		["chore(main): release 0.1.0", 0],
		["Add a feature", 1],
		["", 1],
		["feat: valid subject\ninvalid title continuation", 1],
		[`fix: ${"x".repeat(90)}`, 1],
	])("validates the title from the environment: %s", (title, expectedExitCode) => {
		const result = Bun.spawnSync([Bun.argv[0]!, "scripts/check-commit.ts", "--title"], {
			env: { ...process.env, PR_TITLE: title, PR_NUMBER: "123" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(expectedExitCode);
	});
});
