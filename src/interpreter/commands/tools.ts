import type { CommandHandler } from "./types.js";
import { emptyPosition } from "../state.js";
export const toolsCommands: readonly CommandHandler[] = [
	{
		codes: ["T"],
		execute(state, command, context) {
			const { events, diagnostic, unsupported, validate } = context;
			const { code, line } = command;

			if (!validate("")) {
				return events;
			}
			const id = Number(code.slice(1));
			if (
				id > 255 ||
				id === state.options.printer?.parkTool ||
				state.dialect.reservedTools?.includes(id)
			) {
				return unsupported("Reserved or nonphysical tool selection requires a dialect adapter.");
			}
			if (state.options.printer?.tools && !state.options.printer.tools.some((t) => t.id === id)) {
				diagnostic(
					"UNKNOWN_TOOL",
					`Tool ${id} is absent from the printer profile.`,
					"constraint",
					"error",
				);
				state.tool = null;
				return events;
			}
			state.tool = id;
			events.push({ type: "tool", line, tool: id });
			if (state.dialect.toolChange === "unmodeled") {
				diagnostic(
					"TOOL_CHANGE_MOTION",
					"Tool selection is recorded, but parking, offsets and loading are not modeled.",
				);
				state.position = emptyPosition();
				state.offset = emptyPosition();
				state.extrusionRegisters.clear();
			}
			return events;
		},
	},
];
