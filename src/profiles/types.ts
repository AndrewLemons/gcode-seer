import type { Box, Dialect, PrinterProfile, ProfileProvenance } from "../types.js";

export type Size = readonly [x: number, y: number, z: number];

export interface PhysicalExtruder {
	heater: string;
	/** Explicit temperature selector, independent of material T IDs. */
	selector: number;
	printBounds?: Box;
}

/** Declarative hardware data. The builder never dispatches on manufacturer, ID or dialect name. */
export interface PrinterDefinition extends Pick<
	PrinterProfile,
	"printBounds" | "travelBounds" | "printCircle" | "printArea" | "exclusions" | "parkTool"
> {
	id: string;
	name: string;
	manufacturer: string;
	reviewedAt: string;
	sources: readonly string[];
	notes: readonly string[];
	dialect: Dialect;
	toolCounts: readonly number[];
	size?: Size;
	nozzle?: number;
	bed?: number;
	chamber?: number;
	speed?: number;
	filamentDiameter?: number;
	/** Material slots sharing extruder zero, keyed by an arbitrary upgrade ID. */
	upgrades?: Readonly<Record<string, number>>;
	extruders?: readonly PhysicalExtruder[];
	materialMapping?: "automatic" | "explicit";
	heaterSelection?: "material" | "physical";
	bedTemperatures?: Readonly<Record<number, number>>;
	voltageNotes?: { configured: string; missing: string };
	mappingNotes?: readonly string[];
	geometryNotes?: readonly string[];
	multipleExtruderBounds?: Box;
	multipleExtruderNotes?: readonly string[];
	technology?: string;
	unsupported?: string;
}

export interface PrinterProfileInfo extends ProfileProvenance {
	name: string;
	technology: string;
	available: boolean;
	toolCounts: readonly number[];
	multiMaterialUpgrades: readonly string[];
	requiresToolMapping: boolean;
}

export interface PrinterProfileOptions {
	toolCount?: number;
	multiMaterial?: string;
	/** Map material T IDs to zero-based physical extruder indices. */
	materialTools?: Readonly<Record<number, number>>;
	/** Supported supply voltages are defined by the printer's hardware data. */
	supplyVoltage?: number;
}
