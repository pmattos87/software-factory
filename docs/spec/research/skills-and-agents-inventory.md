# Skills and agents inventory

Research for [issue 01](../issues/01-skills-and-agents-inventory.md). Facts only, no keep/merge/drop verdicts. Snapshot taken 2026-10-20 by reading the files directly (all paths below are primary sources).

## Where things live

| Project (map name) | Folder | `.claude/` contents |
|---|---|---|
| User level | `C:\Users\Pedro\.claude\` | `skills/` (24 own + synced claude.ai skills), `settings.json` (1 hook), `scripts/vitest-related.mjs`; **no** `agents/`, **no** `commands/`; `CLAUDE.md` exists but is **empty (0 bytes)** |
| Hammer Loc | `D:\Projetos\Hammer loc - CRM\` | `agents/` (6), plus `v1-plan/`, `hl-src.tgz`; **no settings.json** |
| Flowboard | `C:\Users\Pedro\Desktop\Projetos\Flowboard\` | `agents/` (7), `settings.json`, `settings.local.json` |
| Viagem Pronta | `C:\Users\Pedro\Desktop\Projetos\Viagem Pronta\` | `agents/` (8), `settings.json`, `settings.local.json` |
| Fintracks | `C:\Users\Pedro\Desktop\Projetos\Fintracks\` | `agents/` (7), `settings.json`, `settings.local.json` (empty lists) |
| Atlas CRM | `C:\Users\Pedro\Desktop\Projetos\Internal CRM\` (folder/CLAUDE.md still say "Internal CRM"; the vault `2nd Brain/index.md` links `[[Internal CRM\|Atlas CRM]]`) | `agents/` (7), `settings.json`, `settings.local.json` |
| *(not on map)* VP browser extension | `C:\Users\Pedro\Desktop\Projetos\Viagem Pronta - browser extension\` | `agents/` (5), `settings.json`, `settings.local.json` |
| *(not on map)* 2nd Brain vault | `C:\Users\Pedro\Desktop\Projetos\2nd Brain\` | `skills/lint/`, `settings.json`, `settings.local.json` |

Other `D:\Projetos\` folders (`FGTS Leo`, `House-Shell-Stage-1`) have a root `CLAUDE.md` but no `.claude/`; not inventoried. The five map projects live on **two drives** (only Hammer Loc is under `D:\Projetos\`).

## Skills

### User-level, Pedro-authored (`C:\Users\Pedro\.claude\skills\<name>\SKILL.md`)

| Name | Purpose (from frontmatter) | Projects it targets / used by | Notes |
|---|---|---|---|
| `flowboard-issue` | Create/move Flowboard issues via `flowboard-db` MCP; resolves project from the repo's CLAUDE.md "Flowboard board" key, refuses to guess | Any repo declaring a board key; **only Hammer Loc's CLAUDE.md declares one (`HL`)** | Status vocabulary: refining → ready_for_development → todo → in_progress → in_review → done/canceled |
| `ship` | Secret scan → semantic commits → PR to **default branch** → delete merged branch | Referenced by Hammer Loc CLAUDE.md ("the `ship` skill's job") | Hard-codes `Co-Authored-By: Claude Opus` trailer; `gh pr create --base <default-branch>` |
| `release` | Bump version, build installer/zip (ASCII scripts), tag, draft GitHub release | Names Flowboard & Fintracks (Tauri) and "browser extension" (`manifest.json`) | |
| `release-notes` | Client-facing pt-BR sprint deck from Flowboard + git with staging screenshots | **Hammer Loc only** (stated in skill) | Ships `scripts/cdp.mjs`, `scripts/render-pdf.py` |
| `research` | Investigate against primary sources, write a Markdown file | Software Factory (map rule) | Instructs spawning a background agent |
| `grilling` | Relentless interview in rounds over a design tree | Software Factory (map rule); Hammer Loc CLAUDE.md says it does **not** run on implementation tasks | |
| `domain-modeling` | Build CONTEXT.md / ADRs | Software Factory; Hammer Loc (same restriction) | Has `ADR-FORMAT.md`, `CONTEXT-FORMAT.md`, `agents/openai.yaml` |
| `prototype` | Throwaway prototype for a design question | — | `LOGIC.md`, `UI.md` |
| `standup` | Morning briefing from flowboard-db + vault | 2nd Brain vault | |
| `ingest` | File material into the 2nd Brain vault | 2nd Brain vault | Vault CLAUDE.md references `/ingest` |
| `reconcile` | Re-read project repos + flowboard-db, fix vault drift | 2nd Brain; reads Flowboard, Viagem Pronta, VP extension, Fintracks | **Does not list Hammer Loc or Atlas CRM** ("Default: all four repos") |
| `wayfinder` | Plan large work as a map of decision tickets | Software Factory (this map) | `disable-model-invocation: true` |

### User-level, third-party "Matt Pocock" set (same folder; each has `agents/openai.yaml`, installed via `setup-matt-pocock-skills`)

Disabled in `settings.json` `skillOverrides` (= `"off"`): `ask-matt`, `codebase-design`, `diagnosing-bugs`, `grill-with-docs`, `implement`, `improve-codebase-architecture`, `resolving-merge-conflicts`, `setup-matt-pocock-skills`, `tdd`, `to-spec`, `to-tickets`, `triage`, `wizard`.
Still enabled from that set: `grilling`, `domain-modeling`, `prototype`, `research`, `wayfinder` (listed above).

| Name | Purpose |
|---|---|
| `ask-matt` | Router: which skill/flow fits |
| `codebase-design` | Deep-module vocabulary |
| `diagnosing-bugs` | Diagnosis loop for hard bugs/perf |
| `grill-with-docs` | Wrapper: calls `grilling` + `domain-modeling` |
| `implement` | Implement from a spec/tickets |
| `improve-codebase-architecture` | Scan for deepening opportunities, HTML report |
| `resolving-merge-conflicts` | Resolve in-progress merge/rebase |
| `setup-matt-pocock-skills` | Configure issue tracker/labels/domain docs (github/gitlab/local) |
| `tdd` | Red-green-refactor |
| `to-spec` | Conversation → spec in tracker |
| `to-tickets` | Plan → tracer-bullet tickets with blocking edges |
| `triage` | Issue state machine + agent briefs |
| `wizard` | Generate a bash wizard for human-only steps |

### Synced / plugin skills (not authored in any project)
- `skills/synced/<id>/`: claude.ai-synced skills (`docs`, `docx`, `pdf`, `pptx`, `xlsx`, `skill-creator`, `import-memory`, `morning`, browser/computer-use, `deep-research`, `google-workspace`) — all `creatorType: anthropic` except **`planning`** (`creatorType: user`, `source: plugin`), a user-made meta-planning skill.
- Installed plugin: `understand-anything@understand-anything` (GitHub `Egonex-AI/Understand-Anything`), the only entry in `installed_plugins.json`. Cowork plugins (engineering, product-management, design, data, sales, marketing) are also available in sessions but are not stored as files here.
- `skillOverrides` also turns off 25 `seo-*` skills (no files present for them).

### Project-level skills
| Name | Location | Purpose |
|---|---|---|
| `lint` | `2nd Brain/.claude/skills/lint/` | Health-check the vault (contradictions, stale claims, orphans) |

**No consumer project on the map defines any project-level skill.**

## Agents (subagent definitions)

No user-level agents exist. All agents are per-project in `.claude/agents/*.md`. Model in frontmatter; line counts show size. **No two files are byte-identical** (md5 compared).

| Agent | Hammer Loc | Flowboard | Viagem Pronta | Fintracks | Atlas CRM | VP extension |
|---|---|---|---|---|---|---|
| `backend-engineer` | opus, 50 l — Rust/Tauri, SQLite, backup/CSV | opus, 28 l — Rust/Tauri, SQLite, Gantt | — | opus, 34 l — Rust/Tauri, money/sats math | opus, 38 l — TanStack Start server fns, Nitro, Fathom/Evolution | — |
| `data-layer` | **sonnet**, 40 l | opus, 25 l | opus, 45 l (Supabase/TanStack Query) | opus, 28 l | opus, 29 l (in-memory store) | — |
| `docs-architect` | sonnet, 53 l | sonnet, 20 l | sonnet, 41 l | sonnet, 27 l | sonnet, 24 l | sonnet, 42 l |
| `frontend-design` | **opus**, 54 l | sonnet, 33 l | sonnet, 45 l | sonnet, 37 l | sonnet, 34 l | — |
| `frontend-polish` | — | sonnet, 18 l | sonnet, 37 l (Phase 9 style consolidation) | sonnet, 25 l | sonnet, 25 l | — |
| `qa-engineer` | opus, 61 l | opus, 18 l | opus, 51 l | opus, 30 l | opus, 23 l | opus, 47 l |
| `ux-engineer` | — | sonnet, 24 l | sonnet, 38 l | sonnet, 27 l | sonnet, 26 l | — |
| `document-engineer` | opus, 62 l — react-pdf docs + Pix QR | — | — | — | — | — |
| `supabase-engineer` | — | — | opus, 45 l | — | — | — |
| `integrations-engineer` | — | — | opus, 52 l (Infotravel, n8n) | — | — | — |
| `ext-engineer` | — | — | — | — | — | sonnet, 40 l |
| `parser-engineer` | — | — | — | — | — | opus, 42 l |
| `export-engineer` | — | — | — | — | — | sonnet, 38 l |

Tool lists: Hammer Loc / Flowboard / Fintracks / Atlas use `Read, Edit, Write, Bash, Grep, Glob` (docs-architect drops Bash); Viagem Pronta and the VP extension use `Read, Write, Edit, Bash` (no Grep/Glob).

## Hooks

| Hook | Kind | Location | Purpose | Scope |
|---|---|---|---|---|
| `vitest-related.mjs` | `PostToolUse` on `Edit\|Write` | `C:\Users\Pedro\.claude\settings.json` → `C:\Users\Pedro\.claude\scripts\vitest-related.mjs` | Runs only vitest tests related to the edited file; no-op unless nearest `package.json` depends on vitest; always exits 0 (advisory) | Every project (user-level) |

**No project-level hooks** in any `.claude/settings*.json`.

## Slash commands

None. No `commands/` directory at user level or in any project. (User-invoked behaviour lives in skills with `disable-model-invocation: true`.)

## Settings / permissions (related conventions)

| Location | Deny rules | Notes |
|---|---|---|
| User `settings.json` | 42 (git push/merge/rebase/reset to `main`/`dev`, branch deletes, gh destructive ops, `flowboard-db` create/delete table) | `defaultMode: auto`, `model: opus`, `effortLevel: high` |
| Fintracks | 41 — user-level list minus `flowboard-db__delete_table` | |
| Viagem Pronta | 12 | |
| Flowboard, Atlas CRM, VP extension | 6 (same short list) | |
| 2nd Brain | 7 (blocks curl/wget/iwr) | |
| Hammer Loc | — (no settings file) | |

Deny lists name `dev`, never `develop`.

MCP: `flowboard-db` is configured at user level and again for the Flowboard project (`~/.claude.json`); no `.mcp.json` in any repo.

## CLAUDE.md conventions

| Project | Lines | Shared sections | Distinct features |
|---|---|---|---|
| Hammer Loc | 422 | What/Tech Stack/Non-Negotiables/File conventions/Agent Registry/DoD | "How To Work Here" instead of Coding Behavior Guidelines; **Flowboard board: `HL`**; references `flowboard-issue`, `ship`, `grilling`, `domain-modeling`; one branch per phase, `--base develop`; docs PLAN/PROGRESS/DECISIONS/LESSONS/OPEN-QUESTIONS/KNOWN-ISSUES; registry is prose, not a table |
| Flowboard | 228 | Coding Behavior Guidelines (§0–4), Git Workflow, Agent Registry table, Testing, DoD | Branches `[phase-number]/[task-number]-desc`; protected `main` + `dev` |
| Viagem Pronta | 295 | same template | Adds "Branch Delivery — push, PR, tag" and "Forbidden Operations"; branches `phase/N-desc`, `fix/desc`; protected `main` only; CHANGELOG |
| Fintracks | 298 | same template | `feature → develop → main`; branches `phase/N-desc`; "Forbidden Operations" |
| Atlas CRM | 164 | same template (no §0 Pre-flight) | Protected `main` + `dev`; same branch pattern as Flowboard |
| VP extension | 172 | same template | Branches `phase-N/desc`; protected `main` only |
| 2nd Brain | 210 | — | Vault rules; points to `/ingest`, `/reconcile`, `/lint` |
| User `~/.claude/CLAUDE.md` | 0 | — | empty |

Every project CLAUDE.md opens with "Canonical reference for all agents and skills" and carries an Agent Registry with model rationale and "do not substitute models without explicit approval".

## Overlaps & drift

1. **Same agent roster copied per project, with drift, no shared source.** Flowboard's 7-agent set (`backend-engineer, data-layer, docs-architect, frontend-design, frontend-polish, qa-engineer, ux-engineer`) recurs by name in Fintracks and Atlas CRM; Hammer Loc has 5 of them plus `document-engineer`; Viagem Pronta swaps `backend-engineer` for `supabase-engineer` + `integrations-engineer`. Bodies diverge (e.g. Flowboard vs Atlas `frontend-polish`/`ux-engineer` share the description but Atlas adds stack rules and different DoD). Two template lineages: Flowboard-style (terse descriptions, Grep/Glob tools, heading "Agent: skill:X") and Viagem Pronta-style ("Handles… Delegate for…", no Grep/Glob, used by VP and VP extension).
2. **Model assignment drift.** `data-layer` is sonnet in Hammer Loc, opus elsewhere; `frontend-design` is opus in Hammer Loc, sonnet elsewhere. User `settings.json` allowlist records a past `sed` swapping `data-layer` opus→sonnet.
3. **Registry vs frontmatter.** Registry tables name pinned IDs (`claude-opus-4-7` in Flowboard/VP; `claude-opus-4-8` in Fintracks; `claude-sonnet-4-6`) while frontmatter uses aliases `opus`/`sonnet`. Prefix differs: `skill:X` (Flowboard, Fintracks) vs `agent:X` (Viagem Pronta).
4. **"Coding Behavior Guidelines" block** copied into 5 CLAUDE.md files: Viagem Pronta and Fintracks are identical; Flowboard, VP extension and Atlas differ (Atlas lacks §0). Hammer Loc dropped it.
5. **Branch model conflicts.** Integration branch is `develop` (Hammer Loc, Fintracks), `dev` (Flowboard, Atlas), or none (Viagem Pronta, VP extension). Branch naming has 4 patterns. User-level and project deny lists only protect `dev`, so `develop` is not covered by the deny rules. `flowboard-issue` speaks of "merges to develop".
6. **`ship` vs project rules.** `ship` PRs to the default branch (`main`) and opens the PR without asking; Hammer Loc and Fintracks require `--base develop`. Viagem Pronta CLAUDE.md §4 "Branch Delivery — push, PR, tag" restates delivery steps that overlap `ship` and `release`.
7. **Deny-list duplication.** Fintracks' 41-rule deny list is the user-level 42-rule list minus `flowboard-db__delete_table`; Flowboard/Atlas/VP-ext carry an older 6-rule subset; Viagem Pronta a 12-rule middle version.
8. **Skill overlaps.** `grill-with-docs` = `grilling` + `domain-modeling` (and is off). `diagnosing-bugs` overlaps plugin `engineering:debug`; `to-spec` overlaps `product-management:write-spec`; `standup` (vault) shares a name with plugin `engineering:standup`; `tdd` overlaps `engineering:testing-strategy`; `planning` (synced user skill) overlaps `wayfinder`/`to-tickets`.
9. **Project-specific skills living at user level.** `release-notes` (Hammer Loc only), `release` (names Flowboard/Fintracks/extension), `ingest`/`reconcile`/`standup` (2nd Brain) sit in the global folder, while the vault's `lint` sits in the project.
10. **Coverage gaps inside existing skills.** `flowboard-issue` needs a "Flowboard board" key in CLAUDE.md, which only Hammer Loc declares. `reconcile` covers 4 repos but not Hammer Loc or Atlas CRM.
11. **Docs-architect scope drift.** Each project's `docs-architect` maintains a different doc set (Hammer Loc: DECISIONS/PROGRESS/OPEN-QUESTIONS/runbooks; Flowboard: SCHEMA/TYPES; VP: PROGRESS/CHANGELOG/DECISIONS/LESSONS/PLAN; VP-ext adds API-SHAPE/PORTAL-DOM).

## Gaps / couldn't find

- **Atlas CRM** has no folder by that name. The folder is `Internal CRM`, identified as Atlas CRM through the vault (`2nd Brain/index.md`) and `Plan.md`. Its `CLAUDE.md` still calls it "Internal CRM".
- **No slash commands** anywhere; **no user-level agents**; user `CLAUDE.md` is empty.
- **Hammer Loc** has no `.claude/settings.json`, so it relies only on user-level permissions.
- **Not inspected:** `.claude/worktrees/` copies, `Hammer loc - CRM/.claude/v1-plan/` and `hl-src.tgz` (an archive, not definitions), `settings.local.json` allow-lists (machine-local approvals), and plugin cache internals. Cowork plugin skills are available in sessions but aren't stored as files under `~/.claude`, so this pass has no file-level facts about them.
- Whether each project actually *invokes* a given user skill was judged only from CLAUDE.md/skill text, not from transcripts (excluded by scope).
