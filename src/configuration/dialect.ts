import type { Dialect } from "../types.js";
export function validateDialect(dialect: Dialect): void {
	if (
		!dialect.name ||
		!["marlin", "independent", "relative-override"].includes(dialect.extrusionMode) ||
		!["shared", "per-tool"].includes(dialect.extrusionRegisters) ||
		!["logical", "unmodeled"].includes(dialect.toolChange) ||
		!Array.isArray(dialect.passiveCommands) ||
		!dialect.passiveCommands.every(
			(command) => typeof command === "string" && command === command.toUpperCase(),
		)
	) {
		throw new TypeError("Invalid dialect configuration.");
	}
}
