import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Schema, deliberately almost empty.
 *
 * `organization` is here because it is decision-free: it is the tenant itself, so it is
 * not org-scoped and no open product question changes its shape.
 *
 * Everything else - contact, lead, deal, activity, message, consent - waits for the
 * R1-R9 decisions in docs/pre-development-checklist.md. R1 (phone as identity) determines
 * the contact unique index, R2 and R8 determine lead-to-deal cardinality, and R3 (can a
 * rep see another rep's leads) determines whether every query carries an owner predicate.
 * Writing those tables now would bake in guesses that are expensive to reverse, which is
 * exactly the failure the checklist exists to prevent.
 *
 * When they land, each tenant table must arrive with, in the same migration:
 *   - org_id not null, referencing organization
 *   - ENABLE ROW LEVEL SECURITY plus a policy on org_id  (ADR 0002, invariant I1)
 *   - a ULID external id column                          (ADR 0004, invariant I12)
 *   - for activity and consent, revoked UPDATE and DELETE (ADR 0009, invariant I6)
 * Gate G7 asserts the RLS half of that automatically.
 */
export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Opaque external identifier. Integer and uuid keys never leave the process. */
  externalId: text('external_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tables that are tenant-scoped, for the RLS assertion in gate G7. A table added to the
 * schema without being listed here (or without RLS) fails the build.
 */
export const TENANT_TABLES: readonly string[] = [];
