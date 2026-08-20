# ADR 0025 - Narrow G2 so an action version bump is not an architectural decision

**Status:** Accepted
**Date:** 2026-08-20
**Supersedes:** -
**Superseded by:** -

## Context

Gate G2 requires a decision record alongside any change to `.boundaries.json`, `.github/workflows/ci.yml`, or `docs/engineering-guardrails.md`. It exists to catch one specific failure: a red boundary check being fixed by editing the rule instead of the import, with the reason lost.

It already distinguishes a rule change from an operational one for `.boundaries.json`, comparing only the semantic keys, on the stated grounds that demanding an ADR for an `ignore`-list edit "would train people to write meaningless ADRs, which is worse than not having the gate". It does not make that distinction for the workflow, where any diff at all fails the gate.

The consequence is visible in the pull request list. Dependabot has five open bumps, and four of them (#2, #3, #4, #5) touch `ci.yml` and nothing else:

```diff
-      - uses: actions/checkout@v4
+      - uses: actions/checkout@v7
```

```diff
-      - uses: pnpm/action-setup@v4
+      - uses: pnpm/action-setup@v6
```

Each fails G2. A bot cannot write a decision record, so **every future action bump on this repository is blocked forever** — including the security-patch bumps that are the reason Dependabot is enabled at all. The alternatives available today are all bad: hand-write a hollow ADR per bump, admin-override the gate, or leave the actions to rot.

ADR 0023 hit the same friction from the other side (a one-line `timeout-minutes` change dragging a full ADR behind it), named this fix, and deliberately did not smuggle it in: "That is a change to a guardrail's own definition and deserves its own record." This is that record.

The question G2 should be asking of the workflow is the same one it asks of `.boundaries.json`: *did a rule move?* A gate step added or removed, a trigger widened, a `needs:` edge cut, a deploy environment rebound — those are decisions. **Which version of `actions/checkout` is pinned is not a decision, it is a fact with an upstream owner.** The action's identity carries the meaning; the ref it is pinned to does not.

## Decision

**G2 compares `.github/workflows/ci.yml` semantically, in the same spirit as `.boundaries.json`.** The comparison normalises every `uses:` line by dropping the ref it is pinned to and any trailing version comment, then requires the rest of the file to be byte-identical:

```
uses: actions/checkout@v7          ->  uses: actions/checkout
uses: actions/checkout@a1b2c3 # v4 ->  uses: actions/checkout
```

If two versions of the workflow are equal under that normalisation, the only thing that changed is a version pin, and G2 does not demand an ADR. Any other difference — a step, a trigger, a `run` body, a `needs:` list, an `env` value, a job, or the **identity** of an action (`actions/checkout` becoming `someone-else/checkout`) — still fails without a decision record.

The comparison is plain text with one regular expression, not a YAML parse, so the guardrails job keeps needing nothing installed beyond the Python it already has.

## Consequences

**Positive:** Dependabot's action bumps become mergeable on their own evidence, which is the CI run itself — the correct check for "does this version work" was never an ADR. G2 stops firing on the class of change it was never aimed at, which is what keeps a gate believed; a gate that cries wolf gets overridden, and an overridden gate protects nothing. The `.boundaries.json` and `ci.yml` rules now read the same way, so the gate has one idea in it rather than two.

**Negative / cost:** a major action bump can change behaviour, and G2 no longer makes anyone write down that they thought about it. That risk moves entirely onto the CI run and the review, which is where it belongs but is a real transfer. The regular expression is a second place where the shape of a `uses:` line matters, so an unusual form (a local `./.github/actions/x` path, a Docker `docker://image:tag` ref) needs checking against it — both are handled, the first because it has no `@`, the second because normalising its tag is the same correct answer. And the workflow is now the only watched file with two kinds of diff, so someone reading the gate has to hold that distinction.

The gate's own logic still has no automated test, because the repository has no Python test harness and adding one to carry a single file is not worth the machinery today. The verification below was therefore run by hand. If this file grows a third carve-out, that trade flips.

**Rejected alternatives:**

- *Exempt Dependabot by author.* Skip G2 when `github.actor == 'dependabot[bot]'`. Shorter, and wrong: it makes the gate a question about who is asking rather than what changed, so a human making the identical one-word bump still gets blocked while a bot could in principle be given a broader diff. Identity-based exemptions on a public repository are also the thing an attacker with a spoofable trigger goes looking for.
- *Drop `ci.yml` from G2's watched list.* Removes the friction and the protection together. Rebinding `deploy-staging` to a different GitHub environment, or widening a push trigger, are exactly the decisions ADR 0024 was written for; those must not land silently.
- *Parse the YAML and compare structures.* More precise in principle: it would see through reordered keys and reformatting. It needs PyYAML on the runner, where the guardrails job currently installs nothing, and it trades a five-line regex for a tree diff whose failure modes are harder to read. Reformatting the workflow while claiming no semantic change is not a problem this repository has.
- *Pin every action to a SHA and let Dependabot rewrite the comment.* Good supply-chain practice and orthogonal: it changes what the pin looks like, not whether G2 fires on it. Worth doing separately, and cheaper to do once the gate stops blocking the bumps.
- *Auto-generate an ADR per bump.* An ADR nobody decided anything in. This is precisely the "meaningless ADR" the `.boundaries.json` carve-out already exists to avoid.

## Enforcement

G2 enforces itself: `tools/check_adr_discipline.py` is the gate, and the narrowing lives in that file. It runs on every pull request in the `guardrails` job.

Verified against the four real Dependabot branches (#2–#5), which all pass under the new comparison, and against six cases run in a detached worktree off `main`:

| Case | Expected | Result |
|------|----------|--------|
| Widen the push trigger, no ADR — what PR #24 did | fail | fail |
| Swap `actions/checkout` for `someone-else/checkout`, same version | fail | fail |
| Delete the G1 step | fail | fail |
| `actions/checkout@v4` → `@v7` only | pass | pass |
| Repin to a SHA with a `# v4.0.4` comment | pass | pass |
| Widen the push trigger *with* an ADR | pass | pass |

One finding from doing this rather than reasoning about it: the gate read git's output with Python's locale encoding, so on a Windows shell a `§` fetched out of history did not match the same `§` in the working tree, and every content comparison failed for an invisible reason. CI runs on a UTF-8 locale and would never have shown it. `run()` now decodes UTF-8 explicitly. The `.boundaries.json` comparison was carrying the same bug.
