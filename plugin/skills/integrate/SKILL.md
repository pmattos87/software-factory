---
name: integrate
description: Integrate a built Story - commit its work on its Feature branch, open the PR into the integration branch, merge it once the PR checks are green, and move the Story to integrated_tests. Use when a Story's Subtasks are all done and its work should go to the integration branch, or when the user asks to ship, open the PR, or integrate a Story.
---

# Integrate: from a built Story to the integration branch

The Integrate Stage. Its input is a Story in `building` whose Subtasks are all `done`. Its output is the Story's Feature branch merged into the integration branch, and the Story in `integrated_tests`, where Pedro tests it. Do the steps in order and stop at the first failure: report it, and leave the Story in `building`.

Board writes go through the `factory:story-status` skill's interface (the `flowboard` MCP). Branch names, the board key and the Gates come from `.claude/factory.json`.

## 1. Check the Story

`story_show` the Story. It must be `building`, with every Subtask `done` or `canceled` and the Run not stopped. If not, stop and say what is missing: the final move would be refused anyway.

## 2. Be on the Feature branch

One Story has one Feature branch, `<type>/<KEY>-<n>-<slug>`: the conventional-commit type of the work (`feat`, `fix`, `docs`, `chore`…), the Story key, and a short slug of its title (`feat/FB-100-markdown-descriptions`).

- **The Story already records a branch** (`feature_branch`): switch to it. A bug Subtask's fix goes on the same branch.
- **It doesn't**: cut it from production, carrying the uncommitted work: `git fetch origin` then `git switch -c <branch> origin/<production>`. Record it with `story_set_branch`. If git refuses because the work conflicts with production, stop and report.

A Feature branch is **never** cut from the integration branch and never has the integration branch merged into it. The integration branch holds other Stories that may never be released, and they would ride along into this Story's Release.

## 3. Commit

Group the changes into logical commits, never one mega-commit. Each subject is a conventional commit, `type(scope): description`, in the imperative, with a body when the why isn't obvious. No Story key in commit subjects: it lives in the branch name and the PR title. End each message with the attribution lines the session asks for.

Commit as the Factory's machine account:

```
git -c user.name=pmattos-pr-review-agent -c user.email=345377693+pmattos-pr-review-agent@users.noreply.github.com commit ...
```

Docs that track this work (README, changelog, the project's docs) are updated in these commits, never in a follow-up PR. The secret-scan hook checks every commit; a block means a secret is in the diff. Remove it, don't bypass the hook.

## 4. Push and open the PR

```
git push -u origin <branch>
GH_TOKEN="$(gh auth token -u pmattos-pr-review-agent)" gh pr create --base <integration> --head <branch> --title "<KEY>: <Story title>" --body-file <file>
```

The body summarizes the change set, names the Story key, and ends with the PR attribution the session asks for. The PR-gate hook runs the Gates and the conventions before the PR opens. A block lists what to fix: fix it, commit, and try again. Don't ask for confirmation before opening the PR: integration is what this Stage is for.

Record the PR: `pr_open` with its URL and `target` = the integration branch.

## 5. Wait for the PR checks, then merge

```
gh pr checks <url> --watch --fail-fast
```

- **"no checks reported"** right after opening: the run hasn't registered yet. Wait half a minute and watch again.
- **A check fails**: stop. Report the failing check and its log (`gh run view --log-failed`). The Story stays in `building`; once it's fixed, push again and repeat this step.
- **The PR conflicts with the integration branch**: stop and report the conflicting files. Don't merge the integration branch into the Feature branch (see step 2). Pedro decides how it's resolved.
- **All green**: merge as the machine account, with a merge commit, keeping the branch:

```
GH_TOKEN="$(gh auth token -u pmattos-pr-review-agent)" gh pr merge <url> --merge
```

Never `--squash`, `--rebase` or `--delete-branch`: the Feature branch lives on until its Release reaches production, and the merge-guard hook refuses them.

## 6. Hand over to Pedro

`pr_set_state` the PR as `merged`, then `story_move` the Story to `integrated_tests`. Report the PR link, the commits, and that the Story now waits for Pedro's test on the integration branch.

## Not here yet

- **Review** (phase 5): Codex's Review of the whole Story diff will come before step 4, and the PR gate will require it.
- **Release and Production PRs** belong to the release-promotion skill, never to this one.

## Guardrails

- Never force-push, and never rewrite a branch that has been pushed.
- Never commit on, push to, or merge into the production branch here. The hooks block it anyway.
- Interactive git flags (`-i`) aren't available; on Windows keep any scripted output ASCII-only.
