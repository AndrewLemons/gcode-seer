import { createPrinterProfile } from "../printer-catalog.js";
import type { PrinterProfile } from "../contracts/printer.js";

/** @deprecated Use createPrinterProfile. Retains the original geometry-only API. */
export function createBambuX1CarbonPrintProfile(): PrinterProfile {
	const profile = createPrinterProfile("bambu-x1-carbon");
	return {
		name: "Bambu Lab X1 Carbon printable geometry",
		dialect: profile.dialect!,
		printBounds: profile.printBounds!,
		exclusions: profile.exclusions!,
	};
}
