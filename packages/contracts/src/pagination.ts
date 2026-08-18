import type { Ulid } from './ids';

/**
 * Cursor pagination, not offset (ADR 0015). Offset pages skip and duplicate rows under
 * concurrent writes, and this product writes constantly while people are reading.
 *
 * The cursor is opaque on purpose: its encoding is free to change.
 */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const encodeCursor = (id: Ulid): string =>
  Buffer.from(id, 'utf8').toString('base64url');

export const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

export const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
};
