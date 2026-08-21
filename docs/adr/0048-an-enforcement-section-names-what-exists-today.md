# ADR 0048 - An Enforcement section names what exists today

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Three review passes over one branch on 21 August 2026 found eleven separate defects, and after
sorting them, ten were the same defect: **a rule written down and not enforced anywhere.** Not
eleven kinds of carelessness — one kind, repeated, in every part of the repository that describes
itself.

The instances are worth listing, because the pattern is invisible one at a time:

- **ADR 0042** states in bold that the application connects with `DATABASE_URL_APP` and never with
  `DATABASE_URL`. Both composition roots read `DATABASE_URL`, from before the record was accepted.
  Its Enforcement section named G7 and the bootstrap, both of which exist and both of which are
  real — and neither of which looks at the two lines where the rule actually applies.
- **ADR 0045** was written in the present tense throughout: requests are validated, the cursor is
  the ULID, the `Buffer` call is deleted. None of it existed. `nestjs-zod` was not even a
  dependency. Its Enforcement section named `.boundaries.json` and the review checklist, both of
  which exist, so nothing about the record looked wrong.
- **G10's second half** — an endpoint with no summary or typed response fails the build — was
  documented in `engineering-guardrails.md` from 18 August and implemented by nothing until this
  branch.
- **G4** is documented as "lint passes, no new warnings". The script was `eslint .` with no
  `--max-warnings`, so a warning exited 0 and the gate reported green. There was a warning.
- **G6** is listed among the gates doing real work. All twelve invariant specs are `test.todo`, so
  it checks that twelve files exist.
- **`architecture.md` §16** promised server-side revocation on member deactivation, which the
  identity-only session of ADR 0047 deliberately does not do.
- **`CONTRIBUTING.md`** described a repository with no `package.json` and no NestJS app.
- **The checklist** claimed a staging Postgres major version that the record it cited never states.

Every one of those was written by someone who believed it. That is what makes the pattern
dangerous rather than sloppy: **a document that overstates enforcement retires a question that is
still open.** The next person reads "enforced by G7", stops thinking about it, and builds on a
guarantee that is not there. An open question costs a conversation; a falsely closed one costs
whatever was built on top of it.

The genre matters too. An ADR's Decision section is *meant* to be written in the decisive present —
"the application connects as `convert_app`" is the correct voice for a decision, not a claim about
today's code. So the tense cannot carry the distinction, and the Enforcement section has to.

## Decision

**An Enforcement section says what exists today, and says plainly what does not.** It is a
statement about the repository at the moment of writing, not about the intended end state. When a
mechanism is decided but unbuilt, the section says so in those words — "not built", "lands with the
first migration", "no code does this yet" — and names what will build it where that is known.

**"Nothing yet" is a valid and preferred answer.** A record whose Enforcement section reads
*"nothing enforces this; it lands with the auth module"* is finished and honest. A record that
names a gate which does not look at the rule is neither, and is worse than the first, because it
reads as covered.

**A gate named in an Enforcement section must assert the record's own rule, not merely exist.**
This is the specific trap ADR 0042 fell into. G7 was real, ran on every push, and proved things
worth proving — none of them the sentence the record put in bold. Naming a neighbouring gate is
how a rule goes unenforced while looking enforced.

**When a record's rule applies to specific lines of code, the Enforcement section names them.**
"Both composition roots read `DATABASE_URL_APP` and refuse to boot without it, held by a unit test
per runtime" is checkable in a minute. "G7 covers the database roles" is not.

**Reviewing this is a human gate, G11, and a line on the review checklist**: when a diff adds or
changes an ADR, its Enforcement section is read against the repository rather than accepted.

## Consequences

**Positive:** the cheapest question a reviewer can ask — "does this exist?" — gets asked at the
moment the claim is made rather than three sessions later by a model reading the whole tree. An
honest "nothing yet" also makes the missing work visible, which is how it gets a ticket: the
absence of enforcement for ADR 0045 became a P1 backlog item the moment it was written down as an
absence rather than implied as done.

It also makes the vacuous-gate ledger maintainable. That table only works if a gate's entry is
written by someone willing to say the gate proves nothing, and this rule makes that the expected
answer rather than an admission.

**Negative / cost:** it makes records longer and less satisfying to write. "Enforced by G7" reads
finished; "nothing enforces this yet, and here is what will" reads unfinished, which is the point
and will still feel like a step backwards. It also puts a maintenance burden on accepted records: a
section that was true when written goes stale the day the mechanism lands, and nothing catches
that. Superseding is not the tool — the decision has not changed — so the honest move is editing
the Enforcement section of an accepted record, which ADR 0041 permits precisely because it is not
the Decision.

**Rejected alternatives:**

- *A CI gate that resolves every path and script named in an Enforcement section and fails on one
  that does not exist.* Written and measured before being rejected: across all 47 records it finds
  **zero** unresolved references today. It would have caught none of the ten defects above, because
  every one of them named a mechanism that exists and does not do the job. Shipping it would have
  added a fifth gate that passes because there is nothing to check, in a repository that keeps a
  list of those — and it would have felt like enforcement, which is worse than no gate at all.
- *A semantic check that a named gate actually asserts the record's rule.* This is the check that
  would have worked, and it is not decidable by a script. Naming it here so the idea is not
  rediscovered as a plan.
- *A required marker per bullet — built / not built.* Mechanically checkable, and it would mean
  retrofitting a convention across 47 records to catch a mistake that reads as obvious once the
  question is asked out loud. Rejected on cost, and worth revisiting if the human gate proves
  insufficient rather than assumed to be so now.
- *Refusing `Accepted` status until enforcement exists.* Conflates two different things. ADR 0029
  was correctly Accepted with nothing built: the product owner had decided, and the decision was in
  force. Status tracks whether a decision binds, not whether code caught up.

## Enforcement

Written in the spirit of its own rule, so: **no gate enforces this, and none can.**

- **`docs/adr/template.md`** carries the requirement in the Enforcement section's own guidance, so
  it is in front of whoever writes the next record. That is a prompt, not a check.
- **`docs/adr/README.md`** states it under *Writing one*, which is the page a new contributor is
  sent to.
- **`docs/code-review-checklist.md`** carries the line that makes it G11, a human gate. This is the
  actual mechanism, and its failure mode is a reviewer skimming, which is the same failure mode as
  every other line on that list.
- Nothing verifies the claim automatically. The rejected alternatives above explain why the obvious
  gate was built, measured at zero findings, and thrown away rather than shipped.
