import { createPrinterCatalog } from "./profiles/catalog.js";
import { bambuDefinitions } from "./profiles/manufacturers/bambu.js";
import { prusaDefinitions } from "./profiles/manufacturers/prusa.js";

const catalog = createPrinterCatalog([...bambuDefinitions, ...prusaDefinitions]);
export const { createPrinterProfile, listPrinterProfiles } = catalog;
export { createPrinterCatalog };
export type {
	PrinterDefinition,
	PhysicalExtruder,
	PrinterProfileInfo,
	PrinterProfileOptions,
} from "./profiles/types.js";
