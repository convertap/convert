# ADR 0041 - Decision records are not rewritten when vocabulary changes

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0030 renamed the tenant from `organization` to `workspace`. Executing that rename touched 27 files, and it raised a question the rename itself did not answer: **do the existing decision records get rewritten too?**

Twelve ADRs and several living documents referred to `org_id`. Sweeping all of them is one command, and it would leave a repository where every file agrees. It would also mean ADR 0002 — written in August, deciding row-level security on `org_id` — appearing to have used a word that did not exist at the time.

The rename also touched `docs/engineering-guardrails.md`, which gate G2 watches, in two places: the name of an invariant test file, and the tenancy line in the review checklist. G2 fired and blocked the pull request. That is the gate working as designed — it cannot tell a mechanical rename from someone quietly loosening a rule, and the whole point of G2 is that it does not have to guess.

So two things need settling: what happens to the records, and what a mechanical change to a watched file arrives with.

## Decision

**Living documents carry the current vocabulary. Decision records keep theirs.**

`docs/architecture.md`, `docs/mvp-scope.md`, `docs/engineering-guardrails.md`, the checklist, `CLAUDE.md`, `HANDOFF.md` and the code all say `workspace` and `workspace_id`. `docs/adr/` is not touched. ADR 0002 still says `org_id`, because that is what it said. A reader following it to ADR 0030 learns the name changed, which is exactly the trail an ADR set is for.

The distinction is what each kind of document is *for*. A living document answers "what is true now", so vocabulary drift makes it wrong. A decision record answers "what did we decide, when, and what did we reject", so rewriting it makes it a worse record — it destroys the evidence of how the project's language evolved, and it invites a subtler failure where someone edits an accepted decision's *substance* while claiming to be tidying its words.

**A mechanical change to a G2-watched file arrives with a record, and this is that record.** Not a hollow one: the rule above is the content, and it applies to every future rename.

## Consequences

**Positive:** the ADR set stays trustworthy — nothing in it has been retouched, so a reader can rely on each record saying what was actually decided at the time. The living documents stay correct, which is what they are for. And the rule generalises: the next rename has an answer without a debate, and the answer is recorded rather than remembered.

**Negative / cost:** the repository now deliberately contains two vocabularies, and a newcomer reading `docs/adr/0002` before `docs/adr/0030` will be briefly confused by `org_id`. That is a real cost, mitigated only by ADR 0030 being findable and by the living documents being unambiguous. Searching the repository for `workspace_id` will also miss historical discussion of the same column, which matters when tracing why a decision was made.

G2 will keep firing on mechanical touches to watched files, and each one will need a record. This is the same friction ADR 0025 addressed for Dependabot's action bumps and ADR 0028 accepted for the Railway CLI pin. The pattern by now is clear: **G2's watched-file list is coarse on purpose, and the cost of that coarseness is occasional records like this one.** That cost is worth paying while the alternative is a gate that tries to guess intent.

**Rejected alternatives:**

- *Rewrite the ADRs to say `workspace`.* One command, and every file agrees afterwards. Rejected because it falsifies the record: ADR 0002 would appear to have used vocabulary that did not exist when it was written, and the honest evolution of the project's language would be gone. It also normalises editing accepted decisions, which is the specific thing `CLAUDE.md` forbids — and once that is normal, editing substance under cover of tidying words becomes easy.
- *Narrow G2 to ignore documentation-only changes to watched files.* Would have let this pull request through with no record. Rejected because `docs/engineering-guardrails.md` **is** the rules — the review checklist and the gate table live in it — so a documentation-only change to that file can be a rule change. A gate that cannot tell the difference must ask, and asking is cheap.
- *Revert the guardrails changes to avoid tripping G2.* Would leave the document naming an invariant test file that no longer exists, and telling reviewers to check `org_id NOT NULL` on a schema with no such column. Choosing a green build over a correct document is the exact failure G2 exists to prevent, arrived at from the other direction.
- *Add a note to each superseded ADR pointing forward.* Tempting middle ground. Rejected as an edit to accepted records by another name, and because the README index and the superseding record already provide the trail.

## Enforcement

G2 enforces this by construction: it will fire on the next mechanical change to a watched file, and the person making it will either write a record or reconsider the change. Both outcomes are acceptable.

Nothing machine-checks that `docs/adr/` is left alone during a rename. What protects it is that ADRs are immutable once accepted — already stated in `CLAUDE.md` and in `docs/adr/README.md` — and this record makes the vocabulary case explicit rather than leaving it to judgement.
