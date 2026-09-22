import type { CommandHandler } from "./types.js";
import { axes, known, emptyPosition } from "../state.js";
export const coordinatesCommands: readonly CommandHandler[] = [
	{
		codes: ["G28"],
		execute(state, _command, context) {
			const { events, diagnostic, has, validate } = context;

			if (!validate("XYZ", "XYZ")) {
				return events;
			}
			const selected = axes.filter((a) => has(a.toUpperCase()));
			for (const axis of selected.length ? selected : axes) {
				state.position[axis] = state.options.printer?.homePosition?.[axis] ?? null;
				state.offset[axis] = 0;
			}
			if (!known(state.position)) {
				diagnostic(
					"UNKNOWN_HOME",
					"Provide homePosition for each homed axis to resolve its machine coordinate.",
				);
			}
			diagnostic(
				"HOMING_NOT_SIMULATED",
				"Only the configured home endpoint is modeled; the homing trajectory is excluded.",
				"coverage",
				"info",
			);
			return events;
		},
	},
	{
		codes: ["G92"],
		execute(state, command, context) {
			const { events, diagnostic, unsupported, has, value, validate } = context;
			const { params: p } = command;

			if (!validate("XYZE")) {
				return events;
			}
			if (state.unit === null) {
				return unsupported("Coordinate reset requires known distance units.");
			}
			const resetAll = Object.keys(p).length === 0;
			for (const axis of axes) {
				if (has(axis.toUpperCase()) || resetAll) {
					const coordinate = (value(axis.toUpperCase()) ?? 0) * state.unit;
					state.offset[axis] =
						state.position[axis] === null ? null : state.position[axis] - coordinate;
					if (state.offset[axis] === null) {
						diagnostic(
							"UNKNOWN_ORIGIN",
							`G92 ${axis.toUpperCase()} cannot establish a machine position without a known current position.`,
						);
					}
				}
			}
			if (has("E") || resetAll) {
				if (state.tool === null) {
					return unsupported("E reset requires a known tool.");
				}
				state.extrusionRegisters.set(
					state.register(),
					(value("E") ?? 0) * (state.volumetric.has(state.tool) ? state.unit ** 3 : state.unit),
				);
			}
			return events;
		},
	},
	{
		codes: ["M18", "M84"],
		execute(state, _command, context) {
			const { events, has, validate } = context;

			if (!validate("XYZES", "XYZE")) {
				return events;
			}
			if (!has("S")) {
				state.position = emptyPosition();
			}
			return events;
		},
	},
];
