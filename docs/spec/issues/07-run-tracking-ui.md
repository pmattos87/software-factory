# Run-tracking UI

Type: grilling
Status: resolved
Blocked by: 02, 05
Assignee: Pedro

## Question

What does Pedro need to see about a Run inside Flowboard? Decide the views (e.g. per-Run timeline of stages, cross-project overview of active Runs, gate waiting on Pedro, failures) and what data the Factory must emit for them. Where it lives is settled: inside Flowboard.

## Assets

- [Story page prototype](../../reference/story-page-prototype.html): throwaway HTML of the dedicated Story page: Run node graph on top (after [the mockup](../../reference/run-view-mockup.png)), then today's fields mixed with Subtasks, Review rounds, links and trail. Supersedes the earlier slide-over Run-tab variants.

## Comments

- **From Workflow stages (2026-10-20):** a Run's view needs the 7 Stages, its Tasks, any open bug Tasks holding it in place, and which Release it belongs to.

- **From Agent roster (2026-10-20):** Show each Task's Verify rounds, the Story's Review rounds, and Runs stopped waiting on Pedro.

- **From Flowboard integration (2026-10-20):** a Run is the Story plus an event trail; decide which events it holds (Stage entered, Verify/Review rounds and verdicts, stopped, restarted). Statuses are split between the Discovery board (`backlog`, `refining`, `ready`) and the Story board (`building` onward); decide where the line falls exactly. Show two flags without changing the status: waiting on bug Subtasks (derived) and stopped Run. The assignee (Pedro, Agent or the client contact) already answers "whose move is it".

## Answer

Resolved 2026-10-20 with Pedro. Prototype: [Story page prototype](../../reference/story-page-prototype.html).

**Story page.** Factory projects replace the Story slide-over with a dedicated page, opened from a board card or the overview. Top to bottom:
- **Top, two columns.** Left: Description, the Subtasks mini kanban, Comments. Right: the stopped-Run box (with Restart Run), Details, Links (Feature branch, PR, Review verdict, Release, depends-on), Attachments.
- **Middle: the Run node graph**, styled after [the mockup](../../reference/run-view-mockup.png) but drawn for *this* Run. It has three lanes:
  - **Plan.**
  - **Build:** Orchestrator → one node per Subtask (agent + model + Verify rounds) → Verify → Stop or Docs.
  - **Review → Integrate → Release → Production:** with a findings loop and a bug loop back to Build.
  - Done, stopped and not-reached steps are drawn differently. The graph shows at every status, mostly dimmed before the Run starts.
- **Bottom:** Review rounds, then the Trail.

**Subtasks** have no Run, page or panel of their own; they're part of the Story's Run.
- On Factory projects the Task board is folded into the Story page as a `todo | in_progress | done` mini kanban.
- Cards show the title, agent and model, key, Verify-round pills and the stopped badge.
- Cards are read-only while the Story is `building`, and draggable otherwise.

**Bug details** go into the Story description under a "Bugs" heading. The description stays the one complete brief.

**Active Runs overview.** One cross-project page lists Stories from `ready` (in a sprint) through `user_testing`, with Stage, flag, whose move it is, and time in Stage.
- Stopped Runs sort first.
- A "Needs Pedro" filter shows only Stories assigned to Pedro. There's no separate inbox.
- Clicking a row opens the Story page.

**Boards follow today's sprint rule**: the sprint decides the board, not the status.
- **Discovery board:** Stories with no sprint (`backlog`, `refining`, `ready`).
- **Story board:** Stories in a sprint (`ready` → `building` → `integrated_tests` → `tested` → `user_testing` → `done`).
- `ready` is the only status on both boards. No new status is added.
- A Run can only start on a Story that's `ready` **and** in a sprint.
- `canceled` is hidden on both boards behind a filter.

**Flags** show as badges on board cards, overview rows and the Story page: "stopped" (red) and "waiting on N bugs" (amber).

**The Run trail** is new action kinds in the existing `activity_log` table, which already logs `created` and `status_changed`. They're written only through the Flowboard CLI:
- Stage entered
- Subtask status changed
- Subtask handed to an agent (agent + model)
- Verify round (Subtask, round n, pass/fail, reason)
- Review round (round n, verdict, reviewed commit, findings link)
- Run stopped / restarted
- PR opened / merged
- Picked into / removed from Release
- Bug Subtask filed

These events drive the trail, the graph's node states and the Subtask cards.

**No alerts in v1.**

Passed on:
- **Build order:** the Flowboard CLI and the new event kinds before the Story page, graph and overview.
- **Not yet specified:** alerts, cumulative agent/model usage across Runs, and whether legacy projects get the Story page.
