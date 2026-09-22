import { createCommandContext } from "./interpreter/context.js";
import { MachineState } from "./interpreter/state.js";
import { commandHandlers } from "./interpreter/commands/registry.js";
import { toolsCommands } from "./interpreter/commands/tools.js";
import type { AnalysisEvent, AnalyzeOptions, Command, Position, Dialect } from "./types.js";

/** One analysis owns one machine state; dispatch is independent of printer identity. */
export class Interpreter {
	private readonly state: MachineState;
	constructor(private readonly options: AnalyzeOptions = {}) {
		this.state = new MachineState(options);
	}
	get finalPosition(): Position {
		return this.state.finalPosition;
	}
	get dialect(): Dialect {
		return this.state.dialect;
	}
	invalidate(): void {
		this.state.invalidate();
	}
	process(command: Command): AnalysisEvent[] {
		for (const adapter of this.options.adapters ?? []) {
			const translated = adapter.translate(command);
			if (translated !== undefined) {
				return translated.flatMap((c) => this.execute({ ...c, line: command.line }));
			}
		}
		return this.execute(command);
	}
	private execute(command: Command): AnalysisEvent[] {
		const state = this.state;
		const context = createCommandContext(command, () => state.invalidate());
		const { code } = command;
		if (state.suspended || state.dialect.passiveCommands.includes(code)) {
			return context.events;
		}
		if (
			["M622", "M623", "M808", "M98", "M99", "M32", "M24"].includes(code) ||
			code.startsWith("IF") ||
			code.startsWith("WHILE")
		) {
			state.suspended = true;
			return context.unsupported(
				"Execution depends on unmodeled control flow. Interpretation stops here; syntax checking continues.",
			);
		}
		const handler = /^T\d+$/.test(code) ? toolsCommands[0] : commandHandlers.get(code);
		return handler
			? handler.execute(state, command, context)
			: context.unsupported(`${code} has no registered interpretation.`);
	}
}
