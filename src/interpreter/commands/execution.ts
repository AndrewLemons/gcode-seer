import type { CommandHandler } from "./types.js";
export const executionCommands: readonly CommandHandler[] = [
	{
		codes: ["M400"],
		execute(state, command, context) {
			const { events, invalid, unsupported, has, value, validate } = context;
			const { line } = command;

			if (
				!validate(
					state.dialect.timedPlannerWait === true
						? state.dialect.interactivePlannerWait
							? "SPU"
							: "SP"
						: "",
				)
			) {
				return events;
			}
			if (has("U") && state.dialect.interactivePlannerWait) {
				state.suspended = true;
				return unsupported("M400 U requires user interaction. Interpretation stops here.");
			}
			const seconds = (value("S") ?? 0) + (value("P") ?? 0) / 1000;
			if (seconds < 0) {
				return invalid("Wait duration cannot be negative.");
			}
			if (seconds) {
				events.push({ type: "dwell", line, seconds });
			}
			return events;
		},
	},
	{
		codes: ["G4"],
		execute(_state, command, context) {
			const { events, invalid, has, value, validate } = context;
			const { line } = command;

			if (!validate("PS")) {
				return events;
			}
			if (has("P") && has("S")) {
				return invalid("Specify one dwell duration, P or S.");
			}
			const seconds = value("S") ?? (value("P") ?? 0) / 1000;
			if (seconds < 0) {
				return invalid("Dwell duration cannot be negative.");
			}
			events.push({ type: "dwell", line, seconds });
			return events;
		},
	},
	{
		codes: ["M201", "M203", "M204", "M205"],
		execute(_state, command, context) {
			const { events, diagnostic, invalid, validate } = context;
			const { code, params: p } = command;

			if (!validate(code === "M204" ? "PRST" : code === "M205" ? "BESXYZJ" : "XYZE")) {
				return events;
			}
			if (Object.values(p).some((v) => v !== null && v < 0)) {
				return invalid("Planner settings cannot be negative.");
			}
			diagnostic(
				"PLANNER_SETTINGS",
				"Planner settings do not change the reported requested speeds or constant-feed duration.",
				"coverage",
				"info",
			);
			return events;
		},
	},
	{
		codes: ["M211", "M302"],
		execute(_state, command, context) {
			const { diagnostic, unsupported } = context;
			const { code } = command;

			diagnostic(
				"SAFETY_OVERRIDE",
				`${code} changes firmware safety protections.`,
				"constraint",
				"error",
			);
			return unsupported("Safety protection settings are not simulated.");
		},
	},
	{
		codes: ["M0", "M1", "M25", "M600", "M112", "M2", "M30"],
		execute(state, _command, context) {
			const { unsupported } = context;

			state.suspended = true;
			return unsupported(
				"Stop, pause or filament-change execution requires runtime information. Interpretation stops here.",
			);
		},
	},
];
