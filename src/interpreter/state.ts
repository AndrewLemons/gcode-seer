import { marlinDialect } from "../dialects.js";
import type { AnalyzeOptions, Dialect, Position, Vector3 } from "../types.js";
export const axes = ["x", "y", "z"] as const;
export const known = (position: Position): position is Vector3 =>
	axes.every((axis) => position[axis] !== null);
export const emptyPosition = (): Position => ({ x: null, y: null, z: null });

/** Stateful command interpreter. Create one instance per file. */
export class MachineState {
	position: Position;
	offset: Position = { x: 0, y: 0, z: 0 };
	unit: number | null = 1;
	absolute: boolean | null = true;
	extruderAbsolute: boolean | null = true;
	feedrate: number | null;
	speedFactor: number | null = 1;
	flowFactors = new Map<number, number>();
	extrusionRegisters = new Map<number, number | null>();
	volumetric = new Map<number, number>();
	volumetricKnown = new Set<number>();
	tool: number | null = 0;
	plane = "G17";
	temperatureUnit: "C" | "F" | "K" | null = "C";
	suspended = false;
	uncertainTools = false;
	readonly dialect: Dialect;

	constructor(readonly options: AnalyzeOptions = {}) {
		this.position = { ...emptyPosition(), ...options.initialPosition };
		this.feedrate = options.initialFeedrate ?? null;
		this.dialect = options.dialect ?? options.printer?.dialect ?? marlinDialect;
		this.extrusionRegisters.set(0, options.initialExtrusion ?? null);
	}

	get finalPosition(): Position {
		return { ...this.position };
	}

	/** Unknown commands may change modal state, origins and tool selection. */
	invalidate(): void {
		this.position = emptyPosition();
		this.offset = emptyPosition();
		this.unit = null;
		this.absolute = null;
		this.extruderAbsolute = null;
		this.feedrate = null;
		this.speedFactor = null;
		this.temperatureUnit = null;
		this.tool = null;
		this.uncertainTools = true;
		this.extrusionRegisters.clear();
		this.flowFactors.clear();
		this.volumetric.clear();
		this.volumetricKnown.clear();
		this.plane = "unknown";
	}

	register(): number {
		return this.dialect.extrusionRegisters === "shared" ? 0 : (this.tool ?? -1);
	}
}
