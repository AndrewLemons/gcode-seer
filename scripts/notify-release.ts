import { appendFile } from "node:fs/promises";
import type { StageResult } from "./stage-release.js";

interface Issue {
	number: number;
	body: string | null;
	state: string;
	user: { login: string };
}

interface IssueChange {
	title: string;
	body: string;
	state: "open" | "closed";
}

interface IssueService {
	list(): Promise<Issue[]>;
	create(change: IssueChange): Promise<{ html_url: string }>;
	update(number: number, change: IssueChange): Promise<{ html_url: string }>;
}

export function releaseNotice(result: StageResult, runUrl: string): IssueChange {
	const marker = `<!-- npm-release:gcode-seer@${result.version} -->`;
	const common = `${marker}\n\n[Workflow run and tested npm-package artifact](${runUrl}) · [Release](https://github.com/AndrewLemons/gcode-seer/releases/tag/v${result.version})\n\nExpected tarball integrity: \`${result.integrity}\``;
	if (result.status === "published") {
		return {
			title: `npm: gcode-seer@${result.version} published`,
			state: "closed",
			body: `${common}\n\nThe public npm version matches the tested artifact. No approval remains.`,
		};
	}
	const instructions =
		result.status === "bootstrap"
			? "npm cannot stage a brand-new package. Download the tested artifact from this run and follow the **First publication** steps in the release guide. Publish it interactively with your own npm login and 2FA. Do not give CI a direct-publish token."
			: `Stage ID: \`${result.stageId}\`\n\nReview **Staged Packages** on npmjs.com, or use npm CLI 11.15+ with your own npm login:\n\n\`\`\`sh\nnpm stage view ${result.stageId}\nnpm stage download ${result.stageId}\n# After inspecting the tarball and comparing its integrity:\nnpm stage approve ${result.stageId}\n\`\`\`\n\nApproval prompts for 2FA. To discard the stage instead, use \`npm stage reject ${result.stageId}\`. Approve pending versions in ascending order because this stage targets \`latest\`.`;
	return {
		title: `npm: ${result.status === "bootstrap" ? "bootstrap" : "approve"} gcode-seer@${result.version}`,
		state: "open",
		body: `${common}\n\n@AndrewLemons — maintainer action is required; this version is **not published by this workflow**.\n\n${instructions}\n\n[Release guide](https://github.com/AndrewLemons/gcode-seer/blob/main/docs/releasing.md)\n\nClose this issue after publishing or rejecting. After publication, rerunning Publish verifies the public artifact and closes this task automatically.`,
	};
}

/** One bot-owned task per version; retries update it rather than posting new mentions. */
export async function notifyRelease(
	result: StageResult,
	runUrl: string,
	issues: IssueService,
): Promise<string | undefined> {
	const marker = `<!-- npm-release:gcode-seer@${result.version} -->`;
	const existing = (await issues.list()).find(
		(issue) => issue.user.login === "github-actions[bot]" && issue.body?.includes(marker),
	);
	const change = releaseNotice(result, runUrl);
	if (existing) {
		return (await issues.update(existing.number, change)).html_url;
	}
	if (result.status !== "published") {
		return (await issues.create(change)).html_url;
	}
}

if (import.meta.main) {
	const {
		RELEASE_STATUS: status,
		RELEASE_VERSION: version,
		RELEASE_INTEGRITY: integrity,
		RELEASE_STAGE_ID: stageId,
		GH_TOKEN: token,
		GITHUB_REPOSITORY: repository,
		GITHUB_RUN_ID: runId,
	} = process.env;
	if (
		!token ||
		repository !== "AndrewLemons/gcode-seer" ||
		!runId ||
		!/^\d+$/.test(runId) ||
		!version ||
		!/^\d+\.\d+\.\d+$/.test(version) ||
		!integrity ||
		!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity) ||
		!["bootstrap", "staged", "published"].includes(status ?? "") ||
		(status === "staged" &&
			(!stageId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(stageId)))
	) {
		throw new Error("Missing or invalid release notification inputs.");
	}
	const result: StageResult = {
		status: status as StageResult["status"],
		version,
		integrity,
		...(stageId ? { stageId } : {}),
	};
	async function api(method: string, path: string, body?: unknown): Promise<unknown> {
		const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"Content-Type": "application/json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) {
			throw new Error(
				`GitHub notification failed: HTTP ${response.status}. The npm stage is unchanged; rerun this job after checking Issues and workflow permissions.`,
			);
		}
		return response.json();
	}
	const url = await notifyRelease(
		result,
		`https://github.com/${repository}/actions/runs/${runId}`,
		{
			async list() {
				const issues: Issue[] = [];
				for (let page = 1; ; page++) {
					const batch = (await api(
						"GET",
						`issues?state=all&creator=github-actions%5Bbot%5D&per_page=100&page=${page}`,
					)) as Issue[];
					issues.push(...batch);
					if (batch.length < 100) {
						return issues;
					}
				}
			},
			async create(change) {
				return (await api("POST", "issues", {
					title: change.title,
					body: change.body,
					assignees: ["AndrewLemons"],
				})) as { html_url: string };
			},
			async update(number, change) {
				return (await api("PATCH", `issues/${number}`, change)) as { html_url: string };
			},
		},
	);
	if (url) {
		console.log(url);
		if (process.env.GITHUB_STEP_SUMMARY) {
			await appendFile(process.env.GITHUB_STEP_SUMMARY, `Maintainer task: ${url}\n`);
		}
	}
}
