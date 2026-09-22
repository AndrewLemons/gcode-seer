import { rm } from "node:fs/promises";

// Remove obsolete outputs before emitting ESM and declarations for each source module.
await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
const result = Bun.spawnSync([Bun.argv[0]!, "--bun", "tsc", "-p", "tsconfig.build.json"], {
	stdout: "inherit",
	stderr: "inherit",
});
if (result.exitCode !== 0) {
	process.exit(result.exitCode);
}
