import type { Dialect } from "../types.js";
import { passiveCommands } from "./common.js";
/** Bambu proprietary control flow and tool operations remain unsupported unless adapted. */
export const bambuDialect: Dialect = Object.freeze({
	name: "bambu",
	timedPlannerWait: true,
	interactivePlannerWait: true,
	reservedTools: Object.freeze([255]),
	strictHeaterSelectors: true,
	extrusionMode: "relative-override",
	extrusionRegisters: "shared",
	toolChange: "unmodeled",
	passiveCommands,
});
