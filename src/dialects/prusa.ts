import type { Dialect } from "../types.js";
import { marlinDialect } from "./marlin.js";

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
	chamberCooling: true,
});
