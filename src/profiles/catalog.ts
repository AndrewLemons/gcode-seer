import { validateDefinition } from "./definition-validation.js";
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
		validateDefinition(snapshot);
		if (snapshot.unsupported === undefined) {
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
