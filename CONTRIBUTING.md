# Contributing

Use Bun 1.4.2 or later and `bun install --frozen-lockfile`. Run `bun run check`, `bun run test:coverage` and `bun run format:check` before submitting changes.

See [the extension guide](docs/extending.md) for the module boundaries and paths for adding printer makes, firmware behavior, commands and checks.

For a new command, cite its firmware documentation or source, define which state it changes, and add tests that distinguish its behavior from a plausible incorrect interpretation. Cover interactions with existing units, origins and positioning modes. Keep unsupported parameters visible.

New printer presets need traceable dimensions and limits. Separate printable geometry from service travel. Document firmware versions and any assumptions about homing, tools or offsets. Do not infer hardware safety limits from an unverified slicer setting.

Keep the parser independent of printer state, geometry independent of G-code syntax, and file/network access outside the core. Prefer typed events to dependencies between command logic and checks. Do not add runtime dependencies for convenience without a concrete need.

Run `bun run bench` when changing the hot path and record the workload and runtime alongside results. Tests should verify externally meaningful behavior, not private implementation structure.

Before publishing, confirm package ownership and metadata, update the changelog, run `bun run pack:check`, and inspect the tarball contents. Publishing is a separate maintainer action.

## Tooling and style

The development and CI version is pinned in `.bun-version` and `package.json`.
Use Bun for dependency changes, scripts, and tests. Commit `bun.lock`; CI installs with `--frozen-lockfile`.
Oxfmt owns formatting (tabs, double quotes, 100-column target), and Oxlint checks correctness and requires braces.
Run `bun run format` to format changes and `bun run lint:fix` for automatic lint fixes.
YAML and Markdown use spaces where their syntax requires them.
`bun run check` includes formatting, type checking, linting, coverage, and a clean build.
Bun runs TypeScript's compiler to emit ESM and declarations without bundling the library.
Coverage requires 90% lines and 95% functions and writes `coverage/lcov.info`; Bun does not enforce branch thresholds.

## Commits

Use Conventional Commits: `type(scope): description`, with an optional scope or `!` for breaking changes.
Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`.
Keep the subject within 100 characters; describe breaking changes in the commit body.
For example: `refactor(parser): clarify checksum validation`.

`bun install` enables the tracked `.githooks/commit-msg` hook for this checkout.
Run `bun run prepare` if hooks need reinstalling. CI validates all commits in pull requests.
