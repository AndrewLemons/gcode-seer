import type { Position, AxisSpeeds, MotionPath } from "./geometry.js";
import type { Diagnostic } from "./syntax.js";

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
