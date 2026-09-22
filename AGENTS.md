# Agent onboarding

Gcode Seer is a dependency-free TypeScript library for streaming 3D printer G-code analysis.
It reports motion, extrusion, heater targets, printer constraints, and uncertainty.

## Structure

- `src/index.ts`: public exports; `src/contracts/`: domain contracts (re-exported by `types.ts`).
- `src/analyzer.ts`, `src/line-framer.ts`: lifecycle and bounded streaming input.
- `src/parser.ts`, `src/parser/`: syntax, transport checksums and opaque payload declarations.
- `src/interpreter/`: machine state, command context and command-family handlers; `interpreter.ts` dispatches.
- `src/dialects/`: declarative firmware capabilities. Never dispatch on dialect names.
- `src/geometry/`: paths, arcs, bounds and continuous containment; no firmware dependencies.
- `src/reporting/`: metric accumulation; `src/constraints/`: event-based checks; `collector.ts` orchestrates both.
- `src/profiles/`: catalog, generic builder, validation, manufacturer data and format importers.
- `src/printer-catalog.ts`: composition of bundled manufacturer definitions. No brand/model branches in builders or checks.
- `src/configuration/`: option, dialect and shared numeric validation.
- `test/`: Bun behavioral tests; `scripts/`: build, benchmark, package and Git checks.
- `docs/`: API, architecture, extension guide, supported commands and research sources.

## Tooling

- Use Bun exclusively; `.bun-version` pins the development and CI version.
- Install with `bun install --frozen-lockfile`; commit `bun.lock` when dependencies change.
- `bun run format` applies Oxfmt; use tabs, double quotes, and braces.
- `bun run lint` runs Oxlint; `bun run typecheck` checks all TypeScript, including scripts.
- `bun test` runs tests; `bun run check` runs formatting, types, lint, coverage, and build.
- `bun run pack:check` validates the distributable and its TypeScript declarations.
- Run `bun run bench` for changes to analysis performance.

## Important notes

- Keep I/O outside the core and preserve the dependency-free runtime package.
- Unknown state must stay unknown; do not silently assume unsupported commands are harmless.
- Add behavioral regression tests for semantic changes and cite firmware sources for new commands.
- Generated `dist/`, `coverage/`, and `node_modules/` stay out of Git.
- Use Conventional Commits, e.g. `fix(parser): handle checksummed comments`.
- `bun install` configures the local commit-message hook; `bun run prepare` reinstalls it.
- See `CONTRIBUTING.md` for contribution and release expectations.
