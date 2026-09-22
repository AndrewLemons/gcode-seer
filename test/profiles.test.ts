import { describe, expect, it } from "bun:test";
import {
	analyze,
	bambuExclusion,
	createBambuX1CarbonPrintProfile,
	validatePrinterProfile,
} from "../src/index.js";
import type { PrinterProfile } from "../src/index.js";
const origin = { x: 0, y: 0, z: 0 };
const base = { initialPosition: origin, initialExtrusion: 0 };

describe("profiles and constraints", () => {
	it("imports Bambu exclusions and returns independent profile instances", () => {
		expect(bambuExclusion(["0x0", "18x0", "18x28", "0x28"]).polygon[2]).toEqual({ x: 18, y: 28 });
		const a = createBambuX1CarbonPrintProfile();
		const b = createBambuX1CarbonPrintProfile();
		a.printBounds!.max.x = 1;
		expect(b.printBounds?.max.x).toBe(256);
		expect(b.printBounds?.max.z).toBe(250);
		expect(analyze("M83\nG1 X10 Y10 E1 F600", { ...base, printer: b }).constraints).toBe(
			"violated",
		);
	});
	it("checks temperatures, speed, extrusion and flow limits", () => {
		const printer: PrinterProfile = {
			name: "limited",
			maxBedTemperature: 60,
			maxChamberTemperature: 50,
			maxSpeed: { x: 5 },
			tools: [
				{
					id: 0,
					heater: "hotend",
					maxTemperature: 230,
					minExtrusionTemperature: 180,
					filamentDiameter: 1.75,
					maxExtrusionSpeed: 1,
					maxVolumetricFlow: 2,
				},
			],
		};
		const report = analyze("M104 S250\nM140 S80\nM141 S60\nG1 X10 E5 F600\nM104 S0\nG1 X20 E10", {
			...base,
			printer,
		});
		const codes = report.diagnostics.map((d) => d.code);
		expect(codes.filter((c) => c === "TEMPERATURE_LIMIT")).toHaveLength(3);
		expect(codes).toEqual(
			expect.arrayContaining([
				"SPEED_LIMIT",
				"EXTRUSION_SPEED_LIMIT",
				"VOLUMETRIC_FLOW_LIMIT",
				"COLD_EXTRUSION_TARGET",
			]),
		);
	});
	it("checks per-tool geometry", () => {
		const printer: PrinterProfile = {
			name: "dual",
			tools: [
				{
					id: 0,
					heater: "left",
					printBounds: { min: origin, max: { x: 5, y: 10, z: 10 } },
				},
			],
		};
		expect(
			analyze("G1 X10 E1 F600", { ...base, printer }).diagnostics.map((d) => d.code),
		).toContain("TOOL_PRINT_BOUNDS");
	});
	it("reports missing temperature knowledge", () => {
		const report = analyze("M83\nG1 E1 F60", {
			...base,
			printer: {
				name: "cold",
				tools: [{ id: 0, heater: "hotend", minExtrusionTemperature: 180 }],
			},
		});
		expect(report.constraints).toBe("unknown");
	});
	it.each([
		{
			name: "bad",
			travelBounds: { min: origin, max: { x: -1, y: 10, z: 10 } },
		},
		{ name: "bad", maxSpeed: { x: NaN } },
		{ name: "bad", tools: [{ id: -1, heater: "hotend" }] },
		{ name: "bad", tools: [{ id: 0, heater: "bed" }] },
		{ name: "bad", tools: [{ id: 0, heater: "hotend", filamentDiameter: 0 }] },
		{
			name: "bad",
			tools: [{ id: 0, heater: "hotend", maxVolumetricFlow: 10 }],
		},
		{ name: "bad", heaterTargets: { 1: "missing" } },
	] satisfies PrinterProfile[])("rejects invalid configuration", (profile) => {
		expect(() => validatePrinterProfile(profile)).toThrow();
	});
	it("rejects bad exclusion polygons", () => {
		for (const points of [
			["1x2"],
			["0x0", "10x10", "0x10", "10x0"],
			["0x0", "1x1", "2x2"],
			["0x0", "0x0", "1x1"],
			["wrong", "1x1", "2x2"],
		]) {
			expect(() => bambuExclusion(points)).toThrow();
		}
	});
	it.each([
		{ maxDiagnostics: -1 },
		{ maxLineLength: 0 },
		{ initialFeedrate: 0 },
		{ initialPosition: { x: Infinity } },
	])("validates analysis options", (options) => {
		expect(() => analyze("G21", options)).toThrow();
	});
});
