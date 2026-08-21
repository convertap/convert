import { z } from 'zod';
import { asUlid, ulidSchema, type Ulid } from './ids';

/**
 * Cursor pagination, not offset (ADR 0015). Offset pages skip and duplicate rows under
 * concurrent writes, and this product writes constantly while people are reading.
 *
 * The cursor is opaque **by contract, not by obfuscation** (ADR 0045): it is the ULID of the last
 * row, documented as "do not parse". Note what that costs — `pageRequestSchema` validates it as a
 * ULID and the OpenAPI document publishes that shape, so the encoding is no longer free to change
 * without a breaking API change. That is the deliberate trade: a client that cannot parse a
 * base64 blob also cannot be told it sent a malformed cursor.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const pageRequestSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    cursor: ulidSchema.optional().meta({ description: 'Opaque; clients must not parse it.' }),
  })
  .meta({ id: 'PageRequest' });

export type PageRequest = z.infer<typeof pageRequestSchema>;

export const cursorPageOf = <T extends z.ZodType>(itemSchema: T, name: string) =>
  z
    .object({
      items: z.array(itemSchema),
      nextCursor: ulidSchema.nullable(),
    })
    .meta({ id: name });

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: Ulid | null;
}

export const encodeCursor = (id: Ulid): string => id;

export const decodeCursor = (cursor: string): Ulid => asUlid(cursor);

export const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
};
