import type { MoveEvent } from "../contracts/events.js";
import type { ConstraintContext } from "./context.js";
import {
	containsBox,
	containsPathInCircle,
	containsPathInPolygon,
	intersectsExclusion,
	pointInPolygon,
} from "../geometry.js";
import type { Box } from "../types.js";
export function checkGeometry(
	move: MoveEvent,
	context: ConstraintContext,
	bounds: Box | null,
): void {
	const p = context.printer;
	const toolProfile = p?.tools?.find((t) => t.id === move.tool);
	const extruding = move.extrusion !== null && move.extrusion > 0;
	if (extruding && p?.printCircle) {
		const circle = p.printCircle;
		const outside = move.path
			? !containsPathInCircle(circle, move.path)
			: [move.start, move.end].some(
					(point) =>
						point.x !== null &&
						point.y !== null &&
						Math.hypot(point.x - circle.center.x, point.y - circle.center.y) > circle.radius + 1e-7,
				);
		if (outside) {
			context.violation(
				"PRINT_CIRCLE",
				move.line,
				"Extruding movement leaves the circular printable area.",
			);
		}
	}
	if (extruding && p?.printArea) {
		const area = p.printArea;
		const outside = move.path
			? !containsPathInPolygon(area, move.path)
			: [move.start, move.end].some(
					(point) =>
						point.x !== null &&
						point.y !== null &&
						!pointInPolygon({ x: point.x, y: point.y }, area),
				);
		if (outside) {
			context.violation(
				"PRINT_AREA",
				move.line,
				"Extruding movement leaves the printable XY polygon.",
			);
		}
	}
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
				context.violation(code, move.line, "A known axis coordinate leaves the configured bounds.");
			}
		}
	}

	if (bounds) {
		if (p?.travelBounds && !containsBox(p.travelBounds, bounds)) {
			context.violation(
				"TRAVEL_BOUNDS",
				move.line,
				"Movement leaves the configured travel bounds.",
			);
		}
		if (toolProfile?.travelBounds && !containsBox(toolProfile.travelBounds, bounds)) {
			context.violation(
				"TOOL_TRAVEL_BOUNDS",
				move.line,
				"Movement leaves the active tool travel bounds.",
			);
		}
		if (extruding && toolProfile?.printBounds && !containsBox(toolProfile.printBounds, bounds)) {
			context.violation(
				"TOOL_PRINT_BOUNDS",
				move.line,
				"Extruding movement leaves the active tool print bounds.",
			);
		}
		if (extruding && p?.printBounds && !containsBox(p.printBounds, bounds)) {
			context.violation(
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
			context.violation("EXCLUSION", move.line, `Movement intersects exclusion "${zone.id}".`);
		}
	}
}
