import type { CommandHandler } from "./types.js";
export const extrusionCommands: readonly CommandHandler[] = [
	{
		codes: ["M220", "M221"],
		execute(state, command, context) {
			const { events, invalid, unsupported, value, validate } = context;
			const { code } = command;

			if (!validate(code === "M220" ? "S" : "ST")) {
				return events;
			}
			const percent = value("S");
			if (percent === undefined) {
				return unsupported(
					"Override query/default forms require firmware-specific interpretation.",
				);
			}
			if (percent < 0 || percent > 10000) {
				return invalid("Override S must be between 0 and 10000 percent.");
			}
			if (code === "M220") {
				state.speedFactor = percent / 100;
			} else {
				const target = value("T") ?? state.tool;
				if (target === null) {
					return unsupported("Flow override requires a known tool.");
				}
				if (!Number.isInteger(target) || target < 0 || target > 255) {
					return invalid("Invalid flow override tool.");
				}
				state.flowFactors.set(target, percent / 100);
			}
			return events;
		},
	},
	{
		codes: ["M200"],
		execute(state, _command, context) {
			const { events, invalid, unsupported, value, validate } = context;

			if (!validate("DT")) {
				return events;
			}
			const diameter = value("D");
			const target = value("T") ?? state.tool;
			if (diameter === undefined) {
				return unsupported("M200 query forms require firmware-specific interpretation.");
			}
			if (target === null) {
				return unsupported("M200 requires a known tool.");
			}
			if (
				diameter < 0 ||
				diameter > 100 ||
				!Number.isInteger(target) ||
				target < 0 ||
				target > 255
			) {
				return invalid("M200 requires a valid tool and D between 0 and 100 mm.");
			}
			if (state.unit === null) {
				return unsupported("M200 requires known distance units.");
			}
			state.volumetricKnown.add(target);
			if (diameter === 0) {
				state.volumetric.delete(target);
			} else {
				state.volumetric.set(target, Math.PI * ((diameter * state.unit) / 2) ** 2);
			}
			return events;
		},
	},
];
