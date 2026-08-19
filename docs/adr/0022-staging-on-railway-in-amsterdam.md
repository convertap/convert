# ADR 0022 - Staging on Railway in Amsterdam, database included

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** -
**Superseded by:** -

## Context

Checklist item S6 asks for a deployed test environment. Nothing has ever run anywhere: every guardrail that passes today passes on a laptop or in CI, which proves shapes and rules but not that the system boots, serves a request, and talks to a database. The Definition of Done also requires error tracking and reminder timing to be observed on a real device, and neither is possible without somewhere deployed.

Four constraints narrow the field, and the first is the one that eliminates most options:

- **Web, api and Postgres deploy to the same region** (`architecture.md` §3). Every render is web → api → db, so a split deployment spends two intercontinental round trips against a 2.5 s LCP budget.
- **Three long-running processes.** `web`, `api` and `worker`. The worker cannot sleep: follow-up reminders fire at 09:00 Africa/Accra whether or not anyone has the app open.
- **The target market is Ghana.**
- **Pre-revenue.** Cost matters, and the stakeholder is being asked about budget this week.

Two facts found while checking rather than assuming, both of which changed the answer:

**No platform offers an African region together with managed Postgres.** Fly.io has `jnb` in Johannesburg, but that region carries neither Managed Postgres nor a WireGuard gateway. This turns out not to hurt: Ghana reaches Europe over the WACS, MainOne and SAT-3 cables at roughly 70–90 ms to London, while Accra to Johannesburg frequently routes via Europe anyway. Europe is both the available answer and the better one.

**Fly.io Managed Postgres starts at $38/month** for its smallest plan. That is more than the entire rest of the environment and removed Fly as a single-platform option.

## Decision

Staging runs entirely on **Railway, in EU West Metal (Amsterdam)**: `web`, `api` and `worker` as three always-on services, plus Railway's managed **Postgres** in the same region. Expected cost is roughly $10–20 per month, metered, on the $5 Hobby plan whose fee includes $5 of usage credit.

Secrets come from Infisical as everywhere else (ADR 0020); nothing is typed into the Railway dashboard that Infisical should own.

One platform, one region, one bill. The database sits beside the api rather than a metro away, so staging rehearses the production topology in `architecture.md` §17 instead of deferring the question.

## Consequences

**Positive:** the same-region constraint is satisfied rather than approximated, so staging behaves like production and a latency surprise cannot hide until pilot. No OS patching, no TLS configuration, no backup scripts, and a single dashboard, which matters when eleven decisions are still open and attention is the scarce resource. A public URL for stakeholder demos comes free. No free-tier ceiling, so nothing suspends mid-month during a demo.

**Negative / cost:** billing is metered rather than fixed, so an idle-but-always-on worker still costs money and a runaway process would cost more; worth an alert rather than trust. Roughly $5–7/month more than putting Postgres on a free tier, which is a real if small premium paid for predictability. Railway's only European region is Amsterdam, so if production later needs Frankfurt or London the compute platform is the thing that has to move. Whether the Hobby plan's Postgres includes point-in-time recovery is unverified, and `architecture.md` §17 assumes PITR: confirm on the plan actually purchased, and treat backups as unproven until one has been restored.

**Rejected alternatives:**

- *Railway compute with Neon's free Postgres.* Attractive on cost, and Neon's free plan is permanent rather than a trial: 0.5 GB, 100 CU-hours per month, scaling to zero after five minutes idle. It fails on geography. Neon offers Frankfurt and London but no Amsterdam, and Railway offers only Amsterdam in Europe, so the pairing adds 7–10 ms to every database round trip and quietly undermines the constraint this document treats as hard. It also introduces a ceiling whose failure mode is compute suspending until the next billing month, which is survivable for a test environment and embarrassing during a stakeholder demo.
- *Fly.io in Frankfurt with Neon in Frankfurt.* Genuinely the cheapest coherent option at roughly $6–10/month with a free database, and same-metro so the latency objection disappears. Rejected for operational surface rather than price: two vendors, two bills, and a `fly.toml` per app, against a single developer already carrying an unanswered decision backlog. Worth revisiting if the Railway bill grows or production needs Frankfurt.
- *A Hetzner VPS running the existing `docker-compose.yml`.* About €4–5/month, everything genuinely on one machine, and full Postgres superuser control. Rejected because it diverges from the managed-Postgres production topology, and because OS patching, TLS renewal, backups and monitoring become a standing obligation with no support to call when staging dies during a demo. The saving is smaller than the hours it costs.
- *Render.* Its free tier spins services down after inactivity, which is disqualifying for a worker whose entire job is firing reminders on a schedule. Paid pricing is per service, so three services plus a database is the most expensive option here.

## Enforcement

Not a code rule, so no gate enforces it. What keeps it honest is the checklist item S6 and the Definition of Done: reminders must be observed firing at the correct Accra local time on a real device, and backups must be verified by restoring one rather than by trusting that they are configured. Both require this environment to exist, and both fail visibly if it does not.

The Resources register in Notion carries the account, its owner and its monthly cost, so the bill has a name against it.
