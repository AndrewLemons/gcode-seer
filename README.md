# G-code Seer

[![npm version](https://img.shields.io/npm/v/gcode-seer)](https://www.npmjs.com/package/gcode-seer)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

G-code Seer is a dependency-free TypeScript and JavaScript library for **3D printer G-code analysis**. Analyze motion, extrusion, heater targets and printer constraints from text or streaming files, with explicit diagnostics when information is incomplete.

Use it to build G-code inspection tools, check print jobs against printer profiles, or process large files without retaining the toolpath. It includes Bambu Lab and Prusa printer profiles and exports ESM with TypeScript declarations. The core performs no file or network I/O and works in Bun and modern browsers.

## Install

```sh
bun add gcode-seer
```

The published package is available on [npm](https://www.npmjs.com/package/gcode-seer).

## Quick start

```ts
import { analyze } from "gcode-seer";

const report = analyze("G21\nG90\nM82\nG92 E0\nG1 X3 Y4 E1 F600", {
	initialPosition: { x: 0, y: 0, z: 0 }, // Supply only a known starting position.
});

console.log(report.distance.total); // 5 mm
console.log(report.maxAxisSpeed.x); // 6 mm/s
console.log(report.validity); // "valid"
console.log(report.complete); // true
console.log(report.diagnostics); // []
```

Save this as `analyze.ts` and run it with `bun run analyze.ts`. Position starts unknown unless established by the input or supplied explicitly. Output uses millimeters, seconds and Celsius.

### Check printer limits

```ts
import { analyze, createPrinterProfile } from "gcode-seer";

const printer = createPrinterProfile("prusa-mk4s");
const report = analyze("M104 S291", { printer });

console.log(report.constraints); // "violated": exceeds the 290 °C hotend target limit.
console.log(report.diagnostics);
```

Choose a built-in profile and installed hardware from the [printer catalog](docs/printers.md), or supply a [custom printer profile](docs/api.md#printer-profiles).

### Stream a file

```ts
import { analyzeStream } from "gcode-seer";

const report = await analyzeStream(Bun.file("part.gcode").stream(), {
	maxDiagnostics: 500,
});

console.log(report.distance.total);
console.log(report.complete);
```

`analyzeStream` accepts iterable or async iterable text and UTF-8 chunks. For an existing line reader, use [`GcodeAnalyzer`](docs/api.md#input-apis).

Read metrics alongside `complete` and `diagnostics`: unsupported behavior can leave parts of a file unanalyzed. A `passed` constraint result applies to configured limits and modeled commands; it does not certify a print as safe. See [report semantics](docs/api.md#reading-the-report) and [supported commands and limitations](docs/support.md).

## Documentation

- [API reference](docs/api.md): input methods, report metrics, options and custom profiles.
- [Printer catalog](docs/printers.md): Bambu Lab and Prusa models and hardware configuration.
- [Supported commands](docs/support.md): firmware coverage, assumptions and limitations.
- [Extension guide](docs/extending.md) and [architecture](docs/architecture.md): add printers, commands and checks.
- [Research sources](docs/research.md) and [printer research](docs/printer-research.md): evidence behind the model.

## Contributing

Bug reports, documentation improvements and pull requests are welcome. Use the Bun version pinned in [`.bun-version`](.bun-version), then run `bun install --frozen-lockfile` and `bun run check` in your clone. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and Conventional Commits, and the [release guide](docs/releasing.md) for publishing.

Maintained by [Andrew Lemons](https://github.com/AndrewLemons). Licensed under the [MIT License](LICENSE).
