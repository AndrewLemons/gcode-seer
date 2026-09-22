import { expect, test } from "bun:test";
import {
	analyze,
	bambuDialect,
	klipperDialect,
	marlinDialect,
	prusaBuddyDialect,
	parseLine,
	type Dialect,
} from "../src/index.js";

const options = { initialPosition: { x: 0, y: 0, z: 0 }, initialExtrusion: 0 };
const codes = (text: string, dialect: Dialect) =>
	analyze(text, { ...options, dialect }).diagnostics.map((d) => d.code);

test("firmware capabilities survive renaming without brand dispatch", () => {
	const renamed = { ...bambuDialect, name: "custom-firmware" };
	expect(analyze("M400 S2 P500", { dialect: renamed }).nominalDuration).toBe(2.5);
	expect(analyze("M400 U1\nG1 X10 F60", { ...options, dialect: renamed }).moves).toBe(0);
	expect(codes("T255", renamed)).toContain("UNSUPPORTED_COMMAND");
	expect(codes("G20", { ...klipperDialect, name: "metric-only" })).toContain("INVALID_COMMAND");
	const report = analyze("M191 C30", {
		dialect: { ...prusaBuddyDialect, name: "cooling-firmware" },
	});
	expect(report.temperatures.chamber?.finalTarget).toBe(30);
});

test("names alone do not confer capabilities", () => {
	expect(codes("M400 S2", { ...marlinDialect, name: "bambu" })).toContain("UNSUPPORTED_PARAMETER");
	expect(codes("M191 C30", { ...marlinDialect, name: "prusa-buddy" })).toContain(
		"UNSUPPORTED_PARAMETER",
	);
	expect(codes("G20", { ...marlinDialect, name: "klipper" })).not.toContain("INVALID_COMMAND");
});

test("strict physical heater selectors apply to any firmware", () => {
	const report = analyze("M104 T9 S200", {
		dialect: { ...marlinDialect, strictHeaterSelectors: true },
		printer: {
			name: "Example",
			heaters: [{ id: "hotend" }],
			heaterTargets: { 0: "hotend" },
		},
	});
	expect(report.diagnostics.map((d) => d.code)).toContain("UNKNOWN_HEATER");
	expect(report.temperatures).toEqual({});
});

test("numeric payload commands reach adapters through configured syntax", () => {
	const payload = 'M9000 destination="10"';
	expect(parseLine(payload).command).toBeNull();
	expect(parseLine(payload, 7, { payloadCommands: ["M9000"] }).command?.payload).toBe(
		'destination="10"',
	);
	const report = analyze(payload, {
		...options,
		dialect: { ...marlinDialect, payloadCommands: ["M9000"] },
		adapters: [
			{
				name: "example-position",
				translate(command) {
					if (command.code !== "M9000") {
						return undefined;
					}
					expect(command.payload).toBe('destination="10"');
					return [{ ...command, code: "G1", params: { X: 10, F: 60 } }];
				},
			},
		],
	});
	expect(report.distance.total).toBe(10);
	expect(report.finalPosition.x).toBe(10);
});

test.each([
	{ inchUnits: "yes" },
	{ interactivePlannerWait: true },
	{ reservedTools: [256] },
	{ payloadCommands: ["lowercase"] },
])("rejects malformed firmware capabilities: %j", (patch) => {
	expect(() => analyze("G21", { dialect: { ...marlinDialect, ...patch } as Dialect })).toThrow();
});

test("safety changes invalidate state and pause commands suspend subsequent motion", () => {
	const safety = analyze("M211 S0\nG1 X10 F60", options);
	expect(safety.constraints).toBe("violated");
	expect(safety.finalPosition.x).toBeNull();
	const paused = analyze("G1 X1 F60\nM0\nG1 X10 F60", options);
	expect(paused.moves).toBe(1);
	expect(paused.complete).toBe(false);
});

test.each(["M400 S-1", "G4 S1 P1000", "G4 S-1", "M201 X-1", "M104 S-300"])(
	"invalid values produce no modeled effects: %s",
	(command) => {
		const report = analyze(command, { ...options, dialect: bambuDialect });
		expect(report.validity).toBe("invalid");
		expect(report.nominalDuration).toBe(0);
		expect(report.temperatures).toEqual({});
	},
);

test("unknown tools stay unattributed instead of reusing the last active tool", () => {
	const report = analyze("T3\nG1 X5 F60\nM104 T3 S200", {
		...options,
		printer: { name: "One tool", tools: [{ id: 0, heater: "hotend" }] },
	});
	expect(report.diagnostics.filter((d) => d.code === "UNKNOWN_TOOL").length).toBe(2);
	expect(report.tools).toEqual({});
	expect(report.constraints).toBe("violated");
});

test("running analyzers retain their adapter and rule lists", async () => {
	const { GcodeAnalyzer } = await import("../src/index.js");
	const adapters = [{ name: "custom", translate: () => [] }];
	const rules = [
		{
			name: "audit",
			onEvent: () => [
				{
					code: "AUDIT",
					line: 1,
					message: "Checked.",
					category: "coverage" as const,
					severity: "info" as const,
				},
			],
		},
	];
	const analyzer = new GcodeAnalyzer({ ...options, adapters, rules });
	adapters.length = 0;
	analyzer.addLine("CUSTOM");
	// A separate analyzer exercises rule list ownership without an adapter swallowing moves.
	const checked = new GcodeAnalyzer({ ...options, rules });
	rules.length = 0;
	checked.addLine("G1 X1 F60");
	expect(analyzer.finish().validity).toBe("valid");
	expect(checked.finish().diagnostics.map((d) => d.code)).toContain("AUDIT");
});
