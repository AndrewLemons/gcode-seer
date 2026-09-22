# Changelog

## Unreleased

- Add a researched catalog of 52 Bambu Lab and Prusa FFF printer configurations, with provenance, installed-tool/MMU options, material-to-nozzle mappings and voltage-dependent X1 bed limits. Discover four resin models with explicit unsupported-format explanations.
- Check circular and polygonal printable areas, physical heater limits and toolhead speed; preserve unknown material mappings and recognize non-printing park selections.
- Distinguish legacy AVR, modern AVR and Buddy extrusion modes; interpret Buddy M191 chamber cooling targets.
- Audit all concrete upstream Bambu and Prusa FFF presets with reproducible inheritance resolution and source-based regression fixtures.

- Move development, tests, package checks, and CI to Bun.
- Replace formatting and linting with Oxfmt and Oxlint using tabs and double quotes.
- Separate streaming framing and command validation, and clarify event collection.
- Add Conventional Commit checks and concise agent onboarding.

## 0.1.0

Initial foundation: streaming text analysis, typed reports, modal motion and extrusion, XY arcs, continuous exclusion checks, configurable printer and tool constraints, heater ranges, command adapters and event rules.
