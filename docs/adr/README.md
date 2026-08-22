# Architecture Decision Records

One file per decision. Numbered, immutable once accepted, superseded rather than edited. The point is that six months from now the reasoning is recoverable. Including the alternatives that were rejected, which is the part memory loses first.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-nextjs-web-nestjs-on-fastify-api-and-a-worker-in-one-monorep.md) | Next.js web, NestJS on Fastify API, and a worker in one monorepo | Accepted |
| [0002](./0002-postgresql-row-level-security-as-the-tenancy-boundary.md) | PostgreSQL row-level security as the tenancy boundary | Proposed |
| [0003](./0003-principal-abstraction-covering-sessions-api-clients-and-the.md) | Principal abstraction covering sessions, API clients, and the worker | Proposed |
| [0004](./0004-ulid-external-identifiers.md) | ULID external identifiers | Superseded by 0043 |
| [0005](./0005-provider-agnostic-messaging-ports.md) | Provider-agnostic messaging ports | Proposed |
| [0006](./0006-unified-bidirectional-message-record-with-forward-only-statu.md) | Unified bidirectional message record with forward-only status | Proposed |
| [0007](./0007-derived-conversation-window-state-surfaced-in-the-ui.md) | Derived conversation-window state, surfaced in the UI | Proposed |
| [0008](./0008-consent-as-an-append-only-record.md) | Consent as an append-only record | Proposed |
| [0009](./0009-append-only-activity-log-distinct-from-system-audit.md) | Append-only activity log, distinct from system audit | Proposed |
| [0010](./0010-postgres-backed-job-queue-rather-than-a-redis-broker.md) | Postgres-backed job queue rather than a Redis broker | Proposed |
| [0011](./0011-outbox-events-as-the-single-source-for-notifications-and-fut.md) | Outbox events as the single source for notifications and future webhooks | Proposed |
| [0012](./0012-performance-budget-enforced-in-ci.md) | Performance budget enforced in CI | Proposed |
| [0013](./0013-nextjs-as-a-bff-the-browser-never-holds-an-api-credential.md) | Next.js as a BFF: the browser never holds an API credential | Proposed |
| [0014](./0014-a-shared-contracts-package-is-the-only-coupling-between-web.md) | A shared contracts package is the only coupling between web and api | Proposed |
| [0015](./0015-openapi-generated-from-code-and-committed.md) | OpenAPI generated from code and committed to the repository | Accepted |
| [0016](./0016-shadcn-primitives-with-convert-owned-tokens.md) | shadcn primitives with Convert-owned tokens, in the web app | Accepted |
| [0017](./0017-drizzle-as-the-query-layer.md) | Drizzle as the query layer and migration tool | Accepted |
| [0018](./0018-errors-are-first-class.md) | Errors are a first-class part of the product | Accepted |
| [0019](./0019-protected-main-with-pull-request-only-changes.md) | Protected main, pull-request-only changes, and local hooks | Accepted |
| [0020](./0020-infisical-as-the-secret-store.md) | Infisical as the secret store, with secrets injected rather than filed | Accepted |
| [0021](./0021-mirror-notion-from-git-with-a-drift-gate.md) | Mirror Notion from git, and gate on drift rather than pushing automatically | Accepted |
| [0022](./0022-staging-on-railway-in-amsterdam.md) | Staging on Railway in Amsterdam, database included | Accepted |
| [0023](./0023-bound-every-ci-step-in-time.md) | Bound every CI step in time, and make apt wait deliberately | Accepted |
| [0024](./0024-deploy-through-ci-not-straight-from-a-push.md) | Deploy through CI, not straight from a push | Accepted |
| [0029](./0029-authentication-by-one-time-code-over-a-verification-port.md) | Authentication by one-time code, over a verification port | Accepted |
| [0030](./0030-the-workspace-is-the-tenant.md) | The workspace is the tenant, and a contact is identified within it | Accepted |
| [0031](./0031-a-deal-is-a-per-sku-opportunity.md) | A deal is a per-SKU opportunity, and a lead may have many | Accepted |
| [0032](./0032-visibility-is-per-member-and-claiming-does-not-block.md) | Visibility is granted per member, and claiming a lead does not wait for approval | Accepted |
| [0033](./0033-commerce-products-invoices-and-tax.md) | Products, invoices and tax enter the MVP, and what that costs | Accepted |
| [0034](./0034-payments-collect-to-the-smes-own-account.md) | Payments settle to the SME's own mobile money account | Accepted |
| [0035](./0035-platform-admin-crosses-tenancy-only-by-audited-action.md) | A platform admin crosses tenancy only by an audited action | Accepted |
| [0036](./0036-whatsapp-direct-to-meta-fabric-for-sms-and-codes.md) | WhatsApp goes direct to Meta; Fabric carries SMS and sign-in codes | Accepted |
| [0037](./0037-facebook-and-instagram-lead-ads-are-in-scope.md) | Facebook and Instagram lead ads are in scope | Accepted |
| [0038](./0038-cloudflare-r2-for-media-and-envelope-encrypted-credentials.md) | Cloudflare R2 for media, and envelope encryption for tenant credentials | Accepted |
| [0039](./0039-hubtel-for-payments-and-a-two-stage-invoice-compliance-path.md) | Hubtel for payments, and a two-stage path to lawful invoicing | Accepted |
| [0040](./0040-consent-operating-rules.md) | How consent is captured, blocked on, and withdrawn | Accepted |
| [0041](./0041-decision-records-are-not-rewritten-when-vocabulary-changes.md) | Decision records are not rewritten when vocabulary changes | Accepted |
| [0042](./0042-two-database-roles-so-rls-is-not-advisory.md) | Two database roles, so row-level security is not advisory | Accepted |
| [0043](./0043-the-ulid-is-the-primary-key.md) | The ULID is the primary key | Accepted |
| [0044](./0044-closed-sets-are-enums-where-they-are-product-rules.md) | Closed sets are Postgres enums where they are product rules, and tables where a workspace configures them | Accepted |
| [0045](./0045-zod-schemas-are-the-single-source-for-the-openapi-document.md) | Zod schemas are the single source for the OpenAPI document, adapted to Nest in the api layer | Accepted |
| [0046](./0046-column-conventions-for-money-time-and-history.md) | Column conventions for money, time and history | Accepted |
| [0047](./0047-sessions-are-stored-revocable-and-identity-only.md) | Sessions are stored, revocable, and identity-only | Accepted |
| [0048](./0048-an-enforcement-section-names-what-exists-today.md) | An Enforcement section names what exists today | Accepted |
| [0049](./0049-promote-through-develop-testing-staging-and-main.md) | Promote through develop, testing, staging and main | Accepted |
| [0050](./0050-one-table-access-registry-classified-by-what-the-gate-demands.md) | One table access registry, classified by what the gate demands | Accepted |
| [0051](./0051-views-run-with-the-invokers-rights.md) | Views run with the invoker's rights, and a materialized view may not read tenant data | Accepted |
| [0052](./0052-the-migration-owner-bypasses-row-level-security.md) | The migration owner bypasses row-level security, deliberately | Accepted |

Statuses: **Proposed** (written, not yet ratified) · **Accepted** (in force) · **Superseded** (replaced, kept for the record) · **Rejected** (considered and declined, kept so it is not re-litigated).

Most records here are **Proposed**: they were extracted from `architecture.md` so they could be cited and argued with. They become Accepted at the technical design sign-off, and their Consequences sections get completed then, an accepted ADR with an empty Consequences section is not finished.

## Writing one

1. Copy [`template.md`](./template.md) to `NNNN-short-slug.md`, taking the next free number.
2. Fill in Context before Decision. If the context does not make the decision feel forced, the decision is probably arbitrary.
3. Name the rejected alternatives and why they lost. This is the section future readers need most.
4. State how it is enforced. A CI gate, a boundary rule, a test, or a checklist line. A decision with no enforcement is a preference.
5. **Say what exists today, and say plainly what does not** (ADR 0048). The Enforcement section is
   a statement about the repository right now, not about the intended end state — the Decision
   section already carries that, in the decisive present, which is why the tense cannot be the
   thing that distinguishes them. **"Nothing yet" is a valid and preferred answer**, and a record
   reading *"nothing enforces this; it lands with the auth module"* is finished. A gate you name
   has to assert *this record's* rule rather than merely exist and sound relevant: naming a
   neighbouring gate is how a rule goes unenforced while reading as covered, and it has happened
   here more than once. A document that overstates enforcement retires a question that is still
   open, and the next person builds on a guarantee that is not there.

## Superseding one

Never edit an accepted record's Decision. Write a new ADR, set its **Supersedes** field, and set the old one's **Superseded by**. Both stay in the repository.

## The pairing rule

Changing `.boundaries.json`, `.github/workflows/ci.yml`, or `docs/engineering-guardrails.md` requires an ADR in the same pull request. CI gate G2 enforces it, via `tools/check_adr_discipline.py`. The failure mode it prevents: a red guardrail gets fixed by editing the rule, and the reason disappears.
