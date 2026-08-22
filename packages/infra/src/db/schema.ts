import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
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
 *   - an entry in TABLE_ACCESS in ./access.ts saying how it is protected (ADR 0050). A declared
 *     table missing from that registry fails G7, which is the point: forgetting to protect a table
 *     and forgetting to classify it are now the same mistake
 *   - workspace_id not null, referencing workspace
 *   - ENABLE plus FORCE ROW LEVEL SECURITY, and exactly one permissive policy, whose text must
 *     match what `canonicalPolicySql` produces (ADR 0002, ADR 0050, invariant I1). A migration is a
 *     .sql file and cannot call that function, so nothing *prevents* drift - G7 fails on it. A
 *     second permissive policy fails the build too: they combine with OR, so a second one can only
 *     widen what is visible
 *   - grants matching the entry's `appPrivileges` exactly. The bootstrap no longer grants anything
 *     on tables, so a migration that forgets them produces a table the application cannot read -
 *     which is the intended direction of failure
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
 * A person, independent of any workspace (ADR 0030, ADR 0047).
 *
 * One account can belong to several workspaces, so nothing here is tenant-scoped. It is `user-rls`
 * scoped by its own `id`: the row the application may read is the one `app.current_user` names.
 *
 * **No password column, deliberately.** A1 makes every sign-in a one-time code (ADR 0029), so there
 * is no credential on this table to steal. The code itself lives in `verification_attempt`, which is
 * still blocked pending its own migration, and that table never stores the code either.
 *
 * Sign-in cannot read this table. It runs before any principal exists, so `app.current_user` is
 * empty and the policy returns nothing. The lookup goes through a `SECURITY DEFINER` function owned
 * by `convert_auth` instead, which returns one row or none (ADR 0054).
 */
export const user = pgTable(
  'user',
  {
    id: uuid('id').primaryKey(),
    /**
     * Either identifier may be absent and at least one must be present, which is the check below.
     * A1 lets a person sign in with whichever they have, and a rep with no email is normal here.
     */
    phone: text('phone').unique(),
    email: text('email').unique(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('user_has_an_identifier', sql`${t.phone} is not null or ${t.email} is not null`),
  ],
);

/**
 * Which people are in which workspace, and in what role (R3, ADR 0032).
 *
 * This is the table that makes a workspace reachable. `workspace` is scoped by its own `id` against
 * `app.current_workspace`, so it answers "may I read this tenant" and never "which tenant am I";
 * membership answers the second question.
 *
 * Removal is `deactivated_at`, not a delete and not `deleted_at`. It is a reversible domain state
 * with rules attached (I7): a deactivated member keeps their name on the activity they wrote, and
 * their assigned work has to go somewhere before they go quiet. A tombstone column would read as an
 * absence and lose that distinction (ADR 0046).
 */
export const workspaceMember = pgTable(
  'workspace_member',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    role: memberRole('role').notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * One membership per person per workspace. Without this, "add member" run twice gives somebody
     * two roles in one workspace and every permission check has to decide which one wins.
     */
    unique('workspace_member_one_per_workspace').on(t.workspaceId, t.userId),
    /** The direction every permission check reads: given a user, which workspaces and what role. */
    index('workspace_member_by_user').on(t.userId),
  ],
);

/**
 * How a table is protected is declared in `./access.ts`, not here (ADR 0050).
 *
 * `TENANT_TABLES` and `NON_TENANT_TABLES` used to live at the bottom of this file. They classified
 * by whether a table carried a `workspace_id` column, which says nothing about a table protected
 * some other way - so `session`, which ADR 0047 scopes by `app.current_user`, would have sat in
 * `NON_TENANT_TABLES` looking perfectly correct. `TABLE_ACCESS` classifies by what G7 must demand
 * instead, and every table declared above has to appear in it.
 */
