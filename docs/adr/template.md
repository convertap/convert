# ADR NNNN - Short imperative title

**Status:** Proposed
**Date:** YYYY-MM-DD
**Supersedes:** -
**Superseded by:** -

## Context

What is true that forces a decision. Constraints, the pressure, what breaks if nothing is decided. Cite the source where there is one: a checklist ID, a deck slide, a measured number.

Write this before the Decision. If the context does not make the decision feel close to forced, the decision is probably arbitrary and should be reconsidered.

## Decision

What we will do, in the present tense and specific enough to be violated. "Use Postgres RLS on every tenant table, with the application connecting as a role that cannot bypass it", not "improve tenancy safety".

## Consequences

**Positive:** what this buys, concretely.

**Negative / cost:** what it costs in effort, latency, operational burden, and flexibility given up. An ADR with no negative consequences has not been thought through.

**Rejected alternatives:** what else was considered and why it lost. The section future readers need most, and the one that stops the same argument being had twice.

## Enforcement

How a violation gets caught: a CI gate, a rule in `.boundaries.json`, an invariant test, or a line on the review checklist. Name it.

A decision with no enforcement mechanism is a preference, and preferences decay.
