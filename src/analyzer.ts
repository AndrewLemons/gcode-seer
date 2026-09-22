import { Collector } from "./collector.js";
import { Interpreter } from "./interpreter.js";
import { parseLine } from "./parser.js";
import { validateOptions } from "./profiles.js";
import type { AnalysisReport, AnalyzeOptions } from "./types.js";

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
		const parsed = parseLine(raw, line);
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

/** Bounded line framing, including CRLF pairs split between chunks. */
class LineFramer {
	private parts: string[] = [];
	private length = 0;
	private oversized = false;
	private afterCR = false;
	constructor(
		private readonly emit: (line: string | null) => void,
		private readonly max: number,
	) {}
	push(chunk: string): void {
		let start = 0;
		if (this.afterCR && chunk.length) {
			if (chunk[0] === "\n") {
				start = 1;
			}
			this.afterCR = false;
		}
		for (let i = start; i < chunk.length; i++) {
			const char = chunk.charCodeAt(i);
			if (char !== 10 && char !== 13) {
				continue;
			}
			this.append(chunk.slice(start, i));
			this.flush();
			if (char === 13) {
				if (chunk.charCodeAt(i + 1) === 10) {
					i++;
				} else if (i === chunk.length - 1) {
					this.afterCR = true;
				}
			}
			start = i + 1;
		}
		this.append(chunk.slice(start));
	}
	finish(): void {
		if (this.length || this.oversized) {
			this.flush();
		}
	}
	private append(part: string): void {
		if (!part || this.oversized) {
			return;
		}
		this.length += part.length;
		if (this.length > this.max) {
			this.parts = [];
			this.oversized = true;
		} else {
			this.parts.push(part);
		}
	}
	private flush(): void {
		this.emit(this.oversized ? null : this.parts.join(""));
		this.parts = [];
		this.length = 0;
		this.oversized = false;
	}
}
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
