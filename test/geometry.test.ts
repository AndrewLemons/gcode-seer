import { describe, expect, it } from "bun:test";
import {
	analyze,
	createArc,
	intersectsExclusion,
	pathBounds,
	pathLength,
	pointAt,
} from "../src/index.js";
import type { Exclusion, LinearPath, PrinterProfile } from "../src/index.js";

const origin = { x: 0, y: 0, z: 0 };
const base = { initialPosition: origin, initialExtrusion: 0 };
const square: Exclusion = {
	id: "clip",
	appliesTo: "all",
	polygon: [
		{ x: 4, y: -1 },
		{ x: 6, y: -1 },
		{ x: 6, y: 1 },
		{ x: 4, y: 1 },
	],
};
const line: LinearPath = {
	kind: "line",
	start: origin,
	end: { x: 10, y: 0, z: 0 },
};
const printer: PrinterProfile = { name: "test", exclusions: [square] };

describe("continuous geometry", () => {
	it("detects a crossed exclusion when both endpoints are clear", () => {
		expect(intersectsExclusion(line, square)).toBe(true);
		expect(analyze("G1 X10 F600", { ...base, printer }).constraints).toBe("violated");
	});

	it("includes tangency and collinear overlap", () => {
		expect(
			intersectsExclusion(
				{ ...line, start: { ...origin, y: 1 }, end: { x: 10, y: 1, z: 0 } },
				square,
			),
		).toBe(true);
		expect(
			intersectsExclusion(
				{ ...line, start: { x: 3, y: 2, z: 0 }, end: { x: 4, y: 1, z: 0 } },
				square,
			),
		).toBe(true);
	});

	it("respects Z-limited exclusions during the whole move", () => {
		expect(
			intersectsExclusion(
				{ ...line, end: { x: 10, y: 0, z: 10 } },
				{ ...square, minZ: 7, maxZ: 10 },
			),
		).toBe(false);
		expect(
			intersectsExclusion(
				{ ...line, end: { x: 10, y: 0, z: 10 } },
				{ ...square, minZ: 4.5, maxZ: 4.6 },
			),
		).toBe(true);
	});

	it("checks vertical paths inside a prism", () => {
		expect(
			intersectsExclusion(
				{
					kind: "line",
					start: { x: 5, y: 0, z: 0 },
					end: { x: 5, y: 0, z: 10 },
				},
				{ ...square, minZ: 4, maxZ: 5 },
			),
		).toBe(true);
	});

	it("supports concave polygons", () => {
		const concave: Exclusion = {
			...square,
			polygon: [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 2 },
				{ x: 2, y: 2 },
				{ x: 2, y: 10 },
				{ x: 0, y: 10 },
			],
		};
		expect(
			intersectsExclusion(
				{
					kind: "line",
					start: { x: 3, y: 3, z: 0 },
					end: { x: 8, y: 8, z: 0 },
				},
				concave,
			),
		).toBe(false);
	});

	it("distinguishes print exclusions from travel exclusions", () => {
		const options = {
			...base,
			printer: {
				...printer,
				exclusions: [{ ...square, appliesTo: "extrusion" as const }],
			},
		};
		expect(analyze("G1 X10 F600", options).constraints).toBe("passed");
		expect(analyze("G1 X10 E1 F600", options).constraints).toBe("violated");
	});

	it("finds circular extrema that are absent from endpoints", () => {
		const arc = createArc({ x: 10, y: 0, z: 0 }, { x: -10, y: 0, z: 2 }, false, { i: -10 });
		expect(pathBounds(arc).max.y).toBeCloseTo(10);
		expect(pathLength(arc)).toBeCloseTo(Math.hypot(10 * Math.PI, 2));
		expect(pointAt(arc, 0.5).z).toBe(1);
		const report = analyze("G3 X-10 Y0 Z2 I-10 F600", {
			initialPosition: { x: 10, y: 0, z: 0 },
			printer: {
				name: "short",
				travelBounds: {
					min: { x: -20, y: -20, z: 0 },
					max: { x: 20, y: 9, z: 10 },
				},
			},
		});
		expect(report.constraints).toBe("violated");
		expect(report.maxAxisSpeed.x).toBeCloseTo((10 * Math.PI) / report.nominalDuration);
	});

	it("detects narrow exclusions along the arc instead of testing the chord", () => {
		const arc = createArc({ x: 10, y: 0, z: 0 }, { x: -10, y: 0, z: 0 }, false, { i: -10 });
		const narrow = {
			...square,
			polygon: [
				{ x: -0.001, y: 9.999 },
				{ x: 0.001, y: 9.999 },
				{ x: 0.001, y: 10.001 },
				{ x: -0.001, y: 10.001 },
			],
		};
		expect(intersectsExclusion(arc, narrow)).toBe(true);
		expect(intersectsExclusion({ kind: "line", start: arc.start, end: arc.end }, narrow)).toBe(
			false,
		);
	});

	it("distinguishes short and long signed-radius arcs", () => {
		const start = { x: 1, y: 0, z: 0 };
		const end = { x: 0, y: 1, z: 0 };
		expect(createArc(start, end, false, { r: 1 }).sweep).toBeCloseTo(Math.PI / 2);
		expect(createArc(start, end, false, { r: -1 }).sweep).toBeCloseTo((3 * Math.PI) / 2);
		expect(createArc(start, end, true, { r: 1 }).sweep).toBeCloseTo(-Math.PI / 2);
	});

	it("handles clockwise full circles and helical clipping", () => {
		const arc = createArc({ x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, true, {
			i: -10,
		});
		expect(arc.sweep).toBeCloseTo(-Math.PI * 2);
		expect(pathBounds(arc)).toEqual({
			min: { x: -10, y: -10, z: 0 },
			max: { x: 10, y: 10, z: 10 },
		});
		const zone = {
			...square,
			polygon: [
				{ x: -1, y: 9 },
				{ x: 1, y: 9 },
				{ x: 1, y: 11 },
				{ x: -1, y: 11 },
			],
		};
		expect(intersectsExclusion(arc, { ...zone, minZ: 7, maxZ: 8 })).toBe(true);
		expect(intersectsExclusion(arc, { ...zone, minZ: 1, maxZ: 2 })).toBe(false);
	});

	it("rejects impossible or ambiguous arcs", () => {
		expect(() => createArc(origin, origin, false, { r: 1 })).toThrow();
		expect(() => createArc(origin, { x: 10, y: 0, z: 0 }, false, { r: 1 })).toThrow();
		expect(() => createArc(origin, { x: 1, y: 0, z: 0 }, false, { i: 1, r: 1 })).toThrow();
		expect(() => createArc(origin, { x: 1, y: 0, z: 0 }, false, {})).toThrow();
	});

	it("analytical bounds contain densely evaluated points over many arcs", () => {
		for (let i = 1; i <= 100; i++) {
			const angle = i * 0.061;
			const radius = i / 3;
			const arc = createArc(
				{ x: radius, y: 0, z: -1 },
				{ x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: 3 },
				i % 2 === 0,
				{ i: -radius },
			);
			const bounds = pathBounds(arc);
			for (let j = 0; j <= 100; j++) {
				const p = pointAt(arc, j / 100);
				for (const axis of ["x", "y", "z"] as const) {
					expect(p[axis]).toBeGreaterThanOrEqual(bounds.min[axis] - 1e-7);
					expect(p[axis]).toBeLessThanOrEqual(bounds.max[axis] + 1e-7);
				}
			}
		}
	});
});
