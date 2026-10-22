# Factory review standard

How a Story's Review is done, whoever does it. Codex is the reviewer today. This file says what to look at and what counts as blocking; the request that starts a Review says which Story, which commits and where to answer.

Review comes once per Story, after every Subtask has passed Verify and before the PR into the integration branch. It reads the **whole Story diff** (`<base>..<head>`), not one Subtask. Verify already ran the project's Gates on every Subtask, so Review doesn't re-run them; it looks for what Gates and a per-Subtask check can't see.

## Inputs

The request gives you:

- the Story key and its brief: intended behavior, acceptance criteria, exclusions;
- the repo, the Feature branch, and the exact base and head commits;
- each Subtask with its Verify result, including what Verify could not check;
- the round number, and from round 2 on, the previous findings with the builders' response to each.

Read the project's `CLAUDE.md` and every ADR or spec the brief links. They are the rules the diff is held to.

## What to check

1. **Does it do what the brief says?** Each acceptance criterion is met by the diff, and nothing listed under exclusions was built. A criterion with no code or test behind it is unmet.
2. **Is it correct?** Logic errors, unhandled cases, wrong edge behavior, races, broken invariants, wrong data written. Follow the change into its callers: a correct function called wrongly is still a defect.
3. **Is it safe?** Injection, secrets in code or logs, missing authorization, unsafe file or shell use, data loss (destructive migrations, deletes, overwrites without a path back).
4. **Does it keep the project's rules?** `CLAUDE.md`, the linked ADRs, the domain language in `CONTEXT.md`, the existing patterns of the surrounding code.
5. **Are the tests real?** Each new behavior has a test that would fail without it. Tests that assert nothing, mock the thing under test, or only cover the happy path of an ADR's edge cases don't count.
6. **Is it in scope?** Changes the brief doesn't call for, such as refactors, renames or unrelated fixes, are findings even when they're good. They belong in their own Story.
7. **Are the docs current?** If behavior changed, so did the docs that describe it (changelog, README, the project's working documents).

## Blocking or not

A finding is **blocking** when the Story would ship a defect, break a rule the project wrote down, or leave an acceptance criterion unmet. Each blocking finding states:

- **trigger**: the input, state or sequence that makes it go wrong;
- **impact**: what goes wrong, and for whom;
- **location**: file and line (or symbol);
- **evidence**: the code that shows it, a command you ran and its output, or the rule it breaks, quoted.

No trigger or no evidence means it isn't blocking: list it as a suggestion. Style, naming, structure and "I'd have done it differently" are suggestions unless a written project rule makes them more. Suggestions never fail a Review.

## Verdict

- **passed**: no blocking findings.
- **failed**: one or more blocking findings.

The verdict covers the head commit you reviewed and nothing after it. A new commit needs a new Review.

**An incomplete Review is never a pass.** If you couldn't review part of the diff, or couldn't check an acceptance criterion (missing access, a command you couldn't run), say so under limits. If what you couldn't check leaves a criterion unproven, that is a blocking finding.

## Later rounds

From round 2, the request carries your previous findings and a response to each. For every previous blocking finding, say whether it is **resolved**, **unresolved** or **regressed**, after checking the new commits, not the response. Then review what changed since the last round for new defects. A finding you could have raised in round 1 on unchanged code is only blocking if it meets the bar above. Don't hold it back for later, and don't invent it now.

## Rules

- **Never change the repo**: no edits, commits, branch switches or checkouts. Read files and run read-only commands only.
- Judge the diff against the brief and the project's rules, not against a better Story you'd have written.
- Be specific. The builders only see your findings, and a finding they can't act on costs a round.
