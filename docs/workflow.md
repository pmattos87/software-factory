# Workflow

The skills and Role agents the Factory ships, and how a Story goes from `backlog` to `integrated_tests`. Why the Workflow has these Stages: [Workflow stages](spec/issues/02-workflow-stages.md). What is enforced mechanically: [Guardrails](guardrails.md).

## Skills

Every skill is invoked as `factory:<name>`. Most replace a user-level skill, which a Consumer project switches off (see [Adopting](#adopting)).

| Stage | Skill | Replaces | Does |
|---|---|---|---|
| Shape | `shape-grill` | `grilling` | Grills a plan or idea one round of questions at a time |
| Shape | `shape-domain` | `domain-modeling` | Sharpens the domain language in `CONTEXT.md`; records ADRs |
| Shape | `shape-map` | `wayfinder` | Charts a large effort as a map of decision tickets in local markdown; only by `/factory:shape-map` |
| Shape | `shape-research` | `research` | Researches a question against primary sources into a Markdown file |
| Shape | `shape-prototype` | `prototype` | Builds a throwaway prototype to answer a design question |
| Plan | `split` | | Has the Task splitter propose a Story's Subtasks, each with its builder, estimate, risk and definition of done; writes them and the Story's `## Plan` once Pedro approves |
| Build | `run` | | The Orchestrator: drives one Story's Run from `ready` through Verify and Docs to Integrate, stopping for Pedro after 2 failed rounds |
| Plan → In integrated tests | `story-status` | `flowboard-issue` | Creates and moves Stories and Subtasks through the `flowboard` MCP |
| Integrate | `integrate` | `ship` | Commits on the Feature branch, opens the PR into the integration branch, merges it once green, moves the Story to `integrated_tests` |

The Shape skills are verbatim copies of the originals, pinned to the Factory's version. `shape-map` carries its own tracker description ([TRACKER.md](../plugin/skills/shape-map/TRACKER.md)) in place of the dropped `setup-matt-pocock-skills`.

## Role agents

Shipped in [plugin/agents/](../plugin/agents/), invoked as `factory:<name>` by `split` and `run`. A project adds its own Specialists under the [Specialist contract](specialists.md).

| Agent | Stage | Job | Tier |
|---|---|---|---|
| [`task-splitter`](../plugin/agents/task-splitter.md) | Plan | Proposes a Story's Subtasks; never writes | opus |
| [`implementer`](../plugin/agents/implementer.md) | Build | Builds a Subtask with its tests when no Specialist fits | sonnet |
| [`qa`](../plugin/agents/qa.md) | Build, per Subtask | Verify: the Gates plus the definition of done; may strengthen tests, never production code | opus |
| [`docs`](../plugin/agents/docs.md) | Build, per Story | Keeps the project's working documents true to the Story's diff | sonnet |

None of them touches the board, commits or pushes: each ends with a fixed result block, and the Orchestrator records the trail and commits. A project may change an agent's tier in `.claude/factory.json` with a stated reason ([Guardrails](guardrails.md#per-project-config)).

## The path of a Story

1. **Plan.** `factory:story-status` creates the Story in `backlog`. Pedro refines it (`refining`) until the description is the full brief. `factory:split` has the Task splitter propose the Subtasks; Pedro edits and approves, and the skill writes them with a `## Plan` section in the brief. Then the Story moves to `ready` and into a sprint.
2. **Build.** Pedro starts the Run with `factory:run <KEY>`. The Orchestrator cuts the Feature branch, moves the Story to `building`, and for each Subtask in plan order: hands it to its builder, has QA Verify it, records both on the Run trail, and commits it once it passes. After the last Subtask, the Docs agent updates the docs in one more commit.
3. **Integrate.** The Run ends with `factory:integrate`: the PR into the integration branch (the PR gate runs the Gates and conventions first), the PR checks, a merge commit as `pmattos-pr-review-agent`, and the Story in `integrated_tests`.
4. **In integrated tests.** Pedro tests on the integration branch. When it passes, `story-status` moves the Story to `tested`. When it fails, a bug Subtask sends it back to `building`, and `factory:run` picks it up on the same Feature branch.

Review (phase 5) will slot in between Docs and Integrate.

### When a Run stops

A Subtask that fails Verify twice, a builder that is blocked on a decision, or a failure at Integrate stops the Run (`run_stop`): the Story stays in `building`, flagged, with the reason on its trail, and the failed Subtask's changes stay uncommitted for Pedro to read. He resolves it (rewords the brief, splits the Subtask again, fixes the cause) and asks for the Run again with "restart". Rounds count again from 1 after a restart, never after a mere new session.

### By hand

The same Stages work without the Orchestrator: `story-status` moves the Story and each Subtask (`todo → in_progress → done`) as Pedro builds them and the Gates pass, and `factory:integrate` takes it from there.

## Merging into the integration branch

Two layers, so the flow is the same on public and private repos:

- **The merge-guard hook** blocks `gh pr merge` into production, without `--merge`, with `--squash`/`--rebase`/`--delete-branch`, or with `--admin`.
- **A GitHub ruleset** on the integration branch, where the plan allows it (public repos on Free; every repo once on Pro), requires the PR checks, allows merge commits only, and blocks deletion and force-pushes. Pedro's admin role can bypass it on PR merges, and GitHub logs every bypass.

Flowboard's ruleset is `Develop - Factory integration`.

## Adopting

A Consumer project adopts the Workflow skills with:

1. The `factory` plugin enabled (`"enabledPlugins": { "factory@software-factory": true }`) and `.claude/factory.json` in place ([Guardrails](guardrails.md#per-project-config)).
2. The user-level originals switched off in its `.claude/settings.json`. `skillOverrides` hides them from Claude, and plugin skills aren't affected:

   ```json
   "skillOverrides": {
     "ship": "off", "flowboard-issue": "off", "grilling": "off", "domain-modeling": "off",
     "wayfinder": "off", "research": "off", "prototype": "off", "planning": "off"
   }
   ```

3. Its board switched to the Factory ladder. Open items are mapped first, because `flowboard-cli project set <KEY> --ladder factory` refuses while any open item isn't a top-level `story` in a Story status, or a `task`/`bug` under a story in a Subtask status.
4. Its `CLAUDE.md` declares the board and points at `story-status` and `integrate`.

Outside Consumer projects, the user-level originals keep working unchanged.

## Updating the plugin

A directory-sourced install is cached by version, so a change reaches a project only after bumping `version` in [plugin.json](../plugin/.claude-plugin/plugin.json) and running `claude plugin update factory@software-factory --scope local` in that project, followed by a session restart.
