import type { AnalysisEvent } from "../../contracts/events.js";
import type { Command } from "../../contracts/syntax.js";
import type { CommandContext } from "../context.js";
import type { MachineState } from "../state.js";
/** Each handler owns validation and effects for a cohesive command family. */
export interface CommandHandler {
	codes: readonly string[];
	execute(state: MachineState, command: Command, context: CommandContext): AnalysisEvent[];
}
