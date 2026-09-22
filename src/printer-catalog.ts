import { bambuExclusion, validatePrinterProfile } from "./profiles.js";
import {
	commonNotes,
	definitions,
	reviewedAt,
	type Definition,
	type Size,
} from "./printer-data.js";
import type {
	Box,
	MultiMaterialUpgrade,
	PrinterProfile,
	ProfileProvenance,
	ToolProfile,
} from "./types.js";

export interface PrinterProfileInfo extends ProfileProvenance {
	name: string;
	/** Resin printers are discoverable but cannot create an extrusion G-code profile. */
	technology: "FFF" | "SLA";
	available: boolean;
	toolCounts: readonly number[];
	multiMaterialUpgrades: readonly MultiMaterialUpgrade[];
	/** A job-specific material-to-nozzle mapping is needed on these printers. */
	requiresToolMapping: boolean;
}

export interface PrinterProfileOptions {
	/** Installed physical tools on XL or INDX. Defaults to the smallest supported configuration. */
	toolCount?: number;
	/** A supported Prusa MMU upgrade; material tools share the single hotend. */
	multiMaterial?: MultiMaterialUpgrade;
	/** Map material T IDs to zero-based physical extruder indices. Bambu dual: 0=left/main, 1=right/auxiliary. */
	materialTools?: Readonly<Record<number, number>>;
	/** X1/X1 Carbon/X1E bed limits depend on the supply; omit to leave that limit unknown. */
	supplyVoltage?: 110 | 220;
}

function info(d: Definition): PrinterProfileInfo {
	return {
		id: d.id,
		name: d.name,
		manufacturer: d.manufacturer,
		reviewedAt,
		sources: [...d.sources],
		notes: [...commonNotes, ...d.notes],
		technology: d.unsupported ? "SLA" : "FFF",
		available: !d.unsupported,
		toolCounts: [...d.toolCounts],
		multiMaterialUpgrades: [...(d.mmu ?? [])],
		requiresToolMapping: !!d.bambuDual,
	};
}

/** Fresh catalog metadata on every call; no network access or mutable global presets. */
export function listPrinterProfiles(manufacturer?: "Bambu Lab" | "Prusa"): PrinterProfileInfo[] {
	return definitions
		.filter((d) => manufacturer === undefined || d.manufacturer === manufacturer)
		.map(info);
}

const bounds = (size: Size, min: Size = [0, 0, 0]): Box => ({
	min: { x: min[0], y: min[1], z: min[2] },
	max: { x: size[0], y: size[1], z: size[2] },
});

/** Create constraints for stock hardware, with explicit installed-tool and job configuration. */
export function createPrinterProfile(
	id: string,
	options: PrinterProfileOptions = {},
): PrinterProfile {
	const d = definitions.find((d) => d.id === id);
	if (!d) {
		throw new RangeError(`Unknown printer profile: ${id}. Use listPrinterProfiles().`);
	}
	if (d.unsupported) {
		throw new TypeError(`${d.name}: ${d.unsupported}`);
	}
	for (const key of Object.keys(options)) {
		if (!["toolCount", "multiMaterial", "materialTools", "supplyVoltage"].includes(key)) {
			throw new TypeError(`Unknown printer profile option: ${key}.`);
		}
	}
	const count = options.toolCount ?? d.toolCounts[0]!;
	if (!d.toolCounts.includes(count)) {
		throw new RangeError(`Invalid installed tool count for ${d.name}.`);
	}
	if (options.multiMaterial !== undefined && !d.mmu?.includes(options.multiMaterial)) {
		throw new RangeError(`Unsupported MMU upgrade for ${d.name}.`);
	}
	if (options.multiMaterial && options.materialTools) {
		throw new TypeError("Choose an MMU upgrade or a custom material mapping, not both.");
	}
	if (
		options.supplyVoltage !== undefined &&
		(!d.voltageDependentBed || ![110, 220].includes(options.supplyVoltage))
	) {
		throw new RangeError(
			"Supply voltage selection is only available for X1-series 110/220 V bed limits.",
		);
	}
	const provenance = info(d);
	const notes = [...provenance.notes];
	const p: PrinterProfile = {
		name: d.name,
		dialect: { ...d.dialect, passiveCommands: [...d.dialect.passiveCommands] },
		provenance: {
			id: d.id,
			manufacturer: d.manufacturer,
			reviewedAt,
			sources: [...d.sources],
			notes,
		},
	};
	if (d.size) {
		p.printBounds = bounds(d.size);
	}
	if (d.parkTool !== undefined) {
		p.parkTool = d.parkTool;
	}
	if (d.circle) {
		p.printCircle = { center: { x: 0, y: 0 }, radius: 150 };
		p.printBounds = bounds([150, 150, 400], [-150, -150, 0]);
	}
	if (d.exclusion) {
		p.exclusions = [bambuExclusion(["0x0", "18x0", "18x28", "0x28"])];
		notes.push(
			"Default slicer printable height is 250 mm, with a front-left deposition exclusion; advertised height is 256 mm.",
		);
	}
	if (d.bed !== undefined) {
		p.maxBedTemperature = d.bed;
	}
	if (d.chamber !== undefined) {
		p.maxChamberTemperature = d.chamber;
	}
	if (d.speed !== undefined) {
		p.maxToolheadSpeed = d.speed;
	}
	if (d.voltageDependentBed) {
		if (options.supplyVoltage !== undefined) {
			p.maxBedTemperature = options.supplyVoltage === 110 ? 120 : 110;
			notes.push(`X1-series bed limit configured for ${options.supplyVoltage} V supply.`);
		} else {
			notes.push(
				"X1-series supply voltage is unspecified, so the voltage-dependent bed temperature limit is unconfigured.",
			);
		}
	}
	const heaterNames = Array.from({ length: count }, (_, index) =>
		d.bambuDual
			? index === 0
				? d.bambuDual === "x2d"
					? "main"
					: "left"
				: d.bambuDual === "x2d"
					? "auxiliary"
					: "right"
			: count === 1
				? "hotend"
				: `hotend:${index}`,
	);
	p.heaters = heaterNames.map((id) => ({
		id,
		...(d.nozzle !== undefined ? { maxTemperature: d.nozzle } : {}),
	}));
	p.heaterTargets = Object.fromEntries(
		heaterNames.map((name, index) => [d.bambuDual ? 1 - index : index, name]),
	);
	let mapping: Readonly<Record<number, number>>;
	if (options.materialTools !== undefined) {
		mapping = options.materialTools;
	} else if (d.bambuDual) {
		mapping = {};
		p.requiresToolMapping = true;
		notes.push(
			"Material T IDs are unassigned. Supply materialTools to check per-nozzle bounds and implicit temperatures; physical heater T1 selects left/main, T0 right/auxiliary.",
		);
	} else {
		mapping = Object.fromEntries(
			Array.from(
				{ length: options.multiMaterial ? (options.multiMaterial === "mmu1" ? 4 : 5) : count },
				(_, index) => [index, options.multiMaterial ? 0 : index],
			),
		);
	}
	if (options.materialTools && Object.keys(mapping).length === 0) {
		throw new TypeError("materialTools must not be empty.");
	}
	const tools: ToolProfile[] = [];
	for (const [key, extruder] of Object.entries(mapping)) {
		if (
			!/^(0|[1-9]\d*)$/.test(key) ||
			Number(key) > 254 ||
			!Number.isInteger(extruder) ||
			extruder < 0 ||
			extruder >= count
		) {
			throw new RangeError(
				"Material IDs must be 0–254 and reference an installed physical extruder.",
			);
		}
		const tool: ToolProfile = {
			id: Number(key),
			heater: heaterNames[extruder]!,
			filamentDiameter: d.legacy === "3" ? 2.9 : 1.75,
			...(d.nozzle !== undefined ? { maxTemperature: d.nozzle } : {}),
		};
		if (d.bambuDual) {
			const x2 = d.bambuDual === "x2d";
			tool.printBounds =
				extruder === 0
					? bounds([x2 ? 256 : 325, x2 ? 256 : 320, x2 ? 260 : 320])
					: bounds([d.size![0], x2 ? 256 : 320, x2 ? 256 : 325], [x2 ? 20.5 : 25, 0, 0]);
		}
		tools.push(tool);
	}
	if (tools.length) {
		p.tools = tools;
	}
	if (d.manufacturer === "Prusa") {
		// Buddy resolves explicit temperature selectors through the job's tool mapping too.
		p.heaterTargets = Object.fromEntries(tools.map((tool) => [tool.id, tool.heater]));
	}
	if (d.bambuDual && d.bambuDual !== "x2d" && new Set(Object.values(mapping)).size > 1) {
		p.printBounds!.max.z = 320;
		notes.push(
			"Jobs using both physical extruders are limited to 320 mm Z by the reviewed per-extruder reach.",
		);
	}
	if (options.multiMaterial) {
		notes.push(
			`${options.multiMaterial.toUpperCase()} material slots share one heater; loading and unloading are not simulated.`,
		);
	}
	if (d.legacy) {
		const y = d.legacy === "3" ? 3 : 0;
		p.printArea = [
			{ x: 0, y },
			{ x: 200, y },
			{ x: 200, y: y + 200 },
			{ x: 0, y: y + 200 },
		];
	}
	if (d.legacy === "1.75") {
		p.travelBounds = bounds([214, 198, 201], [0, 0, 0.23]);
		p.exclusions = [
			[10, 0, 30, 5],
			[170, 0, 190, 5],
			[10, 195, 30, 200],
			[170, 195, 190, 200],
		].map(([x, y, x2, y2], i) =>
			bambuExclusion([`${x}x${y}`, `${x2}x${y}`, `${x2}x${y2}`, `${x}x${y2}`], {
				id: `glass-clip-${i}`,
			}),
		);
	}
	validatePrinterProfile(p);
	return p;
}
