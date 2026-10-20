# Flowboard integration

Type: grilling
Status: resolved
Blocked by: 02
Assignee: Pedro

## Question

How does the Factory talk to Flowboard? Decide the status ladder (keep refining → ready_for_development → todo → in_progress → in_review → done/canceled or change it), how a Run is represented on the board, and whether the Factory keeps writing straight to the SQLite DB via the flowboard-db MCP or goes through a Flowboard API. Input: Flowboard has parent/child and labels but no native blocking.

## Comments

- **From Workflow stages (2026-10-20):** the status ladder must show the 7 Stages (with User testing only on Client projects), a Story waiting on open bug Tasks, Stories split into Tasks, and Releases (hand-picked sets of Stories with a version number).

- **From Agent roster (2026-10-20):** Each Task carries its assigned agent, an estimate and a risk flag (from the Task splitter). A Run stopped after 2 failed Verify or Review rounds must be visible on the Story, with Codex's findings linked.

- **From Hooks (2026-10-20):** the Story must record whether its Review passed. A blocking PR-gate hook reads that verdict before allowing the PR into the integration branch.

- **From GitHub conventions (2026-10-20):** each Story has one Feature branch (`<type>/<board key>-<n>-<slug>`); the Story records its Feature branch, its PRs and which Release it went into. A Release is a `release/vX.Y.Z` branch of hand-picked Stories, so Flowboard needs a way to pick Stories into a Release.

## Answer

Resolved 2026-10-20 with Pedro.

**Story ladder** (Factory projects). Each status belongs to one Stage and one board. The assignee is "whose move is it" and is set **automatically** when the status moves.

| Status | Stage | Assignee |
|---|---|---|
| `backlog` | Plan: a real demand, not yet refined | Pedro |
| `refining` | Plan: brief being written, Subtasks split | Pedro |
| `ready` | Plan approved, waiting for Pedro to start the Run | Pedro |
| `building` | Build + Integrate | Agent |
| `integrated_tests` | In integrated tests | Pedro |
| `tested` | Passed by Pedro, waiting to be picked into a Release | Pedro |
| `user_testing` | Its Release is on User testing (Client projects only) | the project's primary client contact |
| `done` | In Production | — |
| `canceled` | Dropped | — |

- `backlog` replaces today's trick of showing `todo` as "Backlog" on the Discovery board.
- Shape has no status, because no Story exists yet.
- The Release is picked *before* User testing, because the client tests the Release branch.
- **Agent** is one generic AI assignee (Claude, Codex…), only there to tell AI work from human work.

**Existing projects aren't disturbed.**
- The migration only **adds** statuses; the old ones stay valid.
- Each project carries a **legacy / Factory** ladder flag next to an **Internal / Client** flag. Legacy projects keep today's statuses and boards; the Factory refuses to write to them.
- When a project adopts the Factory, its open items are mapped once to the new ladder; closed items are never touched. The mapping is decided per project in Rollout.

**Conditions are flags, not statuses.**
- **Waiting on bug Subtasks** is derived from open bug-Subtask children.
- **Stopped Run** (2 failed rounds) is set by the Orchestrator and cleared by Pedro.
- The status always says which Stage the Story is in.

**Subtask ladder**: `todo → in_progress → done / canceled`, where `done` means Verify passed. This is today's dev ladder minus `in_review`, so it needs no mapping. Which Role agent or Specialist builds a Subtask is named in its brief, not in a field.

**A Run** is the Story plus an event trail (Stage entered, Verify/Review rounds and verdicts, stopped, restarted). There is one Run per Story; a bug-Subtask rebuild adds rounds to the same Run. The exact events are for Run-tracking UI.

**First-class fields**, never prose, because hooks read them:
- **Story:** Feature branch, PRs, Review verdict with the reviewed commit, link to Codex's findings, Release, and depends-on links to other Stories (used only to *warn* when picking a Release).
- **Subtask:** estimate (`story_points`) and risk flag.
- **Project:** client contact(s), with one primary who receives `user_testing`.

**Releases** are a new Flowboard entity (version, state, picked Stories), picked on their own screen from `tested` Stories. That pick is the source of truth: the release-promotion skill reads it and builds `release/vX.Y.Z`; re-running the skill brings the branch in line with a changed pick. Sprints are kept as they are for now.

**Transport.** The Factory talks to Flowboard through a **domain-level interface**: operations such as "move Story", "record Review verdict" and "pick into Release", which enforce the ladder, the flags and the assignee rule.
- It is exposed as a **CLI**, because hooks are shell commands, with a thin MCP over it for agents.
- It writes to the same SQLite file and works with the app closed.
- Raw SQL via `flowboard-db` stays for reads and the second-brain skills only.
- Rejected: raw SQL writes (every skill re-implements the rules) and an HTTP API in the app (hooks fail when it's closed).

**Naming.** The domain term is now **Subtask** (CONTEXT.md updated); Flowboard's own rename is FB-101. **Agent** was added to the glossary.

Passed on: Run-tracking UI (which events the Run trail holds; which statuses each board shows; flags for waiting-on-bugs and stopped), Build order (Flowboard migration + domain interface before any skill writes to the board; the rewritten `flowboard-issue` becomes a client of the interface), Rollout (status mapping per project, the existing "Claude" person becoming Agent, whether sprints survive).
