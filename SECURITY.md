# Security Policy

Convert stores third-party customer data — the contacts, phone numbers, and message
history of Ghanaian SMEs and the people they sell to. A vulnerability here exposes
someone who never signed up for our product, so we would rather hear about a suspected
issue than not.

## Reporting

Report privately, not in a public issue:

- Open a [private security advisory](https://github.com/convertap/convert/security/advisories/new), or
- email **solomon.aboagye@amalitech.com**

Useful to include: what you did, what happened, and roughly how bad you think it is. A
proof of concept helps but is not required.

We aim to acknowledge within three working days.

## Scope

The product is pre-release: there is no production deployment and no real customer data
yet. What is in scope is this repository — the tenancy model, the messaging adapters, the
public lead-capture path, and anything that would let one organisation reach another's
data.

**Not** in scope: the placeholder values in `.env.example` (they are deliberately fake),
and findings that depend on already having database credentials.

## What we care about most

The architecture names its own load-bearing assumptions, and a break in any of these is a
serious finding:

- **Tenancy isolation.** Every tenant table carries `org_id` under PostgreSQL row-level
  security, and the application connects as a role that cannot bypass it (ADR 0002). Any
  path returning another organisation's rows is the most severe issue this project has.
- **Webhook ingress.** Provider callbacks are signature-verified before parsing.
- **The public lead form.** Unauthenticated and internet-facing by design.
- **Credential handling.** The browser never holds an API credential; the session is an
  httpOnly cookie held by the web app (ADR 0013).

## Please do not

Test against anything other than your own local instance, or access data that is not
yours. There is no production system to test against, and there will be pilot businesses'
real customers on it when there is.
