import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  CONSENT_CHANNELS,
  INVOICE_STATES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MEMBER_ROLES,
  MESSAGE_STATUSES,
  PAYMENT_ORIGINS,
  PRODUCT_KINDS,
} from '@convert/contracts';

/**
 * Schema, deliberately almost empty.
 *
 * `workspace` is the tenant itself, so it is not workspace-scoped and no product
 * question changes its shape. Renamed from `organization` on 21 August 2026 (ADR 0030).
 *
 * Everything else - contact, lead, deal, activity, message, consent, product, invoice -
 * is now decided but not yet written. R1 to R9 and A1 to A6 landed on 21 August as
 * ADR 0029 to ADR 0040, so the shapes are no longer guesses. What is still open is the
 * migration plan: which tables land first, and in what order. That is being worked as
 * the Schema and migration plan map, and the standing rule is that the first migration
 * is the one that makes the tenancy boundary real.
 *
 * When they land, each tenant table must arrive with, in the same migration:
 *   - workspace_id not null, referencing workspace
 *   - ENABLE ROW LEVEL SECURITY plus a policy on workspace_id  (ADR 0002, invariant I1)
 *   - a ULID primary key in a `uuid` column, supplied by the application, no default
 *     (ADR 0043, invariant I12)
 *   - for activity and consent, revoked UPDATE and DELETE (ADR 0009, invariant I6)
 *
 * And the column conventions that repeat on every table (ADR 0046), so no table invents
 * its own:
 *   - money is `bigint` pesewas in a column named `*_pesewas`, read as a JS bigint, never
 *     `mode: 'number'`. There is no currency column: I8 fixes it to GHS
 *   - rates are integer basis points in a column named `*_bp`. VAT is 1500, not 15.00
 *   - no column is numeric, decimal, money, real or double precision, anywhere
 *   - every timestamp is `timestamptz`. No `date` columns: a due point is an instant (I11)
 *   - `created_at` on every table, not null. Redundant with the ULID's own timestamp, and
 *     worth it, because only application code can read that out of a `uuid` column
 *   - `updated_at` if and only if the table accepts UPDATE. On an insert-only table it is
 *     a column that can never change, which a reader would wrongly trust
 *   - `deleted_at` on media_asset alone. Soft delete everywhere means every query carries a
 *     second mandatory predicate, and the one that forgets it leaks rather than errors
 *   - member deactivation is `deactivated_at`, deliberately not `deleted_at`: it is a
 *     reversible domain state with rules (I7), not an absence
 *
 * Gate G7 asserts the RLS half automatically, and `assert:conventions` asserts the column
 * half. Both run without migrations and both say so when there is nothing to check.
 */
/**
 * Closed sets whose values are product rules become native Postgres enums (ADR 0044).
 *
 * Built from the tuples in @convert/contracts rather than restated here, so the database
 * type, the domain's union types and the browser's labels cannot drift apart. Declaration
 * order is preserved, and a Postgres enum sorts by declaration - so `order by status`
 * gives funnel order rather than alphabetical.
 *
 * Deal stage is deliberately not here. It is a `pipeline_stage` row, because pipelines are
 * per workspace and the deck promises editable ones later (architecture.md section 6).
 */
export const leadStatus = pgEnum('lead_status', LEAD_STATUSES);
export const leadSource = pgEnum('lead_source', LEAD_SOURCES);
export const memberRole = pgEnum('member_role', MEMBER_ROLES);
export const invoiceState = pgEnum('invoice_state', INVOICE_STATES);
export const paymentOrigin = pgEnum('payment_origin', PAYMENT_ORIGINS);
export const productKind = pgEnum('product_kind', PRODUCT_KINDS);
export const consentChannel = pgEnum('consent_channel', CONSENT_CHANNELS);
export const messageStatus = pgEnum('message_status', MESSAGE_STATUSES);

export const workspace = pgTable('workspace', {
  /**
   * The ULID, and the only identifier (ADR 0043). Stored in a `uuid` column because a
   * ULID is exactly 128 bits and so is a uuid: 16 fixed-width bytes, native indexing,
   * and the same sort order, where text would cost 26 bytes on every key and every
   * foreign key. Convert with `ulidToUuid` / `uuidToUlid` from @convert/contracts.
   *
   * No `defaultRandom()`, deliberately. The application supplies the id, because the
   * outbox pattern needs it before the insert (ADR 0011). A row inserted by hand then
   * fails loudly on the not-null constraint instead of quietly receiving an id the
   * outbox never saw.
   */
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tables that are tenant-scoped, for the RLS assertion in gate G7. A table added to the
 * schema without being listed here (or without RLS) fails the build.
 */
export const TENANT_TABLES: readonly string[] = [];
