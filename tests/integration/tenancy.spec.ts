import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '@convert/infra';

/**
 * The tenancy boundary, exercised rather than asserted (G8, invariant I1).
 *
 * G7 reads the catalogue and proves the policies and grants are the ones the registry declares.
 * That is a different question from whether the boundary holds, and the difference is not academic:
 * the identity lookup function passed every G7 subcheck while failing at runtime with `permission
 * denied for table user`, because a policy filters rows and a grant permits the operation, and it
 * had only the first. Nothing that reads the catalogue could have caught it. Calling the function
 * caught it immediately.
 *
 * So these tests connect as the application role and ask what it can actually see.
 *
 * Two connections on purpose (ADR 0042). The owner sets fixtures up because it bypasses row-level
 * security (ADR 0052); the application role is the subject under test and must never be handed the
 * owner's credential, which is the mistake that would make every assertion below vacuous.
 */

const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL_APP;

// Fixture ids are fixed rather than generated so a failure names the same row twice running, and
// scoped to this file's prefix so a parallel spec cannot collide with them.
const AMA = '00000000-0000-0000-0000-00000000fa01';
const BEN = '00000000-0000-0000-0000-00000000fb01';
const TENANT_A = '00000000-0000-0000-0000-00000000faaa';
const TENANT_B = '00000000-0000-0000-0000-00000000fbbb';
const MEMBER_A = '00000000-0000-0000-0000-00000000fc01';
const MEMBER_B = '00000000-0000-0000-0000-00000000fc02';

const AMA_PHONE = '+233200000901';
const BEN_PHONE = '+233200000902';

describe('the tenancy boundary as the application role sees it', () => {
  let owner: Database;
  let app: Database;

  beforeAll(async () => {
    if (!OWNER_URL || !APP_URL) {
      throw new Error(
        'DATABASE_URL and DATABASE_URL_APP must both be set. Running this suite with one ' +
          'connection would test the owner against itself and pass while proving nothing.',
      );
    }
    owner = createDatabase(OWNER_URL);
    app = createDatabase(APP_URL);

    await owner.execute(sql`
      insert into "user" (id, phone, email, name) values
        (${AMA}, ${AMA_PHONE}, 'ama@example.test', 'Ama'),
        (${BEN}, ${BEN_PHONE}, 'ben@example.test', 'Ben')
    `);
    await owner.execute(sql`
      insert into workspace (id, name) values (${TENANT_A}, 'Tenant A'), (${TENANT_B}, 'Tenant B')
    `);
    await owner.execute(sql`
      insert into workspace_member (id, workspace_id, user_id, role) values
        (${MEMBER_A}, ${TENANT_A}, ${AMA}, 'owner'),
        (${MEMBER_B}, ${TENANT_B}, ${BEN}, 'owner')
    `);
  });

  afterAll(async () => {
    if (!owner) return;
    await owner.execute(sql`delete from workspace_member where id in (${MEMBER_A}, ${MEMBER_B})`);
    await owner.execute(sql`delete from workspace where id in (${TENANT_A}, ${TENANT_B})`);
    await owner.execute(sql`delete from "user" where id in (${AMA}, ${BEN})`);
  });

  /**
   * `SET LOCAL` inside the transaction, never a bare `SET`. The api runs on a pool, so a bare `SET`
   * outlives the request and the next borrower of that connection inherits somebody else's context.
   */
  const asAma = async <T>(fn: (tx: never) => Promise<T>): Promise<T> =>
    app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_workspace', ${TENANT_A}, true)`);
      await tx.execute(sql`select set_config('app.current_user', ${AMA}, true)`);
      return fn(tx as never);
    });

  const countIn = async (tx: never, statement: ReturnType<typeof sql>): Promise<number> => {
    const result = await (tx as unknown as Database).execute<{ n: string }>(statement);
    return Number(result.rows[0]?.n ?? -1);
  };

  it('sees its own workspace and no other', async () => {
    const n = await asAma((tx) => countIn(tx, sql`select count(*) as n from workspace`));
    expect(n).toBe(1);
  });

  it('sees only its own workspace members', async () => {
    const n = await asAma((tx) => countIn(tx, sql`select count(*) as n from workspace_member`));
    expect(n).toBe(1);
  });

  it('sees its own account and nobody else, even by direct id', async () => {
    const own = await asAma((tx) => countIn(tx, sql`select count(*) as n from "user"`));
    expect(own).toBe(1);

    const other = await asAma((tx) =>
      countIn(tx, sql`select count(*) as n from "user" where id = ${BEN}`),
    );
    expect(other).toBe(0);
  });

  /**
   * The point of ADR 0054, in one assertion. The application cannot read Ben's row and can still
   * find him by phone, because the function runs as `convert_auth` and returns one row rather than a
   * relation the caller keeps.
   */
  it('finds an account it cannot read, through the lookup function', async () => {
    const found = await asAma((tx) =>
      countIn(tx, sql`select count(*) as n from public.auth_find_user_by_phone(${BEN_PHONE})`),
    );
    expect(found).toBe(1);

    const missing = await asAma((tx) =>
      countIn(
        tx,
        sql`select count(*) as n from public.auth_find_user_by_email('nobody@example.test')`,
      ),
    );
    expect(missing).toBe(0);
  });

  /**
   * The `nullif` in the canonical policy, from the outside. Without it an empty context raises
   * `invalid input syntax for uuid` and a forgotten context becomes a 500 rather than an empty list.
   */
  it('sees nothing at all with no context set, and does not error', async () => {
    const result = await app.execute<{ n: string }>(sql`select count(*) as n from "user"`);
    expect(Number(result.rows[0]?.n)).toBe(0);

    const workspaces = await app.execute<{ n: string }>(sql`select count(*) as n from workspace`);
    expect(Number(workspaces.rows[0]?.n)).toBe(0);
  });

  /**
   * The escape that every catalogue subcheck would miss. `convert_auth` does not bypass row-level
   * security, so the reachability assertion that hunts bypassing roles says nothing about it. It
   * holds the permissive policy on `user`, so reaching it would hand over every account.
   */
  it('cannot become the role that owns the lookup functions', async () => {
    // Asserted on the SQLSTATE rather than the message. Drizzle wraps the driver error, so the
    // outer message is its own text and a string match here would pass on any failure at all,
    // including a typo in the statement. 42501 is insufficient_privilege specifically.
    let code: string | undefined;
    try {
      await app.execute(sql`set role convert_auth`);
    } catch (error) {
      code = (error as { cause?: { code?: string } }).cause?.code;
    }
    expect(code).toBe('42501');
  });

  /** The control that makes every empty result above mean something. */
  it('the owner sees both tenants and both accounts, so the fixtures are really there', async () => {
    const users = await owner.execute<{ n: string }>(
      sql`select count(*) as n from "user" where id in (${AMA}, ${BEN})`,
    );
    expect(Number(users.rows[0]?.n)).toBe(2);

    const workspaces = await owner.execute<{ n: string }>(
      sql`select count(*) as n from workspace where id in (${TENANT_A}, ${TENANT_B})`,
    );
    expect(Number(workspaces.rows[0]?.n)).toBe(2);
  });
});
