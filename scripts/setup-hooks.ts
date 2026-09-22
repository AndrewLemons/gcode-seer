import { fileURLToPath } from "node:url";

// Only configure this checkout; package consumers do not receive development hooks.
if (await Bun.file(new URL("../.githooks/commit-msg", import.meta.url)).exists()) {
	const result = Bun.spawnSync(["git", "config", "--local", "core.hooksPath", ".githooks"], {
		cwd: fileURLToPath(new URL("../", import.meta.url)),
		stderr: "inherit",
	});
	if (result.exitCode !== 0) {
		throw new Error("Could not configure Git hooks for this checkout.");
	}
}
