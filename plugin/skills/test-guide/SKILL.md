---
name: test-guide
description: Build the client's step-by-step test guide for a Client project's Release or beta - scenarios drafted from what the Release changes, each with a real situation, numbered steps and expected results, dry-run on staging with the beta's build, then rendered as one self-contained HTML file whose ticks stay in the tester's browser. Use when promote reaches a beta (7.1, 7.2), or when Pedro asks for a test guide, a test script, a "roteiro de testes", or how the client should test a Release.
---

# Test guide: how the client tests what changed

Part of User testing on Client projects, beside `factory:release-notes`: the deck says what changed, the guide says how to try it. Its input is a Release on Flowboard, or one beta of it. Its output is `<project-key>-test-guide-v<version>[-beta.<n>].html`, one file with no network request, which promote attaches to the beta's pre-release next to the installer and the deck.

Five stages, with a checkpoint where Pedro reviews the scenarios before any dry run: **1. inventory → 2. scenarios → 3. dry run → 4. render → 5. check.**

Board reads go through the `flowboard` MCP; its project resolution (`factory:story-status` step 1) holds here too. The shell ships with this skill: [guide-shell.html](guide-shell.html). The scripts live in the plugin's `scripts/` folder, `<this skill's base directory>/../../scripts/`.

## 0. The project's settings

1. `project_show`: the project must be a Client project. An Internal one has no client tester: say so and stop.
2. `release.notes` in `.claude/factory.json` (`check-release.mjs --client` checks it): `language` and `staging`, and the optional `guide`.
3. **Read the guide** when there is one. For the test guide it holds the theme (palette, font files), the UI labels in the project's language, the recurring cast (people and companies the scenarios are about), and how to launch and drive staging. It wins over this file wherever they differ.

## 1. Inventory what to test

**Only what this Release or beta changes.** There is no fixed regression set.

- **Beta 1, or the Release itself:** the whole Release, `release_show` for its picked Stories, `story_show` each for its brief and Subtasks.
- **Beta 2 and later:** only what changed since the previous beta: `git log v<version>-beta.<n-1>..v<version>-beta.<n>` (fixes, picks added or removed). Decided, not asked.
- **A project with no release tag yet:** the inventory starts from the first commit.

Read the commits, not just the titles, as `release-notes` does: the guide tests what the code does.

## 2. Scenarios, in the chat

Draft them for Pedro before anything else. Each scenario has:

- **A real job, as its title,** in the client's words ("Quoting a crane for a new site"), not the Story's.
- **A tag**: where in the app it happens.
- **A situation**: who, with what, and why, using the guide's cast (Hammer Loc: Antonio, Construtora Vale Verde, Rogerio). Specific names and numbers, never "a user" or "some data".
- **Numbered steps** the tester does, one action each, with the exact labels the app shows.
- **Expected results**: what they should see, each one checkable by looking.

**One scenario can cover several Stories** when the client sees them as one job. A Story the client can't see (a test-only fix, a refactor) gets no scenario; say so in a line. A beta with nothing the client can see still gets its guide, since promote attaches one to every beta: `GUIDE.scenarios` stays empty and the page shows `labels.empty` ("Nothing to test by hand in this beta", in the project's language) with navigation turned off. Say so to Pedro, since it skips the dry run. Show the scenarios as a list, with the Stories each one covers, and wait for Pedro's edits and approval.

## 3. Dry run on staging

Follow **every** scenario on staging, with the beta's build (switch to `v<version>-beta.<n>` or `release/v<version>` before launching), never production.

1. **Back up staging's data first**, into the scratchpad.
2. Launch and drive staging as `release-notes` section 5 does (its `scripts/cdp.mjs` drives a WebView2 app over DevTools).
3. Do each step as written. When an expected result turns out wrong because the guide was wrong, fix the guide. When it is wrong because the app is wrong, it's a bug: report it, and keep the expected result as the brief says it should be.
4. **Staging hygiene.** Stop only the processes you started, by PID, after checking their path: stopping `tauri dev`'s npm can leave the app running. Never kill a browser by image name: that closes Pedro's own windows. Compare staging's data with the backup at the end, and list everything you changed.

Keep a **coverage table** as you go: each scenario, whether it was verified, how (driven over CDP, by reading the code, by a command), and why not when it wasn't. A scenario you couldn't run stays in the guide, marked in the table, not silently passed.

## 4. Render

Copy [guide-shell.html](guide-shell.html) into the scratchpad, beside a `fonts/` folder with the guide's woff2 files. Fill what its comment names: the `lang`, title and labels in the project's language, the theme from the guide, and `GUIDE`: the storage key `<project-key>-test-guide-v<version>[-beta.<n>]` (so each beta starts with no ticks) and the approved scenarios. Keep the shell's markup and script.

Then embed the fonts and check nothing loads from elsewhere:

```
node "<this skill's base directory>/../../scripts/inline-assets.mjs" guide.html <project-key>-test-guide-v<version>[-beta.<n>].html
```

Exit 0 means the file is self-contained. Exit 1 prints each `missing` file, each `network` reference and each `unfilled` shell slot: fix the source and run it again. Ticks stay in the tester's browser (localStorage); bugs still reach Pedro by WhatsApp or email, so the guide has no submit button.

## 5. Check it

- **At phone width (390px)**, with DevTools device emulation (`Emulation.setDeviceMetricsOverride`, `mobile: true`) in a private headless profile. A plain headless window won't go narrower than about 500px, so a window-size screenshot shows a false overflow. Nothing may scroll sideways.
- **On a desktop width**, every scenario: the index, the ticks, Previous and Next.
- **Printed** (`Ctrl+P` preview, or `print-pdf.mjs` from `release-notes`): every scenario on its own page.

## 6. Hand over

Report, in this order:

1. The file's path and size, and that `inline-assets.mjs` passed.
2. The coverage table.
3. Expected results you changed in the dry run, and bugs you found in the app.
4. **Everything you changed on staging**, where the backup is, and whether the staging app is still running.
5. Traps worth adding to the project's guide.
