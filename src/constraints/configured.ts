import type { PrinterProfile } from "../contracts/printer.js";
export function hasConfiguredLimits(p: PrinterProfile | undefined): boolean {
	return !!(
		p &&
		(p.travelBounds ||
			p.printBounds ||
			p.printCircle ||
			p.printArea ||
			p.maxToolheadSpeed !== undefined ||
			p.heaters?.length ||
			p.requiresToolMapping ||
			p.exclusions?.length ||
			Object.keys(p.maxSpeed ?? {}).length ||
			p.maxBedTemperature !== undefined ||
			p.maxChamberTemperature !== undefined ||
			p.tools?.length)
	);
}
