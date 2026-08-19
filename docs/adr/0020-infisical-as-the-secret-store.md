# ADR 0020 - Infisical as the secret store, with secrets injected rather than filed

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** -
**Superseded by:** -

## Context

`architecture.md` section 16 already says secrets belong in a managed store and never in the repository. It does not say which store, or how a secret reaches a process. Without that, the default happens instead: every developer keeps a `.env.local`, the copies drift, and one of them eventually gets committed.

Three things make that default worse than usual here.

The repository is public (ADR 0019), so a committed credential is public the moment it lands, and rewriting shared history does not unpublish it. The product holds third-party customer data under Ghana's Data Protection Act, so a leaked database URL is a reportable event rather than an inconvenience. And the credentials themselves carry real cost: a WhatsApp provider token can send messages that are billed per conversation.

There is also a second consumer of secrets that a `.env` file serves badly. The Notion MCP server needs a token in the environment of the Claude Code process itself, not in the environment of the application.

## Decision

**Infisical holds every non-public value, and processes receive secrets by injection at launch.**

- Secrets are grouped per environment in Infisical (`dev`, later `staging` and `prod`). Nothing is the source of truth on a developer machine.
- Processes are started under the injector: `infisical run --env=dev -- pnpm dev`, and `infisical run --env=dev -- claude` so the MCP server inherits `NOTION_TOKEN`.
- `.env.example` is the **contract**: it names every variable and explains what each is for, and holds no values. It stays committed and reviewed.
- `.mcp.json` is committed and secret-free. Credentials appear only as `${VAR}`, expanded from the launching environment.
- `.infisical.json`, which records which Infisical project this directory maps to, is committed. It contains identifiers, not secrets.
- **Secret scanning is a gate, not a habit.** `infisical scan git-changes --staged` runs in the `pre-commit` hook, and `infisical scan` runs over full history in CI as gate G14. Both use `--redact`, because printing a detected secret into a public build log is itself the leak.
- A local file is permitted only as a deliberate, temporary export (`infisical export --env=dev > .env.local`), which `.gitignore` already blocks.

## Consequences

**Positive:** one place to rotate a credential, and rotation takes effect without asking anyone to edit a file. Onboarding a machine becomes `infisical login` then `infisical init` rather than a private message containing secrets. The MCP server and the application draw from the same source, so there is one story rather than two. And G14 catches a credential that slipped past the hook, including in a branch that was rewritten to hide it.

**Negative / cost:** every command that needs a secret gains a wrapper, which is friction and easy to forget. Worse, forgetting it produces a confusing failure: the app reports `DATABASE_URL is not set` rather than "you forgot `infisical run`". Local development now depends on Infisical being reachable, so an outage or an expired login blocks work until someone exports a file. The CLI has to be installed before onboarding can start, and `infisical init` is interactive, so it cannot be scripted into a setup task.

**Rejected alternatives:** a committed `.env` with placeholder values that everyone edits locally, which is the default this ADR exists to prevent, and which the public repository makes indefensible. GitHub Actions secrets alone, which solve CI and do nothing for local development or for the MCP server. 1Password, Doppler, and HashiCorp Vault, all of which would work; Infisical wins on the unexciting ground that it is already installed and already authenticated on this machine, and its CLI ships the secret scanner we wanted anyway.

## Enforcement

CI gate G14 (`infisical scan`), the `pre-commit` hook in `lefthook.yml`, `.gitignore` rules for `.env*`, and the review checklist line forbidding a secret in code, config, or test fixture. `.env.example` carrying no values is visible in review.
