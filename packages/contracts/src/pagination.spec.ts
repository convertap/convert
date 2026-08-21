import { asUlid } from './ids';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  pageRequestSchema,
} from './pagination';

const CURSOR = asUlid('01JBQZ3K7X8V9WQ0R1S2T3V4W5');

describe('pagination contracts', () => {
  it('uses a URL-safe ULID directly as the opaque cursor', () => {
    expect(encodeCursor(CURSOR)).toBe(CURSOR);
    expect(decodeCursor(CURSOR)).toBe(CURSOR);
  });

  it('rejects a malformed cursor at the boundary', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(/ULID/);
    expect(pageRequestSchema.safeParse({ cursor: 'not-a-cursor' }).success).toBe(false);
  });

  it('coerces query-string limits and applies the documented bounds', () => {
    expect(pageRequestSchema.parse({}).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(pageRequestSchema.parse({ limit: String(MAX_PAGE_SIZE) }).limit).toBe(MAX_PAGE_SIZE);
    expect(pageRequestSchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });
});
