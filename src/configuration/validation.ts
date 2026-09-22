import type { Box, Point2 } from "../types.js";
export const finite = (value: number, name: string): void => {
	if (!Number.isFinite(value) || Math.abs(value) > 1e12) {
		throw new TypeError(`${name} must be finite and within ±1e12.`);
	}
};

export const nonnegative = (value: number, name: string): void => {
	finite(value, name);
	if (value < 0) {
		throw new TypeError(`${name} cannot be negative.`);
	}
};

export const box = (value: Box, name: string): void => {
	for (const axis of ["x", "y", "z"] as const) {
		finite(value.min[axis], `${name}.min.${axis}`);
		finite(value.max[axis], `${name}.max.${axis}`);
		if (value.min[axis] > value.max[axis]) {
			throw new TypeError(`${name} has inverted ${axis} limits.`);
		}
	}
};

export function validatePolygon(polygon: readonly Point2[]): void {
	if (polygon.length < 3 || polygon.length > 10000) {
		throw new TypeError("Exclusions require 3 to 10000 vertices.");
	}
	for (const point of polygon) {
		finite(point.x, "polygon.x");
		finite(point.y, "polygon.y");
	}
	let area = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i]!;
		const b = polygon[(i + 1) % polygon.length]!;
		if (a.x === b.x && a.y === b.y) {
			throw new TypeError("Polygon edges cannot have zero length.");
		}
		area += a.x * b.y - a.y * b.x;
		for (let j = i + 2; j < polygon.length; j++) {
			if (i === 0 && j === polygon.length - 1) {
				continue;
			}
			const c = polygon[j]!;
			const d = polygon[(j + 1) % polygon.length]!;
			const orient = (p: Point2, q: Point2, r: Point2): number =>
				(q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
			const overlap =
				Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
					Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
				Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
					Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
			if (
				overlap &&
				orient(a, b, c) * orient(a, b, d) <= 0 &&
				orient(c, d, a) * orient(c, d, b) <= 0
			) {
				throw new TypeError("Exclusion polygons must not self-intersect.");
			}
		}
	}
	if (Math.abs(area) < 1e-10) {
		throw new TypeError("Exclusion polygon has no area.");
	}
}
