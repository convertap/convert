/**
 * One record for both directions, with a forward-only status machine (ADR 0006).
 *
 * Delivery callbacks arrive out of order and more than once, so `advanceStatus` never
 * regresses. A late 'sent' callback after 'read' is dropped, not applied.
 */
export type MessageDirection = 'outbound' | 'inbound';
export type MessageChannel = 'whatsapp' | 'sms';
export type MessageKind = 'template' | 'free_form';

export const MESSAGE_STATUS_ORDER = ['queued', 'sent', 'delivered', 'read'] as const;
export type DeliverableStatus = (typeof MESSAGE_STATUS_ORDER)[number];
export type MessageStatus = DeliverableStatus | 'failed';

export const isTerminal = (status: MessageStatus): boolean =>
  status === 'failed' || status === 'read';

const rank = (status: DeliverableStatus): number => MESSAGE_STATUS_ORDER.indexOf(status);

export const advanceStatus = (current: MessageStatus, incoming: MessageStatus): MessageStatus => {
  if (current === 'failed') return 'failed';
  if (incoming === 'failed') return 'failed';
  return rank(incoming) > rank(current) ? incoming : current;
};

/** Template category, because the provider's rules differ per category (checklist E4). */
export type TemplateCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export const requiresConsent = (category: TemplateCategory): boolean => category === 'marketing';
