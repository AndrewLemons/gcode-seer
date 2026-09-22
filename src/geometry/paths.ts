import type { Box, MotionPath, Vector3 } from "../contracts/geometry.js";
import { EPSILON } from "./numeric.js";
import { arcParameter } from "./arcs.js";
const axes = ["x", "y", "z"] as const;
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
