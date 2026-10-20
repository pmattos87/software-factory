# Skills consolidation

Type: grilling
Status: resolved
Blocked by: 01, 02
Assignee: Pedro

## Question

Using the inventory, decide for each existing skill: keep as-is, move into the Factory, merge with another, rewrite, or drop — and which skills are not Factory concerns at all (e.g. second-brain skills like ingest, reconcile, standup).

## Comments

- **From Agent roster (2026-10-20):** `ship` must be adapted: it opens the PR only after Review passes and picks its target branch by Stage. Agents now live in the Factory as Role agents plus a Specialist contract.

- **From Hooks (2026-10-20):** a Factory secret-scan hook now blocks commits that contain a secret, so `ship`'s own scan is redundant. The user-level vitest-related hook becomes a project-level hook for vitest projects.

## Answer

Resolved 2026-10-20 with Pedro.

**Rule.** A skill moves into the Factory only if a Workflow Stage depends on it. Every Factory skill gets a **new name, after the job it does in the Workflow** (never the original's name, even behind the plugin's prefix). The user-level original stays untouched and keeps working outside Consumer projects; **inside a Consumer project the original is switched off**, so only one version of each job runs there. Actual names are chosen in the build phase.

| Skill | Verdict |
|---|---|
| `grilling`, `domain-modeling`, `wayfinder`, `research`, `prototype` | **Copied into the Factory under new names**, pinned to the Factory's version: the Shape tools |
| `ship` | **Rewritten** as the Integrate skill: commits and a PR to the integration branch, only after Review passes; no secret scan of its own (the hook does it) |
| `release` | **Rewritten** as the skill that promotes a Release into User testing or Production: PR to that Stage's branch, version, tag, GitHub release; stack-specific build steps (Tauri installer, extension manifest) go to per-project configuration |
| `flowboard-issue` | **Rewritten** as the one way to move a Story's status: the new ladder, board key from per-project configuration; details wait for Flowboard integration |
| `release-notes` | **Moved and generalized** as part of User testing for Client projects; client, language and staging URL from per-project configuration |
| `standup`, `ingest`, `reconcile`, vault `lint`, Anthropic synced skills, Cowork plugins, `understand-anything` | **Not Factory concerns**: left as they are |
| The 13 disabled Matt Pocock skills | **Dropped**: stay off, not shipped; the Role agents may borrow ideas when built |
| `planning` (synced) | **Dropped** from the Workflow and switched off in Consumer projects (it competes with Shape) |

**Gaps, named but not designed here:** a skill to start a Run (the Orchestrator's entry point), one to send a Story to the Task splitter, and possibly one to mark In integrated tests as passed.
