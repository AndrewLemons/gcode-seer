import { analyzeStream, createBambuX1CarbonPrintProfile } from "../src/index.js";

export async function analyzeFile(path: string): Promise<void> {
	const report = await analyzeStream(Bun.file(path).stream(), {
		printer: createBambuX1CarbonPrintProfile(),
	});
	console.log(JSON.stringify(report, null, 2));
}
