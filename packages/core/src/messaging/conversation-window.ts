import type { Clock } from '../shared/clock';

/**
 * WhatsApp permits free-form replies only within 24 hours of the customer's last inbound
 * message (ADR 0007, invariant I10).
 *
 * The state is DERIVED, never stored: a stored flag would be wrong the moment the clock
 * passed it. The service layer refuses a free-form send into a closed window before the
 * provider is called, and the UI shows the state - an external rule that changes what the
 * user may do must be visible, not hidden.
 */
export const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

export type WindowState = 'open' | 'closed';

export const windowState = (lastInboundAt: Date | null, clock: Clock): WindowState => {
  if (lastInboundAt === null) return 'closed';
  return clock.now().getTime() - lastInboundAt.getTime() < WINDOW_DURATION_MS ? 'open' : 'closed';
};

export const windowClosesAt = (lastInboundAt: Date): Date =>
  new Date(lastInboundAt.getTime() + WINDOW_DURATION_MS);

export const msUntilWindowCloses = (lastInboundAt: Date, clock: Clock): number =>
  Math.max(0, windowClosesAt(lastInboundAt).getTime() - clock.now().getTime());
