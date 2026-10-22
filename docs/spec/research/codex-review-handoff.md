# Codex Review handoff

> *Resolved 2026-10-22 (phase 5, SF-6).* The transport is **`codex exec`**, headless and synchronous: read-only sandbox, `--output-schema` with [verdict.schema.json](../../../plugin/review/verdict.schema.json), round 2 by `codex exec resume <session>`. It replaces `codex queue`, so there are no conversation IDs, return addresses or acknowledgements. *Unavailable* means codex is missing, exits non-zero, times out, or gives no usable verdict. The shared standard is [plugin/review/standard.md](../../../plugin/review/standard.md). Findings are a comment on the Story. A failed round 1 becomes a bug Subtask. What's below is the input that led there.

Input for the **Codex hookup** item under *Not yet specified* on the [map](../map.md). Design notes from Pedro's conversation with Codex about its role as the Review agent, filed 2026-10-20. Only the model/effort choice is decided; the transport was tested once; everything else is a recommendation, not yet implemented.

## Model and effort — decided

GPT-6 Astra (`gpt-6-astra`) at High reasoning effort (`high`) for every Review, including re-reviews of fixes.

## Claude → Codex transport — tested once

Claude delivers a message into an existing Codex conversation from PowerShell:

```powershell
codex queue --thread "<Codex conversation ID>" --message "<handoff message>"
```

If `codex` is not on PATH, call the installed `codex.exe` by full path with PowerShell's `&` operator. (The map notes no `codex` CLI on the shell PATH, so expect the full-path form.)

- Worked in the 2026-10-09 session: Claude sent a test message and Codex acknowledged it.
- Claude's own session list cannot discover Codex, so the Codex conversation ID must be given explicitly.
- Return path: Claude's local messaging inbox. Every handoff carries the current Claude session's return address.
- Resolve session identifiers fresh for each Run; never reuse the old test IDs.
- `codex queue` only delivers a message. It does not set the reviewer's model or effort; configure the destination Codex session separately.

## Existing review instructions

Codex read two local definitions:

- Engineering plugin `engineering/skills/code-review/SKILL.md`: security, performance, correctness, maintainability; verdict Approve / Request Changes / Needs Discussion.
- Official Claude plugin catalog `code-review/commands/code-review.md`: PR-oriented, multiple Claude agents, confidence scoring, GitHub comments.

Codex can read these files, but they are not registered as Codex skills. Recommendation: write one **shared Factory review standard** both agents can read, with the communication instructions kept separate. Strip Claude-specific model names, tools and PR assumptions when adapting.

## Handoff contract — proposed

The Story stays the canonical handoff. It contains or links to:

- Intended behaviour, acceptance criteria, exclusions.
- Repo location, branch, exact base and head commit IDs.
- Relevant specs, ADRs, project rules.
- Implementation summary, dependencies, affected areas.
- Verify results tied to the reviewed commit, including what went unverified.
- Reproduction steps and test fixtures where needed.

Each request names the Story, Run, review attempt, Codex conversation and Claude return address. Codex must acknowledge receipt, and the final Review result is persisted on the Story.

## Review and correction loop — proposed

1. Review the completed Story **before Integrate**. (Codex's notes say an earlier diagram placed Review after merging; the Factory has since settled on Review before the PR — see [Agent roster](../issues/03-agent-roster.md) and CONTEXT.md — so this is already consistent.)
2. Codex returns: reviewed commit, verdict, findings, verification limits. A **blocking** finding states its triggering condition, impact, code location and evidence; optional suggestions are listed separately.
3. Claude fixes and submits the new commit with a response to each finding.
4. Codex verifies the fixes and checks for regressions.
5. Approval applies only to the reviewed commit. An incomplete Review never counts as approval.

When several Stories share a branch (a batch), each Story's changes and prerequisites are identified explicitly so unrelated work isn't swept into its approval.

## To reconcile when the Codex hookup is designed

- The [Agent roster](../issues/03-agent-roster.md) 2-round stop applies to this loop: after 2 rejected rounds the Run stops for Pedro.
- Review "waits" when Codex is unavailable (no Claude fallback) — define what *unavailable* means given the acknowledgment requirement.
- Where the shared review standard lives in the Factory plugin, and how the Codex session gets pointed at it.
- How the Orchestrator obtains the Codex conversation ID and its own return address per Run.
