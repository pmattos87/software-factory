---
name: review
description: Review a building Story's whole diff with Codex before Integrate - post each round's findings as a Story comment, record the verdict on the reviewed commit, send blocking findings back to the builders as a bug Subtask, and stop the Run for Pedro after 2 failed rounds or when Codex is unavailable. Use when a Run reaches Review, or when the user asks to review a Story or re-run its Review.
---

# Review: Codex on the whole Story

Review is the last look before the PR: Codex reads the Story's whole diff against its brief and the project's rules, after every Subtask has passed Verify and Docs has run. A passed Review covers **one commit**, the head it reviewed; the PR gate refuses a PR whose head isn't it. Codex is the only reviewer: when it is unavailable, Review waits, with no Claude fallback.

What Codex looks for and what counts as blocking is in [the review standard](../../review/standard.md). This skill is the **how**: the request, the rounds, the board and the fix loop.

Inside a Run you are the Orchestrator, and its rules hold here: you delegate and never edit code, tests or docs yourself. Board writes go through the `flowboard` MCP, as in `factory:story-status`; resolve the project the way its step 1 says.

## 1. Check the Story

`story_show` the Story. Go on only when all of these hold; otherwise stop and say which one failed:

- it is `building`, and its Run isn't stopped;
- every Subtask is `done` or `canceled` (Verify passed on all of them);
- you are on its recorded Feature branch, and `git status --porcelain` is empty. Review reads the local commits, pushed or not.

`head` is `git rev-parse HEAD`. When the Story's `review` already shows `passed` on `head`, there is nothing to do: report it and return.

**The round.** Count the `review_round` events in `story_trail` since the Run's last `run_restarted` (or its start). This one is that count + 1. After a restart the count starts over, the same as Verify. Round 3 never runs: if two failed rounds are already there, the Run should have stopped; stop it now (step 6).

## 2. Write the request

Keep the round's files in the repo's git directory, so they are never committed:

```
dir=$(git rev-parse --git-path factory/review/<KEY>)/round-<n>
```

Write `$dir/request.md`, the Story-specific part (the runner adds the standard on round 1):

- **Story**: key, title, and the full brief (the description, including its `## Plan`).
- **Commits**: the repo root, the branch, `base` = `git merge-base origin/<production> HEAD` and `head`, both full SHAs, and `git log --oneline <base>..<head>`. Production comes from `.claude/factory.json`.
- **Dependencies**: for each `depends_on` Story merged into this branch, its key and branch, with: "its commits are reviewed on its own Story; review `git log <base>..<head> --not origin/<its branch>` and the diff they make." Without dependencies, the scope is `git diff <base>..<head>`.
- **Verify**: one line per Subtask: key, title, the result of its last Verify round and its reason (from `story_trail`), and anything QA reported it couldn't check.
- **Round**: the number. From round 2 on, add the previous round's blocking findings (id and title) with the builders' response to each: what changed and in which commit, or why no change is needed.

Don't paste the diff: Codex reads it from the repo.

## 3. Run Codex

From the repo root:

```
node "<this skill's base directory>/../../scripts/codex-review.mjs" --request "$dir/request.md" --head <head> --out "$dir" [--resume <session>]
```

On round 2, pass `--resume` with the round-1 session id, so Codex checks its own findings. The id is in `$(git rev-parse --git-path factory/review/<KEY>)/session`, written after round 1; in a new session where that file is gone, it is in the round-1 comment. Without either, run round 2 fresh (no `--resume`); the request already carries the previous findings.

It prints one JSON object. By exit code:

- **0, `ok`**: the verdict is in `.verdict`. Save `.session` to the `session` file, then go to step 4.
- **2, `unavailable`**: Codex is missing, failed or timed out. Review waits: `run_stop` with `Review waits: Codex unavailable: <reason>`. This isn't a failed round, and nothing is recorded with `review_record`.
- **3, `invalid`**: the answer isn't a verdict on `head` (the reason says why). Run the same round once more. A second invalid answer: `run_stop` with `Review waits: Codex gave no usable verdict: <reason>`.

## 4. Record the round

**Post the findings** with `story_comment`, in Markdown:

```
## Review round <n>: <passed | failed>
Commit `<head>` · Codex session `<session>`

<summary>

### Blocking
**B1 <title>** - `<location>`
- Trigger: ...
- Impact: ...
- Evidence: ...

### Earlier findings          (round 2 on)
- B1: resolved | unresolved | regressed - <note>

### Suggestions               (never block)
- `<location>`: <text>

### Not checked
- <limit>
```

Leave out an empty section, except Blocking on a fail. Then `review_record` with the verdict, `commit` = `head`, and `findings_url` = the comment's `url`. Never record a verdict on any commit but the one Codex reviewed.

## 5. Act on the verdict

**Passed**: Review is done. Inside a Run, go on to Integrate. Suggestions are not work for this Story: list them in the final report so Pedro can file what he wants.

**Failed, round 1**: the blocking findings go back to the builders as one bug Subtask:

1. `subtask_create` with `bug: true`, titled `Review round 1 findings`, its description the blocking findings in full plus a link to the comment.
2. Build and Verify it the way `factory:run` step 4 does for any Subtask: handoff, build, Verify (its own 2 rounds), commit. The builder is the agent that built the code the findings point at; when they span several, `implementer`. The handoff tells the builder to answer **every** finding in its `notes`: `B1: <what changed>`, or `B1: no change, because <reason>`.

   A finding about the Orchestrator's own work (a commit message, how changes were split into commits) is the one the Orchestrator fixes itself: record the handoff as `orchestrator`, reword or regroup the unpushed commits without changing their tree, and write the answer yourself. Anything that changes a file still goes to a builder. Never rewrite pushed commits.
3. Back to step 1 for round 2, with those answers as the builders' response.

If the bug Subtask's Verify fails twice, the Run stops there, as with any Subtask.

**Failed, round 2**: stop (step 6). Don't grant a third round, and don't fix anything yourself.

## 6. Stop for Pedro

`run_stop` with `Review failed twice: <the round-2 summary>; findings: <comment url>`, or the unavailable reason from step 3. Then report: the Story key, each round's verdict and comment link, the unresolved findings in full, and what Pedro needs to decide.

## Outside a Run

Pedro may ask for a Review by hand on a Story he built himself. Steps 1 to 4 are the same. On a fail, report the findings and stop: the fixes are his, and the next Review is round 2.

## Guardrails

- A Review covers only the commit it read. Any later commit, even a docs fix, needs a new round before the PR.
- Never edit code to make a finding go away, never tell Codex what verdict to give, and never soften or drop a blocking finding when posting it.
- A refused board call stops the step it belongs to: report it, never work around it.
- Windows: keep any scripted output ASCII-only.
