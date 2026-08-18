import type { Clock } from './clock';

/**
 * Storage is UTC; display and all due/overdue arithmetic happen in Africa/Accra
 * (invariant I11). Accra is UTC+0 with no daylight saving, which makes this simple
 * today - and the constant exists so it stays correct if that ever stops being true.
 */
export const DISPLAY_TIME_ZONE = 'Africa/Accra' as const;

export const isOverdue = (dueAt: Date, clock: Clock): boolean => clock.now() > dueAt;

/** Start of the day containing `instant`, in Accra local time, as a UTC instant. */
export const startOfLocalDay = (instant: Date): Date => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return new Date(`${parts}T00:00:00.000Z`);
};

export const formatLocal = (instant: Date): string =>
  new Intl.DateTimeFormat('en-GH', {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(instant);
