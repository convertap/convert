# Notion workspace

Stakeholder visibility and delivery management. What exists, what each part is for, and which system owns which fact.

**Workspace:** [Convert](https://app.notion.com/p/3c14771f641e809abeb6ddf613dabc2d), in the Team HQ teamspace.

**Status:** Built and populated on 19 August 2026. Eight databases, six sections, every row assigned to a real owner. Backlog is deliberately empty: tickets come out of the product-definition session, because R1 to R3 and R8 determine what the first stories are. Sprint 0 is open and carries no feature tickets, on purpose.

**People:** three roles, recorded here without names or addresses because this repository is public. The workspace itself names them.

| Role | Decides |
|------|---------|
| Stakeholder | Commercial and legal: pilot cohort, pilot agreement, budget, business registration and verification, kill criteria |
| Product owner | How the product behaves: product rules, scope, sign-in experience, what is in and out of the first release |
| Developer | How it is built: architecture, stack, non-functional targets, provider integration, technical spikes, and Fabric |

**Last updated:** 2026-08-19

---

## 1. The division of ownership

The failure mode with a Notion workspace beside a git repository is duplication. Two copies of the scope drift, and then nobody knows which is real.

| Fact | Owner | Notion's role |
|------|-------|---------------|
| Architecture, ADRs, guardrails, test strategy | **Git** | Link only. These are for engineers, versioned with the code that implements them |
| Diagrams | **Git** | Published to Notion by a script, because the people who need the picture will not clone a repository. See §9 |
| Product spec, MVP scope | **Git** | Mirror the parts stakeholders read, with a synced-from record naming the commit |
| Delivery state: backlog, sprint, ticket status, who is on what | **Notion** | Source of truth |
| Open decisions and who owes them | **Notion** | Source of truth for status. The decision itself lands in an ADR in git |
| Business rules as stated by the people who know | **Notion** | Source of truth |
| Risks, session notes, weekly status | **Notion** | Source of truth |
| External accounts and what they cost | **Notion** | Source of truth |
| Secret values | **Infisical** | Never in Notion. See §6 |

The rule in one line: **git owns how the system works, Notion owns how the work is going.**

Diagrams are the one place that rule needs help, because a diagram has two audiences. `docs/notion-mirror.json` names every Notion page derived from this repository, and gate G15 fails a pull request when a mirrored source moves without the mirror being brought up to date. §9 covers how that works and why pushing is a local command rather than a CI job.

---

## 2. Structure

```
Convert                              (in Team HQ, not Private)
├── Start here                       current state, navigation, what to read first
├── Weekly status                    shipped, next, blocked, needs a decision, grouped by person
├── Product
│   ├── What we are building         stakeholder-readable mirror of the scope
│   ├── Deck vs reality              the ten divergences from the pitch
│   ├── Domain model and vocabulary  ERD, both state machines, what each word means
│   ├── Open product questions       mirror of product-spec §12
│   └── Business rules               database
├── Delivery
│   ├── How the system fits together plain language: the three processes, the constraint
│   ├── Architecture diagrams        module map, dependency rule, topology, principals
│   ├── Backlog                      database
│   ├── Sprints                      database
│   ├── Decisions                    database
│   ├── Risks                        database
│   └── Engineering docs             links into the repository, not copies
├── Operations
│   ├── Resources and accounts       database
│   └── Credentials register         database, references only
└── Stakeholders
    ├── Who is who, and who answers which decisions
    └── Sessions                     database
```

**Deck vs reality** earns its place. It records that the published pricing tiers are not sellable from the first release, and that the marketing-ROI promise is deferred. A stakeholder who reads only the deck holds expectations the first release will not meet, and that is cheaper to correct now than at pilot launch.

**How the system fits together** and **Architecture diagrams** are deliberately two pages, not one. The first is written for a reader who will never open the repository: the context diagram is redrawn around people rather than processes, and the invariants become three plain-language properties. The second is the engineer-facing set, copied verbatim from git by a script. Merging them would mean either a machine overwriting hand-written prose or four diagrams going stale.

**Placement matters.** The page was first created in the private section, where nobody but its author could see it, which defeats the point of a stakeholder workspace. It now lives in Team HQ. Page identifiers survive a move, so nothing had to be rebuilt.

---

## 3. The two databases that carry the most weight

### Decisions

The most valuable database here, because the project's blocker is unanswered decisions rather than unwritten code. Forty rows, seeded from the checklist IDs so they stay citable in commits and in review: E0 to E7, L1 to L4, R1 to R9, A1 to A6, S1 to S7, P1 to P6.

| Property | Purpose |
|----------|---------|
| Decision ID | `R1`, `A6`, `E3`. Matches `pre-development-checklist.md` |
| Question, Recommendation | The engineering proposal, so the answer is a yes or no rather than an essay |
| Decision, Decided on | What was settled, and when |
| Status | Open, Decided, Superseded |
| Blocks build | Code cannot responsibly start until this is answered. Eleven rows carry it |
| Calendar bound | An external party controls the clock, so waiting costs the launch date |
| Blocks | Relation to Backlog, so a decision shows what it is holding up |
| Owner | Assigned by category |

Four views, because forty rows in one table is a table nobody reads: **All decisions**, **Blocking the build**, **By owner** as a board, and **Waiting on the clock** for the ones where an external party controls the timing.

Ownership follows the category, so nobody reads forty rows looking for theirs:

| Category | Owner |
|----------|-------|
| Product rule, and how reps sign in | Product owner |
| Legal, and pilot | Stakeholder |
| Stack, non-functional, tenancy and principal model | Developer |
| External provider | Split: paperwork to the stakeholder, the spike and provider choice to the developer, scope calls to the product owner |

### Business rules

Where stakeholders state how the business actually works, without being asked. The opposite direction from Decisions: a decision is engineering saying "we are blocked, please answer"; a rule is a stakeholder saying "this is how selling works here".

Each row carries a **Statement**, an **Example**, and **Edge cases**, because a rule with no example is usually still ambiguous. Nine rows are seeded from the deck and the scope, and five are marked *Needs clarification*, which is the honest status for a rule nobody has confirmed.

`Stated by` is deliberately empty on the seeded rows. They are an engineering reading of the deck rather than something a person said, and provenance is the whole point of this database. It gets filled in as rules are confirmed.

Rules relate to Decisions, so answering `R1` shows which rules it settles.

---

## 4. Backlog and sprints

**Backlog** is empty until the decision session, on purpose.

- **Status** mirrors the real pull request flow. In review means a pull request is open with checks running; Done means squash-merged. The board matches GitHub instead of inventing a parallel process.
- **Size** is XS to XL, deliberately not hours. Fake precision invites schedule promises we cannot keep.
- **Waiting on** relates to Decisions. The **Waiting on a decision** view is the one that shows why work is not moving.
- **Invariants touched** lists I1 to I12, so a reviewer knows what to check before work starts.
- **Definition of Done met** is gate G12, ticked at closure rather than assumed.

Four views: **All items**, **Board** grouped by Status for day-to-day movement, **By sprint** grouped by sprint, and **Waiting on a decision**.

**Sprints** are two weeks, and each one carries a single **Goal** stated as a sentence about the product rather than a list of tickets. If the goal needs two sentences, it is two sprints. **Committed** and **Shipped** roll up from the related backlog items, and Shipped counts Definition of Done rather than status Done, because G12 is the real bar and "moved to Done" is not.

**Goal met** and **What we learned** are answered at close. The second is the only part of a sprint that compounds, and it is the part always skipped.

Two-week cadence is a default, not a decision anyone has ratified. It sits alongside the weekly status page rather than replacing it: the status page is what a stakeholder reads, the sprint is how the work is grouped.

**Sprint 0** is open and holds no feature tickets. Writing stories for lead capture before R1 is answered means writing them twice, because whether one contact can hold several open leads changes the data model, the screens, and the tests. Its goal is to answer the eleven blocking decisions and prove inbound WhatsApp capture works.

---

## 5. Risks and Sessions

**Risks** holds ten rows with likelihood, impact, mitigation, and an owner who can actually act. Impact includes *Ends the project*, used for the two that genuinely could: WhatsApp turning out shallower than the pitch assumes, and reps continuing to use personal WhatsApp instead of the shared record.

The newest row is the Fabric dependency. Messaging is the product's strongest claim and it now runs through another in-flight product, so two schedules have to line up. The mitigation is the provider-neutral adapter contract, which keeps Meta Cloud API direct as a fallback costing one file rather than a rewrite.

**Sessions** records every stakeholder conversation and what it concluded, related to the decisions it moved. Outcomes, not transcripts. A decision session's whole output is "these four decisions are now answered", and that belongs somewhere durable.

---

## 6. Credentials: references, never values

**No secret value goes into Notion.** Not a token, not a connection string, not a password.

This is not caution for its own sake. Notion pages get shared with guests, exported, duplicated, and searched; there is no rotation, no scoped access per secret, and no audit trail of who read what. Putting a WhatsApp token in a page would contradict ADR 0020, and that token bills per message.

The register records the secret name, what it authenticates, its environment, the Infisical path, its scope, whether a leak costs money, who rotates it, and when it was last rotated. **There is no value column, by design.** If someone needs the secret they get it from Infisical, which is the system that can grant and revoke.

Two of the rows are flagged *costs money if leaked*: the WhatsApp access token and the SMS API key.

**Resources and accounts** is the neighbouring database and holds no secrets either. It answers "what are we paying for and who owns it", which is the question asked when a card expires or a free tier ends. It also records the honest hosting position: free tiers do not fit three long-running processes, so a small monthly cost is unavoidable. The two messaging rows now name **Fabric**, the in-house delivery product, which is why they are owned by the developer rather than bought from a vendor.

---

## 7. Update cadence

Notion goes stale by default, and a stale stakeholder page is worse than none because it is believed.

| Trigger | Update |
|---------|--------|
| A pull request opens | Backlog row to In review, PR link attached |
| A pull request merges | Backlog row to Done, Definition of Done ticked |
| A decision lands | Decisions row: outcome, date, status. The ADR goes to git in the same sitting |
| A stakeholder states a rule | Business rules row, with an example and its edge cases |
| A meeting happens | Sessions row: what was concluded, and which decisions moved |
| A new external account or service | Resources row |
| A secret added or rotated | Credentials register row. The value goes to Infisical |
| A sprint starts | New Sprints row with one goal, items related in, previous sprint set to Complete |
| A sprint ends | Goal met answered honestly, and What we learned filled in |
| Weekly | Status page: shipped, next, blocked, and what each person owes |
| A mirrored document changes in git | G15 fails the build and names the page. See §9 |

The weekly status is the one a stakeholder actually reads. Four headings, no prose padding, and the decisions grouped by the person who owes them.

---

## 8. Access and authentication

Notion is reached through the **claude.ai Notion connector over OAuth**, not through a token.

The connector is per user **and per client**. Authorising it in the Claude desktop app does not carry to the Claude Code CLI: the CLI reports the connector as connected while exposing only its authentication tools, and a call fails. Each client authorises once by running `/mcp` and selecting `claude.ai Notion`. Because it is OAuth, an agent sees exactly what that Notion account sees, which is the behaviour we want for a stakeholder workspace.

A token is needed for exactly one thing, which the connector cannot do: `tools/push_notion_mirror.py` running unattended under `infisical run`. `.env.example` documents `NOTION_TOKEN` and the credentials register carries a row for it, marked not created yet. Nothing else uses it, and CI never sees it.

Three properties of the token path worth remembering.

**A connection starts with access to nothing.** Notion calls these connections now, previously
integrations. Creating one grants no access at all: it is not a read-only view of the workspace,
it is an empty workspace. Access is granted per page, and children inherit it, so connecting the
two mirrored pages is the whole grant. A connection also never exceeds the access of the person
who created it.

**Distinguish the two failures, because they are not the same call.** A bad or missing token
returns `401 unauthorized`. A valid token asking for a page that has not been connected returns
`404`, the same answer as a page identifier that does not exist: as far as that token is
concerned, the page is not there. So a 404 means either not connected or wrong id, and never says
which. `tools/push_notion_mirror.py` prints both readings when it sees one, because guessing
wrong costs an hour.

**Loading a tool's schema is not the same as the tool working.** An earlier stdio server exposed
all 24 tools and returned `401 unauthorized` on every call.

---

## 9. Keeping Notion and git in step

Six diagrams belong to git and are published here. Four of them were missing from Notion entirely until this was built, and two of them, the lead and deal state machines, existed **only** in Notion: a domain rule that invariants I4 and I5 depend on, living in a page anyone could edit with no history a reviewer would see. Both failures were silent, which is the argument for a mechanism rather than a convention.

`docs/notion-mirror.json` is the register. Each entry names the Notion page, the source sections it is built from, and a hash of that source taken when the page was last brought up to date. Each mirror is one of two kinds, and the kind decides what a machine may do:

| Kind | Meaning | What a machine may do |
|------|---------|-----------------------|
| `verbatim` | The Notion content is the same mermaid block that is in git | Overwrite it. There is nothing human in the copy |
| `editorial` | The page is a rewrite for a non-engineering reader | Nothing. Report the drift to a person and let them decide |

Two commands:

```bash
python tools/check_notion_mirror.py            # gate G15
python tools/check_notion_mirror.py --list     # what is mirrored from where

infisical run --env=dev -- python tools/push_notion_mirror.py   # publish the diagrams
python tools/push_notion_mirror.py --accept                     # record a hand-updated page
```

**The gate does no network access.** It compares the manifest against the working tree, so it needs no token, cannot flake, and behaves the same on a laptop as in CI. A gate that needs a credential is a gate that eventually gets skipped.

**Pushing is local, never CI.** Notion has no revert-by-commit and no branch protection, so a bad automated write to a page a stakeholder is reading is not recoverable the way a bad commit is. This repository is also public, and a workspace-write token in Actions would put the whole workspace at risk to automate one page. ADR 0021 records the full reasoning and the alternatives rejected.

The pusher is bounded in code: it can only replace the body of a mermaid code block that already exists on the target page. It never creates a block, never deletes one, and never touches prose, tables, or callouts. If a page holds fewer mermaid blocks than the manifest addresses, it refuses rather than guessing. `--accept` refuses to stamp a verbatim mirror, so the manifest cannot claim a diagram is published when it is not.

Two limits worth stating plainly. Section headings are load-bearing: renaming one breaks the manifest until it is repointed, which the gate reports as a distinct error rather than as drift. And G15 cannot see an edit made directly in Notion, because it never leaves the machine.

For that second one there is a separate check, which needs the token and so is not part of CI:

```bash
infisical run --env=dev -- python tools/push_notion_mirror.py --verify
```

It compares every published block against git and writes nothing. Worth running if a diagram in Notion ever looks wrong, since the answer is either "somebody edited it here" or "the push never happened".

**What it covers is narrower than "the mirrored pages", and the boundary is worth knowing.** It
compares mermaid code blocks belonging to `verbatim` entries. Nothing else, including the prose on
those same pages.

| On a mirrored page | Owner | Caught by |
|--------------------|-------|-----------|
| A mermaid block registered as `verbatim` | git | `--verify`, and overwritten by the pusher |
| Headings and commentary around it | whoever writes them in Notion | nothing, deliberately |
| An `editorial` page's whole body | whoever writes it in Notion | nothing. G15 only reports when the *source* moves |

So a `verbatim` page is really a mixed page: machine-owned diagrams inside human-owned framing.
That is intentional. The framing exists to make a diagram readable by someone who will not open the
repository, it is written for that audience, and a generator would flatten it, which is the same
argument that keeps the editorial pages editorial. The callout on **Architecture diagrams** says
which half is which, because a blanket "do not edit this page" would be false and would stop people
improving the words.

The cost of that choice, stated plainly: page framing lives only in Notion, with no version history
a reviewer would see. It is accepted for a few sentences of commentary. It would not be acceptable
for a domain rule, which is exactly why the two state machines were moved into git.

Both verbatim mirrors were published on 19 August 2026 and verified byte-identical to git. The `pending` flag they shipped with is gone; it exists for the window between registering a mirror and first publishing it, when the gate reports the mirror without failing, because there is no earlier state for it to have drifted from.

---

## 10. Things that will bite the next person

**Do not name a database title property `ID`.** The connector reports the property as `userDefined:ID` in the schema, then strips the prefix on write and rejects the request with *Property "ID" not found. Did you mean "userDefined:ID"?* Both spellings fail. The Decisions title column is therefore **Decision ID**, and any new database should avoid `ID` outright.

**Date properties take the expanded keys, not the property name.** Writing `Dates` alongside `date:Dates:start` fails with *Date type must be expanded*. Pass `date:Dates:start` and, for a range, `date:Dates:end`, and do not pass the bare name at all.

**Mention a person with `user://<uuid>`, not a page URL.** A cell containing `https://app.notion.com/p/<user-id>` is accepted, silently stored as plain text, and renders as a raw URL. `<mention-user url="user://146d872b-..."/>` renders as the person. The failure is silent in both directions: the write succeeds and the page looks wrong.

**A board hides empty groups and the API cannot change that.** The view DSL has no directive for it, so a board created for an empty database looks broken until the first row lands. Toggle *Show empty groups* in the interface once.

**A rollup cannot target a relation or another rollup.** Counting related items means rolling up the related database's **title** with `count`, not rolling up the relation property. The error names the property rather than the rule, which sends you looking in the wrong place.

**DDL statements are all-or-nothing.** A batch that adds a relation and then a rollup over it fails as a batch, because the rollup is validated before the relation exists. Add the relation, then the rollups.

**A teamspace cannot be a move target.** The move tool accepts a page, a database, or the workspace root, so relocating a page into a teamspace is a manual step in the Notion interface.

**Verify writes by reading them back.** Grouping a database by Owner and counting rows catches a silent partial write in one query, which is faster and more reliable than trusting a create or update response. Three of the gotchas above were found this way and would not have been found otherwise.

**Notion renders mermaid natively.** Diagrams are live code blocks rather than exported images, so they do not go stale the way a screenshot does. This is also what makes a verbatim mirror possible, and it is why the ASCII box-drawing diagrams in the documentation were converted to mermaid.

**Truncating a diff hides the thing the diff exists to show.** `--verify` first printed the opening
88 characters of each side, which for a mermaid block is the `flowchart TD` line and the first node,
identical on both sides while the actual difference sat three lines down. It reported the mismatch
correctly and then displayed two apparently equal strings. It prints a real line diff now. A check
whose output cannot be acted on is only half a check.

---

## 11. Notion's built-in databases

Team HQ ships default Projects, Tasks, Meetings, and Docs databases. Projects, Tasks, and Docs go unused. Ours carry what the generic versions cannot: a relation to the decision that unblocks a ticket, invariant tags, and statuses that mirror the pull request flow. Running both would give two places to look for the same ticket, which is the drift this document exists to prevent. Unused defaults are worth archiving, because a half-used Tasks database is exactly where someone files a ticket nobody then reads.

Meetings is the one genuine alternative, since its AI notes and transcripts capture raw content better than a Sessions row. What it cannot do is relate a meeting to the decisions it moved. If recordings are used, keep the transcript in Meetings and paste its URL into the Sessions row.
