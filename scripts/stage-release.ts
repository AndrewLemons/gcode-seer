import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface StageResult {
	status: "bootstrap" | "staged" | "published";
	version: string;
	integrity: string;
	stageId?: string;
}

interface StageOptions {
	version: string;
	tarball: string;
	integrity: string;
	tokenAvailable: boolean;
}

interface StageServices {
	readPackage(): Promise<Response>;
	npm(args: string[]): Promise<unknown>;
}

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Unexpected npm registry response.");
	}
	return value as Record<string, unknown>;
}

function stageId(value: unknown): string {
	if (typeof value !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) {
		throw new Error("npm did not return a valid stage ID.");
	}
	return value;
}

function verifyTarball(value: unknown, options: StageOptions): Record<string, unknown> {
	// npm 11.19.1 keys stage publish/download JSON by package name.
	const result = object(object(value)["gcode-seer"]);
	if (
		result.name !== "gcode-seer" ||
		result.version !== options.version ||
		result.integrity !== options.integrity
	) {
		throw new Error("The npm tarball does not match the tested release artifact.");
	}
	return result;
}

/** Stage only; approval and the first publication always require a maintainer. */
export async function stageRelease(
	options: StageOptions,
	services: StageServices,
): Promise<StageResult> {
	const { version, integrity } = options;
	const response = await services.readPackage();
	if (response.status === 404) {
		return { status: "bootstrap", version, integrity };
	}
	if (!response.ok) {
		throw new Error(`Could not check the npm package: HTTP ${response.status}.`);
	}
	const versions = object(object(await response.json()).versions);
	if (Object.hasOwn(versions, version)) {
		if (object(object(versions[version]).dist).integrity !== integrity) {
			throw new Error("The published version does not match the tested release artifact.");
		}
		return { status: "published", version, integrity };
	}
	if (!options.tokenAvailable) {
		throw new Error("Set a stage-only NPM_TOKEN in the npm environment; see docs/releasing.md.");
	}
	const stages = await services.npm(["stage", "list", "gcode-seer", "--json"]);
	if (!Array.isArray(stages)) {
		throw new Error("npm stage list did not return an array.");
	}
	const matches = stages
		.map(object)
		.filter((item) => item.packageName === "gcode-seer" && item.version === version);
	if (matches.length > 1) {
		throw new Error("Multiple stages exist for this version; review them on npm.");
	}
	const existing = matches[0];
	if (existing) {
		if (existing.tag !== "latest") {
			throw new Error("The existing stage has a different dist-tag; review it on npm.");
		}
		const id = stageId(existing.id);
		// Downloading computes SHA-512 from the actual staged bytes, not just list metadata.
		verifyTarball(await services.npm(["stage", "download", id, "--json"]), options);
		return { status: "staged", version, integrity, stageId: id };
	}
	const staged = verifyTarball(
		await services.npm([
			"stage",
			"publish",
			options.tarball,
			"--json",
			"--ignore-scripts",
			"--access",
			"public",
			"--tag",
			"latest",
		]),
		options,
	);
	return { status: "staged", version, integrity, stageId: stageId(staged.stageId) };
}

if (import.meta.main) {
	const [tarball] = Bun.argv.slice(2);
	const tag = process.env.GITHUB_REF_NAME ?? "";
	if (!tarball || !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag)) {
		throw new Error("Expected a tarball path and a stable GITHUB_REF_NAME release tag.");
	}
	const version = tag.slice(1);
	const bytes = await Bun.file(tarball).bytes();
	const files = await new Bun.Archive(bytes).files();
	const manifest = await files.get("package/package.json")?.text();
	const metadata = object(JSON.parse(manifest ?? "null"));
	if (metadata.name !== "gcode-seer" || metadata.version !== version) {
		throw new Error("Tarball identity does not match the release tag.");
	}
	const result = await stageRelease(
		{
			version,
			tarball: resolve(tarball),
			integrity: `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`,
			tokenAvailable: Boolean(process.env.NODE_AUTH_TOKEN),
		},
		{
			readPackage: () =>
				fetch("https://registry.npmjs.org/gcode-seer", { signal: AbortSignal.timeout(30_000) }),
			async npm(args) {
				const child = Bun.spawn(["npm", ...args, "--registry", "https://registry.npmjs.org/"], {
					cwd: process.env.RUNNER_TEMP ?? process.cwd(),
					stdout: "pipe",
					stderr: "inherit",
					stdin: "ignore",
				});
				const [output, exitCode] = await Promise.all([
					new Response(child.stdout).text(),
					child.exited,
				]);
				if (exitCode !== 0) {
					throw new Error(
						`npm ${args.slice(0, 2).join(" ")} failed; no approval was attempted. Check the npm logs and retry.`,
					);
				}
				return JSON.parse(output) as unknown;
			},
		},
	);
	console.log(JSON.stringify(result, null, 2));
	if (process.env.GITHUB_STEP_SUMMARY) {
		const status =
			result.status === "staged"
				? "Awaiting npm approval with 2FA"
				: result.status === "bootstrap"
					? "First publication requires interactive bootstrap"
					: "Already published; artifact verified";
		await appendFile(
			process.env.GITHUB_STEP_SUMMARY,
			`## gcode-seer@${version}: ${status}\n\nStage ID: ${result.stageId ?? "not applicable"}\n\nTarball integrity: \`${result.integrity}\`\n\nSee [release instructions](https://github.com/AndrewLemons/gcode-seer/blob/main/docs/releasing.md) for approval or first-publication steps.\n`,
		);
	}
}
