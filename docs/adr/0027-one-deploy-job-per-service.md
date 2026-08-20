# ADR 0027 - One deploy job per service, so a slow builder cannot deploy without verifying

**Status:** Accepted
**Date:** 2026-08-20
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0024 put deployment behind the gate suite, and ADR 0026 fixed the credential so it could actually run. `deploy-test` then deployed both services from one job: `railway up` for the api, `railway up` for the web, then a `Prove it serves` step curling `/health` and `/` and failing on anything but a 200. ADR 0023 gave the job a 20-minute bound, calibrated against an observed runtime of about three minutes.

On 20 August, two runs of that job on `develop` behaved very differently:

| | run `32371549141` | run `32375814435` |
|---|---|---|
| api step | ~3 min | ~10 min |
| web step | (inside the same 3 min) | ~10 min, cancelled |
| Outcome | success, both probes 200 | **cancelled at the 20-minute bound** |

Both slow steps stalled in the same place:

```
Indexing...
Uploading...
CI mode enabled
scheduling build on Metal builder "builder-bfsxmt"
fetching snapshot
[ten minutes of nothing]
##[error]The operation was canceled.
```

Railway queues builds. The command, the flags and the credential were identical between the two runs, and `actions/checkout@v7` and `actions/setup-node@v7` — bumped in between — ran cleanly, post-run steps included. The lockfile change from the eslint 10 bump was already present in the *fast* run, so a busted build cache does not explain it either. What is left is builder queueing, which is variance on Railway's side and not something this repository controls.

ADR 0023 anticipated the shape of this exactly: "a genuinely slow day (a cold cache, a busy registry) could be killed by a bound rather than finishing. If that happens the answer is to raise the specific number, not to remove bounds."

**But raising the number alone would leave the real defect in place, which is worse than a slow job.** The bound fired *after* `railway up` had uploaded the tree and handed the build to Railway. Railway carried on building; both services deployed and were serving 200 afterwards. `Prove it serves` never ran, because the job was already cancelled. So the deployment happened and nothing verified it, while GitHub reported a cancellation — which reads as "nothing happened". That inverts the property ADR 0024 exists to provide. A red job is honest; a cancelled job that silently deployed is not.

Two serial builds in one job also means the queueing compounds: each service waits for the previous one's build before its own is even scheduled, so two independent ten-minute queues become a twenty-minute job.

## Decision

**Each service gets its own deploy job, expressed as a matrix over the services**, for both `test` and `staging`:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - name: api
        service: '@convert/api'
        probe: https://convertapi-test.up.railway.app/health
      - name: web
        service: '@convert/web'
        probe: https://convertweb-test.up.railway.app/
```

Three consequences follow directly, and they are the point:

- **The builds run concurrently**, so two independent queues no longer add up.
- **`timeout-minutes` applies per matrix instance**, so each service gets the full 20 minutes rather than sharing one budget. The number stays at 20; the change is what it is measured against.
- **Each job proves its own service.** `Prove it serves` curls one probe, in the same job that deployed it, so a cancelled job can leave at most one service unverified and the job name says which.

**`fail-fast: false` is required, not stylistic.** With the default, a failing api deploy cancels the web job — potentially mid-build, recreating the exact silent-deploy hole this record exists to close.

A matrix rather than two hand-written jobs because a matrix *is* separate jobs, and duplicating the checkout, Node and CLI-install block four times across two environments is four places for them to drift.

## Consequences

**Positive:** a Railway build queue no longer converts into a cancelled deploy, and if a job is cancelled anyway, exactly one service is affected and the job name identifies it. Wall-clock time roughly halves on a normal run because the builds overlap. `Deploy api to test` and `Deploy web to test` appear as distinct checks, so branch protection and the run summary both name the service that failed instead of a generic "Deploy to test".

**Negative / cost:** four deploy jobs across the two environments instead of two, each repeating checkout, Node and the CLI install — a little more runner time, and a matrix is one more construct to understand when reading the workflow. Both services now register a deployment against the same GitHub environment, so the environment's timeline shows two entries per push, and any future protection rule on that environment gates both jobs independently. Concurrent `railway up` calls into one Railway project are assumed safe because they target different services; if Railway ever serialises them at the project level, the wall-clock gain disappears without the correctness gain going with it. And this does nothing about the underlying cause: the builder queue is Railway's, and a queue longer than twenty minutes still cancels.

**Rejected alternatives:**

- *Raise the bound to 35 minutes and change nothing else.* Literally what ADR 0023 prescribes, one line, and it was the tempting option. Rejected because it treats the symptom: two serial builds still compound, and a cancellation mid-build still deploys without verifying. The bound was never the defect.
- *Deploy with `--detach` and poll afterwards.* Removes the stall by not waiting, and removes the proof with it. `Prove it serves` exists because a deploy that reports success while the service is down is the failure worth catching.
- *One job, but move `Prove it serves` into a separate job that always runs.* Would close the verification hole without splitting the deploys. It adds a job whose relationship to the deploy is `always()`, which is subtle, and leaves the compounding queue untouched.
- *Drop the bound on deploy jobs.* Returns to the six-hour default and the unreadable pull request ADR 0023 was written to prevent.

## Enforcement

The jobs enforce themselves: each ends by curling its own service and failing on anything but a 200, so an unverified deploy is now structurally hard rather than merely unlikely.

**Measured, on the first run after merging.** Run `32380276107` on `develop` hit the same slow builder as the cancelled run — about ten and a half minutes per build, not the three-minute best case:

| Job | Started | Finished | Probe |
|-----|---------|----------|-------|
| `Deploy api to test` | 14:29:16 | 14:39:41 | `/health` → 200 |
| `Deploy web to test` | 14:29:16 | 14:39:37 | `/` → 200 |

Identical start times, so the builds genuinely overlapped, and each finished about ten minutes inside its own 20-minute bound. **Under the previous serial design this run would have been cancelled again**, because the two builds together would have exceeded twenty minutes. The concurrency is therefore load-bearing rather than a nicety, and the wall-clock claim is measured rather than expected.

One cosmetic wrinkle: on a run where the deploy is skipped, the check appears as the unexpanded `Deploy ${{ matrix.name }} to staging`, because a skipped job never expands its matrix. It renders correctly (`Deploy api to test`) whenever the job actually runs.
