# ADR 0049 - Promote through develop, testing, staging and main

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** 0019 (branch model only), 0024 (branch routing only)
**Superseded by:** -

## Context

The repository currently asks contributors to branch from `main`, while CI deploys a push to
`develop` directly to Railway `test` and a push to `main` directly to Railway `staging`. Normal
work therefore merges to `main` without passing through the test deployment, and `develop` drifts
behind. The branch names describe neither the promotion order nor the environment holding a
commit.

The project needs an integration branch where incomplete development can accumulate without a
deployment, explicit environment branches whose merges are the deployment decision, and a
production branch that contains only commits promoted through both non-production environments.

## Decision

**The only long-lived branch order is `develop` -> `testing` -> `staging` -> `main`.** Feature and
fix branches start from and merge into `develop`. Promotion happens with a pull request from one
long-lived branch to the next; no branch is skipped and no long-lived branch accepts direct pushes.
Feature pull requests are squash-merged into `develop`; promotion pull requests use merge commits.
Squash or rebase promotion is forbidden because it rewrites the promoted commit and makes the
long-lived branches diverge.

Each branch has one role:

| Branch    | Role                                   | Deployment on merge                             |
| --------- | -------------------------------------- | ----------------------------------------------- |
| `develop` | integration                            | none                                            |
| `testing` | deployed test candidate                | Railway `test`                                  |
| `staging` | deployed stakeholder/release candidate | Railway `staging`                               |
| `main`    | production release history             | none until production infrastructure is defined |

All four branches run the same CI gates. The deploy jobs remain in CI and retain the environment
switches and GitHub environment secrets decided by ADR 0024, but `deploy-test` keys only on
`refs/heads/testing` and `deploy-staging` only on `refs/heads/staging`. Railway push triggers remain
deleted.

**Promotion requires proof from the preceding environment.** A pull request from `testing` to
`staging` requires successful `Deploy api to test` and `Deploy web to test` check runs on the source
commit. A pull request from `staging` to `main` requires the equivalent staging checks. A deployment
that is disabled, failed, cancelled, or still running cannot be promoted.

Only pull-request runs may cancel an older run. Push runs on long-lived branches queue, because a
cancelled `railway up` can leave Railway completing a deployment after GitHub has stopped before
the serving probe.

## Consequences

**Positive:** development can merge without consuming Railway deployment time. A commit present on
`main` has passed through both deployed environments in order, and branch history states which
environment is expected to hold it. Test and staging deployments no longer depend on remembering
to move an unrelated branch pointer.

**Negative / cost:** every release gains three promotion pull requests and three merge commits after
feature integration. Promotion branches cannot require linear history, and selecting squash or
rebase on a promotion PR leaves a failed post-merge run that must be repaired before deployment.
GitHub protection must be configured consistently on four branches, not one. Production remains a
release branch rather than an automated deployment until a production Railway environment,
credentials, rollback path, and approval policy are decided.

**Rejected alternatives:**

- _Keep feature work merging to `main` and deploy that commit to test, then staging._ Simpler and
  preserves one integration branch, but contradicts the required production-only role for `main`.
- _Deploy `develop` to test and `main` to staging._ This is ADR 0024's prior route. It has no branch
  representing a tested candidate or a staged candidate, and normal PRs can bypass both deploys.
- _Automatically merge branches after a successful deployment._ Removes promotion PR work but also
  removes the explicit human decision to advance a release and needs a write-capable workflow token.

## Enforcement

The repository portion exists in this change: `.github/workflows/ci.yml` triggers on all four
branches, deploys only from `testing` and `staging`, and cancels in-progress runs only for pull
requests. The required `guardrails` job rejects a pull request to `testing`, `staging`, or `main`
unless its source is the immediately preceding branch, and rejects backward promotion into
`develop`. Promotion PRs must originate in this repository, not a same-named fork branch. Before a
PR to `staging` or `main` can merge, the job reads the source commit's GitHub checks and requires
both deployments in the preceding environment to be successful. On the resulting push it also
requires a two-parent merge commit before a deployment job can run. `CONTRIBUTING.md`,
`docs/engineering-guardrails.md`, and
`docs/deployment-runbook.md` state the same promotion order.

The server-side portion does **not** exist yet. Only `main` and `develop` exist remotely at the time
of writing, and only `main` is protected. Before the flow is operational, create `testing` and
`staging`; protect all four branches with the four required CI job names, strict status checks,
administrator enforcement, resolved conversations, and blocked force pushes and deletions. Keep
linear history on for `develop` and off for the three promotion targets; enable both squash merges
and merge commits in repository settings; make `develop` the repository default branch; and
restrict GitHub environments `test` and `staging` to their matching deployment branches.
`.github/dependabot.yml` also targets `develop` explicitly. Branch protection blocks direct pushes,
while the required guardrail job blocks skipped or history-rewriting promotion.

Activation has one deliberate bootstrap step: before this workflow lands, fast-forward the stale
`develop` branch to the current `main` tip and create `testing` and `staging` from that same commit.
After the guardrail is active, `main` never merges backward into `develop`; changes move forward
only through the decided route. The ordered procedure is in `docs/deployment-runbook.md`.
