import type { MoveEvent } from "../contracts/events.js";
import type { ConstraintContext } from "./context.js";
export function checkExtrusion(move: MoveEvent, context: ConstraintContext): void {
	const r = context.report;
	const p = context.printer;
	const extruding = move.extrusion !== null && move.extrusion > 0;
	if (move.tool < 0) {
		return;
	}
	const profile = p?.tools?.find((t) => t.id === move.tool);
	if (p?.tools && !profile) {
		context.violation(
			"UNKNOWN_TOOL",
			move.line,
			`Tool ${move.tool} is absent from the printer profile.`,
		);
	}
	const speed = move.axisSpeeds?.e ?? 0;
	if (profile?.maxExtrusionSpeed !== undefined && speed > profile.maxExtrusionSpeed) {
		context.violation(
			"EXTRUSION_SPEED_LIMIT",
			move.line,
			`Tool ${move.tool} exceeds its extrusion speed limit.`,
		);
	}

	if (profile?.filamentDiameter && extruding) {
		const flow = speed * Math.PI * (profile.filamentDiameter / 2) ** 2;
		if (profile.maxVolumetricFlow !== undefined && flow > profile.maxVolumetricFlow) {
			context.violation(
				"VOLUMETRIC_FLOW_LIMIT",
				move.line,
				`Tool ${move.tool} requests ${flow} mm³/s above its configured flow limit.`,
			);
		}
	}

	if (profile?.minExtrusionTemperature !== undefined && extruding) {
		const target = r.temperatures[profile.heater]?.finalTarget;
		if (target === undefined) {
			context.diagnostic({
				code: "UNKNOWN_EXTRUSION_TEMPERATURE",
				line: move.line,
				message: "No known heater target precedes extrusion.",
				severity: "warning",
				category: "coverage",
			});
		} else if (target < profile.minExtrusionTemperature) {
			context.violation(
				"COLD_EXTRUSION_TARGET",
				move.line,
				`Tool ${move.tool} extrudes with a target below ${profile.minExtrusionTemperature} °C.`,
			);
		}
	}
}
