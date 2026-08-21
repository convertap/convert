import { asUlid, isUlid, newUlid, ulidTime, ulidToUuid, uuidToUlid } from './ids';

describe('ids', () => {
  test('a fresh ULID is 26 characters and passes its own validator', () => {
    const id = newUlid();
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
  });

  test('a ULID never contains I, L, O or U, so it survives being read aloud', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(newUlid()).not.toMatch(/[ILOU]/);
    }
  });

  test('ids sort into creation order, which is the whole reason for using them', () => {
    // Forced apart in time, because two ids minted in the same millisecond sort
    // arbitrarily by design.
    const first = newUlid();
    const laterTimestamp = new Date(Date.now() + 1000);
    vi.setSystemTime(laterTimestamp);
    const second = newUlid();
    vi.useRealTimers();

    expect([second, first].sort()).toEqual([first, second]);
  });

  test('the timestamp survives the round trip to the millisecond', () => {
    const when = new Date('2026-08-21T10:30:00.123Z');
    vi.setSystemTime(when);
    const id = newUlid();
    vi.useRealTimers();
    expect(ulidTime(id).getTime()).toBe(when.getTime());
  });

  test('a ULID round-trips through its uuid storage form unchanged', () => {
    for (let i = 0; i < 500; i += 1) {
      const id = newUlid();
      expect(uuidToUlid(ulidToUuid(id))).toBe(id);
    }
  });

  test('the storage form is a well-shaped uuid', () => {
    expect(ulidToUuid(newUlid())).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('uuid ordering matches ULID ordering, so the database index sorts the same way', () => {
    const first = newUlid();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const second = newUlid();
    vi.useRealTimers();

    const asUuids = [ulidToUuid(second), ulidToUuid(first)].sort();
    expect(asUuids).toEqual([ulidToUuid(first), ulidToUuid(second)]);
  });

  test('the boundary values survive: all zeroes and all ones', () => {
    const min = asUlid('00000000000000000000000000');
    const max = asUlid('7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
    expect(uuidToUlid(ulidToUuid(min))).toBe(min);
    expect(uuidToUlid(ulidToUuid(max))).toBe(max);
    expect(ulidToUuid(min)).toBe('00000000-0000-0000-0000-000000000000');
    expect(ulidToUuid(max)).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
  });

  test('rejects things that are not ULIDs', () => {
    expect(isUlid('too-short')).toBe(false);
    // I, L, O and U are not in the alphabet.
    expect(isUlid('0IIIIIIIIIIIIIIIIIIIIIIIII')).toBe(false);
    // 26 valid characters but the leading one carries more than 3 bits.
    expect(isUlid('8ZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
    expect(() => asUlid('nope')).toThrow(/not a ULID/);
  });

  test('rejects things that are not uuids', () => {
    expect(() => uuidToUlid('nope')).toThrow(/not a uuid/);
  });
});
