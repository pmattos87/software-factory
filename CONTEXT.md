# Software Factory

A versioned kit of skills, agents, hooks and templates that every one of Pedro's projects installs, plus a UI to follow work as it moves through it.

## Language

**Factory**:
This repo's product: the single, versioned source of the workflow and everything that drives it, installed into each project as a Claude Code plugin.
_Avoid_: toolkit, setup, config

**Workflow**:
The process definition: the ordered stages work goes through, from a decision to a client's install.
_Avoid_: pipeline, process

**Stage**:
One step of the Workflow, with a defined input and output.
_Avoid_: phase, step

**Story**:
One unit of work on Flowboard whose description is the complete brief; the only thing handed from one Stage to the next, with ADRs, specs and PRs linked from it.
_Avoid_: ticket, issue

**Subtask**:
A sub-unit of a Story, such as a slice of the build or a bug found while testing. A Story moves forward only when all its Subtasks are done. A Subtask has no Run of its own: its work happens inside its Story's Run, and its details live in the Story's description.
_Avoid_: task, bug story, ticket

**Release**:
A set of Stories promoted together past Integrate (into User testing or Production), carrying one version number.
_Avoid_: drop, build

**Feature branch**:
The git branch of one Story, cut from the production branch and named after the Story's type (feat, fix, docs…); its bug Subtasks are fixed on it too. Released by merging it into a Release branch.
_Avoid_: story branch, phase branch

**Integration branch**:
The branch where every Feature branch is merged for In integrated tests; a testing ground that is never merged into production.
_Avoid_: dev, staging

**Release branch**:
The branch a Release is assembled on: cut from production, with the picked Feature branches merged in. For Client projects it is also where User testing happens.
_Avoid_: test branch, user testing branch

**Run**:
One Story's trip through the Workflow. Several Runs may share a branch (a batch); a group of Stories (a sprint or label) is not a Run.
_Avoid_: workflow instance, execution, job

**Role agent**:
An agent the Factory ships, defined by its job in the Workflow rather than by any stack; identical in every Consumer project.
_Avoid_: generic agent, core agent

**Specialist**:
An agent a Consumer project defines for work bound to its own stack (e.g. PDF documents, Supabase).
_Avoid_: project agent, custom agent

**Agent**:
Any AI worker (Claude, Codex…) as opposed to a human; the assignee of a Story while it is being built. Not a specific Role agent or Specialist.
_Avoid_: bot, AI

**Orchestrator**:
The Claude Code session Pedro triggers to drive one Run from Build to Integrate. It hands each Subtask to an agent, calls Verify and Review, and opens the PR; it never builds anything itself.
_Avoid_: main agent, coordinator

**Verify**:
The check that one Subtask is done: the project's gates (typecheck, lint, tests) pass and the definition-of-done items no command can check hold. Done per Subtask, by the QA Role agent.
_Avoid_: QA pass, test step

**Gates**:
A project's own automated checks (typecheck, lint, tests) that must pass before a Subtask passes Verify and before a PR is opened.
_Avoid_: checks, CI (when the project's commands are meant)

**PR checks**:
The checks that run on a clean machine against every PR: the Gates plus build, secret scan and conventions, varying by target branch. All must be green before a merge.
_Avoid_: CI, gates (when the PR's checks are meant)

**Review**:
The code review of a whole Story's diff by Codex, after every Subtask has passed Verify and before Integrate; a PR is opened only once Review passes.
_Avoid_: QA, code review gate

**Consumer project**:
A project that installs the Factory and runs its workflow (e.g. Hammer Loc, Fintracks). Declared at creation as either an Internal project or a Client project.
_Avoid_: target repo

**Internal project**:
A Consumer project used only by Pedro; its Workflow has no User testing Stage.

**Client project**:
A Consumer project built for outside users; its Workflow adds the User testing Stage between In integrated tests and Production.
