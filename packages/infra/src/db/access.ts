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

/**
 * The role that owns the identity read path (ADR 0054).
 *
 * It exists because sign-in has to find an account before any principal exists, so there is nothing
 * for a policy to scope against. `convert_auth` owns `SECURITY DEFINER` functions that answer one
 * question each; `convert_app` gets `EXECUTE` and nothing else, so the unauthenticated path never
 * holds a relation it can query further.
 *
 * It is `nobypassrls` on purpose. G7 refuses a definer routine owned by a role that can bypass
 * row-level security, because such a routine is a hole with `EXECUTE` defaulting to `PUBLIC`. That
 * refusal is why this role is subject to policies like any other, and why `user` needs a policy per
 * role rather than one per table.
 */
export const AUTH_ROLE = 'convert_auth';

/** The tenant table, and the column a tenant-scoped foreign key points at (ADR 0030). */
export const TENANT_TABLE = 'workspace';
export const TENANT_KEY = 'id';

/**
 * The conventional name of a tenant column, checked *as well as* the foreign-key graph and not
 * instead of it.
 *
 * The graph is the stronger signal and it is the one that catches a child table holding tenant data
 * through its parent. It is also blind whenever there is no foreign key, and a table with a
 * `workspace_id` and no FK is not exotic - it is the idiomatic shape for an append-only event or
 * audit log, written that way deliberately so a row outlives the entity it describes. Review built
 * exactly that, classified it `role-grants` with a reason that reads perfectly well, and read every
 * tenant's rows through it. The name check existed, was deleted as redundant when the graph landed,
 * and is back because the two are complements.
 */
export const TENANT_COLUMN = 'workspace_id';

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
       * itself, which is why this is not a fixed literal. G7 asserts the column exists and is a NOT
       * NULL `uuid`, and for `workspace-rls` additionally that it references `workspace(id)` or *is*
       * it - so a plausible-looking wrong answer like `created_by_id` fails rather than isolating by
       * the wrong axis. **For `user-rls` that last assertion does not exist**, because the table it
       * would point at (`user`) is still a `TABLE_ACCESS_BLOCKERS` entry with no agreed shape; it
       * lands with CV-19.
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
    }
  | {
      /**
       * A view or a materialized view (ADR 0051).
       *
       * A view carries no policy of its own; what makes it safe is `security_invoker = true`, which
       * makes it read its base tables as the *invoking* role so their policies apply. Without the
       * option a view reads them as its owner, and migrations run as the owner - measured on
       * Postgres 16.13, a plain view over a policed table returned every tenant's rows while the
       * table itself returned one.
       *
       * A materialized view cannot be made safe at all, because row-level security is never applied
       * when reading one. So a materialized view may not reach a row-scoped table, and G7 walks the
       * dependency graph rather than trusting the definition to look harmless.
       */
      kind: 'view';
      appPrivileges: readonly TablePrivilege[];
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
 * Quote a relation name for DDL, accepting an optional `public.` prefix.
 *
 * The name is quoted rather than interpolated bare because **`user` is a reserved word**: bare
 * `create policy x on user` is a syntax error, since unquoted `user` is the keyword that means
 * `current_user`. Quoting every name costs nothing for the tables that do not need it and removes a
 * class of mistake for the one that does. The bare-identifier guard still runs on the unqualified
 * name, so nothing arbitrary reaches DDL.
 *
 * A forgotten quote elsewhere fails loudly rather than quietly, which is the one mercy of this
 * particular keyword: `select * from user` is a syntax error, not a query that returns the wrong
 * rows.
 */
const quoteRelation = (table: string): string => {
  const qualified = table.startsWith('public.');
  const bare = qualified ? table.slice('public.'.length) : table;
  if (!IDENTIFIER.test(bare)) {
    throw new Error(`table ${JSON.stringify(table)} is not a bare SQL identifier`);
  }
  return qualified ? `public."${bare}"` : `"${bare}"`;
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
  return [
    `create policy ${kind === 'workspace-rls' ? 'workspace_scope' : 'user_scope'}`,
    `  on ${quoteRelation(table)}`,
    '  as permissive',
    '  for all',
    `  to ${APP_ROLE}`,
    `  using (${scopePredicate(scopeColumn, SCOPE_GUC[kind])})`,
  ].join('\n');
};

/**
 * The second policy a `user-rls` table carries, for the role that owns the lookup functions
 * (ADR 0054).
 *
 * `convert_auth` is deliberately non-bypassing, so it is subject to this table's policies like any
 * other role. Without this policy the sign-in function would be blind: it runs as `convert_auth`,
 * and inside it `app.current_user` still holds whatever the caller set, so a self-scoped policy
 * would hide the very account it was asked to find.
 *
 * `using (true)` looks alarming and is not. Nothing connects as `convert_auth`; the only things that
 * run as it are the functions it owns, and each of those constrains its own result to one row. What
 * makes this safe is that the role has no login path the application can reach, which G7 asserts by
 * refusing any chain of membership from `convert_app` to here.
 *
 * Permissive policies combine with `OR`, so a second policy can only widen visibility. That holds
 * for two policies applicable to the *same* role, and these are not: a policy declared
 * `TO convert_auth` never enters the `OR` when `convert_app` is the current role. The rule with
 * force is one permissive policy per table and role.
 */
export const authReaderPolicySql = (table: string): string => {
  return [
    'create policy auth_reader',
    `  on ${quoteRelation(table)}`,
    '  as permissive',
    '  for select',
    `  to ${AUTH_ROLE}`,
    '  using (true)',
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
  /**
   * `SELECT` since migration one (ADR 0054). It held no privileges while nothing read it, and the
   * map recorded "how a workspace is discovered through membership" as unresolved on the reasoning
   * that a table-wide `SELECT` here would hand the application every tenant. It would not: this
   * table is `workspace-rls` scoped by its own `id`, so the grant reaches exactly the row
   * `app.current_workspace` names. Membership answers *which* workspace, and the policy answers
   * whether the application may read it.
   *
   * `UPDATE` because a workspace can be renamed, which is also why the table carries
   * `updated_at`. ADR 0046 ties the two together, and `assert:conventions` caught the mismatch
   * when this entry held `SELECT` alone. Who may rename it is a role question the application
   * answers; the policy's job is confining the statement to this tenant's own row.
   */
  workspace: { kind: 'workspace-rls', scopeColumn: 'id', appPrivileges: ['SELECT', 'UPDATE'] },

  /**
   * Scoped by the caller, not by the tenant. A person reading their own account is `user-rls`; a
   * person reading *other* people's names is the workspace member list, which this policy forbids by
   * design and a definer function serves instead (ADR 0054).
   *
   * `UPDATE` is granted so a person can edit their own profile, which the self-scoped policy limits
   * to their own row. It is also why this table carries `updated_at`: ADR 0046 requires that column
   * if and only if the application may `UPDATE`, and `assert:conventions` fails either mismatch.
   *
   * The second policy this table carries, for `convert_auth`, is not expressible here. The registry
   * says how the *application* is held; `authReaderPolicySql` says what the lookup role gets, and
   * G7 asserts both.
   */
  user: { kind: 'user-rls', scopeColumn: 'id', appPrivileges: ['SELECT', 'UPDATE'] },

  /**
   * The join that makes a workspace reachable at all. Tenant-scoped, so a member row is visible only
   * inside the workspace it belongs to.
   *
   * No `DELETE`: removing somebody is `deactivated_at`, a reversible domain state with rules (I7),
   * deliberately not a tombstone (ADR 0046). `UPDATE` is what sets it, so `updated_at` belongs here
   * too.
   */
  workspace_member: {
    kind: 'workspace-rls',
    scopeColumn: 'workspace_id',
    appPrivileges: ['SELECT', 'INSERT', 'UPDATE'],
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
  verification_attempt:
    'Mechanism decided but not built: ADR 0054 gives this table the same definer-function path as `user`, owned by convert_auth, with no table privilege for the application. It lands with the auth module, which is what writes to it. Declaring it before then would remove the blocker with nothing behind it.',
} as const;

/**
 * The `SECURITY DEFINER` functions `convert_auth` owns, and what each may return (ADR 0054).
 *
 * A registry rather than a convention, for the reason `TABLE_ACCESS` is one: the column list is part
 * of the decision. A function that returns a whole row rebuilds inside itself the leak the role
 * exists to prevent, and no gate can see that from the outside. G7 compares each function's declared
 * return columns against this list, so widening one is a change to this file that a reviewer sees.
 *
 * `search_path` is empty on every one of them and every name inside is schema-qualified. The
 * application can create objects in `public`, and a definer routine resolving an unqualified name
 * through the caller's search path is how review shadowed a table called `workspace` with a
 * temporary one.
 */
export const AUTH_FUNCTIONS = {
  auth_find_user_by_phone: {
    table: 'user',
    args: ['text'],
    returns: ['id', 'phone'],
    reason:
      'Sign-in by phone. Runs before any principal exists, so it returns one row or none rather than a relation the caller keeps.',
  },
  auth_find_user_by_email: {
    table: 'user',
    args: ['text'],
    returns: ['id', 'email'],
    reason: 'Sign-in by email. A1 allows either identifier, so both paths need one function each.',
  },
} as const;

/**
 * The tables that carry an `auth_reader` policy, derived from the functions that read them.
 *
 * Derived rather than listed, so adding a function for a new table cannot leave the policy behind.
 * The reverse also holds and G7 asserts it: an `auth_reader` policy on a table no function reads is
 * a permissive policy for a role with no reason to see it.
 */
export const AUTH_READER_TABLES: ReadonlySet<string> = new Set(
  Object.values(AUTH_FUNCTIONS).map((f) => f.table),
);

/**
 * Relation kinds `TABLE_ACCESS` can describe. Anything else in `public` fails the build.
 *
 * `r` is an ordinary table and `p` a partitioned parent; both hold or route tenant rows. `v` and `m`
 * are views and materialized views, admitted by ADR 0051 under the rules in `VIEW_OPTION` and the
 * dependency check - ADR 0050 refused them outright, which was a placeholder for the decision rather
 * than the decision. A foreign table (`f`) is still refused: it is data this database does not hold
 * and cannot police.
 */
export const CLASSIFIABLE_RELKINDS = ['r', 'p', 'v', 'm'] as const;

/**
 * The option that makes a view safe, and the exact `reloptions` entry Postgres stores for it.
 *
 * Required on **every** view, not only those that read tenant data. A view's base tables change over
 * time, so an exemption would need re-deciding on every migration, and the option costs nothing on a
 * view that reads nothing scoped. A rule with a condition in it is a rule people get wrong.
 */
export const VIEW_OPTION = 'security_invoker=true';
