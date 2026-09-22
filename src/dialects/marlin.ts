import type { Dialect } from "../contracts/dialect.js";
import { passiveCommands } from "./common.js";

export const marlinDialect: Dialect = Object.freeze({
	name: "marlin",
	extrusionMode: "marlin",
	extrusionRegisters: "shared",
	toolChange: "unmodeled",
	passiveCommands,
});
