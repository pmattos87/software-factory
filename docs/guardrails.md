# Guardrails

What the Factory enforces mechanically in a Consumer project, and how a project sets it up. Why these rules and not others: [Hooks](spec/issues/04-hooks.md) and [PR checks](spec/issues/10-pr-checks.md). The skills that work inside them: [Workflow](workflow.md).

## Hooks

Shipped in [plugin/hooks/hooks.json](../plugin/hooks/hooks.json). They run before every Bash or PowerShell command in every Claude Code session of a project that enables the `factory` plugin, Pedro's manual sessions included. Each one blocks: the command doesn't run, and Claude gets the reason.

| Hook | Blocks |
|---|---|
| [Secret scan](../plugin/scripts/secret-scan.mjs) | A `git commit` whose changes carry a secret (staged changes; plus unstaged and untracked files when the same command runs `git add`, or the commit uses `-a` or paths), and a `git push` whose outgoing commits carry one. Uses [gitleaks](https://github.com/gitleaks/gitleaks); blocks if gitleaks is missing. |
| [Protected branches](../plugin/scripts/protected-branches.mjs) | A `git commit` while on the integration or production branch, and a `git push` that targets either one (by name, `HEAD:<branch>`, a bare push from them, `--all`/`--mirror`, or a delete). Tag pushes pass, including a bare `git push --tags` from production. |
| [PR gate](../plugin/scripts/pr-gate.mjs) | A `gh pr create` unless the working tree is clean, the PR follows the conventions below, the Feature branch's Story has a passed Review on the branch's head, and every gate command passes. A Gate is skipped, and the skip shown to Pedro and logged in `.git/factory/gates/pr-gate.log`, only when it already passed on the same tree (doc-only paths aside), with the same command and the same node and rustc versions: QA records that evidence through [run-gates.mjs](../plugin/scripts/run-gates.mjs) at Verify, and the PR gate records its own passes. Any difference (a code change, a merge resolution, a new toolchain) runs the Gate, and the PR checks still run every Gate. A resolution branch's head (the Feature branch merged into the integration branch to resolve a conflict: a merge commit whose first parent is already on the integration branch) is covered by the Review of its second parent, the Feature branch's head; the gates check the resolution. The Review is read with `flowboard-cli story show` (found through `FLOWBOARD_CLI`, PATH, then `C:\Program Files\FlowBoard`); the gate blocks when it can't read it. A `release/vX.Y.Z` PR needs no Review of its own (its Stories were reviewed), nor does a legacy project's Story, which can't record one. There is no override: shipping without Review is Pedro's, from his own terminal. |
| [Merge guard](../plugin/scripts/merge-guard.mjs) | A `gh pr merge` into the production branch (only Pedro merges there), or one without `--merge`, with `--squash`/`--rebase`, `--delete-branch` or `--admin`. Reads the PR's target branch with `gh pr view`. |

False positive from the secret scan: put a `gitleaks:allow` comment on the line, or add its fingerprint (shown in the block message) to `.gitleaksignore`. A project can tune rules with its own `.gitleaks.toml`.

Requirements on the machine: Node, Flowboard (for `flowboard-cli`) and gitleaks (`winget install Gitleaks.Gitleaks`; the hook also finds a winget install that isn't on PATH yet, or uses `GITLEAKS_PATH`).

## Conventions

Checked by the PR gate and again in Actions ([conventions.mjs](../plugin/scripts/lib/conventions.mjs)):

- A Feature branch is named `<type>/<KEY>-<n>-<slug>` (`feat/FB-12-billable-flag`), with a conventional-commit type, and is PR'd into the integration branch only. It reaches a Release when `promote` merges it into the `release/vX.Y.Z` branch locally, so no PR targets a Release branch.
- The PR title carries the Story key (`FB-12`).
- Every non-merge commit subject is a conventional commit: `type(scope): description`.
- A `release/vX.Y.Z` branch is PR'd into production only, and the PR title carries its version (`Release v1.6.0`).

## Per-project config

`.claude/factory.json` at the repo root. Without it, the secret scan and protected branches still run (with `develop` and `main`), but the PR gate and Actions refuse to run.

```json
{
  "boardKey": "FB",
  "branches": { "integration": "develop", "production": "main" },
  "gates": ["npx tsc --noEmit", "npx vitest run"],
  "build": ["npm run build"],
  "ci": {
    "node": "22",
    "rust": "stable",
    "rustWorkspace": "src-tauri",
    "apt": ["libwebkit2gtk-4.1-dev"],
    "install": ["npm ci"]
  },
  "agents": {
    "implementer": { "model": "opus", "reason": "Runs kept hitting the 2-round stop" }
  },
  "release": {
    "versionFiles": ["package.json", "package-lock.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"],
    "assets": {
      "build": ["npm ci", "npx tauri build"],
      "files": ["src-tauri/target/release/bundle/nsis/*-setup.exe", "src-tauri/target/release/bundle/msi/*.msi"]
    }
  }
}
```

| Key | Meaning |
|---|---|
| `boardKey` | Flowboard key in branch names and PR titles. A list when the repo hosts more than one board's work (Flowboard: `["FB", "SF"]`). |
| `branches` | Integration and production branch names; default `develop` and `main`. |
| `gates` | The project's Gates. Run by the PR gate locally and by Actions, in order; slow tests (E2E, DB-backed) stay out. |
| `build` | Build commands, run by Actions on PRs into production. |
| `ci.node`, `ci.rust` | Toolchain versions Actions sets up; omit what the project doesn't use. |
| `ci.rustWorkspace` | Where the Cargo workspace is, for the Rust cache. |
| `ci.apt` | Ubuntu packages Actions installs before the gates and build. |
| `ci.install` | Commands Actions runs before the gates and build (dependency install, CI-only prep). |
| `agents` | Optional tier overrides for a Role agent or a Specialist: `model` as an alias (`opus`, `sonnet`, `haiku`) and the `reason`, both required. Used by `split` and `run`; checked by `check-specialists.mjs` ([Specialists](specialists.md)). |
| `release.versionFiles` | Files that carry the project's version, all bumped together when a Release is cut: JSON files with a top-level `version` (`package.json`, `package-lock.json`, `tauri.conf.json`, `manifest.json`) and `Cargo.toml` (its `[package]` version). |
| `release.assets.build` | Commands that build the files attached to the GitHub Release (installers, zips), from the release tag. Run locally, on Pedro's machine, since Actions is Linux-only. They start with the dependency install (`npm ci`), so the build matches the tag and not whatever the checkout had installed. |
| `release.assets.files` | Glob patterns of the files those commands produce, relative to the repo root. |
| `release.changelog` | Optional: the project's changelog file (e.g. `docs/CHANGELOG.md`, Keep a Changelog format). When set, the Docs agent writes each Story's entry to `docs/changes/<KEY>.md` instead of the changelog, and promote rebuilds the version's section from exactly the picked Stories' files at the cut and after every sync (`release-version.mjs changelog`). The files stay in the repo; entries from before the setting move once into `docs/changes/unreleased-v<version>.md`. `check-release.mjs` checks the file exists. |
| `release.notes` | Client projects only, for `release-notes` and `test-guide`: `client` (who reads the deck), `language`, `staging` (where screenshots are taken and the test guide is dry-run: a URL, or the command that launches the staging app), and an optional `guide`, a Markdown file in the repo with the project's own lore: the theme both documents share (palette in light and dark, woff2 font files, logo), the cover wording, the UI labels in the project's language, the recurring cast of people and companies the scenarios use, the staging setup, and the screenshot traps. |

`node <plugin>/scripts/check-release.mjs [--client]`, run from the repo root, checks the `release` key: every version file exists and carries the same version, assets have a build, and a Client project has its notes settings.

## Actions

The project calls the Factory's reusable workflow, [.github/workflows/pr-checks.yml](../.github/workflows/pr-checks.yml), from its own `.github/workflows/pr-checks.yml`:

```yaml
name: PR checks
on:
  pull_request:
    branches: [develop, main]
jobs:
  factory:
    uses: pmattos87/software-factory/.github/workflows/pr-checks.yml@main
```

What runs depends on the PR's target branch:

| Into | gates | build | secret-scan | conventions |
|---|---|---|---|---|
| integration (`develop`) | ✅ | | ✅ | ✅ |
| production (`main`) | ✅ | ✅ | | |
| push to integration (opt-in) | ✅ | | | |

Gates are skipped when the diff touches only docs (`docs/`, `*.md`, `LICENSE`): the `gates` check still reports, green, with "Docs-only diff, gates skipped." as its summary and none of its steps run, so a ruleset that requires it doesn't block the merge. Runs go on Linux, are cancelled when a newer push to the same PR arrives, and cache npm and Cargo. System packages are not cached: [awalsh128/cache-apt-pkgs-action](https://github.com/awalsh128/cache-apt-pkgs-action) was tried in SF-41 and dropped, because a failed install still passed the step and saved an empty cache, and on a miss it downloads `apt-fast` from another repo's `master`.

### Warming the caches

GitHub scopes caches by branch: a PR restores only what its own runs or its base branch saved. With `pull_request` alone nothing is ever saved on `develop`, so every PR compiles from scratch. A project opts in to a push run on its integration branch by adding the trigger to its caller:

```yaml
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]
```

The push run runs the gates (checking `develop` after each merge too) and is the only run that saves the Rust cache; PR runs only restore it. npm saves on a cache miss wherever it happens, which on a PR means only when it changes the lockfile.

**Cost:** one gates run per merge into `develop`, in Actions minutes, not waiting time: it starts after the merge and nothing waits on it. Each PR run gets faster in exchange. Free on public repos; on a private repo it spends minutes, so opt in deliberately.

## Tests

`npm test` runs the unit tests and the hook tests, which plant a violation for each hook in a throwaway repo. The hook tests need git and gitleaks.
