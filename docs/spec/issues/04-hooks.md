# Hooks

Type: grilling
Status: resolved
Blocked by: 02
Assignee: Pedro

## Question

Which rules of the Workflow are enforced mechanically by Claude Code hooks, and which stay with an agent's judgment? Candidates: secret scan before staging, never commit on develop/main, verify passes before commit, board status moves, ADR-on-new-decision, stop after two failures.

## Comments

- **From Workflow stages (2026-10-20):** the merge into the integration branch is now automatic, so it has lost its human gate. Decide which mechanical check replaces it (e.g. verify must pass before the merge).

- **From Agent roster (2026-10-20):** Verify (per Task, by QA) and Review (per Story, by Codex) each stop the Run after 2 failed rounds. The PR is opened only after Review passes. Decide which of these are hooks and which stay with the Orchestrator.

## Answer

Resolved 2026-10-20 with Pedro.

**Rule for a hook.** A Workflow rule becomes a hook only when it can be checked mechanically (from the command or the repo state, with no judgment) **and** breaking it is costly or hard to undo. Everything else stays with an agent. Hooks that enforce a rule **block**; hooks that only give feedback **warn**.

**Factory hooks** (all blocking):

| Hook | Blocks |
|---|---|
| Secret scan | A commit that contains a secret |
| Protected branches | A commit or push on the integration or production branch (names come from the project's settings, closing today's `develop` gap) |
| PR gate | Opening a PR unless the Story records a passed Review **and** the project's gates pass on the branch |

The PR gate replaces Pedro's merge approval. After the PR opens, auto-merge depends only on the PR's checks being green.

**Kept with agents, not hooks:**
- **Verify before commit**: commits happen mid-Task. The gates half of Verify is covered by the PR gate; the judgment half stays with QA.
- **Board status moves**: the Orchestrator and skills make them, because a move means something in the Workflow.
- **ADR on a new decision**: judgment, so it goes on QA's definition of done.
- **Stop after 2 failed rounds**: the Orchestrator counts rounds, because they are Run state.

**Scope.** Hooks run in **every session** of a Consumer project, Pedro's manual work included. Shipping without Review needs a conscious, visible override, never a quiet bypass.

- *Amended 2026-10-22 (phase 5, SF-6):* the PR gate has **no override**. Shipping without Review means Pedro opens the PR from his own terminal, which the hooks don't see: that is the visible bypass. The Review the gate requires is a passed verdict on the branch's **head** commit, read from the Story through `flowboard-cli`; a gate that can't read it blocks. Two PRs need no Review of their own: a `release/vX.Y.Z` PR into production (each pick was reviewed on its own Story), and a legacy project's Story (it can't record a Review).

**Ownership.** The Factory plugin ships the hooks above; projects can add their own hooks (the vitest-related runner becomes one, for vitest projects) but cannot switch off the Factory's. The deny lists stay as a second layer.

Passed on: Flowboard integration (the Story records the Review verdict so the PR gate can read it), GitHub conventions (what the PR's checks are and whether Actions runs them), Skills consolidation (`ship`'s own secret scan now overlaps the hook).
