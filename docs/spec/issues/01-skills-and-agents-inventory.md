# Skills and agents inventory

Type: research
Status: resolved
Blocked by: —

## Question

What skills, agents, hooks and slash commands exist today across `~/.claude/` and each consumer project's `.claude/` (Flowboard, Viagem Pronta, Fintracks, Atlas CRM, Hammer Loc)? For each: what it does, where it lives, which projects use it, and where it overlaps or conflicts with another. Facts only — no keep/drop verdicts (that's "Skills consolidation").

## Answer

- **User level** (`~/.claude`): 24 own skills (13 Matt Pocock skills switched off), 1 hook (`PostToolUse` vitest-related runner), no agents, no slash commands, empty `CLAUDE.md`.
- **Projects** define agents only (no skills, hooks or commands). Flowboard's 7-agent roster is copied by name into Fintracks and Atlas CRM (folder `Internal CRM`), and most of it into Hammer Loc and Viagem Pronta. The bodies differ, models differ (`data-layer`/`frontend-design` are swapped in Hammer Loc), and the registry model IDs don't match the frontmatter.
- **CLAUDE.md**: one shared template copied with drift. Integration branch is `develop`, `dev`, or none depending on the project; there are 4 branch-naming patterns, and the deny lists only protect `dev`.
- **Skill/project mismatch**: `ship` targets the default branch, but Hammer Loc and Fintracks need `develop`. `flowboard-issue` works only where CLAUDE.md declares a board key (Hammer Loc only), and `reconcile` skips Hammer Loc and Atlas.

Full inventory: [research/skills-and-agents-inventory.md](../research/skills-and-agents-inventory.md)
