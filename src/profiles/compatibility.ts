import { bambuDialect } from "../dialects.js";
import { bambuExclusion } from "./importers/bambu.js";
import type { PrinterProfile } from "../types.js";
/** @deprecated Use createPrinterProfile for catalog profiles. Printable geometry only. This deliberately does not claim to describe the service travel envelope. */
export function createBambuX1CarbonPrintProfile(): PrinterProfile {
	return {
		name: "Bambu Lab X1 Carbon printable geometry",
		dialect: bambuDialect,
		printBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 256, y: 256, z: 250 } },
		exclusions: [bambuExclusion(["0x0", "18x0", "18x28", "0x28"])],
	};
}
