import 'server-only';

/**
 * The only way this app talks to the API.
 *
 * `server-only` makes importing it from a client component a build error, which is the
 * mechanical half of ADR 0013: the browser never holds an API credential, so an XSS on a
 * rep's phone cannot walk away with one, and revocation stays reliable.
 *
 * The other half is a review rule - fetch in server components and route handlers, never
 * in client effects - because on the split topology a client waterfall costs a round trip
 * per hop on a 3G connection (architecture.md section 18).
 */
import type { ErrorEnvelope } from '@convert/contracts';

const baseUrl = process.env.API_PUBLIC_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly envelope: ErrorEnvelope,
  ) {
    super(envelope.message);
    this.name = 'ApiError';
  }
}

export const apiFetch = async <T>(
  path: string,
  init: RequestInit & { readonly idempotencyKey?: string } = {},
): Promise<T> => {
  const { idempotencyKey, ...rest } = init;

  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      // Service credential, read on the server only.
      ...(process.env.API_SERVICE_TOKEN
        ? { authorization: `Bearer ${process.env.API_SERVICE_TOKEN}` }
        : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      ...rest.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const envelope = (await response.json().catch(() => ({
      code: 'internal_error' as const,
      message: response.statusText,
    }))) as ErrorEnvelope;
    throw new ApiError(response.status, envelope);
  }

  return (await response.json()) as T;
};
