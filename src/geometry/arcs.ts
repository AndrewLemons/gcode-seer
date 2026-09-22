import type { ArcPath, Point2, Vector3 } from "../contracts/geometry.js";
import { EPSILON, TAU, normalized } from "./numeric.js";
export function arcParameter(path: ArcPath, angle: number): number | null {
	const travel =
		path.sweep > 0 ? normalized(angle - path.startAngle) : normalized(path.startAngle - angle);
	const t = travel / Math.abs(path.sweep);
	return t <= 1 + EPSILON ? Math.min(1, t) : null;
}

export function createArc(
	start: Vector3,
	end: Vector3,
	clockwise: boolean,
	offsets: { i?: number; j?: number; r?: number },
): ArcPath {
	const direction = clockwise ? -1 : 1;
	const sweepFor = (center: Point2): number => {
		const first = Math.atan2(start.y - center.y, start.x - center.x);
		const last = Math.atan2(end.y - center.y, end.x - center.x);
		return direction * (normalized(direction * (last - first)) || TAU);
	};
	let center: Point2;
	if (offsets.r !== undefined) {
		if (offsets.i !== undefined || offsets.j !== undefined) {
			throw new Error("An arc cannot mix R with I/J.");
		}
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const chord = Math.hypot(dx, dy);
		const radius = Math.abs(offsets.r);
		if (chord <= EPSILON || radius < chord / 2 - EPSILON) {
			throw new Error("Impossible radius or ambiguous full circle with R.");
		}
		const height = Math.sqrt(Math.max(0, radius ** 2 - (chord / 2) ** 2));
		const candidates = [1, -1].map((sign) => ({
			x: (start.x + end.x) / 2 - (sign * height * dy) / chord,
			y: (start.y + end.y) / 2 + (sign * height * dx) / chord,
		}));
		center = candidates.find((c) =>
			offsets.r! < 0
				? Math.abs(sweepFor(c)) >= Math.PI - EPSILON
				: Math.abs(sweepFor(c)) <= Math.PI + EPSILON,
		)!;
	} else {
		if (offsets.i === undefined && offsets.j === undefined) {
			throw new Error("An arc requires I/J offsets or R.");
		}
		center = { x: start.x + (offsets.i ?? 0), y: start.y + (offsets.j ?? 0) };
	}
	const radius = Math.hypot(start.x - center.x, start.y - center.y);
	if (radius <= EPSILON) {
		throw new Error("Arc radius must be positive.");
	}
	const endRadius = Math.hypot(end.x - center.x, end.y - center.y);
	if (Math.abs(radius - endRadius) > Math.max(0.001, radius * 1e-5)) {
		throw new Error("Arc endpoints have inconsistent radii.");
	}
	return {
		kind: "arc",
		start,
		end,
		center,
		radius,
		startAngle: Math.atan2(start.y - center.y, start.x - center.x),
		sweep: sweepFor(center),
	};
}
