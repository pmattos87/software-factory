---
name: story-status
description: Create and move Stories and Subtasks on a Factory project's Flowboard board, through the flowboard MCP. Use when a plan is approved (write its Stories and Subtasks), when a Story or Subtask changes Stage or status, when a bug is found while testing a Story (file a bug Subtask), or when the user asks what state a Story is in.
---

# Story status: the one way to write the board

The board is the Workflow's source of truth: every Stage reads the Story and writes back to it. This skill is the **how**. The **when** (which event moves what) is in the Workflow and in the project's `CLAUDE.md`; follow it there.

Every write goes through the `flowboard` MCP (`story_*`, `subtask_*`, `epic_*`, `pr_*`, `project_show`). Each call enforces the ladder, the assignee rule and the Run trail, so this skill never restates them. **Never write with raw SQL** (`flowboard-db` `write_query`): it skips those rules and leaves no trail. Raw SQL is for reads only. When the MCP isn't loaded, the same operations are on `flowboard-cli` (`flowboard-cli story move FB-12 refining`; `--help` lists them).

## 1. Resolve the project

1. Read `.claude/factory.json` at the repo root. Its `boardKey` is the only accepted source of the project key. When it is a list, the Story key you were given picks one of them. When nothing does, ask.
2. Call `project_show` for that key. A `legacy` ladder means the project hasn't adopted the Factory: stop and say so; don't fall back to SQL.

No `factory.json`, no key, or an unknown key: stop and ask. Never infer the project from the folder name or the conversation.

## 2. The ladders

**Story**: `backlog → refining → ready → building → integrated_tests → tested → (user_testing) → done`, plus `canceled` from anywhere before `done`.

| Status | Means | Who moves it on |
|---|---|---|
| `backlog` | A real demand, not yet refined | Pedro |
| `refining` | Brief being written, Subtasks split | Pedro |
| `ready` | Plan approved, waiting for a Run | Pedro |
| `building` | Build and Integrate | Agent |
| `integrated_tests` | Pedro tests it on the integration branch | Pedro |
| `tested` | Passed, waiting to be picked into a Release | Pedro |
| `user_testing` | Client projects only: its Release is with the client | Client contact |
| `done` | In production | |

Backward moves exist for rework: `integrated_tests`, `tested` and `user_testing` go back to `building` when a bug Subtask is filed.

**Subtask**: `todo → in_progress → done`, plus `canceled`. `done` means it passed Verify.

The assignee is set by the move itself. Don't set it.

## 3. Operations

| Job | Call |
|---|---|
| See a Story (status, Subtasks, branch, PRs, flags) | `story_show` |
| New Story (always enters `backlog`) | `story_create` with `project`, `title`, `description` (the full brief), `labels` |
| Rewrite the brief | `story_edit` with `description`: it replaces the whole text, so send all of it |
| Move a Story | `story_move` |
| Put a `ready` Story in a sprint (needed before `building`) | `story_set_sprint` |
| Split a Story | `subtask_create` per Subtask, with `story_points` and `risk` when known |
| Move a Subtask | `subtask_move` |
| File a bug found while testing | `subtask_create` with `bug: true`, then `story_move` back to `building` |
| Depends on another Story | `story_link` |
| Start a Review round (lights Code review on the Run graph) | `review_start` |
| File a defect found in production (a bug Story, enters `backlog`) | `story_create` with `bug: true` |
| New epic (a goal grouping several Stories; starts open at `todo`) | `epic_create` with `project`, `title`, `description`, `labels` |
| Close or cancel an epic (`todo → done` or `canceled`, no reopening) | `epic_move` |
| Put a Story in an epic, or take it out | `story_edit` with `epic`: an open epic's key, or `null` to take it out |

An epic is never built: it has no Subtasks, sprint, points or Run. A `done` or `canceled` Story's epic can't change.

Briefs are complete: a Story's description is the only thing handed to the next Stage, so it carries the goal, the definition of done and links to any spec, ADR or prototype. A Subtask's detail lives in the Story's description too; its own description names the slice and who builds it.

## Refused moves

A refused call returns the reason and changes nothing (open Subtasks, not in a sprint, Run stopped, wrong project kind). **Report the reason; never work around it**: no raw SQL, no moving through a different path, no cancelling Subtasks just to unblock a move. The refusal is the rule doing its job.

## Guardrails

- Nothing is deleted: dropped work is `canceled`.
- Read back after writing: report each key and its resulting status from the call's result.
- Windows: keep any scripted output ASCII-only.
