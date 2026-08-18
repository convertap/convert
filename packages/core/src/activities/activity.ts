/**
 * The activity log is the product, not plumbing: it is the direct answer to the pitch's
 * third problem, that the business history leaves with the rep. Insert-only (I6).
 *
 * Distinct from audit_event, which records logins, role changes, and exports for an
 * administrator. Conflating them gives reps a timeline they cannot read and compliance an
 * audit trail it cannot use (ADR 0009).
 */
export const ACTIVITY_TYPES = [
  'call',
  'whatsapp',
  'sms',
  'meeting',
  'note',
  'follow_up',
  'status_change',
  'stage_change',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ActivitySubject =
  | { readonly kind: 'contact'; readonly id: string }
  | { readonly kind: 'lead'; readonly id: string }
  | { readonly kind: 'deal'; readonly id: string };

export interface NewActivity {
  readonly type: ActivityType;
  readonly subject: ActivitySubject;
  /** From principalLabel(): who acted, including the worker. */
  readonly actor: string;
  readonly occurredAt: Date;
  readonly note?: string;
}
