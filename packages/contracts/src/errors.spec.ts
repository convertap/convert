import {
  CATALOGUE,
  ERROR_CODES,
  isErrorEnvelope,
  isOurFault,
  isRetryable,
  userMessageFor,
} from './errors';

describe('error catalogue', () => {
  it('defines every code exactly once', () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('gives every code a user-facing sentence, not a placeholder', () => {
    for (const code of ERROR_CODES) {
      const message = userMessageFor(code);
      expect(message.length).toBeGreaterThan(20);
      expect(message).toMatch(/[.!]$/);
      // A user-facing message must not leak internals.
      expect(message.toLowerCase()).not.toMatch(/null|undefined|exception|stack|sql/);
    }
  });

  it('uses a sensible HTTP status for every code', () => {
    for (const code of ERROR_CODES) {
      expect(CATALOGUE[code].status).toBeGreaterThanOrEqual(400);
      expect(CATALOGUE[code].status).toBeLessThan(600);
    }
  });

  it('marks only genuinely transient failures retryable', () => {
    expect(isRetryable('rate_limited')).toBe(true);
    expect(isRetryable('provider_unavailable')).toBe(true);
    expect(isRetryable('offline')).toBe(true);
    expect(isRetryable('validation_failed')).toBe(false);
    expect(isRetryable('consent_missing')).toBe(false);
    // A rejected message is not retryable: sending it again costs money and fails again.
    expect(isRetryable('provider_rejected')).toBe(false);
  });

  it('blames us only for internal failures', () => {
    expect(isOurFault('internal_error')).toBe(true);
    expect(ERROR_CODES.filter(isOurFault)).toEqual(['internal_error']);
  });

  it('recognises an envelope off the wire and rejects anything else', () => {
    expect(isErrorEnvelope({ code: 'not_found', message: 'gone' })).toBe(true);
    expect(isErrorEnvelope({ code: 'made_up', message: 'x' })).toBe(false);
    expect(isErrorEnvelope({ message: 'x' })).toBe(false);
    expect(isErrorEnvelope(null)).toBe(false);
    expect(isErrorEnvelope('nope')).toBe(false);
  });
});
