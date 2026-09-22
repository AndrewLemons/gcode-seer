import type { Box, Point2 } from "../types.js";
import type { Size } from "./types.js";

export const bounds = (size: Size, min: Size = [0, 0, 0]): Box => ({
	min: { x: min[0], y: min[1], z: min[2] },
	max: { x: size[0], y: size[1], z: size[2] },
});

export const rectangle = (x: number, y: number, maxX: number, maxY: number): Point2[] => [
	{ x, y },
	{ x: maxX, y },
	{ x: maxX, y: maxY },
	{ x, y: maxY },
];
