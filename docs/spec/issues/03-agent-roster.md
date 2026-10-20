# Agent roster

Type: grilling
Status: resolved
Blocked by: 01, 02
Assignee: Pedro

## Question

Which agents does the Factory ship, and which are left for each consumer project to define? Hammer Loc's roster (frontend-design, backend-engineer, document-engineer, data-layer, docs-architect, qa-engineer) is stack-bound — decide the split between generic Factory roles and project-specific specialists, and which model tier each role runs on.

## Answer

Resolved 2026-10-20 with Pedro.

**Split.** The Factory ships stack-agnostic **Role agents**, identical in every Consumer project. Projects define **Specialists** for stack-bound work. Specialists follow a Factory **Specialist contract** (required frontmatter, model as alias only, required sections such as scope and definition of done); the content is the project's.

**Where agents work.** Plan and Build only. Shape stays a conversation with Pedro; Integrate and Production stay skills (`ship` must be adapted).

**The Run in Build**, driven by the **Orchestrator** (the session Pedro triggers; it delegates and never builds):

1. Each Task is built by the agent the Plan named for it: a Specialist, or the Implementer when none fits.
2. **Verify** per Task, by QA: the project's gates plus the definition-of-done items no command covers, and tests that cover each ADR's edge cases. QA may add or strengthen tests, never touch production code. A failure goes back to the builder; after 2 rounds the Run stops for Pedro.
3. Docs, once per Story, after the last Task passes Verify, so docs ride the same PR.
4. **Review** by Codex, once per Story on the full diff. Rejection sends findings back to the builders; after 2 rounds the Run stops for Pedro with the findings linked from the Story. If Codex is unavailable, Review waits; there is no Claude fallback.
5. Only after Review passes is the PR opened into the integration branch.

**Role agents and default tiers** (a project may override with a stated reason; tiers are aliases, never pinned IDs):

| Role agent | Stage | Job | Tier |
|---|---|---|---|
| Task splitter | Plan | Split a Story into Tasks, name each Task's agent, estimate, flag risk; Pedro edits and approves | opus |
| Implementer | Build | Build a Task when no Specialist fits, with its tests | sonnet |
| QA | Build, per Task | Verify | opus |
| Docs | Build, per Story | Keep the working documents current | sonnet |

The Implementer on Sonnet is a default to measure: if Runs often hit the 2-round stop, move it to Opus.

**Project knowledge** (e.g. Hammer Loc's Pix vectors, migration rehearsal, money rules) lives in the project's CLAUDE.md and ADRs, which the Role agents read; not in the agents.

**Dropped as Role agents:** `backend-engineer`, `data-layer`, `frontend-design`, `frontend-polish`, `ux-engineer`. Projects may keep them as Specialists (decided at rollout).

Passed on: Hooks (the 2-round stop at Verify and Review; PR only after Review), Flowboard integration (Tasks carry agent, estimate and risk flag; a stopped Run is flagged on the Story), GitHub conventions (PR opened only after Review), Run-tracking UI (Verify/Review rounds and stopped Runs), Skills consolidation (`ship` adapted to open the PR after Review and pick its target by Stage).
