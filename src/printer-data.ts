import {
	bambuDialect,
	klipperDialect,
	prusaBuddyDialect,
	prusaDialect,
	prusaLegacyDialect,
} from "./dialects.js";
import type { Dialect, MultiMaterialUpgrade } from "./types.js";

export const reviewedAt = "2026-09-22";
const bblSource =
	"https://github.com/bambulab/BambuStudio/tree/f977235e6d736c4c0b650520ac5a5b72cbfe9244/resources/profiles/BBL/machine";
const prusaSource =
	"https://github.com/prusa3d/PrusaSlicer-settings-prusa-fff/blob/65c5c8f1e1c3836f306119c49d717759cbc368db/PrusaResearch/2.5.10.ini";
const buddySource =
	"https://github.com/prusa3d/Prusa-Firmware-Buddy/tree/1ce23f33ed3b94e26aa33a44557d6c4a4be11eb6/include/marlin";
const avrSource =
	"https://github.com/prusa3d/Prusa-Firmware/tree/f3e0dfd481a78b222d2a82752f261adbc5a2c4d7/Firmware";
const legacySource =
	"https://github.com/prusa3d/Prusa-Firmware/tree/61161b705e9a7a6f5ef5af4e52382987816e7995/Firmware";
const archivedSource =
	"https://github.com/prusa3d/PrusaSlicer-settings/tree/a40f669e7c3ff4dfe05a937fc08fc57993dcf0d5/old";
const prusaUpdates =
	"https://blog.prusa3d.com/better-prints-easier-use-prusa-xl-core-one-l-and-core-one-gen-2-our-big-product-update_137539/";
export const commonNotes = [
	"Printable geometry does not establish service travel or a homing endpoint.",
	"Firmware calibration, mesh compensation, tool-change trajectories and runtime branches are not simulated.",
	"No universal material flow limit is assumed. Speeds are requested tool-tip speeds, not measured motion.",
];

export type Size = readonly [x: number, y: number, z: number];
export interface Definition {
	id: string;
	name: string;
	manufacturer: "Bambu Lab" | "Prusa";
	sources: readonly string[];
	notes: readonly string[];
	size?: Size;
	nozzle?: number;
	bed?: number;
	chamber?: number;
	speed?: number;
	dialect: Dialect;
	toolCounts: readonly number[];
	parkTool?: number;
	mmu?: readonly MultiMaterialUpgrade[];
	bambuDual?: "h2d" | "h2c" | "x2d";
	exclusion?: boolean;
	voltageDependentBed?: boolean;
	circle?: boolean;
	legacy?: "1.75" | "3";
	unsupported?: string;
}

export const definitions: Definition[] = [];
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
		sources: [bblSource, source],
		notes: [],
		...options,
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
	{ exclusion: true },
);
bambu(
	"p1s",
	"P1S",
	[256, 256, 250],
	300,
	100,
	"https://us.store.bambulab.com/collections/3d-printer/products/p1s",
	{ exclusion: true },
);
bambu("p2s", "P2S", [256, 256, 256], 300, 110, "https://bambulab.cn/zh-cn/p2s/specs", {
	speed: 600,
	notes: [
		"The published 600 mm/s toolhead limit differs from the slicer's 1000 mm/s axis planner defaults.",
	],
});
bambu("x1", "X1", [256, 256, 250], 300, undefined, x1Spec, {
	exclusion: true,
	voltageDependentBed: true,
});
bambu("x1-carbon", "X1 Carbon", [256, 256, 250], 300, undefined, x1Spec, {
	exclusion: true,
	voltageDependentBed: true,
});
bambu(
	"x1e",
	"X1E",
	[256, 256, 250],
	320,
	undefined,
	"https://cdn1.bambulab.com/x1e/spec/bambu-lab-x1e-tech-specs-cn.pdf",
	{ exclusion: true, voltageDependentBed: true, chamber: 60 },
);
bambu("h2s", "H2S", [340, 320, 340], 350, 120, "https://bambulab.cn/zh-cn/series/h2", {
	speed: 1000,
	chamber: 65,
});
bambu("h2d", "H2D", [350, 320, 325], 350, 120, "https://bambulab.cn/zh-cn/h2d/tech-specs", {
	speed: 1000,
	chamber: 65,
	bambuDual: "h2d",
	toolCounts: [2],
});
bambu(
	"h2d-pro",
	"H2D Pro",
	[350, 320, 325],
	350,
	120,
	"https://bambulab.cn/zh-cn/h2d-pro/tech-specs",
	{ speed: 1000, chamber: 65, bambuDual: "h2d", toolCounts: [2] },
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
		bambuDual: "h2c",
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
	bambuDual: "x2d",
	toolCounts: [2],
	notes: [
		"Published main-nozzle height is 260 mm; the reviewed slicer says 261 mm. This preset uses 260 mm.",
	],
});

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
		sources: [prusaSource, buddySource],
		notes: [],
		...options,
	});
}
for (const [id, name] of [
	["mk2", "i3 MK2"],
	["mk2s", "i3 MK2S"],
] as const) {
	prusa(id, name, [250, 210, 200], 300, 120, {
		dialect: prusaLegacyDialect,
		mmu: ["mmu1"],
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
		mmu,
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
	prusa(id, name, [250, 210, z], 290, 120, { mmu: ["mmu3"] });
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
		mmu: ["mmu3"],
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
		mmu: ["mmu3"],
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
		circle: true,
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
		legacy,
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
		sources: [source],
		notes: [resinReason],
	});
}
