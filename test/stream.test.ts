import { Readable } from "node:stream";
import { describe, expect, it } from "bun:test";
import { analyze, analyzeStream, GcodeAnalyzer } from "../src/index.js";
const options = { initialPosition: { x: 0, y: 0, z: 0 }, initialExtrusion: 0 };

describe("streaming and lifecycle", () => {
	it("does not share live interpreter position with event observers", () => {
		const report = analyze("G91\nG1 X10 F600\nG1 X10", {
			...options,
			onEvent(event) {
				if (event.type === "move") {
					event.end.x = 999;
				}
			},
		});
		expect(report.finalPosition.x).toBe(20);
	});
	const text = "\uFEFF; café ☕\r\nG21\rG90\nG1 X10 E1 F600\r\nG1 X20\nM104 S220";
	it("matches whole-string analysis for every byte split", async () => {
		const bytes = new TextEncoder().encode(text);
		const expected = analyze(text, options);
		for (let split = 0; split <= bytes.length; split++) {
			expect(await analyzeStream([bytes.slice(0, split), bytes.slice(split)], options)).toEqual(
				expected,
			);
		}
	});
	it("handles one-byte chunks and a Node Readable", async () => {
		const chunks = Array.from(new TextEncoder().encode(text), (byte) => Uint8Array.of(byte));
		expect(await analyzeStream(Readable.from(chunks), options)).toEqual(analyze(text, options));
	});
	it("supports mixed text and complete UTF-8 chunks", async () => {
		expect(
			(await analyzeStream(["G1 ", new TextEncoder().encode("X10 F600\r"), "", "\n"], options))
				.lines,
		).toBe(1);
	});
	it("rejects invalid UTF-8 rather than inserting replacement characters", async () => {
		await expect(analyzeStream([Uint8Array.of(0xff)])).rejects.toThrow();
	});
	it("throws on upstream I/O errors", async () => {
		async function* source() {
			yield "G1 X10";
			throw new Error("read failed");
		}
		await expect(analyzeStream(source())).rejects.toThrow("read failed");
	});
	it("honors cancellation", async () => {
		const controller = new AbortController();
		controller.abort();
		expect(() => analyze("G21", { signal: controller.signal })).toThrow();
		await expect(analyzeStream(["G21"], { signal: controller.signal })).rejects.toThrow();
	});
	it("caps line storage and recovers framing after oversized lines", async () => {
		const program = `;${"x".repeat(10000)}\nG21`;
		const report = await analyzeStream(Array.from(program), {
			maxLineLength: 16,
		});
		expect(report.lines).toBe(2);
		expect(report.commands).toBe(1);
		expect(report.diagnostics[0]?.code).toBe("LINE_TOO_LONG");
		expect(report.validity).toBe("invalid");
		expect(report).toEqual(analyze(program, { maxLineLength: 16 }));
	});
	it("closes incremental analyzers and isolates their state", () => {
		const first = new GcodeAnalyzer(options);
		const second = new GcodeAnalyzer(options);
		first.addLine("G1 X10 F600");
		second.addLine("G1 X20 F600");
		expect(first.finish().finalPosition.x).toBe(10);
		expect(second.finish().finalPosition.x).toBe(20);
		expect(() => first.finish()).toThrow();
		expect(() => first.addLine("G21")).toThrow();
	});
	it("rejects embedded newlines in the line API", () => {
		expect(() => new GcodeAnalyzer().addLine("G21\nG90")).toThrow();
	});
	it("uses a configuration snapshot", () => {
		const config = {
			initialPosition: { x: 0, y: 0, z: 0 },
			printer: { name: "test", maxSpeed: { x: 10 } },
		};
		const analyzer = new GcodeAnalyzer(config);
		config.printer.maxSpeed.x = 1000;
		analyzer.addLine("G1 X10 F1200");
		expect(analyzer.finish().constraints).toBe("violated");
	});
});
