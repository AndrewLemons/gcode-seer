import { analyze, analyzeStream } from "../src/index.js";

const count = Number(process.env.GCODE_BENCH_MOVES ?? 250000);
if (!Number.isSafeInteger(count) || count < 1) {
	throw new Error("GCODE_BENCH_MOVES must be positive.");
}
const options = { initialPosition: { x: 0, y: 0, z: 0 }, initialExtrusion: 0 };
const header = "G91\nM83\nG1 F6000\n";
const move = "G1 X0.1 Y0.1 E0.01\n";
function verify(report: ReturnType<typeof analyze>): void {
	if (
		!report.complete ||
		report.moves !== count ||
		Math.abs(report.distance.total - count * Math.hypot(0.1, 0.1)) > 0.001
	) {
		throw new Error("Benchmark result is incorrect.");
	}
}
analyze(header + move.repeat(1000), options);
const text = header + move.repeat(count);
let start = performance.now();
verify(analyze(text, options));
const stringMs = performance.now() - start;
async function* chunks(): AsyncGenerator<string> {
	yield header;
	for (let offset = 0; offset < count; offset += 4096) {
		yield move.repeat(Math.min(4096, count - offset));
	}
}
start = performance.now();
verify(await analyzeStream(chunks(), options));
const streamMs = performance.now() - start;
console.log(
	JSON.stringify(
		{
			bun: Bun.version,
			moves: count,
			bytes: text.length,
			stringMs,
			streamMs,
			stringMovesPerSecond: Math.round((count / stringMs) * 1000),
			streamMovesPerSecond: Math.round((count / streamMs) * 1000),
			rssMiB: process.memoryUsage().rss / 1024 ** 2,
		},
		null,
		2,
	),
);
