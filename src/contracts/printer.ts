import type { Vector3, AxisSpeeds, Box, Point2, Circle, Exclusion } from "./geometry.js";
import type { Dialect } from "./dialect.js";

export interface HeaterProfile {
	id: string;
	maxTemperature?: number;
}

export interface ProfileProvenance {
	id: string;
	manufacturer: string;
	reviewedAt: string;
	sources: readonly string[];
	notes: readonly string[];
}

export type MultiMaterialUpgrade = string;

export interface ToolProfile {
	id: number;
	/** Physical heater identity; several material tools may share a heater. */
	heater: string;
	filamentDiameter?: number;
	maxTemperature?: number;
	minExtrusionTemperature?: number;
	maxExtrusionSpeed?: number;
	maxVolumetricFlow?: number;
	travelBounds?: Box;
	printBounds?: Box;
}

export interface PrinterProfile {
	name: string;
	provenance?: ProfileProvenance;
	dialect?: Dialect;
	travelBounds?: Box;
	printBounds?: Box;
	printCircle?: Circle;
	/** Simple printable XY polygon; independent of unknown or separately configured Z limits. */
	printArea?: readonly Point2[];
	exclusions?: readonly Exclusion[];
	/** Machine position reached after homing. Homing trajectories are not simulated. */
	homePosition?: Partial<Vector3>;
	tools?: readonly ToolProfile[];
	/** Physical hotends, independent of a job's material tool assignments. */
	heaters?: readonly HeaterProfile[];
	/** Report incomplete coverage until material tools have been assigned to physical hotends. */
	requiresToolMapping?: boolean;
	/** Explicit temperature T selectors may identify physical heaters rather than material tools. */
	heaterTargets?: Readonly<Record<number, string>>;
	/** Firmware's non-printing park selection (e.g. XL T5); its trajectory remains unmodeled. */
	parkTool?: number;
	maxSpeed?: Partial<AxisSpeeds>;
	/** Maximum requested tool-tip speed, including diagonal motion; excludes pure E moves. */
	maxToolheadSpeed?: number;
	maxBedTemperature?: number;
	maxChamberTemperature?: number;
}
