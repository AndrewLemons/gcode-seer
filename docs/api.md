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

The included X1 profile contains the reviewed slicer geometry: 256 × 256 × 250 mm, plus the front-left exclusion. This is a slicer print-height limit, not a statement about the full physical Z travel. Supply an independently verified travel envelope, heater limits, tool definitions and homing positions for your machine and firmware. Avoid treating slicer maximum-speed settings as measured hardware limits.

## Multiple tools and heaters

A tool identifies a material/extruder context. A heater identifies physical thermal hardware. For example, two material tools may share a nozzle:

```ts
const printer: PrinterProfile = {
  name: 'Shared-nozzle example',
  tools: [
    { id: 0, heater: 'nozzle', filamentDiameter: 1.75, maxTemperature: 280 },
    { id: 1, heater: 'nozzle', filamentDiameter: 1.75, maxTemperature: 280 },
  ],
};
```

Heater targets accumulate under `report.temperatures.nozzle`; extrusion accumulates separately under `report.tools['0']` and `report.tools['1']`. A shared heater is checked against every configured tool's maximum for that heater, using the most restrictive limit.

For machines whose explicit temperature T parameter addresses a physical heater rather than a material tool, provide `heaterTargets`:

```ts
const printer: PrinterProfile = {
  name: 'Example with explicit heater selectors',
  tools: [
    { id: 0, heater: 'left', maxTemperature: 280 },
    { id: 1, heater: 'right', maxTemperature: 280 },
  ],
  heaterTargets: { 0: 'left', 1: 'right' },
};
```

Without that map, explicit T targets use tool IDs. Without T, the active tool determines the heater. Map the actual printer's selectors; the example is not an H2D preset.

`extrusionRegisters: 'shared'` carries one E coordinate across tool selections. `'per-tool'` retains one register per tool. New registers start unknown. `toolChange: 'logical'` asserts that selection has no hidden motion or coordinate effects. Use it only when those effects are already expanded into explicit moves or absent. The defaults report tool-change uncertainty.

## Extensions

A command adapter translates a command into supported commands. Returning `undefined` delegates to the next adapter or the interpreter. Returning `[]` asserts that the command has no effect relevant to this analysis. Translated commands bypass adapters to prevent recursive expansion.

```ts
const adapter: CommandAdapter = {
  name: 'shop-status',
  translate(command) {
    if (command.code !== 'SHOP_STATUS') return undefined;
    return []; // This local macro only updates the display.
  },
};
```

An adapter takes responsibility for all effects of commands it claims. Do not ignore unknown startup commands in bulk. For macros that move or heat, expand their actual behavior. The original physical line number is retained for every translated command.

Rules add constraints using normalized events:

```ts
const rule: AnalysisRule = {
  name: 'no-negative-extrusion',
  onEvent(event) {
    if (
      event.type !== 'move' ||
      event.extrusion === null ||
      event.extrusion >= 0
    ) {
      return [];
    }
    return [
      {
        code: 'RETRACTION_FORBIDDEN',
        line: event.line,
        category: 'constraint',
        severity: 'error',
        message: 'Retraction is disabled for this process.',
      },
    ];
  },
};
```

Create separate instances of stateful rules for concurrent analyses. Event consumers should treat event data as read-only. Avoid storing every event when processing large files.

Geometry helpers are exported for visualization or additional checks: `createArc`, `pathBounds`, `pathLength`, `pointAt`, `pointInPolygon`, `intersectsExclusion` and `containsBox`. Direct helper callers must supply finite, valid geometry; profile validation handles this for the main analysis APIs.
