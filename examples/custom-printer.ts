import {
	analyze,
	createPrinterCatalog,
	marlinDialect,
	type PrinterDefinition,
} from "../src/index.js";

// Illustrative hardware; replace dimensions and sources with verified machine data.
const definition: PrinterDefinition = {
	id: "workshop-cartesian",
	name: "Workshop Cartesian",
	manufacturer: "Workshop",
	reviewedAt: "2026-09-22",
	sources: [],
	notes: ["Example configuration."],
	dialect: { ...marlinDialect, name: "workshop-firmware" },
	toolCounts: [1],
	size: [200, 200, 200],
	filamentDiameter: 1.75,
};
const catalog = createPrinterCatalog([definition]);
const printer = catalog.createPrinterProfile(definition.id);
const report = analyze("G21\nG90\nM83\nG1 X10 E1 F600", {
	printer,
	initialPosition: { x: 0, y: 0, z: 0 },
});
console.log(report.distance, report.constraints);
