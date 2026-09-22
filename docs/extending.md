# Extending G-code Seer

Every printer uses the same builder, every modeled command uses the same state and
event contracts, and every constraint consumes normalized events. Keep hardware
facts, firmware semantics, syntax, geometry and checks in their owning modules.

## Add a printer or manufacturer

For application-owned definitions, call `createPrinterCatalog` with
`PrinterDefinition[]`; see [the API example](api.md#custom-printer-catalogs) and
[the runnable example](../examples/custom-printer.ts).

For a bundled model, add a definition to its module in `src/profiles/manufacturers/`.
For a new make, create a module there and add its exported definitions to
`src/printer-catalog.ts`. The catalog and builder need no manufacturer branches.
Record dimensions, source URLs, review date and uncertainty notes beside the data.

Use native geometry (`printBounds`, `printCircle`, `printArea`, `exclusions` and
`travelBounds`) and capabilities rather than flags named after models. `size` is a
shortcut for a printable box starting at zero. Physical extruders describe heater
identities, explicit selectors and per-extruder reach. Installed tool counts,
material mappings, multi-material upgrades and voltage-dependent bed limits are
resolved by the generic builder. Leave unverified properties absent.

A new hardware capability belongs in `profiles/types.ts`, validation and the builder.
If it introduces a constraint, add the relevant event check separately. Add tests
for another manufacturer using the capability, so it cannot accidentally depend on
one brand. Put slicer-format conversions in `profiles/importers/`; the generic
builder must never import a vendor's file format.

## Add firmware behavior

Add or clone a dialect in `src/dialects/`. Select extrusion semantics, register
ownership, tool-change behavior and supported capabilities explicitly. A dialect's
name is metadata. Reuse capabilities across firmware families where their semantics
match; add a typed capability and validation when they differ.

Only declare commands passive when sources establish that they do not change any
modeled state. Preserve unknowns for unmodeled effects and suspend interpretation
when runtime control flow prevents a sequential reading. Existing firmware evidence
is collected in [research](research.md) and [printer research](printer-research.md).

## Add commands

For application-specific commands, use a `CommandAdapter` to translate into existing
modeled commands. Named commands already retain their payload. For numeric commands
with opaque arguments, add their names to `dialect.payloadCommands`. Syntax support
does not confer semantic support. Return `undefined` to defer, or `[]` only when the
command has no relevant effects. Translation does not recurse through adapters.

For built-in semantics:

1. Add a handler to the appropriate family in `src/interpreter/commands/`, or create
   a new family and compose it in `registry.ts`. Register each numeric code once.
2. Use the command context for parameter validation and diagnostics, and keep modal
   state in `MachineState`. Add state fields and their invalidation together.
3. Emit normalized events. Do not compute report totals or printer constraint outcomes
   in command handlers. Keep path mathematics in `geometry/`.
4. Cite firmware sources in the support/research docs. Add behavioral tests covering
   units, origins, positioning modes, unsupported parameters and unknown initial state.

Tool-number selectors and control-flow prefixes are routed explicitly by the
interpreter. Extend that routing only for new command families that cannot use an
exact code lookup.

## Add checks or report features

Application-specific checks implement `AnalysisRule`; use a fresh instance per run
for stateful checks. Built-in checks live in `src/constraints/` and report diagnostics
through `ConstraintContext`. Register their event routing in `collector.ts` and
include new configurable limits in `constraints/configured.ts`.

Metric accumulation belongs in `src/reporting/`, with report initialization in
`reporting/report.ts`. Add public fields in the appropriate `contracts/` module;
`types.ts` and `index.ts` preserve the package's public type exports. Geometry helpers
must remain independent of G-code syntax and firmware identities.

Input adapters for archives or binary formats belong outside the streaming core.
Keep file/network I/O and resource limits in the adapter.

## Verify the change

Run `bun run check` and `bun run pack:check`. Run `bun run bench` for changes to
analysis performance and record runtime and workload. Regression tests should
exercise meaningful behavior, including unknown state and configuration isolation.
The source-inventory tests protect bundled printer dimensions and provenance.
