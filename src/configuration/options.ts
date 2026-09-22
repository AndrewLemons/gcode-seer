import type { AnalyzeOptions } from "../contracts/analysis.js";
import { finite } from "./validation.js";
import { validateDialect } from "./dialect.js";
import { validatePrinterProfile } from "../profiles/validation.js";
export function validateOptions(options: AnalyzeOptions): void {
	if (options.dialect) {
		validateDialect(options.dialect);
	}
	for (const [key, value] of Object.entries(options.initialPosition ?? {})) {
		finite(value, `initialPosition.${key}`);
	}
	if (options.initialExtrusion !== undefined) {
		finite(options.initialExtrusion, "initialExtrusion");
	}
	if (options.initialFeedrate !== undefined) {
		finite(options.initialFeedrate, "initialFeedrate");
		if (options.initialFeedrate <= 0) {
			throw new TypeError("initialFeedrate must be positive.");
		}
	}
	for (const [name, value, min] of [
		["maxDiagnostics", options.maxDiagnostics, 0],
		["maxLineLength", options.maxLineLength, 1],
	] as const) {
		if (value !== undefined && (!Number.isSafeInteger(value) || value < min)) {
			throw new TypeError(`${name} must be an integer >= ${min}.`);
		}
	}
	if (options.printer) {
		validatePrinterProfile(options.printer);
	}
}
