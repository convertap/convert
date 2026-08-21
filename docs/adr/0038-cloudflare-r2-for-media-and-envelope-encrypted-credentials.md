# ADR 0038 - Cloudflare R2 for media, and envelope encryption for tenant credentials

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0033 put a reusable media library in scope and ADR 0034 put payment collection behind each workspace's own merchant account. Both created infrastructure needs this project had never had, recorded as checklist items **S8** (object storage) and **S9** (per-workspace credential storage). Both were marked blocking, and both needed their own decision before a line of code touched them.

**S8 has a subtlety worth stating, because getting it backwards is easy.** The rule that web, api and Postgres share one region exists because every *render* is web → api → db, so a split deployment costs two intercontinental round trips against a 2.5 s LCP budget. Images do not travel that path — the browser fetches them directly. Pinning them to Amsterdam would therefore be actively wrong: it gives them the latency of the render path without the reason for it. Product photos want an edge close to Accra.

**S9 is the higher-stakes half.** ADR 0020 puts secrets in Infisical, which is correct for a handful of environment secrets and wrong for thousands of tenant-owned API keys. ADR 0034 already named the consequence: a breach here reaches every pilot SME's payment account at once, which makes it the highest-value target in the system.

## Decision

### Object storage: Cloudflare R2

**Cloudflare R2**, S3-compatible, with derivatives generated at upload and a size ceiling enforced server-side rather than hoped for.

Two properties decided it. **Zero egress fees**, which matters because a media library's whole point is that images are fetched repeatedly — by people on metered mobile data, from list views, all day. And a **global edge**, which puts bytes closer to Ghanaian users than any single region can.

**Only the primary derivative loads in list views.** Never the original, never the gallery. G9 is the enforcement: a pipeline or contact screen carrying full-size product photos misses the budget the product's entire differentiation claim rests on.

### Tenant credentials: envelope encryption

**A per-workspace data key, AES-256-GCM, wrapped by a master key held in Infisical and never in Postgres.** The database stores only wrapped keys and ciphertext, so a database dump on its own is useless — the attacker needs the master key too, and that lives somewhere else entirely.

Operationally: **write-only from the interface**, never returned by any API, never logged, never in an error message, with a documented rotation path for both the data keys and the master key.

**And the better option, to be checked first:** if Hubtel offers OAuth, take a revocable token instead of storing an API secret. A credential we can revoke centrally beats one we must protect indefinitely. That is a question for the Hubtel integration work, and it does not change the storage design — it reduces what has to be stored.

## Consequences

**Positive:** R2's zero egress removes the one cost that scales with exactly the behaviour we want (people browsing products), and the edge is a latency improvement over the same-region rule rather than an exception to it. S3 compatibility means the provider is replaceable with a config change. On the credential side, splitting the master key from the data means the most likely breach — a database compromise — yields nothing usable, which is the single highest-value control available here. Write-only handling also removes the temptation to build a "show credential" screen, which is how secrets end up in screenshots and support tickets.

**Negative / cost:** a second infrastructure vendor beyond Railway, with its own account, billing and outage surface, and one that is not in the deployment region — so a Cloudflare incident degrades product images while the app stays up. Derivative generation at upload means an upload is slower and can fail after the original has landed, which needs a cleanup path. On credentials, envelope encryption is genuinely more machinery than a single encrypted column: two key layers, a rotation procedure that must be practised rather than documented, and a master key whose loss makes every stored credential unrecoverable — an availability risk traded knowingly for a confidentiality gain. And it puts a hard dependency on Infisical at runtime for payment operations, not just at deploy time.

**Rejected alternatives:**

- *Railway volumes.* Already in the stack, no new vendor. Rejected because a volume is block storage attached to one service, not object storage: no CDN, no edge, no signed URLs, and it makes images a deployment concern rather than an asset.
- *AWS S3 with CloudFront.* The default choice, and it works. Rejected on egress pricing, which is the cost that grows with the usage pattern this feature exists to encourage, and on the operational weight of a second cloud account for one bucket.
- *Storing images in Postgres as bytes.* No new vendor at all. Rejected: it puts binary weight in the database backups, the connection pool and the row cache, and serves every byte through the api the same-region rule was written to keep short.
- *Infisical for per-workspace credentials.* Consistent with ADR 0020 and tempting for that reason. Rejected because it is a secret store for an application's own configuration, not a multi-tenant vault: thousands of tenant paths, no per-tenant isolation model, and a runtime dependency on every payment.
- *A single application-wide encryption key.* Much simpler. Rejected because one key compromise exposes every tenant, and rotation means re-encrypting everything at once rather than per workspace.
- *Not storing credentials at all — the SME re-enters them per transaction.* Perfectly secure and unusable.

## Enforcement

- **G9** is the real guard on the media library: only primary derivatives in list views, and the budget fails the build if that slips.
- A new invariant that a credential is never returned by any API response, and a test asserting the serialiser omits it — the cheapest protection against a future change quietly widening a DTO.
- A `.boundaries.json` forbidden-external keeping the storage and crypto clients inside `packages/infra`, so no layer above can reach either directly.
- Rotation is only real once practised: a rehearsed master-key rotation, on the test environment, before the first real credential is stored. An undrilled rotation procedure is a document, not a control.
- S8 and S9 close with this record.
