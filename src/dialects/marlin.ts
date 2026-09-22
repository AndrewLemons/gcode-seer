import type { Dialect } from "../types.js";
import { passiveCommands } from "./common.js";

export const marlinDialect: Dialect = Object.freeze({
	name: "marlin",
	extrusionMode: "marlin",
	extrusionRegisters: "shared",
	toolChange: "unmodeled",
	passiveCommands,
});
