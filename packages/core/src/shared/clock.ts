/**
 * Time is injected, never read from the system clock inside the domain (invariant I11).
 *
 * A rule that calls Date.now() directly cannot be tested at the Accra midnight boundary,
 * and "is this follow-up overdue" is the product's central promise.
 */
export interface Clock {
  now(): Date;
}

export const fixedClock = (instant: Date): Clock => ({ now: () => new Date(instant) });
