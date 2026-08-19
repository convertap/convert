# ADR 0023 - Bound every CI step in time, and make apt wait deliberately

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** -
**Superseded by:** -

## Context

Gate G14 scans for secrets. It installs the Infisical CLI on the runner, then runs `infisical scan`. On 19 August 2026 that step hung three times in a row, each time blocking a pull request that had nothing to do with secrets.

The log says where:

```
OK: Importing 'infisical' repository GPG key from S3 ...
RUN: Installing 'infisical' repository via apt ...
OK: Installing 'infisical' repository via apt ...
[six minutes of nothing]
##[error]The operation was canceled.
```

The repository is added successfully and then `apt-get install` stops. Nothing fails; it waits. GitHub's hosted runners run their own background package upgrades, those hold the dpkg lock, and `apt-get` blocks on the lock indefinitely by default rather than timing out.

Two separate problems compound:

- **The install has no reason to wait forever.** `apt-get` will queue for a lock if asked; by default it does something less useful.
- **The step has no time bound at all.** A GitHub job inherits a six-hour default timeout. So a stall that would be obvious in one minute instead presents as a pull request that is neither passing nor failing, for hours, on a repository where branch protection requires that check. Three of these in an afternoon cost more than the work they were gating.

The second problem is the more important one, and it is not specific to G14. Any step that reaches the network can stall: the Lighthouse run in G9, an `apt` install, a `pnpm install` against a slow registry. None of them were bounded.

There is a related irritation worth naming but not solving here. Because gate G2 requires an ADR alongside any change to `.github/workflows/ci.yml`, a one-line timeout needs this document, and Dependabot's action-version bumps (#2 to #6) fail G2 permanently because a bot cannot write a decision record. G2 already compares only the *semantic* content of `.boundaries.json`; it should do something similar for the workflow. That is a change to a guardrail's own definition and deserves its own record rather than being smuggled in here.

## Decision

**Every job in `.github/workflows/ci.yml` carries an explicit `timeout-minutes`.** The value is set to a few times the observed runtime, generously enough that a slow-but-working run is never killed, tightly enough that a stall is reported in minutes:

| Job | Observed | Bound |
|-----|----------|-------|
| `guardrails` (G1, G2, G14, G15) | ~1m | 10 |
| `quality` (G3–G6, G10, G13) | ~40s | 15 |
| `database` (G7, G8) | ~30s | 15 |
| `performance` (G9) | ~1m25s | 20 |

**Package installation waits on purpose rather than by accident.** The G14 step passes `-o DPkg::Lock::Timeout=180` so `apt-get` queues for the dpkg lock for up to three minutes and then reports a real failure, and sets `DEBIAN_FRONTEND=noninteractive` so nothing can block on a prompt.

## Consequences

**Positive:** a hung step now fails within its bound and says so, instead of leaving a pull request in a state branch protection will not merge and no human can interpret. Lock contention with the runner's own upgrades, which is the common cause, resolves by waiting the three minutes rather than by cancelling and re-running and hoping. The bounds are documentation as much as protection: they record what these jobs actually cost, which is the number to compare against when one of them starts creeping.

**Negative / cost:** the numbers are guesses calibrated against a handful of runs, so a genuinely slow day (a cold cache, a busy registry) could be killed by a bound rather than finishing. If that happens the answer is to raise the specific number, not to remove bounds. And every future adjustment drags an ADR behind it until G2 is narrowed, which is friction this document is itself an example of.

**Rejected alternatives:**

- *Cancel and re-run when it hangs.* What was done three times. It works, costs ten minutes of attention each time, and teaches the habit of ignoring a red or stuck check, which is the failure mode gates exist to prevent.
- *Replace the Infisical CLI with gitleaks.* `infisical scan` wraps gitleaks, so running gitleaks directly through a pinned binary would remove the apt install entirely and would be faster. Rejected for now because it swaps the tool for a symptom that has a simpler cause, and because the same secret store already owns the injection path (ADR 0020); one tool for both is worth keeping while the cheaper fix holds. Revisit if the apt install stalls again after this change.
- *Bound only G14.* The stall was in G14, but nothing about the other jobs makes them immune, and an unbounded network step is the general shape of the problem. Bounding one and leaving three is fixing the instance rather than the class.
- *Cache the CLI between runs.* Would help, but adds cache-key management for a tool that installs in seconds when the lock is free. Not worth the moving parts.

## Enforcement

Nothing machine-checks the presence of `timeout-minutes`, so this is a convention with a review line rather than a gate: a new job in `ci.yml` arrives with a bound, and G2 already forces any workflow change through a decision record where that is visible.

The bounds enforce themselves in the only way that matters — a stalled step now ends.
