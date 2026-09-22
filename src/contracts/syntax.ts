export type Severity = "info" | "warning" | "error";

export type DiagnosticCategory = "syntax" | "semantic" | "coverage" | "constraint";

export interface Diagnostic {
	code: string;
	severity: Severity;
	category: DiagnosticCategory;
	line: number;
	message: string;
	command?: string;
}

export interface Command {
	code: string;
	/** Null denotes a bare flag, such as X in G28 X. */
	params: Readonly<Record<string, number | null>>;
	line: number;
	raw: string;
	payload?: string;
}

export interface ParsedLine {
	command: Command | null;
	diagnostics: readonly Diagnostic[];
}
