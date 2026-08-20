# ADR 0024 - Deploy through CI, not straight from a push

**Status:** Accepted
**Date:** 2026-08-20
**Supersedes:** -
**Superseded by:** -

## Context

Staging came up on 20 August 2026 (ADR 0022) with Railway watching the `main` branch and deploying whatever appeared there. A second environment, `test`, now tracks `develop`, so there are two.

That arrangement has a hole in it. Railway's deployment trigger fires on the push itself, and it does not care what the fifteen CI gates thought. A pull request that somehow merged red, a direct push in an emergency, a branch protection rule relaxed for an afternoon: any of those reach a running environment without a single gate having to pass. The gates are the whole quality argument of this repository, and the deployment path went around them.

Railway does offer a **Wait for CI** setting, exposed on the deployment trigger as `checkSuites`. It closes the hole, and on its own it is not enough:

- **The deployment is invisible to GitHub.** No deployment history, no environment URL on the pull request, nothing in the API. GitHub environments were created for `test` and `staging` with branch policies restricting each to one branch, and those policies bind nothing while Railway deploys on its own.
- **There is no ordering beyond "checks passed".** A deploy cannot be made to wait for a reviewer, a manual approval, or a migration step, because the trigger is not ours to sequence.
- **The deployed artifact is whatever Railway resolves from the branch,** not the commit CI actually validated. Usually the same. Not necessarily.

The distinction worth being clear about: Wait for CI answers "were the checks green?", and what this needs is "did our pipeline decide to deploy this commit?". Those are different questions, and only the second one can carry an approval or an ordering later.

## Decision

**Railway's deployment triggers are deleted.** Nothing deploys because a commit appeared on a branch. The GitHub connection stays, because it is still how the source is fetched and how the repository is linked.

**Deployment is a job in `.github/workflows/ci.yml`**, gated on every existing job:

```yaml
needs: [guardrails, quality, database, performance]
```

Two jobs, each bound to a GitHub environment, which is what makes the branch policies real:

| Job | Runs on | GitHub environment | Railway environment |
|-----|---------|--------------------|---------------------|
| `deploy-test` | push to `develop` | `test` | `test` |
| `deploy-staging` | push to `main` | `staging` | `staging` |

Each deploys with `railway up -s <service> -e <environment> --ci`, uploading the checked-out commit. The artifact deployed is therefore the exact tree the gates ran against, rather than whatever a branch pointer resolves to afterwards.

**Each job has its own switch, and both start off.** `DEPLOY_TEST` and `DEPLOY_STAGING` must equal `true`, and that environment must hold a token. Two switches rather than one because the environments have different lifetimes: `staging` exists for stakeholder demos and there is nothing to demo yet, so it is off and its compute is scaled to zero, while `test` is where work actually lands. Turning one off must not require touching the other, or the cheap decision becomes a code change.

This is not decoration: merging a deployment job that cannot authenticate would put a red job on `main` immediately, and a red `main` that everybody learns to ignore is worse than no deployment job.

**Tokens live as GitHub environment secrets** rather than one repository-wide secret, so each job can only read its own.

**The token is workspace-scoped, not environment-scoped, and that is a compromise rather than the design.** Railway's project token is scoped to one environment — `environmentId` is required to mint one — and would have meant the `test` job holding a credential that could not reach `staging` at all. Creating one requires a verified account, and verification wants a payment method: the GitHub route the trial offers instead is already spent, because the GitHub account is connected and the account is still unverified, most likely because that account is too new to satisfy the heuristic.

Account-level and workspace-level tokens have no such gate. So the token in use is scoped to the workspace, which reaches both environments and any project added later. Stated plainly because the earlier draft of this record claimed the stronger property: one leaked secret in a build log now reaches staging as well as test.

In proportion, today: the blast radius is two environments with empty databases, no migrations, and no customer data. It stops being acceptable the moment production exists or a real WhatsApp credential lands, and the fix is a verified account and two project tokens, not a redesign.

## Consequences

**Positive:** a deploy now requires every gate to have passed, and says so in a place a person can audit — GitHub records each deployment against its environment with the URL. The branch policies start binding: `staging` only from `main`, `test` only from `develop`. The commit deployed is the commit tested. And the sequencing point is now ours, so a required reviewer on `staging`, a migration step before the app starts, or a smoke test after it, are configuration rather than a rewrite.

**Negative / cost:** the token is broader than intended, as above, so a credential leak reaches both environments rather than one. Deploys get slower, because they wait for the full gate suite rather than starting immediately — several minutes rather than seconds, which is the correct trade for staging and mildly annoying on `test`. A Railway token now lives in GitHub as well as Infisical, which is a second place a credential exists; ADR 0020 puts secrets in Infisical, and a GitHub Actions job cannot read from Infisical without a credential of its own, so this is a genuine exception rather than an oversight, and the credentials register records it. `railway up` uploads the working tree instead of Railway pulling from the repository, so `.gitignore` and `.railwayignore` now affect what gets built. And the deployment path is ours to maintain: when it breaks, nothing deploys, where previously Railway would have.

**Rejected alternatives:**

- *Turn on Wait for CI and stop there.* One toggle, no token, no workflow, and it does close the hole this document is mainly about. Rejected because it leaves GitHub environments inert, leaves deployments invisible to GitHub, and leaves the ordering out of reach — so the first time an approval or a migration step is needed, the work happens then anyway. Worth knowing it remains the correct fallback if the workflow proves troublesome: it is a per-service toggle and a `checkSuites: true` field on the trigger.
- *A separate deploy workflow triggered by `workflow_run`.* Keeps `ci.yml` smaller and avoids an ADR-triggering edit. Rejected because `workflow_run` runs against the default branch's workflow definition and needs care to resolve the right commit, which is a class of confusion worth avoiding for no real gain. `needs:` in one workflow states the dependency plainly.
- *Deploy on a tag rather than a branch push.* Right for production later, wrong for two environments that exist to be looked at continuously.
- *Keep the triggers and add the workflow.* Both paths deploying the same environment, racing, with two sources of truth for what is running. The point of this change is that there is one.

## Enforcement

The `needs:` list is the enforcement: the deploy jobs cannot start until every gate has succeeded. Deleting the deployment triggers is what stops the other path, and it is the step that would silently undo this decision if someone recreated one — a trigger reappearing on either environment means deployments have two sources again.

Gate G2 requires this record to accompany the `ci.yml` change, which is how it came to exist.
