# Architecture

The public analysis APIs compose five layers:

1. `analyzer.ts` frames strings or streamed UTF-8 into physical lines, enforces input limits and manages lifecycle.
2. `parser.ts` parses commands, parameters and transport checksums without changing printer state.
3. `interpreter.ts` tracks modal state, origins, tool selection, extrusion registers and targets, and produces normalized events.
4. `geometry.ts` calculates paths, extrema and exclusion intersections without knowing firmware commands.
5. `collector.ts` accumulates metrics and checks printer constraints. Custom rules operate on the same events.

`types.ts` defines the public contracts. `dialects.ts` contains semantic presets. `profiles.ts` validates caller configuration and converts Bambu exclusion coordinates.

Each analysis owns its mutable state. The main analyzer snapshots supplied printer and dialect configuration. Geometry has no I/O or firmware dependencies. The runtime package has no dependencies on Node filesystem, networking, workers or a UI framework.

## Accuracy decisions

Machine position and G-code origin are separate. G92 changes the origin, leaving the physical position unchanged. Unknown positions remain unknown until sufficient information establishes them.

Unsupported commands invalidate state instead of being treated as harmless. Control flow prevents sequential interpretation and stops the interpreter. Diagnostic storage can be capped without changing coverage, validity or constraint outcomes.

Linear path checks include both endpoints and all polygon crossings. Arc checks operate on circles rather than sampled chords. This avoids missing narrow exclusions between samples. The geometry is still a tool-tip model, not a collision simulator.

The interpreter reports requested speeds. Applying acceleration, jerk, motor limits or pressure advance would require a separate planner model and a substantially different validation contract. Such a model can consume events without changing parsing or geometry.

## Performance

The main pass is linear in input size for ordinary moves. Polygon checks add work proportional to the configured edge count; sorting boundary intersections adds O(k log k) for k crossings. Profile validation checks polygon edge pairs once, with O(v²) time per polygon. It is intended for small printer exclusion polygons.

The analyzer retains no command list or toolpath. Memory is bounded by input line length, retained diagnostics, tool states and configuration. String analysis necessarily also retains the caller's string. Streaming does not accumulate the file. Large individual chunks belong to the caller and may briefly coexist with decoded text.

Run `npm run bench` for generated linear-motion workloads in both string and stream modes. Results depend on hardware, runtime and profile complexity. The benchmark checks distance and move count before reporting throughput. It is a baseline, not a claim about all real slicer files.

## Testing and future work

Regression tests emphasize cases where a plausible result can be wrong: modal transitions, rebased coordinates, unknown starting state, shared heaters, tool registers, arc bulges, narrow exclusions and byte boundaries.

Priority extensions are verified Bambu command adapters and fixtures tied to firmware versions, branch-aware abstract interpretation, G18/G19 arcs, profile inheritance import, tool offset and carriage models, and a separate motion planner for time estimates. Binary G-code and archive extraction should remain separate input adapters with their own resource limits.
