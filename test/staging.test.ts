import { describe, expect, it } from "bun:test";
import { stageRelease } from "../scripts/stage-release.js";

const id = "1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f";
const options = {
	version: "0.2.0",
	tarball: "/tmp/tested-release.tgz",
	integrity: "sha512-tested-artifact",
	tokenAvailable: true,
};
const tarball = {
	"gcode-seer": { name: "gcode-seer", version: "0.2.0", integrity: options.integrity, stageId: id },
};
const pending = { id, packageName: "gcode-seer", version: "0.2.0", tag: "latest" };

function fixture(responses: unknown[] = [], packageResponse = Response.json({ versions: {} })) {
	const commands: string[][] = [];
	return {
		commands,
		services: {
			readPackage: async () => packageResponse,
			npm: async (args: string[]) => {
				commands.push(args);
				if (!responses.length) {
					throw new Error("Unexpected npm command.");
				}
				return responses.shift();
			},
		},
	};
}

describe("npm staging", () => {
	it("uploads the tested tarball using stage publish with scripts disabled", async () => {
		const { services, commands } = fixture([[], tarball]);
		expect(await stageRelease(options, services)).toEqual({
			status: "staged",
			version: "0.2.0",
			integrity: options.integrity,
			stageId: id,
		});
		expect(commands).toEqual([
			["stage", "list", "gcode-seer", "--json"],
			[
				"stage",
				"publish",
				options.tarball,
				"--json",
				"--ignore-scripts",
				"--access",
				"public",
				"--tag",
				"latest",
			],
		]);
	});

	it("reuses an existing stage only after downloading and checking its integrity", async () => {
		const { services, commands } = fixture([[pending], tarball]);
		expect((await stageRelease(options, services)).stageId).toBe(id);
		expect(commands).toEqual([
			["stage", "list", "gcode-seer", "--json"],
			["stage", "download", id, "--json"],
		]);
	});

	it("does not mask conflicting staged bytes", async () => {
		const { services } = fixture([
			[pending],
			{ "gcode-seer": { ...tarball["gcode-seer"], integrity: "sha512-different" } },
		]);
		await expect(stageRelease(options, services)).rejects.toThrow("does not match");
	});

	it.each([
		{ ...pending, tag: "next" },
		{ ...pending, id: "invalid\nid" },
	])("rejects unsafe or inconsistent existing stage metadata %j", async (stage) => {
		const { services, commands } = fixture([[stage]]);
		await expect(stageRelease(options, services)).rejects.toThrow();
		expect(commands).toHaveLength(1);
	});

	it("returns a bootstrap task for a missing package without any npm writes or credentials", async () => {
		const { services, commands } = fixture([], new Response(null, { status: 404 }));
		expect((await stageRelease({ ...options, tokenAvailable: false }, services)).status).toBe(
			"bootstrap",
		);
		expect(commands).toEqual([]);
	});

	it("recognizes an already-published matching artifact without credentials", async () => {
		const { services, commands } = fixture(
			[],
			Response.json({ versions: { "0.2.0": { dist: { integrity: options.integrity } } } }),
		);
		expect((await stageRelease({ ...options, tokenAvailable: false }, services)).status).toBe(
			"published",
		);
		expect(commands).toEqual([]);
	});

	it("refuses a published version with different bytes", async () => {
		const { services } = fixture(
			[],
			Response.json({ versions: { "0.2.0": { dist: { integrity: "sha512-different" } } } }),
		);
		await expect(stageRelease(options, services)).rejects.toThrow(
			"published version does not match",
		);
	});

	it("fails on registry errors instead of offering bootstrap", async () => {
		const { services } = fixture([], new Response(null, { status: 503 }));
		await expect(stageRelease(options, services)).rejects.toThrow("HTTP 503");
	});

	it("requires the stage-only token before contacting authenticated endpoints", async () => {
		const { services, commands } = fixture();
		await expect(stageRelease({ ...options, tokenAvailable: false }, services)).rejects.toThrow(
			"stage-only NPM_TOKEN",
		);
		expect(commands).toEqual([]);
	});

	it("does not treat a failed stage command as success", async () => {
		const { services } = fixture([[]]);
		await expect(stageRelease(options, services)).rejects.toThrow("Unexpected npm command");
	});

	it.each([
		{ "gcode-seer": { ...tarball["gcode-seer"], stageId: undefined } },
		{ "gcode-seer": { ...tarball["gcode-seer"], version: "0.3.0" } },
		{ error: "bad output" },
	])("rejects malformed success output %j", async (response) => {
		const { services } = fixture([[], response]);
		await expect(stageRelease(options, services)).rejects.toThrow();
	});
});
