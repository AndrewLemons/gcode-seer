import type { Circle, MotionPath, Point2, Exclusion } from "../contracts/geometry.js";
import { EPSILON } from "./numeric.js";
import { arcParameter } from "./arcs.js";
import { pointAt } from "./paths.js";
const cross = (a: Point2, b: Point2): number => a.x * b.y - a.y * b.x;
const subtract = (a: Point2, b: Point2): Point2 => ({
	x: a.x - b.x,
	y: a.y - b.y,
});
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
