import { bambuDialect } from "./dialects.js";
import type { AnalyzeOptions, Box, Dialect, Exclusion, Point2, PrinterProfile } from "./types.js";

function validateDialect(dialect: Dialect): void {
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

const finite = (value: number, name: string): void => {
	if (!Number.isFinite(value) || Math.abs(value) > 1e12) {
		throw new TypeError(`${name} must be finite and within ±1e12.`);
	}
};

const nonnegative = (value: number, name: string): void => {
	finite(value, name);
	if (value < 0) {
		throw new TypeError(`${name} cannot be negative.`);
	}
};

const box = (value: Box, name: string): void => {
	for (const axis of ["x", "y", "z"] as const) {
		finite(value.min[axis], `${name}.min.${axis}`);
		finite(value.max[axis], `${name}.max.${axis}`);
		if (value.min[axis] > value.max[axis]) {
			throw new TypeError(`${name} has inverted ${axis} limits.`);
		}
	}
};

function validatePolygon(polygon: readonly Point2[]): void {
	if (polygon.length < 3 || polygon.length > 10000) {
		throw new TypeError("Exclusions require 3 to 10000 vertices.");
	}
	for (const point of polygon) {
		finite(point.x, "polygon.x");
		finite(point.y, "polygon.y");
	}
	let area = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i]!;
		const b = polygon[(i + 1) % polygon.length]!;
		if (a.x === b.x && a.y === b.y) {
			throw new TypeError("Polygon edges cannot have zero length.");
		}
		area += a.x * b.y - a.y * b.x;
		for (let j = i + 2; j < polygon.length; j++) {
			if (i === 0 && j === polygon.length - 1) {
				continue;
			}
			const c = polygon[j]!;
			const d = polygon[(j + 1) % polygon.length]!;
			const orient = (p: Point2, q: Point2, r: Point2): number =>
				(q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
			const overlap =
				Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
					Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
				Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
					Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
			if (
				overlap &&
				orient(a, b, c) * orient(a, b, d) <= 0 &&
				orient(c, d, a) * orient(c, d, b) <= 0
			) {
				throw new TypeError("Exclusion polygons must not self-intersect.");
			}
		}
	}
	if (Math.abs(area) < 1e-10) {
		throw new TypeError("Exclusion polygon has no area.");
	}
}

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

/** Convert Bambu Studio's flat "XxY" array. Supply a resolved profile, after inheritance. */
export function bambuExclusion(
	points: readonly string[],
	options: {
		id?: string;
		minZ?: number;
		maxZ?: number;
		appliesTo?: "all" | "extrusion";
	} = {},
): Exclusion {
	const polygon = points.map((point) => {
		const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))x([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/.exec(
			point,
		);
		if (!match) {
			throw new TypeError(`Invalid Bambu exclusion point: ${point}`);
		}
		return { x: Number(match[1]), y: Number(match[2]) };
	});
	validatePolygon(polygon);
	return {
		id: options.id ?? "bed-exclusion",
		polygon,
		appliesTo: options.appliesTo ?? "extrusion",
		...(options.minZ !== undefined ? { minZ: options.minZ } : {}),
		...(options.maxZ !== undefined ? { maxZ: options.maxZ } : {}),
	};
}

/** Printable geometry only. This deliberately does not claim to describe the service travel envelope. */
export function createBambuX1CarbonPrintProfile(): PrinterProfile {
	return {
		name: "Bambu Lab X1 Carbon printable geometry",
		dialect: bambuDialect,
		printBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 256, y: 256, z: 250 } },
		exclusions: [bambuExclusion(["0x0", "18x0", "18x28", "0x28"])],
	};
}
