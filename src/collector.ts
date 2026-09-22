import type { AnalysisEvent } from "./contracts/events.js";
import type { AnalysisReport, AnalyzeOptions } from "./contracts/analysis.js";
import type { Diagnostic } from "./contracts/syntax.js";
import { moveBounds } from "./reporting/bounds.js";
import { createReport } from "./reporting/report.js";
import { collectMove, collectTemperature } from "./reporting/metrics.js";
import { hasConfiguredLimits } from "./constraints/configured.js";
import { checkGeometry } from "./constraints/geometry.js";
import { checkToolMapping } from "./constraints/tools.js";
import { checkToolheadSpeed, checkAxisSpeeds } from "./constraints/speed.js";
import { checkExtrusion } from "./constraints/extrusion.js";
import { checkTemperature } from "./constraints/temperature.js";
import type { ConstraintContext } from "./constraints/context.js";

/** Event orchestration and bounded diagnostics; metrics and checks are separate consumers. */
export class Collector implements ConstraintContext {
	readonly report: AnalysisReport;
	private invalid = false;
	private unsupported = false;
	private violated = false;
	private readonly limits: boolean;
	constructor(private readonly options: AnalyzeOptions) {
		this.limits = hasConfiguredLimits(options.printer);
		this.report = createReport(options.printer);
	}
	get printer() {
		return this.options.printer;
	}
	diagnostic(diagnostic: Diagnostic): void {
		const r = this.report;
		r.diagnosticCounts[diagnostic.severity]++;
		if (r.diagnostics.length < (this.options.maxDiagnostics ?? 1000)) {
			r.diagnostics.push({ ...diagnostic });
		} else {
			r.droppedDiagnostics++;
		}

		if (diagnostic.category === "syntax" || diagnostic.category === "semantic") {
			if (diagnostic.severity === "error") {
				this.invalid = true;
				r.complete = false;
			}
		}

		if (diagnostic.category === "coverage" && diagnostic.severity !== "info") {
			r.complete = false;
			if (["UNSUPPORTED_COMMAND", "UNSUPPORTED_PARAMETER"].includes(diagnostic.code)) {
				this.unsupported = true;
			}
		}

		if (diagnostic.category === "constraint" && diagnostic.severity === "error") {
			this.violated = true;
		}
	}

	event(event: AnalysisEvent): void {
		if (event.type === "diagnostic") {
			this.diagnostic(event.diagnostic);
			return;
		}
		switch (event.type) {
			case "move": {
				const bounds = moveBounds(event);
				collectMove(this.report, event, this.printer, bounds);
				checkToolMapping(event, this);
				checkToolheadSpeed(event, this);
				checkGeometry(event, this, bounds);
				checkAxisSpeeds(event, this);
				checkExtrusion(event, this);
				break;
			}
			case "temperature":
				collectTemperature(this.report, event);
				checkTemperature(event, this);
				break;
			case "dwell":
				this.report.nominalDuration += event.seconds;
				break;
			case "tool":
				this.report.toolChanges++;
				break;
		}
		for (const rule of this.options.rules ?? []) {
			for (const diagnostic of rule.onEvent(event)) {
				this.diagnostic(diagnostic);
			}
		}
	}
	violation(code: string, line: number, message: string): void {
		this.diagnostic({
			code,
			line,
			message,
			category: "constraint",
			severity: "error",
		});
	}

	finish(): AnalysisReport {
		const r = this.report;
		if (r.commands === 0) {
			this.diagnostic({
				code: "EMPTY_PROGRAM",
				line: 0,
				message: "Input contains no executable commands.",
				severity: "error",
				category: "semantic",
			});
		}
		r.validity = this.invalid ? "invalid" : this.unsupported ? "unknown" : "valid";
		r.constraints = this.violated
			? "violated"
			: !this.limits
				? "not-configured"
				: r.complete
					? "passed"
					: "unknown";
		return r;
	}
}
