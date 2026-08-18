import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Phone numbers are the product's identity key: WhatsApp identity IS the phone number,
 * so dedupe, inbound message matching, and campaign targeting all resolve through this
 * one function (invariant I2, checklist R1).
 *
 * It is used on writes AND on search. A rep typing 024... must find a contact stored as
 * +23324... - that parity is the single most likely search bug in this product, which is
 * why there is exactly one normaliser and no second implementation.
 */
export const DEFAULT_REGION = 'GH' as const;

export type E164 = string & { readonly __brand: 'E164' };

export interface PhoneParseResult {
  readonly ok: boolean;
  readonly e164?: E164;
  readonly reason?: 'empty' | 'unparseable' | 'invalid';
}

export const parsePhone = (input: string, region: string = DEFAULT_REGION): PhoneParseResult => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };

  const parsed = parsePhoneNumberFromString(trimmed, region as 'GH');
  if (!parsed) return { ok: false, reason: 'unparseable' };
  if (!parsed.isValid()) return { ok: false, reason: 'invalid' };

  return { ok: true, e164: parsed.number as E164 };
};

/** Throwing variant, for paths that have already validated input. */
export const toE164 = (input: string, region: string = DEFAULT_REGION): E164 => {
  const result = parsePhone(input, region);
  if (!result.ok || !result.e164) {
    throw new Error(`cannot normalise phone number: ${result.reason}`);
  }
  return result.e164;
};

/**
 * Search normalisation. Returns null when the fragment cannot be normalised, so callers
 * fall back to a substring match rather than silently finding nothing.
 */
export const toSearchForm = (input: string, region: string = DEFAULT_REGION): string | null => {
  const result = parsePhone(input, region);
  return result.ok && result.e164 ? result.e164 : null;
};
