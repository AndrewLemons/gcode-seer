import type { Exclusion } from "../../types.js";
import { validatePolygon } from "../../configuration/validation.js";
/** Convert Bambu Studio's flat "XxY" array. Supply a resolved profile, after inheritance. */
export function bambuExclusion(
	points: readonly string[],
	options: {
		id?: string;
		minZ?: number;
		maxZ?: number;
		appliesTo?: "all" | "extrusion";
	} = {},
): Exclusion {
	const polygon = points.map((point) => {
		const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))x([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/.exec(
			point,
		);
		if (!match) {
			throw new TypeError(`Invalid Bambu exclusion point: ${point}`);
		}
		return { x: Number(match[1]), y: Number(match[2]) };
	});
	validatePolygon(polygon);
	return {
		id: options.id ?? "bed-exclusion",
		polygon,
		appliesTo: options.appliesTo ?? "extrusion",
		...(options.minZ !== undefined ? { minZ: options.minZ } : {}),
		...(options.maxZ !== undefined ? { maxZ: options.maxZ } : {}),
	};
}
