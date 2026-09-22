import type { Command, Diagnostic, ParsedLine } from "./types.js";

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)/;
const freeText = new Set(["M117", "M118", "M23", "M28", "M30", "M32", "M1002"]);

/** Parse one physical line. Scientific notation is deliberately excluded from this grammar. */
export function parseLine(raw: string, line = 1): ParsedLine {
	const diagnostics: Diagnostic[] = [];
	const fail = (message: string): ParsedLine => ({
		command: null,
		diagnostics: [
			...diagnostics,
			{
				code: "INVALID_SYNTAX",
				category: "syntax",
				severity: "error",
				line,
				message,
			},
		],
	});
	// Reject binary/control data while allowing horizontal tabs.
	// oxlint-disable-next-line no-control-regex
	if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw)) {
		return fail("Control or binary data in G-code text.");
	}
	let text = raw.replace(/^\uFEFF/, "");
	// RepRap checksums cover the original bytes before *, including spaces and N words.
	let star = -1;
	let commentDepth = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "(") {
			commentDepth++;
		} else if (text[i] === ")") {
			commentDepth--;
		} else if (commentDepth === 0 && text[i] === ";") {
			break;
		} else if (commentDepth === 0 && text[i] === "*") {
			star = i;
			break;
		}
	}
	if (star >= 0) {
		const tail = /^\s*(\d+)\s*(?:;.*)?$/.exec(text.slice(star + 1));
		if (!tail || Number(tail[1]) > 255) {
			return fail("Malformed checksum.");
		}
		let checksum = 0;
		for (let i = 0; i < star; i++) {
			if (text.charCodeAt(i) > 127) {
				return fail("Checksummed lines must be ASCII.");
			}
			checksum ^= text.charCodeAt(i);
		}

		if (checksum !== Number(tail[1])) {
			return fail("Checksum does not match the line.");
		}
		text = text.slice(0, star);
	}
	let cleaned = "";
	let inComment = false;
	for (const char of text) {
		if (char === ";" && !inComment) {
			break;
		}

		if (char === "(") {
			if (inComment) {
				return fail("Nested parenthesized comments are not supported.");
			}
			inComment = true;
		} else if (char === ")") {
			if (!inComment) {
				return fail("Unmatched closing comment.");
			}
			inComment = false;
			cleaned += " ";
		} else if (!inComment) {
			cleaned += char;
		}
	}
	if (inComment) {
		return fail("Unclosed parenthesized comment.");
	}
	cleaned = cleaned.trim();
	if (!cleaned || cleaned === "%") {
		return { command: null, diagnostics };
	}
	cleaned = cleaned.replace(/^N\d+\s*/i, "");
	const head = /^([GMT])(\d+(?:\.\d+)?)/i.exec(cleaned);
	if (!head) {
		const macro = /^[A-Za-z_][A-Za-z_0-9]*(?:\s|$)/.exec(cleaned);
		if (macro) {
			return {
				command: {
					code: macro[0].trim().toUpperCase(),
					params: {},
					payload: cleaned.slice(macro[0].length),
					line,
					raw,
				},
				diagnostics,
			};
		}
		return fail("Expected a G, M, T or named command.");
	}
	const code = `${head[1]?.toUpperCase()}${Number(head[2])}`;
	if (!Number.isFinite(Number(head[2])) || Number(head[2]) > 1e9) {
		return fail("Command number is out of range.");
	}
	let rest = cleaned.slice(head[0].length).trim();
	if (freeText.has(code)) {
		return {
			command: { code, params: {}, payload: rest, line, raw },
			diagnostics,
		};
	}
	const params: Record<string, number | null> = Object.create(null) as Record<
		string,
		number | null
	>;
	while (rest) {
		const letter = rest[0]?.toUpperCase();
		if (!letter || !/^[A-Z]$/.test(letter)) {
			return fail(`Unexpected token: ${rest.slice(0, 24)}.`);
		}

		if (Object.hasOwn(params, letter)) {
			return fail(`Duplicate ${letter} parameter.`);
		}
		rest = rest.slice(1).trimStart();
		const match = numberPattern.exec(rest);
		const value = match ? Number(match[0]) : null;
		if (value !== null && (!Number.isFinite(value) || Math.abs(value) > 1e12)) {
			return fail(`${letter} is outside the supported numeric range.`);
		}
		params[letter] = value;
		if (match) {
			rest = rest.slice(match[0].length).trimStart();
		}
	}
	const command: Command = { code, params, line, raw };
	return { command, diagnostics };
}
