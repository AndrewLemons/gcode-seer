import { pathBounds, expandBox } from "../geometry.js";
import type { Box, Vector3 } from "../contracts/geometry.js";
import type { MoveEvent } from "../contracts/events.js";
export function moveBounds(move: MoveEvent): Box | null {
	return move.path
		? pathBounds(move.path)
		: Object.values(move.end).every((v) => v !== null)
			? { min: { ...move.end } as Vector3, max: { ...move.end } as Vector3 }
			: null;
}
export const mergeBounds = (existing: Box | null, addition: Box): Box => {
	if (!existing) {
		return { min: { ...addition.min }, max: { ...addition.max } };
	}

	expandBox(existing, addition.min);
	expandBox(existing, addition.max);
	return existing;
};
