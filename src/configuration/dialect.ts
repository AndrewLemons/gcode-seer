import type { Dialect } from "../contracts/dialect.js";
export function validateDialect(dialect: Dialect): void {
	for (const key of [
		"inchUnits",
		"timedPlannerWait",
		"interactivePlannerWait",
		"chamberCooling",
		"strictHeaterSelectors",
	] as const) {
		if (dialect[key] !== undefined && typeof dialect[key] !== "boolean") {
			throw new TypeError(`Invalid dialect capability: ${key}.`);
		}
	}
	if (dialect.interactivePlannerWait && !dialect.timedPlannerWait) {
		throw new TypeError("Interactive planner waits require timed planner waits.");
	}
	if (
		dialect.reservedTools &&
		(!Array.isArray(dialect.reservedTools) ||
			dialect.reservedTools.some((id) => !Number.isInteger(id) || id < 0 || id > 255))
	) {
		throw new TypeError("Reserved tool IDs must be integers from 0 to 255.");
	}
	if (
		dialect.payloadCommands &&
		(!Array.isArray(dialect.payloadCommands) ||
			dialect.payloadCommands.some((code) => !/^[A-Z][A-Z0-9_.]*$/.test(code)))
	) {
		throw new TypeError("Payload commands must be uppercase command names.");
	}
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
