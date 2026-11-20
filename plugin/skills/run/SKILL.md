---
name: run
description: Start or resume a Story's Run - the Orchestrator moves a ready Story to building, hands each Subtask to the agent its plan names, has QA Verify it with the scoped Gates (stopping the Run for Pedro after 2 failed rounds), commits it, has the code simplified once, runs the full Gates once, runs Docs once, has Codex Review the whole Story, then integrates. Use when the user asks to run, build or start a Story with agents, or to resume or restart a stopped Run.
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

Then check the plan: every open Subtask has a `### <KEY> <title>` entry under `## Plan` with an `agent:` and at least one "done when" item. A Subtask with no entry is unplanned: stop and send Pedro to `factory:split`. The one exception is a `Simplify` or `Full Gates failures` Subtask whose entry is missing (the session ended between filing it and writing its entry): append the entry as in step 5 or step 6 and go on.

## 2. Check the builders and the tiers

```
node "<this skill's base directory>/../../scripts/check-specialists.mjs" --run <every Specialist the open Subtasks name>
```

The base directory is the one shown when this skill loaded; the script ships in the same plugin. Run it from the project's repo root.

Leave `implementer` and `simplify` out of the names: they are Role agents. Any `FAIL` line stops the Run before it starts: a Specialist that breaks the contract can't be handed work. The same command also checks the `agents` tier overrides in `factory.json`; with no Specialists named (every Subtask goes to `implementer`) it checks only those. Never drop `--run`: without it the script checks every agent in the project, and a Specialist this Run doesn't use would stop it.

**Each agent's model** is its default tier, unless `factory.json` overrides it:

| Agent | Default |
|---|---|
| `implementer` | sonnet |
| `qa` | opus |
| `docs` | sonnet |
| `simplify` | sonnet |
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

**Then prepare the tree**, on a new or resumed Run and in every worktree, from the working directory you build in:

```
node "<this skill's base directory>/../../scripts/prepare-tree.mjs"
```

It runs `npm ci` when `node_modules` is missing or older than `package-lock.json`, and checks that `.claude/factory.json` exists on the branch. Exit 2 (no `factory.json` on the branch: it names the fix) or exit 1 (`npm ci` failed) stops the Run before anything is built: stop and report it (`run_stop` on a Story already in `building`). It prints `root: <path>`: run every Gate command, `run-gates.mjs` and `check-plan.mjs` from that root as printed, never from a hand-typed path (a lowercase drive letter once made vitest load no tests).

On a new Run, `story_move` the Story to `building` now.

## 4. Build each Subtask

In plan order, for each Subtask not `done` or `canceled` except the `Simplify` Subtask, which step 5 builds, and a `Full Gates failures` Subtask, which step 6 builds:

1. **Write the builder's request** (see *Handoffs are files*, below): `<subtask-key>-builder-<round>.md` with the full brief, the Subtask's key, title, slice (from its description) and "done when" items (from the plan), the check-plan command, `node "<this skill's base directory>/../../scripts/check-plan.mjs"` (run from the repo root, it prints the commands QA's scoped Verify would run for the builder's changes), and on a retry QA's findings. A Specialist's request also carries the Implementer's rules, since its file doesn't repeat them: see item 3.
2. `subtask_handoff` with the builder and its model. The handoff starts the Subtask (`todo → in_progress`) on the board, and a retry's handoff finds it already started: never `subtask_move` it to `in_progress` first.
3. **Build.** Delegate to the builder (`factory:implementer`, or the Specialist by name) with the model from step 2, naming the request file and the Story and Subtask keys and the round. For a Specialist, whose file doesn't repeat the Implementer's rules, the request also lists them: only this Subtask, tests with the code, run the check plan (each `related` and `full` line, never a whole suite the plan doesn't print as `full`, and no other Gate, which QA runs), write each check's full output and exit code to `$(git rev-parse --git-path factory/logs/<KEY>)/<subtask-key>-<specialist-name>-<round>.log` before filtering it, never commit, push, switch branches or touch the board, never weaken a test or a Gate, and end with the Implementer's `## Result` block.
4. **Blocked**: a builder that returns `status: blocked` needs a decision from Pedro. `run_stop` with `<KEY>: <what it is blocked by>` and go to step 10.
5. **Verify.** First `verify_start` with the Subtask's key: it logs the round's start on the trail, and the Run graph lights Verify from it. Call it once per round, round 2 included. A refusal (the Subtask isn't `in_progress`, the Story isn't building, or its Run is stopped) stops the step, as any refused board call does. Then write QA's request, `<subtask-key>-qa-<round>.md`: the Story key and brief, the Subtask and its "done when" items, the builder's result block, the round number, and the command that runs the Gates scoped to the Subtask's change: `node "<this skill's base directory>/../../scripts/run-gates.mjs" --scoped "$(git rev-parse --git-path factory/logs/<KEY>)/<subtask-key>-qa-<round>.log"`. Scoped, it runs the type check and any Gate with no scope in full, the tests related to the changed files where a Gate has a `related` form, and skips a Gate whose `paths` saw no change. The full Gates run once, in step 6. Delegate to `factory:qa` naming that file; it returns a `## Verify` block.
6. **Fail**: record it at once, `subtask_verify` with `passed: false` and its `reason`. **Pass**: commit the Subtask (below) first, then record `subtask_verify` with `passed` and its `reason`: that finishes the Subtask (`in_progress → done`), so never `subtask_move` it to `done`, and a Subtask is never `done` with its work uncommitted. Go on to the next one.
   **Fail, round 1**: hand the same Subtask back to the builder: a new request file with QA's findings, a new `subtask_handoff`, then build again, then Verify as round 2.
   **Fail, round 2**: stop. `run_stop` with `<KEY>: Verify failed twice: <QA's reason>`, and go to step 10. The 2-round limit is the rule; don't grant a third round, and don't fix it yourself.

**Handoffs are files, not prompt text.** Every request to an agent (builder, QA, Simplify, Docs) is a file under `$(git rev-parse --git-path factory/runs/<KEY>)/` (create the directory first; it lives in the git directory, so it is never committed), and the prompt names its path, the keys and the round, and nothing else of it. Never paste a brief, a diff or a log into a prompt. The agents read the request, run `git diff` themselves for the diff, and return their bounded result block with the paths of any log or artifact; a full log, a passing run's output and a failure's whole report stay on disk (in `factory/logs/<KEY>/`), and you read only the part you need. A retry writes a new file for the round, never overwrites the last.

**An environment failure is not a round.** When `run-gates.mjs` exits 3, QA returns `verdict: environment` with the signature and its fix (`reason` names it): a Gate failed for the machine's sake, not the code's. Don't record `subtask_verify` and don't call the builder. Apply the fix the signature names (`npm ci`; for a locked build artifact, ask Pedro to close the app that holds it and wait), then run the same round's Verify again, `verify_start` included (the same round number: the earlier start has no result, which is not a round). A second environment failure in the same round stops the Run: `run_stop` with `<KEY>: Environment failure: <signature>`, and go to step 10. Round counts after a restart start over as for any stop.

**A flaky test** is a Gate's failing test that passed on its rerun: `run-gates.mjs` passes that Gate marked `flaky` and QA lists the tests in `flaky:`. Keep every such test name for the report (step 10); a flaky pass records no evidence, so the PR gate runs that Gate itself.

A round is one build plus one Verify. Rounds count from 1 for each Subtask, and again from 1 after a restart. On a resumed Run, count them from `story_trail`: the Subtask's Verify results since the Run's last restart (or its start), so a new session never grants a third round. A Verify start with no result after it (a session that ended during QA) is not a round: call `verify_start` again for the same round.

**Committing a Subtask.** Stage what the builder and QA changed (check `git status`: nothing outside the slice, no stray files) and commit it as the Factory's machine account:

```
git -c user.name=pmattos-pr-review-agent -c user.email=345377693+pmattos-pr-review-agent@users.noreply.github.com commit ...
```

One commit per Subtask, a conventional subject (`type(scope): description`, imperative, no Story key, following any prefix rules in the project's `CLAUDE.md`) with a body naming the Subtask key, and the attribution lines the session asks for. The secret-scan hook checks it; a block stops the Run (`run_stop` with the finding), since removing a secret is a change to the work.

## 5. Simplify

After the last Subtask passes, the code the Story wrote gets one cleanup pass, before Docs and Review, so Codex reviews the simplified code. It is a Subtask like any other, built by the `simplify` Role agent:

1. **File it**, unless the Story already has a Subtask titled `Simplify` (a resumed Run): `subtask_create` with title `Simplify`, `story_points` 0 (it isn't part of the refined estimate), no risk, and the description `agent: simplify`. Then `story_edit` the Story's brief with its entry appended to `## Plan` (send the whole brief):

   ```
   ### <KEY> Simplify
   - agent: simplify
   - done when:
     - The Gates pass.
     - No behavior changed: same inputs, outputs, errors and side effects.
     - No test was weakened or edited to fit the simplified code.
     - Only code this Story added or changed was touched.
     - Out-of-scope findings are listed in the result's noticed line, not fixed.
   ```
2. **Hand it off and build it** as in step 4, items 1 to 4. Its request file (`<subtask-key>-simplify-<round>.md`) carries the brief, the Subtask's definition of done and the check-plan command, as in step 4; the agent reads the Story's diff against production itself (`git diff <production>...HEAD`). Record `git rev-parse HEAD` just before the handoff: every Subtask before it has passed Verify, so that commit is verified.
3. **Check for no change, before any Verify.** When Simplify hands back, run, from the repo root:

   ```
   node "<this skill's base directory>/../../scripts/check-noop.mjs" <the sha you recorded>
   ```

   - **Exit 0**: the tree is clean (no tracked or untracked change) and HEAD is still that sha. Skip QA, and with it `verify_start`: `subtask_verify` with `passed` and the line it printed as the reason (`No change: tree clean, HEAD <sha> already verified`), which finishes it (nothing to commit, so no `subtask_move`), and say so in the report.
   - **Exit 1 or 2**: Verify it as in step 4, items 5 and 6, with its own 2 rounds, whatever Simplify's result says, but with the **full Gates** instead of the scoped ones: QA gets the command with no `--scoped` and the log `<subtask-key>-qa-<round>.log`, and is told this is Simplify's Verify with the full Gates, so it reports any failure outside Simplify's own diff under `outside diff`. Simplify's Verify is then step 6's run (see there). The trail is the same as for any Subtask: `verify_start`, then `subtask_verify` per round. A retry goes back to item 3 of step 4 and then to this check again.
   - **A failure outside Simplify's diff** (QA lists it under `outside diff`: a Gate that fails on files Simplify didn't touch, which its changes can't have caused) doesn't fail Simplify and doesn't spend one of its rounds. When nothing else fails, QA's verdict is `pass`: record it and commit the Subtask as in step 4, item 6, then handle the failures as step 6's exit 1 describes. Failures inside the diff fail the round as usual.

A `done` Simplify Subtask is never filed or built again; go on to step 6.

## 6. Full Gates

Each Subtask's Verify ran only the Gates its change touched. Before Docs and Review, every Gate runs in full once, on the Story's whole tree.

**When Simplify changed code, its Verify already did this** (step 5: full Gates, no `--scoped`), and its passing verdict is this step's pass: go straight to Docs, with no second run. Its evidence is what the PR gate reuses. A failure outside Simplify's diff in that Verify is this step's exit 1 below, with that Verify's log as the log. On a resumed Run, where you can't tell from this session that Simplify's Verify ran the full Gates, and when Simplify changed nothing, run them here, from the repo root:

```
node "<this skill's base directory>/../../scripts/run-gates.mjs" "$(git rev-parse --git-path factory/logs/<KEY>)/<KEY>-full-<round>.log"
```

No `--scoped`. `<round>` is 1, or the next number free in that directory when a resumed Run runs it again.

- **Exit 0**: go on to Docs. This run recorded the evidence the PR gate reuses: a Docs commit changes only doc-only paths, so the tree key still matches and the PR gate skips what passed here.
- **Exit 1**: a Gate failed, on code every Subtask's scoped Verify passed. File it as a bug, the way Review does: `subtask_create` with `bug: true`, title `Full Gates failures`, no risk, the description `agent: <the agent that built the code the failures point at; implementer when they span several>`, then `story_edit` the brief with its entry appended to `## Plan` (send the whole brief):

  ```
  ### <KEY> Full Gates failures
  - agent: <the builder>
  - done when:
    - The full Gates pass (`run-gates.mjs` without `--scoped`).
    - Each failure in <the log file> is fixed in the code, not by weakening a test or a Gate.
  ```

  Build it as in step 4, items 1 to 4, with the failing Gates and the log's path in the builder's request file. Verify it as in step 4, items 5 and 6, except that QA gets the full command: the one above with no `--scoped` and the log `<subtask-key>-qa-<round>.log`. A pass commits it, then records the passing `subtask_verify`, which finishes it; a pass of the full Gates in that Verify is this step's pass, so go on to Docs. A second failed Verify stops the Run: `run_stop` with `<KEY>: Full Gates failed twice: <QA's reason>`, and go to step 10.
- **Exit 3**: a Gate failed for an environment reason (it names the signature and the fix, and records no evidence). It isn't a failure of the code: apply the fix and run the full Gates again; this costs no `Full Gates failures` Subtask. A second exit 3 in a row stops the Run: `run_stop` with `<KEY>: Environment failure: <signature>`, and go to step 10.
- **Exit 2**: no config to run; stop and report it.

On a resumed Run, an open `Full Gates failures` Subtask is built from where it stands, as above. With a `done` one, run the full Gates again: a pass goes on to Docs, a failure stops the Run (the 2-round rule already holds for that Subtask's fixes).

## 7. Docs

After the full Gates pass, delegate once to `factory:docs` with a request file (`<KEY>-docs.md`: the Story key and brief), naming it; the agent reads the Story's diff against production itself. Commit what it changed as one commit, the same way, with the prefix the project's `CLAUDE.md` gives for docs changes (`docs:` when it says nothing). When it changed nothing, say so and go on. Open questions it reports go in your final report, not into the docs.

## 8. Review

Run the `factory:review` skill on the Story. Codex reviews the whole Story diff; blocking findings come back as a bug Subtask, which you build, Verify and commit as in step 4, then Codex reviews again. That fix's Verify is scoped like any Subtask's; the PR gate runs every Gate the fix left without evidence. It stops the Run itself after 2 failed rounds or when Codex is unavailable: then go to step 10. Go on only with a passed Review on the current head.

## 9. Integrate

Run the `factory:integrate` skill on the Story. It pushes the branch, opens the PR into the integration branch, waits for the PR checks, merges and moves the Story to `integrated_tests`. A failure there stops the Run the same way: `run_stop` with the failing check or a conflict it couldn't resolve. Integrate commits nothing new on the Feature branch in a Run, so the Review from step 8 still covers its head; a conflict it resolves goes on a resolution branch, which that Review covers too.

## 10. Report

End with the Story key and where it stands (in `integrated_tests`, Pedro's test is on the integration branch, with `environments.integration` on a Client project, as `factory:integrate` says), then one line per Subtask: key, builder, rounds, verdict, then one line per Review round: verdict and comment link, and Codex's suggestions for Pedro to file or drop. **Flaky tests**: when any test failed and then passed on rerun, list each name in the report and post them as one `story_comment` on the Story, for Pedro to file as bugs. For a stopped Run: the stop reason, QA's or the builder's findings in full, and what Pedro needs to decide. Uncommitted changes from the failed Subtask stay in the working tree for him to read; say so.

## Guardrails

- **Never edit code, tests or docs yourself**, not even a one-line fix between rounds. Your writes are the board, commits and the branch.
- Never weaken a Gate, skip Verify or Review, or pass a Subtask QA failed. The one exception is a Simplify pass that `check-noop.mjs` reports as no change (step 5.3): it leaves the verified commit as it was, so there is nothing new to Verify.
- Never force-push, rewrite a pushed branch, or commit on the integration or production branch (the hooks block it anyway).
- A refused board call stops the Run step it belongs to: report it, never work around it (see `factory:story-status`).
- On a Client project, anything launched to see a change by eye (by an agent or for Pedro) uses `environments.integration` and its data folder, never `environments.release`: that one is the client's betas'.
- Windows: keep any scripted output ASCII-only.
