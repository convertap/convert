/**
 * Errors are a first-class part of this product, not an afterthought at the end of a
 * happy path.
 *
 * The reason is specific to Convert: a rep is standing in front of a customer, on a phone,
 * on a network that drops. "Something went wrong" costs a sale, because the rep cannot
 * tell whether the message was sent, whether to retry, or whether to stop trying. So every
 * failure in this system carries four things, defined together in one place:
 *
 *   1. a STABLE CODE, which consumers branch on and which never changes silently
 *   2. an HTTP STATUS, so the transport mapping is declared once rather than per endpoint
 *   3. WHAT THE PERSON SHOULD DO next, written here and not invented per screen
 *   4. whether RETRYING could plausibly help, so clients and jobs do not guess
 *
 * Adding a failure mode means adding an entry to CATALOGUE below. That is deliberate
 * friction: it forces someone to write the user-facing sentence at the moment they invent
 * the failure, which is the only time they actually know what it means.
 */

export const ERROR_CODES = [
  'validation_failed',
  'unauthenticated',
  'session_expired',
  'forbidden',
  'not_found',
  'conflict',
  'duplicate_contact',
  'consent_missing',
  'conversation_window_closed',
  'template_not_approved',
  'entitlement_exceeded',
  'rate_limited',
  'provider_unavailable',
  'provider_rejected',
  'offline',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface ErrorEnvelope {
  readonly code: ErrorCode;
  /** Technical summary. Safe to log, not necessarily what a user should read. */
  readonly message: string;
  readonly details?: readonly FieldError[];
  /** Correlates a support conversation with server logs and traces. Always present in API responses. */
  readonly requestId?: string;
}

export interface ErrorDefinition {
  readonly status: number;
  /** Can a retry of the identical request plausibly succeed? */
  readonly retryable: boolean;
  /** Shown to the person. Says what happened and what to do, in that order, plainly. */
  readonly userMessage: string;
  /** Whether this represents a defect on our side, and so should page someone. */
  readonly ourFault: boolean;
}

export const CATALOGUE: Readonly<Record<ErrorCode, ErrorDefinition>> = {
  validation_failed: {
    status: 400,
    retryable: false,
    userMessage: 'Some details need fixing. Check the highlighted fields and try again.',
    ourFault: false,
  },
  unauthenticated: {
    status: 401,
    retryable: false,
    userMessage: 'Please sign in to continue.',
    ourFault: false,
  },
  session_expired: {
    status: 401,
    retryable: false,
    userMessage: 'Your session timed out. Sign in again — your work was not lost.',
    ourFault: false,
  },
  forbidden: {
    status: 403,
    retryable: false,
    userMessage: 'You do not have permission for this. Ask an admin in your business to do it.',
    ourFault: false,
  },
  not_found: {
    status: 404,
    retryable: false,
    userMessage: 'That record no longer exists. It may have been deleted or reassigned.',
    ourFault: false,
  },
  conflict: {
    status: 409,
    retryable: false,
    userMessage: 'Someone else changed this while you were working. Reload to see the latest.',
    ourFault: false,
  },
  duplicate_contact: {
    status: 409,
    retryable: false,
    userMessage: 'This phone number already belongs to a contact. Open it or merge the two.',
    ourFault: false,
  },
  consent_missing: {
    status: 409,
    retryable: false,
    userMessage:
      'This customer has not agreed to marketing messages, so this one cannot be sent. You can still reply to a message they send you.',
    ourFault: false,
  },
  conversation_window_closed: {
    status: 409,
    retryable: false,
    userMessage:
      'More than 24 hours have passed since this customer last messaged, so WhatsApp only allows an approved template now. Pick a template to continue.',
    ourFault: false,
  },
  template_not_approved: {
    status: 409,
    retryable: false,
    userMessage: 'This message template is still awaiting approval. Choose another one for now.',
    ourFault: false,
  },
  entitlement_exceeded: {
    status: 402,
    retryable: false,
    userMessage: 'Your plan limit for this has been reached. Upgrade or wait for the monthly reset.',
    ourFault: false,
  },
  rate_limited: {
    status: 429,
    retryable: true,
    userMessage: 'Too many requests at once. Wait a moment and try again.',
    ourFault: false,
  },
  provider_unavailable: {
    status: 503,
    retryable: true,
    userMessage:
      'The messaging service is not responding. Your message is queued and will be sent automatically.',
    ourFault: false,
  },
  provider_rejected: {
    status: 502,
    retryable: false,
    userMessage:
      'The messaging service refused this message. Check the number and the template, then try again.',
    ourFault: false,
  },
  offline: {
    status: 503,
    retryable: true,
    userMessage: 'You appear to be offline. This will be sent when your connection returns.',
    ourFault: false,
  },
  internal_error: {
    status: 500,
    retryable: true,
    userMessage:
      'Something failed on our side, and it has been reported. Try again shortly — nothing you entered was lost.',
    ourFault: true,
  },
};

export const errorEnvelope = (
  code: ErrorCode,
  message: string,
  details?: readonly FieldError[],
): ErrorEnvelope => (details ? { code, message, details } : { code, message });

export const httpStatusFor = (code: ErrorCode): number => CATALOGUE[code].status;
export const isRetryable = (code: ErrorCode): boolean => CATALOGUE[code].retryable;
export const isOurFault = (code: ErrorCode): boolean => CATALOGUE[code].ourFault;

/**
 * The sentence shown to the person. Never build user-facing error text from `message`:
 * that is a technical string, and it leaks internals into the interface.
 */
export const userMessageFor = (code: ErrorCode): string => CATALOGUE[code].userMessage;

/** Type guard for a value that came back over the wire. */
export const isErrorEnvelope = (value: unknown): value is ErrorEnvelope => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { code?: unknown; message?: unknown };
  return (
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(candidate.code)
  );
};
