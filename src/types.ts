/** Output distances are millimeters, speeds mm/s, times seconds, temperatures Celsius. */
export type Axis = "x" | "y" | "z";
export type Vector3 = Record<Axis, number>;
export type Position = Record<Axis, number | null>;
export type AxisSpeeds = Vector3 & { e: number };
export interface Box {
	min: Vector3;
	max: Vector3;
}

export interface Point2 {
	x: number;
	y: number;
}

/** Circular printable XY area; Z limits may be supplied independently in printBounds. */
export interface Circle {
	center: Point2;
	radius: number;
}

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

export interface Exclusion {
	id: string;
	/** Simple polygon without a repeated closing vertex. Boundary contact is a violation. */
	polygon: readonly Point2[];
	minZ?: number;
	maxZ?: number;
	appliesTo: "all" | "extrusion";
}

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

export interface Dialect {
	name: string;
	extrusionMode: "marlin" | "independent" | "relative-override";
	extrusionRegisters: "shared" | "per-tool";
	/** Explicit T commands may invoke unmodeled parking, offsets or macros. */
	toolChange: "logical" | "unmodeled";
	passiveCommands: readonly string[];
	/** Defaults to true. */
	inchUnits?: boolean;
	/** M400 accepts S seconds and P milliseconds. */
	timedPlannerWait?: boolean;
	/** M400 U suspends interpretation for user interaction. Requires timedPlannerWait. */
	interactivePlannerWait?: boolean;
	reservedTools?: readonly number[];
	/** M191 accepts a C cooling target. */
	chamberCooling?: boolean;
	/** Explicit hotend selectors must exist in printer.heaterTargets when configured. */
	strictHeaterSelectors?: boolean;
	/** Additional commands whose arguments must be preserved verbatim for adapters. */
	payloadCommands?: readonly string[];
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

export type Severity = "info" | "warning" | "error";
export type DiagnosticCategory = "syntax" | "semantic" | "coverage" | "constraint";
export interface Diagnostic {
	code: string;
	severity: Severity;
	category: DiagnosticCategory;
	line: number;
	message: string;
	command?: string;
}

export interface Command {
	code: string;
	/** Null denotes a bare flag, such as X in G28 X. */
	params: Readonly<Record<string, number | null>>;
	line: number;
	raw: string;
	payload?: string;
}

export interface ParsedLine {
	command: Command | null;
	diagnostics: readonly Diagnostic[];
}

export interface LinearPath {
	kind: "line";
	start: Vector3;
	end: Vector3;
}

export interface ArcPath {
	kind: "arc";
	start: Vector3;
	end: Vector3;
	center: Point2;
	radius: number;
	startAngle: number;
	/** Signed radians, negative for clockwise. XY arcs may interpolate Z. */
	sweep: number;
}

export type MotionPath = LinearPath | ArcPath;
export interface MoveEvent {
	type: "move";
	line: number;
	tool: number;
	start: Position;
	end: Position;
	path: MotionPath | null;
	distance: number | null;
	extrusion: number | null;
	/** Feedrate including M220. A request, not a measured velocity. */
	feedrate: number | null;
	axisSpeeds: AxisSpeeds | null;
	duration: number | null;
}

export interface TemperatureEvent {
	type: "temperature";
	line: number;
	heater: string;
	target: number;
	wait: boolean;
}

export type AnalysisEvent =
	| MoveEvent
	| TemperatureEvent
	| { type: "dwell"; line: number; seconds: number }
	| { type: "tool"; line: number; tool: number }
	| { type: "diagnostic"; diagnostic: Diagnostic };
export interface CommandAdapter {
	name: string;
	/** Undefined defers to built-ins. Returned commands bypass adapters. [] asserts no relevant effect. */
	translate(command: Command): readonly Command[] | undefined;
}

export interface AnalysisRule {
	name: string;
	onEvent(event: Exclude<AnalysisEvent, { type: "diagnostic" }>): readonly Diagnostic[];
}

export interface AnalyzeOptions {
	printer?: PrinterProfile;
	dialect?: Dialect;
	initialPosition?: Partial<Vector3>;
	initialExtrusion?: number;
	initialFeedrate?: number;
	maxDiagnostics?: number;
	maxLineLength?: number;
	adapters?: readonly CommandAdapter[];
	/** Rule instances belong to one analysis; use factories for stateful rules. */
	rules?: readonly AnalysisRule[];
	onEvent?: (event: AnalysisEvent) => void;
	signal?: AbortSignal;
}

export interface Range {
	min: number;
	max: number;
}

export interface HeaterSummary {
	targets: Range;
	/** Heater-off targets are omitted. */
	activeTargets: Range | null;
	finalTarget: number;
	commands: number;
	waits: number;
}

export interface ToolSummary {
	moves: number;
	extruded: number;
	retracted: number;
	netExtrusion: number;
	maxExtrusionSpeed: number;
	maxVolumetricFlow: number | null;
}

export interface AnalysisReport {
	validity: "valid" | "invalid" | "unknown";
	/** Only assesses supplied constraints. Passed does not certify physical safety. */
	constraints: "passed" | "violated" | "unknown" | "not-configured";
	complete: boolean;
	lines: number;
	commands: number;
	moves: number;
	toolChanges: number;
	bounds: Box | null;
	extrusionBounds: Box | null;
	distance: { total: number; extrusion: number; travel: number };
	maxFeedrate: number;
	maxAxisSpeed: AxisSpeeds;
	/** Modeled constant-feed motion and dwell. Excludes acceleration and waits. */
	nominalDuration: number;
	temperatures: Record<string, HeaterSummary>;
	tools: Record<string, ToolSummary>;
	diagnostics: Diagnostic[];
	diagnosticCounts: Record<Severity, number>;
	droppedDiagnostics: number;
	finalPosition: Position;
	assumptions: readonly string[];
}
