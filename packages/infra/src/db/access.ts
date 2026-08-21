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
 */

/**
 * Privileges as Postgres spells them in `information_schema.role_table_grants.privilege_type`, so
 * the assertion compares strings rather than mapping between two vocabularies.
 */
export type TablePrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Privileges no table grants the application role, ever. Row-level security governs none of them:
 * TRUNCATE empties a table without visiting a row, REFERENCES lets a foreign key probe for the
 * existence of rows a policy hides, and TRIGGER runs code. A policy is no defence against any of
 * the three, so the grant is the only control and the answer is not to grant it.
 */
export const FORBIDDEN_PRIVILEGES = ['TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

/** The role the application connects as (ADR 0042). Policies name it; nothing names PUBLIC. */
export const APP_ROLE = 'convert_app';

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

export type TableAccess =
  | { kind: 'workspace-rls'; scopeColumn: string }
  | { kind: 'user-rls'; scopeColumn: string }
  | {
      kind: 'role-grants';
      appPrivileges: readonly TablePrivilege[];
      /**
       * Why this table needs no policy. Required, and required to be non-empty, because
       * TypeScript's `string` admits `''` and an unexplained absence of protection is the thing
       * ADR 0050 exists to stop reading as a decision.
       */
      reason: string;
    };

/**
 * The canonical policy body, and the single definition of it.
 *
 * A migration writes this and G7 asserts it, from the same function, so the two cannot drift. The
 * `nullif` is load-bearing rather than stylistic: without it an empty context raises `invalid input
 * syntax for uuid` instead of returning no rows, so a forgotten context becomes a 500 rather than an
 * empty list (ADR 0042, verified against Postgres 16 on 21 August 2026).
 */
export const scopePredicate = (scopeColumn: string, guc: string): string =>
  `${scopeColumn} = nullif(current_setting('${guc}', true), '')::uuid`;

/**
 * The whole policy, as a migration should write it. One permissive `FOR ALL` policy per table,
 * granted to the application role by name. `WITH CHECK` is deliberately omitted: on an `ALL` policy
 * Postgres uses the `USING` expression for both visible rows and newly added ones, so omitting it
 * leaves one expression to verify instead of two that can disagree.
 */
export const canonicalPolicySql = (
  table: string,
  kind: 'workspace-rls' | 'user-rls',
  scopeColumn: string,
): string =>
  [
    `create policy ${kind === 'workspace-rls' ? 'workspace_scope' : 'user_scope'}`,
    `  on ${table}`,
    '  as permissive',
    '  for all',
    `  to ${APP_ROLE}`,
    `  using (${scopePredicate(scopeColumn, SCOPE_GUC[kind])})`,
  ].join('\n');

/**
 * Every table declared in `schema.ts`, and what G7 demands of it.
 *
 * An inventory of *declared* tables, updated in the same change as the migration that creates the
 * table. `workspace` is the one exception, and a temporary one: it was declared in Drizzle long
 * before there was a migration to pair it with.
 */
export const TABLE_ACCESS = {
  workspace: {
    kind: 'role-grants',
    appPrivileges: [],
    reason:
      'No direct application access until workspace discovery through membership is designed. ' +
      'A table-wide SELECT here would hand convert_app every tenant row, which is the opposite ' +
      'of what the tenancy boundary is for.',
  },
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
