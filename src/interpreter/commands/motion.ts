import { arcParameter, createArc, pathLength } from "../../geometry.js";
import type { AxisSpeeds, MotionPath } from "../../contracts/geometry.js";
import { axes, known } from "../state.js";
import type { CommandHandler } from "./types.js";
export const motionCommands: readonly CommandHandler[] = [
	{
		codes: ["G0", "G1", "G2", "G3"],
		execute(state, command, context) {
			const { code, line } = command;
			const { events, diagnostic, invalid, unsupported, has, value, validate } = context;
			const isArc = code === "G2" || code === "G3";
			if (!validate(isArc ? "XYZEFIJR" : "XYZEF")) {
				return events;
			}

			if (state.unit === null || state.absolute === null) {
				return unsupported("Movement units or positioning mode are unknown.");
			}

			if (value("F") !== undefined) {
				if (value("F")! <= 0) {
					return invalid("Feedrate must be positive.");
				}
				state.feedrate = (value("F")! * state.unit) / 60;
			}

			if (!isArc && !"XYZE".split("").some(has)) {
				return events;
			}

			if (isArc && state.plane !== "G17") {
				return unsupported("Only XY arcs are modeled in this release.");
			}
			const start = { ...state.position };
			const end = { ...start };
			for (const axis of axes) {
				const coordinate = value(axis.toUpperCase());
				if (coordinate !== undefined) {
					const base = state.absolute ? state.offset[axis] : start[axis];
					end[axis] = base === null ? null : base + coordinate * state.unit;
				}
			}

			// E registers store requested coordinates; flow scaling applies only to their delta.
			let extrusion: number | null = 0;
			if (has("E")) {
				if (state.tool === null) {
					extrusion = null;
				} else {
					const register = state.register();
					const previous = state.extrusionRegisters.get(register) ?? null;
					const area = state.volumetric.get(state.tool);
					const requested = value("E")! * (area === undefined ? state.unit : state.unit ** 3);
					const mode =
						state.dialect.extrusionMode === "relative-override"
							? state.extruderAbsolute === null
								? null
								: state.absolute && state.extruderAbsolute
							: state.extruderAbsolute;
					const delta =
						mode === null || (mode && previous === null)
							? null
							: mode
								? requested - previous!
								: requested;
					state.extrusionRegisters.set(
						register,
						mode === null
							? null
							: mode
								? requested
								: previous === null
									? null
									: previous + requested,
					);
					const flow = state.flowFactors.get(state.tool) ?? (state.uncertainTools ? null : 1);
					extrusion =
						delta === null ||
						flow === null ||
						(state.uncertainTools && !state.volumetricKnown.has(state.tool))
							? null
							: (delta / (area ?? 1)) * flow;
				}
				if (extrusion === null) {
					diagnostic(
						"UNKNOWN_EXTRUSION",
						"Extrusion needs a known tool, E mode, flow multiplier and absolute E baseline.",
					);
				}
			}

			// Validate the complete path before publishing a move event.
			let path: MotionPath | null = null;
			if (known(start) && known(end)) {
				if (isArc) {
					try {
						path = createArc(start, end, code === "G2", {
							...(has("I") ? { i: value("I")! * state.unit } : {}),
							...(has("J") ? { j: value("J")! * state.unit } : {}),
							...(has("R") ? { r: value("R")! * state.unit } : {}),
						});
					} catch (error) {
						return invalid(error instanceof Error ? error.message : "Invalid arc.");
					}
				} else {
					path = { kind: "line", start, end };
				}
			} else {
				diagnostic(
					"UNKNOWN_POSITION",
					"The full motion path cannot be resolved from known machine coordinates.",
				);
			}
			state.position = { ...end };
			const distance = path === null ? null : pathLength(path);
			const feedrate =
				state.feedrate === null || state.speedFactor === null
					? null
					: state.feedrate * state.speedFactor;
			// Pure E moves use filament distance as their timing reference.
			const timingDistance =
				distance === null
					? null
					: distance > 0
						? distance
						: extrusion === null
							? null
							: Math.abs(extrusion);
			const duration =
				timingDistance === 0
					? 0
					: feedrate === null || feedrate === 0 || timingDistance === null
						? null
						: timingDistance / feedrate;
			if (duration === null) {
				diagnostic(
					"UNKNOWN_DURATION",
					"Move duration and axis speeds require a resolved path, E delta and positive feedrate.",
				);
			}
			let axisSpeeds: AxisSpeeds | null = null;
			if (duration !== null && path !== null) {
				axisSpeeds = { x: 0, y: 0, z: 0, e: 0 };
				if (duration > 0) {
					for (const axis of axes) {
						axisSpeeds[axis] = Math.abs(path.end[axis] - path.start[axis]) / duration;
					}
					axisSpeeds.e = Math.abs(extrusion ?? 0) / duration;
					if (path.kind === "arc") {
						const angularSpeed = Math.abs(path.sweep) / duration;
						let sin = Math.max(
							Math.abs(Math.sin(path.startAngle)),
							Math.abs(Math.sin(path.startAngle + path.sweep)),
						);
						let cos = Math.max(
							Math.abs(Math.cos(path.startAngle)),
							Math.abs(Math.cos(path.startAngle + path.sweep)),
						);
						if ([Math.PI / 2, Math.PI * 1.5].some((a) => arcParameter(path, a) !== null)) {
							sin = 1;
						}
						if ([0, Math.PI].some((a) => arcParameter(path, a) !== null)) {
							cos = 1;
						}
						axisSpeeds.x = path.radius * angularSpeed * sin;
						axisSpeeds.y = path.radius * angularSpeed * cos;
					}
				}
			}

			// Reject overflow and underflow before non-finite metrics reach a report.
			const computed = [
				...Object.values(end),
				extrusion,
				feedrate,
				distance,
				duration,
				...Object.values(axisSpeeds ?? {}),
			];
			if (
				computed.some((value) => value !== null && !Number.isFinite(value)) ||
				(timingDistance !== null && timingDistance > 0 && duration === 0)
			) {
				return invalid("Movement exceeds the supported numeric precision or range.");
			}

			if (state.tool === null) {
				diagnostic("UNKNOWN_ACTIVE_TOOL", "Movement cannot be attributed to a known tool.");
			}
			events.push({
				type: "move",
				line,
				tool: state.tool ?? -1,
				start,
				end,
				path,
				distance,
				extrusion,
				feedrate,
				duration,
				axisSpeeds,
			});
			return events;
		},
	},
];
