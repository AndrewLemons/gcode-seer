import { describe, expect, it, mock } from "bun:test";
import { notifyRelease, releaseNotice } from "../scripts/notify-release.js";
import type { StageResult } from "../scripts/stage-release.js";

const result: StageResult = {
	status: "staged",
	version: "0.2.0",
	integrity: "sha512-tested-artifact",
	stageId: "1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f",
};
const run = "https://github.com/AndrewLemons/gcode-seer/actions/runs/123";
const issue = {
	number: 42,
	user: { login: "github-actions[bot]" },
	state: "open",
	body: "<!-- npm-release:gcode-seer@0.2.0 -->",
};
const issueUrl = "https://github.com/AndrewLemons/gcode-seer/issues/42";

function fixture(existing = [issue]) {
	return {
		list: mock(async () => existing),
		create: mock(async (_change: unknown) => ({ html_url: issueUrl })),
		update: mock(async (_number: number, _change: unknown) => ({ html_url: issueUrl })),
	};
}

describe("release notifications", () => {
	it("includes the artifact, integrity, stage ID, 2FA instructions, and maintainer mention", () => {
		const notice = releaseNotice(result, run);
		expect(notice.state).toBe("open");
		expect(notice.body).toContain(run);
		expect(notice.body).toContain(result.integrity);
		expect(notice.body).toContain(`npm stage approve ${result.stageId}`);
		expect(notice.body).toContain("2FA");
		expect(notice.body).toContain("@AndrewLemons");
	});

	it("creates a single task on the first notification", async () => {
		const issues = fixture([]);
		expect(await notifyRelease(result, run, issues)).toBe(issueUrl);
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(issues.update).not.toHaveBeenCalled();
	});

	it("updates the same task when the staging workflow is retried", async () => {
		const issues = fixture();
		await notifyRelease(result, run, issues);
		expect(issues.create).not.toHaveBeenCalled();
		expect(issues.update).toHaveBeenCalledWith(42, releaseNotice(result, run));
	});

	it("reopens a closed task when the version still needs approval", async () => {
		const issues = fixture([{ ...issue, state: "closed" }]);
		await notifyRelease(result, run, issues);
		expect(issues.update.mock.calls[0]?.[1]).toMatchObject({ state: "open" });
	});

	it("does not edit a human-authored issue containing the marker", async () => {
		const issues = fixture([{ ...issue, user: { login: "someone" } }]);
		await notifyRelease(result, run, issues);
		expect(issues.create).toHaveBeenCalledTimes(1);
		expect(issues.update).not.toHaveBeenCalled();
	});

	it("gives the first release an interactive bootstrap task, not an approve command", () => {
		const notice = releaseNotice({ ...result, status: "bootstrap" }, run);
		expect(notice.title).toContain("bootstrap");
		expect(notice.body).toContain("cannot stage a brand-new package");
		expect(notice.body).not.toContain("npm stage approve");
	});

	it("closes a matching task only after public artifact verification", async () => {
		const issues = fixture();
		await notifyRelease({ ...result, status: "published" }, run, issues);
		expect(issues.update.mock.calls[0]?.[1]).toMatchObject({ state: "closed" });
		expect(issues.create).not.toHaveBeenCalled();
	});

	it("does not create an approval task for an already-published version", async () => {
		const issues = fixture([]);
		expect(await notifyRelease({ ...result, status: "published" }, run, issues)).toBeUndefined();
		expect(issues.create).not.toHaveBeenCalled();
	});

	it("surfaces notification failure so the notification job can be retried separately", async () => {
		const issues = fixture([]);
		issues.create.mockImplementation(async () => {
			throw new Error("Issues are disabled");
		});
		await expect(notifyRelease(result, run, issues)).rejects.toThrow("Issues are disabled");
	});
});
