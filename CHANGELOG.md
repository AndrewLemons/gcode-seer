# Changelog

## Unreleased

- Organize contracts, command handlers, firmware capabilities, geometry, reporting and constraints into separate modules.
- Build every printer through declarative capabilities; add isolated custom catalogs with open manufacturer and upgrade IDs.
- Make dialect names descriptive: custom dialects must declare capabilities or clone a preset. Add configurable opaque command syntax for adapters.
- Keep the original public exports; deprecate the geometry-only X1 Carbon helper in favor of the common catalog.
- Validate unselected custom hardware capabilities and isolate adapter/rule list membership during analysis.

- Add a researched catalog of 52 Bambu Lab and Prusa FFF printer configurations, with provenance, installed-tool/MMU options, material-to-nozzle mappings and voltage-dependent X1 bed limits. Discover four resin models with explicit unsupported-format explanations.
- Check circular and polygonal printable areas, physical heater limits and toolhead speed; preserve unknown material mappings and recognize non-printing park selections.
- Distinguish legacy AVR, modern AVR and Buddy extrusion modes; interpret Buddy M191 chamber cooling targets.
- Preserve Prusa string-valued compatibility checks for adapters without treating their quoted arguments as malformed numeric words.
- Audit all concrete upstream Bambu and Prusa FFF presets with reproducible inheritance resolution and source-based regression fixtures.

- Move development, tests, package checks, and CI to Bun.
- Replace formatting and linting with Oxfmt and Oxlint using tabs and double quotes.
- Separate streaming framing and command validation, and clarify event collection.
- Add Conventional Commit checks and concise agent onboarding.

## 0.1.0

Initial foundation: streaming text analysis, typed reports, modal motion and extrusion, XY arcs, continuous exclusion checks, configurable printer and tool constraints, heater ranges, command adapters and event rules.
