import type { CommandHandler } from "./types.js";
export const temperatureCommands: readonly CommandHandler[] = [
	{
		codes: ["M149"],
		execute(state, command, context) {
			const { events, invalid, validate } = context;
			const { params: p } = command;

			if (!validate("CFK", "CFK")) {
				return events;
			}
			const units = Object.keys(p);
			if (units.length !== 1) {
				return invalid("M149 requires exactly one temperature unit.");
			}
			state.temperatureUnit = units[0] as "C" | "F" | "K";
			return events;
		},
	},
	{
		codes: ["M104", "M109", "M140", "M190", "M141", "M191"],
		execute(state, command, context) {
			const { events, diagnostic, invalid, unsupported, has, value, validate } = context;
			const { code, line } = command;

			const hotend = code === "M104" || code === "M109";
			const wait = ["M109", "M190", "M191"].includes(code);
			const cooling = code === "M191" && state.dialect.chamberCooling === true;
			if (!validate(`${wait ? "SR" : "S"}${hotend ? "T" : ""}${cooling ? "C" : ""}`)) {
				return events;
			}
			if (["S", "R", "C"].filter(has).length > 1) {
				return invalid("A temperature command must specify only one target.");
			}
			const target =
				value("S") ?? (wait ? value("R") : undefined) ?? (cooling ? value("C") : undefined);
			if (target === undefined) {
				return unsupported(
					"Temperature commands without explicit targets require firmware-specific interpretation.",
				);
			}
			if (state.temperatureUnit === null) {
				return unsupported("Temperature units are unknown after an unsupported command.");
			}
			const celsius =
				state.temperatureUnit === "F"
					? ((target - 32) * 5) / 9
					: state.temperatureUnit === "K"
						? target - 273.15
						: target;
			if (celsius < -273.15 || celsius > 10000) {
				return invalid("Temperature target is outside the supported range.");
			}
			const tool = value("T") ?? state.tool;
			if (hotend && (tool === null || !Number.isInteger(tool) || tool < 0 || tool > 255)) {
				return unsupported("Temperature command has an unknown or invalid tool.");
			}
			const profile = state.options.printer?.tools?.find((t) => t.id === tool);
			const mappedHeater = has("T") ? state.options.printer?.heaterTargets?.[tool!] : undefined;
			if (
				hotend &&
				has("T") &&
				state.dialect.strictHeaterSelectors === true &&
				state.options.printer?.heaterTargets &&
				mappedHeater === undefined
			) {
				diagnostic(
					"UNKNOWN_HEATER",
					`Physical heater selector ${tool} is absent from the printer profile.`,
					"constraint",
					"error",
				);
				return events;
			}
			if (hotend && state.options.printer?.requiresToolMapping && !profile && !mappedHeater) {
				diagnostic(
					"UNKNOWN_TOOL_MAPPING",
					"Cannot attribute this temperature to a physical heater without the job's tool mapping.",
				);
				return events;
			}
			if (hotend && state.options.printer?.tools && !profile && !mappedHeater) {
				diagnostic(
					"UNKNOWN_TOOL",
					`Heater tool ${tool} is absent from the printer profile.`,
					"constraint",
					"error",
				);
			}
			events.push({
				type: "temperature",
				line,
				heater: hotend
					? (mappedHeater ?? profile?.heater ?? `tool:${tool}`)
					: ["M140", "M190"].includes(code)
						? "bed"
						: "chamber",
				target: celsius,
				wait,
			});
			return events;
		},
	},
];
