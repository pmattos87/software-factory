---
name: promote
description: Promote a Release - cut its release/vX.Y.Z branch from production with the picked Stories' Feature branches merged in and the version bumped, bring the branch back in line when the pick changes, open its PR into production, and once Pedro merges it tag the version, publish the GitHub Release with its assets, mark the Release released and delete its branches. Use when the user asks to cut, promote, ship or finish a Release, or to release a version to production.
---

# Promote: from a picked Release to production

The Production Stage (and, on Client projects, the way into User testing). Its input is a Release picked on Flowboard's Releases screen: a version and the `tested` Stories in it. Its output is that version in production: merged into the production branch, tagged, published as a GitHub Release, with its Stories `done` and its branches gone.

The pick on Flowboard is the source of truth. Run this skill again at any point and it picks up from where the Release stands (section 2), bringing the branch in line with the pick when it changed.

Board writes go through the `factory:story-status` skill's interface (the `flowboard` MCP); its project resolution (step 1 there) holds here too. Branch names and the release settings come from `.claude/factory.json`. The scripts named below ship in this plugin, at `<this skill's base directory>/../../scripts/`; run them from the project's repo root.

Commits, merges and tags are made as the Factory's machine account. Below, `git-bot` stands for:

```
git -c user.name=pmattos-pr-review-agent -c user.email=345377693+pmattos-pr-review-agent@users.noreply.github.com
```

and `gh-bot` for `GH_TOKEN="$(gh auth token -u pmattos-pr-review-agent)" gh`.

## 1. Check the project and the Release

1. `project_show`: note the project's kind (`internal` or `client`).
2. `node check-release.mjs` (with `--client` on a Client project). Any `FAIL` stops here: the settings are needed to bump the version and build the assets.
3. The working tree must be clean (`git status --porcelain` empty); never stash or discard Pedro's work. Note the current branch, to switch back to at the end. `git fetch origin --prune --tags`.
4. **Find the Release.** The version the user named, or `release_list` and take the one in `planned` or `user_testing`. Several, or none: ask which one, or send Pedro to the Releases screen to pick one.
5. `release_show` it, then `story_show` each picked Story. Every pick must be `tested` (`user_testing` on a Client Release in User testing) and record a Feature branch that exists on origin. An empty Release, or a pick that doesn't qualify: stop and say which. A depends-on warning from the pick (a dependency that is neither `done` nor in this Release) is reported, and Pedro decides whether to go on.

## 2. Where the Release stands

| Release state | Branch `release/v<version>` on origin | PR into production | Go to |
|---|---|---|---|
| `planned` | no | | 3. Cut |
| `planned` | yes | none | 4. Sync, then 5. PR |
| `planned` | yes | open | 4. Sync, then wait for Pedro's merge |
| `planned` | yes or deleted | merged | 6. Finish |
| `user_testing` | yes | | Client projects: see section 7 |
| `released` | | | Nothing to do: say so |

Find the PR with `gh pr list --head release/v<version> --base <production> --state all --json number,url,state`.

## 3. Cut

1. **Merge the picks onto production, still unnamed**: `git switch --detach origin/<production>`, then for each pick in key order:

   ```
   git-bot merge --no-ff origin/<its Feature branch> -m "Merge <its Feature branch> (<KEY>) into the Release"
   ```

   A conflict stops the cut: `git merge --abort`, switch back, and report the files and the two Stories. Two picks that conflict can't ship together until one is rebuilt on top of the other; that is Pedro's call. A pick already in production makes its merge a no-op; say so.

2. **Confirm the version.** `node release-version.mjs propose` reads the commits since the last release tag and proposes the next version (a breaking change is major, a `feat` minor, anything else patch). Show it with the Release's version. When they differ, ask Pedro which one ships; when he picks the proposed one, `release_set_version` before going on. A version lower than the proposal needs his explicit confirmation: it hides what the commits say.

3. **Name the branch and bump the version**: `git switch -c release/v<version>`, `node release-version.mjs bump <version>` (it also updates `Cargo.lock` when a version file is a `Cargo.toml`). When the project keeps a changelog with an "Unreleased" section, turn that heading into `## <version> - <date>` in the same commit. Then:

   ```
   git-bot commit -am "chore(release): v<version>"
   ```

   with the attribution lines the session asks for.

4. `git push -u origin release/v<version>`, then go on to 5. PR (Internal projects) or 7 (Client projects).

## 4. Sync after the pick changed

Compare the branch with the pick: the Stories merged into it are the `Merge <branch> (<KEY>) into the Release` commits in `git log --merges --first-parent --format=%s origin/<production>..origin/release/v<version>`.

- **Nothing changed, and every pick's Feature branch is already merged** (`git merge-base --is-ancestor origin/<its branch> origin/release/v<version>`): nothing to sync.
- **A pick was added, or a pick's Feature branch gained commits** (a bug Subtask fixed on it): `git switch release/v<version>`, merge it as in step 3.1, and push.
- **A pick was removed**: the branch is re-cut, never reverted, while no beta of this version has been tagged (`git tag --list "v<version>-beta.*"` is empty). Tell Pedro the branch will be deleted and cut again, and wait for his go-ahead. Then close an open PR into production (`gh-bot pr close <url>`), `git push origin --delete release/v<version>`, delete the local branch, and redo 3. Cut from the start. Once a beta exists, the client has tested that build: revert the Story's merge commit on the branch instead (`git-bot revert -m 1 <merge commit>`) and push.
- **The proposed version changed** (an added pick brought a `feat`): say so. The branch name carries the version, so shipping the new one means a re-cut under the new name after `release_set_version`.

## 5. Open the PR into production

1. Write the notes (below) to a file.
2. From the Release branch (`git switch release/v<version>`, in line with origin), open the PR as the machine account:

   ```
   gh-bot pr create --base <production> --head release/v<version> --title "Release v<version>" --body-file <notes file>
   ```

   The PR gate checks the title, the commits and the Gates first; a block lists what to fix.
3. `pr_open` on every picked Story with the PR's URL and `target` = the production branch.
4. `gh pr checks <url> --watch --fail-fast`. "No checks reported" right after opening means the run hasn't registered yet: wait half a minute and watch again. A failing check stops here: report it with `gh run view --log-failed`.
5. **Stop for Pedro.** His merge of this PR is the Promote gate; the merge-guard hook refuses anyone else's. Report the PR link and the picked Stories, and tell him to run this skill again once he has merged it.

**The notes.** One `## v<version>` heading, then the picked Stories grouped by the type in their Feature branch name: Features (`feat`), Fixes (`fix`), Other. One line each: the Story title and its key. Then an "Also in this release" list of the PRs merged into production since the last release tag that aren't a pick (`git log --merges --first-parent --format=%s v<last>..origin/<production>`), since they ship too. End with the PR attribution the session asks for.

## 6. Finish, after Pedro's merge

1. `gh pr view <url> --json state,mergeCommit`: it must be `MERGED`. Note the merge commit.
2. `pr_set_state` the PR as `merged` on every picked Story.
3. **Tag the merge commit**, unless `v<version>` already exists on origin (then stop: a published tag is never moved):

   ```
   git-bot tag -a v<version> <merge commit> -m "v<version>"
   git push origin v<version>
   ```

4. **Build the assets** from the tag: `git switch --detach v<version>`, run each `release.assets.build` command (they install their own dependencies, so the build matches the tag, not whatever the checkout had), and check every `release.assets.files` pattern matches at least one file. A failed build or a missing file stops here, before anything is published.
5. **Publish the GitHub Release** with the notes from step 5 and the asset files:

   ```
   gh-bot release create v<version> <asset files> --verify-tag --title "v<version>" --notes-file <notes file>
   ```

6. `release_move` the Release to `released`. Its Stories move to `done` with it; a refusal names the pick that blocks it.
7. **Delete the branches** the Release no longer needs: each pick's Feature branch and the Release branch, on origin (`git push origin --delete <branch>`) and locally (`git branch -D <branch>`). Only this Release's branches: a Story not in it keeps its Feature branch, whatever its state.
8. Switch back to the branch you started on.

## 7. Client projects: User testing

A Client Release goes through User testing before step 5: the client tests the Release branch, and only then does it go to production. That path (beta tags, the move to `user_testing`, the bug loop back to `building`) isn't built yet: on a Client project, stop after 3. Cut and say so.

## 8. Report

The version, where the Release stands now, the picked Stories (key, title, status), and the links: the PR, the GitHub Release and its assets once finished. When the skill stopped for Pedro, say exactly what he has to do and that running it again picks up from there.

## Guardrails

- Never merge the PR into production: that merge is Pedro's Promote gate.
- Never merge the integration branch into a Release branch: it holds Stories that aren't picked.
- Never force-push, and never move a tag that has been pushed. The only rewrite allowed is deleting a Release branch for a re-cut, before any beta, after Pedro's go-ahead.
- A refused board call stops the step it belongs to: report it, never work around it (see `factory:story-status`).
- Windows: keep any scripted output ASCII-only.
