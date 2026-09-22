import type { PrinterProfile } from "../contracts/printer.js";
import { finite, nonnegative, box, validatePolygon } from "../configuration/validation.js";
import { validateDialect } from "../configuration/dialect.js";
export function validatePrinterProfile(profile: PrinterProfile): void {
	if (!profile.name || typeof profile.name !== "string") {
		throw new TypeError("A printer profile requires a name.");
	}
	if (profile.dialect) {
		validateDialect(profile.dialect);
	}
	if (profile.travelBounds) {
		box(profile.travelBounds, "travelBounds");
	}
	if (profile.printBounds) {
		box(profile.printBounds, "printBounds");
	}
	if (profile.printCircle) {
		finite(profile.printCircle.center.x, "printCircle.center.x");
		finite(profile.printCircle.center.y, "printCircle.center.y");
		nonnegative(profile.printCircle.radius, "printCircle.radius");
		if (profile.printCircle.radius === 0) {
			throw new TypeError("Printable circle radius must be positive.");
		}
	}
	if (profile.printArea) {
		validatePolygon(profile.printArea);
	}
	if (
		profile.parkTool !== undefined &&
		(!Number.isInteger(profile.parkTool) ||
			profile.parkTool < 0 ||
			profile.parkTool > 255 ||
			profile.tools?.some((t) => t.id === profile.parkTool))
	) {
		throw new TypeError("parkTool must be a non-printing integer selector from 0 to 255.");
	}
	if (profile.maxToolheadSpeed !== undefined) {
		nonnegative(profile.maxToolheadSpeed, "maxToolheadSpeed");
	}
	if (
		profile.requiresToolMapping !== undefined &&
		typeof profile.requiresToolMapping !== "boolean"
	) {
		throw new TypeError("requiresToolMapping must be a boolean.");
	}
	const heaterIds = new Set<string>();
	for (const heater of profile.heaters ?? []) {
		if (!heater.id || ["bed", "chamber"].includes(heater.id) || heaterIds.has(heater.id)) {
			throw new TypeError("Hotend heater IDs must be nonempty, unique and not bed or chamber.");
		}
		heaterIds.add(heater.id);
		if (heater.maxTemperature !== undefined) {
			nonnegative(heater.maxTemperature, "heater.maxTemperature");
		}
	}
	for (const [key, value] of Object.entries(profile.homePosition ?? {})) {
		finite(value, `homePosition.${key}`);
	}
	for (const [key, value] of Object.entries(profile.maxSpeed ?? {})) {
		nonnegative(value, `maxSpeed.${key}`);
	}
	if (profile.maxBedTemperature !== undefined) {
		nonnegative(profile.maxBedTemperature, "maxBedTemperature");
	}
	if (profile.maxChamberTemperature !== undefined) {
		nonnegative(profile.maxChamberTemperature, "maxChamberTemperature");
	}
	const ids = new Set<string>();
	for (const zone of profile.exclusions ?? []) {
		if (!zone.id || ids.has(zone.id)) {
			throw new TypeError("Exclusion IDs must be nonempty and unique.");
		}
		ids.add(zone.id);
		validatePolygon(zone.polygon);
		if (zone.minZ !== undefined) {
			finite(zone.minZ, "minZ");
		}
		if (zone.maxZ !== undefined) {
			finite(zone.maxZ, "maxZ");
		}
		if ((zone.minZ ?? -Infinity) > (zone.maxZ ?? Infinity)) {
			throw new TypeError("Exclusion Z limits are inverted.");
		}
		if (!["all", "extrusion"].includes(zone.appliesTo)) {
			throw new TypeError("Invalid exclusion scope.");
		}
	}
	for (const [id, heater] of Object.entries(profile.heaterTargets ?? {})) {
		if (
			!/^\d+$/.test(id) ||
			Number(id) > 255 ||
			(!heaterIds.has(heater) && !profile.tools?.some((t) => t.heater === heater))
		) {
			throw new TypeError("Heater selectors must map IDs 0 to 255 to configured tool heaters.");
		}
	}
	const tools = new Set<number>();
	for (const tool of profile.tools ?? []) {
		if (!Number.isInteger(tool.id) || tool.id < 0 || tool.id > 255 || tools.has(tool.id)) {
			throw new TypeError("Tool IDs must be unique integers between 0 and 255.");
		}
		if (!tool.heater || ["bed", "chamber"].includes(tool.heater)) {
			throw new TypeError("Tool heaters must have nonempty names other than bed or chamber.");
		}
		tools.add(tool.id);
		if (profile.heaters && !heaterIds.has(tool.heater)) {
			throw new TypeError("Tool heater must reference a configured physical heater.");
		}
		if (tool.travelBounds) {
			box(tool.travelBounds, "tool.travelBounds");
		}
		if (tool.printBounds) {
			box(tool.printBounds, "tool.printBounds");
		}
		for (const [name, value] of Object.entries(tool)) {
			if (typeof value === "number") {
				nonnegative(value, `tool.${name}`);
			}
		}
		if (tool.filamentDiameter === 0) {
			throw new TypeError("Filament diameter must be positive.");
		}
		if (tool.maxVolumetricFlow !== undefined && tool.filamentDiameter === undefined) {
			throw new TypeError("A flow limit requires filamentDiameter.");
		}
		if (
			tool.minExtrusionTemperature !== undefined &&
			tool.maxTemperature !== undefined &&
			tool.minExtrusionTemperature > tool.maxTemperature
		) {
			throw new TypeError("Minimum extrusion temperature exceeds the heater maximum.");
		}
	}
}
