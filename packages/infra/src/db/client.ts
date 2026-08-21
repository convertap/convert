import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Database access, and the one place the workspace context is set.
 *
 * ADR 0002 puts row-level security at the tenancy boundary, which imposes a rule that is
 * easy to state and easy to get wrong: `SET LOCAL` must run on the SAME pooled connection
 * as the statements that follow it. `withWorkspaceContext` is therefore the only way to obtain a
 * transaction - acquiring a connection and setting its context cannot be separated,
 * because doing so is how one workspace's data leaks into another's request.
 */
export type Database = ReturnType<typeof createDatabase>;

export const createDatabase = (connectionString: string) => {
  const pool = new Pool({
    connectionString,
    max: 10,
    // A held connection with a stale workspace context is worse than a slow query.
    idleTimeoutMillis: 30_000,
  });
  return drizzle(pool, { schema });
};

/**
 * Runs `fn` inside a transaction whose workspace context is set for its duration.
 * SET LOCAL is scoped to the transaction, so it cannot outlive it or leak to the next
 * borrower of the connection.
 */
export const withWorkspaceContext = async <T>(
  db: Database,
  workspaceId: string,
  fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_workspace', ${workspaceId}, true)`);
    return fn(tx);
  });

/**
 * For migrations and the RLS assertion only. Application code must never use this: a
 * query with no workspace context is a query RLS cannot protect.
 */
export const withoutWorkspaceContext = async <T>(db: Database, fn: (db: Database) => Promise<T>) =>
  fn(db);
