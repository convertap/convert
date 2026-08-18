/**
 * Lead status and Deal stage are two separate state machines. The pitch deck conflated
 * them; mvp-scope.md separates them (see product-spec.md section 13, item 1).
 *
 * Open decisions R2 and R8 govern which stage a converted lead's deal enters and what
 * may create a deal. Those are product calls, so this file models only what is already
 * agreed: the status values, their terminality, and the fields each terminal state needs.
 */
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  'whatsapp',
  'facebook',
  'instagram',
  'website',
  'referral',
  'walk_in',
  'phone',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const isTerminalLeadStatus = (status: LeadStatus): boolean =>
  status === 'converted' || status === 'lost';

/** Invariant I4: converted needs a deal, lost needs a reason. */
export interface LeadTerminalRequirements {
  readonly dealId?: string;
  readonly lostReason?: string;
}

export const canEnterStatus = (
  status: LeadStatus,
  requirements: LeadTerminalRequirements,
): boolean => {
  if (status === 'converted') return Boolean(requirements.dealId);
  if (status === 'lost') return Boolean(requirements.lostReason?.trim());
  return true;
};
