---
name: release-notes
description: Build a client-facing PDF deck of what a Release (or one of its betas) changes, for a Client project's User testing - the picked Stories from Flowboard and git, classified into major and minor tables, then a local HTML deck in the client's language with real screenshots of the staging app, printed to PDF and checked page by page. Use when Pedro asks for release notes, a release or beta deck, slides showing the client what changed, or "what's in this release" for a client.
---

# Release notes: the Release, as slides the client can read

Part of User testing on Client projects: the client gets a beta of a Release (`factory:promote` 7.1 and 7.2), and this deck tells them what to look at. Its input is a Release on Flowboard, or one beta of it. Its output is `<project-key>-release-notes-v<version>[-beta.<n>].pdf` (ASCII, no spaces: GitHub renames spaces in asset names), which promote attaches to the beta's pre-release next to the installer and the test guide (`factory:test-guide`).

Four stages, each with a checkpoint where Pedro reviews before the next one starts: **1. inventory → 2. two tables → 3. questions → 4. deck.** Never skip to the deck.

Board reads go through the `flowboard` MCP; its project resolution (`factory:story-status` step 1) holds here too. The scripts named below ship with this skill, in `<this skill's base directory>/scripts/`.

## 0. The project's settings

1. `project_show`: the project must be a Client project. An Internal one has no client to write for: say so, and point at the notes `promote` puts on the GitHub Release.
2. `release.notes` in `.claude/factory.json` (`check-release.mjs --client` checks it): `client` (who reads the deck), `language`, `staging` (a URL, or the command that launches the staging app), and an optional `guide`.
3. **Read the guide** when there is one. It is the project's own lore: the deck's theme (palette, font files, logo, cover wording Pedro chose), the UI labels in the project's language, the recurring cast of people and companies, how to launch and drive staging, and the traps hit last time. It wins over this file wherever they differ.

## 1. Inventory what the Release changes

**Which changes.** Decided, not asked:

- **Beta 1, or the Release itself:** the whole Release, `release_show` for its picked Stories.
- **Beta 2 and later:** only what changed since the previous beta: `git log v<version>-beta.<n-1>..v<version>-beta.<n>` (fixes, picks added or removed). The cover says `v<version> beta <n>`.
- **A project with no release tag yet:** the inventory starts from the first commit.

**Two sources, cross-checked:**

- **Board.** `story_show` each picked Story: its brief (the description, with any "Bugs" section) and its Subtasks.
- **Git.** The Release branch's commits: `git log --no-merges --format="%h %s" origin/<production>..release/v<version>`, grouped by the Feature branch they came from (`git log --first-parent --merges` names each merge). Changes in production since the last release tag that weren't picks ship too: list them as their PR or commit, like `- (PR #n)`.

**Read the commits, not just the Story title**, for anything you describe. A title can promise more than shipped. Describe what the code does. When a Story only partly delivers what its title says, say so and offer to file the rest as a new Story.

## 2. Two tables, in the chat

Pedro reviews these before any slide exists:

| Story | Type | Title | Description |

- **Table 1, major:** big features and critical fixes. Description is 2–3 sentences.
- **Table 2, minor:** everything else. Description is **one short line**, just enough to identify it.
- **Merge rows that are one feature for the reader**, even when they were separate Stories.
- **Type starts from the board's type**, the `type` of each pick in `release_show`: a `bug` (a bug Story) is a `Bug fix`, or `Bug fix (tests)` when it only fixed tests. A `story` is a `New feature` or an `Improvement`, judged from its commits, not its branch prefix; one that only fixed a defect (filed before bug Stories existed) is still a `Bug fix`. Say in one line how you assigned the types.
- Expect Pedro to move rows between the tables. Don't argue the split.

## 3. Ask before building

Use `AskUserQuestion`, at most two rounds. Defaults, marked (Recommended):

- **Audience:** the client from `release.notes.client`, so **no Story keys, no ADR codes, no tech jargon**.
- **Language:** `release.notes.language` (it matches the app).
- **Screenshots:** captured by you from staging (section 5).
- **Style:** the deck shell with the guide's theme, else the app's own colours.
- **Test-only fixes:** dropped from a client deck.
- **Framing slides:** cover + overview-in-numbers. No next-steps or update-instructions slide unless asked.
- **Demo data:** staging seed data plus records you add.

## 4. Deck structure

Copy [deck-shell.html](deck-shell.html) into the scratchpad, next to an `img/` folder for the screenshots and a `fonts/` folder for the guide's font files. The shell's comment says what to fill: the theme from the guide (its `:root` values and `@font-face` files), every `{{...}}` slot, and one copy of each slide type per row. Never a web-font link or a remote image: the deck is printed from a local file.

1. **Cover.** The app's logo, the project name, the version (`v<version>`, or `v<version> beta <n>` for a beta deck), and the date. Wording from the guide when it has some.
2. **Overview.** "N changes", then three cards: New features / Improvements / Fixes, in the deck's language. The counts come from the Type column after merging rows.
3. **One slide per Table 1 row.** Text on the left, a screenshot on the right. On the left: a type pill, a title, one paragraph, and 2–4 bullets about what changes in the client's day.
4. **One slide per type for Table 2**, sized to fit: a card grid of "**Where** · what changed". Split a type across two slides past about ten rows.

**A change with no screen** (a CLI, a hook, a CI check) gets the shell's terminal card instead of a screenshot, with **real command output captured on the spot**, never typed in by hand.

**Print and check it.** From the scratchpad:

```
node "<this skill's base directory>/scripts/print-pdf.mjs" deck.html <project-key>-release-notes-v<version>[-beta.<n>].pdf
python -I "<this skill's base directory>/scripts/contact-sheet.py" <that pdf> sheet.png
```

`print-pdf.mjs` finds Edge or Chrome (or `FACTORY_BROWSER`) and prints headless with a private profile. Exit 2 means no browser: ask Pedro where one is, and don't fall back to another format. Then **look at the contact sheet**, every page: text overflowing its slide, a frame much bigger than its screenshot, a shot too wide to read. Fix the HTML and print again until every page is clean. Size each screenshot frame to its content, and crop each shot to its useful area before it goes in.

**Lessons that hold on every project:**

- **Titles use the words the client uses**, not the code's or the board's.
- **Cut bullets the client doesn't care about**: encoding details, refactors, internal names. Keep bullets about what changes in their day.
- **A "new fields" slide must be complete.** Derive the list from the Release's migrations and new settings, not from memory, and list a field even if a major slide already covers it.
- **Every slide sits on the deck's background.** Colour lives in accents (type pills, overview numbers, card borders), one accent per type.
- **Example-only details** (demo data, a test watermark, a value typed only for the screenshot) go in the hand-over for Pedro: a PDF has no speaker notes.

## 5. Screenshots from staging

Only from staging (`release.notes.staging`), **never production**, and with the Release branch's build: switch to `release/v<version>` (or the beta tag) before launching, so the screenshots show what the client will test.

1. **Back up staging's data first** (its database or seed), into the scratchpad. Everything you change happens on staging only, and you list it at the end.
2. **Launch it.** For a URL, open it in the browser tools. For a launch command, run it in the background. A WebView2 desktop app (Tauri) exposes DevTools when launched with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"`; wait until `curl -s http://127.0.0.1:9222/json` lists a `page`.
3. **Drive it** with [scripts/cdp.mjs](scripts/cdp.mjs) (copy it into the scratchpad): `node cdp.mjs eval "<js>"`, or `node cdp.mjs run steps.mjs`, where the steps file exports `async ({ go, ev, click, fill, shot, wait, send }) => {}`. Navigate, act and shoot in **one** `run`: the viewport override lasts one connection. `fill` uses the native setter and an `input` event, which React inputs need.
4. **PDFs** the app produces: render a band of a page with [scripts/render-pdf.py](scripts/render-pdf.py) (`python -I render-pdf.py <in.pdf> <out.png> [top] [bottom] [page]`, in a scratchpad venv with `pymupdf`), shown on a light frame.
5. **Staging hygiene.** Stop only the processes you started, by PID, after checking their path: stopping `tauri dev`'s npm can leave the app running. Never kill a browser by image name: that closes Pedro's own windows. Compare staging's data with the backup at the end.
6. **Demo data must be obviously fake**: `contato@exemplo.com.br`, test document numbers. Show the client's own scenario where you know it. A value typed only for a shot is never saved.
7. A good state for a fixed bug is often **a warning working correctly**, not a screen where nothing goes wrong.

Save every image into the deck's `img/` folder and reference it by its relative path. Nothing is uploaded anywhere.

The guide adds the project's own routes, commands, and traps. When you hit a new trap, tell Pedro at the end so it goes into the guide.

## 6. Hand over

Report, in this order:

1. The PDF's path and the contact sheet's, and how many pages it has.
2. Wording that differs from the tables, with the reason (partial deliveries, a Story described by its root cause).
3. **Everything you changed on staging**, where the backup is, and whether the staging app is still running.
4. Traps worth adding to the project's guide.
