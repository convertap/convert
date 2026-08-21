// Imported rather than taken from globals: the packages exclude `*.spec.ts` from
// typecheck, and a regression tripwire that is never type-checked is a weaker
// tripwire. This way the spec both runs and compiles.
import { describe, expect, test } from 'vitest';

import { applicationDatabaseUrl } from './infra.module';

/**
 * ADR 0042 gives the owner DDL and gives `convert_app` rows, because row-level security
 * does not apply to a table's owner. A runtime connecting as the owner therefore turns
 * every tenant policy into a comment while G7 keeps passing, which is the failure the ADR
 * exists to remove.
 *
 * Both runtimes read `DATABASE_URL` until 21 August 2026, so this is a regression test for
 * a real defect rather than a hypothetical one.
 */
describe('applicationDatabaseUrl (worker)', () => {
  test('returns DATABASE_URL_APP when it is set', () => {
    const url = 'postgres://convert_app:secret@localhost:5432/convert';
    expect(applicationDatabaseUrl({ DATABASE_URL_APP: url })).toBe(url);
  });

  test('refuses to start when DATABASE_URL_APP is missing', () => {
    expect(() => applicationDatabaseUrl({})).toThrow(/DATABASE_URL_APP is not set/);
  });

  test('does not fall back to the owner when only DATABASE_URL is set', () => {
    // The important case. A fallback here would be silent: the process boots, every query
    // succeeds, and tenant isolation is gone.
    expect(() =>
      applicationDatabaseUrl({ DATABASE_URL: 'postgres://postgres:secret@localhost:5432/convert' }),
    ).toThrow(/never as the owner/);
  });

  test('prefers the application role even when both are set', () => {
    const app = 'postgres://convert_app:secret@localhost:5432/convert';
    expect(
      applicationDatabaseUrl({
        DATABASE_URL_APP: app,
        DATABASE_URL: 'postgres://postgres:secret@localhost:5432/convert',
      }),
    ).toBe(app);
  });
});
