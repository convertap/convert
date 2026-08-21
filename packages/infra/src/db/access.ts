/**
 * Who may touch which table, and how it is enforced (ADR 0050).
 *
 * One registry, keyed by table name, replacing `TENANT_TABLES` and `NON_TENANT_TABLES`. Those two
 * lists classified by *presence of a `workspace_id` column*; ADR 0047's `IDENTITY_TABLES` classified
 * by *domain*. Neither answers the question G7 needs answered - what must be true of this table for
 * it to be safe - so a table could satisfy the first completely while failing what the second cared
 * about. A map also makes membership in exactly one class unrepresentable rather than checked.
 *
 * The class names what is enforced, never what the table is about. "Identity" is a domain word and
 * lives in the glossary, because two of ADR 0047's three identity tables must not have the policy
 * the third requires.
 *
 * Two independent reviews of the first version of this file each found a table shape that passed
 * every check while leaking every tenant, and both shapes came from the same mistake: trusting a
 * *name* to tell the gate what a table holds. `role-grants` was policed by looking for a column
 * called `workspace_id`, so a child table with a foreign key to tenant data and no such column of
 * its own - `lead_note(lead_id)` - classified itself out of the tenancy boundary with a `reason`
 * a reviewer would nod at. What a table is reachable from is a property of the schema graph, not of
 * its column names, so the gate now reads foreign keys.
 */

/** Privileges the application role may be granted on a table. */
export type TablePrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Privileges no table grants the application role, ever. Row-level security governs none of them:
 * TRUNCATE empties a table without visiting a row, REFERENCES lets a foreign key probe for the
 * existence of rows a policy hides, and TRIGGER runs code. A policy is no defence against any of
 * the three, so the grant is the only control and the answer is not to grant it.
 *
 * The first version of this gate checked these on `role-grants` tables only - that is, on every
 * class except the two that hold tenant data. `grant truncate on contact to convert_app` passed.
 */
export const FORBIDDEN_PRIVILEGES = ['TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

/** The role the application connects as (ADR 0042). Policies name it; nothing names PUBLIC. */
export const APP_ROLE = 'convert_app';

/** The tenant table, and the column a tenant-scoped foreign key points at (ADR 0030). */
export const TENANT_TABLE = 'workspace';
export const TENANT_KEY = 'id';

/**
 * The session variable each row-level-security class scopes by.
 *
 * `app.current_workspace` is the tenant boundary of ADR 0002 and ADR 0042. `app.current_user` is
 * ADR 0047's identity boundary, set with `SET LOCAL` inside the transaction and never with a bare
 * `SET`, because the api runs on a connection pool and a bare `SET` outlives the request.
 */
export const SCOPE_GUC = {
  'workspace-rls': 'app.current_workspace',
  'user-rls': 'app.current_user',
} as const;

/**
 * A bare lower-case SQL identifier. Everything this module interpolates into DDL is tested against
 * it first, because `scopeColumn` reaches `create policy` as text.
 */
export const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

export type TableAccess =
  | {
      kind: 'workspace-rls';
      /**
       * The column the policy scopes by. Almost always `workspace_id`; it is `id` on `workspace`
       * itself, which is why this is not a fixed literal. G7 asserts the column exists, is a NOT
       * NULL `uuid`, and either references `workspace(id)` or *is* it - so a plausible-looking
       * wrong answer like `created_by_id` fails rather than isolating by the wrong axis.
       */
      scopeColumn: string;
      appPrivileges: readonly TablePrivilege[];
    }
  | {
      kind: 'user-rls';
      scopeColumn: string;
      appPrivileges: readonly TablePrivilege[];
    }
  | {
      kind: 'role-grants';
      appPrivileges: readonly TablePrivilege[];
      /**
       * Why this table needs no policy. Required, and required to be non-empty, because
       * TypeScript's `string` admits `''` and an unexplained absence of protection is the thing
       * ADR 0050 exists to stop reading as a decision.
       *
       * A reason is not a defence. The gate independently refuses this class to any table with a
       * foreign-key path to tenant data, precisely because a confident sentence here is what a
       * reviewer accepts instead of checking.
       */
      reason: string;
    };

/**
 * The canonical policy body, and the single definition of it.
 *
 * The `nullif` is load-bearing rather than stylistic: without it an empty context raises `invalid
 * input syntax for uuid` instead of returning no rows, so a forgotten context becomes a 500 rather
 * than an empty list (ADR 0042, verified against Postgres 16 on 21 August 2026).
 */
export const scopePredicate = (scopeColumn: string, guc: string): string => {
  if (!IDENTIFIER.test(scopeColumn)) {
    throw new Error(`scopeColumn ${JSON.stringify(scopeColumn)} is not a bare SQL identifier`);
  }
  return `${scopeColumn} = nullif(current_setting('${guc}', true), '')::uuid`;
};

/**
 * The whole policy, as a migration must reproduce it. One permissive `FOR ALL` policy per table,
 * granted to the application role by name. `WITH CHECK` is deliberately omitted: on an `ALL` policy
 * Postgres uses the `USING` expression for both visible rows and newly added ones, so omitting it
 * leaves one expression to verify instead of two that can disagree.
 *
 * Migrations are drizzle-kit `.sql` files and cannot call this function, so this does not *prevent*
 * drift - it defines the text a migration has to match, and G7 fails when a live policy differs.
 */
export const canonicalPolicySql = (
  table: string,
  kind: keyof typeof SCOPE_GUC,
  scopeColumn: string,
): string => {
  if (!IDENTIFIER.test(table.replace(/^public\./, ''))) {
    throw new Error(`table ${JSON.stringify(table)} is not a bare SQL identifier`);
  }
  return [
    `create policy ${kind === 'workspace-rls' ? 'workspace_scope' : 'user_scope'}`,
    `  on ${table}`,
    '  as permissive',
    '  for all',
    `  to ${APP_ROLE}`,
    `  using (${scopePredicate(scopeColumn, SCOPE_GUC[kind])})`,
  ].join('\n');
};

/**
 * Every table declared in `schema.ts`, and what G7 demands of it.
 *
 * An inventory of *declared* tables, updated in the same change as the migration that creates the
 * table. `workspace` is the one entry that predates its migration, because it was declared in
 * Drizzle long before there was a migration to pair it with.
 *
 * `workspace` is `workspace-rls` scoped by its own `id`, not `role-grants`. It is a row-scoped
 * table: the one row the application may see is exactly the one `app.current_workspace` names. It
 * holds no privileges yet because nothing reads it, and the class still has to say what will be
 * true when something does - otherwise the first migration creates the tenant table itself with no
 * policy on it, and adding one later is an ALTER against populated data.
 */
export const TABLE_ACCESS = {
  workspace: { kind: 'workspace-rls', scopeColumn: 'id', appPrivileges: [] },
} as const satisfies Record<string, TableAccess>;

/**
 * Names reserved because their access mechanism is unresolved, not classified.
 *
 * ADR 0047 justified `verification_attempt` having no row-level security with a grant "restricted
 * to the identifier presented". Postgres grants restrict operations and columns; they have no
 * concept of a row predicate, so `grant select` there hands the application every row, and the same
 * reasoning applied to `user` hands it every account. ADR 0050 removed the mechanism and left the
 * replacement to CV-19.
 *
 * These entries classify nothing and satisfy no coverage requirement. G7 fails if either table is
 * declared or migrated, with the reason below. Removing an entry belongs to the same change that
 * decides the mechanism, declares the table, migrates it and tests it - a blocker lifted before the
 * mechanism exists is worse than the blocker, because the next reader takes the absence for a
 * decision.
 */
export const TABLE_ACCESS_BLOCKERS = {
  user: 'Read path unresolved: a grant cannot scope rows, and sign-in looks a user up before any principal exists. See CV-19 and ADR 0050.',
  verification_attempt:
    'Read path unresolved: ADR 0047 assumed a grant could restrict reads to the identifier presented, which Postgres grants cannot do. See CV-19 and ADR 0050.',
} as const;

/**
 * Relation kinds `TABLE_ACCESS` can describe. Anything else in `public` fails the build.
 *
 * `r` is an ordinary table and `p` a partitioned parent; both hold or route tenant rows. Views and
 * materialized views are deliberately *not* here, and their absence is a refusal rather than an
 * omission: a view over a tenant table runs with its owner's rights unless it sets
 * `security_invoker`, and since migrations run as the owner that means it bypasses the policy
 * entirely; a materialized view is never subject to row-level security at all, so its contents stay
 * readable by anyone holding `SELECT` on it. Both were invisible to the first version of this gate
 * and both were shown to leak. Adding one needs a decision about which, not a registry entry.
 */
export const CLASSIFIABLE_RELKINDS = ['r', 'p'] as const;
