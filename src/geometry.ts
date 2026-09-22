import type { ArcPath, Box, Circle, Exclusion, MotionPath, Point2, Vector3 } from "./types.js";

export const EPSILON = 1e-7;
const TAU = 2 * Math.PI;
const axes = ["x", "y", "z"] as const;
const cross = (a: Point2, b: Point2): number => a.x * b.y - a.y * b.x;
const subtract = (a: Point2, b: Point2): Point2 => ({
	x: a.x - b.x,
	y: a.y - b.y,
});
const normalized = (angle: number): number => ((angle % TAU) + TAU) % TAU;

export function arcParameter(path: ArcPath, angle: number): number | null {
	const travel =
		path.sweep > 0 ? normalized(angle - path.startAngle) : normalized(path.startAngle - angle);
	const t = travel / Math.abs(path.sweep);
	return t <= 1 + EPSILON ? Math.min(1, t) : null;
}

export function pointAt(path: MotionPath, t: number): Vector3 {
	if (t === 0) {
		return { ...path.start };
	}
	if (t === 1) {
		return { ...path.end };
	}
	const z = path.start.z + (path.end.z - path.start.z) * t;
	if (path.kind === "arc") {
		const angle = path.startAngle + path.sweep * t;
		return {
			x: path.center.x + path.radius * Math.cos(angle),
			y: path.center.y + path.radius * Math.sin(angle),
			z,
		};
	}
	return {
		x: path.start.x + (path.end.x - path.start.x) * t,
		y: path.start.y + (path.end.y - path.start.y) * t,
		z,
	};
}

export function pathLength(path: MotionPath): number {
	return path.kind === "line"
		? Math.hypot(path.end.x - path.start.x, path.end.y - path.start.y, path.end.z - path.start.z)
		: Math.hypot(path.radius * path.sweep, path.end.z - path.start.z);
}

export function pathBounds(path: MotionPath): Box {
	const box: Box = { min: { ...path.start }, max: { ...path.start } };
	expandBox(box, path.end);
	if (path.kind === "arc") {
		for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
			const t = arcParameter(path, angle);
			if (t !== null) {
				expandBox(box, pointAt(path, t));
			}
		}
	}
	return box;
}

export function expandBox(box: Box, point: Vector3): void {
	for (const axis of axes) {
		box.min[axis] = Math.min(box.min[axis], point[axis]);
		box.max[axis] = Math.max(box.max[axis], point[axis]);
	}
}

export function containsBox(outer: Box, inner: Box): boolean {
	return axes.every(
		(axis) =>
			inner.min[axis] >= outer.min[axis] - EPSILON && inner.max[axis] <= outer.max[axis] + EPSILON,
	);
}

/** Exact XY containment for straight lines and circular/helical arcs. Boundary contact fits. */
export function containsPathInCircle(circle: Circle, path: MotionPath): boolean {
	const fits = (point: Point2): boolean =>
		Math.hypot(point.x - circle.center.x, point.y - circle.center.y) <= circle.radius + EPSILON;
	if (!fits(path.start) || !fits(path.end)) {
		return false;
	}
	if (path.kind === "arc") {
		// The farthest point lies on the ray from the bed center through the arc center.
		const angle = Math.atan2(path.center.y - circle.center.y, path.center.x - circle.center.x);
		const t = arcParameter(path, angle);
		if (t !== null && !fits(pointAt(path, t))) {
			return false;
		}
	}
	return true;
}

export function pointInPolygon(point: Point2, polygon: readonly Point2[]): boolean {
	let inside = false;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i]!;
		const b = polygon[(i + 1) % polygon.length]!;
		const ab = subtract(b, a);
		const ap = subtract(point, a);
		if (
			Math.abs(cross(ab, ap)) <= EPSILON * Math.max(1, Math.hypot(ab.x, ab.y)) &&
			point.x >= Math.min(a.x, b.x) - EPSILON &&
			point.x <= Math.max(a.x, b.x) + EPSILON &&
			point.y >= Math.min(a.y, b.y) - EPSILON &&
			point.y <= Math.max(a.y, b.y) + EPSILON
		) {
			return true;
		}
		if (
			a.y > point.y !== b.y > point.y &&
			point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
		) {
			inside = !inside;
		}
	}
	return inside;
}

/** Exact line/circle edge intersections plus Z clipping; no chord sampling. */
export function intersectsExclusion(path: MotionPath, zone: Exclusion): boolean {
	return testPolygonPath(path, zone, false);
}

/** Exact XY containment, including concave beds and arcs; boundary contact fits. */
export function containsPathInPolygon(polygon: readonly Point2[], path: MotionPath): boolean {
	return testPolygonPath(path, { id: "", polygon, appliesTo: "extrusion" }, true);
}

function testPolygonPath(path: MotionPath, zone: Exclusion, containAll: boolean): boolean {
	const times = [0, 1];
	const add = (t: number): void => {
		if (t >= -EPSILON && t <= 1 + EPSILON) {
			times.push(Math.max(0, Math.min(1, t)));
		}
	};
	const dz = path.end.z - path.start.z;
	if (dz !== 0) {
		if (zone.minZ !== undefined) {
			add((zone.minZ - path.start.z) / dz);
		}
		if (zone.maxZ !== undefined) {
			add((zone.maxZ - path.start.z) / dz);
		}
	}
	for (let i = 0; i < zone.polygon.length; i++) {
		const a = zone.polygon[i]!;
		const b = zone.polygon[(i + 1) % zone.polygon.length]!;
		const edge = subtract(b, a);
		if (path.kind === "line") {
			const direction = subtract(path.end, path.start);
			const offset = subtract(a, path.start);
			const denominator = cross(direction, edge);
			if (Math.abs(denominator) > EPSILON) {
				const u = cross(offset, direction) / denominator;
				if (u >= -EPSILON && u <= 1 + EPSILON) {
					add(cross(offset, edge) / denominator);
				}
			} else if (Math.abs(cross(offset, direction)) < EPSILON) {
				const length2 = direction.x ** 2 + direction.y ** 2;
				if (length2 > 0) {
					for (const p of [a, b]) {
						add(
							((p.x - path.start.x) * direction.x + (p.y - path.start.y) * direction.y) / length2,
						);
					}
				}
			}
		} else {
			const offset = subtract(a, path.center);
			const aa = edge.x ** 2 + edge.y ** 2;
			const bb = 2 * (offset.x * edge.x + offset.y * edge.y);
			const cc = offset.x ** 2 + offset.y ** 2 - path.radius ** 2;
			const discriminant = bb ** 2 - 4 * aa * cc;
			if (discriminant < -EPSILON || aa === 0) {
				continue;
			}
			for (const u of [
				(-bb - Math.sqrt(Math.max(0, discriminant))) / (2 * aa),
				(-bb + Math.sqrt(Math.max(0, discriminant))) / (2 * aa),
			]) {
				if (u < -EPSILON || u > 1 + EPSILON) {
					continue;
				}
				const t = arcParameter(
					path,
					Math.atan2(a.y + u * edge.y - path.center.y, a.x + u * edge.x - path.center.x),
				);
				if (t !== null) {
					add(t);
				}
			}
		}
	}
	const contained = (t: number): boolean => {
		const point = pointAt(path, t);
		return (
			point.z >= (zone.minZ ?? -Infinity) - EPSILON &&
			point.z <= (zone.maxZ ?? Infinity) + EPSILON &&
			pointInPolygon(point, zone.polygon)
		);
	};
	// Containment can change only at a boundary crossing. Check crossings and
	// each interval midpoint so even narrow exclusions between endpoints count.
	times.sort((a, b) => a - b);
	return containAll
		? times.every((t, i) => contained(t) && (i === 0 || contained((t + times[i - 1]!) / 2)))
		: times.some((t, i) => contained(t) || (i > 0 && contained((t + times[i - 1]!) / 2)));
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
