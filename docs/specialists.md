# Specialists

A Specialist is an agent a Consumer project defines for work bound to its own stack (PDF documents, Supabase, the board UI). The Factory ships the stack-agnostic Role agents; a project adds Specialists so a Run can hand them the Subtasks inside their scope. Why the split: [Agent roster](spec/issues/03-agent-roster.md).

The content is the project's. This contract fixes only what the Task splitter and the Orchestrator rely on.

## The contract

A Specialist is a Markdown file `.claude/agents/<name>.md` with:

| Part | Rule |
|---|---|
| `name` | Same as the file name, kebab-case. Not a Role agent's name (`task-splitter`, `implementer`, `qa`, `docs`). |
| `description` | One or two sentences on what the Specialist builds. The Task splitter reads it to decide who builds a Subtask, so it names the scope, not the stack. |
| `model` | An alias: `opus`, `sonnet` or `haiku`. Never a pinned model ID. |
| `tools` | Optional. Leave it out to inherit every tool. |
| `## Scope` | What the Specialist owns: areas, files, kinds of change. And what it doesn't, when the line is easy to cross. |
| `## Definition of done` | What holds when its work is finished, beyond the project's Gates. QA checks these items at Verify. |

Anything else in the body (stack rules, pitfalls, examples) is up to the project. Project knowledge that every agent needs belongs in the project's `CLAUDE.md` and ADRs, not in a Specialist.

```markdown
---
name: board-ui
description: Builds the board screens - columns, cards, drag and drop and their dialogs.
model: sonnet
tools: Read, Edit, Write, Bash, Grep, Glob
---

# Board UI

## Scope
`src/components/board/` and the hooks it uses. Not the data layer: a change to a Tauri command goes to `implementer`.

## Definition of done
- Dark mode uses tokens, never hex.
- Keyboard navigation reaches every new control.
- Drag and drop has a test.
```

## What a Run adds

A Specialist doesn't repeat the Run's rules. When the Orchestrator hands it a Subtask, the handoff carries the same rules the [Implementer](../plugin/agents/implementer.md) follows: build only that Subtask, with its tests; run scoped checks (the tests that cover the change, and the type check when TypeScript changed), not the full Gates, which QA runs at Verify; write each check's full output and exit code to `$(git rev-parse --git-path factory/logs/<KEY>)/<subtask-key>-<specialist-name>-<round>.log` before filtering it, and name that log and the failing tests in a failure; never commit, push, switch branches or touch the board; never weaken a test or a Gate; end with the Implementer's `## Result` block.

A Specialist's own file, or the project's `CLAUDE.md`, that tells builders to run the full Gates (a definition of done such as "all Gates pass", a testing section asking for the whole suite) works against this: the builder pays for a full Gate cycle QA repeats anyway. Align them with the scoped-checks rule.

## Checking

```
node <factory>/plugin/scripts/check-specialists.mjs [--run] [name...]
```

Run from the project's repo root, it checks every agent in `.claude/agents/` (what `split` offers), or with `--run` only the named ones, possibly none (what a Run hands work to). Both also check the `agents` tier overrides in `factory.json`. It exits 1 when anything fails. The Task splitter offers only Specialists that pass, and a Run checks the Specialists its Subtasks name before it starts. An agent that doesn't follow the contract stays usable in hand-driven work; it just isn't handed Subtasks in a Run.
