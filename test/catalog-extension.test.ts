import { describe, expect, test } from "bun:test";
import {
	analyze,
	createPrinterCatalog,
	listPrinterProfiles,
	marlinDialect,
	type PrinterDefinition,
} from "../src/index.js";

const definition = (): PrinterDefinition => ({
	id: "example-printer",
	name: "Example Printer",
	manufacturer: "Example Works",
	reviewedAt: "2026-09-22",
	sources: [],
	notes: ["Test hardware."],
	dialect: { ...marlinDialect, toolChange: "logical" },
	toolCounts: [1, 2],
	size: [100, 120, 140],
	nozzle: 250,
	filamentDiameter: 1.75,
	heaterSelection: "material",
	upgrades: { feeder: 3 },
	bedTemperatures: { 48: 90 },
});

describe("extensible printer catalogs", () => {
	test("builds another make and arbitrary upgrades and supply voltages", () => {
		const catalog = createPrinterCatalog([definition()]);
		expect(catalog.listPrinterProfiles("Example Works")[0]?.multiMaterialUpgrades).toEqual([
			"feeder",
		]);
		expect(catalog.listPrinterProfiles("Other")).toEqual([]);
		const profile = catalog.createPrinterProfile("example-printer", {
			multiMaterial: "feeder",
			supplyVoltage: 48,
		});
		expect(profile.tools?.map((t) => t.heater)).toEqual(["hotend", "hotend", "hotend"]);
		expect(profile.heaterTargets).toEqual({ 0: "hotend", 1: "hotend", 2: "hotend" });
		const report = analyze("M104 T2 S260\nM140 S100", { printer: profile });
		expect(report.constraints).toBe("violated");
		expect(report.temperatures.hotend?.finalTarget).toBe(260);
		expect(listPrinterProfiles("Example Works")).toEqual([]);
	});

	test("explicit physical mappings work independently of manufacturer", () => {
		const d = definition();
		d.toolCounts = [2];
		d.materialMapping = "explicit";
		d.heaterSelection = "physical";
		d.extruders = [
			{ heater: "primary", selector: 9 },
			{ heater: "secondary", selector: 8 },
		];
		const catalog = createPrinterCatalog([d]);
		expect(catalog.createPrinterProfile(d.id).requiresToolMapping).toBe(true);
		const profile = catalog.createPrinterProfile(d.id, { materialTools: { 3: 1 } });
		expect(profile.tools?.[0]?.heater).toBe("secondary");
		expect(profile.heaterTargets).toEqual({ 9: "primary", 8: "secondary" });
	});

	test("snapshots input and returns independent nested configuration", () => {
		const d = definition();
		const catalog = createPrinterCatalog([d]);
		d.name = "Changed";
		d.size = [1, 1, 1];
		const profile = catalog.createPrinterProfile(d.id);
		profile.printBounds!.max.x = -1;
		(catalog.listPrinterProfiles()[0]!.notes as string[]).push("Changed");
		expect(catalog.createPrinterProfile(d.id).printBounds!.max.x).toBe(100);
		expect(catalog.listPrinterProfiles()[0]!.name).toBe("Example Printer");
		expect(catalog.listPrinterProfiles()[0]!.notes).toEqual(["Test hardware."]);
	});

	test("rejects ambiguous IDs and invalid hardware configurations", () => {
		expect(() => createPrinterCatalog([definition(), definition()])).toThrow();
		for (const patch of [
			{ toolCounts: [] },
			{ toolCounts: [0] },
			{ upgrades: { feeder: 0 } },
			{ extruders: [] },
		]) {
			expect(() => createPrinterCatalog([{ ...definition(), ...patch }])).toThrow();
		}
	});

	test("unsupported technologies are metadata with an explicit creation error", () => {
		const d = { ...definition(), technology: "other", unsupported: "Needs another input adapter." };
		const catalog = createPrinterCatalog([d]);
		expect(catalog.listPrinterProfiles()[0]!.available).toBe(false);
		expect(() => catalog.createPrinterProfile(d.id)).toThrow("Needs another input adapter");
	});
});

test("custom dialects are validated when a catalog is created", () => {
	const d = definition();
	d.dialect = { ...d.dialect, passiveCommands: ["lowercase"] };
	expect(() => createPrinterCatalog([d])).toThrow("Invalid dialect configuration");
});
