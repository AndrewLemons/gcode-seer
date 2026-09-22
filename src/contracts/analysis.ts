import type { Vector3, Position, AxisSpeeds, Box } from "./geometry.js";
import type { PrinterProfile } from "./printer.js";
import type { Dialect } from "./dialect.js";
import type { Severity, Diagnostic, Command } from "./syntax.js";
import type { AnalysisEvent } from "./events.js";

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
