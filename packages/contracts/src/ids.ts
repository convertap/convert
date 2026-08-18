/**
 * External identifiers are ULIDs (ADR 0004): opaque, lexicographically sortable, and
 * safe to expose. Internal integer keys never leave the process.
 *
 * Branded so a raw string cannot be passed where an id is expected.
 */
export type Ulid = string & { readonly __brand: 'Ulid' };

const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const isUlid = (value: string): value is Ulid => ULID_RE.test(value);

export const asUlid = (value: string): Ulid => {
  if (!isUlid(value)) {
    throw new Error(`not a ULID: ${value}`);
  }
  return value;
};
