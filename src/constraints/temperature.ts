import type { TemperatureEvent } from "../contracts/events.js";
import type { ConstraintContext } from "./context.js";
export function checkTemperature(event: TemperatureEvent, context: ConstraintContext): void {
	const profile = context.printer;
	const limits =
		event.heater === "bed"
			? [profile?.maxBedTemperature]
			: event.heater === "chamber"
				? [profile?.maxChamberTemperature]
				: [
						...(profile?.heaters ?? [])
							.filter((h) => h.id === event.heater)
							.map((h) => h.maxTemperature),
						...(profile?.tools ?? [])
							.filter((t) => t.heater === event.heater)
							.map((t) => t.maxTemperature),
					];
	for (const limit of limits) {
		if (limit !== undefined && event.target > limit) {
			context.violation(
				"TEMPERATURE_LIMIT",
				event.line,
				`${event.heater} target ${event.target} °C exceeds ${limit} °C.`,
			);
			break;
		}
	}
}
