/**
 * Identifiers are ULIDs (ADR 0043, superseding ADR 0004): opaque, lexicographically
 * sortable, and safe to expose. A ULID is the *primary* key — there is no second,
 * internal identifier, so nothing can leak the wrong one.
 *
 * A ULID is 128 bits: 48 bits of millisecond timestamp, then 80 bits of randomness,
 * rendered as 26 characters of Crockford base32 (no I, L, O or U, so it cannot be
 * misread aloud). The timestamp coming first is the whole point — ids sort into
 * creation order, and new rows land at the end of an index rather than scattered
 * through it the way a random uuid does.
 *
 * Implemented here rather than taken from a package because `.boundaries.json` says this
 * layer "depends on nothing", and it is the one package both web and api may import.
 *
 * Branded so a raw string cannot be passed where an id is expected.
 */
export type Ulid = string & { readonly __brand: 'Ulid' };

/** Crockford base32. I, L, O and U are excluded to survive being read out loud. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const isUlid = (value: string): value is Ulid => ULID_RE.test(value);

export const asUlid = (value: string): Ulid => {
  if (!isUlid(value)) {
    throw new Error(`not a ULID: ${value}`);
  }
  return value;
};

const encode = (value: bigint): Ulid => {
  let out = '';
  let remaining = value;
  // 26 characters of 5 bits each is 130 bits, so the leading character carries only the
  // top 3 bits. That is why a valid ULID always starts 0-7.
  for (let i = 0; i < 26; i += 1) {
    out = ALPHABET[Number(remaining & 31n)] + out;
    remaining >>= 5n;
  }
  return out as Ulid;
};

const decode = (value: Ulid): bigint => {
  let out = 0n;
  for (const char of value) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`not a ULID: ${value}`);
    out = out * 32n + BigInt(index);
  }
  return out;
};

/**
 * A fresh ULID. Generated in the application, never by the database (ADR 0043): the
 * outbox pattern needs the id before the insert, in the same transaction.
 *
 * Two ULIDs minted in the same millisecond sort arbitrarily relative to each other. That
 * is acceptable — sort order is by creation time to the millisecond, not a total order,
 * and anything needing a strict sequence should not be using an identifier for it.
 */
export const newUlid = (): Ulid => {
  const timestamp = BigInt(Date.now()) & 0xffffffffffffn; // 48 bits
  const bytes = new Uint8Array(10); // 80 bits
  globalThis.crypto.getRandomValues(bytes);
  let random = 0n;
  for (const byte of bytes) random = (random << 8n) | BigInt(byte);
  return encode((timestamp << 80n) | random);
};

/** The millisecond the ULID was minted. Useful in support, and in tests. */
export const ulidTime = (value: Ulid): Date => new Date(Number(decode(value) >> 80n));

/**
 * Storage form. The database column is `uuid`, because a ULID is exactly 128 bits and so
 * is a uuid: 16 fixed-width bytes, native indexing, and the same sort order, where text
 * would cost 26 bytes on every key and every foreign key.
 *
 * The cost is that psql shows the uuid rendering rather than the ULID a customer reads out
 * on a support call. These two functions are the bridge, and the API only ever emits the
 * ULID form.
 */
export const ulidToUuid = (value: Ulid): string => {
  const hex = decode(value).toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
};

export const uuidToUlid = (value: string): Ulid => {
  const hex = value.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`not a uuid: ${value}`);
  return encode(BigInt(`0x${hex}`));
};
