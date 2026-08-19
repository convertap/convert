# Notion workspace

Stakeholder visibility and delivery management. What exists, what each part is for, and which system owns which fact.

**Workspace:** [Convert](https://app.notion.com/p/3c14771f641e809abeb6ddf613dabc2d)

**Status:** Built and populated on 19 August 2026. Backlog is deliberately empty: tickets come out of the product-definition session, because R1 to R3 and R8 determine what the first stories are.

**Last updated:** 2026-08-19

---

## 1. The division of ownership

The failure mode with a Notion workspace beside a git repository is duplication. Two copies of the scope drift, and then nobody knows which is real.

| Fact | Owner | Notion's role |
|------|-------|---------------|
| Architecture, ADRs, guardrails, test strategy | **Git** | Link only. These are for engineers, versioned with the code that implements them |
| Product spec, MVP scope | **Git** | Mirror the parts stakeholders read, with a "synced from" line naming the commit |
| Delivery state: backlog, ticket status, who is on what | **Notion** | Source of truth |
| Open decisions and who owes them | **Notion** | Source of truth for status. The decision itself lands in an ADR in git |
| Risks, meeting notes, weekly status | **Notion** | Source of truth |
| External accounts and what they cost | **Notion** | Source of truth |
| Secret values | **Infisical** | Never in Notion. See §5 |

The rule in one line: **git owns how the system works, Notion owns how the work is going.**

---

## 2. Structure

```
Convert                            (parent page, shared with the integration)
├── Start here                     what this is, current state, who to ask
├── Weekly status                 the stakeholder heartbeat
├── Product
│   ├── What we are building       mirror of mvp-scope, stakeholder-readable
│   ├── Deck vs reality            the product-spec §13 divergence table
│   └── Open product questions     mirror of product-spec §12
├── Delivery
│   ├── Backlog                    database
│   ├── Decisions                  database
│   ├── Risks                      database
│   └── Engineering docs           links into the repo, not copies
└── Operations
    ├── Resources and accounts     database
    └── Credentials register       database, references only
```

**Deck vs reality** earns its place. It is the table recording that the published pricing tiers are not sellable from the MVP and that the marketing-ROI promise is deferred. A stakeholder who reads only the deck holds expectations the MVP will not meet, and that is cheaper to correct now than at pilot launch.

---

## 3. Backlog database

| Property | Type | Values and why |
|----------|------|----------------|
| Name | title | The ticket |
| Status | select | Backlog, Ready, In progress, In review, Blocked, Done. Mirrors the real PR flow, so the board matches GitHub instead of inventing a parallel process |
| Type | select | Feature, Bug, Chore, Spike, Decision |
| Area | select | Foundation, Customer, Sales, Communication, Insights, Platform. Taken from `mvp-scope.md` §19 so the board and the scope use one vocabulary |
| Priority | select | P0 to P3 |
| Blocked by | relation to self | Real blocking order, which is what `to-tickets` produces |
| Decision ref | text | `R3`, `E0`. Ties a ticket to the decision that unblocks it |
| Invariants touched | multi-select | I1 to I12. Makes the review checklist obvious before work starts |
| PR | url | The GitHub pull request |
| Size | select | XS, S, M, L, XL. Deliberately not hours: fake precision invites schedule promises we cannot keep |
| Owner | person | |
| Definition of Done met | checkbox | Gate G12, checked at closure rather than assumed |

**Status maps to the git workflow.** In review means a pull request is open with checks running. Done means squash-merged, not "code finished".

## 4. Decisions database

This is the most valuable database in the workspace, because the project's real blocker today is fifteen unanswered decisions, not unwritten code.

| Property | Type | Notes |
|----------|------|-------|
| ID | title | `R1`, `A6`, `E3`, matching `pre-development-checklist.md` so the IDs stay citable |
| Question | text | |
| Category | select | Product rule, Auth, Legal, External provider, Stack, Pilot |
| Recommendation | text | The engineering proposal, so the decision is a yes or no rather than an essay |
| Decision | text | What was actually settled |
| Status | select | Open, Decided, Superseded |
| Calendar-bound | checkbox | True where an external party controls the clock, such as Meta verification. These are the ones where waiting costs the launch date |
| Blocks | relation to Backlog | What cannot start until this is answered |
| Owner | person | |
| Due | date | |
| Decided on | date | |

Seed it from the checklist: E0 to E7, L1 to L4, R1 to R9, A1 to A6, S1 to S7, P1 to P6. When one is decided, the ADR goes in git and the row records the outcome and the date.

---

## 5. Credentials: references, never values

**No secret value goes into Notion.** Not a token, not a connection string, not a password.

This is not caution for its own sake. Notion pages get shared with guests, exported, duplicated, and searched; there is no rotation, no scoped access per secret, and no audit trail of who read what. Putting a WhatsApp token in a page contradicts ADR 0020 an hour after we adopted it, and the token bills per message.

What the register holds instead:

| Property | Type | Notes |
|----------|------|-------|
| Secret name | title | `NOTION_TOKEN`, `DATABASE_URL` |
| What it authenticates | text | |
| Environment | select | dev, staging, prod |
| Stored at | text | The Infisical path. A pointer, not a value |
| Owner | person | Who rotates it |
| Scope | text | What the credential can actually do, which is what makes a leak assessable |
| Rotation cadence | select | 30, 90, 180 days, or On incident |
| Last rotated | date | |
| Next due | formula | |

There is no value column, by design. If someone needs the secret, they get it from Infisical, which is the system that can grant and revoke.

**Resources and accounts** is the neighbouring database and holds no secrets either: service, purpose, environment, owner, plan and monthly cost, status, console URL. It answers "what are we paying for and who owns it", which is the question that gets asked when a card expires or a free tier ends.

---

## 6. Update cadence

Notion goes stale by default, and a stale stakeholder page is worse than none because it is believed.

| Trigger | Update |
|---------|--------|
| A pull request opens | Backlog row to In review, PR link attached |
| A pull request merges | Backlog row to Done, Definition of Done checked |
| A decision lands | Decisions row: outcome, date, status. The ADR goes to git in the same sitting |
| A new external account or service | Resources row |
| A secret added or rotated | Credentials register row. The value goes to Infisical |
| Weekly | Status page: shipped, next, blocked, decisions owed by stakeholders |
| Scope changes in git | Re-mirror the affected Product page and update its synced-from commit |

The weekly status is the one a stakeholder actually reads. Four headings, no prose padding: **shipped**, **next**, **blocked**, **needs a decision from you**.

---

## 7. Access and authentication

Notion is reached through the **claude.ai Notion connector over OAuth**, not through a token.

The connector is per user **and per client**. Authorising it in the Claude desktop app does not carry to the Claude Code CLI: the CLI reports the connector as connected while exposing only its authentication tools, and a call fails. Each client authorises once by running `/mcp` and selecting `claude.ai Notion`. Because it is OAuth, an agent sees exactly what that Notion account sees, which is the behaviour we want for a stakeholder workspace.

A token-based server (`@notionhq/notion-mcp-server` reading `NOTION_TOKEN`) was set up first and then removed. It is the right choice only for unattended work, such as a scheduled job posting the weekly status with no human present, and nothing does that yet. If that changes: add it to a project `.mcp.json` as a stdio server with `${NOTION_TOKEN}`, put the value in Infisical, and launch under `infisical run` (ADR 0020). The register already carries a row for the secret, marked not created yet.

Two properties of the token path worth remembering if it returns. A Notion integration sees nothing by default, so the API returns an empty workspace until someone shares a page with the integration, which looks identical to a broken token. And loading a tool's schema is not the same as the tool working: our stdio server exposed all 24 tools and returned `401 unauthorized` on every call.

## 8. Two things that will bite the next person

**Do not name a database title property `ID`.** The connector reports the property as `userDefined:ID` in the schema, then strips the prefix on write and rejects the request with *Property "ID" not found. Did you mean "userDefined:ID"?* Both spellings fail. The Decisions title column is therefore **Decision ID**, and any new database should avoid `ID` outright.

**Dates take the plain property name.** The SQLite view of a data source shows expanded columns such as `date:Decided on:start`, but `create-pages` expects `Decided on` with an ISO date string.
