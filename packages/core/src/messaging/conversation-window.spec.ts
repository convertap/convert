import { fixedClock } from '../shared/clock';
import { msUntilWindowCloses, windowClosesAt, windowState } from './conversation-window';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-08-18T12:00:00.000Z');
const clock = fixedClock(now);

describe('conversation window', () => {
  it('is open within 24 hours of the last inbound message', () => {
    expect(windowState(new Date(now.getTime() - 2 * HOUR), clock)).toBe('open');
    expect(windowState(new Date(now.getTime() - 23 * HOUR), clock)).toBe('open');
  });

  it('is closed at and past 24 hours', () => {
    expect(windowState(new Date(now.getTime() - 24 * HOUR), clock)).toBe('closed');
    expect(windowState(new Date(now.getTime() - 25 * HOUR), clock)).toBe('closed');
  });

  it('is closed when the customer has never messaged', () => {
    expect(windowState(null, clock)).toBe('closed');
  });

  it('reports when the window closes so the UI can warn before it does', () => {
    const lastInbound = new Date(now.getTime() - 20 * HOUR);
    expect(windowClosesAt(lastInbound).toISOString()).toBe('2026-08-18T16:00:00.000Z');
    expect(msUntilWindowCloses(lastInbound, clock)).toBe(4 * HOUR);
  });

  it('never reports negative remaining time', () => {
    expect(msUntilWindowCloses(new Date(now.getTime() - 48 * HOUR), clock)).toBe(0);
  });
});
