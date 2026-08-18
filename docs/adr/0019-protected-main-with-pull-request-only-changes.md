# ADR 0019 - Protected main, pull-request-only changes, and local hooks

**Status:** Accepted
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The gates in `docs/engineering-guardrails.md` were, until now, advice. CI ran them, but nothing stopped a direct push to `main` that ignored the result - and during the first days of this repository every change was pushed straight to `main`, including several that were red at the time. A gate nobody has to pass is a suggestion.

The obstacle was mechanical rather than philosophical: branch protection is not available for private repositories on GitHub's free plan, and the repository was private. The alternatives were a paid plan, splitting the strategy documents out so the code could be public, or making the whole repository public. The third was chosen with the commercial content - pricing, go-to-market, the named distribution partner, and the candid gap analysis in `product-spec.md` section 13 - understood to be public as a consequence.

There is also a team-size problem. Requiring an approving review is the obvious rule, but with a single maintainer it makes `main` unmergeable: nobody can approve their own pull request.

## Decision

**`main` is protected. Every change arrives through a pull request, including the maintainer's.**

Server side:

- The four CI jobs are **required status checks**, with **strict mode** on - a branch must be up to date with `main` before merging, because a green check against a stale base proves nothing.
- **Administrators are included.** A rule the owner can skip is a suggestion with extra steps.
- **Linear history**, squash merge only, branch deleted on merge.
- **Force pushes and deletions blocked**; **review conversations must be resolved**.
- **Required approvals: 0**, and code-owner review off. This is the single compromise, and it is temporary - see Consequences.

Local side, via lefthook:

- `commit-msg` validates Conventional Commits and **rejects agent or tool co-authorship trailers**, so commits carry their human author without anyone having to remember.
- `pre-push` runs the boundary, invariant, and contrast checks.
- Both are stdlib Python, so they work before `pnpm install` has ever run, and they survive a change of JavaScript toolchain.

Dependency updates are monthly and grouped rather than daily and individual.

## Consequences

**Positive:** the gates became real on the day this landed. Failures now surface before a push rather than after a merge, and the fast checks run in about a second locally. Making the repository public also removes the CI minutes constraint entirely.

**Negative / cost:** the strategy documents are public and cannot be unpublished - forks and caches make that irreversible. Every change now costs a branch and a pull request, which is friction the maintainer did not have yesterday. And **required approvals sitting at zero means no second pair of eyes is enforced today**; the human gates G11 and G12 rest on self-discipline until a second developer joins, at which point the count rises to one and code-owner review turns on. That is a deliberate, dated compromise rather than a permanent position - it is recorded here so it is not quietly forgotten once the team grows.

**Rejected alternatives:** GitHub Team at roughly four dollars per user per month, which keeps the strategy private and was the recommendation on cost-benefit grounds; splitting `docs/` into a private repository, which breaks the ADR-to-scope cross references and the invariant coverage tool that parses `architecture.md` at runtime; and leaving `main` unprotected with discipline as the control, which is what the first days of this repository already demonstrated does not hold.

## Enforcement

The protection rules themselves, applied through the GitHub API and documented with their reasons in `docs/engineering-guardrails.md` section 8. `lefthook.yml` for the local hooks, and `tools/check_commit_message.py` for the message contract. Gate G2 requires this ADR to accompany any later change to those rules - which is how this record came to exist: the pull request that introduced the workflow was itself refused until it carried one.
