/** Bounded line framing, including CRLF pairs split between chunks. */
export class LineFramer {
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
			// Drop buffered text immediately, then discard input until the next line ending.
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
