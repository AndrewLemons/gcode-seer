import { containsBox, expandBox, intersectsExclusion, pathBounds } from "./geometry.js";
import type {
	AnalysisEvent,
	AnalysisReport,
	AnalyzeOptions,
	Box,
	Diagnostic,
	MoveEvent,
	ToolSummary,
	Vector3,
} from "./types.js";

const merge = (existing: Box | null, addition: Box): Box => {
	if (!existing) {
		return { min: { ...addition.min }, max: { ...addition.max } };
	}
	expandBox(existing, addition.min);
	expandBox(existing, addition.max);
	return existing;
};
export class Collector {
	readonly report: AnalysisReport;
	private invalid = false;
	private unsupported = false;
	private violated = false;
	private readonly limits: boolean;
	constructor(private readonly options: AnalyzeOptions) {
		const p = options.printer;
		this.limits = !!(
			p &&
			(p.travelBounds ||
				p.printBounds ||
				p.exclusions?.length ||
				Object.keys(p.maxSpeed ?? {}).length ||
				p.maxBedTemperature !== undefined ||
				p.maxChamberTemperature !== undefined ||
				p.tools?.length)
		);
		this.report = {
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
			],
		};
	}
	diagnostic(diagnostic: Diagnostic): void {
		const r = this.report;
		r.diagnosticCounts[diagnostic.severity]++;
		if (r.diagnostics.length < (this.options.maxDiagnostics ?? 1000)) {
			r.diagnostics.push({ ...diagnostic });
		} else {
			r.droppedDiagnostics++;
		}
		if (diagnostic.category === "syntax" || diagnostic.category === "semantic") {
			if (diagnostic.severity === "error") {
				this.invalid = true;
				r.complete = false;
			}
		}
		if (diagnostic.category === "coverage" && diagnostic.severity !== "info") {
			r.complete = false;
			if (["UNSUPPORTED_COMMAND", "UNSUPPORTED_PARAMETER"].includes(diagnostic.code)) {
				this.unsupported = true;
			}
		}
		if (diagnostic.category === "constraint" && diagnostic.severity === "error") {
			this.violated = true;
		}
	}
	event(event: AnalysisEvent): void {
		if (event.type === "diagnostic") {
			this.diagnostic(event.diagnostic);
			return;
		}
		const r = this.report;
		if (event.type === "move") {
			this.move(event);
		} else if (event.type === "dwell") {
			r.nominalDuration += event.seconds;
		} else if (event.type === "tool") {
			r.toolChanges++;
		} else {
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
			const profile = this.options.printer;
			const limits =
				event.heater === "bed"
					? [profile?.maxBedTemperature]
					: event.heater === "chamber"
						? [profile?.maxChamberTemperature]
						: (profile?.tools ?? [])
								.filter((t) => t.heater === event.heater)
								.map((t) => t.maxTemperature);
			for (const limit of limits) {
				if (limit !== undefined && event.target > limit) {
					this.violation(
						"TEMPERATURE_LIMIT",
						event.line,
						`${event.heater} target ${event.target} °C exceeds ${limit} °C.`,
					);
					break;
				}
			}
		}
		for (const rule of this.options.rules ?? []) {
			for (const diagnostic of rule.onEvent(event)) {
				this.diagnostic(diagnostic);
			}
		}
	}
	private violation(code: string, line: number, message: string): void {
		this.diagnostic({
			code,
			line,
			message,
			category: "constraint",
			severity: "error",
		});
	}
	private move(move: MoveEvent): void {
		const r = this.report;
		const p = this.options.printer;
		r.moves++;
		r.maxFeedrate = Math.max(r.maxFeedrate, move.feedrate ?? 0);
		r.nominalDuration += move.duration ?? 0;
		const toolProfile = p?.tools?.find((t) => t.id === move.tool);
		const extruding = move.extrusion !== null && move.extrusion > 0;
		if (move.distance !== null) {
			r.distance.total += move.distance;
			if (move.extrusion !== null) {
				r.distance[extruding ? "extrusion" : "travel"] += move.distance;
			}
		}
		const bounds = move.path
			? pathBounds(move.path)
			: Object.values(move.end).every((v) => v !== null)
				? { min: { ...move.end } as Vector3, max: { ...move.end } as Vector3 }
				: null;
		if (!bounds) {
			const leaves = (limit: Box): boolean =>
				(["x", "y", "z"] as const).some((axis) =>
					[move.start[axis], move.end[axis]].some(
						(value) =>
							value !== null && (value < limit.min[axis] - 1e-7 || value > limit.max[axis] + 1e-7),
					),
				);
			for (const [limit, code] of [
				[p?.travelBounds, "TRAVEL_BOUNDS"],
				[toolProfile?.travelBounds, "TOOL_TRAVEL_BOUNDS"],
				[extruding ? p?.printBounds : undefined, "PRINT_BOUNDS"],
				[extruding ? toolProfile?.printBounds : undefined, "TOOL_PRINT_BOUNDS"],
			] as const) {
				if (limit && leaves(limit)) {
					this.violation(code, move.line, "A known axis coordinate leaves the configured bounds.");
				}
			}
		}
		if (bounds) {
			r.bounds = merge(r.bounds, bounds);
			if (extruding) {
				r.extrusionBounds = merge(r.extrusionBounds, bounds);
			}
			if (p?.travelBounds && !containsBox(p.travelBounds, bounds)) {
				this.violation("TRAVEL_BOUNDS", move.line, "Movement leaves the configured travel bounds.");
			}
			if (toolProfile?.travelBounds && !containsBox(toolProfile.travelBounds, bounds)) {
				this.violation(
					"TOOL_TRAVEL_BOUNDS",
					move.line,
					"Movement leaves the active tool travel bounds.",
				);
			}
			if (extruding && toolProfile?.printBounds && !containsBox(toolProfile.printBounds, bounds)) {
				this.violation(
					"TOOL_PRINT_BOUNDS",
					move.line,
					"Extruding movement leaves the active tool print bounds.",
				);
			}
			if (extruding && p?.printBounds && !containsBox(p.printBounds, bounds)) {
				this.violation(
					"PRINT_BOUNDS",
					move.line,
					"Extruding movement leaves the configured printable bounds.",
				);
			}
		}
		// A known endpoint can still prove an exclusion violation when the start is unknown.
		const checkPath =
			move.path ?? (bounds ? { kind: "line" as const, start: bounds.min, end: bounds.max } : null);
		for (const zone of p?.exclusions ?? []) {
			if (
				checkPath &&
				(zone.appliesTo === "all" || extruding) &&
				intersectsExclusion(checkPath, zone)
			) {
				this.violation("EXCLUSION", move.line, `Movement intersects exclusion "${zone.id}".`);
			}
		}
		if (move.axisSpeeds) {
			for (const axis of ["x", "y", "z", "e"] as const) {
				r.maxAxisSpeed[axis] = Math.max(r.maxAxisSpeed[axis], move.axisSpeeds[axis]);
				const limit = p?.maxSpeed?.[axis];
				if (limit !== undefined && move.axisSpeeds[axis] > limit + 1e-7) {
					this.violation(
						"SPEED_LIMIT",
						move.line,
						`${axis.toUpperCase()} requested speed ${move.axisSpeeds[axis]} mm/s exceeds ${limit} mm/s.`,
					);
				}
			}
		}
		if (move.tool < 0) {
			return;
		}
		const profile = p?.tools?.find((t) => t.id === move.tool);
		if (p?.tools && !profile) {
			this.violation(
				"UNKNOWN_TOOL",
				move.line,
				`Tool ${move.tool} is absent from the printer profile.`,
			);
		}
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
		if (profile?.maxExtrusionSpeed !== undefined && speed > profile.maxExtrusionSpeed) {
			this.violation(
				"EXTRUSION_SPEED_LIMIT",
				move.line,
				`Tool ${move.tool} exceeds its extrusion speed limit.`,
			);
		}
		if (profile?.filamentDiameter && extruding) {
			const flow = speed * Math.PI * (profile.filamentDiameter / 2) ** 2;
			tool.maxVolumetricFlow = Math.max(tool.maxVolumetricFlow ?? 0, flow);
			if (profile.maxVolumetricFlow !== undefined && flow > profile.maxVolumetricFlow) {
				this.violation(
					"VOLUMETRIC_FLOW_LIMIT",
					move.line,
					`Tool ${move.tool} requests ${flow} mm³/s above its configured flow limit.`,
				);
			}
		}
		if (profile?.minExtrusionTemperature !== undefined && extruding) {
			const target = r.temperatures[profile.heater]?.finalTarget;
			if (target === undefined) {
				this.diagnostic({
					code: "UNKNOWN_EXTRUSION_TEMPERATURE",
					line: move.line,
					message: "No known heater target precedes extrusion.",
					severity: "warning",
					category: "coverage",
				});
			} else if (target < profile.minExtrusionTemperature) {
				this.violation(
					"COLD_EXTRUSION_TARGET",
					move.line,
					`Tool ${move.tool} extrudes with a target below ${profile.minExtrusionTemperature} °C.`,
				);
			}
		}
	}
	finish(): AnalysisReport {
		const r = this.report;
		if (r.commands === 0) {
			this.diagnostic({
				code: "EMPTY_PROGRAM",
				line: 0,
				message: "Input contains no executable commands.",
				severity: "error",
				category: "semantic",
			});
		}
		r.validity = this.invalid ? "invalid" : this.unsupported ? "unknown" : "valid";
		r.constraints = this.violated
			? "violated"
			: !this.limits
				? "not-configured"
				: r.complete
					? "passed"
					: "unknown";
		return r;
	}
}
