# Triage labels

**Last updated:** 2026-08-21

The engineering skills speak in terms of five canonical triage roles. This file maps them onto the
Backlog database's own fields, because the tracker is Notion and there are no labels to apply
(`docs/agents/issue-tracker.md`).

| Role in mattpocock/skills | How it is expressed here |
|---------------------------|--------------------------|
| `needs-triage` | `Status = Backlog` with no `Area` or `Size` set |
| `needs-info` | `Status = Blocked`, with `Waiting on` pointing at the Decisions row that would unblock it |
| `ready-for-agent` | `Status = Ready`, `Size` set, `Invariants touched` filled in |
| `ready-for-human` | `Status = Ready` with `Owner` set to a person |
| `wontfix` | The row is deleted, or `Status = Done` with the reason in the body |

Using existing fields rather than adding a label property is deliberate: the board already reads
this way for stakeholders, and a second parallel vocabulary would need reconciling against the first.

`needs-info` carries most of the weight on this project, and `Waiting on` is what makes it useful —
it names the decision rather than leaving "blocked" as a mood. As of 21 August four decisions still
block build work: L2 and L3's legal text, E2's WhatsApp number, and E8's invoice certification.

`/wayfinder` uses its own `Status` values on the same rows — `In progress` for a claimed ticket,
`Done` for a resolved one. That is expected: a wayfinder ticket is a question being worked, not an
issue being triaged.
