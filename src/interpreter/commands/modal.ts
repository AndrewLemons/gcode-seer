import type { CommandHandler } from "./types.js";
export const modalCommands: readonly CommandHandler[] = [
	{
		codes: ["G20", "G21", "G90", "G91", "M82", "M83", "G17"],
		execute(state, command, context) {
			const { events, invalid, validate } = context;
			const { code } = command;

			if (code === "G20" && state.dialect.inchUnits === false) {
				return invalid("This dialect does not support inch units.");
			}

			if (!validate("")) {
				return events;
			}
			if (code === "G20" || code === "G21") {
				state.unit = code === "G20" ? 25.4 : 1;
			} else if (code === "G17") {
				state.plane = code;
			} else if (code === "G90" || code === "G91") {
				state.absolute = code === "G90";
				if (state.dialect.extrusionMode === "marlin") {
					state.extruderAbsolute = state.absolute;
				}
			} else {
				state.extruderAbsolute = code === "M82";
			}
			return events;
		},
	},
	{
		codes: ["G18", "G19"],
		execute(state, command, context) {
			const { events, validate } = context;
			const { code } = command;

			if (!validate("")) {
				return events;
			}
			state.plane = code;
			return events;
		},
	},
];
