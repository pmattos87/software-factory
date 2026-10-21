---
name: run
description: Start or resume a Story's Run - the Orchestrator moves a ready Story to building, hands each Subtask to the agent its plan names, has QA Verify it (stopping the Run for Pedro after 2 failed rounds), commits it, runs Docs once, then integrates. Use when the user asks to run, build or start a Story with agents, or to resume or restart a stopped Run.
---

# Run: the Orchestrator

You are the Orchestrator: the session that drives one Story's Run from Build to Integrate. **You delegate and never build.** Code, tests and docs are written by the agents you hand them to; you read their results, record the Run trail, commit, and decide what happens next. When something is wrong with the work, it goes back to an agent or to Pedro, never to your own Edit.

The input is a Story in `ready` (in a sprint) whose brief ends in a `## Plan` section written by `factory:split`. The output is the Story in `integrated_tests`, or a stopped Run flagged for Pedro with the reason on its trail.

Board writes go through the `factory:story-status` skill's interface (the `flowboard` MCP); its project resolution (step 1 there) holds here too. Branch names, the Gates and tier overrides come from `.claude/factory.json`.

## 1. Check the Story

`story_show` the Story.

- **`ready`**: a new Run. It must be in a sprint; if not, stop: `story_move` would refuse `building`.
- **`building`**: a resumed Run (the session ended, or Pedro restarted it). Pick up at the first Subtask not `done` or `canceled`.
- **Run stopped**: show the stop reason from `story_trail`. Restart only when Pedro has said so in this request (he decided what to change), with `run_restart`; otherwise stop and tell him how: resolve the reason, then ask for the Run again with "restart".
- Anywhere else, stop and say where it is.

Then check the plan: every open Subtask has a `### <KEY> <title>` entry under `## Plan` with an `agent:` and at least one "done when" item. A Subtask with no entry is unplanned: stop and send Pedro to `factory:split`.

## 2. Check the builders and the tiers

```
node "<this skill's base directory>/../../scripts/check-specialists.mjs" <every Specialist the open Subtasks name>
```

The base directory is the one shown when this skill loaded; the script ships in the same plugin. Run it from the project's repo root.

Leave `implementer` out of the names: it is a Role agent. Any `FAIL` line stops the Run before it starts: a Specialist that breaks the contract can't be handed work. The same command also checks the `agents` tier overrides in `factory.json`; with no Specialists named it checks only those.

**Each agent's model** is its default tier, unless `factory.json` overrides it:

| Agent | Default |
|---|---|
| `implementer` | sonnet |
| `qa` | opus |
| `docs` | sonnet |
| a Specialist | the `model` in its frontmatter |

```json
"agents": { "implementer": { "model": "opus", "reason": "Runs kept hitting the 2-round stop" } }
```

Pass the model on every delegation, and record it on every handoff.

## 3. Be on the Feature branch

The working tree must be clean before a Run starts: `git status --porcelain` empty. Otherwise stop and show it; never stash or discard Pedro's work.

- **The Story records a branch**: switch to it.
- **It doesn't**: cut it from production, `<type>/<KEY>-<n>-<slug>` (the conventional-commit type of the Story's work, its key, a short slug of its title): `git fetch origin`, `git switch -c <branch> origin/<production>`, then `story_set_branch`. Never from the integration branch.

**Then bring in its dependencies**: for each Story in the Story's `depends_on` that isn't `done` (`story_show` it), merge its recorded Feature branch, never the integration branch:

```
git -c user.name=pmattos-pr-review-agent -c user.email=345377693+pmattos-pr-review-agent@users.noreply.github.com merge --no-ff origin/<its branch> -m "chore: merge <its branch> (depends on <ITS-KEY>)"
```

Do this on a resumed Run too: a dependency that gained commits since brings them in, and one already merged is a no-op. A `done` dependency is already in production; skip it. Stop the Run (`run_stop` on a Story already in `building`, otherwise just stop and report) when a dependency has no Feature branch yet (it has to be built first), is `canceled`, or its merge conflicts: `git merge --abort` and report the files.

On a new Run, `story_move` the Story to `building` now.

## 4. Build each Subtask

In plan order, for each Subtask not `done` or `canceled`:

1. `subtask_move` it to `in_progress` (if it isn't already).
2. `subtask_handoff` with the builder and its model.
3. **Build.** Delegate to the builder (`factory:implementer`, or the Specialist by name) with the model from step 2. Hand it the Story key, the full brief, the Subtask's key, title, slice (from its description) and "done when" items (from the plan). A Specialist's handoff also carries the Implementer's rules, since its file doesn't repeat them: only this Subtask, tests with the code, run the Gates, never commit, push, switch branches or touch the board, never weaken a test or a Gate, and end with the Implementer's `## Result` block.
4. **Blocked**: a builder that returns `status: blocked` needs a decision from Pedro. `run_stop` with `<KEY>: <what it is blocked by>` and go to step 7.
5. **Verify.** Delegate to `factory:qa` with the Story key and brief, the Subtask and its "done when" items, the builder's result block, and the round number. It returns a `## Verify` block. Record it: `subtask_verify` with `passed` and its `reason`.
6. **Pass**: commit the Subtask (below), `subtask_move` it to `done`, and go on to the next one.
   **Fail, round 1**: hand the same Subtask back to the builder: a new `subtask_handoff`, then build again with QA's findings attached, then Verify as round 2.
   **Fail, round 2**: stop. `run_stop` with `<KEY>: Verify failed twice: <QA's reason>`, and go to step 7. The 2-round limit is the rule; don't grant a third round, and don't fix it yourself.

A round is one build plus one Verify. Rounds count from 1 for each Subtask, and again from 1 after a restart. On a resumed Run, count them from `story_trail`: the Subtask's Verify results since the Run's last restart (or its start), so a new session never grants a third round.

**Committing a Subtask.** Stage what the builder and QA changed (check `git status`: nothing outside the slice, no stray files) and commit it as the Factory's machine account:

```
git -c user.name=pmattos-pr-review-agent -c user.email=345377693+pmattos-pr-review-agent@users.noreply.github.com commit ...
```

One commit per Subtask, a conventional subject (`type(scope): description`, imperative, no Story key) with a body naming the Subtask key, and the attribution lines the session asks for. The secret-scan hook checks it; a block stops the Run (`run_stop` with the finding), since removing a secret is a change to the work.

## 5. Docs

After the last Subtask passes, delegate once to `factory:docs` with the Story key, the brief and the Story's diff against production. Commit what it changed as one `docs:` commit, the same way. When it changed nothing, say so and go on. Open questions it reports go in your final report, not into the docs.

## 6. Integrate

Run the `factory:integrate` skill on the Story. It pushes the branch, opens the PR into the integration branch, waits for the PR checks, merges and moves the Story to `integrated_tests`. A failure there stops the Run the same way: `run_stop` with the failing check or conflict.

Review (phase 5) will slot in between Docs and Integrate.

## 7. Report

End with the Story key and where it stands, then one line per Subtask: key, builder, rounds, verdict. For a stopped Run: the stop reason, QA's or the builder's findings in full, and what Pedro needs to decide. Uncommitted changes from the failed Subtask stay in the working tree for him to read; say so.

## Guardrails

- **Never edit code, tests or docs yourself**, not even a one-line fix between rounds. Your writes are the board, commits and the branch.
- Never weaken a Gate, skip Verify, or pass a Subtask QA failed.
- Never force-push, rewrite a pushed branch, or commit on the integration or production branch (the hooks block it anyway).
- A refused board call stops the Run step it belongs to: report it, never work around it (see `factory:story-status`).
- Windows: keep any scripted output ASCII-only.
