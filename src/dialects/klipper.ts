import type { Dialect } from "../types.js";
import { passiveCommands } from "./common.js";
export const klipperDialect: Dialect = Object.freeze({
	name: "klipper",
	inchUnits: false,
	extrusionMode: "relative-override",
	extrusionRegisters: "shared",
	toolChange: "unmodeled",
	passiveCommands,
});
