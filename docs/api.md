# API

All public types are exported from `gcode-seer`. Declarations include units and field-level documentation.

## Input APIs

```ts
analyze(text: string, options?: AnalyzeOptions): AnalysisReport
analyzeStream(chunks: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>, options?: AnalyzeOptions): Promise<AnalysisReport>
```

For an existing line reader, instantiate `GcodeAnalyzer`, call `addLine(line)` for each line without its terminator, then call `finish()`. The instance is closed after finishing. It cannot be reused.

`parseLine(raw, lineNumber?)` provides the lexer independently. `Interpreter` exposes stateful command processing through `process(command)` and a copied `finalPosition`. Most applications should use the analysis APIs, which also validate options, frame lines and aggregate diagnostics.

## Options

| Option             | Default                           | Purpose                                                                                                               |
| ------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `printer`          | absent                            | Geometry, tool identities, homing endpoints and limits.                                                               |
| `dialect`          | printer dialect, otherwise Marlin | Explicit overrides take priority.                                                                                     |
| `initialPosition`  | XYZ unknown                       | Known machine coordinates at the start of this input.                                                                 |
| `initialExtrusion` | unknown                           | Initial logical E register, in millimeters. Establish volumetric coordinates using M200 followed by G92.              |
| `initialFeedrate`  | unknown                           | Initial requested speed in mm/s.                                                                                      |
| `maxDiagnostics`   | 1000                              | Retained diagnostic objects. Counts and result status still include discarded diagnostics. Zero is allowed.           |
| `maxLineLength`    | 65536                             | Maximum UTF-16 code units in a physical line. Oversized lines are discarded and diagnosed.                            |
| `adapters`         | empty                             | Command translations, in order.                                                                                       |
| `rules`            | empty                             | Additional checks on interpreted events.                                                                              |
| `onEvent`          | absent                            | Synchronous observation of interpreter events and parser diagnostics. Built-in constraint findings are in the report. |
| `signal`           | absent                            | Cancellation checked between lines/chunks and before completion.                                                      |

Configuration errors throw `TypeError`. Syntax and command errors become report diagnostics. Invalid UTF-8, stream failures, cancellation, callback errors and adapter/rule errors throw or reject; they do not return a partial report disguised as a completed analysis. A stream that never yields cannot be interrupted by the analyzer; cancellation must also be connected to that source.

There is no automatic inference from slicer comments. They can be stale or edited. Select the intended dialect and machine configuration explicitly.

## Printer profiles

All bounds use machine coordinates in millimeters. `travelBounds` applies to every resolved path. `printBounds` applies only while the interpreted E delta is positive. Both constraints can apply to the same path. Per-tool bounds add further restrictions to the global bounds.

`homePosition` describes the endpoint of G28. Use `initialPosition` only when the position is known before the input starts. These are different inputs. Neither a model bounding-box comment nor a G92 coordinate reset establishes the physical starting position.

Each exclusion is a simple polygon with an optional vertical interval. Polygons may be concave and must not self-intersect. Repeated closing vertices and zero-length edges are rejected. `bambuExclusion` converts the flat `bed_exclude_area` array from a resolved Bambu Studio configuration. It does not resolve profile inheritance or import printer limits.

`createPrinterProfile(id, options?)` creates a researched Bambu Lab or Prusa profile. `listPrinterProfiles(manufacturer?)` returns metadata, supported configurations, source URLs and limitations. Unknown IDs and unsupported configurations throw `RangeError`; incompatible options and resin profile creation throw `TypeError`. Both functions return independent objects and perform no I/O. See [catalog IDs and examples](printers.md) and [research evidence](printer-research.md).

`provenance` contains the model ID, manufacturer, review date, sources and notes; notes are also included in report assumptions. Unspecified limits are not checked. Profiles do not assume a homing endpoint or infer a service-travel envelope from printable dimensions.

`printCircle` defines a center and radius in XY. `printArea` defines a simple printable XY polygon. Both apply to positive extrusion, permit boundary contact, and check entire lines and XY/helical arcs analytically. They can be combined with `printBounds` for independent Z limits. XY-only legacy profiles leave unverified Z limits absent. `maxToolheadSpeed` constrains the requested spatial feedrate in mm/s, including diagonal motion and excluding pure E moves; `maxSpeed` constrains individual axis components.

`createBambuX1CarbonPrintProfile()` remains the original geometry-only helper: 256 × 256 × 250 mm plus the front-left exclusion, with no added thermal or tool configuration. Use `createPrinterProfile("bambu-x1-carbon", options)` for the full catalog profile.

## Multiple tools and heaters

A tool identifies a material/extruder context. A heater identifies a thermal target register, usually physical thermal hardware. INDX has exchangeable passive tips with per-tool target registers and a shared induction coil. For example, two material tools may share a nozzle:

```ts
const printer: PrinterProfile = {
	name: "Shared-nozzle example",
	tools: [
		{ id: 0, heater: "nozzle", filamentDiameter: 1.75, maxTemperature: 280 },
		{ id: 1, heater: "nozzle", filamentDiameter: 1.75, maxTemperature: 280 },
	],
};
```

Heater targets accumulate under `report.temperatures.nozzle`; extrusion accumulates separately under `report.tools['0']` and `report.tools['1']`. A shared heater is checked against every configured tool's maximum for that heater, using the most restrictive limit.

For machines whose explicit temperature T parameter addresses a physical heater rather than a material tool, provide `heaterTargets`:

```ts
const printer: PrinterProfile = {
	name: "Example with explicit heater selectors",
	tools: [
		{ id: 0, heater: "left", maxTemperature: 280 },
		{ id: 1, heater: "right", maxTemperature: 280 },
	],
	heaterTargets: { 0: "left", 1: "right" },
};
```

Without that map, explicit T targets use tool IDs. Without T, the active tool determines the heater. Map the actual printer's selectors; the example is not an H2D preset. In the Bambu dialect, a supplied `heaterTargets` map is authoritative for explicit selectors: a missing selector produces `UNKNOWN_HEATER` instead of falling back to a material ID.

`heaters` declares hotend IDs and temperature limits independently of material assignments. When present, every tool and explicit heater selector must reference a declared heater. Physical and tool limits combine using the most restrictive maximum. `requiresToolMapping` reports incomplete coverage for moves or implicit temperature commands whose material lacks a mapping; those temperatures are not attributed to an invented heater. `parkTool` identifies a non-printing firmware selection such as XL T5 or INDX T8. Parking remains unsupported and invalidates state, without falsely reporting a nonexistent print tool.

`extrusionRegisters: 'shared'` carries one E coordinate across tool selections. `'per-tool'` retains one register per tool. New registers start unknown. `toolChange: 'logical'` asserts that selection has no hidden motion or coordinate effects. Use it only when those effects are already expanded into explicit moves or absent. The defaults report tool-change uncertainty.

## Extensions

A command adapter translates a command into supported commands. Returning `undefined` delegates to the next adapter or the interpreter. Returning `[]` asserts that the command has no effect relevant to this analysis. Translated commands bypass adapters to prevent recursive expansion.

```ts
const adapter: CommandAdapter = {
	name: "shop-status",
	translate(command) {
		if (command.code !== "SHOP_STATUS") return undefined;
		return []; // This local macro only updates the display.
	},
};
```

An adapter takes responsibility for all effects of commands it claims. Do not ignore unknown startup commands in bulk. For macros that move or heat, expand their actual behavior. The original physical line number is retained for every translated command.

Rules add constraints using normalized events:

```ts
const rule: AnalysisRule = {
	name: "no-negative-extrusion",
	onEvent(event) {
		if (event.type !== "move" || event.extrusion === null || event.extrusion >= 0) {
			return [];
		}
		return [
			{
				code: "RETRACTION_FORBIDDEN",
				line: event.line,
				category: "constraint",
				severity: "error",
				message: "Retraction is disabled for this process.",
			},
		];
	},
};
```

Create separate instances of stateful rules for concurrent analyses. Event consumers should treat event data as read-only. Avoid storing every event when processing large files.

Geometry helpers are exported for visualization or additional checks: `createArc`, `pathBounds`, `pathLength`, `pointAt`, `pointInPolygon`, `intersectsExclusion`, `containsBox`, `containsPathInCircle` and `containsPathInPolygon`. Direct helper callers must supply finite, valid geometry; profile validation handles this for the main analysis APIs.

### Custom printer catalogs

`createPrinterCatalog(definitions)` creates an isolated catalog exposing the same
`listPrinterProfiles(manufacturer?)` and `createPrinterProfile(id, options?)` methods
as the bundled catalog. `PrinterDefinition` describes hardware capabilities and
provenance; manufacturer names and upgrade IDs are open strings. Definitions are
snapshotted, duplicate IDs are rejected, and returned profiles are independent.

```ts
import { createPrinterCatalog, marlinDialect } from "gcode-seer";

const catalog = createPrinterCatalog([
	{
		id: "workshop-cartesian",
		name: "Workshop Cartesian",
		manufacturer: "Workshop",
		reviewedAt: "2026-09-22",
		sources: [], // Add verified hardware/firmware sources for distributed presets.
		notes: ["Example configuration; replace with verified machine limits."],
		dialect: marlinDialect,
		toolCounts: [1],
		size: [200, 200, 200],
		filamentDiameter: 1.75,
	},
]);
const printer = catalog.createPrinterProfile("workshop-cartesian");
```

Physical extruders can declare heater names, temperature selectors, and individual
print bounds. `materialMapping: "explicit"` requires a job's `materialTools` mapping;
`heaterSelection` specifies whether explicit temperature selectors address material
tools or physical heaters. `upgrades` maps upgrade IDs to material slot counts sharing
extruder zero. `bedTemperatures` maps supported supply voltages to verified limits.
These capabilities apply equally to every manufacturer.

### Firmware capabilities and command syntax

A dialect's `name` is descriptive. Behavior comes from its fields: extrusion modes,
register sharing, tool-change semantics, passive commands, `inchUnits`,
`timedPlannerWait`, `interactivePlannerWait`, `reservedTools`, `chamberCooling`, and
`strictHeaterSelectors`. Clone a preset to retain its capabilities when changing its
name. A name alone does not select firmware behavior.

For numeric commands with string arguments, set `dialect.payloadCommands` to the
additional command codes. Their payload reaches command adapters without numeric
parameter parsing. Standalone parsing accepts the same option as
`parseLine(raw, lineNumber, { payloadCommands: ["M9000"] })`. This only enables syntax;
an unhandled command still invalidates state. Adapters translate to modeled commands
as before, and translated commands bypass adapters to prevent recursion.
