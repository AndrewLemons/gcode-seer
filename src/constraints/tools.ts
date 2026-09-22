import type { MoveEvent } from "../contracts/events.js";
import type { ConstraintContext } from "./context.js";

export function checkToolMapping(move: MoveEvent, context: ConstraintContext): void {
	const p = context.printer;
	const toolProfile = p?.tools?.find((t) => t.id === move.tool);
	if (p?.requiresToolMapping && !toolProfile) {
		context.diagnostic({
			code: "UNKNOWN_TOOL_MAPPING",
			line: move.line,
			category: "coverage",
			severity: "warning",
			message:
				"Supply this job's material-to-physical-extruder mapping to check tool-specific limits.",
		});
	}
}
