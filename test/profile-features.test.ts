import { describe, expect, it } from "bun:test";
import {
	analyze,
	containsPathInCircle,
	createArc,
	prusaDialect,
	prusaLegacyDialect,
	prusaBuddyDialect,
	validatePrinterProfile,
} from "../src/index.js";
import type { PrinterProfile } from "../src/index.js";
const initial = { initialPosition: { x: 0, y: 0, z: 1 }, initialExtrusion: 0 };
const circle = { center: { x: 0, y: 0 }, radius: 150 };

describe("circular printable geometry", () => {
	it("rejects square corners, allows circumference and leaves travel unrestricted", () => {
		const printer = { name: "delta", printCircle: circle };
		expect(
			analyze("M83\nG1 X140 Y140 E1 F600", { ...initial, printer }).diagnostics.map((d) => d.code),
		).toContain("PRINT_CIRCLE");
		expect(analyze("M83\nG1 X150 E1 F600", { ...initial, printer }).constraints).toBe("passed");
		expect(analyze("G1 X150 Y150 F600", { ...initial, printer }).constraints).toBe("passed");
	});
	it("tests interiors of clockwise, counterclockwise and helical arcs", () => {
		for (const clockwise of [false, true]) {
			const start = { x: 0, y: clockwise ? 100 : -100, z: 0 };
			const end = { x: 0, y: -start.y, z: 400 };
			const path = createArc(start, end, clockwise, { i: 100, j: -start.y });
			expect(containsPathInCircle(circle, path)).toBe(false);
		}
		const arc = createArc({ x: 150, y: 0, z: 0 }, { x: 150, y: 0, z: 400 }, false, {
			i: -150,
			j: 0,
		});
		expect(containsPathInCircle(circle, arc)).toBe(true);
		const report = analyze("M83\nG3 X0 Y100 Z400 I100 J100 E1 F600", {
			...initial,
			initialPosition: { x: 0, y: -100, z: 0 },
			printer: { name: "delta", printCircle: circle },
		});
		expect(report.diagnostics.map((d) => d.code)).toContain("PRINT_CIRCLE");
	});
	it("accepts an off-center short arc whose farthest radial point is outside the sweep", () => {
		const path = createArc({ x: 0, y: 100, z: 0 }, { x: 0, y: -100, z: 0 }, false, {
			i: 100,
			j: -100,
		});
		expect(containsPathInCircle(circle, path)).toBe(true);
	});
	it("can prove an outside endpoint even without a known Z or start", () => {
		const report = analyze("M83\nG1 X140 Y140 E1 F600", {
			printer: { name: "delta", printCircle: circle },
		});
		expect(report.diagnostics.map((d) => d.code)).toContain("PRINT_CIRCLE");
		expect(report.complete).toBe(false);
	});
});

describe("physical heater and job mapping constraints", () => {
	const printer: PrinterProfile = {
		name: "dual",
		heaters: [
			{ id: "left", maxTemperature: 300 },
			{ id: "right", maxTemperature: 350 },
		],
		heaterTargets: { 1: "left", 0: "right" },
		requiresToolMapping: true,
	};
	it("checks explicit physical selectors without assuming material assignments", () => {
		const report = analyze("M104 T1 S301\nM109 T0 S340", { printer });
		expect(report.temperatures.left?.finalTarget).toBe(301);
		expect(report.temperatures.right?.finalTarget).toBe(340);
		expect(report.diagnostics.filter((d) => d.code === "TEMPERATURE_LIMIT")).toHaveLength(1);
	});
	it("keeps implicit targets and deposition coverage unknown until mapped", () => {
		const report = analyze("M104 S250\nM83\nG1 X10 E1 F600", { ...initial, printer });
		expect(report.temperatures).toEqual({});
		expect(report.constraints).toBe("unknown");
		expect(report.diagnostics.map((d) => d.code)).toContain("UNKNOWN_TOOL_MAPPING");
	});
	it("checks mapped tools against the physical limit", () => {
		const report = analyze("M104 S301", {
			printer: { ...printer, tools: [{ id: 0, heater: "left" }] },
		});
		expect(report.constraints).toBe("violated");
	});
	it.each([
		{ printCircle: { center: { x: 0, y: 0 }, radius: 0 } },
		{ printCircle: { center: { x: NaN, y: 0 }, radius: 1 } },
		{ heaters: [{ id: "bed" }] },
		{ heaters: [{ id: "h" }, { id: "h" }] },
		{ heaters: [{ id: "h", maxTemperature: -1 }] },
		{ heaters: [{ id: "h" }], tools: [{ id: 0, heater: "other" }] },
		{ maxToolheadSpeed: -1 },
		{ requiresToolMapping: 1 as unknown as boolean },
	])("rejects malformed profile additions", (addition) => {
		expect(() => validatePrinterProfile({ name: "invalid", ...addition })).toThrow();
	});
	it("checks diagonal toolhead speed but excludes pure extrusion", () => {
		const p = { name: "speed", maxToolheadSpeed: 600 };
		expect(
			analyze("G1 X100 Y100 F42000", { ...initial, printer: p }).diagnostics.map((d) => d.code),
		).toContain("TOOLHEAD_SPEED_LIMIT");
		expect(analyze("M83\nG1 E100 F42000", { ...initial, printer: p }).constraints).toBe("passed");
	});
	it("includes preset assumptions in the report", () => {
		const report = analyze("G21", {
			printer: {
				name: "notes",
				provenance: {
					id: "example",
					manufacturer: "Prusa",
					reviewedAt: "2026-09-22",
					sources: [],
					notes: ["Tested configuration only."],
				},
			},
		});
		expect(report.assumptions).toContain("Tested configuration only.");
	});
});

describe("Prusa firmware generations", () => {
	it.each([
		[prusaDialect, 3, 2],
		[prusaLegacyDialect, 3, 3],
		[prusaBuddyDialect, 2, 3],
	] as const)("preserves the firmware's E-mode behavior: %o", (dialect, afterG90, afterG91) => {
		expect(analyze("M83\nG1 E1 F60\nG90\nG1 E2", { ...initial, dialect }).tools[0]?.extruded).toBe(
			afterG90,
		);
		expect(analyze("M82\nG1 E1 F60\nG91\nG1 E2", { ...initial, dialect }).tools[0]?.extruded).toBe(
			afterG91,
		);
	});
	it("recognizes Buddy chamber cooling and checks its target", () => {
		const report = analyze("M191 C60", {
			dialect: prusaBuddyDialect,
			printer: { name: "chamber", maxChamberTemperature: 55 },
		});
		expect(report.temperatures.chamber?.finalTarget).toBe(60);
		expect(report.temperatures.chamber?.waits).toBe(1);
		expect(report.constraints).toBe("violated");
		expect(analyze("M191 C50 S55", { dialect: prusaBuddyDialect }).validity).toBe("invalid");
		expect(analyze("M191 C50", { dialect: prusaDialect }).complete).toBe(false);
	});
	it("does not silently accept compatibility switches", () => {
		expect(analyze("M862.2 P250", { dialect: prusaBuddyDialect }).validity).toBe("unknown");
	});
});
