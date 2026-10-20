# Bot account

The machine account the Factory's agents work as on GitHub (see [GitHub conventions](../spec/issues/06-github-conventions.md)). Set up 2026-10-20 in phase 0.

| | |
|---|---|
| Account | `pmattos-pr-review-agent` |
| Commit identity | `pmattos-pr-review-agent` / `345377693+pmattos-pr-review-agent@users.noreply.github.com` |
| Token | Classic, scopes `repo`, `read:org`, `workflow`, stored in the `gh` keyring on Pedro's machine (`gh auth token -u pmattos-pr-review-agent`) |
| Repo access | Collaborator with write (no admin): `pmattos87/flowboard`. Other repos are added when they adopt the Factory. |
| Approver | `pmattos87` (Pedro), which stays the active `gh` account |

**Why a classic token.** A fine-grained token can only target repos owned by its own account or an organization, so the bot can't scope one to Pedro's personal repos. A token created on Pedro's account acts as Pedro, which defeats the separate identity. The classic token's reach is still limited to the repos the bot is a collaborator on.

**Noreply email, not the Proton alias.** It keeps the alias out of commit history and can't be rejected by the account's email-privacy settings.

**Note for phase 2:** `pmattos87/flowboard` is public, and GitHub Free allows branch protection and rulesets on public repos. The pilot could use real enforcement instead of the hook-only interim.
