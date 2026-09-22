import { box, nonnegative } from "../configuration/validation.js";
import type { PrinterDefinition } from "./types.js";

/** Validate capabilities that may not be exercised by a catalog's default configuration. */
export function validateDefinition(d: PrinterDefinition): void {
	if (!d.manufacturer || !d.reviewedAt) {
		throw new TypeError("Printer definitions require manufacturer and review metadata.");
	}
	if (d.unsupported !== undefined) {
		return;
	}
	if (!d.toolCounts.length || d.toolCounts.some((n) => !Number.isInteger(n) || n < 1 || n > 255)) {
		throw new TypeError("Tool counts must be integers between 1 and 255.");
	}
	if (
		Object.entries(d.upgrades ?? {}).some(
			([id, n]) => !id || !Number.isInteger(n) || n < 1 || n > 255,
		)
	) {
		throw new TypeError("Material upgrades require a name and 1 to 255 slots.");
	}
	if (d.materialMapping !== undefined && !["automatic", "explicit"].includes(d.materialMapping)) {
		throw new TypeError("Invalid material mapping mode.");
	}
	if (d.heaterSelection !== undefined && !["material", "physical"].includes(d.heaterSelection)) {
		throw new TypeError("Invalid heater selection mode.");
	}
	if (d.extruders) {
		if (d.extruders.length < Math.max(...d.toolCounts)) {
			throw new TypeError("Configure every supported physical extruder.");
		}
		const selectors = new Set<number>();
		for (const extruder of d.extruders) {
			if (
				!Number.isInteger(extruder.selector) ||
				extruder.selector < 0 ||
				extruder.selector > 255 ||
				selectors.has(extruder.selector)
			) {
				throw new TypeError("Physical heater selectors must be unique integers from 0 to 255.");
			}
			selectors.add(extruder.selector);
			if (extruder.printBounds) {
				box(extruder.printBounds, "extruder.printBounds");
			}
		}
	}
	if (d.multipleExtruderBounds) {
		box(d.multipleExtruderBounds, "multipleExtruderBounds");
	}
	if (d.filamentDiameter !== undefined) {
		nonnegative(d.filamentDiameter, "filamentDiameter");
		if (d.filamentDiameter === 0) {
			throw new TypeError("Filament diameter must be positive.");
		}
	}
	for (const [voltage, limit] of Object.entries(d.bedTemperatures ?? {})) {
		if (!Number.isFinite(Number(voltage)) || Number(voltage) <= 0) {
			throw new TypeError("Supply voltages must be positive numbers.");
		}
		nonnegative(limit, "bedTemperature");
	}
}
