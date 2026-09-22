# Contributing to G-code Seer

G-code Seer is maintained by [Andrew Lemons](https://github.com/AndrewLemons). Report bugs or suggest improvements in [GitHub issues](https://github.com/AndrewLemons/gcode-seer/issues), or follow the steps below to contribute a change.

## Make a change

1. Install the Bun version pinned in [`.bun-version`](.bun-version). Fork the repository if you do not have write access, clone your fork, and create a branch from `main`:

   ```sh
   git switch -c feat/my-feature
   bun install --frozen-lockfile
   ```

2. Make your change. Add behavioral tests for semantic changes and update the relevant API or extension documentation.
3. Run the checks, then commit with a Conventional Commit message:

   ```sh
   bun run format
   bun run check
   bun run pack:check
   git add <changed-files>
   git commit -m "feat(parser): support a new command"
   ```

4. Push your branch and open a pull request against `main`. Use a Conventional Commit title describing the user-visible change. Complete the PR template, explain how you tested the change, and link any related issue.
5. Address review feedback and keep the branch current by rebasing on `main`. Maintainers **squash merge** after both required checks pass. Check the final squash message: its title determines the release bump, and its body must preserve any breaking-change explanation.

Do not change `package.json`'s version, `.release-please-manifest.json`, or `CHANGELOG.md` in feature PRs. Release Please maintains them automatically. After your PR merges, its commit contributes to the next release PR; merging that release PR stages the package for maintainer approval, and npm sends the notification. Publication requires review and 2FA on npm. See [the release guide](docs/releasing.md) for maintainer setup, first-publication bootstrap, and recovery.

## Design and tests

See [the extension guide](docs/extending.md) for the module boundaries and paths for adding printer makes, firmware behavior, commands and checks.

For a new command, cite its firmware documentation or source, define which state it changes, and add tests that distinguish its behavior from a plausible incorrect interpretation. Cover interactions with existing units, origins and positioning modes. Keep unsupported parameters visible.

New printer presets need traceable dimensions and limits. Separate printable geometry from service travel. Document firmware versions and any assumptions about homing, tools or offsets. Do not infer hardware safety limits from an unverified slicer setting.

Keep the parser independent of printer state, geometry independent of G-code syntax, and file/network access outside the core. Prefer typed events to dependencies between command logic and checks. Do not add runtime dependencies for convenience without a concrete need.

Run `bun run bench` when changing the hot path and record the workload and runtime alongside results. Tests should verify externally meaningful behavior, not private implementation structure.

## Tooling and style

The development and CI version is pinned in `.bun-version` and `package.json`.
Use Bun for dependency changes, scripts, tests, and packaging. npm CLI is used only for release staging and interactive approval/bootstrap because Bun does not support npm staging. Commit `bun.lock`; CI installs with `--frozen-lockfile`.
Oxfmt owns formatting (tabs, double quotes, 100-column target), and Oxlint checks correctness and requires braces.
Run `bun run format` to format changes and `bun run lint:fix` for automatic lint fixes.
YAML and Markdown use spaces where their syntax requires them.
`bun run check` includes formatting, type checking, linting, coverage, and a clean build.
`bun run pack:check` installs the actual tarball in an isolated consumer and checks its runtime exports and TypeScript declarations.
Bun runs TypeScript's compiler to emit ESM and declarations without bundling the library.
Coverage requires 90% lines and 95% functions and writes `coverage/lcov.info`; Bun does not enforce branch thresholds.
The generated changelog and release manifest are excluded from formatting so bot-generated releases pass CI without manual reformatting.

## Conventional Commits

Use `type(scope): description`, with an optional scope or `!` for breaking changes.
Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`.
Subjects must be at most 100 characters with no trailing whitespace. Keep PR titles short enough to allow GitHub's appended ` (#number)` in the squash commit.

| Change                   | Example                                        | Release effect                          |
| ------------------------ | ---------------------------------------------- | --------------------------------------- |
| Feature                  | `feat(profiles): add a printer preset`         | Minor                                   |
| Fix                      | `fix(parser): handle checksummed comments`     | Patch                                   |
| Performance              | `perf(analyzer): reduce streaming allocations` | Patch                                   |
| Breaking API or behavior | `feat(api)!: rename report fields`             | Minor before 1.0; major from 1.0 onward |
| Other work               | `docs: clarify configuration options`          | No release by itself                    |

Use `!` in both the PR title and commit subject for breaking changes, and explain the migration in the PR body:

```text
feat(api)!: rename report fields

BREAKING CHANGE: Replace report.oldField with report.newField.
```

The `!` survives squash merging even if a footer is accidentally removed. Keep the footer in the final squash body so the release notes explain the migration. For the first stable release, a maintainer can add a `Release-As: 1.0.0` footer to a commit; see the release guide.

`bun install` enables the tracked `.githooks/commit-msg` hook. Run `bun run prepare` if hooks need reinstalling. CI checks **every PR commit and the PR title**, including title edits, and checks new commits pushed to `main`. Hooks alone cannot enforce repository policy; the required checks and squash-only repository settings described in the release guide complete enforcement.

To check locally:

```sh
bun run commit:check --range origin/main..HEAD
PR_TITLE='feat(parser): support a new command' bun run commit:check --title
```

To fix the latest commit, use `git commit --amend`; for earlier commits, use `git rebase -i origin/main`. If the branch is already pushed, update your own branch with `git push --force-with-lease`. Do not bypass the hook or force-push `main`.
