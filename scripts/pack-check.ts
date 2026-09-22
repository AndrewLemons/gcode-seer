import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "gcode-seer-package-"));
const tarball = join(directory, "gcode-seer.tgz");

function run(args: string[], cwd = process.cwd()): void {
	const result = Bun.spawnSync([Bun.argv[0]!, ...args], {
		cwd,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0) {
		throw new Error(`Command failed: bun ${args.join(" ")}`);
	}
}

try {
	run(["pm", "pack", "--ignore-scripts", "--quiet", "--filename", tarball]);
	const files = await new Bun.Archive(await Bun.file(tarball).bytes()).files();
	if (
		[...files.keys()].some((name) =>
			/^package\/(?:test|scripts|node_modules|coverage|\.git[^/]*)(?:\/|$)/.test(name),
		)
	) {
		throw new Error("Development files leaked into the package.");
	}

	// Install the actual tarball in an isolated consumer to exercise package exports.
	await Bun.write(join(directory, "package.json"), '{"private":true,"type":"module"}\n');
	run(["add", "--ignore-scripts", tarball], directory);
	await Bun.write(
		join(directory, "smoke.ts"),
		`import { analyze } from "gcode-seer";
const report = analyze("G1 X3 Y4 F600", { initialPosition: { x: 0, y: 0, z: 0 } });
if (report.distance.total !== 5 || report.maxAxisSpeed.x !== 6) {
	throw new Error("Package import failed.");
}
`,
	);
	run(["smoke.ts"], directory);
	await Bun.write(
		join(directory, "consumer.ts"),
		`import { analyze, type AnalysisReport, type PrinterProfile } from "gcode-seer";
const printer: PrinterProfile = { name: "consumer" };
const report: AnalysisReport = analyze("G21", { printer });
console.log(report.complete);
`,
	);
	run(
		[
			resolve("node_modules/typescript/bin/tsc"),
			"--noEmit",
			"--strict",
			"--skipLibCheck",
			"--target",
			"ES2022",
			"--module",
			"NodeNext",
			"--moduleResolution",
			"NodeNext",
			join(directory, "consumer.ts"),
		],
		directory,
	);
	const metadata = (await Bun.file(
		join(directory, "node_modules/gcode-seer/package.json"),
	).json()) as {
		dependencies?: Record<string, string>;
	};
	if (Object.keys(metadata.dependencies ?? {}).length) {
		throw new Error("Expected a dependency-free runtime package.");
	}
	console.log(
		`Package smoke test passed: ${files.size} files, runtime import and TypeScript consumer.`,
	);
} finally {
	await rm(directory, { recursive: true, force: true });
}
