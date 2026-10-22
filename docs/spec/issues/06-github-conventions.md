# GitHub conventions

Type: grilling
Status: resolved
Assignee: Pedro
Blocked by: 02

## Question

What are the Factory's GitHub conventions across all consumer projects? Branch model (develop/main, branch per phase vs per story), branch naming, PR target and who merges, commit style, tags and pre-releases, and whether GitHub Issues / Actions play any role given Flowboard is the tracker.

## Comments

- **From Workflow stages (2026-10-20):**
  - Releases are hand-picked, so the branch model must allow leaving out a Story already merged into the integration branch (e.g. one with an open bug Task). Hardest new problem; candidates include release branches, cherry-picking or feature flags.
  - Client projects need a new intermediate branch for User testing, between integration and production.
  - The merge into the integration branch is automatic.
  - `ship` must pick its target branch according to the Stage.

- **From Agent roster (2026-10-20):** The PR into the integration branch is opened only after Codex's Review passes, so the PR is never a review venue. Review is on the whole Story diff.

- **From Hooks (2026-10-20):** the PR-gate hook refuses to open a PR until the Review passes and the gates are green. Auto-merge then depends only on the PR's checks, so decide what those checks are and whether GitHub Actions runs them. A hook blocks commits and pushes on the integration and production branches, with branch names taken from the project's settings.

## Answer

Resolved 2026-10-20 with Pedro.

**Branch model.** One Feature branch per Story, cut from **production** (`main`), never from integration. It is merged (with a merge commit) into the **integration branch** (`develop`) automatically once checks pass; Pedro's human gate is testing there (In integrated tests). The integration branch is a testing ground only and is **never merged into production**.

- **Leaving a Story out of a Release** = not merging its Feature branch. Chosen over feature flags (flag code in every Story, five stacks) and cherry-picking (diverging copies, several commits per Story).
- **Bug Tasks** commit on the Story's Feature branch and go through integration again for re-testing, wherever the bug was found. Only a Story that passed integration is merged into a Release.
- **A Story depending on another unreleased Story** ships with it.
  - *Amended 2026-10-21 (phase 4, after the FB-98 Run stopped waiting for SF-31 to reach `main`):* its Feature branch is still cut from `main`, then the dependency's Feature branch (never the integration branch) is merged into it, and the dependency is recorded with a depends-on link so the Release pick warns when the two are split. The Task splitter flags dependencies; `run` and `integrate` merge them.
- **Release** = a `release/vX.Y.Z` branch cut from `main`, into which Pedro's picked Feature branches are merged. For Client projects it is also the User testing branch (betas tagged `vX.Y.Z-beta.N`). It reaches production by a PR into `main` that Pedro approves, then a tag and GitHub Release.
  - *Amended 2026-10-21 (phase 6, SF-7):* the picks are merged into the Release branch **locally** by `promote`, as the machine account. No PR targets `release/*`, so the only PR of a Release is the one into `main`, whose checks run the build once (each Feature branch already passed its checks into `develop`). When a pick is removed, the Release branch is **re-cut** from `main` (deleted and cut again, after Pedro's go-ahead) while no beta has been tagged; after a beta, the Story's merge is reverted instead. Tag pushes pass the protected-branches hook. The `release/*` row of the table below no longer applies.

**Conventions.**

| Topic | Rule |
|---|---|
| Branch names | `<type>/<board key>-<n>-<slug>` with the conventional-commit type (`feat/HL-123-billable-flag`, `fix/…`, `docs/…`, `chore/…`); `release/vX.Y.Z` |
| Integration branch default | `develop` (Flowboard and Atlas rename `dev`; Viagem Pronta gains one); names stay settable per project |
| Merge method | Merge commits only; squash and rebase off (Feature branches live on after their first merge) |
| Commits | Conventional commits `type(scope): description`, as today; Story key in branch name and PR title, not in each commit |
| Versions | Semver, proposed from the picked Stories' commit types when the Release is cut, confirmed by Pedro |
| Branch cleanup | Feature branch deleted when its Release reaches production; Release branch after the tag; a dropped Story is reverted out of integration and its branch deleted |
| GitHub Issues | Off; Flowboard is the only tracker |
| GitHub Releases | One per production tag; pre-release per beta tag; installers attached there |
| Actions | Runs the PR checks from one reusable Factory workflow; *which* checks → [PR checks](10-pr-checks.md) |

**Identities and enforcement.** The agent works as a separate machine account, **`pmattos-pr-review-agent`** (own account, email via a Proton `+` alias, collaborator on each repo, classic token, since a fine-grained one can't target Pedro's personal repos). Pedro's account is the approver. Setup details: [Bot account](../../reference/bot-account.md).

Target design (needs GitHub Pro; private repos on Free return "Upgrade to GitHub Pro" for branch protection and rulesets):

| Into | PR | Green checks | Pedro's approval |
|---|---|---|---|
| `develop` | ✅ | ✅ | ❌ auto-merge |
| `release/*` | ✅ | ✅ | ❌ (Stories already picked) |
| `main` | ✅ | ✅ | ✅ = the Promote gate |

Rules bind Pedro too; his logged admin bypass is the visible override for shipping without Review.

Interim while on Free (Pedro's choice for now): same flows, enforced by hooks and deny lists. Actions still runs the checks; the bot merges into `develop` and `release/*` itself only once they are green; only Pedro merges into `main`.

Passed on: Flowboard integration (Stories record their Feature branch, PRs and Release), Per-project configuration (branch names, the Actions workflow), Rollout (`dev` → `develop` renames, creating the bot account and adding it to repos), Build order (Pro upgrade swaps interim enforcement for rulesets).
