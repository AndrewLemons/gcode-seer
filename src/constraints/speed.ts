import type { MoveEvent } from "../contracts/events.js";
import type { ConstraintContext } from "./context.js";

export function checkToolheadSpeed(move: MoveEvent, context: ConstraintContext): void {
	const p = context.printer;
	if (
		p?.maxToolheadSpeed !== undefined &&
		move.distance !== null &&
		move.distance > 0 &&
		move.feedrate !== null &&
		move.feedrate > p.maxToolheadSpeed + 1e-7
	) {
		context.violation(
			"TOOLHEAD_SPEED_LIMIT",
			move.line,
			`Requested tool-tip speed exceeds ${p.maxToolheadSpeed} mm/s.`,
		);
	}
}

export function checkAxisSpeeds(move: MoveEvent, context: ConstraintContext): void {
	const p = context.printer;
	if (move.axisSpeeds) {
		for (const axis of ["x", "y", "z", "e"] as const) {
			const limit = p?.maxSpeed?.[axis];
			if (limit !== undefined && move.axisSpeeds[axis] > limit + 1e-7) {
				context.violation(
					"SPEED_LIMIT",
					move.line,
					`${axis.toUpperCase()} requested speed ${move.axisSpeeds[axis]} mm/s exceeds ${limit} mm/s.`,
				);
			}
		}
	}
}
