# Build order

Type: grilling
Status: resolved
Assignee: Pedro
Blocked by: 02, 03, 04, 05, 06, 07, 08, 10

## Question

In what phases is the Factory built, and how is each phase proven to work before the next starts? Each phase must be small, independently verifiable on a real consumer project, and leave the projects' current workflow usable throughout.

## Comments

- **From Skills consolidation (2026-10-20):** the Factory ships renamed copies of the Shape skills plus rewritten Integrate, Release-promotion, Story-status and release-notes skills; the user-level originals must keep working while each Consumer project switches them off only once it adopts the Factory. Skills to start a Run and to send a Story to the Task splitter don't exist yet.

- **From GitHub conventions (2026-10-20):** enforcement starts in an interim, hook-only mode on GitHub Free; a later GitHub Pro upgrade swaps in rulesets and native auto-merge. Creating the `pmattos-pr-review-agent` machine account and adding it to repos is an early setup step.

- **From Flowboard integration (2026-10-20):** Flowboard needs an additive migration (new statuses, legacy/Factory and Internal/Client flags, Story/Subtask fields, Releases, client contacts, depends-on links) and a domain-level CLI + MCP *before* any Factory skill or hook writes to the board. The rewritten `flowboard-issue` and the PR-gate hook are both clients of that interface.

- **From Run-tracking UI (2026-10-20):** the Story page (with its Run node graph and Subtask mini kanban) and the Active Runs overview read the Run trail. So the Flowboard CLI must write the new `activity_log` event kinds (Verify/Review rounds, agent handoffs, stops, PRs, Release picks) before these screens can show anything real. They are Flowboard app work, separate from the Factory plugin.

- **From PR checks (2026-10-20):** the Factory also ships a reusable GitHub Actions workflow: gates, secret scan and conventions on every PR, plus build for `release/*` and `main`. Bot auto-merge into `develop` and `release/*` waits on it, so it must exist (and each project must declare its gate and build commands) before auto-merge is switched on.

## Answer

Resolved 2026-10-20 with Pedro.

**Pilot: Flowboard** (Internal) proves every phase. Its switch from the legacy ladder to the Factory ladder is the first real proof that both can live side by side. The Factory's own build is tracked as its own **Software Factory** project in the Flowboard DB, one Story per phase.

**Phases**, foundations first, each leaving something usable on its own:

| # | Phase | Ships | Proven when |
|---|---|---|---|
| 0 | Setup | `pmattos-pr-review-agent` account, `dev`→`develop` on Flowboard, empty plugin installed, Software Factory project on the board | plugin loads in Flowboard; user-level skills still work |
| 1 | Flowboard foundation | additive migration (statuses, flags, Story/Subtask fields, client contacts, depends-on), domain CLI + MCP, Run-trail event kinds | legacy projects untouched; the CLI drives a test Story along the new ladder and refuses illegal moves |
| 2 | Guardrails | 3 hooks (secret scan, protected branches, PR gate), reusable Actions workflow, minimal per-project config | each hook blocks a planted violation; a Flowboard PR goes green in Actions |
| 3 | Hand-driven Workflow | Shape skill copies, rewritten `flowboard-issue` and `ship` (Integrate), auto-merge into `develop` | Pedro takes one real Story from `backlog` to `integrated_tests` by hand, with Factory skills only |
| 4 | Orchestrated Build | Role agents, Specialist contract, Orchestrator + Run entry skill, Task splitter, Verify, 2-round stop, trail writes | one Story built by a Run, plus a deliberately failing Run that stops and flags itself |
| 5 | Review | Codex hookup, Review verdict on the Story, PR gate enforcing it | a Run's PR opens only after Codex passes it; a seeded bug fails it |
| 6 | Releases | Release entity + pick screen, release-promotion skill, `release/*` branches, rewritten `release-notes`, User testing stage | one Internal Release on Flowboard goes from `tested` to production |

**Run-tracking UI is a parallel Flowboard track**, not a phase at the end: the Story page fields and Subtask mini kanban follow phase 1, and the node graph, Review rounds and trail follow phase 4, once real Runs exist. The Active Runs overview comes with the latter.

**Exit gate per phase:** (a) its "Proven when" scenario has passed on Flowboard, (b) a check that legacy projects and the user-level skills still behave as before, (c) Pedro's sign-off. Each phase's detail is planned when it starts.

**PR gate before Review exists:** in phases 2–4 it enforces gates and conventions only, and the Review requirement is switched on in phase 5. That way the override never turns into a habit.

**User testing** isn't proven during the build: Hammer Loc is the only Client project, and it is mid feedback round. It is first proven when Hammer Loc adopts the Factory during Rollout, after that round ends.

**GitHub Pro** isn't part of the build order: everything is built in the interim hook-only mode on Free.

Passed on: Rollout (User testing proven on Hammer Loc's adoption; other projects adopt after phase 6), each phase's own planning.
