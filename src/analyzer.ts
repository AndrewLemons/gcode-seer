import { Collector } from "./collector.js";
import { LineFramer } from "./line-framer.js";
import { Interpreter } from "./interpreter.js";
import { parseLine } from "./parser.js";
import { validateOptions } from "./configuration/options.js";
import type { AnalysisReport, AnalyzeOptions } from "./contracts/analysis.js";

/** Incremental analyzer accepting complete physical lines. finish() closes the instance. */
export class GcodeAnalyzer {
	private readonly collector: Collector;
	private readonly interpreter: Interpreter;
	private finished = false;
	private readonly options: AnalyzeOptions;

	constructor(options: AnalyzeOptions = {}) {
		validateOptions(options);
		// Isolate configuration from caller mutations without cloning callbacks or AbortSignal.
		this.options = {
			...options,
			...(options.adapters ? { adapters: [...options.adapters] } : {}),
			...(options.rules ? { rules: [...options.rules] } : {}),
			...(options.printer ? { printer: structuredClone(options.printer) } : {}),
			...(options.dialect ? { dialect: structuredClone(options.dialect) } : {}),
			...(options.initialPosition ? { initialPosition: { ...options.initialPosition } } : {}),
		};
		this.collector = new Collector(this.options);
		this.interpreter = new Interpreter(this.options);
	}

	/** Null is reserved for an oversized line discarded by the streaming framer. */
	addLine(raw: string | null): void {
		if (this.finished) {
			throw new Error("This analyzer has already finished.");
		}
		this.options.signal?.throwIfAborted();
		const line = ++this.collector.report.lines;
		if (raw === null || raw.length > (this.options.maxLineLength ?? 65536)) {
			this.collector.diagnostic({
				code: "LINE_TOO_LONG",
				line,
				message: "Line exceeds maxLineLength.",
				severity: "error",
				category: "syntax",
			});
			this.interpreter.invalidate();
			return;
		}
		if (/[\r\n]/.test(raw)) {
			throw new TypeError("addLine expects one line without a line terminator.");
		}
		const parsed = parseLine(raw, line, this.interpreter.dialect);
		for (const diagnostic of parsed.diagnostics) {
			this.collector.diagnostic(diagnostic);
			this.options.onEvent?.({ type: "diagnostic", diagnostic });
		}
		if (parsed.diagnostics.some((d) => d.severity === "error")) {
			this.interpreter.invalidate();
		}
		if (parsed.command) {
			this.collector.report.commands++;
			for (const event of this.interpreter.process(parsed.command)) {
				this.collector.event(event);
				this.options.onEvent?.(event);
			}
		}
	}

	finish(): AnalysisReport {
		if (this.finished) {
			throw new Error("This analyzer has already finished.");
		}
		this.options.signal?.throwIfAborted();
		this.finished = true;
		this.collector.report.finalPosition = this.interpreter.finalPosition;
		return this.collector.finish();
	}
}

/** Analyze a complete G-code string without retaining commands or toolpaths. */
export function analyze(text: string, options: AnalyzeOptions = {}): AnalysisReport {
	const analyzer = new GcodeAnalyzer(options);
	const framer = new LineFramer((line) => analyzer.addLine(line), options.maxLineLength ?? 65536);
	framer.push(text);
	framer.finish();
	return analyzer.finish();
}
/** Chunks may be UTF-8 bytes or text. Node Readable streams and Web streams are async iterables. */
export async function analyzeStream(
	chunks: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>,
	options: AnalyzeOptions = {},
): Promise<AnalysisReport> {
	const analyzer = new GcodeAnalyzer(options);
	const framer = new LineFramer((line) => analyzer.addLine(line), options.maxLineLength ?? 65536);
	const decoder = new TextDecoder("utf-8", { fatal: true });
	for await (const chunk of chunks) {
		options.signal?.throwIfAborted();
		if (typeof chunk === "string") {
			framer.push(decoder.decode());
			framer.push(chunk);
		} else if (chunk instanceof Uint8Array) {
			framer.push(decoder.decode(chunk, { stream: true }));
		} else {
			throw new TypeError("Expected text or Uint8Array chunks.");
		}
	}
	framer.push(decoder.decode());
	framer.finish();
	return analyzer.finish();
}
