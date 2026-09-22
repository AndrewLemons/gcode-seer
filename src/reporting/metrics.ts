import type { Box } from "../contracts/geometry.js";
import type { AnalysisReport, ToolSummary } from "../contracts/analysis.js";
import type { MoveEvent, TemperatureEvent } from "../contracts/events.js";
import type { PrinterProfile } from "../contracts/printer.js";
import { mergeBounds } from "./bounds.js";
export function collectTemperature(report: AnalysisReport, event: TemperatureEvent): void {
	const r = report;
	let summary = r.temperatures[event.heater];
	if (!summary) {
		summary = r.temperatures[event.heater] = {
			targets: { min: event.target, max: event.target },
			activeTargets: null,
			finalTarget: event.target,
			commands: 0,
			waits: 0,
		};
	}
	summary.targets.min = Math.min(summary.targets.min, event.target);
	summary.targets.max = Math.max(summary.targets.max, event.target);
	if (event.target > 0) {
		summary.activeTargets = summary.activeTargets
			? {
					min: Math.min(summary.activeTargets.min, event.target),
					max: Math.max(summary.activeTargets.max, event.target),
				}
			: { min: event.target, max: event.target };
	}
	summary.finalTarget = event.target;
	summary.commands++;
	summary.waits += Number(event.wait);
}
export function collectMove(
	r: AnalysisReport,
	move: MoveEvent,
	p: PrinterProfile | undefined,
	bounds: Box | null,
): void {
	const extruding = move.extrusion !== null && move.extrusion > 0;
	r.moves++;
	r.maxFeedrate = Math.max(r.maxFeedrate, move.feedrate ?? 0);
	r.nominalDuration += move.duration ?? 0;

	if (move.distance !== null) {
		r.distance.total += move.distance;
		if (move.extrusion !== null) {
			r.distance[extruding ? "extrusion" : "travel"] += move.distance;
		}
	}

	if (bounds) {
		r.bounds = mergeBounds(r.bounds, bounds);
		if (extruding) {
			r.extrusionBounds = mergeBounds(r.extrusionBounds, bounds);
		}
	}
	if (move.axisSpeeds) {
		for (const axis of ["x", "y", "z", "e"] as const) {
			r.maxAxisSpeed[axis] = Math.max(r.maxAxisSpeed[axis], move.axisSpeeds[axis]);
		}
	}
	if (move.tool < 0) {
		return;
	}
	const profile = p?.tools?.find((t) => t.id === move.tool);
	const tool: ToolSummary = (r.tools[move.tool] ??= {
		moves: 0,
		extruded: 0,
		retracted: 0,
		netExtrusion: 0,
		maxExtrusionSpeed: 0,
		maxVolumetricFlow: profile?.filamentDiameter ? 0 : null,
	});
	tool.moves++;
	if (move.extrusion !== null) {
		tool.extruded += Math.max(0, move.extrusion);
		tool.retracted += Math.max(0, -move.extrusion);
		tool.netExtrusion += move.extrusion;
	}
	const speed = move.axisSpeeds?.e ?? 0;
	tool.maxExtrusionSpeed = Math.max(tool.maxExtrusionSpeed, speed);

	if (profile?.filamentDiameter && extruding) {
		const flow = speed * Math.PI * (profile.filamentDiameter / 2) ** 2;
		tool.maxVolumetricFlow = Math.max(tool.maxVolumetricFlow ?? 0, flow);
	}
}
