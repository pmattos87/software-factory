# Workflow stages

Type: grilling
Status: resolved
Blocked by: —

## Question

What stages does the Workflow have, what is handed from one stage to the next, and where are the human gates? Start from Hammer Loc's 0–7 shape (design → ticketing → branch → per-task loop → close branch → test build → feedback / production) and decide what to keep, merge, cut or add — including how optional client-facing stages are switched on per project.

## Comments

### 2026-10-20 — session 1 (partial, not resolved)

**Settled:**
- **A Run is one Story.** A batch is several Runs sharing a branch; a phase/sprint/label is a grouping of Stories, not a Run. (CONTEXT.md updated.)
- **The Story is the only thing passed between Stages.** Every Stage reads from and writes to the Flowboard Story; ADRs, specs and PRs are linked from it.

**Deferred: the stage skeleton.** Pedro calls this the most important question of the project and wants to bring his own view first. The proposal below is only a **starting point**, and Pedro said it isn't quite what he has in mind:

| # | Stage | What happens |
|---|---|---|
| 1 | Shape | Grilling, domain modeling, Wayfinder, ADRs, spec |
| 2 | Plan | Stories on Flowboard, each with a full brief |
| 3 | Build | Branch cut, then each Story goes through its agent loop and verify |
| 4 | Integrate | `ship`: secret scan, commits, PR to the integration branch, Pedro merges |
| 5 | Client release *(optional)* | Test build, release notes, client tests, feedback goes back to Plan |
| 6 | Production | PR integration → main, tag/release, Stories marked done |

**Still open once the skeleton is set:** human gates, how optional Stages are switched on per project, and where client feedback re-enters.

**Next session:** start from Pedro's description of the stages, not from this table.

## Answer

Resolved 2026-10-20 with Pedro (session 2).

| # | Stage | Works on | Gate to leave it |
|---|---|---|---|
| 1 | Shape | An idea or effort, before any Story exists | Pedro approves the Plan |
| 2 | Plan | Stories split into Tasks, each with a full brief | Pedro triggers Build |
| 3 | Build | One Run: each Task is one agent session plus verify | All Tasks pass verify |
| 4 | Integrate | PR into the integration branch, **merged automatically** | — |
| 5 | In integrated tests | Pedro tests manually on the integration branch | Pedro passes it |
| 6 | User testing *(Client projects only)* | A hand-picked Release on the intermediate branch, tested by the client | Client approval |
| 7 | Production | A hand-picked Release, PR into the production branch, tag | Pedro promotes it |

Rules:
- **Run = one Story.** The Story is the only thing passed between Stages; ADRs, specs and PRs are linked from it.
- **Story → Tasks.** A Story is split into Tasks in Plan; in Build each Task is one agent session.
- **Defects in In integrated tests or User testing** become a bug **Task** on the Story. The Story waits in its Stage while the bug Task goes through Build → Integrate; then Pedro tests the Story again.
- **New client requests** become new Stories at Plan. **Bugs in Production** become new Stories, because the original Story is done.
- **Releases are hand-picked** by Pedro, case by case, not automatic.
- **Internal vs Client project** is set when the project is created; only Client projects have User testing.

Passed on to other tickets: GitHub conventions (excluding already-merged Stories from a Release, the User testing branch, `ship` choosing its target), Hooks (a mechanical check replacing the merge gate), Flowboard integration (status ladder for the 7 Stages, Stories waiting on bug Tasks, Releases).
