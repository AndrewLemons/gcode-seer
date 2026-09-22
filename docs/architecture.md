# Architecture

The public APIs compose small modules with explicit ownership:

| Layer          | Modules                          | Responsibility                                                   |
| -------------- | -------------------------------- | ---------------------------------------------------------------- |
| Input          | `analyzer.ts`, `line-framer.ts`  | Lifecycle, UTF-8 decoding and bounded physical lines             |
| Syntax         | `parser.ts`, `parser/`           | Numeric words, opaque payloads and transport validation          |
| Interpretation | `interpreter.ts`, `interpreter/` | Dispatch, per-analysis state and command-family effects          |
| Firmware       | `dialects/`                      | Declarative capabilities independent of display names            |
| Geometry       | `geometry/`                      | Paths, arc extrema and continuous containment                    |
| Metrics        | `reporting/`                     | Report initialization and metric accumulation                    |
| Checks         | `constraints/`                   | Geometry, tool, speed, flow and heater constraints               |
| Collection     | `collector.ts`                   | Event routing, bounded diagnostics and final status              |
| Profiles       | `profiles/`                      | Hardware definitions, catalog building, validation and importers |
| Contracts      | `contracts/`                     | Geometry, syntax, firmware, printer, event and analysis types    |

`index.ts` remains the public package entry point. Flat geometry, dialect, profile
and type modules re-export the organized implementations. Runtime modules import
only the domain contracts they need.

The interpreter dispatches numeric commands through `interpreter/commands/registry.ts`.
Each handler validates parameters and updates `MachineState` through a shared
command context. Tool selectors and control-flow prefixes have explicit routing.
Unknown commands still invalidate knowledge. Adapters run before dispatch and
translate to built-ins; configured opaque payload syntax lets adapters support
additional string-valued commands.

The collector sends normalized events to metrics and built-in checks. Motion bounds
are computed once and shared. Custom rules consume the same events, so additional
checks do not need parser or interpreter changes.

## Printer and firmware independence

Manufacturer modules contain researched hardware data. The generic builder composes
geometry, physical extruders, heater selectors, material mappings, upgrade slot
counts, supply-dependent temperatures and provenance. It never checks a model ID,
manufacturer name or firmware name. `printer-catalog.ts` only composes the bundled
manufacturers; `createPrinterCatalog` uses the same builder for caller-owned catalogs.
The deprecated X1 Carbon geometry helper projects the common catalog profile.

Firmware semantics are explicit capabilities in `Dialect`. Renaming a dialect
preserves its behavior; naming a new object after a firmware does not grant that
firmware's capabilities. The parser's default payload declarations preserve existing
syntax independently of semantic support. No command becomes harmless merely
because its syntax can be parsed.

Each analysis owns its mutable state. The analyzer snapshots printer and dialect
configuration and copies adapter/rule lists, retaining callbacks and rule instances.
Create stateful rules per analysis. Catalogs snapshot definitions and return fresh
profiles and metadata. Geometry has no I/O or firmware dependencies. The runtime
package has no filesystem, network, worker or UI dependencies.

See [Extending G-code Seer](extending.md) for concrete contribution paths.

## Accuracy decisions

Machine position and G-code origin are separate. G92 changes the origin, leaving the physical position unchanged. Unknown positions remain unknown until sufficient information establishes them.

Unsupported commands invalidate state instead of being treated as harmless. Control flow prevents sequential interpretation and stops the interpreter. Diagnostic storage can be capped without changing coverage, validity or constraint outcomes.

Linear path checks include both endpoints and all polygon crossings. Arc checks operate on circles rather than sampled chords. This avoids missing narrow exclusions between samples. The geometry is still a tool-tip model, not a collision simulator.

The interpreter reports requested speeds. Applying acceleration, jerk, motor limits or pressure advance would require a separate planner model and a substantially different validation contract. Such a model can consume events without changing parsing or geometry.

## Performance

The main pass is linear in input size for ordinary moves. Polygon checks add work proportional to the configured edge count; sorting boundary intersections adds O(k log k) for k crossings. Profile validation checks polygon edge pairs once, with O(v²) time per polygon. It is intended for small printer exclusion polygons.

The analyzer retains no command list or toolpath. Memory is bounded by input line length, retained diagnostics, tool states and configuration. String analysis necessarily also retains the caller's string. Streaming does not accumulate the file. Large individual chunks belong to the caller and may briefly coexist with decoded text.

Run `bun run bench` for generated linear-motion workloads in both string and stream modes. Results depend on hardware, runtime and profile complexity. The benchmark checks distance and move count before reporting throughput. It is a baseline, not a claim about all real slicer files.

## Testing and future work

Regression tests emphasize cases where a plausible result can be wrong: modal transitions, rebased coordinates, unknown starting state, shared heaters, tool registers, arc bulges, narrow exclusions and byte boundaries.

Priority extensions are verified Bambu command adapters and fixtures tied to firmware versions, branch-aware abstract interpretation, G18/G19 arcs, profile inheritance import, tool offset and carriage models, and a separate motion planner for time estimates. Binary G-code and archive extraction should remain separate input adapters with their own resource limits.

## Modularization verification (2026-09-22)

On Bun 1.4.2, `bun run check` passes 212 behavioral tests and the coverage gates.
`bun run pack:check` checks the installed tarball's runtime exports and TypeScript
consumer, including custom catalogs and payload syntax. A before/after comparison
of 291 catalog configurations and representative analysis reports preserved all
existing profile values and results; new dialect capability fields encode the
previously implicit behavior.

The existing benchmark generates 250,000 moves (4,750,017 bytes), checks distance
and move count, and measures string and stream analysis on the same development
machine:

| Revision             |   String |   Stream |      RSS |
| -------------------- | -------: | -------: | -------: |
| Before restructuring | 297.6 ms | 286.8 ms | 75.1 MiB |
| After restructuring  | 299.2 ms | 293.9 ms | 77.2 MiB |

These are individual local measurements, not statistical performance guarantees.
