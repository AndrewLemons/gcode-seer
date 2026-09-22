export const EPSILON = 1e-7;
export const TAU = 2 * Math.PI;
export const normalized = (angle: number): number => ((angle % TAU) + TAU) % TAU;
