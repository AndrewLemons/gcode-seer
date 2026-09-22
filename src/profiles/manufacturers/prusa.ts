import { commonNotes, reviewedAt } from "../notes.js";
import type { PrinterDefinition, Size } from "../types.js";
import { bounds, rectangle } from "../geometry.js";
type Definition = PrinterDefinition;
import {
	klipperDialect,
	prusaBuddyDialect,
	prusaDialect,
	prusaLegacyDialect,
} from "../../dialects.js";
import {
	prusaSource,
	buddySource,
	avrSource,
	legacySource,
	archivedSource,
	prusaUpdates,
} from "./sources.js";
export const prusaDefinitions: PrinterDefinition[] = [];
const definitions = prusaDefinitions;
function prusa(
	id: string,
	name: string,
	size: Size | undefined,
	nozzle: number | undefined,
	bed: number | undefined,
	options: Partial<Definition> = {},
): void {
	definitions.push({
		id: `prusa-${id}`,
		name: `Prusa ${name}`,
		manufacturer: "Prusa",
		...(size ? { size } : {}),
		...(nozzle !== undefined ? { nozzle } : {}),
		...(bed !== undefined ? { bed } : {}),
		dialect: prusaBuddyDialect,
		toolCounts: [1],
		heaterSelection: "material",
		filamentDiameter: 1.75,
		sources: [prusaSource, buddySource],
		reviewedAt,

		...options,
		notes: [...commonNotes, ...(options.notes ?? [])],
	});
}
for (const [id, name] of [
	["mk2", "i3 MK2"],
	["mk2s", "i3 MK2S"],
] as const) {
	prusa(id, name, [250, 210, 200], 300, 120, {
		dialect: prusaLegacyDialect,
		upgrades: { mmu1: 4 },
		sources: [prusaSource, legacySource],
		notes: [
			"Legacy v3.2.3 positioning semantics; 200 mm slicer height differs from 210 mm firmware travel.",
		],
	});
}
for (const [id, name, mmu] of [
	["mk2.5", "i3 MK2.5", ["mmu2"]],
	["mk2.5s", "i3 MK2.5S", ["mmu2s"]],
	["mk3", "i3 MK3", ["mmu2"]],
	["mk3s", "i3 MK3S", ["mmu2s", "mmu3"]],
	["mk3s-plus", "i3 MK3S+", ["mmu2s", "mmu3"]],
	["mk3s-plus-anniversary", "i3 MK3S+ 10th Anniversary", ["mmu2s", "mmu3"]],
] as const) {
	prusa(id, name, [250, 210, id.startsWith("mk2") ? 200 : 210], 300, 120, {
		dialect: prusaDialect,
		upgrades: Object.fromEntries(mmu.map((id) => [id, 5])),
		sources: [
			prusaSource,
			avrSource,
			"https://www.prusa3d.com/product/original-prusa-i3-mk3s-10th-anniversary-edition-3d-printer/",
		],
		notes: [
			"Uses AVR 3.14.1 independent E mode. Older firmware may need prusaLegacyDialect.",
			"The 300 °C nozzle rating is a hardware specification; firmware/UI versions may clamp targets lower.",
		],
	});
}
for (const [id, name, z] of [
	["mk3.5", "MK3.5", 210],
	["mk3.5s", "MK3.5S", 210],
	["mk3.9", "MK3.9", 220],
	["mk3.9s", "MK3.9S", 220],
	["mk4", "MK4", 220],
	["mk4s", "MK4S", 220],
] as const) {
	prusa(id, name, [250, 210, z], 290, 120, { upgrades: { mmu3: 5 } });
}
for (const [id, name] of [
	["mini", "MINI"],
	["mini-plus", "MINI+"],
] as const) {
	prusa(id, name, [180, 180, 180], 280, 100);
}
for (const [id, name] of [
	["xl", "XL"],
	["xl-plus", "XL+"],
	["xl-critical-infrastructure", "XL Critical Infrastructure"],
	["xl-plus-critical-infrastructure", "XL+ Critical Infrastructure"],
] as const) {
	prusa(id, name, [360, 360, 360], 290, 115, {
		toolCounts: [1, 2, 5],
		parkTool: 5,
		sources: [prusaSource, buddySource, prusaUpdates],
		notes: [
			"Independent toolhead heaters. T5 parks tools and is not a sixth print tool.",
			"The reviewed Buddy firmware accepts bed targets up to 115 °C (120 minus its 5 °C margin); some product pages advertise 120 °C.",
		],
	});
}
for (const [id, name] of [
	["core-one", "CORE One"],
	["core-one-plus", "CORE One+"],
	["core-one-plus-gen2", "CORE One+ (Gen 2)"],
	["signature-oak", "Signature Oak"],
] as const) {
	prusa(id, name, [250, 220, 270], 290, 120, {
		chamber: 55,
		upgrades: { mmu3: 5 },
		sources: [prusaSource, buddySource, prusaUpdates],
	});
}
const coreLSource = "https://www.prusa3d.com/product/prusa-core-one-l/";
for (const [id, name] of [
	["core-one-l", "CORE One L"],
	["core-one-l-plus", "CORE One L+"],
	["core-one-l-critical-infrastructure", "CORE One L Critical Infrastructure"],
	["core-one-l-plus-critical-infrastructure", "CORE One L+ Critical Infrastructure"],
] as const) {
	prusa(id, name, [300, 300, 330], 290, 120, {
		chamber: 60,
		upgrades: { mmu3: 5 },
		sources: [prusaSource, buddySource, coreLSource, prusaUpdates],
	});
}
for (const [id, name] of [
	["core-one-indx", "CORE One INDX"],
	["core-one-plus-indx", "CORE One+ INDX"],
	["core-one-plus-gen2-indx", "CORE One+ (Gen 2) INDX"],
] as const) {
	prusa(id, name, [248, 205, 270], 300, 120, {
		chamber: 55,
		toolCounts: [4, 8],
		parkTool: 8,
		sources: [
			prusaSource,
			buddySource,
			"https://www.prusa3d.com/en/product/prusa-core-one-gen-2-indx-8-tool/",
		],
		notes: [
			"INDX uses a shared induction Smart Head and passive exchangeable tools. Tool-specific target registers do not imply simultaneously heated parked tools.",
		],
	});
}
for (const [id, name] of [
	["core-one-l-indx", "CORE One L INDX"],
	["core-one-l-plus-indx", "CORE One L+ INDX"],
] as const) {
	prusa(id, name, [298, 275, 330], 300, 120, {
		chamber: 60,
		toolCounts: [4, 8],
		parkTool: 8,
		sources: ["https://www.prusa3d.com/en/product/prusa-core-one-l-indx-8-tool/", buddySource],
		notes: [
			"Published reduced print dimensions; not present in the reviewed PrusaSlicer 2.5.10 bundle. XY origin is assumed to be the native front-left origin; supply a custom profile for alternate offsets.",
			"Published Y size is 275 mm; reviewed development firmware uses Y_BED_SIZE 270 with configurable tool offsets. Installed firmware and calibration must be checked separately.",
			"INDX tool-specific target registers do not imply simultaneously heated parked tools.",
		],
	});
}
for (const [id, name, temp] of [
	["ht90-high-flow", "Pro HT90 High-Flow", 300],
	["ht90-high-temperature", "Pro HT90 High-Temperature", 500],
] as const) {
	prusa(id, name, [300, 300, 400], temp, 155, {
		dialect: klipperDialect,
		printCircle: { center: { x: 0, y: 0 }, radius: 150 },
		printBounds: bounds([150, 150, 400], [-150, -150, 0]),
		chamber: 90,
		speed: 600,
		sources: [
			"https://www.prusa3d.com/product/prusa-pro-ht90/",
			"https://storage.googleapis.com/prusa3d-content-prod-14e8-preset-repo-api-public/prusa-pro-ht/prusa-pro-ht-offline.zip",
		],
		notes: [
			"Delta tool-tip coordinates use an origin-centered 150 mm radius. Tower motion, calibration and printer-specific Klipper macros remain unmodeled.",
			"The installed HT90 head is a configuration choice; these profiles do not simulate a head swap.",
			"PrusaProHT 1.1.17 confirms the centered origin and Klipper dialect. Its 150.1 mm polygon radius and 405 mm height exceed published dimensions; these profiles retain the published radius 150 and height 400.",
		],
	});
}
prusa("pro-afs", "Pro AFS print unit (iX)", [260, 260, 175], 290, 115, {
	sources: [
		"https://www.prusa3d.com/applications/prusa-pro-afs_236928/",
		buddySource,
		"https://storage.googleapis.com/prusa3d-content-prod-14e8-preset-repo-api-public/prusa-pro-afs/prusa-pro-afs-offline.zip",
	],
	notes: [
		"Describes one print unit using its native bed origin, not farm scheduling, sheet extraction, robotics or all nine printers.",
	],
});
for (const [id, name, legacy] of [
	["mk1", "i3 Plus / MK1 1.75 mm", "1.75"],
	["i3-3mm", "Original i3 3 mm", "3"],
] as const) {
	prusa(id, name, undefined, undefined, undefined, {
		dialect: prusaLegacyDialect,
		printArea: rectangle(0, legacy === "3" ? 3 : 0, 200, legacy === "3" ? 203 : 200),
		filamentDiameter: legacy === "3" ? 2.9 : 1.75,
		...(legacy === "1.75"
			? {
					travelBounds: bounds([214, 198, 201], [0, 0, 0.23]),
					exclusions: [
						[10, 0, 30, 5],
						[170, 0, 190, 5],
						[10, 195, 30, 200],
						[170, 195, 190, 200],
					].map(([x, y, x2, y2], i) => ({
						id: `glass-clip-${i}`,
						polygon: rectangle(x!, y!, x2!, y2!),
						appliesTo: "extrusion" as const,
					})),
				}
			: {}),
		sources: [
			archivedSource,
			legacySource,
			"https://www.prusa3d.com/downloads/manual/prusa3d_manual_175_en.pdf",
		],
		notes: [
			"Legacy profile: printable Z and thermal target limits are not independently verified and remain unconfigured.",
			legacy === "1.75"
				? "MK1 firmware travel limits are independent of the archived 200 mm square printable XY area. Clip exclusions conservatively round the archived polygon to whole millimeters."
				: "Only archived XY bed geometry is available; no complete printable box or service envelope is asserted. Filament diameter is the archived calibrated 2.9 mm, not an assumed 1.75 mm.",
		],
	});
}
const resinReason =
	"Resin layer/exposure archives are not extrusion G-code; this text analyzer cannot analyze them.";
for (const [id, name, source] of [
	[
		"sl1",
		"SL1",
		"https://help.prusa3d.com/article/creating-a-resin-calibration-object-sl1-sl1s_235292",
	],
	[
		"sl1s",
		"SL1S SPEED",
		"https://help.prusa3d.com/article/creating-a-resin-calibration-object-sl1-sl1s_235292",
	],
	["pro-slx", "Pro SLX", "https://www.prusa3d.com/applications/prusa-pro-slx_236051/"],
	["pro-medical-one", "Pro Medical One", "https://medical.prusa3d.com/"],
] as const) {
	prusa(id, name, undefined, undefined, undefined, {
		toolCounts: [],
		unsupported: resinReason,
		technology: "SLA",
		sources: [source],
		notes: [resinReason],
	});
}
