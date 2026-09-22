/** Output distances are millimeters, speeds mm/s, times seconds, temperatures Celsius. */
export type Axis = "x" | "y" | "z";

export type Vector3 = Record<Axis, number>;

export type Position = Record<Axis, number | null>;

export type AxisSpeeds = Vector3 & { e: number };

export interface Box {
	min: Vector3;
	max: Vector3;
}

export interface Point2 {
	x: number;
	y: number;
}

/** Circular printable XY area; Z limits may be supplied independently in printBounds. */
export interface Circle {
	center: Point2;
	radius: number;
}

export interface Exclusion {
	id: string;
	/** Simple polygon without a repeated closing vertex. Boundary contact is a violation. */
	polygon: readonly Point2[];
	minZ?: number;
	maxZ?: number;
	appliesTo: "all" | "extrusion";
}

export interface LinearPath {
	kind: "line";
	start: Vector3;
	end: Vector3;
}

export interface ArcPath {
	kind: "arc";
	start: Vector3;
	end: Vector3;
	center: Point2;
	radius: number;
	startAngle: number;
	/** Signed radians, negative for clockwise. XY arcs may interpolate Z. */
	sweep: number;
}

export type MotionPath = LinearPath | ArcPath;
