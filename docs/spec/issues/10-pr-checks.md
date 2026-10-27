# PR checks

Type: grilling
Status: resolved
Assignee: Pedro
Blocked by: 06

## Question

Which checks does the Factory's reusable GitHub Actions workflow run on a PR, and which of them are required before a merge into `develop`, `release/*` and `main`? Candidates: the project's gates (typecheck, lint, tests), build, secret scan, PR conventions (branch name, PR title with Story key, conventional commits). Decide per target branch, keeping Actions minutes on private repos in mind.

## Comments

- **From GitHub conventions (2026-10-20):** the PR gate hook already runs the gates locally before a PR opens; Actions is the second run on a clean machine. Under Pro these become required checks for auto-merge; on Free the bot merges into `develop` and `release/*` only once they are green.

## Answer

Resolved 2026-10-20 with Pedro.

**What Actions runs.** The Factory's reusable workflow runs the **gates** (the same commands as the local PR gate, so a green local run predicts a green CI run), the **build**, a **secret scan** (also catches pushes made outside a hooked session), and a **conventions** check (branch name `<type>/<key>-<n>-<slug>`, Story key in the PR title, conventional commits). Slow tests (E2E, DB/Supabase-backed) stay out: they belong to In integrated tests, or to a project that opts in.

**Per target branch.**

| Into | Gates | Build | Secret scan | Conventions |
|---|---|---|---|---|
| `develop` | ✅ | ❌ (the test-environment deploy builds) | ✅ | ✅ |
| `release/*` | ✅ | ✅ (new combination; User testing runs here) | ✅ | ✅ |
| `main` | ✅ | ✅ | ❌ | ❌ (already checked on the way in) |

**All required.** Every check blocks the merge; none is advisory, because the bot merges on green alone. A check too strict to block gets fixed, not demoted.

**Minutes discipline** (standing rules of the reusable workflow, not per-project choices): run on `pull_request` only, cancel superseded runs on the same PR, skip gates on docs-only diffs (the `gates` check still reports, green, with a docs-only summary, so rulesets that require it don't block the merge; SF-90), Linux runners only (any macOS/Windows build only at `release/*` for projects that need it), cache dependencies.

- *Amended 2026-10-23 (SF-41, after Flowboard's 737 MB Rust cache was saved on 8 PRs and restored 0 times):* GitHub scopes caches by branch, so a PR restores only what its own PR or its base branch saved, and a `pull_request`-only workflow never saves on `develop`. A project may **opt in** to a push run on its integration branch, through its own caller's trigger: it runs the gates only (no build, secret scan or conventions), skips docs-only pushes, and is the only run that saves the Rust cache, which PRs then restore. It costs one gates run per merge, after the merge, so nothing waits on it; free on public repos, minutes on private ones. System packages stay uncached: the apt cache action tried here passed a failed install and saved an empty cache.

**Minutes exhausted** (Free stops Actions until the month resets): no green checks means no auto-merge. The Run waits flagged "Needs Pedro"; Pedro merges by hand (logged override) or buys minutes. Hitting this is the signal to move to Pro.

Passed on: Per-project configuration (each project declares its gate and build commands, opt-in slow tests, and which non-Linux builds it needs), GitHub Pro upgrade (these become the rulesets' required checks), Build order (the reusable workflow is a Factory deliverable alongside the hooks).
