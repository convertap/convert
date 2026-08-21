import pino from 'pino';

/**
 * Structured logs carrying request id, workspace id, and principal kind (architecture.md
 * section 15). Message bodies and full phone numbers are never logged - they are third
 * party PII under Act 843, and a log aggregator is not a lawful place to keep them.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['*.body', '*.phone', '*.phoneE164', '*.accessToken', 'req.headers.authorization'],
    censor: '[redacted]',
  },
});

/** Last four digits only, for support conversations. */
export const maskPhone = (e164: string): string => `***${e164.slice(-4)}`;
