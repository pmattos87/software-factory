# Guardrails

What the Factory enforces mechanically in a Consumer project, and how a project sets it up. Why these rules and not others: [Hooks](spec/issues/04-hooks.md) and [PR checks](spec/issues/10-pr-checks.md).

## Hooks

Shipped in [plugin/hooks/hooks.json](../plugin/hooks/hooks.json). They run before every Bash or PowerShell command in every Claude Code session of a project that enables the `factory` plugin, Pedro's manual sessions included. Each one blocks: the command doesn't run, and Claude gets the reason.

| Hook | Blocks |
|---|---|
| [Secret scan](../plugin/scripts/secret-scan.mjs) | A `git commit` whose changes carry a secret (staged changes; plus unstaged and untracked files when the same command runs `git add`, or the commit uses `-a` or paths), and a `git push` whose outgoing commits carry one. Uses [gitleaks](https://github.com/gitleaks/gitleaks); blocks if gitleaks is missing. |
| [Protected branches](../plugin/scripts/protected-branches.mjs) | A `git commit` while on the integration or production branch, and a `git push` that targets either one (by name, `HEAD:<branch>`, a bare push from them, `--all`/`--mirror`, or a delete). |
| [PR gate](../plugin/scripts/pr-gate.mjs) | A `gh pr create` unless the working tree is clean, the PR follows the conventions below, and every gate command passes. Requiring a passed Review comes with phase 5. |

False positive from the secret scan: put a `gitleaks:allow` comment on the line, or add its fingerprint (shown in the block message) to `.gitleaksignore`. A project can tune rules with its own `.gitleaks.toml`.

Requirements on the machine: Node and gitleaks (`winget install Gitleaks.Gitleaks`; the hook also finds a winget install that isn't on PATH yet, or uses `GITLEAKS_PATH`).

## Conventions

Checked by the PR gate and again in Actions ([conventions.mjs](../plugin/scripts/lib/conventions.mjs)):

- A Feature branch is named `<type>/<KEY>-<n>-<slug>` (`feat/FB-12-billable-flag`), with a conventional-commit type, and is PR'd into the integration branch or a `release/vX.Y.Z` branch, never into production.
- The PR title carries the Story key (`FB-12`).
- Every non-merge commit subject is a conventional commit: `type(scope): description`.
- A `release/vX.Y.Z` branch is PR'd into production only.

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
  }
}
```

| Key | Meaning |
|---|---|
| `boardKey` | Flowboard key in branch names and PR titles. A list when the repo hosts more than one board's work (Flowboard: `["FB", "SF"]`). |
| `branches` | Integration and production branch names; default `develop` and `main`. |
| `gates` | The project's Gates. Run by the PR gate locally and by Actions, in order; slow tests (E2E, DB-backed) stay out. |
| `build` | Build commands, run by Actions on PRs into `release/*` and production. |
| `ci.node`, `ci.rust` | Toolchain versions Actions sets up; omit what the project doesn't use. |
| `ci.rustWorkspace` | Where the Cargo workspace is, for the Rust cache. |
| `ci.apt` | Ubuntu packages Actions installs before the gates and build. |
| `ci.install` | Commands Actions runs before the gates and build (dependency install, CI-only prep). |

## Actions

The project calls the Factory's reusable workflow, [.github/workflows/pr-checks.yml](../.github/workflows/pr-checks.yml), from its own `.github/workflows/pr-checks.yml`:

```yaml
name: PR checks
on:
  pull_request:
    branches: [develop, main, 'release/**']
jobs:
  factory:
    uses: pmattos87/software-factory/.github/workflows/pr-checks.yml@main
```

What runs depends on the PR's target branch:

| Into | gates | build | secret-scan | conventions |
|---|---|---|---|---|
| integration (`develop`) | ✅ | | ✅ | ✅ |
| `release/*` | ✅ | ✅ | ✅ | ✅ |
| production (`main`) | ✅ | ✅ | | |

Gates are skipped when the diff touches only docs (`docs/`, `*.md`, `LICENSE`). Runs go on Linux, are cancelled when a newer push to the same PR arrives, and cache npm and Cargo.

## Tests

`npm test` runs the unit tests and the hook tests, which plant a violation for each hook in a throwaway repo. The hook tests need git and gitleaks.
