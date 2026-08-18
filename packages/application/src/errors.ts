import type { ErrorCode } from '@convert/contracts';

/**
 * Typed failures. The API maps these to HTTP once, in an exception filter, so no layer
 * below the interface knows what a status code is.
 */
export class UseCaseError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UseCaseError';
  }
}

export const forbidden = (what: string) => new UseCaseError('forbidden', `not permitted: ${what}`);
export const notFound = (what: string) => new UseCaseError('not_found', `${what} not found`);
