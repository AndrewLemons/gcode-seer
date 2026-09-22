import { describe, expect, it } from "bun:test";
import { validateRelease } from "../scripts/check-release.js";

const metadata = {
	name: "gcode-seer",
	version: "0.1.0",
	repository: { type: "git", url: "git+https://github.com/AndrewLemons/gcode-seer.git" },
	publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
};
const manifest = { ".": "0.1.0" };
const release = { tagName: "v0.1.0", isDraft: false, isPrerelease: false };
const repository = "AndrewLemons/gcode-seer";

describe("release publication guards", () => {
	it("accepts the published release when all identities agree", () => {
		expect(() => validateRelease("v0.1.0", repository, metadata, manifest, release)).not.toThrow();
	});

	it.each(["main", "v0.1.0-beta.1", "0.1.0", "v01.1.0", "v0.1.0\n", "v1.2.3+build"])(
		"rejects a non-stable tag %s",
		(tag) => {
			expect(() => validateRelease(tag, repository, metadata, manifest, release)).toThrow();
		},
	);

	it("rejects a stale version or uninitialized release manifest", () => {
		expect(() => validateRelease("v0.2.0", repository, metadata, manifest, release)).toThrow(
			"must agree",
		);
		expect(() => validateRelease("v0.1.0", repository, metadata, {}, release)).toThrow(
			"must agree",
		);
	});

	it.each([
		{ ...release, isDraft: true },
		{ ...release, isPrerelease: true },
		{ ...release, tagName: "v0.2.0" },
	])("rejects an unpublished or different release %j", (candidate) => {
		expect(() => validateRelease("v0.1.0", repository, metadata, manifest, candidate)).toThrow(
			"published",
		);
	});

	it.each([
		{ ...metadata, name: "other-package" },
		{ ...metadata, private: true },
		{ ...metadata, repository: { type: "git", url: "https://github.com/other/fork" } },
		{
			...metadata,
			publishConfig: { access: "restricted", registry: "https://registry.npmjs.org/" },
		},
		{ ...metadata, publishConfig: { access: "public", registry: "https://npm.pkg.github.com/" } },
	])("rejects unexpected package metadata %j", (candidate) => {
		expect(() => validateRelease("v0.1.0", repository, candidate, manifest, release)).toThrow(
			"identity",
		);
	});

	it("rejects publishing from a fork", () => {
		expect(() => validateRelease("v0.1.0", "other/fork", metadata, manifest, release)).toThrow(
			"identity",
		);
	});
});
