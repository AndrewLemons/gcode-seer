import { buildPrinterProfile, profileInfo } from "./builder.js";
import type { PrinterDefinition, PrinterProfileOptions } from "./types.js";

/** An isolated catalog; custom makes use exactly the same builder as bundled printers. */
export function createPrinterCatalog(definitions: readonly PrinterDefinition[]) {
	const entries = new Map<string, PrinterDefinition>();
	for (const definition of definitions) {
		if (!definition.id || entries.has(definition.id)) {
			throw new TypeError(`Duplicate or empty printer ID: ${definition.id}.`);
		}
		const snapshot = structuredClone(definition);
		if (!snapshot.unsupported) {
			if (
				!snapshot.toolCounts.length ||
				snapshot.toolCounts.some((n) => !Number.isInteger(n) || n < 1 || n > 255)
			) {
				throw new TypeError("Tool counts must be integers between 1 and 255.");
			}
			if (
				Object.values(snapshot.upgrades ?? {}).some((n) => !Number.isInteger(n) || n < 1 || n > 255)
			) {
				throw new TypeError("Material slot counts must be integers between 1 and 255.");
			}
			if (snapshot.extruders && snapshot.extruders.length < Math.max(...snapshot.toolCounts)) {
				throw new TypeError("Configure every supported physical extruder.");
			}
			for (const toolCount of snapshot.toolCounts) {
				buildPrinterProfile(snapshot, { toolCount });
			}
		}
		entries.set(snapshot.id, snapshot);
	}
	return Object.freeze({
		listPrinterProfiles(manufacturer?: string) {
			return [...entries.values()]
				.filter((d) => manufacturer === undefined || d.manufacturer === manufacturer)
				.map(profileInfo);
		},
		createPrinterProfile(id: string, options: PrinterProfileOptions = {}) {
			const definition = entries.get(id);
			if (!definition) {
				throw new RangeError(`Unknown printer profile: ${id}. Use listPrinterProfiles().`);
			}
			return buildPrinterProfile(definition, options);
		},
	});
}
