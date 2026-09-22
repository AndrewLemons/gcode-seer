import type { AnalysisReport } from "../contracts/analysis.js";
import type { PrinterProfile } from "../contracts/printer.js";
import type { Diagnostic } from "../contracts/syntax.js";
/** Checks consume normalized events and report metrics; they do not interpret commands. */
export interface ConstraintContext {
	readonly printer: PrinterProfile | undefined;
	readonly report: AnalysisReport;
	diagnostic(diagnostic: Diagnostic): void;
	violation(code: string, line: number, message: string): void;
}
