# Releases

Releases use **Release Please → GitHub Releases → Bun publishing to npm**. Once configured, maintainers only review and merge PRs: no manual version bump, changelog editing, tag creation, or publishing command is needed.

npm is the distribution registry for `gcode-seer`. It works with Bun and other JavaScript package managers. A second registry would add credentials and release coordination without a current project requirement.

## Normal workflow

1. Contributors open a PR with Conventional Commit messages and a matching PR title. CI checks formatting, types, lint, coverage, the build, package exports, declarations, and commit conventions.
2. A maintainer squash merges the PR into `main` after the required checks pass.
3. `release-please.yml` opens or updates a release PR. It groups releasable changes, chooses the version, and updates `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`.
4. A maintainer reviews the release notes and squash merges the release PR after CI passes. This merge is the release approval; the workflow does not automatically merge release PRs.
5. Release Please creates the version tag and GitHub release. The GitHub App's release event triggers `publish.yml`.
6. Publish verifies that the tag belongs to `main`, matches the package and manifest versions, and has a published stable GitHub release. It runs all quality checks, then tests and uploads the exact tarball.
7. A separate job downloads that artifact by ID and publishes it with Bun. Only this final step receives the npm token. It does not check out source, install project dependencies, or run package lifecycle scripts.

GitHub Actions are pinned to commit SHAs. Dependabot proposes weekly updates for actions and Bun development dependencies using Conventional Commit titles. Pull requests run with read-only permissions and no publishing secrets. Build and publication do not restore dependency caches. Publishing runs are serialized and are not cancelled when newer work arrives.

## Versioning and changelog

The empty initial manifest and `initial-version: 0.1.0` declare that nothing has been released yet. The first release PR generates `0.1.0` notes from the existing history. Do not create a temporary `v0.1.0` tag or a placeholder npm package version before that PR.

Afterward, `feat` bumps minor, and `fix`/`perf` bump patch. Breaking changes bump minor while the project is below 1.0, then major from 1.0 onward. Documentation, CI, tests, and maintenance changes do not start releases on their own. Release Please's default changelog includes features, fixes, performance improvements, and breaking changes.

To intentionally release `1.0.0`, include this footer in a maintainer commit or squash commit:

```text
chore: prepare the stable API release

Release-As: 1.0.0
```

Review the resulting release PR. Avoid a permanent `release-as` configuration, which would pin subsequent releases to the same version. `initial-version` only controls the first release.

Bun's root lockfile does not store this package's version, so version-only release PRs do not require lockfile regeneration. Frozen installs still run on every release PR and release build.

## One-time GitHub setup

These account settings cannot be enabled by merely committing workflow files. The intended repository is `AndrewLemons/gcode-seer`, with `main` as its default branch. Publish the repository there and push this configuration before activating releases. The workflows deliberately refuse to publish from forks.

### Release automation identity

Create a dedicated GitHub App, install it only on this repository, and disable its webhook if you do not need one. Give it these repository permissions:

| Permission    | Access                          |
| ------------- | ------------------------------- |
| Contents      | Read and write                  |
| Pull requests | Read and write                  |
| Issues        | Read and write (release labels) |
| Metadata      | Read (automatic)                |

Set the repository Actions variable `RELEASE_APP_CLIENT_ID` to the App's **client ID**, and the repository Actions secret `RELEASE_APP_PRIVATE_KEY` to its generated PEM private key. The workflow creates a short-lived installation token and revokes it at job completion.

Use the App rather than the default `GITHUB_TOKEN`: events generated with `GITHUB_TOKEN` do not trigger CI on release PRs or the publication workflow. No personal access token is required. See [Release Please's credentials guidance](https://github.com/googleapis/release-please-action#github-credentials) and [GitHub's App token action](https://github.com/actions/create-github-app-token).

In Settings → Actions → General, enable GitHub Actions and allow the pinned actions used here. Leave default workflow permissions read-only. If organizational policy requires it, enable “Allow GitHub Actions to create and approve pull requests.” The App permissions above are still required.

### Merge settings and required checks

In Settings → General → Pull Requests:

- Enable **squash merging only**; disable merge commits and rebase merging.
- Set the default squash message to **PR title and description**. Preserve `!`, breaking-change explanations, and any `Release-As:` footer when merging.
- Enable automatic deletion of merged head branches.

You can apply those settings with an authenticated maintainer's GitHub CLI:

```sh
gh api --method PATCH repos/AndrewLemons/gcode-seer \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY \
  -F delete_branch_on_merge=true
```

Create an active branch ruleset for `main` requiring pull requests, a linear history, resolved conversations, and these status checks from GitHub Actions:

- **Quality and package**
- **Conventional commits**

Require branches to be up to date before merging, block force pushes and deletion, and apply these requirements to administrators too. Zero required approving reviews permits a solo maintainer to release while still requiring PRs and passing checks; teams can require independent approval. Do not grant the release App a bypass of the main-branch checks. Run CI or open a PR once if the check names are not yet available in the settings UI.

Protect `v*` tags against updates and deletion. Allow the release App to create tags. Treat published tags as immutable.

### npm environment

Create a GitHub environment named **`npm`**. Under deployment branches and tags, select **Selected branches and tags** and add a **tag** rule for `v*`; do not allow branches. Use the tag rule rather than “protected branches only,” which can block release-tag runs.

Store `NPM_TOKEN` as an **environment secret**, not a repository secret. Required environment reviewers are optional: leaving them unset keeps publishing automatic after the release PR merge. If enabled, the final publishing job waits for that review.

## npm account setup and token rotation

Use Bun for publishing, as for all other project tooling. Create a **granular access token** on npm with **Read and write (publish and stage)** package permission and **Bypass two-factor authentication** enabled for unattended publication. A stage-only or read-only token cannot run this workflow. Organization administration permissions are not needed.

For an existing package, limit the token to `gcode-seer`. The package publishing-access setting must permit granular tokens with bypass 2FA; “disallow tokens” blocks this workflow. Store the token in the `npm` environment's `NPM_TOKEN` secret. See [npm's token setup](https://docs.npmjs.com/creating-and-viewing-access-tokens/) and [publishing access settings](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/).

For the **first publication**, the unscoped package does not yet exist and cannot be selected in a package-specific token. Use a short-lived granular token with **All Packages** access for the initial `0.1.0` release only, then immediately replace it with a token restricted to `gcode-seer` and revoke the bootstrap token. Confirm the name is available and the npm account is the intended owner before merging the first release PR. A registry 404 is not a reservation or a guarantee that npm will accept the name.

Choose the shortest practical expiration, record it in your maintainer calendar, and replace the environment secret before expiry. Never put a token in Git, workflow YAML, command arguments, or a PR. GitHub App keys and npm tokens are separate credentials.

**Migration deadline:** npm currently states that direct publishing with granular tokens will be removed in **January 2027**. This Bun/token workflow is therefore time-limited by registry policy. Before then, use Bun's native trusted-publishing support if it becomes available, or approve a narrowly scoped npm CLI publishing step with OIDC. A staged publication process would require maintainer approval on npm and reduce automation. See [npm's direct-publishing deprecation](https://docs.npmjs.com/about-access-tokens/#direct-publishing-is-being-deprecated). This workflow does not claim npm provenance attestations; Bun's documented token-based publishing does not provide the npm CLI's trusted-publishing/provenance flow.

## Activate the first release

After configuring the App, merge settings, branch protection, environment, and token:

```sh
gh workflow run release-please.yml --repo AndrewLemons/gcode-seer --ref main
```

Review the generated `chore(main): release 0.1.0` PR, wait for both checks, and squash merge it. Watch **Release Please** and then **Publish** in Actions. Verify the version on npm, then restrict the bootstrap token as described above. The existing temporary changelog has been cleared so the first release notes are generated from commits.

If you already published a real version before activating this setup, stop and reconcile that published version, its source tag, and the manifest first. Never overwrite an npm version or move its tag to different code.

## Recovery and troubleshooting

A GitHub release and an npm publication are separate operations. If publication fails, the tag and GitHub release remain, and the failed **Publish** run is the signal that npm publication is incomplete.

- **Release PR or publication never starts:** verify App installation, client ID, key, permissions, and Actions policy. Substituting `GITHUB_TOKEN` suppresses the follow-up workflows. Check the Release Please run for errors.
- **Required CI checks are missing:** confirm the App created the PR and CI is enabled. The normal PR workflow must run; do not bypass required checks.
- **No new release PR:** `docs`, `ci`, and other maintenance-only commits do not normally trigger one. Also check for an existing open release PR or a pending release label.
- **Publishing is waiting:** check the `npm` environment's tag rule and optional reviewers.
- **Authentication/permission failure:** replace an expired token, verify publish permission and bypass 2FA, check package ownership and package publishing settings, then re-run the failed job.
- **Build/identity checks fail:** fix the source/configuration via a PR and create a new release version. Do not move the failed release tag.

Use **Re-run failed jobs** for a transient publish failure while its tested artifact is retained (30 days). To rebuild and revalidate an existing release, dispatch Publish **on that release's tag**:

```sh
gh workflow run publish.yml --repo AndrewLemons/gcode-seer --ref v0.1.0
```

Dispatching on `main` deliberately skips publication. A tag without a matching published, stable GitHub release is rejected. Bun's `--tolerate-republish` makes a retry of an already published version a no-op; it never overwrites that version. Re-running Release Please alone will not republish an already-created release.

If several releases fail, recover them in ascending version order before releasing more changes: publishing an older unpublished version with `latest` can otherwise make it the default install. The workflow supports stable releases on `latest`; prerelease tags are rejected.

To inspect packaging locally without publishing:

```sh
bun install --frozen-lockfile
bun run check
bun run pack:check --output /tmp/gcode-seer.tgz
NPM_CONFIG_TOKEN=dry-run-placeholder bun publish /tmp/gcode-seer.tgz --dry-run --access public
```

Bun checks that authentication is configured even in dry-run mode; the placeholder above is deliberately not a credential and must only be used with `--dry-run`.

The `npm-package` Actions artifact contains the exact tested tarball. Keep publishing in the workflow so credentials, source validation, and the release process stay consistent.
