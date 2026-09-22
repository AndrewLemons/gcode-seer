interface ReleaseMetadata {
	tagName: string;
	isDraft: boolean;
	isPrerelease: boolean;
}

interface PackageMetadata {
	name: string;
	version: string;
	private?: boolean;
	repository?: { type: string; url: string };
	publishConfig?: { access: string; registry: string };
}

/** Check identity before installing dependencies or making a publishable artifact. */
export function validateRelease(
	tag: string,
	repository: string,
	metadata: PackageMetadata,
	manifest: Record<string, string>,
	release: ReleaseMetadata,
): void {
	if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
		throw new Error("Only stable vMAJOR.MINOR.PATCH release tags can be published.");
	}
	if (tag !== `v${metadata.version}` || manifest["."] !== metadata.version) {
		throw new Error("Release tag, package version, and Release Please manifest must agree.");
	}
	if (release.tagName !== tag || release.isDraft !== false || release.isPrerelease !== false) {
		throw new Error("The tag must have a published, non-prerelease GitHub release.");
	}
	if (
		repository !== "AndrewLemons/gcode-seer" ||
		metadata.name !== "gcode-seer" ||
		metadata.private ||
		metadata.repository?.type !== "git" ||
		metadata.repository.url !== `git+https://github.com/${repository}.git` ||
		metadata.publishConfig?.access !== "public" ||
		metadata.publishConfig.registry !== "https://registry.npmjs.org/"
	) {
		throw new Error("Package identity and public npm registry must match this repository.");
	}
}

if (import.meta.main) {
	const metadataPath = process.env.RELEASE_METADATA;
	if (!metadataPath) {
		throw new Error("RELEASE_METADATA must point to the GitHub release JSON.");
	}
	validateRelease(
		process.env.GITHUB_REF_NAME ?? "",
		process.env.GITHUB_REPOSITORY ?? "",
		(await Bun.file("package.json").json()) as PackageMetadata,
		(await Bun.file(".release-please-manifest.json").json()) as Record<string, string>,
		(await Bun.file(metadataPath).json()) as ReleaseMetadata,
	);
}
