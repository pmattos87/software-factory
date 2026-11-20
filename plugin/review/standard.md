# Factory review standard

How a Story's Review is done, whoever does it. Codex is the reviewer today. This file says what to look at and what counts as blocking; the request that starts a Review says which Story, which commits and where to answer.

Review comes once per Story, after every Subtask has passed Verify and before the PR into the integration branch. It reads the **whole Story diff** (`<base>..<head>`), not one Subtask. Verify already ran the project's Gates on every Subtask, so Review doesn't re-run them; it looks for what Gates and a per-Subtask check can't see.

## Inputs

The request gives you:

- the Story key and its brief: intended behavior, acceptance criteria, exclusions, and for a lifecycle Story its `## Lifecycle` section (states, how each is decided, transitions);
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
8. **Is every state explicit?** See [State](#state). Only for a lifecycle the diff adds or touches.

## State

**The rule: a lifecycle is an explicit state machine.** When an entity or flow behaves differently depending on where it is in a lifecycle (open, returned, canceled, paid, held, overdue), its states have one definition, each transition is written in one place, and an illegal transition is refused. This is a written rule of the standard: a defect against it can be blocking, not only a structural suggestion.

**Explicit is not stored.** A state may be derived at read time; many projects forbid storing a status at all. What the rule asks is that each state be derived by **one shared definition** (a function, a view, a SQL fragment) that every reader uses. Follow the project's own rules: in a project that forbids stored status, never ask for a status column.

A diff adds or touches a lifecycle when it writes or reads the columns, flags or stamps a lifecycle depends on, adds a transition, or adds a reader that decides a state. A migration that creates or changes those columns counts: its constraints are where checks 3 and 4 are kept or lost. A rule stated only in a comment, a doc or an ADR is not a constraint. When the brief has a `## Lifecycle` section, the code matches it: a state or transition the code has and the section doesn't is a finding. For each lifecycle, check:

1. **One definition.** Each state is decided in one place that every reader uses. A new reader that re-derives the state itself (its own `WHERE`, its own date comparison, its own `if` chain) is a finding, even when it agrees with the definition today.
2. **One place per transition.** Each transition is performed by one command or function, with its guards next to it, not scattered across several commands. A transition that the lifecycle doesn't allow is refused, not silently applied.
3. **No meaning in a value's shape.** No column carries meaning by its format or length (a bare date meaning one thing and a datetime another, an empty string meaning "not yet"). Any writer, a hand fix or a later command, can produce the other shape by accident, and no reader can tell.
4. **No pair that must agree on trust.** Two columns that must agree (a quantity and its stamp, a flag and its date) have a constraint or are written together by the one transition; nothing else can write one without the other. Watch for one stamp standing for several events (a quantity that grows over several partial returns, with one date for the last): every event but one loses its date, and whatever reads the date for the others reads wrong.
5. **No effect written elsewhere and undone by matching.** A state written onto another row (a predecessor, a parent) and later undone by matching values is a finding: the undo can't tell that effect from a human's write of the same value.
6. **Dates compare as dates.** A predicate with an implicit "today" compares dates, not text, gets the same-day boundary right (held until the end of the last day, not midnight before it, or as the brief says), and takes "now" from one place.
7. **A state that flips from another entity's action** (a cancel on one row reopening another) is named in the brief or in the code that performs it, not a side effect a reader would have to discover.
8. **Tests** cover at least one refused transition, and for 6 the boundary day.

**Blocking or a suggestion.** A State finding is blocking with the usual trigger, impact and evidence: here the trigger is a concrete sequence of actions or data that reaches a contradictory or illegal state (two readers disagreeing on the same row, a transition the lifecycle forbids, a pair of columns that disagree), and the impact is what the user then sees or loses. A pattern above without such a sequence is a suggestion. **Report every pattern the diff matches**, blocking or as a suggestion; don't drop one because the diff has other findings or because the code documents it. Name each lifecycle you checked in the summary. An implicit state machine the diff doesn't touch is not a finding for this Story (check 6).

## Blocking or not

A finding is **blocking** when the Story would ship a defect, break a rule the project wrote down, or leave an acceptance criterion unmet. Each blocking finding states:

- **trigger**: the input, state or sequence that makes it go wrong;
- **impact**: what goes wrong, and for whom;
- **location**: file and line (or symbol);
- **evidence**: the code that shows it, a command you ran and its output, or the rule it breaks, quoted.

No trigger or no evidence means it isn't blocking: list it as a suggestion. Style, naming, structure and "I'd have done it differently" are suggestions unless a written rule makes them more: the project's, or this standard's own (the [State](#state) rule is one). Suggestions never fail a Review.

## Verdict

- **passed**: no blocking findings.
- **failed**: one or more blocking findings.

The verdict covers the head commit you reviewed and nothing after it. A new commit needs a new Review.

**An incomplete Review is never a pass.** If you couldn't review part of the diff, or couldn't check an acceptance criterion (missing access, a command you couldn't run), say so under limits. If what you couldn't check leaves a criterion unproven, that is a blocking finding.

**Except a check that needs the running app.** Looking at the app by eye (dark mode, a layout at a screen size, a flow clicked through on staging) happens after Integrate, when the Story is in `integrated_tests` and runs on staging; it is never a Review finding. List it under limits as "for testing on staging", judge what the code and tests can show, and don't block on the rest (Pedro, 2026-11-15).

## Later rounds

From round 2, the request carries your previous findings and a response to each. For every previous blocking finding, say whether it is **resolved**, **unresolved** or **regressed**, after checking the new commits, not the response. Then review what changed since the last round for new defects. A finding you could have raised in round 1 on unchanged code is only blocking if it meets the bar above. Don't hold it back for later, and don't invent it now.

## Rules

- **Never change the repo**: no edits, commits, branch switches or checkouts. Read files and run read-only commands only.
- Judge the diff against the brief and the project's rules, not against a better Story you'd have written.
- Be specific. The builders only see your findings, and a finding they can't act on costs a round.
