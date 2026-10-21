---
name: split
description: Split a refining Story into Subtasks for its Run - the task-splitter agent proposes each Subtask with its builder, estimate, risk and definition of done; Pedro edits and approves; then the Subtasks and the Story's plan are written to the board. Use when a Story in refining needs its Subtasks, or the user asks to split, plan or break down a Story.
---

# Split: a Story's plan for its Run

The Plan Stage's split. Its input is a Story in `refining`. Its output is the Story's Subtasks on the board, each naming the agent that builds it, and a `## Plan` section in the Story's brief carrying each Subtask's definition of done. The Orchestrator (`factory:run`) hands Subtasks to agents in that order and QA Verifies each one against that section, so nothing in the plan may be left for the Run to guess.

Board writes go through the `factory:story-status` skill's interface (the `flowboard` MCP); its project resolution (step 1 there) holds here too.

## 1. Check the Story

`story_show` the Story.

- It must be in `refining`. In `backlog`, ask Pedro whether to move it to `refining` first; anywhere else, stop and say where it is.
- **It already has open Subtasks**: show them and ask Pedro whether to split only what they don't cover, or to replace them (cancel the old ones with `subtask_move` to `canceled`). Never cancel on your own.

## 2. List the builders

The builders a Subtask may name are `implementer` plus the project's Specialists that follow the Specialist contract (`docs/specialists.md` in the Factory repo: frontmatter `name`, `description`, `model` as an alias, and `## Scope` and `## Definition of done` sections):

```
node "<this skill's base directory>/../../scripts/check-specialists.mjs"
```

The base directory is the one shown when this skill loaded; the script ships in the same plugin. Run it from the project's repo root.

Each `ok` line is an eligible Specialist. Read each one's `description` from `.claude/agents/<name>.md`. Mention the failing ones to Pedro in one line (they can't be handed Subtasks until they follow the contract), but don't stop for them.

## 3. Ask the Task splitter

Delegate to the `factory:task-splitter` agent, on opus unless `factory.json` overrides it (`agents.task-splitter.model`; see `factory:run`). Hand it the Story key, the full brief, and the eligible builders with their descriptions. It reads the repo and returns a `## Split`, `## Brief changes` and `## Open questions` block.

Check its result before showing it: every Subtask names an eligible builder, has points, a risk line and at least one "done when" item. Send it back with what is missing rather than patching it yourself.

## 4. Pedro approves

Show the split as a table (order, title, agent, points, risk), then each Subtask's slice and "done when", then the brief changes and the open questions.

Pedro edits it: reorders, merges, reassigns, rewords, answers the questions. Apply the edits and show the result again. **Write nothing until Pedro approves the split**, and nothing while an open question is unanswered: an answer usually changes the brief, and sometimes the split.

## 5. Write it

In this order, so the plan can name the keys:

1. `subtask_create` per Subtask, in build order: `title`, `story_points`, `risk`, and a `description` that names the builder on its first line and the slice after it:

   ```
   agent: <builder>
   <slice>
   ```

   A risk flag's reason goes in the description too, after the slice.
2. `story_edit` the Story with its full brief: the current description, the approved brief changes, and a `## Plan` section at the end (replacing any earlier one). `story_edit` replaces the whole text, so send all of it.

   ```
   ## Plan

   ### <SUBTASK-KEY> <title>
   - agent: <builder>
   - done when:
     - <observable fact>
   ```

## 6. Hand over

Read back with `story_show` and report each Subtask key with its agent and points. Then ask Pedro whether the plan is approved to move the Story to `ready`. On a yes, `story_move` it there and remind him it needs a sprint (`story_set_sprint`) before `factory:run` can start.

## Guardrails

- The Task splitter proposes and you write; neither invents what the brief leaves open. Unanswered means unwritten.
- Never create a Subtask for tests or docs alone: tests ride with each Subtask, and the Docs agent runs once per Story inside the Run.
- A refused board call is reported, never worked around (see `factory:story-status`).
