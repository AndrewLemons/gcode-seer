# Releases

Releases use **Release Please → GitHub Releases → npm staging → maintainer approval with 2FA**. Versioning, changelogs, tags, builds, staging, and approval notifications are automated. A maintainer reviews and approves each staged version before it becomes available on npm.

Bun remains the tool for development, dependencies, builds, tests, and tarball creation. Bun 1.4.2 does not support npm staging, so the release boundary uses npm CLI **11.19.1**, pinned in the workflow, on Node 24. npm documents a minimum of npm 11.15.0 and Node 22.14.0 for staging. Contributors do not need Node or npm for development. See [npm's staging guide](https://docs.npmjs.com/staged-publishing/).

## Normal workflow

1. Contributors open a PR with Conventional Commits and a matching PR title. CI checks formatting, types, lint, coverage, build, package exports, declarations, and commit conventions.
2. A maintainer squash merges the PR into `main` after the required checks pass.
3. `release-please.yml` opens or updates a release PR with the version and changelog.
4. A maintainer reviews and squash merges the release PR after CI passes. Release Please creates the tag and GitHub release; its GitHub App triggers `publish.yml`.
5. **Verify release package** checks tag ancestry, package identity, and the release manifest, runs the quality checks, and uploads the exact tested tarball as `npm-package`.
6. **Stage on npm** downloads the artifact by ID and runs `npm stage publish` with a stage-only token and lifecycle scripts disabled. Only this step receives the npm token. It installs no project dependencies and checks out only the release helper. If the package does not exist yet, it requests the interactive bootstrap described below instead.
7. **Notify maintainer** creates or updates a GitHub issue assigned to `AndrewLemons`, containing the stage ID, artifact integrity, workflow link, and review commands. The Actions summary also records the pending action. This job has issue-write permission but no npm credential.
8. The maintainer inspects the staged package and approves it on npm with 2FA. A green workflow means staging succeeded or a bootstrap task was created; it does **not** mean the package was published.

GitHub Actions are pinned to commit SHAs. Dependabot proposes weekly action and Bun dependency updates. The standalone npm CLI pin should be reviewed when updating release tooling. PRs have read-only permissions and no release secrets. Build and staging do not restore dependency caches. Staging attempts are serialized. CI never runs `npm stage approve`, direct `npm publish`, dist-tag changes, deprecation, or unpublish operations.

## Versioning and changelog

`gcode-seer@0.1.0` was already published manually. The manifest records that version, and `bootstrap-sha` starts release history after `9022c41bf1dcfee02d920f655e25f4e5267c1b86`: the published package's source files and package metadata were verified against that commit. The first automated release will use a newer version; it will not try to stage `0.1.0` or replay the original features. No historical GitHub tag or release is fabricated. The bootstrap boundary is ignored once Release Please establishes its own release history.

Afterward, `feat` bumps minor, and `fix`/`perf` bump patch. Breaking changes bump minor while the project is below 1.0, then major from 1.0 onward. Documentation, CI, tests, and maintenance changes do not start releases on their own. Release Please's default changelog includes features, fixes, performance improvements, and breaking changes.

To intentionally release `1.0.0`, include this footer in a maintainer commit or squash commit:

```text
chore: prepare the stable API release

Release-As: 1.0.0
```

Review the resulting release PR. Avoid a permanent `release-as` configuration, which would pin subsequent releases to the same version.

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

Store `NPM_TOKEN` as an **environment secret**, not a repository secret. Environment reviewers are optional; enabling them adds an approval before staging, separate from npm's required 2FA approval. Leave them unset to stage automatically after merging the release PR.

Enable repository **Issues** and permit the notification job's `issues: write` permission. It uses `GITHUB_TOKEN`; no extra notification secret or external messaging service is needed.

## Stage-only npm token

Create a granular npm token restricted to **gcode-seer** with **Read and write (stage only)** permission. Leave **Bypass two-factor authentication disabled**; staging does not require 2FA. No organization administration permission is needed. Put it in the `npm` environment's `NPM_TOKEN` secret. The workflow passes it to npm as `NODE_AUTH_TOKEN` via the registry-scoped configuration created by setup-node.

Replace and revoke any previous direct-publish or broad bootstrap token. npm recommends the package setting **Require two-factor authentication and disallow tokens** for direct publishing; staging still defers 2FA to approval. See [npm's staging token behavior and recommendations](https://docs.npmjs.com/cli/v11/commands/npm-stage/#best-practices) and [token creation](https://docs.npmjs.com/creating-and-viewing-access-tokens/).

A stage-only token is **not harmless**: as npm notes, it can still deprecate versions, move dist-tags, and unpublish within its permissions. Keep it package-scoped, available only to the staging step, and rotate it before expiry. Never put it in Git, logs, or command arguments. Approval uses a maintainer's personal npm session and 2FA, never the CI token. This workflow does not currently generate npm provenance attestations.

## First publication

This repository already has the real `0.1.0` library on npm. Configure its package-scoped stage-only token and run Release Please on `main` after merging this setup to release a newer version. The instructions below cover a new package or a future rename.

**npm cannot stage a brand-new package.** The first real release must be published interactively once. Do not create a fake package version or give CI a direct-publish token to work around this restriction.

1. Configure the GitHub App, repository checks, and `npm` environment. It is fine to leave `NPM_TOKEN` unset until the package exists.
2. Initialize release configuration for that new package, run Release Please, review its initial release PR, and squash merge it after CI passes:

   ```sh
   gh workflow run release-please.yml --repo AndrewLemons/gcode-seer --ref main
   ```

3. Publish builds and verifies the package, detects the missing npm package, and opens a bootstrap issue for the release version. No registry write is attempted.
4. From the linked workflow run, download and inspect the **tested** `npm-package` artifact. With Node 24 and npm CLI 11.19.1 installed locally, log in as the intended owner and publish that tarball interactively:

   ```sh
   gh run download RUN_ID --repo AndrewLemons/gcode-seer --name npm-package --dir /tmp/gcode-seer-first-release
   npm login
   npm publish /tmp/gcode-seer-first-release/gcode-seer.tgz --access public --ignore-scripts
   ```

   Replace `RUN_ID` with the run linked in the task. Confirm name ownership, inspect the archive, and compare its SHA-512 integrity with the task before publishing. Use your own npm login with 2FA and remove CI-token environment variables from your local shell. Do not rebuild a different tarball.

5. Create the package-scoped **stage-only** token now that the package exists, store it in the environment, and revoke any older token. Subsequent versions follow the normal staging path.
6. Close the bootstrap issue, or rerun Publish on that release's tag: it verifies the published version's integrity and closes the task automatically.

If a real version already exists before adopting this configuration, reconcile its source tag, version, and Release Please manifest before starting. Never overwrite an npm version or move a released tag.

## Review and approve a staged version

npm offers a **Staged Packages** tab on npmjs.com. Review the matching package, version, and stage ID there and choose **Approve**; npm prompts for 2FA. Alternatively, use the exact commands in the GitHub task with your personal npm session:

```sh
npm login
npm stage view STAGE_ID
npm stage download STAGE_ID
# Inspect the downloaded tarball and compare its integrity before approving.
npm stage approve STAGE_ID
```

Use npm CLI 11.15+ (the workflow pins 11.19.1). Replace `STAGE_ID` with the UUID from the task, never an unreviewed stage from another run. To compute the downloaded file's integrity using Bun:

```sh
bun -e 'const bytes = await Bun.file(Bun.argv[1]).bytes(); console.log("sha512-" + new Bun.CryptoHasher("sha512").update(bytes).digest("base64"));' /path/to/downloaded.tgz
```

Compare that value with the issue and Actions summary. Approval publishes the staged bytes. To discard a stage, run `npm stage reject STAGE_ID` and complete 2FA. Staging does not reserve a separately publishable copy: npm uses the same version uniqueness constraint for staged and published versions. The workflow never rejects or replaces a stage automatically. See [npm stage command behavior](https://docs.npmjs.com/cli/v11/commands/npm-stage/).

Stages target `latest`, and npm fixes the tag when staging. Approve pending versions in ascending order so an older version does not become the default install. Close the task after approving or rejecting it. After approval, rerun Publish on its tag if you want automatic public-integrity verification and task closure; no scheduled job or npm webhook currently closes tasks.

## Notifications

npm's staging documentation describes the review UI but does not promise an email when a stage is ready. The workflow therefore creates one **GitHub issue per version**, assigned to and mentioning `AndrewLemons`. The mention subscribes the maintainer to the conversation by default; delivery by email or inbox depends on personal [GitHub notification settings](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications).

Retries update the existing bot-created issue, including a refreshed stage ID after a manually rejected version is re-staged. They do not post duplicate issues or repeated comment reminders. There is no recurring reminder schedule. The Actions summary remains available if issue creation fails, and the separate notification job fails visibly so it can be retried without staging again. Change the assignee in `scripts/notify-release.ts` when responsibility changes.

## Recovery and troubleshooting

A GitHub release, npm stage, and public npm version are separate states. Release Please's GitHub release can exist while npm is still awaiting review.

- **Release PR or workflow never starts:** verify App installation, client ID, key, permissions, and Actions policy. Substituting `GITHUB_TOKEN` for the App suppresses follow-up workflows.
- **Required checks are missing:** confirm the App created the PR and CI is enabled; do not bypass checks.
- **No new release PR:** maintenance-only changes do not normally create one; check for an existing release PR or a pending release label.
- **Staging waits before it starts:** check the environment tag rule and optional reviewers. npm approval is a separate later action.
- **Missing package:** follow the bootstrap task; CI does not fall back to direct publication.
- **Authentication failure:** check token expiry, stage-only package permission, package ownership, and environment secret placement. Bypass 2FA is not required. Do not substitute a personal session into CI.
- **Version already staged:** retries list existing stages and download the matching stage to verify SHA-512. Matching bytes and `latest` reuse its stage ID; a mismatch fails for maintainer investigation.
- **Version already published:** retries verify public tarball integrity and skip staging; mismatched bytes fail. They do not change any dist-tag.
- **Upload succeeded but the run failed:** retry the failed job; the existing-stage check recovers the stage ID. Network and registry errors are not treated as successful uploads.
- **Notification failed:** enable Issues and the job's issue-write permission, then re-run that job. Its failure does not remove the npm stage. The staging job summary has the stage ID and integrity.
- **Build/identity check failed:** fix the source via a PR and release a new version. Do not move the existing tag.

Use **Re-run failed jobs** while the tested artifact remains available (30 days). To rebuild and revalidate an existing release using the workflow stored in that tag:

```sh
gh workflow run publish.yml --repo AndrewLemons/gcode-seer --ref v0.2.0
```

Dispatching on `main` deliberately skips the release jobs. A tag without a published stable GitHub release is rejected. Re-running Release Please alone does not restage an existing release. Tags created before the staging workflow was adopted still contain the old workflow: do not rerun their direct-publishing jobs; adopt staging in a new release and revoke direct-publish credentials.

To inspect packaging locally without registry writes:

```sh
bun install --frozen-lockfile
bun run check
bun run pack:check --output /tmp/gcode-seer.tgz
npm stage publish /tmp/gcode-seer.tgz --dry-run --ignore-scripts --access public --tag latest
```

The dry run does not create a stage or verify account permissions. Live staging requires the configured environment token and an existing package; approval always remains interactive with 2FA.
