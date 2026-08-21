# Issue tracker: Notion

**Last updated:** 2026-08-21

Work for this repository is tracked in the **Backlog** database in Notion, under Delivery:

- Database: <https://app.notion.com/p/bfb174b7965943bd9c2ffd020a516a63>
- Data source: `collection://9b891fd6-7677-4404-be51-0a43e4d50e13`

Reached through the claude.ai Notion connector over MCP. That connection is **per client**, so run
`/mcp` once per machine or every call fails while the connector reports itself connected.

Notion is not one of the trackers `setup-matt-pocock-skills` ships first-class support for — it
offers GitHub, GitLab and local markdown. It does support an **"Other"** tracker described in prose,
which is what this file is. Every operation the engineering skills need is defined below in Notion
terms.

GitHub Issues was considered and rejected: this repository is public, and the Backlog already exists
in Notion with the vocabulary the scope document uses. Local markdown was rejected because it is
invisible to everyone but the machine it sits on.

**One rule that overrides convenience.** Notion is private; this repository is not. Named pilot
businesses (P1), the written kill criteria (P6), and margin figures live in Notion **only**, and
never travel into a commit message, an ADR, or a pull request body.

## The schema, and what each field is for

| Property | Type | Use |
|----------|------|-----|
| `Name` | title | The ticket's name. Refer to tickets by this, never by a bare number |
| `Ticket` | auto id | Stable identifier. Rides *inside* a name, never instead of it |
| `Type` | select | `Feature` · `Bug` · `Chore` · `Spike` · `Decision` |
| `Status` | select | `Backlog` · `Ready` · `In progress` · `In review` · `Blocked` · `Done` |
| `Wayfinder` | select | `map` · `research` · `prototype` · `grilling` · `task`. Empty on ordinary build tickets |
| `Part of` / `Parts` | self-relation | Child → map, and map → children |
| `Blocked by` / `Blocks` | self-relation | Dependencies between tickets |
| `Waiting on` | relation → Decisions | The *decision* that unblocks this ticket, which is not the same as another ticket blocking it |
| `Owner` | person | Who holds it. Empty means unclaimed |
| `Area` | select | From `mvp-scope.md` §19, so the board and the scope share one vocabulary |
| `Invariants touched` | multi-select | I1–I12. Tells a reviewer what to check before work starts |
| `Size` | select | XS–XL. Deliberately not hours |
| `Priority` | select | P0–P3 |
| `PR` | url | The pull request |
| `Definition of Done met` | checkbox | Gate G12, ticked at closure rather than assumed |

## Conventions

- **Read the schema before writing.** Fetch the data source first; property names are authoritative
  there, not here.
- **Date properties take expanded keys** — `date:Name:start`, not the bare name. Passing the bare
  name errors. Checkboxes take `"__YES__"` / `"__NO__"`.
- Comments and conversation go in the page body under a `## Comments` heading, or as Notion comments.
- A ticket that changes a rule still needs its ADR in git. Notion tracks *how the work is going*;
  git owns *how the system works*. Link, never fork.

## When a skill says "publish to the issue tracker"

Create a page in the Backlog data source. Always set `Name`, `Type`, `Status` and `Area`. Set
`Invariants touched` when the work goes near I1–I12 — it is the cheapest way to tell a reviewer
what to look at.

## When a skill says "fetch the relevant ticket"

Fetch the page by URL, or query the data source by `Ticket` or `Name`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one Backlog row; its tickets are rows related to it.

- **Map**: a row with `Wayfinder = map`, `Type = Decision`. Its page body holds the Notes,
  Decisions-so-far and Fog sections.
- **Child ticket**: a row with `Part of` → the map, and `Wayfinder` set to the ticket type
  (`research` / `prototype` / `grilling` / `task`). The question goes in the page body.
- **Blocking**: the `Blocked by` self-relation, which is Notion's native mechanism and renders in
  the UI, so the frontier is visible without opening the map. A ticket is **unblocked** when every
  row in its `Blocked by` is `Done`.
- **Frontier**: rows where `Part of` is the map, `Status` is not `Done`, `Owner` is empty, and every
  `Blocked by` row is `Done`. Lowest `Ticket` first.

  ```sql
  SELECT "Ticket", "Name", "Status", "Owner", "Blocked by"
  FROM "collection://9b891fd6-7677-4404-be51-0a43e4d50e13"
  WHERE "Part of" LIKE '%<map-page-id>%' AND "Status" != 'Done'
  ORDER BY "Ticket"
  ```

  Then drop any row with an owner, and any row whose `Blocked by` targets are not all `Done`.
  `Blocked by` holds page URLs, so resolving it needs a second read — do that rather than guessing.
- **Claim**: set `Owner` and `Status = In progress`, and save **before** any work. This is the
  session's first write, and it is what stops two sessions taking the same ticket.
- **Resolve**: append the answer to the page body under an `## Answer` heading, set
  `Status = Done`, then append a one-line pointer with its link to the map's Decisions-so-far.
- **Refer by name.** In anything a human reads, name the map and its tickets. A wall of
  `#42, #43, #44` is illegible; the number rides inside the name.

## Where a resolved decision goes

A resolved wayfinder ticket is the working note that produced a decision, not the decision itself.
When one resolves into something durable:

1. **Write the ADR** in `docs/adr/`, citing the checklist ID it settles.
2. **Move the Decisions row** to `Decided` with the outcome and date — including what was rejected.
   A decided item left `Open` is how a project loses track of itself, and it has happened here.
3. **Update `docs/pre-development-checklist.md`** — the item's status and a §10 decision-log row.
4. **Add a Changelog row** saying what changed and *why*.

Do not invent product facts to close a ticket. If neither `mvp-scope.md` nor `product-spec.md`
answers it and no human has decided, the ticket stays open. That is a real blocker, and recording it
as one is the point.

## Tripwires, each of which has already cost time

- Never name a title property `ID`.
- Mention a person with `user://<uuid>`; a page URL is silently stored as plain text.
- A board view hides empty groups and the view DSL cannot change it.
- A rollup cannot target a relation or another rollup.
- DDL is all-or-nothing: add a relation before any rollup over it.
- No secrets, ever. Infisical holds values; Notion holds references only.
