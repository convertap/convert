# ADR 0028 - Pin the Railway CLI, and bump it by hand

**Status:** Accepted
**Date:** 2026-08-20
**Superseded by:** -
**Supersedes:** -

## Context

The deploy jobs installed their deployment tool with `npm install -g @railway/cli` — no version. Every other moving part of the pipeline is pinned: actions carry a major (`actions/checkout@v7`), Node carries a version, dependencies carry a lockfile. The one tool that actually performs the deploy floated.

That is not a theoretical gap here. **The deploy path has already broken once on this CLI's behaviour**, and specifically on its authentication: `RAILWAY_TOKEN` and `RAILWAY_API_TOKEN` mean different token *kinds*, and passing a workspace token under the wrong one fails with `Unauthorized` (ADR 0026). A contract that subtle is exactly the kind that shifts across versions.

The release cadence decides how bad `latest` is:

```
5.37.7   2026-08-12
5.38.0   2026-08-13
5.39.0   2026-08-13
5.40.0   2026-08-13
5.40.1   2026-08-13
5.41.0   2026-08-13
5.41.1   2026-08-14
5.41.2   2026-08-15
```

377 published versions, seven of them inside four days. So **two deploys an hour apart can run different CLIs with no diff anywhere in this repository**, and a deploy that worked this morning can fail this afternoon with nothing to bisect. That also makes the failure maximally confusing: the natural assumption is that the change came from the commit, and it did not.

There is a second reason beyond reproducibility. `railway up` is handed a workspace-scoped credential that reaches both environments (ADR 0024 §49). Installing an unpinned package from a public registry immediately before handing it that credential is a supply-chain surface, and pinning is the cheap half of narrowing it.

## Decision

**The deploy jobs install an exact version: `npm install -g @railway/cli@5.41.2`**, in both `deploy-test` and `deploy-staging`.

**The pin lives in `.github/workflows/ci.yml`, not in `package.json`.** That is the part worth explaining, because a workspace devDependency would have been Dependabot-managed and this is not. `@railway/cli` ships as a 10.6 KB shim whose `postinstall` downloads the real binary over the network. As a workspace devDependency that fetch would run inside every `pnpm install --frozen-lockfile` in the workflow — the `quality`, `database` and `performance` jobs — adding a network dependency to three gate jobs that currently have none. Trading one reproducibility problem for three flakier gates is a bad trade, and a gate that fails for reasons unrelated to the code is how a pipeline stops being believed (ADR 0023 was written about exactly that).

**The version is therefore bumped by hand.** Dependabot cannot see a global `npm install` in a workflow, so nothing will propose it. The procedure:

```bash
npm view @railway/cli version          # what is current
# edit both `@railway/cli@<version>` lines in .github/workflows/ci.yml
# push to develop; deploy-test runs and proves the new CLI still deploys and serves
```

The last line is the real check. `deploy-test` ends by curling `/health` and `/`, so a CLI bump is verified by a deploy rather than by reading a changelog.

## Consequences

**Positive:** the deploy toolchain is now reproducible. A deploy that fails after this points at something in the diff, because the CLI is no longer a variable. The bump becomes a deliberate, reviewable event that runs through `deploy-test` before it can reach `deploy-staging`, which is the correct shape for the one tool holding a credential that reaches both environments. And it closes the last floating dependency in the pipeline, so "everything here is pinned" is now true rather than nearly true.

**Every future bump will require its own decision record, and that is deliberate.** ADR 0025 narrowed G2 so a *`uses:`* version bump no longer demands an ADR, on the grounds that "which version of `actions/checkout` is pinned is a fact with an upstream owner, not a decision". This pin lives in a `run:` line, which that carve-out does not cover, so G2 will fire on every bump. The carve-out is not being extended to reach it, for two reasons. A `run:` body is where real logic lives, and teaching G2 to see through arbitrary shell would blunt it far beyond version strings. And the two cases are genuinely different: Dependabot's action bumps are mechanical, monthly and unattended, which is what made a mandatory ADR a deadlock, whereas bumping the tool that performs deploys while holding a credential reaching both environments is a deliberate act a person chooses — and the ADR is where the verification gets recorded. A short record saying "bumped to X, `deploy-test` proved it still deploys and serves" is not a hollow ADR; it is the evidence.

**Negative / cost:** the pin will go stale silently, and given the cadence above it will go *far* stale — a year of neglect is a hundred-plus versions. Nothing warns about it. A genuine fix for a Railway-side bug will not arrive on its own, and the first symptom may be a deploy failing against a Railway API that has moved on. This is a real regression in one dimension, accepted knowingly: `latest` traded that staleness for non-reproducibility, and non-reproducibility is worse when the tool holds the deploy credential. Two places to edit rather than one is a second, smaller cost; they are adjacent in the same file and a mismatch would show up as one environment deploying differently from the other.

**Rejected alternatives:**

- *Add `@railway/cli` to root `devDependencies`.* The option that gets Dependabot coverage, monthly and grouped with `tooling`, plus a lockfile pin — strictly better on staleness. Rejected on the `postinstall` network fetch above: it would put a registry download inside three gate jobs that are currently offline-clean. Worth revisiting if the package ever ships platform binaries as optional dependencies rather than a postinstall.
- *Pin a major only (`@railway/cli@5`).* Matches the `actions/checkout@v7` convention and keeps patches flowing. Rejected because the failure being guarded against was a subtle auth contract, and this project's history shows this CLI shipping seven releases in four days inside one minor. A major-only pin does not make two deploys an hour apart reproducible, which is the point.
- *Run the CLI's container image (`ghcr.io/railwayapp/cli:<tag>`) as the job container.* A genuinely strong pin, and Dependabot's docker ecosystem could track the tag. Rejected as too large a change to the job shape for the problem, and it moves the deploy steps inside a container whose contents are less obvious than two visible install lines. Reconsider if the manual bump proves to be a recurring nuisance.
- *Leave it floating and rely on `Prove it serves`.* The probe does catch a CLI that breaks the deploy. It catches it *after* the deploy, on a service that may already be down, and gives no way to tell the CLI apart from the commit as the cause.

## Enforcement

Nothing machine-checks the pin's freshness, and deliberately so — a gate that reaches the npm registry to compare against `latest` is a gate that fails when the registry is slow, which is the flakiness this record just rejected elsewhere.

What enforces the pin itself is G2: `.github/workflows/ci.yml` is a watched file, so changing that version string requires a decision record, and this is it. What enforces that a bump actually works is `deploy-test` — it runs on pushes to `testing` while `DEPLOY_TEST=true` and ends by curling both services for a 200. ADR 0049 blocks promotion to `staging` unless both checks succeeded.
