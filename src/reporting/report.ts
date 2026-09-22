import type { AnalysisReport } from "../contracts/analysis.js";
import type { PrinterProfile } from "../contracts/printer.js";
export function createReport(p: PrinterProfile | undefined): AnalysisReport {
	return {
		validity: "valid",
		constraints: "not-configured",
		complete: true,
		lines: 0,
		commands: 0,
		moves: 0,
		toolChanges: 0,
		bounds: null,
		extrusionBounds: null,
		distance: { total: 0, extrusion: 0, travel: 0 },
		maxFeedrate: 0,
		maxAxisSpeed: { x: 0, y: 0, z: 0, e: 0 },
		nominalDuration: 0,
		temperatures: Object.create(null) as AnalysisReport["temperatures"],
		tools: Object.create(null) as AnalysisReport["tools"],
		diagnostics: [],
		diagnosticCounts: { info: 0, warning: 0, error: 0 },
		droppedDiagnostics: 0,
		finalPosition: { x: null, y: null, z: null },
		assumptions: [
			"Configured initial state and printer limits describe the target machine.",
			"Initial units are millimeters and Celsius; positioning and extrusion are absolute; speed and flow multipliers are 100%.",
			"G0 and G1 share a feedrate and use Cartesian straight-line tool-tip motion.",
			"Homing endpoints come from the profile; homing trajectories are excluded.",
			"Speeds are requests; duration excludes acceleration, heater waits and firmware overhead.",
			"Constraints cover the active tool tip, not the carriage, inactive nozzles or the printed part.",
			...(p?.provenance?.notes ?? []),
		],
	};
}
