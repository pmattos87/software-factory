# Workflow

The skills and Role agents the Factory ships, how a Story goes from `backlog` to `integrated_tests`, and how a Release takes `tested` Stories to production. Why the Workflow has these Stages: [Workflow stages](spec/issues/02-workflow-stages.md). What is enforced mechanically: [Guardrails](guardrails.md).

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
| Build | `run` | | The Orchestrator: drives one Story's Run from `ready` through Verify, Docs and Review to Integrate, stopping for Pedro after 2 failed rounds |
| Review | `review` | | Has Codex review the whole Story diff, posts the findings as a Story comment, records the verdict on the reviewed commit, and sends blocking findings back as a bug Subtask |
| Plan → In integrated tests | `story-status` | `flowboard-issue` | Creates and moves Stories and Subtasks through the `flowboard` MCP |
| Integrate | `integrate` | `ship` | Commits on the Feature branch, opens the PR into the integration branch, merges it once green, moves the Story to `integrated_tests` |
| User testing, Production | `promote` | `release` | Cuts a picked Release's `release/vX.Y.Z` branch, tags betas for the client (Client projects), opens the PR into production, and after Pedro's merge tags, publishes the GitHub Release and marks the Release released |
| User testing | `release-notes` | `release-notes` | Turns a Release (or one beta) into a client-facing slide deck with screenshots from staging; Client projects only |

The Shape skills are verbatim copies of the originals, pinned to the Factory's version. `shape-map` carries its own tracker description ([TRACKER.md](../plugin/skills/shape-map/TRACKER.md)) in place of the dropped `setup-matt-pocock-skills`.

## Role agents

Shipped in [plugin/agents/](../plugin/agents/), invoked as `factory:<name>` by `split` and `run`. A project adds its own Specialists under the [Specialist contract](specialists.md).

| Agent | Stage | Job | Tier |
|---|---|---|---|
| [`task-splitter`](../plugin/agents/task-splitter.md) | Plan | Proposes a Story's Subtasks; never writes | opus |
| [`implementer`](../plugin/agents/implementer.md) | Build | Builds a Subtask with its tests when no Specialist fits | sonnet |
| [`qa`](../plugin/agents/qa.md) | Build, per Subtask | Verify: the Gates plus the definition of done; may strengthen tests, never production code | opus |
| [`simplify`](../plugin/agents/simplify.md) | Build, per Story | Simplifies the code the Story wrote, without changing behavior, before Docs and Review | sonnet |
| [`docs`](../plugin/agents/docs.md) | Build, per Story | Keeps the project's working documents true to the Story's diff | sonnet |

None of them touches the board, commits or pushes: each ends with a fixed result block, and the Orchestrator records the trail and commits. A project may change an agent's tier in `.claude/factory.json` with a stated reason ([Guardrails](guardrails.md#per-project-config)).

## The path of a Story

1. **Plan.** `factory:story-status` creates the Story in `backlog`. Pedro refines it (`refining`) until the description is the full brief. `factory:split` has the Task splitter propose the Subtasks and name any Story this one depends on that isn't in production yet; Pedro edits and approves, and the skill writes the Subtasks with a `## Plan` section in the brief and links the dependencies. A dependency is merged into this Story's branch and ships in the same Release. Then the Story moves to `ready` and into a sprint.
2. **Build.** Pedro starts the Run with `factory:run <KEY>`. The Orchestrator cuts the Feature branch from production, merges in the Feature branch of each Story it depends on that isn't in production yet, moves the Story to `building`, and for each Subtask in plan order: hands it to its builder, has QA Verify it, records both on the Run trail, and commits it once it passes. After the last Subtask, the Docs agent updates the docs in one more commit.
3. **Review.** `factory:review` has Codex read the whole Story diff against the brief and the [review standard](../plugin/review/standard.md) ([Review](#review)). Only a pass on the branch's head goes on.
4. **Integrate.** The Run ends with `factory:integrate`: the PR into the integration branch (the PR gate checks the Review, the Gates and the conventions first), the PR checks, a merge commit as `pmattos-pr-review-agent`, and the Story in `integrated_tests`.
5. **In integrated tests.** Pedro tests on the integration branch. When it passes, `story-status` moves the Story to `tested`. When it fails, a bug Subtask sends it back to `building`, and `factory:run` picks it up on the same Feature branch.
6. **Release.** Pedro picks `tested` Stories into a Release on Flowboard's Releases screen, and `factory:promote` takes it to production ([Releases](#releases)). The Story ends `done`.

### Review

Codex (`gpt-6-astra`, high effort) reviews each Story once, after Docs and before the PR, on the whole diff from production to the branch's head. It runs headless in a read-only sandbox through [codex-review.mjs](../plugin/scripts/codex-review.mjs), which finds `codex` through `FACTORY_CODEX`, then PATH, then the ChatGPT VS Code extension.

- **A round** posts Codex's findings as a comment on the Story and records the verdict on the commit it read (`review_record`). A pass covers that commit only: any later commit needs a new round, and the PR gate checks it.
- **A blocking finding** names its trigger, impact, location and evidence; anything less is a suggestion, and suggestions never fail a Review. They go to Pedro in the Run's report.
- **A failed round 1** becomes a bug Subtask, `Review round 1 findings`, built, Verified and committed like any Subtask; the builder answers every finding. Round 2 resumes the same Codex session to check those answers.
- **A failed round 2** stops the Run for Pedro, with the findings linked.
- **Codex unavailable** (missing, failing, timing out, or answering with no usable verdict) stops the Run with "Review waits". There is no Claude fallback.

### When a Run stops

A Subtask that fails Verify twice, a builder that is blocked on a decision, a Review that fails twice or can't run, or a failure at Integrate stops the Run (`run_stop`): the Story stays in `building`, flagged, with the reason on its trail, and the failed Subtask's changes stay uncommitted for Pedro to read. He resolves it (rewords the brief, splits the Subtask again, fixes the cause) and asks for the Run again with "restart". Rounds count again from 1 after a restart, never after a mere new session.

### By hand

The same Stages work without the Orchestrator: `story-status` moves the Story and each Subtask (`todo → in_progress → done`) as Pedro builds them and the Gates pass, and `factory:integrate` takes it from there. Integrate runs `factory:review` itself after committing, and stops on anything but a pass: the fixes are Pedro's, and the next Review is round 2.

## Releases

A Release is a version and the `tested` Stories Pedro picks into it, on Flowboard's Releases screen. The screen suggests the version (the last released one, bumped by the picked branches' types) and warns when a pick depends on a Story outside the Release. The pick is the source of truth: `factory:promote` reads it, and running it again brings the branch back in line after the pick changes.

On an Internal project:

1. **Cut.** `promote` merges each pick's Feature branch onto production locally, proposes the version from the commits since the last release tag (breaking → major, `feat` → minor, anything else → patch) for Pedro to confirm, names the branch `release/vX.Y.Z`, bumps every file in `release.versionFiles` (and `Cargo.lock`) in a `chore(release): vX.Y.Z` commit, and pushes. No PR targets a Release branch: Feature branches reach it only through these merges.
2. **Changed pick.** An added pick, or new commits on one, are merged in. A removed pick re-cuts the branch from production, after Pedro's go-ahead.
3. **PR into production**, as the machine account, titled `Release vX.Y.Z`, with notes grouped by type. Its PR checks include the build. **Pedro merges it**: that merge is the Promote gate, and the merge-guard hook refuses anyone else's.
4. **Finish**, when `promote` runs again after the merge: tag `vX.Y.Z` on the merge commit, build `release.assets` from the tag, publish the GitHub Release with them, move the Release to `released` (its Stories go to `done` with it), and delete the Release's Feature branches and its Release branch.

On a Client project, **User testing** comes between 2 and 3:

- After the cut, `promote` tags `vX.Y.Z-beta.1` on the Release branch, publishes it as a GitHub pre-release with its assets, and moves the Release to `user_testing`: its Stories go to the primary client contact. `factory:release-notes` turns it into a deck for the client.
- **A bug the client finds** becomes a bug Subtask, which sends the Story back to `building`. It's fixed on the Story's Feature branch, integrated and passed by Pedro (`tested`) as any fix. Then `promote` merges it into the Release branch, tags the next beta and returns the Story to `user_testing`. Once a beta exists, a removed pick is reverted, never re-cut.
- When Pedro says the client approved the last beta, `promote` opens the PR into production, and goes on from step 3. The approved beta is what ships: the branch isn't synced once that PR is open.

The release settings (`release.versionFiles`, `release.assets`, and `release.notes` on Client projects) are in [Guardrails](guardrails.md#per-project-config).

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
     "wayfinder": "off", "research": "off", "prototype": "off", "planning": "off",
     "release": "off", "release-notes": "off"
   }
   ```

3. Its board switched to the Factory ladder. Open items are mapped first, because `flowboard-cli project set <KEY> --ladder factory` refuses while any open item isn't a top-level `story` in a Story status, or a `task`/`bug` under a story in a Subtask status.
4. Its `CLAUDE.md` declares the board and points at `story-status`, `integrate` and `promote`.
5. A `release` key in `.claude/factory.json` once it ships Releases: `check-release.mjs` (with `--client` on a Client project) checks it.
6. Codex reachable on the machine (the ChatGPT VS Code extension, `codex` on PATH, or `FACTORY_CODEX`), signed in, and Flowboard installed, since the PR gate reads each Story's Review through `flowboard-cli`.

Outside Consumer projects, the user-level originals keep working unchanged.

## Updating the plugin

A directory-sourced install is cached by version, so a change reaches a project only after bumping `version` in [plugin.json](../plugin/.claude-plugin/plugin.json) and running `claude plugin update factory@software-factory --scope local` in that project, followed by a session restart.
