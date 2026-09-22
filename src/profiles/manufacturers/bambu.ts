import { commonNotes, reviewedAt } from "../notes.js";
import type { PrinterDefinition, Size } from "../types.js";
import { bounds, rectangle } from "../geometry.js";
type Definition = PrinterDefinition;
import { bambuDialect } from "../../dialects.js";
import { bblSource } from "./sources.js";
export const bambuDefinitions: PrinterDefinition[] = [];
const definitions = bambuDefinitions;

const frontExclusion: Partial<PrinterDefinition> = {
	exclusions: [{ id: "bed-exclusion", polygon: rectangle(0, 0, 18, 28), appliesTo: "extrusion" }],
	geometryNotes: [
		"Default slicer printable height is 250 mm, with a front-left deposition exclusion; advertised height is 256 mm.",
	],
};
function dualExtruders(width: number): Partial<PrinterDefinition> {
	return {
		materialMapping: "explicit",
		extruders: [
			{ heater: "left", selector: 1, printBounds: bounds([325, 320, 320]) },
			{ heater: "right", selector: 0, printBounds: bounds([width, 320, 325], [25, 0, 0]) },
		],
		multipleExtruderBounds: bounds([width, 320, 320]),
		multipleExtruderNotes: [
			"Jobs using both physical extruders are limited to 320 mm Z by the reviewed per-extruder reach.",
		],
	};
}

function bambu(
	id: string,
	name: string,
	size: Size,
	nozzle: number,
	bed: number | undefined,
	source: string,
	options: Partial<Definition> = {},
): void {
	definitions.push({
		id: `bambu-${id}`,
		name: `Bambu Lab ${name}`,
		manufacturer: "Bambu Lab",
		size,
		nozzle,
		...(bed !== undefined ? { bed } : {}),
		speed: 500,
		dialect: bambuDialect,
		toolCounts: [1],
		heaterSelection: "physical",
		filamentDiameter: 1.75,
		sources: [bblSource, source],
		reviewedAt,

		voltageNotes: {
			configured: "X1-series bed limit configured for {voltage} V supply.",
			missing:
				"X1-series supply voltage is unspecified, so the voltage-dependent bed temperature limit is unconfigured.",
		},
		mappingNotes: [
			"Material T IDs are unassigned. Supply materialTools to check per-nozzle bounds and implicit temperatures; physical heater T1 selects left/main, T0 right/auxiliary.",
		],
		...options,
		notes: [...commonNotes, ...(options.notes ?? [])],
	});
}
const x1Spec =
	"https://cdn1.bambulab.com/documentation/Quick%20Start%20Guide%20for%20X1%20Combo%26X1-Carbon%20Combo-v1.pdf";
bambu(
	"a1-mini",
	"A1 mini",
	[180, 180, 180],
	300,
	80,
	"https://us.store.bambulab.com/products/a1-mini",
);
bambu(
	"a1",
	"A1",
	[256, 256, 256],
	300,
	100,
	"https://cdn1.bambulab.com/documentation/quick-start-a75adcb1d5d5e/Quick%20Start%20Guide%20for%20A1.pdf",
);
bambu("a2l", "A2L", [330, 320, 325], 300, 80, "https://bambulab.cn/zh-cn/a2l/specs");
bambu(
	"p1p",
	"P1P",
	[256, 256, 250],
	300,
	100,
	"https://public-cdn.bambulab.com/store/bambulab-P1P-tech-specs.pdf",
	{ ...frontExclusion },
);
bambu(
	"p1s",
	"P1S",
	[256, 256, 250],
	300,
	100,
	"https://us.store.bambulab.com/collections/3d-printer/products/p1s",
	{ ...frontExclusion },
);
bambu("p2s", "P2S", [256, 256, 256], 300, 110, "https://bambulab.cn/zh-cn/p2s/specs", {
	speed: 600,
	notes: [
		"The published 600 mm/s toolhead limit differs from the slicer's 1000 mm/s axis planner defaults.",
	],
});
bambu("x1", "X1", [256, 256, 250], 300, undefined, x1Spec, {
	...frontExclusion,
	bedTemperatures: { 110: 120, 220: 110 },
});
bambu("x1-carbon", "X1 Carbon", [256, 256, 250], 300, undefined, x1Spec, {
	...frontExclusion,
	bedTemperatures: { 110: 120, 220: 110 },
});
bambu(
	"x1e",
	"X1E",
	[256, 256, 250],
	320,
	undefined,
	"https://cdn1.bambulab.com/x1e/spec/bambu-lab-x1e-tech-specs-cn.pdf",
	{ ...frontExclusion, bedTemperatures: { 110: 120, 220: 110 }, chamber: 60 },
);
bambu("h2s", "H2S", [340, 320, 340], 350, 120, "https://bambulab.cn/zh-cn/series/h2", {
	speed: 1000,
	chamber: 65,
});
bambu("h2d", "H2D", [350, 320, 325], 350, 120, "https://bambulab.cn/zh-cn/h2d/tech-specs", {
	speed: 1000,
	chamber: 65,
	...dualExtruders(350),
	toolCounts: [2],
});
bambu(
	"h2d-pro",
	"H2D Pro",
	[350, 320, 325],
	350,
	120,
	"https://bambulab.cn/zh-cn/h2d-pro/tech-specs",
	{ speed: 1000, chamber: 65, ...dualExtruders(350), toolCounts: [2] },
);
bambu(
	"h2c",
	"H2C",
	[330, 320, 325],
	350,
	120,
	"https://blog.bambulab.com/bambu-lab-h2c-where-multi-material-vortek-system-meets-engineering-precision/",
	{
		speed: 1000,
		chamber: 65,
		...dualExtruders(330),
		toolCounts: [2],
		notes: [
			"Six exchangeable Vortek hotends on the right are not six independent carriages. Hotend exchange and H selectors remain unmodeled.",
			"Slicer per-extruder heights (320/325 mm) take precedence over the launch article's 325 mm dual height.",
		],
	},
);
bambu("x2d", "X2D", [256, 256, 260], 300, 120, "https://bambulab.cn/zh-cn/x2d/specs", {
	speed: 1000,
	chamber: 65,
	extruders: [
		{ heater: "main", selector: 1, printBounds: bounds([256, 256, 260]) },
		{ heater: "auxiliary", selector: 0, printBounds: bounds([256, 256, 256], [20.5, 0, 0]) },
	],
	materialMapping: "explicit",
	toolCounts: [2],
	notes: [
		"Published main-nozzle height is 260 mm; the reviewed slicer says 261 mm. This preset uses 260 mm.",
	],
});
