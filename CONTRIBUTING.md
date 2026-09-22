# Contributing

Use Node.js 22.18 or later and `npm ci`. Run `npm run check`, `npm run test:coverage` and `npm run format:check` before submitting changes.

For a new command, cite its firmware documentation or source, define which state it changes, and add tests that distinguish its behavior from a plausible incorrect interpretation. Cover interactions with existing units, origins and positioning modes. Keep unsupported parameters visible.

New printer presets need traceable dimensions and limits. Separate printable geometry from service travel. Document firmware versions and any assumptions about homing, tools or offsets. Do not infer hardware safety limits from an unverified slicer setting.

Keep the parser independent of printer state, geometry independent of G-code syntax, and file/network access outside the core. Prefer typed events to dependencies between command logic and checks. Do not add runtime dependencies for convenience without a concrete need.

Run `npm run bench` when changing the hot path and record the workload and runtime alongside results. Tests should verify externally meaningful behavior, not private implementation structure.

Before publishing, confirm package ownership and metadata, update the changelog, run `npm run pack:check`, and inspect the tarball contents. Publishing is a separate maintainer action.
