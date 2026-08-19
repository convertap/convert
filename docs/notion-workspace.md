# Notion workspace

Stakeholder visibility and delivery management. What exists, what each part is for, and which system owns which fact.

**Workspace:** [Convert](https://app.notion.com/p/3c14771f641e809abeb6ddf613dabc2d), in the Team HQ teamspace.

**Status:** Built and populated on 19 August 2026. Seven databases, six sections, every row assigned to a real owner. Backlog is deliberately empty: tickets come out of the product-definition session, because R1 to R3 and R8 determine what the first stories are.

**People:** three roles, recorded here without names or addresses because this repository is public. The workspace itself names them.

| Role | Decides |
|------|---------|
| Stakeholder | Commercial and legal: pilot cohort, pilot agreement, budget, business registration and verification, kill criteria |
| Product owner | How the product behaves: product rules, scope, sign-in experience, what is in and out of the first release |
| Developer | How it is built: architecture, stack, non-functional targets, provider integration, technical spikes |

**Last updated:** 2026-08-19

---

## 1. The division of ownership

The failure mode with a Notion workspace beside a git repository is duplication. Two copies of the scope drift, and then nobody knows which is real.

| Fact | Owner | Notion's role |
|------|-------|---------------|
| Architecture, ADRs, guardrails, test strategy | **Git** | Link only. These are for engineers, versioned with the code that implements them |
| Product spec, MVP scope | **Git** | Mirror the parts stakeholders read, with a synced-from line naming the commit |
| Delivery state: backlog, ticket status, who is on what | **Notion** | Source of truth |
| Open decisions and who owes them | **Notion** | Source of truth for status. The decision itself lands in an ADR in git |
| Business rules as stated by the people who know | **Notion** | Source of truth |
| Risks, session notes, weekly status | **Notion** | Source of truth |
| External accounts and what they cost | **Notion** | Source of truth |
| Secret values | **Infisical** | Never in Notion. See §6 |

The rule in one line: **git owns how the system works, Notion owns how the work is going.**

Two deliberate exceptions, where a diagram is worth duplicating: the system context diagram and the domain model. Both exist in `architecture.md` for engineers, and again in Notion for people who will not open a repository. The Notion copies are simplified and name what they mirror.

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
│   ├── How the system fits together context diagram, the three processes, plain language
│   ├── Backlog                      database
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

## 4. Backlog

Empty until the decision session, on purpose.

- **Status** mirrors the real pull request flow. In review means a pull request is open with checks running; Done means squash-merged. The board matches GitHub instead of inventing a parallel process.
- **Size** is XS to XL, deliberately not hours. Fake precision invites schedule promises we cannot keep.
- **Waiting on** relates to Decisions.
- **Invariants touched** lists I1 to I12, so a reviewer knows what to check before work starts.
- **Definition of Done met** is gate G12, ticked at closure rather than assumed.

## 5. Risks and Sessions

**Risks** holds nine rows with likelihood, impact, mitigation, and an owner who can actually act. Impact includes *Ends the project*, used for the two that genuinely could: WhatsApp turning out shallower than the pitch assumes, and reps continuing to use personal WhatsApp instead of the shared record.

**Sessions** records every stakeholder conversation and what it concluded, related to the decisions it moved. Outcomes, not transcripts. A decision session's whole output is "these four decisions are now answered", and that belongs somewhere durable.

---

## 6. Credentials: references, never values

**No secret value goes into Notion.** Not a token, not a connection string, not a password.

This is not caution for its own sake. Notion pages get shared with guests, exported, duplicated, and searched; there is no rotation, no scoped access per secret, and no audit trail of who read what. Putting a WhatsApp token in a page would contradict ADR 0020, and that token bills per message.

The register records the secret name, what it authenticates, its environment, the Infisical path, its scope, whether a leak costs money, who rotates it, and when it was last rotated. **There is no value column, by design.** If someone needs the secret they get it from Infisical, which is the system that can grant and revoke.

Two of the eight rows are flagged *costs money if leaked*: the WhatsApp access token and the SMS API key.

**Resources and accounts** is the neighbouring database and holds no secrets either. It answers "what are we paying for and who owns it", which is the question asked when a card expires or a free tier ends. It also records the honest hosting position: free tiers do not fit three long-running processes, so a small monthly cost is unavoidable.

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
| Weekly | Status page: shipped, next, blocked, and what each person owes |
| Scope changes in git | Re-mirror the affected Product page and update its synced-from commit |

The weekly status is the one a stakeholder actually reads. Four headings, no prose padding, and the decisions grouped by the person who owes them.

---

## 8. Access and authentication

Notion is reached through the **claude.ai Notion connector over OAuth**, not through a token.

The connector is per user **and per client**. Authorising it in the Claude desktop app does not carry to the Claude Code CLI: the CLI reports the connector as connected while exposing only its authentication tools, and a call fails. Each client authorises once by running `/mcp` and selecting `claude.ai Notion`. Because it is OAuth, an agent sees exactly what that Notion account sees, which is the behaviour we want for a stakeholder workspace.

A token-based server (`@notionhq/notion-mcp-server` reading `NOTION_TOKEN`) was set up first and then removed. It is the right choice only for unattended work, such as a scheduled job posting the weekly status with no human present, and nothing does that yet. If that changes: add it to a project `.mcp.json` as a stdio server with `${NOTION_TOKEN}`, put the value in Infisical, and launch under `infisical run` (ADR 0020). The register already carries a row for the secret, marked not created yet.

Two properties of the token path worth remembering if it returns. A Notion integration sees nothing by default, so the API returns an empty workspace until someone shares a page with the integration, which looks identical to a broken token. And loading a tool's schema is not the same as the tool working: our stdio server exposed all 24 tools and returned `401 unauthorized` on every call.

---

## 9. Things that will bite the next person

**Do not name a database title property `ID`.** The connector reports the property as `userDefined:ID` in the schema, then strips the prefix on write and rejects the request with *Property "ID" not found. Did you mean "userDefined:ID"?* Both spellings fail. The Decisions title column is therefore **Decision ID**, and any new database should avoid `ID` outright.

**Dates take the plain property name.** The SQLite view of a data source shows expanded columns such as `date:Decided on:start`, but `create-pages` expects `Decided on` with an ISO date string.

**A teamspace cannot be a move target.** The move tool accepts a page, a database, or the workspace root, so relocating a page into a teamspace is a manual step in the Notion interface.

**Verify writes by reading them back.** Grouping a database by Owner and counting rows catches a silent partial write in one query, which is faster and more reliable than trusting a create or update response.

**Notion renders mermaid natively.** Diagrams are live code blocks rather than exported images, so they do not go stale the way a screenshot does.

---

## 10. Notion's built-in databases

Team HQ ships default Projects, Tasks, Meetings, and Docs databases. Projects, Tasks, and Docs go unused. Ours carry what the generic versions cannot: a relation to the decision that unblocks a ticket, invariant tags, and statuses that mirror the pull request flow. Running both would give two places to look for the same ticket, which is the drift this document exists to prevent. Unused defaults are worth archiving, because a half-used Tasks database is exactly where someone files a ticket nobody then reads.

Meetings is the one genuine alternative, since its AI notes and transcripts capture raw content better than a Sessions row. What it cannot do is relate a meeting to the decisions it moved. If recordings are used, keep the transcript in Meetings and paste its URL into the Sessions row.
