import { describe, expect, it } from "bun:test";
import {
	analyze,
	createPrinterProfile,
	listPrinterProfiles,
	createBambuX1CarbonPrintProfile,
	validatePrinterProfile,
	containsPathInPolygon,
	createArc,
} from "../src/index.js";
import type { PrinterProfileOptions, PrinterProfile } from "../src/index.js";
import sources from "./fixtures/printer-sources.json" with { type: "json" };

const initial = { initialPosition: { x: 50, y: 50, z: 1 }, initialExtrusion: 0 };
const codes = (text: string, printer: PrinterProfile) =>
	analyze(text, { ...initial, printer }).diagnostics.map((d) => d.code);

describe("catalog and source inventory", () => {
	it("accounts for every Bambu nozzle preset's inherited geometry and heater selectors", () => {
		const catalog = listPrinterProfiles("Bambu Lab");
		expect(catalog.map((p) => p.name).sort()).toEqual(Object.keys(sources.bambu).sort());
		for (const [name, group] of Object.entries(sources.bambu)) {
			const item = catalog.find((p) => p.name === name)!;
			for (const source of group.variants) {
				const p = createPrinterProfile(item.id);
				const points = source.printable_area.map((p) => p.split("x").map(Number));
				expect(p.printBounds!.min).toEqual({ x: 0, y: 0, z: 0 });
				expect(p.printBounds!.max).toEqual({
					x: Math.max(...points.map((p) => p[0]!)),
					y: Math.max(...points.map((p) => p[1]!)),
					z: name === "Bambu Lab X2D" ? 260 : Number(source.printable_height),
				});
				expect(p.exclusions?.[0]?.polygon ?? []).toEqual(
					source.bed_exclude_area.map((p) => {
						const [x, y] = p.split("x").map(Number);
						return { x: x!, y: y! };
					}),
				);
				for (const [index, selector] of source.physical_extruder_map.entries()) {
					expect(p.heaterTargets![Number(selector)]).toBe(p.heaters![index]!.id);
				}
				if (item.requiresToolMapping) {
					for (const [index, shape] of source.extruder_printable_area.entries()) {
						const tool = createPrinterProfile(item.id, { materialTools: { 0: index } }).tools![0]!;
						const xy = shape.split(",").map((p) => p.split("x").map(Number));
						expect(tool.printBounds!.min.x).toBe(Math.min(...xy.map((p) => p[0]!)));
						expect(tool.printBounds!.max.x).toBe(Math.max(...xy.map((p) => p[0]!)));
						const heights =
							"extruder_printable_height" in source
								? (source.extruder_printable_height as string[])
								: [];
						expect(tool.printBounds!.max.z).toBe(
							name === "Bambu Lab X2D" && index === 0 ? 260 : Number(heights[index]),
						);
					}
				}
			}
		}
	});
	const prusaModels: Record<string, string> = {
		MINI: "mini",
		MINIIS: "mini",
		"MK3.5": "mk3.5",
		"MK3.5MMU3": "mk3.5",
		"MK3.9": "mk3.9",
		"MK3.9MMU3": "mk3.9",
		"MK3.9S": "mk3.9s",
		"MK3.9SMMU3": "mk3.9s",
		MK4: "mk4",
		MK4IS: "mk4",
		MK4ISMMU3: "mk4",
		MK4S: "mk4s",
		MK4SMMU3: "mk4s",
		XL: "xl",
		XLIS: "xl",
		XL2: "xl",
		XL2IS: "xl",
		XL5: "xl",
		XL5IS: "xl",
		"MK2.5": "mk2.5",
		"MK2.5MMU2": "mk2.5",
		"MK2.5S": "mk2.5s",
		"MK2.5SMMU2S": "mk2.5s",
		MK2S: "mk2s",
		MK2SMM: "mk2s",
		MK3: "mk3",
		MK3MMU2: "mk3",
		MK3S: "mk3s",
		MK3SMMU2S: "mk3s",
		MK3SMMU3: "mk3s",
		COREONE: "core-one",
		COREONEMMU3: "core-one",
		COREONEOAK: "signature-oak",
		COREONEL: "core-one-l",
		COREONELMMU3: "core-one-l",
		COREONE_INDX4T: "core-one-indx",
		COREONE_INDX8T: "core-one-indx",
		XLP1T: "xl-plus",
		XLP2T: "xl-plus",
		XLP5T: "xl-plus",
	};
	it("accounts for every current Prusa model and every concrete geometry variant", () => {
		expect(Object.keys(prusaModels).sort()).toEqual(Object.keys(sources.prusa).sort());
		for (const [model, group] of Object.entries(sources.prusa)) {
			const p = createPrinterProfile(`prusa-${prusaModels[model]}`);
			for (const facts of group.variants) {
				const points = facts.bed_shape.split(",").map((p) => p.split("x").map(Number));
				expect(p.printBounds).toEqual({
					min: {
						x: Math.min(...points.map((p) => p[0]!)),
						y: Math.min(...points.map((p) => p[1]!)),
						z: 0,
					},
					max: {
						x: Math.max(...points.map((p) => p[0]!)),
						y: Math.max(...points.map((p) => p[1]!)),
						z: Number(facts.max_print_height),
					},
				});
			}
		}
	});
	it("validates every available profile and all advertised tool/MMU configurations", () => {
		const all = listPrinterProfiles();
		expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
		for (const entry of all) {
			expect(entry.sources.length).toBeGreaterThan(0);
			if (!entry.available) {
				expect(entry.technology).toBe("SLA");
				expect(() => createPrinterProfile(entry.id)).toThrow("Resin");
				continue;
			}
			for (const toolCount of entry.toolCounts) {
				const p = createPrinterProfile(entry.id, { toolCount });
				expect(() => validatePrinterProfile(p)).not.toThrow();
				expect(p.heaters).toHaveLength(toolCount);
				if (p.printBounds) {
					expect(codes(`M83\nG1 X${p.printBounds.max.x + 1} E1 F600`, p)).toContain("PRINT_BOUNDS");
				}
			}
			for (const multiMaterial of entry.multiMaterialUpgrades) {
				const p = createPrinterProfile(entry.id, {
					multiMaterial: multiMaterial as PrinterProfileOptions["multiMaterial"] & string,
				});
				expect(p.tools).toHaveLength(multiMaterial === "mmu1" ? 4 : 5);
				expect(new Set(p.tools!.map((t) => t.heater)).size).toBe(1);
				expect(codes("M104 T3 S999", p)).toContain("TEMPERATURE_LIMIT");
			}
		}
	});
	it("returns fresh nested values and retains the original geometry-only X1C helper", () => {
		const a = createPrinterProfile("bambu-h2d", { materialTools: { 0: 0 } });
		a.printBounds!.max.x = 1;
		a.tools![0]!.printBounds!.max.x = 2;
		a.heaters![0]!.maxTemperature = 1;
		(a.provenance!.notes as string[]).push("mutation");
		(a.dialect!.passiveCommands as string[]).push("G999");
		const b = createPrinterProfile("bambu-h2d", { materialTools: { 0: 0 } });
		expect(b.printBounds!.max.x).toBe(350);
		expect(b.tools![0]!.printBounds!.max.x).toBe(325);
		expect(b.heaters![0]!.maxTemperature).toBe(350);
		expect(b.provenance!.notes).not.toContain("mutation");
		expect(b.dialect!.passiveCommands).not.toContain("G999");
		const list = listPrinterProfiles();
		(list[0]!.sources as string[]).length = 0;
		expect(listPrinterProfiles()[0]!.sources.length).toBeGreaterThan(0);
		expect(createBambuX1CarbonPrintProfile().tools).toBeUndefined();
	});
	it.each([
		["missing", {}],
		["prusa-mk4s", { toolCount: 2 }],
		["prusa-xl", { toolCount: 3 }],
		["bambu-h2d", { toolCount: 1 }],
		["prusa-mini", { multiMaterial: "mmu3" }],
		["prusa-mk4s", { supplyVoltage: 110 }],
		["bambu-x1", { supplyVoltage: 240 }],
		["prusa-mk4s", { typo: true }],
		["bambu-h2d", { materialTools: {} }],
		["bambu-h2d", { materialTools: { 0: 2 } }],
		["bambu-h2d", { materialTools: { 255: 0 } }],
		["bambu-a1", { materialTools: { "01": 0 } }],
		["bambu-a1", { materialTools: { 0: NaN } }],
		["prusa-mk4s", { multiMaterial: "mmu3", materialTools: { 0: 0 } }],
		["prusa-xl", { materialTools: { 5: 0 } }],
	] as const)("rejects invalid configuration %s %o", (id, options) => {
		expect(() => createPrinterProfile(id, options as PrinterProfileOptions)).toThrow();
	});
});

describe("printer-specific behavior", () => {
	it("distinguishes AMS materials and reversed physical heater selectors", () => {
		const p = createPrinterProfile("bambu-h2d", { materialTools: { 0: 0, 3: 1 } });
		const r = analyze("M104 S220\nM104 T0 S230\nM104 T1 S240\nM104 T3 S250", { printer: p });
		expect(r.temperatures.left?.finalTarget).toBe(240);
		expect(r.temperatures.right?.finalTarget).toBe(230);
		expect(r.diagnostics.map((d) => d.code)).toContain("UNKNOWN_HEATER");
		expect(codes("M83\nG1 X340 E1 F600", p)).toContain("TOOL_PRINT_BOUNDS");
		const right = createPrinterProfile("bambu-h2d", { materialTools: { 0: 1 } });
		expect(codes("M83\nG1 X340 E1 F600", right)).not.toContain("TOOL_PRINT_BOUNDS");
		expect(codes("M83\nG1 Z324 E1 F600", right)).not.toContain("PRINT_BOUNDS");
		expect(codes("M83\nG1 Z324 E1 F600", p)).toContain("PRINT_BOUNDS");
	});
	it("keeps unmapped dual-nozzle jobs uncertain but can enforce explicit heater limits", () => {
		const p = createPrinterProfile("bambu-h2c");
		const r = analyze("M104 S300\nM83\nG1 X100 E1 F600", { ...initial, printer: p });
		expect(r.constraints).toBe("unknown");
		expect(r.temperatures).toEqual({});
		expect(codes("M104 T0 S351", p)).toContain("TEMPERATURE_LIMIT");
	});
	it("shares AMS/MMU targets but keeps XL target registers independent", () => {
		for (const p of [
			createPrinterProfile("prusa-mk4s", { multiMaterial: "mmu3" }),
			createPrinterProfile("bambu-a1", { materialTools: { 0: 0, 3: 0 } }),
		]) {
			const r = analyze("M104 S200\nT3\nM104 S230", { printer: p });
			expect(Object.keys(r.temperatures)).toEqual(["hotend"]);
			expect(r.temperatures.hotend?.finalTarget).toBe(230);
		}
		const xl = createPrinterProfile("prusa-xl", { toolCount: 5, materialTools: { 0: 4, 1: 2 } });
		const r = analyze("M104 T0 S200\nM104 T1 S230", { printer: xl });
		expect(r.temperatures["hotend:4"]?.finalTarget).toBe(200);
		expect(r.temperatures["hotend:2"]?.finalTarget).toBe(230);
	});
	it.each([
		["bambu-x1", 300],
		["bambu-x1-carbon", 300],
		["bambu-x1e", 320],
	] as const)("requires voltage to apply the bed cap: %s", (id, hotend) => {
		expect(createPrinterProfile(id).maxBedTemperature).toBeUndefined();
		for (const [supplyVoltage, max] of [
			[110, 120],
			[220, 110],
		] as const) {
			const p = createPrinterProfile(id, { supplyVoltage });
			expect(codes(`M140 S${max + 1}`, p)).toContain("TEMPERATURE_LIMIT");
			expect(codes(`M104 S${hotend + 1}`, p)).toContain("TEMPERATURE_LIMIT");
		}
	});
	it("distinguishes published toolhead speed from slicer planner defaults", () => {
		expect(codes("G1 X100 F36060", createPrinterProfile("bambu-p2s"))).toContain(
			"TOOLHEAD_SPEED_LIMIT",
		);
		expect(codes("G1 X100 F36060", createPrinterProfile("bambu-h2s"))).not.toContain(
			"TOOLHEAD_SPEED_LIMIT",
		);
	});
	it("respects HT90's circular bed, head choice and chamber", () => {
		const hf = createPrinterProfile("prusa-ht90-high-flow");
		const ht = createPrinterProfile("prusa-ht90-high-temperature");
		expect(codes("M83\nG1 X140 Y140 E1 F600", hf)).toContain("PRINT_CIRCLE");
		expect(codes("M104 S450", hf)).toContain("TEMPERATURE_LIMIT");
		expect(codes("M104 S450", ht)).not.toContain("TEMPERATURE_LIMIT");
		expect(codes("M141 S91", ht)).toContain("TEMPERATURE_LIMIT");
		expect(codes("M140 S156", ht)).toContain("TEMPERATURE_LIMIT");
		expect(codes("M83\nG1 Z401 E1 F600", ht)).toContain("PRINT_BOUNDS");
	});
	it("retains legacy XY origins, glass clips and calibrated filament diameter without invented Z/thermal limits", () => {
		const mk1 = createPrinterProfile("prusa-mk1");
		const old = createPrinterProfile("prusa-i3-3mm");
		expect(old.tools![0]!.filamentDiameter).toBe(2.9);
		expect(old.printBounds).toBeUndefined();
		expect(old.maxBedTemperature).toBeUndefined();
		expect(codes("M83\nG1 Y2 E1 F600", old)).toContain("PRINT_AREA");
		expect(codes("M83\nG1 X201 E1 F600", mk1)).toContain("PRINT_AREA");
		expect(codes("M83\nG1 X20 Y2 E1 F600", mk1)).toContain("EXCLUSION");
	});
	it.each([
		["prusa-xl", "T5"],
		["prusa-core-one-indx", "T8"],
		["bambu-a1", "T255"],
	])("treats reserved park commands as unmodeled, not nonexistent print tools", (id, command) => {
		const r = analyze(command, { printer: createPrinterProfile(id!) });
		expect(r.validity).toBe("unknown");
		expect(r.diagnostics.map((d) => d.code)).not.toContain("UNKNOWN_TOOL");
	});
});

describe("printable XY polygons", () => {
	const polygon = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 6, y: 10 },
		{ x: 6, y: 2 },
		{ x: 4, y: 2 },
		{ x: 4, y: 10 },
		{ x: 0, y: 10 },
	];
	it("detects interior crossings of concave beds with line and helical arc paths", () => {
		expect(
			containsPathInPolygon(polygon, {
				kind: "line",
				start: { x: 2, y: 5, z: 0 },
				end: { x: 8, y: 5, z: 0 },
			}),
		).toBe(false);
		expect(
			containsPathInPolygon(
				polygon,
				createArc({ x: 2, y: 5, z: 0 }, { x: 8, y: 5, z: 1 }, true, { i: 3 }),
			),
		).toBe(false);
		expect(
			containsPathInPolygon(polygon, {
				kind: "line",
				start: { x: 0, y: 0, z: 0 },
				end: { x: 10, y: 0, z: 20 },
			}),
		).toBe(true);
	});
	it("checks known endpoints when Z is unknown and validates malformed polygons", () => {
		const printer = { name: "polygon", printArea: polygon };
		expect(analyze("M83\nG1 X5 Y5 E1 F600", { printer }).diagnostics.map((d) => d.code)).toContain(
			"PRINT_AREA",
		);
		expect(codes("M83\nG1 X20 E1 F600", printer)).toContain("PRINT_AREA");
		expect(() => validatePrinterProfile({ name: "bad", printArea: [{ x: 0, y: 0 }] })).toThrow();
		expect(() => validatePrinterProfile({ name: "bad", parkTool: -1 })).toThrow();
	});
});
