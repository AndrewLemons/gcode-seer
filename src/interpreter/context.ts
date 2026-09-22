import type { AnalysisEvent, Command, DiagnosticCategory } from "../types.js";

/** Collect source-aware diagnostics and invalidate state when a command cannot be modeled. */
export function createCommandContext(command: Command, invalidate: () => void) {
	const events: AnalysisEvent[] = [];
	const { code, params: p, line } = command;
	const diagnostic = (
		id: string,
		message: string,
		category: DiagnosticCategory = "coverage",
		severity: "warning" | "error" | "info" = "warning",
	): void => {
		events.push({
			type: "diagnostic",
			diagnostic: {
				code: id,
				message,
				category,
				severity,
				line,
				command: code,
			},
		});
	};
	const invalid = (message: string): AnalysisEvent[] => {
		diagnostic("INVALID_COMMAND", message, "semantic", "error");
		invalidate();
		return events;
	};
	const unsupported = (message: string): AnalysisEvent[] => {
		diagnostic("UNSUPPORTED_COMMAND", message);
		invalidate();
		return events;
	};
	const has = (key: string): boolean => Object.hasOwn(p, key);
	const value = (key: string): number | undefined => p[key] ?? undefined;
	const validate = (allowed: string, flags = ""): boolean => {
		for (const key of Object.keys(p)) {
			if (!allowed.includes(key)) {
				diagnostic("UNSUPPORTED_PARAMETER", `${code} parameter ${key} is not modeled.`);
				invalidate();
				return false;
			}
			if (p[key] === null && !flags.includes(key)) {
				diagnostic("MISSING_VALUE", `${key} requires a numeric value.`, "semantic", "error");
				invalidate();
				return false;
			}
		}
		return true;
	};
	return { events, diagnostic, invalid, unsupported, has, value, validate };
}

export type CommandContext = ReturnType<typeof createCommandContext>;
