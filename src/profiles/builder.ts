import type { PrinterProfile, ToolProfile } from "../types.js";
import { bounds } from "./geometry.js";
import { validatePrinterProfile } from "./validation.js";
import type { PrinterDefinition, PrinterProfileInfo, PrinterProfileOptions } from "./types.js";

export function profileInfo(d: PrinterDefinition): PrinterProfileInfo {
	return {
		id: d.id,
		name: d.name,
		manufacturer: d.manufacturer,
		reviewedAt: d.reviewedAt,
		sources: [...d.sources],
		notes: [...d.notes],
		technology: d.technology ?? "FFF",
		available: d.unsupported === undefined,
		toolCounts: [...d.toolCounts],
		multiMaterialUpgrades: Object.keys(d.upgrades ?? {}),
		requiresToolMapping: d.materialMapping === "explicit",
	};
}

/** Resolve hardware capabilities and job options into a fresh, validated analysis profile. */
export function buildPrinterProfile(
	d: PrinterDefinition,
	options: PrinterProfileOptions,
): PrinterProfile {
	if (d.unsupported !== undefined) {
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
	const upgrade = options.multiMaterial;
	if (upgrade !== undefined && !Object.hasOwn(d.upgrades ?? {}, upgrade)) {
		throw new RangeError(`Unsupported multi-material upgrade for ${d.name}.`);
	}
	if (upgrade !== undefined && options.materialTools !== undefined) {
		throw new TypeError("Choose a multi-material upgrade or a custom material mapping, not both.");
	}
	if (
		options.supplyVoltage !== undefined &&
		!Object.hasOwn(d.bedTemperatures ?? {}, options.supplyVoltage)
	) {
		throw new RangeError(`Unsupported supply voltage for ${d.name}.`);
	}
	const notes = [...d.notes, ...(d.geometryNotes ?? [])];
	const p: PrinterProfile = {
		name: d.name,
		dialect: structuredClone(d.dialect),
		provenance: {
			id: d.id,
			manufacturer: d.manufacturer,
			reviewedAt: d.reviewedAt,
			sources: [...d.sources],
			notes,
		},
	};
	if (d.size) {
		p.printBounds = bounds(d.size);
	}
	for (const key of [
		"printBounds",
		"travelBounds",
		"printCircle",
		"printArea",
		"exclusions",
		"parkTool",
	] as const) {
		if (d[key] !== undefined) {
			Object.assign(p, { [key]: structuredClone(d[key]) });
		}
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
	if (d.bedTemperatures) {
		if (options.supplyVoltage !== undefined) {
			p.maxBedTemperature = d.bedTemperatures[options.supplyVoltage]!;
			if (d.voltageNotes) {
				notes.push(d.voltageNotes.configured.replace("{voltage}", String(options.supplyVoltage)));
			}
		} else if (d.voltageNotes) {
			notes.push(d.voltageNotes.missing);
		}
	}
	const extruders = Array.from(
		{ length: count },
		(_, index) =>
			d.extruders?.[index] ?? {
				heater: count === 1 ? "hotend" : `hotend:${index}`,
				selector: index,
			},
	);
	p.heaters = extruders.map(({ heater }) => ({
		id: heater,
		...(d.nozzle !== undefined ? { maxTemperature: d.nozzle } : {}),
	}));
	p.heaterTargets = Object.fromEntries(extruders.map((e) => [e.selector, e.heater]));
	let mapping = options.materialTools;
	if (mapping === undefined) {
		if (d.materialMapping === "explicit") {
			mapping = {};
			p.requiresToolMapping = true;
			notes.push(...(d.mappingNotes ?? []));
		} else {
			mapping = Object.fromEntries(
				Array.from(
					{ length: upgrade !== undefined ? d.upgrades![upgrade]! : count },
					(_, index) => [index, upgrade !== undefined ? 0 : index],
				),
			);
		}
	} else if (Object.keys(mapping).length === 0) {
		throw new TypeError("materialTools must not be empty.");
	}
	const tools: ToolProfile[] = [];
	for (const [key, index] of Object.entries(mapping)) {
		if (
			!/^(0|[1-9]\d*)$/.test(key) ||
			Number(key) > 254 ||
			!Number.isInteger(index) ||
			index < 0 ||
			index >= count
		) {
			throw new RangeError(
				"Material IDs must be 0–254 and reference an installed physical extruder.",
			);
		}
		const extruder = extruders[index]!;
		tools.push({
			id: Number(key),
			heater: extruder.heater,
			...(d.filamentDiameter !== undefined ? { filamentDiameter: d.filamentDiameter } : {}),
			...(d.nozzle !== undefined ? { maxTemperature: d.nozzle } : {}),
			...(extruder.printBounds ? { printBounds: structuredClone(extruder.printBounds) } : {}),
		});
	}
	if (tools.length) {
		p.tools = tools;
	}
	if (d.heaterSelection === "material") {
		p.heaterTargets = Object.fromEntries(tools.map((t) => [t.id, t.heater]));
	}
	if (d.multipleExtruderBounds && new Set(Object.values(mapping)).size > 1) {
		p.printBounds = structuredClone(d.multipleExtruderBounds);
		notes.push(...(d.multipleExtruderNotes ?? []));
	}
	if (upgrade !== undefined) {
		notes.push(
			`${upgrade.toUpperCase()} material slots share one heater; loading and unloading are not simulated.`,
		);
	}
	validatePrinterProfile(p);
	return p;
}
