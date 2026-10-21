# Workflow

The skills the Factory ships, and how a Story goes from `backlog` to `integrated_tests` by hand. Why the Workflow has these Stages: [Workflow stages](spec/issues/02-workflow-stages.md). What is enforced mechanically: [Guardrails](guardrails.md).

## Skills

Every skill is invoked as `factory:<name>`. Each one replaces a user-level skill, which a Consumer project switches off (see [Adopting](#adopting)).

| Stage | Skill | Replaces | Does |
|---|---|---|---|
| Shape | `shape-grill` | `grilling` | Grills a plan or idea one round of questions at a time |
| Shape | `shape-domain` | `domain-modeling` | Sharpens the domain language in `CONTEXT.md`; records ADRs |
| Shape | `shape-map` | `wayfinder` | Charts a large effort as a map of decision tickets in local markdown; only by `/factory:shape-map` |
| Shape | `shape-research` | `research` | Researches a question against primary sources into a Markdown file |
| Shape | `shape-prototype` | `prototype` | Builds a throwaway prototype to answer a design question |
| Plan → In integrated tests | `story-status` | `flowboard-issue` | Creates and moves Stories and Subtasks through the `flowboard` MCP |
| Integrate | `integrate` | `ship` | Commits on the Feature branch, opens the PR into the integration branch, merges it once green, moves the Story to `integrated_tests` |

The Shape skills are verbatim copies of the originals, pinned to the Factory's version. `shape-map` carries its own tracker description ([TRACKER.md](../plugin/skills/shape-map/TRACKER.md)) in place of the dropped `setup-matt-pocock-skills`.

## The hand-driven path

Until the Orchestrator exists (phase 4), Pedro drives a Story through the Stages himself:

1. **Plan.** `factory:story-status` creates the Story in `backlog`. Pedro refines it (`refining`): the description becomes the full brief, and its Subtasks are created. Then it moves to `ready` and into a sprint.
2. **Build.** `story-status` moves the Story to `building` and each Subtask through `todo → in_progress → done` as it is built and passes the Gates.
3. **Integrate.** `factory:integrate` puts the work on the Story's Feature branch (cut from production, recorded on the Story) and commits it as `pmattos-pr-review-agent`. It opens the PR into the integration branch (the PR gate runs the Gates and conventions first) and waits for the PR checks. Once they're green it merges with a merge commit as the bot, then moves the Story to `integrated_tests`.
4. **In integrated tests.** Pedro tests on the integration branch. When it passes, `story-status` moves the Story to `tested`. When it fails, a bug Subtask sends it back to `building`, and steps 2–3 repeat on the same Feature branch.

Review (phase 5) will slot in between steps 2 and 3.

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
