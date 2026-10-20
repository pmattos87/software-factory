# Software Factory — map

Label: wayfinder:map

## Destination

A **high-level spec** of the Factory — workflow stages, agent roster, hooks, Flowboard integration (incl. the Run-tracking UI), GitHub conventions, and the keep/merge/drop verdict on existing skills — ending in a **phased build order** where each phase is small enough to build and prove before the next. Detail for each phase is planned when that phase starts, not here.

## Notes

- **Domain language**: see [CONTEXT.md](../../CONTEXT.md) — Factory, Workflow, Run, Consumer project.
- **Reference, not template**: Hammer Loc's development workflow (diagram from 2026-10-20) is the first iteration to improve on; nothing in it is binding.
- **Settled while charting**:
  - The Factory is this repo, packaged as a Claude Code plugin that consumer projects install.
  - It serves all of Pedro's projects (Flowboard, Viagem Pronta, Fintracks, Atlas CRM, Hammer Loc); no pilot chosen yet.
  - The Run-tracking UI lives **inside Flowboard** (Pedro's own app), not as a separate app.
  - Client-facing stages (test build, release-notes deck, feedback round, production) are in scope as **optional** stages a project turns on.
  - Every Run is **manually triggered** by Pedro.
- **Brevity rules** (Pedro wants a high-level view, not an endless session):
  - Max ~10 decision tickets on this map.
  - Resolve each ticket at the level of *what & why*, never *exactly how*.
  - Anything finer goes to **Not yet specified** and is decided when its build phase starts.
- **Skills for every session**: `grilling` + `domain-modeling` (grilling tickets), `research` (research tickets).
- **Tracker**: local markdown (this folder). Flowboard has parent/child and labels but no native blocking — noted as an input for the Flowboard integration ticket.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->
- [Skills and agents inventory](issues/01-skills-and-agents-inventory.md): 24 user-level skills (13 off) + 1 vitest hook, no commands; projects hold only agents — one Flowboard-derived roster copied per repo with model/body drift, and CLAUDE.md branch rules (develop vs dev) conflict with `ship` and the deny lists.
- [Workflow stages](issues/02-workflow-stages.md): 7 Stages (Shape, Plan, Build, Integrate with auto-merge, In integrated tests, User testing for Client projects only, Production); Run = one Story split into Tasks; defects become bug Tasks that hold the Story in place; Releases are hand-picked.
- [Agent roster](issues/03-agent-roster.md): Factory ships 4 Role agents (Task splitter, Implementer, QA, Docs) and a Specialist contract; projects define Specialists. An Orchestrator drives Build: per-Task Verify by QA, Docs per Story, then a Codex Review of the whole Story before the PR opens; 2 failed rounds stop the Run.
- [Hooks](issues/04-hooks.md): a rule becomes a hook only if it can be checked mechanically and is costly to break; 3 blocking Factory hooks (secret scan, protected branches, a PR gate requiring passed Review + green gates, which replaces the merge approval), on in every session and not removable by projects; status moves, ADRs and the 2-round stop stay with agents.
- [Flowboard integration](issues/05-flowboard-integration.md): Story ladder named after Stages (`backlog → refining → ready → building → integrated_tests → tested → user_testing → done`, `canceled`), with the assignee (Pedro / Agent / client contact) set automatically by status; added alongside today's statuses behind a per-project legacy/Factory flag; waiting-on-bugs and stopped Run are flags; a Run = Story + event trail; first-class Story/Subtask fields and a new Release entity picked in Flowboard; all Factory writes go through a domain-level Flowboard CLI (+ thin MCP), not raw SQL.
- [GitHub conventions](issues/06-github-conventions.md): one Feature branch per Story cut from `main`, auto-merged into `develop` for testing (never merged into production); a Release is a `release/vX.Y.Z` branch of picked Feature branches, PR'd into `main` with Pedro's approval; merge commits, conventional commits, `<type>/<key>-<n>-<slug>` names; agent works as machine account `pmattos-pr-review-agent`; target is GitHub Pro rulesets, with hooks enforcing in the interim on Free.
- [Run-tracking UI](issues/07-run-tracking-ui.md): Stories get a dedicated page (fields and a Subtask mini kanban replacing the Task board, then a node graph of the Run, then Review rounds and trail) plus a cross-project Active Runs overview with a "Needs Pedro" filter; boards keep today's sprint rule (`ready` + sprint → Story board); the trail is new `activity_log` event kinds written via the Flowboard CLI; no alerts in v1.
- [Skills consolidation](issues/08-skills-consolidation.md): only Workflow-bound skills enter the Factory, under new job-named names (Shape skills copied; `ship`, `release`, `flowboard-issue`, `release-notes` rewritten), with the user-level originals kept but switched off in Consumer projects; second-brain and shared skills aren't Factory concerns; the disabled Matt Pocock set and `planning` are dropped.
- [PR checks](issues/10-pr-checks.md): one reusable Actions workflow runs gates + secret scan + conventions on every PR (build added for `release/*` and `main`, conventions/secret scan dropped for `main`), no slow tests; all checks required; minutes saved by standing rules; exhausted minutes stop auto-merge and flag "Needs Pedro".
- [Build order](issues/09-build-order.md): Flowboard is the pilot, and the Factory's build is tracked as a Software Factory board project. 7 phases, foundations first (Setup → Flowboard migration + CLI → hooks + Actions → hand-driven Workflow → Orchestrated Build → Codex Review → Releases), with the Run-tracking UI as a parallel Flowboard track. Each phase is proven on Flowboard and signed off by Pedro. The PR gate requires Review only from the Review phase on. User testing is first proven on Hammer Loc's adoption. No Pro upgrade in the build.

## Not yet specified

- **Rollout to existing projects**: how a consumer project already mid-flight (e.g. Hammer Loc in its feedback round) adopts the Factory without disruption, including which of its current agents become Specialists and which are dropped. Also renaming `dev` → `develop` (Flowboard, Atlas), giving Viagem Pronta an integration branch, and creating the `pmattos-pr-review-agent` account and adding it to each repo. On Flowboard: mapping each project's open items to the new ladder when it switches from legacy to Factory (e.g. Hammer Loc's 103 `in_review` Stories), turning the existing "Claude" person into Agent, setting client contacts, and whether sprints survive ([Flowboard integration](issues/05-flowboard-integration.md)). Rollout starts after the last build phase. User testing is first proven when Hammer Loc adopts, once its current feedback round ends ([Build order](issues/09-build-order.md)).
- **GitHub Pro upgrade**: when Pedro upgrades, the interim hook-only enforcement gives way to rulesets and native auto-merge, with the [PR checks](issues/10-pr-checks.md) as required checks ([GitHub conventions](issues/06-github-conventions.md)); decide then how the switch is rolled out. Running out of Actions minutes is the trigger to upgrade.
- **Per-project configuration**: how a project declares its stack-specific bits (Verify gate commands, build commands, opt-in slow tests and non-Linux builds for Actions, Specialists, tier overrides, protected branch names, board key for branch names, extra project hooks), what the visible override for shipping without Review looks like, and whether the per-project deny lists get unified; also how a project switches off the user-level originals of Factory skills (and `planning`). Internal vs Client project is set at creation (see Workflow stages).
- **Codex hookup**: how the Orchestrator hands a Story's diff to Codex and reads its verdict back. Codex config exists in `~/.codex`, but no `codex` CLI is on the shell PATH. Model/effort decided and a tested transport plus a proposed contract and fix loop are in [Codex Review handoff](research/codex-review-handoff.md).
- **Working documents**: whether PROGRESS / LESSONS / KNOWN-ISSUES / PLAN.md / ADRs survive as-is, merge, or move into Flowboard.
- **Factory versioning**: how plugin updates reach consumer projects and how breaking workflow changes are handled; also how the Factory's renamed copies of the Shape skills follow upstream changes.
- **Run-tracking extras**: alerts when a Run stops or a Story becomes Pedro's move; cumulative agent/model usage across Runs; whether legacy projects also get the Story page ([Run-tracking UI](issues/07-run-tracking-ui.md)).
- **Stage entry skills**: skills that don't exist yet: starting a Run (the Orchestrator's entry point), sending a Story to the Task splitter, maybe marking In integrated tests as passed.

## Out of scope

- **Autonomous Runs** (agents picking up work or running on a schedule without Pedro's trigger) — deferred to a later effort; this map assumes manual triggers.
- **Second-brain skill fixes** (e.g. `reconcile` skipping Hammer Loc and Atlas CRM): the vault's skills aren't Factory concerns ([Skills consolidation](issues/08-skills-consolidation.md)).
- **Implementation detail** of any component — belongs to each build phase's own planning.
