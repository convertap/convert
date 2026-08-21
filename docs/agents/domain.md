# Domain docs

**Last updated:** 2026-08-21

How the engineering skills should consume this repository's documentation.

## Layout

**Single-context**, despite the pnpm workspace. `packages/contracts`, `core`, `application` and
`infra` are *layers of one domain*, not separate bounded contexts, and their allowed dependencies
are enforced by `.boundaries.json` and gate G1. So there is one `docs/adr/` at the root and no
`CONTEXT-MAP.md`.

There is **no `CONTEXT.md` yet**. Its glossary — contact, lead, deal, workspace, product, invoice —
was settled on 21 August (ADR 0030 to ADR 0040), so it can now be written; `/domain-modeling` should
create it from those records rather than from scratch. Until then, proceed silently; do not flag
its absence.

## Before exploring, read these

`CLAUDE.md` holds the authoritative precedence order and wins over this list.

- **`docs/mvp-scope.md`** — authoritative build scope. Wins on anything in scope.
- **`docs/product-spec.md`** — intent, not scope. §12 open questions, §13 divergences **including
  amendment A**, the 21 August scope change that admitted products, invoices, tax and payments.
- **`docs/pre-development-checklist.md`** — cite the stable IDs (E0–E9, L1–L4, R1–R9, A1–A6,
  S1–S9, P1–P6). §10 is the decision log.
- **`docs/architecture.md`** — §3 stack, §6 domain model and invariants I1–I12, §7 tenancy.
- **`docs/adr/`** — 40 records. Read the ones touching your area. **0029–0040 carry the product
  rules**, so most questions about *why the model is shaped this way* are answered there.
- **`docs/engineering-guardrails.md`** — layout, the dependency rule, gates G1–G15.
- **`HANDOFF.md`** — what is half-finished, unproven, and will bite.

## Use the project's vocabulary

- **Workspace**, not workspace. Renamed 21 August (ADR 0030); it is the tenant and the only
  tenancy boundary.
- **Lead status** (`New → Contacted → Qualified → Converted → Lost`) is **not** the **deal pipeline**
  (`New → Contacted → Qualified → Proposal → Won/Lost`). Two state machines. Never collapse them.
- A **deal covers one product** (ADR 0031), so a lead may have several. A deal is not an order.
- Money is **GHS in integer pesewas**, never floating point (I8), and prices are snapshotted onto
  deals and invoice lines.
- Provider names are not domain language. WhatsApp, SMS, Meta, Fabric, Hubtel and Cloudflare reach
  the domain only through ports (ADR 0005, 0029, 0034); none may appear in contacts, leads,
  campaigns, tasks or activities.

## Do not invent product facts

If neither `mvp-scope.md` nor `product-spec.md` answers a question, add it to `product-spec.md` §12
instead of filling the gap. Scope conflicts are not yours to resolve: if the two documents disagree
on something not already in §13, add it there and flag it.

## Flag ADR conflicts

If your output contradicts an ADR, surface it rather than silently overriding:

> _Contradicts ADR 0002 (RLS as the tenancy boundary) — but worth reopening because…_

Changing `.boundaries.json`, `.github/workflows/ci.yml`, or `docs/engineering-guardrails.md`
requires an ADR in the same commit; G2 enforces it. Never edit a rule to make a red build green.
