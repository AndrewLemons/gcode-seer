# Gcode Seer

A TypeScript library for analyzing 3D printer G-code. It tracks commanded motion, extrusion, heater targets and printer constraints, and reports where the available information is incomplete.

The core has no runtime dependencies and no filesystem access. Use it with strings, streamed UTF-8 data, or individual lines. Output uses millimeters, seconds and Celsius.

## Status

Version 0.1 is a foundation for static analysis, with conservative handling of unsupported behavior. It supports common Cartesian printing commands and XY arcs. It does not emulate an entire printer firmware.

The built-in catalog covers Bambu Lab and Prusa FFF printers, with explicit hardware configuration and research provenance. Full slicer files can contain startup operations, conditional blocks and tool changes that make a report incomplete. Printer constraints do not imply complete firmware emulation. See the [printer catalog](docs/printers.md) and [support matrix](docs/support.md).

## Install and use

Once published:

```sh
bun add gcode-seer
```

The package exports ESM and TypeScript declarations. Bun 1.4.2 or later is the development baseline. The core also works in modern browsers with `TextDecoder`, `structuredClone` and async iteration.

```ts
import { analyze, type PrinterProfile } from "gcode-seer";

const printer: PrinterProfile = {
	name: "Example Cartesian printer",
	homePosition: { x: 0, y: 0, z: 0 },
	travelBounds: {
		min: { x: 0, y: 0, z: 0 },
		max: { x: 250, y: 250, z: 250 },
	},
	maxSpeed: { x: 300, y: 300, z: 15, e: 40 },
	maxBedTemperature: 110,
	tools: [{ id: 0, heater: "hotend", maxTemperature: 280 }],
};

const report = analyze("G28\nG92 E0\nM104 S210\nG1 X50 Y50 Z0.2 E2 F1800", {
	printer,
});

console.log(report.validity); // 'valid'
console.log(report.constraints); // 'passed'
console.log(report.maxAxisSpeed); // x, y, z and e, in mm/s
console.log(report.temperatures.hotend?.targets); // { min: 210, max: 210 }
```

`passed` means the modeled commands satisfy the supplied constraints under the documented assumptions. It does not certify that printing the file is safe. Homing trajectories, the carriage, inactive nozzles, bed meshes and existing objects are outside this model.

## What the report includes

- Syntax and command diagnostics with physical line numbers.
- Separate validity, constraint and completeness results.
- Travel and extruding-move bounds, including arc extrema.
- Polygon exclusion intersections along entire paths, optionally limited by height.
- Rectangular, circular and polygonal printable areas, including per-nozzle reach.
- Maximum requested feedrate and component speeds for X, Y, Z and E.
- Heater target ranges, active target ranges, final observed targets and wait counts.
- Extrusion, retraction and net filament length per tool.
- Volumetric flow when a filament diameter is provided.
- Constant-feed motion time plus explicit dwells.

Unknown portions are omitted from metrics. Missing values are represented by `null` where a value cannot be resolved. Aggregate maxima and totals cover the modeled portions and must be read with `complete` and the diagnostics. They are not whole-file estimates when analysis is incomplete.

## Stream a file

```ts
import { analyzeStream } from "gcode-seer";

const report = await analyzeStream(Bun.file("part.gcode").stream(), {
	printer,
	maxDiagnostics: 500,
});
```

Memory use is bounded by the current line, retained diagnostics, configuration and at most 256 tool states. The analyzer does not retain the toolpath. A caller that collects events is responsible for that storage. Invalid UTF-8 and stream errors reject the promise.

## Built-in printers

```ts
import { analyze, createPrinterProfile, listPrinterProfiles } from "gcode-seer";

const available = listPrinterProfiles("Prusa");
const printer = createPrinterProfile("prusa-mk4s", { multiMaterial: "mmu3" });
const report = analyze("M104 S291", { printer });
// A temperature-limit violation: the reviewed Buddy target cap is 290 °C.
```

Profiles cover all 14 reviewed Bambu models and Prusa's legacy i3, MK, MINI, XL, CORE One, INDX, HT90 and AFS families. Select installed XL/INDX tools, MMU upgrades, Bambu material-to-nozzle mappings and X1 supply voltage explicitly. Resin printers are listed as unavailable because their layer/exposure archives are not extrusion G-code.

See [configuration examples and IDs](docs/printers.md) and the [per-printer research audit](docs/printer-research.md), including source revisions, discrepancies and unverified legacy limits.

## Exclusions

Printable geometry and machine travel are separate constraints. Purging, wiping and parking may use coordinates outside the printable bed.

```ts
import { bambuExclusion, createBambuX1CarbonPrintProfile } from "gcode-seer";

const x1 = createBambuX1CarbonPrintProfile();
// Slicer print limits: 256 × 256 × 250 mm and the front-left exclusion.

const clamp = bambuExclusion(["40x40", "50x40", "50x60", "40x60"], {
	id: "bed-clamp",
	appliesTo: "all",
	minZ: 0,
	maxZ: 12,
});
```

Use `appliesTo: 'extrusion'` for regions where deposition is prohibited but travel is allowed. Boundary contact with an exclusion counts as a violation. Shrink allowed bounds or enlarge exclusions in your profile when clearance is required. The analyzer checks the tool tip, not a swept carriage volume.

Profiles can define multiple material tools sharing a physical heater, independent E registers, per-tool bounds and separate temperature selectors. Tool-change motion and independent-carriage duplication need machine-specific modeling. See [profiles and extensions](docs/api.md).

## Development

```sh
bun install --frozen-lockfile
bun run check
bun run bench
bun run pack:check
```

Tests cover numerical behavior, full-path exclusion checks, modal transitions, streamed chunk boundaries, malformed input, configuration validation and extension behavior. CI uses the Bun version pinned in `.bun-version`.

Contributions use Conventional Commits and squash-merged pull requests. Release Please generates version bumps and the changelog; merging a release PR automatically publishes the tested package to npm with Bun. See [contributing](CONTRIBUTING.md) and [release setup and recovery](docs/releasing.md).

Further reading: [API](docs/api.md), [supported commands and limits](docs/support.md), [architecture](docs/architecture.md), [research sources](docs/research.md), [contributing](CONTRIBUTING.md).

MIT licensed.

See the [extension guide](docs/extending.md) to add printer makes, firmware capabilities, commands or event checks. Custom printer catalogs use the same declarative builder as bundled printers.
