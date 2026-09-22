import type { Dialect } from "./types.js";

const passiveCommands = Object.freeze([
	"M73",
	"M105",
	"M106",
	"M107",
	"M110",
	"M114",
	"M115",
	"M117",
	"M118",
	"M119",
	"M300",
]);
export const marlinDialect: Dialect = Object.freeze({
	name: "marlin",
	extrusionMode: "marlin",
	extrusionRegisters: "shared",
	toolChange: "unmodeled",
	passiveCommands,
});
export const klipperDialect: Dialect = Object.freeze({
	name: "klipper",
	extrusionMode: "relative-override",
	extrusionRegisters: "shared",
	toolChange: "unmodeled",
	passiveCommands,
});
/** Bambu proprietary control flow and tool operations remain unsupported unless adapted. */
export const bambuDialect: Dialect = Object.freeze({
	name: "bambu",
	extrusionMode: "relative-override",
	extrusionRegisters: "shared",
	toolChange: "unmodeled",
	passiveCommands,
});

/** AVR 3.14.1: G90/G91 change XYZ without changing the independent E mode. */
export const prusaDialect: Dialect = Object.freeze({
	...marlinDialect,
	name: "prusa",
	extrusionMode: "independent",
});

/** MK1/MK2 firmware v3.2.3: global relative positioning OR the E-relative override. */
export const prusaLegacyDialect: Dialect = Object.freeze({
	...marlinDialect,
	name: "prusa-legacy",
	extrusionMode: "relative-override",
});

/** Buddy native mode. M862 compatibility switches remain unsupported and visible. */
export const prusaBuddyDialect: Dialect = Object.freeze({
	...marlinDialect,
	name: "prusa-buddy",
});
