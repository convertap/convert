# ADR 0026 - Pass the Railway credential as an account token, not a project token

**Status:** Accepted
**Date:** 2026-08-20
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0024 moved deployment off Railway's push triggers and into `deploy-test` and `deploy-staging` in `.github/workflows/ci.yml`. Its §49 records, plainly, that the credential in use is **workspace-scoped**: a Railway project token is scoped to one environment and minting one requires a verified account, verification wants a payment method, and the GitHub route the trial offers is already spent.

Those jobs had never run. On 20 August 2026, with PR #24 merged, `develop` was fast-forwarded to `main` and `deploy-test` executed for the first time. All four gate jobs passed, `deploy-staging` correctly skipped, and the deploy failed on its first command:

```
Run railway up --ci --service '@convert/api' --environment test --project "$RAILWAY_PROJECT"
Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource you're trying to use.
```

The secret was present on the `test` GitHub environment, so this was not a missing credential. It was the wrong variable. Railway's CLI does not take one token and infer its kind — the variable **is** the declaration of kind:

| Variable | Token it must hold | Scope |
|----------|--------------------|-------|
| `RAILWAY_TOKEN` | project token | one environment within one project |
| `RAILWAY_API_TOKEN` | account or workspace token | every resource in the account or workspace |

So a workspace token arriving as `RAILWAY_TOKEN` is presented as a project token, matches no project, and is rejected — the error names `RAILWAY_TOKEN` because that is the variable it was asked to validate, which reads as "your token is bad" when the token is fine.

Two further facts from the CLI documentation matter enough to write down, because both are the sort of thing that gets rediscovered under time pressure:

- **Only one of the two may be set. Setting both is an error.** So the tempting fix of exporting both and letting the CLI choose does not work.
- `railway up` accepts `--project` and `--environment` as global flags, so the existing command shape needs no change. An account-scoped token with no linked project is the case where `railway up` would otherwise offer to *create* one; the explicit flags are what prevent that.

The comment block above the deploy jobs was wrong in the same way, and worse than wrong — it asserted a security property the deployment does not have: "Railway project tokens are scoped to one environment … so the test job holds a credential that cannot reach staging even if it tried." ADR 0024 §49 had already corrected that claim about itself. A comment stating a containment guarantee that does not exist is how the real blast radius gets forgotten.

## Decision

**The Railway credential is passed to the CLI as `RAILWAY_API_TOKEN`**, in all four deploy steps across both environments, and never as `RAILWAY_TOKEN`. `railway up` keeps its explicit `--project`, `--environment` and `--service` flags, which are what stop an account-scoped token from creating a project rather than deploying to one.

**The GitHub environment secret keeps the name `RAILWAY_TOKEN` for now**, mapped across in the workflow as `RAILWAY_API_TOKEN: ${{ secrets.RAILWAY_TOKEN }}`. The name understates what the value is, and the workflow says so at the point of use.

**When a verified account makes project tokens available, both change together:** two project tokens, one per environment, passed as `RAILWAY_TOKEN`, and the secret renamed to match. That is the change ADR 0024 §51 already commits to, and it is the point at which the containment property the old comment claimed becomes real.

## Consequences

**Positive:** the deploy path can authenticate, which makes the rest of it testable — everything downstream of that first command had never executed. The workflow now describes the credential it actually has, including the constraint that the two variables are mutually exclusive, so the next person does not spend a CI round trip discovering it. And the misleading containment comment is gone, so the broad scope is stated in one voice by ADR 0024, this record, and the workflow.

**Negative / cost:** the secret's name now disagrees with the variable it feeds, which is a small trap of its own, mitigated only by a comment. Renaming it requires the token value, which lives only in GitHub and cannot be read back out, so the rename waits for the token to be reissued anyway. Nothing here narrows the blast radius: one leaked build log still reaches both environments, exactly as ADR 0024 recorded, and this record makes that credential *work*, which raises the value of leaking it from zero. G14 redacts, `--ci` keeps the token off stdout, and the mitigation remains proportionate only while both databases are empty.

**Rejected alternatives:**

- *Mint two project tokens now.* The correct end state, and ADR 0024 §51 already names it. Blocked on account verification, which wants a payment method. Waiting for that would leave the deploy path unexercised for an unbounded period, which is the specific thing that has already hidden one bug.
- *Set both variables.* Documented as an error, not a fallback.
- *`railway link` in a preceding step, as Railway's own PR-environment example does.* Equivalent for our purposes and one more step. `--project` and `--environment` on `railway up` are documented global flags and already present, so linking would add a moving part without changing what the command targets. Revisit if a future subcommand turns out to need a link.
- *Roll back to Railway's push triggers until a project token exists.* Gives up the property ADR 0024 was written for — that the commit deployed is the commit the gates passed on — to work around a variable name.

## Enforcement

The deploy job proves itself: its last step curls `/health` on the api and `/` on the web service and fails on anything but a 200, so a deploy that authenticates but does not serve is still a red job.

No gate checks that the credential is passed under the right variable name, and none reasonably can from inside the repository — the token's kind is a fact about Railway, not about this file. What catches a regression is that `deploy-test` runs on every push to `develop` and fails loudly, which is now true and was not before.
